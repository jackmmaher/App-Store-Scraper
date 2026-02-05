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
        page = None
        try:
            page = await self._create_page()
        except Exception as e:
            logger.error(f"Browser error during palette crawl: {e}")
            return []

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
            if page:
                try:
                    await page.context.close()
                except Exception:
                    pass

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


def get_fallback_palettes() -> List[ColorPalette]:
    """
    Return curated high-quality palettes as fallback when scraping fails.
    These are real Coolors.co trending palettes, manually curated for quality.

    This is a large collection - the accumulation system will add these to the
    cache over time, ensuring variety even when scraping fails.
    """
    # Large curated collection from Coolors.co trending - provides variety
    palettes_data = [
        # === Professional / Corporate (15 palettes) ===
        {"colors": ["264653", "2A9D8F", "E9C46A", "F4A261", "E76F51"], "mood": "professional"},
        {"colors": ["003049", "D62828", "F77F00", "FCBF49", "EAE2B7"], "mood": "professional"},
        {"colors": ["1D3557", "457B9D", "A8DADC", "F1FAEE", "E63946"], "mood": "professional"},
        {"colors": ["2B2D42", "8D99AE", "EDF2F4", "EF233C", "D80032"], "mood": "professional"},
        {"colors": ["000814", "001D3D", "003566", "FFC300", "FFD60A"], "mood": "professional"},
        {"colors": ["0B132B", "1C2541", "3A506B", "5BC0BE", "6FFFE9"], "mood": "professional"},
        {"colors": ["2D3142", "4F5D75", "BFC0C0", "FFFFFF", "EF8354"], "mood": "professional"},
        {"colors": ["222831", "393E46", "00ADB5", "EEEEEE", "FFD369"], "mood": "professional"},
        {"colors": ["16213E", "1F4068", "4DA8DA", "E8F1F5", "F0E5CF"], "mood": "professional"},
        {"colors": ["2C3531", "116466", "D9B08C", "FFCB9A", "D1E8E2"], "mood": "professional"},
        {"colors": ["1B262C", "0F4C75", "3282B8", "BBE1FA", "FFFFFF"], "mood": "professional"},
        {"colors": ["2D4059", "EA5455", "F07B3F", "FFD460", "FAFAFA"], "mood": "professional"},
        {"colors": ["252525", "414141", "707070", "9F9F9F", "CFCFCF"], "mood": "professional"},
        {"colors": ["1A1A2E", "16213E", "0F3460", "533483", "E94560"], "mood": "professional"},
        {"colors": ["0A1128", "001F54", "034078", "1282A2", "FEFCFB"], "mood": "professional"},

        # === Calm / Wellness (15 palettes) ===
        {"colors": ["606C38", "283618", "FEFAE0", "DDA15E", "BC6C25"], "mood": "calm"},
        {"colors": ["CCD5AE", "E9EDC9", "FEFAE0", "FAEDCD", "D4A373"], "mood": "calm"},
        {"colors": ["F8F9FA", "E9ECEF", "DEE2E6", "CED4DA", "ADB5BD"], "mood": "calm"},
        {"colors": ["A7C957", "6A994E", "386641", "BC4749", "F2E8CF"], "mood": "calm"},
        {"colors": ["E8E8E4", "D8D8D4", "C8C8C4", "B8B8B4", "A8A8A4"], "mood": "calm"},
        {"colors": ["D8E2DC", "FFE5D9", "FFCAD4", "F4ACB7", "9D8189"], "mood": "calm"},
        {"colors": ["95D5B2", "74C69D", "52B788", "40916C", "2D6A4F"], "mood": "calm"},
        {"colors": ["E9F5DB", "CFE1B9", "B5C99A", "97A97C", "87986A"], "mood": "calm"},
        {"colors": ["F0EAD6", "DFE6C2", "C9D5B5", "A3B18A", "588157"], "mood": "calm"},
        {"colors": ["FAF3DD", "C8D5B9", "8FC0A9", "68B0AB", "4A7C59"], "mood": "calm"},
        {"colors": ["EDEEC9", "DDE5B6", "ADC178", "A98467", "6C584C"], "mood": "calm"},
        {"colors": ["D6CCC2", "F5EBE0", "E3D5CA", "D5BDAF", "EDEDE9"], "mood": "calm"},
        {"colors": ["F1FAEE", "A8DADC", "457B9D", "1D3557", "E63946"], "mood": "calm"},
        {"colors": ["EAE4E9", "FFF1E6", "FDE2E4", "FAD2E1", "E2ECE9"], "mood": "calm"},
        {"colors": ["B7B7A4", "A5A58D", "6B705C", "FFE8D6", "DDBEA9"], "mood": "calm"},

        # === Playful / Vibrant (15 palettes) ===
        {"colors": ["FF6B6B", "4ECDC4", "45B7D1", "96CEB4", "FFEAA7"], "mood": "playful"},
        {"colors": ["F72585", "B5179E", "7209B7", "560BAD", "480CA8"], "mood": "playful"},
        {"colors": ["FFBE0B", "FB5607", "FF006E", "8338EC", "3A86FF"], "mood": "playful"},
        {"colors": ["70D6FF", "FF70A6", "FF9770", "FFD670", "E9FF70"], "mood": "playful"},
        {"colors": ["F94144", "F3722C", "F8961E", "F9C74F", "90BE6D"], "mood": "playful"},
        {"colors": ["FF595E", "FFCA3A", "8AC926", "1982C4", "6A4C93"], "mood": "playful"},
        {"colors": ["9B5DE5", "F15BB5", "FEE440", "00BBF9", "00F5D4"], "mood": "playful"},
        {"colors": ["FF99C8", "FCF6BD", "D0F4DE", "A9DEF9", "E4C1F9"], "mood": "playful"},
        {"colors": ["EF476F", "FFD166", "06D6A0", "118AB2", "073B4C"], "mood": "playful"},
        {"colors": ["FDFFB6", "CAFFBF", "9BF6FF", "A0C4FF", "BDB2FF"], "mood": "playful"},
        {"colors": ["FF4D6D", "FF758F", "FF8FA3", "FFB3C1", "FFCCD5"], "mood": "playful"},
        {"colors": ["C9184A", "FF4D6D", "FF758F", "FF8FA3", "FFB3C1"], "mood": "playful"},
        {"colors": ["7400B8", "6930C3", "5E60CE", "5390D9", "4EA8DE"], "mood": "playful"},
        {"colors": ["D8F3DC", "B7E4C7", "95D5B2", "74C69D", "52B788"], "mood": "playful"},
        {"colors": ["FFADAD", "FFD6A5", "FDFFB6", "CAFFBF", "9BF6FF"], "mood": "playful"},

        # === Bold / Dark (15 palettes) ===
        {"colors": ["0D1B2A", "1B263B", "415A77", "778DA9", "E0E1DD"], "mood": "dark"},
        {"colors": ["14213D", "FCA311", "E5E5E5", "000000", "FFFFFF"], "mood": "dark"},
        {"colors": ["212529", "343A40", "495057", "6C757D", "ADB5BD"], "mood": "dark"},
        {"colors": ["10002B", "240046", "3C096C", "5A189A", "7B2CBF"], "mood": "dark"},
        {"colors": ["03071E", "370617", "6A040F", "9D0208", "D00000"], "mood": "bold"},
        {"colors": ["012A4A", "013A63", "01497C", "014F86", "2A6F97"], "mood": "dark"},
        {"colors": ["231942", "5E548E", "9F86C0", "BE95C4", "E0B1CB"], "mood": "dark"},
        {"colors": ["2D00F7", "6A00F4", "8900F2", "A100F2", "B100E8"], "mood": "bold"},
        {"colors": ["240046", "3C096C", "5A189A", "7B2CBF", "9D4EDD"], "mood": "dark"},
        {"colors": ["000000", "14213D", "FCA311", "E5E5E5", "FFFFFF"], "mood": "dark"},
        {"colors": ["2B2D42", "8D99AE", "EDF2F4", "EF233C", "D90429"], "mood": "bold"},
        {"colors": ["0B090A", "161A1D", "660708", "A4161A", "BA181B"], "mood": "bold"},
        {"colors": ["001219", "005F73", "0A9396", "94D2BD", "E9D8A6"], "mood": "dark"},
        {"colors": ["03071E", "370617", "6A040F", "9D0208", "DC2F02"], "mood": "bold"},
        {"colors": ["1A1423", "372549", "774C60", "B75D69", "EACDC2"], "mood": "dark"},

        # === Warm (15 palettes) ===
        {"colors": ["D4A373", "CCD5AE", "E9EDC9", "FEFAE0", "FAEDCD"], "mood": "warm"},
        {"colors": ["BC6C25", "DDA15E", "FEFAE0", "283618", "606C38"], "mood": "warm"},
        {"colors": ["FFCDB2", "FFB4A2", "E5989B", "B5838D", "6D6875"], "mood": "warm"},
        {"colors": ["FF9F1C", "FFBF69", "FFFFFF", "CBF3F0", "2EC4B6"], "mood": "warm"},
        {"colors": ["9B2335", "D72638", "EF3E36", "F2EFEA", "140F2D"], "mood": "warm"},
        {"colors": ["F4A261", "E9C46A", "2A9D8F", "264653", "E76F51"], "mood": "warm"},
        {"colors": ["FFBA08", "FAA307", "F48C06", "E85D04", "DC2F02"], "mood": "warm"},
        {"colors": ["CC5803", "E2711D", "FF9505", "FFB627", "FFC971"], "mood": "warm"},
        {"colors": ["EDEDE9", "D6CCC2", "F5EBE0", "E3D5CA", "D5BDAF"], "mood": "warm"},
        {"colors": ["F7B267", "F79D65", "F4845F", "F27059", "F25C54"], "mood": "warm"},
        {"colors": ["FF6D00", "FF7900", "FF8500", "FF9100", "FF9E00"], "mood": "warm"},
        {"colors": ["FFEDD8", "F3D5B5", "E7BC91", "D4A276", "BC8A5F"], "mood": "warm"},
        {"colors": ["FFE169", "FAD643", "EDC531", "DBB42C", "C9A227"], "mood": "warm"},
        {"colors": ["582F0E", "7F4F24", "936639", "A68A64", "B6AD90"], "mood": "warm"},
        {"colors": ["D00000", "DC2F02", "E85D04", "F48C06", "FAA307"], "mood": "warm"},

        # === Cool (15 palettes) ===
        {"colors": ["03045E", "0077B6", "00B4D8", "90E0EF", "CAF0F8"], "mood": "cool"},
        {"colors": ["184E77", "1E6091", "1A759F", "168AAD", "34A0A4"], "mood": "cool"},
        {"colors": ["22223B", "4A4E69", "9A8C98", "C9ADA7", "F2E9E4"], "mood": "cool"},
        {"colors": ["5F0F40", "9A031E", "FB8B24", "E36414", "0F4C5C"], "mood": "cool"},
        {"colors": ["006D77", "83C5BE", "EDF6F9", "FFDDD2", "E29578"], "mood": "cool"},
        {"colors": ["48CAE4", "00B4D8", "0096C7", "0077B6", "023E8A"], "mood": "cool"},
        {"colors": ["5E60CE", "5390D9", "4EA8DE", "48BFE3", "56CFE1"], "mood": "cool"},
        {"colors": ["64DFDF", "72EFDD", "80FFDB", "6FFFE9", "5FFBF1"], "mood": "cool"},
        {"colors": ["3D5A80", "98C1D9", "E0FBFC", "EE6C4D", "293241"], "mood": "cool"},
        {"colors": ["001F3F", "003366", "004080", "0059B3", "0073E6"], "mood": "cool"},
        {"colors": ["05668D", "028090", "00A896", "02C39A", "F0F3BD"], "mood": "cool"},
        {"colors": ["247BA0", "70C1B3", "B2DBBF", "F3FFBD", "FF1654"], "mood": "cool"},
        {"colors": ["0D3B66", "FAF0CA", "F4D35E", "EE964B", "F95738"], "mood": "cool"},
        {"colors": ["335C67", "FFF3B0", "E09F3E", "9E2A2B", "540B0E"], "mood": "cool"},
        {"colors": ["0081A7", "00AFB9", "FDFCDC", "FED9B7", "F07167"], "mood": "cool"},

        # === Light / Airy (10 palettes) ===
        {"colors": ["F8F9FA", "E9ECEF", "DEE2E6", "CED4DA", "ADB5BD"], "mood": "light"},
        {"colors": ["FFFFFF", "F0EFEB", "DFE7E7", "C9CAD0", "AAB0BC"], "mood": "light"},
        {"colors": ["FEFCFB", "F8F0E3", "EDE6DB", "E5DDD3", "D8CFC4"], "mood": "light"},
        {"colors": ["F8EDEB", "FEC89A", "FFD7BA", "FEC5BB", "FCD5CE"], "mood": "light"},
        {"colors": ["FEF9EF", "FDF6E3", "FAF3E0", "F5EBE0", "E3D5CA"], "mood": "light"},
        {"colors": ["FBFEFB", "F8FCF8", "F0F7F4", "E8F3EC", "DFF0E5"], "mood": "light"},
        {"colors": ["FEFAE0", "FAEDCD", "E9EDC9", "CCD5AE", "D4A373"], "mood": "light"},
        {"colors": ["FFF1E6", "FDE2E4", "FAD2E1", "E2ECE9", "BEE1E6"], "mood": "light"},
        {"colors": ["FFFCF2", "CCC5B9", "403D39", "252422", "EB5E28"], "mood": "light"},
        {"colors": ["F7F7F7", "EFEFEF", "E7E7E7", "DFDFDF", "D7D7D7"], "mood": "light"},

        # === Neutral / Versatile (10 palettes) ===
        {"colors": ["2D3436", "636E72", "B2BEC3", "DFE6E9", "FFFFFF"], "mood": "neutral"},
        {"colors": ["1A1A2E", "16213E", "0F3460", "E94560", "FFFFFF"], "mood": "neutral"},
        {"colors": ["2C3E50", "3498DB", "ECF0F1", "E74C3C", "F39C12"], "mood": "neutral"},
        {"colors": ["2F3E46", "354F52", "52796F", "84A98C", "CAD2C5"], "mood": "neutral"},
        {"colors": ["3D5A80", "98C1D9", "E0FBFC", "EE6C4D", "293241"], "mood": "neutral"},
        {"colors": ["463F3A", "8A817C", "BCB8B1", "F4F3EE", "E0AFA0"], "mood": "neutral"},
        {"colors": ["6B705C", "A5A58D", "B7B7A4", "FFE8D6", "DDBEA9"], "mood": "neutral"},
        {"colors": ["353535", "3C6E71", "FFFFFF", "D9D9D9", "284B63"], "mood": "neutral"},
        {"colors": ["5F7367", "8AA29E", "A0B9BF", "B6CFD0", "D9E4DD"], "mood": "neutral"},
        {"colors": ["4A5759", "F4EAE0", "2C514C", "9CAF88", "E1E3D8"], "mood": "neutral"},
    ]

    return [ColorPalette.from_dict(p) for p in palettes_data]


async def get_trending_palettes(
    force_refresh: bool = False,
    max_palettes: int = 50,
    timeout_seconds: int = 8,
) -> List[ColorPalette]:
    """
    Get trending palettes, using accumulated cache.

    Palettes are accumulated over time - each scrape adds new unique palettes
    to the collection rather than replacing it. Fallback palettes are ALWAYS
    added to ensure variety, even when scraping fails.

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

    scraped_count = 0
    if should_scrape:
        logger.info("Scraping fresh palettes from Coolors...")
        try:
            async with asyncio.timeout(timeout_seconds):
                async with CoolorsCrawler(headless=True) as crawler:
                    new_palettes = await crawler.crawl_trending_palettes(max_palettes=50)

            if new_palettes:
                scraped_count = len(new_palettes)
                # Accumulate new palettes with existing
                save_palettes_to_cache(new_palettes, accumulate=True)
                # Reload to get full accumulated set
                cached = load_cached_palettes(check_expiry=False) or new_palettes

        except asyncio.TimeoutError:
            logger.warning(f"Palette crawl timed out after {timeout_seconds}s")
        except Exception as e:
            logger.error(f"Error crawling palettes: {e}")

    # ALWAYS ensure fallback palettes are in the collection
    # This guarantees variety even when scraping consistently fails
    fallback = get_fallback_palettes()

    if not cached:
        # No cache at all - start with fallback
        logger.info("No cached palettes, initializing with fallback collection")
        cached = fallback
        save_palettes_to_cache(cached, accumulate=False)
    else:
        # Merge fallback into cached (deduplicates automatically)
        existing_colors = {tuple(p.colors) for p in cached}
        added_from_fallback = 0
        for p in fallback:
            if tuple(p.colors) not in existing_colors:
                cached.append(p)
                existing_colors.add(tuple(p.colors))
                added_from_fallback += 1

        if added_from_fallback > 0:
            logger.info(f"Added {added_from_fallback} fallback palettes to collection")
            save_palettes_to_cache(cached, accumulate=False)  # Save the merged result

    total = len(cached)
    logger.info(f"Returning {min(total, max_palettes)} palettes from collection of {total} (scraped: {scraped_count})")
    return cached[:max_palettes]


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
