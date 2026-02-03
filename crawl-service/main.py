"""
Crawl Service - Web Scraping with Browser Automation

FastAPI service providing crawling capabilities for:
- App Store reviews via iTunes RSS API (fast, limited to ~1000)
- App Store reviews via Browser automation (slower, unlimited)
- Reddit discussions via Reddit JSON API
- Competitor websites via httpx/BeautifulSoup
"""

import asyncio
import hashlib
import logging
import os
import re
import time
import uuid
from collections import defaultdict
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator
from pydantic_settings import BaseSettings
import ipaddress
from urllib.parse import urlparse
from starlette.middleware.base import BaseHTTPMiddleware

# Load environment variables
load_dotenv()

# Crawlers
from crawlers.app_store import AppStoreCrawler
from crawlers.app_store_browser import AppStoreBrowserCrawler
from crawlers.reddit import RedditCrawler
from crawlers.websites import WebsiteCrawler
from crawlers.coolors import (
    get_trending_palettes,
    select_palette_for_app,
    format_palettes_for_prompt,
)
from crawlers.google_fonts import (
    get_google_fonts,
    select_fonts_for_category,
    generate_google_fonts_url,
)
from crawlers.fontpair import (
    get_font_pairings,
    select_pairings_for_style,
)
from crawlers.uicolors import (
    generate_color_system,
    generate_complementary_colors,
    format_color_system_for_prompt,
)

# Configure logging
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


# ============================================================================
# Configuration
# ============================================================================

class Settings(BaseSettings):
    """Application settings from environment variables."""
    crawl_service_api_key: str = ""

    class Config:
        env_file = ".env"


settings = Settings()

# Service start time for uptime tracking
start_time = time.time()


# ============================================================================
# Rate Limiting
# ============================================================================

class RateLimiter:
    """Simple in-memory rate limiter using sliding window with thread-safe access."""

    def __init__(self, requests_per_minute: int = 30, burst_limit: int = 10):
        self.requests_per_minute = requests_per_minute
        self.burst_limit = burst_limit
        self.window_size = 60  # 1 minute window
        self.requests: dict[str, list[float]] = defaultdict(list)
        self._lock = asyncio.Lock()

    def _clean_old_requests(self, client_id: str, current_time: float) -> None:
        """Remove requests older than the window."""
        cutoff = current_time - self.window_size
        self.requests[client_id] = [
            t for t in self.requests[client_id] if t > cutoff
        ]

    async def is_allowed(self, client_id: str) -> tuple[bool, int]:
        """Check if request is allowed. Returns (allowed, retry_after_seconds)."""
        async with self._lock:
            current_time = time.time()
            self._clean_old_requests(client_id, current_time)

            recent_requests = self.requests[client_id]

            # Check burst limit (requests in last 5 seconds)
            burst_window = current_time - 5
            burst_count = sum(1 for t in recent_requests if t > burst_window)
            if burst_count >= self.burst_limit:
                return False, 5

            # Check rate limit
            if len(recent_requests) >= self.requests_per_minute:
                oldest = min(recent_requests) if recent_requests else current_time
                retry_after = int(oldest + self.window_size - current_time) + 1
                return False, max(1, retry_after)

            self.requests[client_id].append(current_time)
            return True, 0


# Global rate limiter instance
rate_limiter = RateLimiter(
    requests_per_minute=int(os.getenv("RATE_LIMIT_PER_MINUTE", "30")),
    burst_limit=int(os.getenv("RATE_LIMIT_BURST", "10")),
)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Middleware to apply rate limiting to all requests."""

    async def dispatch(self, request: Request, call_next):
        # Skip rate limiting for health checks
        if request.url.path == "/health" or request.url.path == "/":
            return await call_next(request)

        # Use client IP as identifier (or X-Forwarded-For if behind proxy)
        client_ip = request.headers.get("X-Forwarded-For", request.client.host if request.client else "unknown")
        # Take first IP if multiple are present
        client_ip = client_ip.split(",")[0].strip()

        allowed, retry_after = await rate_limiter.is_allowed(client_ip)

        if not allowed:
            return JSONResponse(
                status_code=429,
                content={
                    "error": "Rate limit exceeded",
                    "retry_after": retry_after,
                    "message": f"Too many requests. Please retry after {retry_after} seconds.",
                },
                headers={"Retry-After": str(retry_after)},
            )

        return await call_next(request)


# ============================================================================
# Request/Response Models
# ============================================================================

class AppStoreReviewRequest(BaseModel):
    app_id: str
    country: str = "us"
    max_reviews: int = Field(default=1000, ge=1, le=10000)
    min_rating: Optional[int] = None
    max_rating: Optional[int] = None
    use_browser: bool = False  # Use browser automation for multi-country scraping
    multi_country: bool = True  # When using browser, scrape from multiple country stores


class RedditCrawlRequest(BaseModel):
    keywords: list[str] = Field(max_length=10)
    subreddits: Optional[list[str]] = Field(default=None, max_length=20)
    max_posts: int = 50
    max_comments_per_post: int = 20
    time_filter: str = "year"
    sort: str = "relevance"


def _is_internal_ip(host: str) -> bool:
    """Check if a host resolves to an internal/private IP address."""
    try:
        # Try parsing as IP address directly
        ip = ipaddress.ip_address(host)
        return (
            ip.is_private
            or ip.is_loopback
            or ip.is_reserved
            or ip.is_link_local
            or ip.is_multicast
        )
    except ValueError:
        # Not an IP address, check common internal hostnames
        internal_hostnames = ['localhost', 'localhost.localdomain', '127.0.0.1', '::1']
        return host.lower() in internal_hostnames


class WebsiteCrawlRequest(BaseModel):
    url: str
    max_pages: int = 10
    include_subpages: bool = True
    extract_pricing: bool = True
    extract_features: bool = True

    @field_validator('url')
    @classmethod
    def validate_url(cls, v: str) -> str:
        """Validate URL scheme and block internal IPs for SSRF prevention."""
        parsed = urlparse(v)

        # Validate scheme
        if parsed.scheme not in ('http', 'https'):
            raise ValueError('URL must use http or https scheme')

        # Extract hostname
        host = parsed.hostname
        if not host:
            raise ValueError('URL must have a valid hostname')

        # Block internal IPs
        if _is_internal_ip(host):
            raise ValueError('URLs pointing to internal/private IP addresses are not allowed')

        # Block common internal IP patterns
        internal_patterns = [
            '10.', '192.168.', '172.16.', '172.17.', '172.18.', '172.19.',
            '172.20.', '172.21.', '172.22.', '172.23.', '172.24.', '172.25.',
            '172.26.', '172.27.', '172.28.', '172.29.', '172.30.', '172.31.',
            '169.254.', '0.', '127.',
        ]
        for pattern in internal_patterns:
            if host.startswith(pattern):
                raise ValueError('URLs pointing to internal/private IP addresses are not allowed')

        return v


class ColorPaletteRequest(BaseModel):
    category: Optional[str] = None  # App Store category for palette selection
    mood: Optional[str] = None  # Explicit mood: professional, playful, calm, bold, warm, cool
    max_palettes: int = 5
    force_refresh: bool = False  # Force fresh crawl from Coolors


class FontsRequest(BaseModel):
    category: Optional[str] = None  # App Store category for font selection
    max_fonts: int = 20
    force_refresh: bool = False


class FontPairsRequest(BaseModel):
    category: Optional[str] = None  # App Store category
    style: Optional[str] = None  # modern, professional, editorial, friendly, technical, bold
    max_pairings: int = 10
    force_refresh: bool = False


class ColorSpectrumRequest(BaseModel):
    primary_hex: str  # Primary color hex (with or without #)
    include_complementary: bool = False


class RedditDeepDiveRequest(BaseModel):
    """Request model for Reddit deep dive crawling."""
    search_topics: list[str] = Field(max_length=10)
    subreddits: list[str] = Field(max_length=20)
    time_filter: str = "month"  # week, month, year
    max_posts_per_combo: int = Field(default=50, ge=1, le=100)
    max_comments_per_post: int = 30
    validate_subreddits: bool = True  # Whether to validate subreddits before crawling
    use_adaptive_thresholds: bool = True  # Use community-size-based engagement thresholds


class RedditDeepDiveResponse(BaseModel):
    """Response model for Reddit deep dive crawling."""
    posts: list[dict]
    stats: dict
    validation: Optional[dict] = None  # Subreddit validation results
    success: bool
    error: Optional[str] = None


class SubredditValidateRequest(BaseModel):
    """Request model for subreddit validation."""
    subreddits: list[str]


class SubredditValidateResponse(BaseModel):
    """Response model for subreddit validation."""
    valid: list[dict]  # List of SubredditInfo dicts
    invalid: list[str]  # List of invalid/nonexistent subreddit names
    discovered: list[str]  # Related subreddits discovered


class HealthResponse(BaseModel):
    status: str
    uptime_seconds: float
    version: str


# ============================================================================
# Lifespan
# ============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize and cleanup resources."""
    logger.info("Starting Crawl service...")
    logger.info("Crawl service ready")
    yield
    logger.info("Shutting down Crawl service...")


# ============================================================================
# FastAPI App
# ============================================================================

app = FastAPI(
    title="Crawl Service",
    description="Web scraping service with browser automation for unlimited App Store reviews",
    version="3.0.0",
    lifespan=lifespan,
)

# CORS middleware - restrict origins for security
# When using allow_credentials=True, we cannot use wildcard origins
allowed_origins = os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

# Rate limiting middleware - protect against DoS attacks
app.add_middleware(RateLimitMiddleware)


# ============================================================================
# Health Check
# ============================================================================

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    return HealthResponse(
        status="healthy",
        uptime_seconds=time.time() - start_time,
        version="3.0.0",
    )


# ============================================================================
# App Store Endpoints
# ============================================================================

@app.post("/crawl/app-store/reviews")
async def crawl_app_store_reviews(request: AppStoreReviewRequest):
    """
    Crawl App Store reviews for an app.

    Automatically combines RSS API + browser multi-country scraping for maximum coverage.

    Note: iTunes RSS API is limited to ~500 reviews per country. Browser scraping
    is required for apps with more reviews, but Apple's page structure changes frequently.
    """
    logger.info(f"Crawling reviews for app {request.app_id} - target: {request.max_reviews}")

    all_reviews = {}

    try:
        # Step 1: RSS API - fast, but limited to ~500 reviews per country
        logger.info("Phase 1: RSS API scraping (limited to ~500 reviews per country)...")
        try:
            async with AppStoreCrawler() as crawler:
                # Timeout RSS phase after 90 seconds
                rss_reviews = await asyncio.wait_for(
                    crawler.crawl_reviews(
                        app_id=request.app_id,
                        country=request.country,
                        max_reviews=min(request.max_reviews, 2000),
                        min_rating=request.min_rating,
                        max_rating=request.max_rating,
                    ),
                    timeout=90.0  # 1.5 minute max for RSS phase
                )
        except asyncio.TimeoutError:
            logger.warning("RSS API scraping timed out after 90 seconds")
            rss_reviews = []

        # Add RSS reviews to collection using deterministic hash (not Python's randomized hash())
        for review in rss_reviews:
            content_key = f"{review.get('author', '')}:{review.get('content', '')[:100]}"
            review_id = hashlib.sha256(content_key.encode()).hexdigest()[:16]
            review['source'] = 'rss_api'
            all_reviews[review_id] = review

        logger.info(f"RSS API Phase Complete: collected {len(all_reviews)} reviews")

        # Step 2: Browser multi-country - ALWAYS try if we need more reviews
        if len(all_reviews) < request.max_reviews:
            remaining = request.max_reviews - len(all_reviews)
            logger.info(f"Phase 2: Browser scraping for {remaining} more reviews (RSS API has fundamental limits)...")

            try:
                async with AppStoreBrowserCrawler(headless=True) as crawler:
                    # Timeout browser scraping after 5 minutes
                    browser_reviews = await asyncio.wait_for(
                        crawler.crawl_reviews(
                            app_id=request.app_id,
                            country=request.country,
                            max_reviews=remaining,
                            min_rating=request.min_rating,
                            max_rating=request.max_rating,
                            multi_country=request.multi_country,
                        ),
                        timeout=300.0  # 5 minutes max for browser phase
                    )
                    logger.info(f"Browser scraping returned {len(browser_reviews)} reviews")
            except asyncio.TimeoutError:
                logger.warning(f"Browser scraping timed out after 5 minutes, proceeding with {len(all_reviews)} reviews from RSS")
                browser_reviews = []
            except Exception as e:
                logger.error(f"Browser scraping error: {e}")
                browser_reviews = []

            # Add browser reviews, deduplicating by content using deterministic hash
            new_from_browser = 0
            for review in browser_reviews:
                content_key = f"{review.get('author', '')}:{review.get('content', '')[:100]}"
                review_id = hashlib.sha256(content_key.encode()).hexdigest()[:16]
                if review_id not in all_reviews:
                    review['source'] = 'browser'
                    all_reviews[review_id] = review
                    new_from_browser += 1

            logger.info(f"Browser Phase Complete: added {new_from_browser} unique reviews (total: {len(all_reviews)})")
        else:
            logger.info("Skipping browser phase - RSS API met target")

        reviews = list(all_reviews.values())[:request.max_reviews]

        # Calculate stats
        rss_count = len([r for r in reviews if r.get('source') == 'rss_api'])
        browser_count = len([r for r in reviews if r.get('source') == 'browser'])

        if reviews:
            ratings = [r["rating"] for r in reviews if r.get("rating")]
            if ratings:
                stats = {
                    "total": len(reviews),
                    "average_rating": round(sum(ratings) / len(ratings), 2),
                    "rating_distribution": {
                        str(i): len([r for r in ratings if r == i])
                        for i in range(1, 6)
                    },
                    "sources": {
                        "rss_api": rss_count,
                        "browser_multi_country": browser_count,
                    },
                }
            else:
                stats = {"total": len(reviews), "average_rating": 0, "rating_distribution": {}, "sources": {"rss_api": rss_count, "browser_multi_country": browser_count}}
        else:
            stats = {"total": 0, "average_rating": 0, "rating_distribution": {}, "sources": {"rss_api": 0, "browser_multi_country": 0}}

        return {
            "app_id": request.app_id,
            "country": request.country,
            "reviews": reviews,
            "stats": stats,
        }
    except Exception as e:
        logger.exception(f"Error crawling reviews for {request.app_id}")
        raise HTTPException(status_code=500, detail=f"Failed to crawl reviews: {str(e)}")


@app.post("/crawl/app-store/whats-new")
async def crawl_app_store_whats_new(app_id: str, country: str = "us"):
    """Get version history for an app."""
    logger.info(f"Crawling What's New for app {app_id}")

    try:
        async with AppStoreCrawler() as crawler:
            versions = await crawler.crawl_whats_new(
                app_id=app_id,
                country=country,
            )

        return {
            "app_id": app_id,
            "country": country,
            "versions": versions,
        }
    except Exception as e:
        logger.exception(f"Error crawling What's New for {app_id}")
        raise HTTPException(status_code=500, detail=f"Failed to crawl What's New: {str(e)}")


@app.post("/crawl/app-store/privacy")
async def crawl_app_store_privacy(app_id: str, country: str = "us"):
    """Get privacy labels for an app."""
    logger.info(f"Crawling privacy labels for app {app_id}")

    try:
        async with AppStoreCrawler() as crawler:
            labels = await crawler.crawl_privacy_labels(
                app_id=app_id,
                country=country,
            )

        return {
            "app_id": app_id,
            "country": country,
            "privacy_labels": labels,
        }
    except Exception as e:
        logger.exception(f"Error crawling privacy labels for {app_id}")
        raise HTTPException(status_code=500, detail=f"Failed to crawl privacy labels: {str(e)}")


# ============================================================================
# Reddit Endpoints
# ============================================================================

@app.post("/crawl/reddit")
async def crawl_reddit(request: RedditCrawlRequest):
    """Crawl Reddit discussions matching keywords."""
    logger.info(f"Crawling Reddit for keywords: {request.keywords}")

    try:
        async with RedditCrawler() as crawler:
            result = await crawler.crawl_discussions(
                keywords=request.keywords,
                subreddits=request.subreddits,
                max_posts=request.max_posts,
                max_comments_per_post=request.max_comments_per_post,
                time_filter=request.time_filter,
                sort=request.sort,
            )

        return result
    except Exception as e:
        logger.exception(f"Error crawling Reddit for {request.keywords}")
        raise HTTPException(status_code=500, detail=f"Failed to crawl Reddit: {str(e)}")


@app.post("/crawl/reddit/deep-dive", response_model=RedditDeepDiveResponse)
async def crawl_reddit_deep_dive(request: RedditDeepDiveRequest):
    """
    Deep dive Reddit scraping for semantic analysis.

    Searches each topic in each subreddit, fetches comments on high-engagement posts.
    Returns structured data for AI analysis.

    Features:
    - Subreddit validation (checks if subreddits exist and are public)
    - Adaptive engagement thresholds based on community size
    - Nested comment threading (up to 3 levels deep)
    - Related subreddit discovery
    """
    logger.info(
        f"Deep dive crawling Reddit - topics: {request.search_topics}, "
        f"subreddits: {request.subreddits}, time_filter: {request.time_filter}, "
        f"validate: {request.validate_subreddits}, adaptive: {request.use_adaptive_thresholds}"
    )

    try:
        async with RedditCrawler() as crawler:
            result = await crawler.crawl_deep_dive(
                search_topics=request.search_topics,
                subreddits=request.subreddits,
                time_filter=request.time_filter,
                max_posts_per_combo=request.max_posts_per_combo,
                max_comments_per_post=request.max_comments_per_post,
                validate_subreddits=request.validate_subreddits,
                use_adaptive_thresholds=request.use_adaptive_thresholds,
            )

        return RedditDeepDiveResponse(
            posts=result["posts"],
            stats=result["stats"],
            validation=result.get("validation"),
            success=True,
            error=None,
        )
    except Exception as e:
        logger.exception(
            f"Error in Reddit deep dive for topics {request.search_topics}"
        )
        return RedditDeepDiveResponse(
            posts=[],
            stats={},
            validation=None,
            success=False,
            error=str(e),
        )


@app.post("/crawl/reddit/validate-subreddits", response_model=SubredditValidateResponse)
async def validate_subreddits(request: SubredditValidateRequest):
    """
    Validate subreddits and discover related communities.

    Checks if subreddits exist, are public, and returns community info.
    Also discovers related subreddits from sidebars and wikis.
    """
    logger.info(f"Validating subreddits: {request.subreddits}")

    try:
        async with RedditCrawler() as crawler:
            result = await crawler.validate_subreddits(request.subreddits)

        return SubredditValidateResponse(
            valid=result["valid"],
            invalid=result["invalid"],
            discovered=result["discovered"],
        )
    except Exception as e:
        logger.exception(f"Error validating subreddits: {request.subreddits}")
        raise HTTPException(status_code=500, detail=f"Failed to validate subreddits: {str(e)}")


# ============================================================================
# Website Endpoints
# ============================================================================

@app.post("/crawl/website")
async def crawl_website(request: WebsiteCrawlRequest):
    """Crawl a competitor website."""
    logger.info(f"Crawling website: {request.url}")

    try:
        async with WebsiteCrawler() as crawler:
            result = await crawler.crawl_website(
                url=request.url,
                max_pages=request.max_pages,
                include_subpages=request.include_subpages,
                extract_pricing=request.extract_pricing,
                extract_features=request.extract_features,
            )

        return result
    except Exception as e:
        logger.exception(f"Error crawling website {request.url}")
        raise HTTPException(status_code=500, detail=f"Failed to crawl website: {str(e)}")


# ============================================================================
# Color Palette Endpoints
# ============================================================================

@app.post("/crawl/palettes")
async def crawl_color_palettes(request: ColorPaletteRequest):
    """
    Get curated color palettes from Coolors.co trending.

    Palettes are cached for 24 hours. Use force_refresh=true to fetch fresh data.
    Provide category or mood to get palettes matched to your app context.
    """
    logger.info(f"Fetching color palettes (category={request.category}, mood={request.mood})")

    try:
        # Get trending palettes (from cache or fresh crawl)
        all_palettes = await get_trending_palettes(
            force_refresh=request.force_refresh,
            max_palettes=50,
        )

        if not all_palettes:
            return {
                "palettes": [],
                "prompt_text": "",
                "message": "No palettes available. Try force_refresh=true.",
            }

        # Select best palettes for the app context
        selected = select_palette_for_app(
            palettes=all_palettes,
            category=request.category,
            mood_hint=request.mood,
            top_n=request.max_palettes,
        )

        # Format for prompt inclusion
        prompt_text = format_palettes_for_prompt(selected, max_palettes=request.max_palettes)

        return {
            "palettes": [p.to_dict() for p in selected],
            "prompt_text": prompt_text,
            "total_cached": len(all_palettes),
            "category": request.category,
            "mood": request.mood,
        }

    except Exception as e:
        logger.exception(f"Error fetching color palettes")
        raise HTTPException(status_code=500, detail=f"Failed to fetch palettes: {str(e)}")


@app.get("/crawl/palettes/refresh")
async def refresh_color_palettes():
    """Force refresh the palette cache from Coolors.co"""
    logger.info("Force refreshing palette cache...")

    try:
        palettes = await get_trending_palettes(force_refresh=True, max_palettes=50)
        return {
            "message": f"Refreshed {len(palettes)} palettes from Coolors",
            "palettes_count": len(palettes),
        }
    except Exception as e:
        logger.exception("Error refreshing palettes")
        raise HTTPException(status_code=500, detail=f"Failed to refresh palettes: {str(e)}")


# ============================================================================
# Font Endpoints
# ============================================================================

@app.post("/crawl/fonts")
async def get_fonts(request: FontsRequest):
    """
    Get curated Google Fonts for app design.

    Returns fonts filtered by app category with Google Fonts embed URL.
    """
    logger.info(f"Fetching fonts (category={request.category})")

    try:
        all_fonts = await get_google_fonts(force_refresh=request.force_refresh)

        if not all_fonts:
            return {
                "fonts": [],
                "google_fonts_url": "",
                "message": "No fonts available",
            }

        selected = select_fonts_for_category(
            fonts=all_fonts,
            category=request.category,
            max_fonts=request.max_fonts,
        )

        # Generate Google Fonts URL for top fonts
        top_fonts = [f.family for f in selected[:6]]
        fonts_url = generate_google_fonts_url(top_fonts)

        return {
            "fonts": [f.to_dict() for f in selected],
            "google_fonts_url": fonts_url,
            "total_available": len(all_fonts),
            "category": request.category,
        }

    except Exception as e:
        logger.exception("Error fetching fonts")
        raise HTTPException(status_code=500, detail=f"Failed to fetch fonts: {str(e)}")


@app.post("/crawl/font-pairs")
async def get_font_pairs(request: FontPairsRequest):
    """
    Get curated font pairing suggestions.

    Returns heading + body font combinations matched to app style.
    """
    logger.info(f"Fetching font pairings (category={request.category}, style={request.style})")

    try:
        all_pairings = await get_font_pairings(force_refresh=request.force_refresh)

        if not all_pairings:
            return {
                "pairings": [],
                "message": "No pairings available",
            }

        selected = select_pairings_for_style(
            pairings=all_pairings,
            style=request.style,
            category=request.category,
            max_pairings=request.max_pairings,
        )

        return {
            "pairings": [p.to_dict() for p in selected],
            "total_available": len(all_pairings),
            "category": request.category,
            "style": request.style,
        }

    except Exception as e:
        logger.exception("Error fetching font pairings")
        raise HTTPException(status_code=500, detail=f"Failed to fetch font pairings: {str(e)}")


@app.post("/crawl/color-spectrum")
async def generate_spectrum(request: ColorSpectrumRequest):
    """
    Generate a color shade spectrum from a primary color.

    Returns Tailwind-style shades (50-950) plus semantic colors.
    """
    logger.info(f"Generating color spectrum for {request.primary_hex}")

    try:
        # Validate hex color format (must be 6 valid hex characters)
        hex_color = request.primary_hex.lstrip('#')
        if not re.match(r'^[0-9A-Fa-f]{6}$', hex_color):
            raise HTTPException(status_code=400, detail="Invalid hex color. Must be 6 hex characters (0-9, A-F)")

        color_system = generate_color_system(hex_color)

        if request.include_complementary:
            color_system["complementary"] = generate_complementary_colors(hex_color)

        prompt_text = format_color_system_for_prompt(color_system)

        return {
            "color_system": color_system,
            "prompt_text": prompt_text,
            "primary_hex": f"#{hex_color.upper()}",
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error generating color spectrum")
        raise HTTPException(status_code=500, detail=f"Failed to generate spectrum: {str(e)}")


# ============================================================================
# Root
# ============================================================================

@app.get("/")
async def root():
    """Root endpoint with service info."""
    return {
        "service": "Crawl Service",
        "version": "3.0.0",
        "status": "running",
        "features": {
            "browser_scraping": "Set use_browser=true for unlimited App Store reviews",
            "rss_api": "Default fast mode, limited to ~1000 reviews",
        },
        "endpoints": [
            "/health",
            "/crawl/app-store/reviews",
            "/crawl/app-store/whats-new",
            "/crawl/app-store/privacy",
            "/crawl/reddit",
            "/crawl/reddit/deep-dive",
            "/crawl/reddit/validate-subreddits",
            "/crawl/website",
            "/crawl/palettes",
            "/crawl/palettes/refresh",
            "/crawl/fonts",
            "/crawl/font-pairs",
            "/crawl/color-spectrum",
        ],
    }
