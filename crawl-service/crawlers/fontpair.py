"""
FontPair Crawler - Scrapes font pairing suggestions using httpx

Extracts professionally curated font pairings from FontPair.co
for heading + body font combinations.
"""

import httpx
import json
import logging
import re
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
    """
    pairings = []

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://www.fontpair.co/all",
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                },
                timeout=15.0,
                follow_redirects=True,
            )
            response.raise_for_status()

            soup = BeautifulSoup(response.text, 'html.parser')

            # FontPair displays pairings in cards/sections
            # The structure varies, so we try multiple selectors
            pairing_elements = soup.select('.pairing, .font-pairing, [data-pairing], article')

            for element in pairing_elements:
                try:
                    # Try to extract heading and body fonts
                    text = element.get_text(separator=' ')

                    # Look for patterns like "Font1 + Font2" or "Font1 & Font2"
                    pair_match = re.search(r'([A-Z][a-zA-Z\s]+?)\s*[+&/]\s*([A-Z][a-zA-Z\s]+)', text)

                    if pair_match:
                        heading = pair_match.group(1).strip()
                        body = pair_match.group(2).strip()

                        # Filter out non-font strings
                        if len(heading) < 30 and len(body) < 30:
                            # Determine category based on common patterns
                            heading_cat = 'serif' if any(s in heading.lower() for s in ['serif', 'georgia', 'times', 'playfair', 'merri']) else 'sans-serif'
                            body_cat = 'serif' if any(s in body.lower() for s in ['serif', 'georgia', 'times']) else 'sans-serif'

                            pairings.append(FontPairing(
                                heading_font=heading,
                                body_font=body,
                                heading_category=heading_cat,
                                body_category=body_cat,
                                source_url="https://www.fontpair.co/all",
                            ))

                except Exception as e:
                    logger.debug(f"Failed to parse pairing element: {e}")
                    continue

    except Exception as e:
        logger.warning(f"Failed to scrape FontPair.co: {e}")

    # If scraping failed or returned few results, use fallback
    if len(pairings) < 10:
        logger.info("Using fallback font pairings")
        pairings = get_fallback_pairings()

    logger.info(f"Got {len(pairings)} font pairings")
    return pairings


def get_fallback_pairings() -> List[FontPairing]:
    """Return curated font pairings as fallback"""

    # Professionally curated pairings for app design
    pairings_data = [
        # Modern/Clean
        {"heading_font": "Inter", "body_font": "Inter", "style": "modern", "heading_category": "sans-serif", "body_category": "sans-serif"},
        {"heading_font": "Space Grotesk", "body_font": "Inter", "style": "modern", "heading_category": "sans-serif", "body_category": "sans-serif"},
        {"heading_font": "Plus Jakarta Sans", "body_font": "Inter", "style": "modern", "heading_category": "sans-serif", "body_category": "sans-serif"},
        {"heading_font": "Manrope", "body_font": "Inter", "style": "modern", "heading_category": "sans-serif", "body_category": "sans-serif"},
        {"heading_font": "DM Sans", "body_font": "DM Sans", "style": "modern", "heading_category": "sans-serif", "body_category": "sans-serif"},

        # Professional/Corporate
        {"heading_font": "Poppins", "body_font": "Open Sans", "style": "professional", "heading_category": "sans-serif", "body_category": "sans-serif"},
        {"heading_font": "Montserrat", "body_font": "Roboto", "style": "professional", "heading_category": "sans-serif", "body_category": "sans-serif"},
        {"heading_font": "Work Sans", "body_font": "Lato", "style": "professional", "heading_category": "sans-serif", "body_category": "sans-serif"},
        {"heading_font": "Nunito", "body_font": "Open Sans", "style": "professional", "heading_category": "sans-serif", "body_category": "sans-serif"},

        # Editorial/Premium
        {"heading_font": "Playfair Display", "body_font": "Lato", "style": "editorial", "heading_category": "serif", "body_category": "sans-serif"},
        {"heading_font": "Playfair Display", "body_font": "Source Sans Pro", "style": "editorial", "heading_category": "serif", "body_category": "sans-serif"},
        {"heading_font": "Merriweather", "body_font": "Open Sans", "style": "editorial", "heading_category": "serif", "body_category": "sans-serif"},
        {"heading_font": "Lora", "body_font": "Roboto", "style": "editorial", "heading_category": "serif", "body_category": "sans-serif"},
        {"heading_font": "Crimson Pro", "body_font": "Work Sans", "style": "editorial", "heading_category": "serif", "body_category": "sans-serif"},

        # Friendly/Approachable
        {"heading_font": "Poppins", "body_font": "Poppins", "style": "friendly", "heading_category": "sans-serif", "body_category": "sans-serif"},
        {"heading_font": "Nunito", "body_font": "Nunito", "style": "friendly", "heading_category": "sans-serif", "body_category": "sans-serif"},
        {"heading_font": "Quicksand", "body_font": "Open Sans", "style": "friendly", "heading_category": "sans-serif", "body_category": "sans-serif"},

        # Technical/Developer
        {"heading_font": "Space Grotesk", "body_font": "JetBrains Mono", "style": "technical", "heading_category": "sans-serif", "body_category": "monospace"},
        {"heading_font": "Inter", "body_font": "Fira Code", "style": "technical", "heading_category": "sans-serif", "body_category": "monospace"},
        {"heading_font": "Roboto", "body_font": "Source Code Pro", "style": "technical", "heading_category": "sans-serif", "body_category": "monospace"},

        # Bold/Impactful
        {"heading_font": "Sora", "body_font": "Inter", "style": "bold", "heading_category": "sans-serif", "body_category": "sans-serif"},
        {"heading_font": "Outfit", "body_font": "Inter", "style": "bold", "heading_category": "sans-serif", "body_category": "sans-serif"},
        {"heading_font": "Lexend", "body_font": "Lexend", "style": "bold", "heading_category": "sans-serif", "body_category": "sans-serif"},

        # Classic/Timeless
        {"heading_font": "Source Serif Pro", "body_font": "Source Sans Pro", "style": "classic", "heading_category": "serif", "body_category": "sans-serif"},
        {"heading_font": "Libre Baskerville", "body_font": "Source Sans Pro", "style": "classic", "heading_category": "serif", "body_category": "sans-serif"},
    ]

    return [FontPairing.from_dict(p) for p in pairings_data]


def load_cached_pairings() -> Optional[List[FontPairing]]:
    """Load pairings from cache"""
    if not FONTPAIR_CACHE_FILE.exists():
        return None

    try:
        with open(FONTPAIR_CACHE_FILE, 'r') as f:
            cache = json.load(f)

        cached_at = datetime.fromisoformat(cache.get('cached_at', '2000-01-01'))
        if datetime.now() - cached_at > timedelta(hours=CACHE_MAX_AGE_HOURS):
            logger.info("Font pairing cache expired")
            return None

        pairings = [FontPairing.from_dict(p) for p in cache.get('pairings', [])]
        logger.info(f"Loaded {len(pairings)} font pairings from cache")
        return pairings

    except Exception as e:
        logger.error(f"Error loading font pairing cache: {e}")
        return None


def save_pairings_to_cache(pairings: List[FontPairing]):
    """Save pairings to cache"""
    try:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)

        cache = {
            'cached_at': datetime.now().isoformat(),
            'pairings': [p.to_dict() for p in pairings],
        }

        with open(FONTPAIR_CACHE_FILE, 'w') as f:
            json.dump(cache, f, indent=2)

        logger.info(f"Saved {len(pairings)} font pairings to cache")

    except Exception as e:
        logger.error(f"Error saving font pairing cache: {e}")


async def get_font_pairings(force_refresh: bool = False) -> List[FontPairing]:
    """
    Get font pairings with caching.

    Args:
        force_refresh: Force fetching fresh data

    Returns:
        List of FontPairing objects
    """
    if not force_refresh:
        cached = load_cached_pairings()
        if cached:
            return cached

    pairings = await scrape_fontpair()
    if pairings:
        save_pairings_to_cache(pairings)

    return pairings


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
