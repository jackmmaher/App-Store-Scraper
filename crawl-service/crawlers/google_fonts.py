"""
Google Fonts Crawler - Fetches font data from Google Fonts API

Uses the Google Fonts API to get curated fonts for app design systems.
Returns fonts with metadata like category, popularity, and weights.
"""

import httpx
import json
import logging
import os
import tempfile
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Optional, Dict, Any

logger = logging.getLogger(__name__)

# Cache configuration
CACHE_DIR = Path(__file__).parent.parent / "data"
FONTS_CACHE_FILE = CACHE_DIR / "google_fonts.json"
CACHE_MAX_AGE_HOURS = 24  # Refresh cache after 24 hours


class GoogleFont:
    """Represents a Google Font with metadata"""

    def __init__(
        self,
        family: str,
        category: str,
        variants: List[str],
        subsets: List[str],
        version: str = "",
        popularity: int = 0,
    ):
        self.family = family
        self.category = category  # serif, sans-serif, display, handwriting, monospace
        self.variants = variants  # regular, italic, 700, 700italic, etc.
        self.subsets = subsets  # latin, latin-ext, etc.
        self.version = version
        self.popularity = popularity

    def to_dict(self) -> dict:
        return {
            "family": self.family,
            "category": self.category,
            "variants": self.variants,
            "subsets": self.subsets,
            "version": self.version,
            "popularity": self.popularity,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "GoogleFont":
        return cls(
            family=data["family"],
            category=data["category"],
            variants=data.get("variants", []),
            subsets=data.get("subsets", []),
            version=data.get("version", ""),
            popularity=data.get("popularity", 0),
        )

    def get_weights(self) -> List[str]:
        """Extract numeric weights from variants"""
        weights = set()
        for v in self.variants:
            # Extract numeric part
            num = ''.join(c for c in v if c.isdigit())
            if num:
                weights.add(num)
            elif v == 'regular' or v == 'italic':
                weights.add('400')
        return sorted(list(weights))


async def fetch_google_fonts(api_key: Optional[str] = None) -> List[GoogleFont]:
    """
    Fetch fonts from Google Fonts API.

    Falls back to curated list if no API key is available.
    """
    # Try to use Google Fonts API
    api_key = api_key or os.getenv("GOOGLE_FONTS_API_KEY")

    if api_key:
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    "https://www.googleapis.com/webfonts/v1/webfonts",
                    params={"key": api_key, "sort": "popularity"},
                    timeout=10.0,
                )
                response.raise_for_status()
                data = response.json()

                fonts = []
                for i, item in enumerate(data.get("items", [])):
                    fonts.append(GoogleFont(
                        family=item["family"],
                        category=item["category"],
                        variants=item.get("variants", []),
                        subsets=item.get("subsets", []),
                        version=item.get("version", ""),
                        popularity=len(data["items"]) - i,  # Higher = more popular
                    ))

                logger.info(f"Fetched {len(fonts)} fonts from Google Fonts API")
                return fonts

        except Exception as e:
            logger.warning(f"Failed to fetch from Google Fonts API: {e}, using fallback")

    # Fallback to curated list
    return get_fallback_fonts()


def get_fallback_fonts() -> List[GoogleFont]:
    """Return a curated list of popular fonts"""
    # Curated list of top fonts for app design
    fonts_data = [
        # Sans-serif (best for UI)
        {"family": "Inter", "category": "sans-serif", "variants": ["300", "400", "500", "600", "700"], "popularity": 100},
        {"family": "Roboto", "category": "sans-serif", "variants": ["300", "400", "500", "700"], "popularity": 99},
        {"family": "Open Sans", "category": "sans-serif", "variants": ["300", "400", "600", "700"], "popularity": 98},
        {"family": "Poppins", "category": "sans-serif", "variants": ["300", "400", "500", "600", "700"], "popularity": 97},
        {"family": "Montserrat", "category": "sans-serif", "variants": ["300", "400", "500", "600", "700"], "popularity": 96},
        {"family": "Lato", "category": "sans-serif", "variants": ["300", "400", "700"], "popularity": 95},
        {"family": "Nunito", "category": "sans-serif", "variants": ["300", "400", "600", "700"], "popularity": 94},
        {"family": "Work Sans", "category": "sans-serif", "variants": ["300", "400", "500", "600", "700"], "popularity": 93},
        {"family": "DM Sans", "category": "sans-serif", "variants": ["400", "500", "700"], "popularity": 92},
        {"family": "Plus Jakarta Sans", "category": "sans-serif", "variants": ["300", "400", "500", "600", "700"], "popularity": 91},
        {"family": "Manrope", "category": "sans-serif", "variants": ["300", "400", "500", "600", "700"], "popularity": 90},
        {"family": "Space Grotesk", "category": "sans-serif", "variants": ["300", "400", "500", "600", "700"], "popularity": 89},

        # Serif (for headings/branding)
        {"family": "Playfair Display", "category": "serif", "variants": ["400", "500", "600", "700"], "popularity": 85},
        {"family": "Merriweather", "category": "serif", "variants": ["300", "400", "700"], "popularity": 84},
        {"family": "Lora", "category": "serif", "variants": ["400", "500", "600", "700"], "popularity": 83},
        {"family": "Crimson Pro", "category": "serif", "variants": ["300", "400", "500", "600", "700"], "popularity": 82},
        {"family": "Source Serif Pro", "category": "serif", "variants": ["300", "400", "600", "700"], "popularity": 81},

        # Display (for unique branding)
        {"family": "Sora", "category": "sans-serif", "variants": ["300", "400", "500", "600", "700"], "popularity": 80},
        {"family": "Outfit", "category": "sans-serif", "variants": ["300", "400", "500", "600", "700"], "popularity": 79},
        {"family": "Lexend", "category": "sans-serif", "variants": ["300", "400", "500", "600", "700"], "popularity": 78},

        # Monospace (for code/data)
        {"family": "JetBrains Mono", "category": "monospace", "variants": ["300", "400", "500", "700"], "popularity": 75},
        {"family": "Fira Code", "category": "monospace", "variants": ["300", "400", "500", "700"], "popularity": 74},
        {"family": "Source Code Pro", "category": "monospace", "variants": ["300", "400", "500", "700"], "popularity": 73},
    ]

    return [GoogleFont.from_dict({**f, "subsets": ["latin", "latin-ext"]}) for f in fonts_data]


def load_cached_fonts() -> Optional[List[GoogleFont]]:
    """Load fonts from cache"""
    if not FONTS_CACHE_FILE.exists():
        return None

    try:
        with open(FONTS_CACHE_FILE, 'r') as f:
            cache = json.load(f)

        cached_at = datetime.fromisoformat(cache.get('cached_at', '2000-01-01'))
        if datetime.now() - cached_at > timedelta(hours=CACHE_MAX_AGE_HOURS):
            logger.info("Font cache expired")
            return None

        fonts = [GoogleFont.from_dict(f) for f in cache.get('fonts', [])]
        logger.info(f"Loaded {len(fonts)} fonts from cache")
        return fonts

    except Exception as e:
        logger.error(f"Error loading font cache: {e}")
        return None


def save_fonts_to_cache(fonts: List[GoogleFont]):
    """Save fonts to cache using atomic write"""
    try:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)

        cache = {
            'cached_at': datetime.now().isoformat(),
            'fonts': [f.to_dict() for f in fonts],
        }

        # Atomic write: write to temp file, then rename
        with tempfile.NamedTemporaryFile('w', dir=CACHE_DIR, delete=False, suffix='.tmp') as f:
            json.dump(cache, f, indent=2)
            temp_path = f.name

        os.replace(temp_path, FONTS_CACHE_FILE)  # Atomic on most systems
        logger.info(f"Saved {len(fonts)} fonts to cache")

    except Exception as e:
        logger.error(f"Error saving font cache: {e}")


async def get_google_fonts(force_refresh: bool = False) -> List[GoogleFont]:
    """
    Get Google Fonts with caching.

    Args:
        force_refresh: Force fetching fresh data

    Returns:
        List of GoogleFont objects
    """
    import asyncio

    if not force_refresh:
        cached = await asyncio.to_thread(load_cached_fonts)  # Non-blocking
        if cached:
            return cached

    fonts = await fetch_google_fonts()
    if fonts:
        await asyncio.to_thread(save_fonts_to_cache, fonts)  # Non-blocking

    return fonts


def select_fonts_for_category(
    fonts: List[GoogleFont],
    category: Optional[str] = None,
    max_fonts: int = 20,
) -> List[GoogleFont]:
    """
    Select fonts appropriate for an app category.

    Args:
        fonts: Available fonts
        category: App Store category
        max_fonts: Maximum fonts to return

    Returns:
        Filtered and sorted fonts
    """
    # Category to font style preferences
    style_prefs: Dict[str, List[str]] = {
        'Finance': ['sans-serif'],
        'Business': ['sans-serif'],
        'Productivity': ['sans-serif'],
        'Health & Fitness': ['sans-serif'],
        'Medical': ['sans-serif'],
        'Entertainment': ['sans-serif', 'display'],
        'Games': ['display', 'sans-serif'],
        'Education': ['sans-serif', 'serif'],
        'Books': ['serif', 'sans-serif'],
        'Shopping': ['sans-serif'],
        'Food & Drink': ['sans-serif', 'display'],
        'Travel': ['sans-serif', 'display'],
        'Social Networking': ['sans-serif'],
        'Developer Tools': ['monospace', 'sans-serif'],
    }

    preferred_categories = style_prefs.get(category, ['sans-serif'])

    # Score fonts by preference
    def score_font(font: GoogleFont) -> int:
        score = font.popularity
        if font.category in preferred_categories:
            score += 50 * (len(preferred_categories) - preferred_categories.index(font.category))
        return score

    sorted_fonts = sorted(fonts, key=score_font, reverse=True)
    return sorted_fonts[:max_fonts]


def generate_google_fonts_url(fonts: List[str], weights: List[str] = None) -> str:
    """
    Generate a Google Fonts embed URL.

    Args:
        fonts: List of font family names
        weights: List of weights to include (default: 400, 500, 600, 700)

    Returns:
        Google Fonts CSS URL
    """
    if not fonts:
        return ""

    weights = weights or ["400", "500", "600", "700"]
    weights_str = ";".join([f"wght@{w}" for w in weights])

    # Format: family=Font+Name:wght@400;500;600;700
    families = [f"family={f.replace(' ', '+')}:{weights_str}" for f in fonts]

    return f"https://fonts.googleapis.com/css2?{'&'.join(families)}&display=swap"
