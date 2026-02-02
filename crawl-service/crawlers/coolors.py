"""
Coolors Palette Crawler - Scrapes trending color palettes using Playwright
Extracts hex codes from palette URLs and associates mood/style metadata
"""

import asyncio
import json
import logging
import os
import re
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Optional, Dict, Any
import random
from playwright.async_api import async_playwright, Page, Browser, TimeoutError as PlaywrightTimeout

logger = logging.getLogger(__name__)

# Cache file for storing crawled palettes
CACHE_DIR = Path(__file__).parent.parent / "data"
PALETTE_CACHE_FILE = CACHE_DIR / "coolors_palettes.json"
CACHE_MAX_AGE_HOURS = 24  # Refresh cache after 24 hours


class ColorPalette:
    """Represents a color palette with metadata"""

    def __init__(
        self,
        colors: List[str],
        name: Optional[str] = None,
        mood: Optional[str] = None,
        likes: int = 0,
        source_url: Optional[str] = None,
    ):
        self.colors = [c.upper() for c in colors]  # Normalize to uppercase
        self.name = name
        self.mood = mood
        self.likes = likes
        self.source_url = source_url

    def to_dict(self) -> dict:
        return {
            "colors": self.colors,
            "name": self.name,
            "mood": self.mood,
            "likes": self.likes,
            "source_url": self.source_url,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "ColorPalette":
        return cls(
            colors=data["colors"],
            name=data.get("name"),
            mood=data.get("mood"),
            likes=data.get("likes", 0),
            source_url=data.get("source_url"),
        )


# Mood detection based on color characteristics
def detect_palette_mood(colors: List[str]) -> str:
    """
    Analyze colors to detect the palette mood.
    Returns: professional, playful, calm, bold, warm, cool, neutral, dark, light
    """
    if not colors:
        return "neutral"

    # Convert hex to RGB for analysis
    def hex_to_rgb(hex_color: str) -> tuple:
        hex_color = hex_color.lstrip('#')
        return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))

    def get_hsv(r: int, g: int, b: int) -> tuple:
        r, g, b = r/255, g/255, b/255
        max_c = max(r, g, b)
        min_c = min(r, g, b)
        v = max_c
        s = 0 if max_c == 0 else (max_c - min_c) / max_c
        if max_c == min_c:
            h = 0
        elif max_c == r:
            h = 60 * ((g - b) / (max_c - min_c) % 6)
        elif max_c == g:
            h = 60 * ((b - r) / (max_c - min_c) + 2)
        else:
            h = 60 * ((r - g) / (max_c - min_c) + 4)
        return h, s, v

    try:
        rgbs = [hex_to_rgb(c) for c in colors]
        hsvs = [get_hsv(*rgb) for rgb in rgbs]

        avg_saturation = sum(hsv[1] for hsv in hsvs) / len(hsvs)
        avg_value = sum(hsv[2] for hsv in hsvs) / len(hsvs)
        hues = [hsv[0] for hsv in hsvs]

        # Analyze characteristics
        is_dark = avg_value < 0.4
        is_light = avg_value > 0.8
        is_muted = avg_saturation < 0.3
        is_vibrant = avg_saturation > 0.7

        # Check for warm colors (red, orange, yellow: 0-60, 300-360)
        warm_count = sum(1 for h in hues if h < 60 or h > 300)
        # Check for cool colors (blue, green, purple: 120-270)
        cool_count = sum(1 for h in hues if 120 < h < 270)

        is_warm = warm_count > len(hues) / 2
        is_cool = cool_count > len(hues) / 2

        # Determine mood
        if is_dark and is_muted:
            return "professional"
        elif is_dark and is_vibrant:
            return "bold"
        elif is_light and is_muted:
            return "calm"
        elif is_light and is_vibrant:
            return "playful"
        elif is_warm and is_vibrant:
            return "warm"
        elif is_cool and is_muted:
            return "cool"
        elif is_dark:
            return "dark"
        elif is_light:
            return "light"
        else:
            return "neutral"
    except (ValueError, ZeroDivisionError, IndexError, TypeError):
        return "neutral"


class CoolorsCrawler:
    """Crawl trending color palettes from Coolors.co using browser automation"""

    def __init__(self, headless: bool = True):
        self.headless = headless
        self.browser: Optional[Browser] = None
        self.playwright = None

    async def __aenter__(self):
        self.playwright = await async_playwright().start()
        self.browser = await self.playwright.chromium.launch(
            headless=self.headless,
            args=[
                '--disable-blink-features=AutomationControlled',
                '--disable-dev-shm-usage',
                '--no-sandbox',
            ]
        )
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.browser:
            await self.browser.close()
        if self.playwright:
            await self.playwright.stop()

    async def _create_page(self) -> Page:
        """Create a new page with anti-detection measures"""
        context = await self.browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            locale='en-US',
        )
        page = await context.new_page()

        await page.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
            Object.defineProperty(navigator, 'plugins', {get: () => [1, 2, 3, 4, 5]});
        """)

        return page

    async def crawl_trending_palettes(
        self,
        max_palettes: int = 50,
        scroll_times: int = 5,
    ) -> List[ColorPalette]:
        """
        Crawl trending palettes from Coolors.

        Args:
            max_palettes: Maximum number of palettes to fetch
            scroll_times: Number of times to scroll for more palettes

        Returns:
            List of ColorPalette objects
        """
        palettes = []
        page = await self._create_page()

        try:
            logger.info("Navigating to Coolors trending palettes...")
            # Use 'load' instead of 'networkidle' - networkidle hangs on sites with
            # continuous analytics/tracking activity. 15s timeout to fail fast.
            await page.goto(
                "https://coolors.co/palettes/trending",
                wait_until='load',
                timeout=15000
            )

            # Wait for palette elements to appear (more reliable than fixed sleep)
            try:
                await page.wait_for_selector('a[href*="/palette/"]', timeout=5000)
            except PlaywrightTimeout:
                logger.warning("Palette selector not found, continuing anyway...")

            # Brief pause for any dynamic rendering
            await asyncio.sleep(1)

            # Extract palettes from initial load first
            palettes = await self._extract_palettes(page)
            existing_colors = {tuple(p.colors) for p in palettes}
            logger.info(f"Initial load: Found {len(palettes)} palettes")

            # Scroll to load more palettes (reduced scroll times for faster response)
            for i in range(min(scroll_times, 3)):  # Cap at 3 scrolls max
                if len(palettes) >= max_palettes:
                    break

                await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                await asyncio.sleep(1)  # Reduced from 2s

                # Extract palettes after each scroll
                new_palettes = await self._extract_palettes(page)

                # Deduplicate
                for p in new_palettes:
                    if tuple(p.colors) not in existing_colors:
                        palettes.append(p)
                        existing_colors.add(tuple(p.colors))

                logger.info(f"Scroll {i+1}: Found {len(palettes)} unique palettes")

            logger.info(f"Crawled {len(palettes)} trending palettes from Coolors")

        except PlaywrightTimeout:
            logger.error("Timeout loading Coolors page")
        except Exception as e:
            logger.exception(f"Error crawling Coolors: {e}")
        finally:
            await page.context.close()

        return palettes[:max_palettes]

    async def _extract_palettes(self, page: Page) -> List[ColorPalette]:
        """Extract palette data from the current page state"""
        palettes = []

        try:
            # Extract palette data using JavaScript
            palette_data = await page.evaluate("""
                () => {
                    const results = [];

                    // Method 1: Look for palette links with hex codes in URL
                    const links = document.querySelectorAll('a[href*="/palette/"]');
                    links.forEach(link => {
                        const href = link.getAttribute('href') || '';
                        const match = href.match(/\\/palette\\/([a-fA-F0-9-]+)/);
                        if (match) {
                            const colorString = match[1];
                            const colors = colorString.split('-').filter(c => c.length === 6);
                            if (colors.length >= 3) {
                                // Try to get likes count
                                let likes = 0;
                                const likesEl = link.querySelector('[class*="likes"], [class*="count"]');
                                if (likesEl) {
                                    const likesText = likesEl.textContent.replace(/[^0-9]/g, '');
                                    likes = parseInt(likesText) || 0;
                                }

                                results.push({
                                    colors: colors.map(c => '#' + c.toUpperCase()),
                                    url: 'https://coolors.co' + href,
                                    likes: likes,
                                });
                            }
                        }
                    });

                    // Method 2: Look for color swatches directly
                    const paletteContainers = document.querySelectorAll('[class*="palette"], [class*="Palette"]');
                    paletteContainers.forEach(container => {
                        const swatches = container.querySelectorAll('[style*="background"]');
                        const colors = [];
                        swatches.forEach(swatch => {
                            const style = swatch.getAttribute('style') || '';
                            const bgMatch = style.match(/background(?:-color)?:\\s*#([a-fA-F0-9]{6})/i);
                            if (bgMatch) {
                                colors.push('#' + bgMatch[1].toUpperCase());
                            }
                        });
                        if (colors.length >= 3 && colors.length <= 10) {
                            results.push({
                                colors: colors,
                                url: null,
                                likes: 0,
                            });
                        }
                    });

                    return results;
                }
            """)

            for data in palette_data:
                colors = data.get('colors', [])
                if len(colors) >= 3:
                    mood = detect_palette_mood([c.lstrip('#') for c in colors])
                    palette = ColorPalette(
                        colors=[c.lstrip('#') for c in colors],
                        mood=mood,
                        likes=data.get('likes', 0),
                        source_url=data.get('url'),
                    )
                    palettes.append(palette)

        except Exception as e:
            logger.error(f"Error extracting palettes: {e}")

        return palettes


def load_cached_palettes(check_expiry: bool = True) -> Optional[List[ColorPalette]]:
    """
    Load palettes from cache.

    Args:
        check_expiry: If True, return None if cache is expired (for triggering refresh).
                      If False, always return cached palettes (for accumulation).
    """
    if not PALETTE_CACHE_FILE.exists():
        return None

    try:
        with open(PALETTE_CACHE_FILE, 'r') as f:
            cache = json.load(f)

        cached_at = datetime.fromisoformat(cache.get('cached_at', '2000-01-01'))
        is_expired = datetime.now() - cached_at > timedelta(hours=CACHE_MAX_AGE_HOURS)

        if check_expiry and is_expired:
            logger.info("Palette cache expired, will refresh and accumulate")
            return None

        palettes = [ColorPalette.from_dict(p) for p in cache.get('palettes', [])]
        logger.info(f"Loaded {len(palettes)} palettes from cache (expired={is_expired})")
        return palettes

    except Exception as e:
        logger.error(f"Error loading palette cache: {e}")
        return None


def save_palettes_to_cache(new_palettes: List[ColorPalette], accumulate: bool = True):
    """
    Save palettes to cache file.

    Args:
        new_palettes: Newly scraped palettes
        accumulate: If True, merge with existing cache. If False, replace entirely.
    """
    try:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)

        all_palettes = new_palettes

        if accumulate:
            # Load existing palettes (ignore expiry for accumulation)
            existing = load_cached_palettes(check_expiry=False) or []

            # Deduplicate by color combination
            existing_colors = {tuple(p.colors) for p in existing}

            # Add new palettes that don't already exist
            added_count = 0
            for p in new_palettes:
                if tuple(p.colors) not in existing_colors:
                    existing.append(p)
                    existing_colors.add(tuple(p.colors))
                    added_count += 1

            all_palettes = existing
            logger.info(f"Accumulated {added_count} new palettes, total now: {len(all_palettes)}")

        cache = {
            'cached_at': datetime.now().isoformat(),
            'total_accumulated': len(all_palettes),
            'palettes': [p.to_dict() for p in all_palettes],
        }

        with open(PALETTE_CACHE_FILE, 'w') as f:
            json.dump(cache, f, indent=2)

        logger.info(f"Saved {len(all_palettes)} palettes to cache")

    except Exception as e:
        logger.error(f"Error saving palette cache: {e}")


async def get_trending_palettes(
    force_refresh: bool = False,
    max_palettes: int = 50,
    timeout_seconds: int = 8,
) -> List[ColorPalette]:
    """
    Get trending palettes, using accumulated cache.

    Palettes are accumulated over time - each scrape adds new unique palettes
    to the collection rather than replacing it.

    Args:
        force_refresh: Force fetching fresh data from Coolors (still accumulates)
        max_palettes: Maximum number of palettes to return
        timeout_seconds: Overall timeout for crawling (default 8s to fit within API timeouts)

    Returns:
        List of ColorPalette objects from accumulated collection
    """
    # Check if we should scrape (cache expired or force refresh)
    should_scrape = force_refresh
    cached = load_cached_palettes(check_expiry=True)

    if cached is None:
        # Cache expired or doesn't exist - need to scrape
        should_scrape = True
        # But still load existing palettes for accumulation
        cached = load_cached_palettes(check_expiry=False) or []

    if should_scrape:
        logger.info("Scraping fresh palettes from Coolors...")
        try:
            async with asyncio.timeout(timeout_seconds):
                async with CoolorsCrawler(headless=True) as crawler:
                    new_palettes = await crawler.crawl_trending_palettes(max_palettes=50)

            if new_palettes:
                # Accumulate new palettes with existing
                save_palettes_to_cache(new_palettes, accumulate=True)
                # Reload to get full accumulated set
                cached = load_cached_palettes(check_expiry=False) or new_palettes

        except asyncio.TimeoutError:
            logger.warning(f"Palette crawl timed out after {timeout_seconds}s")
            # Return cached if available
            if cached:
                logger.info(f"Returning {len(cached)} cached palettes after timeout")
        except Exception as e:
            logger.error(f"Error crawling palettes: {e}")
            # Return cached if available

    if cached:
        logger.info(f"Returning {min(len(cached), max_palettes)} palettes from collection of {len(cached)}")
        return cached[:max_palettes]

    return []


# =============================================================================
# Palette Selection for App Context
# =============================================================================

# App category to preferred mood mapping
CATEGORY_MOOD_MAP = {
    # Professional/Business
    'Finance': ['professional', 'dark', 'neutral'],
    'Business': ['professional', 'neutral', 'cool'],
    'Productivity': ['professional', 'calm', 'neutral'],

    # Health & Wellness
    'Health & Fitness': ['calm', 'cool', 'light'],
    'Medical': ['calm', 'professional', 'cool'],
    'Lifestyle': ['warm', 'calm', 'light'],

    # Creative/Entertainment
    'Entertainment': ['playful', 'bold', 'warm'],
    'Games': ['bold', 'playful', 'dark'],
    'Photo & Video': ['dark', 'professional', 'neutral'],
    'Music': ['bold', 'dark', 'cool'],

    # Social
    'Social Networking': ['playful', 'warm', 'light'],
    'Dating': ['warm', 'playful', 'bold'],

    # Education
    'Education': ['calm', 'light', 'cool'],
    'Books': ['calm', 'warm', 'neutral'],
    'Reference': ['professional', 'neutral', 'light'],

    # Utility
    'Utilities': ['professional', 'neutral', 'dark'],
    'Developer Tools': ['dark', 'professional', 'cool'],
    'Weather': ['cool', 'calm', 'light'],

    # Shopping/Food
    'Shopping': ['warm', 'playful', 'bold'],
    'Food & Drink': ['warm', 'playful', 'light'],

    # Travel
    'Travel': ['warm', 'bold', 'playful'],
    'Navigation': ['cool', 'professional', 'dark'],

    # Kids
    'Kids': ['playful', 'bold', 'light'],
}


def select_palette_for_app(
    palettes: List[ColorPalette],
    category: Optional[str] = None,
    mood_hint: Optional[str] = None,
    top_n: int = 12,
    randomize: bool = True,
) -> List[ColorPalette]:
    """
    Select palettes for an app with variety and randomization.

    Args:
        palettes: Available palettes to choose from
        category: App Store category (e.g., "Health & Fitness")
        mood_hint: Optional explicit mood preference
        top_n: Number of palettes to return (default 12 for variety)
        randomize: Whether to add randomization for variety

    Returns:
        List of palettes with good variety
    """
    if not palettes:
        return []

    # Determine preferred moods (but we'll include others too for variety)
    if mood_hint:
        preferred_moods = [mood_hint]
    elif category and category in CATEGORY_MOOD_MAP:
        preferred_moods = CATEGORY_MOOD_MAP[category]
    else:
        preferred_moods = ['professional', 'calm', 'neutral']

    # Group palettes by mood for balanced selection
    mood_groups: Dict[str, List[ColorPalette]] = {}
    for p in palettes:
        mood = p.mood or 'neutral'
        if mood not in mood_groups:
            mood_groups[mood] = []
        mood_groups[mood].append(p)

    # Shuffle within each group for variety
    if randomize:
        for mood in mood_groups:
            random.shuffle(mood_groups[mood])

    selected: List[ColorPalette] = []

    # First, pick from preferred moods (but not all from one mood)
    for mood in preferred_moods:
        if mood in mood_groups:
            # Take up to 3 from each preferred mood
            selected.extend(mood_groups[mood][:3])

    # Then add variety from other moods
    other_moods = [m for m in mood_groups.keys() if m not in preferred_moods]
    if randomize:
        random.shuffle(other_moods)

    for mood in other_moods:
        if len(selected) >= top_n:
            break
        # Take 1-2 from each other mood for variety
        selected.extend(mood_groups[mood][:2])

    # Final shuffle to mix moods together (not grouped)
    if randomize:
        random.shuffle(selected)

    return selected[:top_n]


def format_palettes_for_prompt(palettes: List[ColorPalette], max_palettes: int = 5) -> str:
    """
    Format palettes for inclusion in a prompt.

    Returns markdown-formatted palette options.
    """
    if not palettes:
        return ""

    lines = ["## Curated Color Palettes", ""]
    lines.append("Select ONE palette below or derive colors inspired by these. Do NOT invent generic colors.")
    lines.append("")

    for i, p in enumerate(palettes[:max_palettes], 1):
        colors_str = " | ".join([f"`#{c}`" for c in p.colors])
        mood_str = f" ({p.mood})" if p.mood else ""
        lines.append(f"**Palette {i}**{mood_str}: {colors_str}")
        if p.source_url:
            lines.append(f"  Source: {p.source_url}")
        lines.append("")

    return "\n".join(lines)
