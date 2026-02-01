"""
Crawl Service - Web Scraping with Browser Automation

FastAPI service providing crawling capabilities for:
- App Store reviews via iTunes RSS API (fast, limited to ~1000)
- App Store reviews via Browser automation (slower, unlimited)
- Reddit discussions via Reddit JSON API
- Competitor websites via httpx/BeautifulSoup
"""

import logging
import os
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pydantic_settings import BaseSettings

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
# Request/Response Models
# ============================================================================

class AppStoreReviewRequest(BaseModel):
    app_id: str
    country: str = "us"
    max_reviews: int = 1000
    min_rating: Optional[int] = None
    max_rating: Optional[int] = None
    use_browser: bool = False  # Use browser automation for multi-country scraping
    multi_country: bool = True  # When using browser, scrape from multiple country stores


class RedditCrawlRequest(BaseModel):
    keywords: list[str]
    subreddits: Optional[list[str]] = None
    max_posts: int = 50
    max_comments_per_post: int = 20
    time_filter: str = "year"
    sort: str = "relevance"


class WebsiteCrawlRequest(BaseModel):
    url: str
    max_pages: int = 10
    include_subpages: bool = True
    extract_pricing: bool = True
    extract_features: bool = True


class ColorPaletteRequest(BaseModel):
    category: Optional[str] = None  # App Store category for palette selection
    mood: Optional[str] = None  # Explicit mood: professional, playful, calm, bold, warm, cool
    max_palettes: int = 5
    force_refresh: bool = False  # Force fresh crawl from Coolors


class RedditDeepDiveRequest(BaseModel):
    """Request model for Reddit deep dive crawling."""
    search_topics: list[str]
    subreddits: list[str]
    time_filter: str = "month"  # week, month, year
    max_posts_per_combo: int = 50
    max_comments_per_post: int = 30


class RedditDeepDiveResponse(BaseModel):
    """Response model for Reddit deep dive crawling."""
    posts: list[dict]
    stats: dict
    success: bool
    error: Optional[str] = None


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

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
    """
    logger.info(f"Crawling reviews for app {request.app_id} - target: {request.max_reviews}")

    all_reviews = {}

    try:
        # Step 1: RSS API - fast, gets ~1000 reviews from primary country
        logger.info("Phase 1: RSS API scraping...")
        async with AppStoreCrawler() as crawler:
            rss_reviews = await crawler.crawl_reviews(
                app_id=request.app_id,
                country=request.country,
                max_reviews=min(request.max_reviews, 2000),
                min_rating=request.min_rating,
                max_rating=request.max_rating,
            )

        # Add RSS reviews to collection
        for review in rss_reviews:
            content_hash = hash(review.get('content', '')[:100])
            review_id = f"{review.get('author', '')}_{content_hash}"
            review['source'] = 'rss_api'
            all_reviews[review_id] = review

        logger.info(f"RSS API: collected {len(all_reviews)} reviews")

        # Step 2: Browser multi-country - if we need more reviews
        if len(all_reviews) < request.max_reviews:
            remaining = request.max_reviews - len(all_reviews)
            logger.info(f"Phase 2: Browser multi-country scraping for {remaining} more reviews...")

            async with AppStoreBrowserCrawler(headless=True) as crawler:
                browser_reviews = await crawler.crawl_reviews(
                    app_id=request.app_id,
                    country=request.country,
                    max_reviews=remaining,
                    min_rating=request.min_rating,
                    max_rating=request.max_rating,
                    multi_country=True,
                )

            # Add browser reviews, deduplicating by content
            new_from_browser = 0
            for review in browser_reviews:
                content_hash = hash(review.get('content', '')[:100])
                review_id = f"{review.get('author', '')}_{content_hash}"
                if review_id not in all_reviews:
                    all_reviews[review_id] = review
                    new_from_browser += 1

            logger.info(f"Browser: added {new_from_browser} unique reviews (total: {len(all_reviews)})")

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
    """
    logger.info(
        f"Deep dive crawling Reddit - topics: {request.search_topics}, "
        f"subreddits: {request.subreddits}, time_filter: {request.time_filter}"
    )

    try:
        async with RedditCrawler() as crawler:
            result = await crawler.crawl_deep_dive(
                search_topics=request.search_topics,
                subreddits=request.subreddits,
                time_filter=request.time_filter,
                max_posts_per_combo=request.max_posts_per_combo,
                max_comments_per_post=request.max_comments_per_post,
            )

        return RedditDeepDiveResponse(
            posts=result["posts"],
            stats=result["stats"],
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
            success=False,
            error=str(e),
        )


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
            "/crawl/website",
            "/crawl/palettes",
            "/crawl/palettes/refresh",
        ],
    }
