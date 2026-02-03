"""
FontPair Crawler - Scrapes font pairing suggestions using httpx

Extracts professionally curated font pairings from FontPair.co
for heading + body font combinations.
"""

import httpx
import json
import logging
import os
import re
import tempfile
from bs4 import BeautifulSoup
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Optional, Dict, Any

logger = logging.getLogger(__name__)

# Cache configuration
CACHE_DIR = Path(__file__).parent.parent / "data"
FONTPAIR_CACHE_FILE = CACHE_DIR / "fontpair.json"
CACHE_MAX_AGE_HOURS = 24  # Refresh cache after 24 hours


class FontPairing:
    """Represents a font pairing suggestion"""

    def __init__(
        self,
        heading_font: str,
        body_font: str,
        heading_category: str = "sans-serif",
        body_category: str = "sans-serif",
        style: Optional[str] = None,  # modern, classic, playful, etc.
        source_url: Optional[str] = None,
    ):
        self.heading_font = heading_font
        self.body_font = body_font
        self.heading_category = heading_category
        self.body_category = body_category
        self.style = style
        self.source_url = source_url

    def to_dict(self) -> dict:
        return {
            "heading_font": self.heading_font,
            "body_font": self.body_font,
            "heading_category": self.heading_category,
            "body_category": self.body_category,
            "style": self.style,
            "source_url": self.source_url,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "FontPairing":
        return cls(
            heading_font=data["heading_font"],
            body_font=data["body_font"],
            heading_category=data.get("heading_category", "sans-serif"),
            body_category=data.get("body_category", "sans-serif"),
            style=data.get("style"),
            source_url=data.get("source_url"),
        )


async def scrape_fontpair() -> List[FontPairing]:
    """
    Scrape font pairings from FontPair.co

    Returns curated font pairings for heading and body text.
    Now returns BOTH scraped pairings AND fallback for accumulation.
    """
    scraped_pairings = []

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://www.fontpair.co/all",
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                },
                timeout=15.0,
                follow_redirects=True,
            )
            response.raise_for_status()

            soup = BeautifulSoup(response.text, 'html.parser')

            # FontPair displays pairings in cards/sections - try multiple selectors
            # Updated selectors to match common patterns on font pairing sites
            pairing_elements = soup.select(
                '.pairing, .font-pairing, [data-pairing], article, '
                '.pair-card, .font-pair, .pairing-card, .combo, '
                '[class*="pairing"], [class*="pair"], [class*="combo"]'
            )

            for element in pairing_elements:
                try:
                    # Try to extract heading and body fonts
                    text = element.get_text(separator=' ')

                    # Look for patterns like "Font1 + Font2", "Font1 & Font2", "Font1 / Font2"
                    # Also try "Font1 with Font2" pattern
                    pair_match = re.search(
                        r'([A-Z][a-zA-Z\s]+?)\s*(?:[+&/]|with|and|\|)\s*([A-Z][a-zA-Z\s]+)',
                        text, re.IGNORECASE
                    )

                    if pair_match:
                        heading = pair_match.group(1).strip()
                        body = pair_match.group(2).strip()

                        # Filter out non-font strings
                        if 3 < len(heading) < 30 and 3 < len(body) < 30:
                            # Determine category based on common patterns
                            heading_cat = detect_font_category(heading)
                            body_cat = detect_font_category(body)

                            scraped_pairings.append(FontPairing(
                                heading_font=heading,
                                body_font=body,
                                heading_category=heading_cat,
                                body_category=body_cat,
                                source_url="https://www.fontpair.co/all",
                            ))

                except Exception as e:
                    logger.debug(f"Failed to parse pairing element: {e}")
                    continue

            logger.info(f"Scraped {len(scraped_pairings)} pairings from FontPair.co")

    except Exception as e:
        logger.warning(f"Failed to scrape FontPair.co: {e}")

    # ALWAYS return fallback pairings for accumulation
    # Scraped pairings will be ADDED to the accumulated collection
    # This ensures the library grows even when scraping partially fails
    fallback = get_fallback_pairings()

    # Combine scraped + fallback, deduplicating
    all_pairings = scraped_pairings.copy()
    seen_keys = {(p.heading_font, p.body_font) for p in all_pairings}

    for p in fallback:
        key = (p.heading_font, p.body_font)
        if key not in seen_keys:
            all_pairings.append(p)
            seen_keys.add(key)

    logger.info(f"Returning {len(all_pairings)} total pairings ({len(scraped_pairings)} scraped + {len(all_pairings) - len(scraped_pairings)} from fallback)")
    return all_pairings


def detect_font_category(font_name: str) -> str:
    """Detect font category from font name."""
    name_lower = font_name.lower()

    serif_indicators = ['serif', 'georgia', 'times', 'playfair', 'merri', 'lora',
                        'garamond', 'baskerville', 'bodoni', 'caslon', 'didot',
                        'crimson', 'libre', 'cormorant', 'spectral', 'source serif']
    mono_indicators = ['mono', 'code', 'console', 'jetbrains', 'fira code',
                       'source code', 'courier', 'inconsolata', 'menlo']
    display_indicators = ['display', 'black', 'poster', 'decorative', 'script',
                          'handwriting', 'cursive', 'brush', 'calligraphy']

    if any(ind in name_lower for ind in mono_indicators):
        return 'monospace'
    if any(ind in name_lower for ind in serif_indicators):
        return 'serif'
    if any(ind in name_lower for ind in display_indicators):
        return 'display'
    return 'sans-serif'


def get_fallback_pairings() -> List[FontPairing]:
    """Return curated font pairings as fallback.

    This is a large collection of professionally curated pairings.
    The accumulation system will add these to the cache over time,
    ensuring variety even when scraping fails.
    """

    # Professionally curated pairings for app design - expanded collection
    pairings_data = [
        # === Modern/Clean (15 pairings) ===
        {"heading_font": "Inter", "body_font": "Inter", "style": "modern", "heading_category": "sans-serif", "body_category": "sans-serif"},
        {"heading_font": "Space Grotesk", "body_font": "Inter", "style": "modern", "heading_category": "sans-serif", "body_category": "sans-serif"},
        {"heading_font": "Plus Jakarta Sans", "body_font": "Inter", "style": "modern", "heading_category": "sans-serif", "body_category": "sans-serif"},
        {"heading_font": "Manrope", "body_font": "Inter", "style": "modern", "heading_category": "sans-serif", "body_category": "sans-serif"},
        {"heading_font": "DM Sans", "body_font": "DM Sans", "style": "modern", "heading_category": "sans-serif", "body_category": "sans-serif"},
        {"heading_font": "Outfit", "body_font": "Inter", "style": "modern", "heading_category": "sans-serif", "body_category": "sans-serif"},
        {"heading_font": "Satoshi", "body_font": "Inter", "style": "modern", "heading_category": "sans-serif", "body_category": "sans-serif"},
        {"heading_font": "General Sans", "body_font": "Inter", "style": "modern", "heading_category": "sans-serif", "body_category": "sans-serif"},
        {"heading_font": "Cabinet Grotesk", "body_font": "Inter", "style": "modern", "heading_category": "sans-serif", "body_category": "sans-serif"},
        {"heading_font": "Clash Display", "body_font": "DM Sans", "style": "modern", "heading_category": "sans-serif", "body_category": "sans-serif"},
        {"heading_font": "Switzer", "body_font": "Inter", "style": "modern", "heading_category": "sans-serif", "body_category": "sans-serif"},
        {"heading_font": "Geist", "body_font": "Geist", "style": "modern", "heading_category": "sans-serif", "body_category": "sans-serif"},
        {"heading_font": "Figtree", "body_font": "Inter", "style": "modern", "heading_category": "sans-serif", "body_category": "sans-serif"},
        {"heading_font": "Be Vietnam Pro", "body_font": "Inter", "style": "modern", "heading_category": "sans-serif", "body_category": "sans-serif"},
        {"heading_font": "Albert Sans", "body_font": "Inter", "style": "modern", "heading_category": "sans-serif", "body_category": "sans-serif"},

        # === Professional/Corporate (12 pairings) ===
        {"heading_font": "Poppins", "body_font": "Open Sans", "style": "professional", "heading_category": "sans-serif", "body_category": "sans-serif"},
        {"heading_font": "Montserrat", "body_font": "Roboto", "style": "professional", "heading_category": "sans-serif", "body_category": "sans-serif"},
        {"heading_font": "Work Sans", "body_font": "Lato", "style": "professional", "heading_category": "sans-serif", "body_category": "sans-serif"},
        {"heading_font": "Nunito", "body_font": "Open Sans", "style": "professional", "heading_category": "sans-serif", "body_category": "sans-serif"},
        {"heading_font": "Raleway", "body_font": "Roboto", "style": "professional", "heading_category": "sans-serif", "body_category": "sans-serif"},
        {"heading_font": "Rubik", "body_font": "Roboto", "style": "professional", "heading_category": "sans-serif", "body_category": "sans-serif"},
        {"heading_font": "Barlow", "body_font": "Roboto", "style": "professional", "heading_category": "sans-serif", "body_category": "sans-serif"},
        {"heading_font": "Mulish", "body_font": "Open Sans", "style": "professional", "heading_category": "sans-serif", "body_category": "sans-serif"},
        {"heading_font": "Hind", "body_font": "Open Sans", "style": "professional", "heading_category": "sans-serif", "body_category": "sans-serif"},
        {"heading_font": "Karla", "body_font": "Lato", "style": "professional", "heading_category": "sans-serif", "body_category": "sans-serif"},
        {"heading_font": "Titillium Web", "body_font": "Roboto", "style": "professional", "heading_category": "sans-serif", "body_category": "sans-serif"},
        {"heading_font": "Exo 2", "body_font": "Open Sans", "style": "professional", "heading_category": "sans-serif", "body_category": "sans-serif"},

        # === Editorial/Premium (15 pairings) ===
        {"heading_font": "Playfair Display", "body_font": "Lato", "style": "editorial", "heading_category": "serif", "body_category": "sans-serif"},
        {"heading_font": "Playfair Display", "body_font": "Source Sans Pro", "style": "editorial", "heading_category": "serif", "body_category": "sans-serif"},
        {"heading_font": "Merriweather", "body_font": "Open Sans", "style": "editorial", "heading_category": "serif", "body_category": "sans-serif"},
        {"heading_font": "Lora", "body_font": "Roboto", "style": "editorial", "heading_category": "serif", "body_category": "sans-serif"},
        {"heading_font": "Crimson Pro", "body_font": "Work Sans", "style": "editorial", "heading_category": "serif", "body_category": "sans-serif"},
        {"heading_font": "Cormorant Garamond", "body_font": "Proza Libre", "style": "editorial", "heading_category": "serif", "body_category": "sans-serif"},
        {"heading_font": "Spectral", "body_font": "Open Sans", "style": "editorial", "heading_category": "serif", "body_category": "sans-serif"},
        {"heading_font": "Fraunces", "body_font": "Inter", "style": "editorial", "heading_category": "serif", "body_category": "sans-serif"},
        {"heading_font": "DM Serif Display", "body_font": "DM Sans", "style": "editorial", "heading_category": "serif", "body_category": "sans-serif"},
        {"heading_font": "Noto Serif", "body_font": "Noto Sans", "style": "editorial", "heading_category": "serif", "body_category": "sans-serif"},
        {"heading_font": "Vollkorn", "body_font": "Lato", "style": "editorial", "heading_category": "serif", "body_category": "sans-serif"},
        {"heading_font": "Bitter", "body_font": "Raleway", "style": "editorial", "heading_category": "serif", "body_category": "sans-serif"},
        {"heading_font": "Cardo", "body_font": "Open Sans", "style": "editorial", "heading_category": "serif", "body_category": "sans-serif"},
        {"heading_font": "Alegreya", "body_font": "Open Sans", "style": "editorial", "heading_category": "serif", "body_category": "sans-serif"},
        {"heading_font": "Newsreader", "body_font": "Inter", "style": "editorial", "heading_category": "serif", "body_category": "sans-serif"},

        # === Friendly/Approachable (10 pairings) ===
        {"heading_font": "Poppins", "body_font": "Poppins", "style": "friendly", "heading_category": "sans-serif", "body_category": "sans-serif"},
        {"heading_font": "Nunito", "body_font": "Nunito", "style": "friendly", "heading_category": "sans-serif", "body_category": "sans-serif"},
        {"heading_font": "Quicksand", "body_font": "Open Sans", "style": "friendly", "heading_category": "sans-serif", "body_category": "sans-serif"},
        {"heading_font": "Comfortaa", "body_font": "Open Sans", "style": "friendly", "heading_category": "sans-serif", "body_category": "sans-serif"},
        {"heading_font": "Varela Round", "body_font": "Open Sans", "style": "friendly", "heading_category": "sans-serif", "body_category": "sans-serif"},
        {"heading_font": "Baloo 2", "body_font": "Open Sans", "style": "friendly", "heading_category": "sans-serif", "body_category": "sans-serif"},
        {"heading_font": "Fredoka", "body_font": "Inter", "style": "friendly", "heading_category": "sans-serif", "body_category": "sans-serif"},
        {"heading_font": "Lexend", "body_font": "Open Sans", "style": "friendly", "heading_category": "sans-serif", "body_category": "sans-serif"},
        {"heading_font": "Maven Pro", "body_font": "Open Sans", "style": "friendly", "heading_category": "sans-serif", "body_category": "sans-serif"},
        {"heading_font": "Catamaran", "body_font": "Open Sans", "style": "friendly", "heading_category": "sans-serif", "body_category": "sans-serif"},

        # === Technical/Developer (10 pairings) ===
        {"heading_font": "Space Grotesk", "body_font": "JetBrains Mono", "style": "technical", "heading_category": "sans-serif", "body_category": "monospace"},
        {"heading_font": "Inter", "body_font": "Fira Code", "style": "technical", "heading_category": "sans-serif", "body_category": "monospace"},
        {"heading_font": "Roboto", "body_font": "Source Code Pro", "style": "technical", "heading_category": "sans-serif", "body_category": "monospace"},
        {"heading_font": "IBM Plex Sans", "body_font": "IBM Plex Mono", "style": "technical", "heading_category": "sans-serif", "body_category": "monospace"},
        {"heading_font": "Space Mono", "body_font": "Space Mono", "style": "technical", "heading_category": "monospace", "body_category": "monospace"},
        {"heading_font": "Inter", "body_font": "Inconsolata", "style": "technical", "heading_category": "sans-serif", "body_category": "monospace"},
        {"heading_font": "DM Sans", "body_font": "DM Mono", "style": "technical", "heading_category": "sans-serif", "body_category": "monospace"},
        {"heading_font": "Geist", "body_font": "Geist Mono", "style": "technical", "heading_category": "sans-serif", "body_category": "monospace"},
        {"heading_font": "Roboto Mono", "body_font": "Roboto Mono", "style": "technical", "heading_category": "monospace", "body_category": "monospace"},
        {"heading_font": "Ubuntu", "body_font": "Ubuntu Mono", "style": "technical", "heading_category": "sans-serif", "body_category": "monospace"},

        # === Bold/Impactful (10 pairings) ===
        {"heading_font": "Sora", "body_font": "Inter", "style": "bold", "heading_category": "sans-serif", "body_category": "sans-serif"},
        {"heading_font": "Outfit", "body_font": "Inter", "style": "bold", "heading_category": "sans-serif", "body_category": "sans-serif"},
        {"heading_font": "Lexend", "body_font": "Lexend", "style": "bold", "heading_category": "sans-serif", "body_category": "sans-serif"},
        {"heading_font": "Archivo Black", "body_font": "Roboto", "style": "bold", "heading_category": "sans-serif", "body_category": "sans-serif"},
        {"heading_font": "Oswald", "body_font": "Open Sans", "style": "bold", "heading_category": "sans-serif", "body_category": "sans-serif"},
        {"heading_font": "Anton", "body_font": "Roboto", "style": "bold", "heading_category": "sans-serif", "body_category": "sans-serif"},
        {"heading_font": "Bebas Neue", "body_font": "Open Sans", "style": "bold", "heading_category": "sans-serif", "body_category": "sans-serif"},
        {"heading_font": "League Spartan", "body_font": "Inter", "style": "bold", "heading_category": "sans-serif", "body_category": "sans-serif"},
        {"heading_font": "Red Hat Display", "body_font": "Red Hat Text", "style": "bold", "heading_category": "sans-serif", "body_category": "sans-serif"},
        {"heading_font": "Epilogue", "body_font": "Inter", "style": "bold", "heading_category": "sans-serif", "body_category": "sans-serif"},

        # === Classic/Timeless (10 pairings) ===
        {"heading_font": "Source Serif Pro", "body_font": "Source Sans Pro", "style": "classic", "heading_category": "serif", "body_category": "sans-serif"},
        {"heading_font": "Libre Baskerville", "body_font": "Source Sans Pro", "style": "classic", "heading_category": "serif", "body_category": "sans-serif"},
        {"heading_font": "EB Garamond", "body_font": "Open Sans", "style": "classic", "heading_category": "serif", "body_category": "sans-serif"},
        {"heading_font": "Cormorant", "body_font": "Proza Libre", "style": "classic", "heading_category": "serif", "body_category": "sans-serif"},
        {"heading_font": "Old Standard TT", "body_font": "Open Sans", "style": "classic", "heading_category": "serif", "body_category": "sans-serif"},
        {"heading_font": "Libre Caslon Text", "body_font": "Source Sans Pro", "style": "classic", "heading_category": "serif", "body_category": "sans-serif"},
        {"heading_font": "PT Serif", "body_font": "PT Sans", "style": "classic", "heading_category": "serif", "body_category": "sans-serif"},
        {"heading_font": "Literata", "body_font": "Open Sans", "style": "classic", "heading_category": "serif", "body_category": "sans-serif"},
        {"heading_font": "Crimson Text", "body_font": "Lato", "style": "classic", "heading_category": "serif", "body_category": "sans-serif"},
        {"heading_font": "Zilla Slab", "body_font": "Open Sans", "style": "classic", "heading_category": "serif", "body_category": "sans-serif"},

        # === Elegant/Luxury (8 pairings) ===
        {"heading_font": "Bodoni Moda", "body_font": "Work Sans", "style": "elegant", "heading_category": "serif", "body_category": "sans-serif"},
        {"heading_font": "Cinzel", "body_font": "Fauna One", "style": "elegant", "heading_category": "serif", "body_category": "serif"},
        {"heading_font": "Tenor Sans", "body_font": "Open Sans", "style": "elegant", "heading_category": "sans-serif", "body_category": "sans-serif"},
        {"heading_font": "Josefin Sans", "body_font": "Lato", "style": "elegant", "heading_category": "sans-serif", "body_category": "sans-serif"},
        {"heading_font": "Libre Franklin", "body_font": "Libre Baskerville", "style": "elegant", "heading_category": "sans-serif", "body_category": "serif"},
        {"heading_font": "Marcellus", "body_font": "Open Sans", "style": "elegant", "heading_category": "serif", "body_category": "sans-serif"},
        {"heading_font": "Gilda Display", "body_font": "Lato", "style": "elegant", "heading_category": "serif", "body_category": "sans-serif"},
        {"heading_font": "Forum", "body_font": "Work Sans", "style": "elegant", "heading_category": "serif", "body_category": "sans-serif"},
    ]

    return [FontPairing.from_dict(p) for p in pairings_data]


def load_cached_pairings(check_expiry: bool = True) -> Optional[List[FontPairing]]:
    """
    Load pairings from cache.

    Args:
        check_expiry: If True, return None if cache is expired (for triggering refresh).
                      If False, always return cached pairings (for accumulation).
    """
    if not FONTPAIR_CACHE_FILE.exists():
        return None

    try:
        with open(FONTPAIR_CACHE_FILE, 'r') as f:
            cache = json.load(f)

        cached_at = datetime.fromisoformat(cache.get('cached_at', '2000-01-01'))
        is_expired = datetime.now() - cached_at > timedelta(hours=CACHE_MAX_AGE_HOURS)

        if check_expiry and is_expired:
            logger.info("Font pairing cache expired, will refresh and accumulate")
            return None

        pairings = [FontPairing.from_dict(p) for p in cache.get('pairings', [])]
        logger.info(f"Loaded {len(pairings)} font pairings from cache (expired={is_expired})")
        return pairings

    except Exception as e:
        logger.error(f"Error loading font pairing cache: {e}")
        return None


def save_pairings_to_cache(pairings: List[FontPairing], accumulate: bool = True):
    """
    Save pairings to cache using atomic write.

    Args:
        pairings: New pairings to save
        accumulate: If True, merge with existing cache. If False, replace entirely.
    """
    try:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)

        all_pairings = pairings

        if accumulate:
            # Load existing pairings (ignore expiry for accumulation)
            existing = load_cached_pairings(check_expiry=False) or []

            # Deduplicate by heading+body font combination
            existing_keys = {(p.heading_font, p.body_font) for p in existing}

            # Add new pairings that don't already exist
            added_count = 0
            for p in pairings:
                key = (p.heading_font, p.body_font)
                if key not in existing_keys:
                    existing.append(p)
                    existing_keys.add(key)
                    added_count += 1

            all_pairings = existing
            logger.info(f"Accumulated {added_count} new pairings, total now: {len(all_pairings)}")

        cache = {
            'cached_at': datetime.now().isoformat(),
            'total_accumulated': len(all_pairings),
            'pairings': [p.to_dict() for p in all_pairings],
        }

        # Atomic write: write to temp file, then rename
        with tempfile.NamedTemporaryFile('w', dir=CACHE_DIR, delete=False, suffix='.tmp') as f:
            json.dump(cache, f, indent=2)
            temp_path = f.name

        os.replace(temp_path, FONTPAIR_CACHE_FILE)  # Atomic on most systems
        logger.info(f"Saved {len(all_pairings)} font pairings to cache")

    except Exception as e:
        logger.error(f"Error saving font pairing cache: {e}")


async def get_font_pairings(force_refresh: bool = False, max_pairings: int = 50) -> List[FontPairing]:
    """
    Get font pairings with accumulating cache.

    Pairings are accumulated over time - each scrape adds new unique pairings
    to the collection rather than replacing it.

    Args:
        force_refresh: Force fetching fresh data from FontPair (still accumulates)
        max_pairings: Maximum number of pairings to return

    Returns:
        List of FontPairing objects from accumulated collection
    """
    import asyncio

    # Check if we should scrape (cache expired or force refresh)
    should_scrape = force_refresh
    cached = await asyncio.to_thread(load_cached_pairings, True)  # check_expiry=True

    if cached is None:
        # Cache expired or doesn't exist - need to scrape
        should_scrape = True
        # But still load existing pairings for accumulation
        cached = await asyncio.to_thread(load_cached_pairings, False) or []  # check_expiry=False

    if should_scrape:
        logger.info("Scraping fresh font pairings from FontPair...")
        try:
            new_pairings = await scrape_fontpair()

            if new_pairings and len(new_pairings) > 0:
                # Accumulate new pairings with existing
                await asyncio.to_thread(save_pairings_to_cache, new_pairings, True)  # accumulate=True
                # Reload to get full accumulated set
                cached = await asyncio.to_thread(load_cached_pairings, False) or new_pairings

        except Exception as e:
            logger.error(f"Error scraping font pairings: {e}")
            # Return cached if available, otherwise use fallback
            if not cached:
                logger.info("No cached pairings, using fallback collection")
                cached = get_fallback_pairings()
                await asyncio.to_thread(save_pairings_to_cache, cached, False)  # accumulate=False

    # If still no cached pairings (shouldn't happen, but safety check)
    if not cached:
        logger.info("No pairings available, using fallback collection")
        cached = get_fallback_pairings()
        await asyncio.to_thread(save_pairings_to_cache, cached, False)

    logger.info(f"Returning {min(len(cached), max_pairings)} pairings from collection of {len(cached)}")
    return cached[:max_pairings]


def select_pairings_for_style(
    pairings: List[FontPairing],
    style: Optional[str] = None,
    category: Optional[str] = None,
    max_pairings: int = 10,
) -> List[FontPairing]:
    """
    Select font pairings for a specific style or app category.

    Args:
        pairings: Available pairings
        style: Style preference (modern, professional, editorial, friendly, technical)
        category: App Store category
        max_pairings: Maximum pairings to return

    Returns:
        Filtered pairings
    """
    # Map app categories to pairing styles
    category_styles: Dict[str, List[str]] = {
        'Finance': ['professional', 'modern'],
        'Business': ['professional', 'modern'],
        'Productivity': ['modern', 'professional'],
        'Health & Fitness': ['friendly', 'modern'],
        'Medical': ['professional', 'classic'],
        'Entertainment': ['bold', 'friendly'],
        'Games': ['bold', 'friendly'],
        'Education': ['friendly', 'classic'],
        'Books': ['editorial', 'classic'],
        'Shopping': ['modern', 'friendly'],
        'Food & Drink': ['friendly', 'editorial'],
        'Travel': ['bold', 'modern'],
        'Social Networking': ['modern', 'friendly'],
        'Developer Tools': ['technical', 'modern'],
        'Utilities': ['modern', 'professional'],
    }

    preferred_styles = []
    if style:
        preferred_styles = [style]
    elif category and category in category_styles:
        preferred_styles = category_styles[category]

    if not preferred_styles:
        preferred_styles = ['modern', 'professional']

    # Score pairings by style match
    def score_pairing(pairing: FontPairing) -> int:
        if pairing.style in preferred_styles:
            return 10 - preferred_styles.index(pairing.style)
        return 0

    sorted_pairings = sorted(pairings, key=score_pairing, reverse=True)
    return sorted_pairings[:max_pairings]
