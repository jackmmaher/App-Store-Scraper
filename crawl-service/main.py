"""
Crawl4AI Deep Integration Service

FastAPI service providing crawling capabilities for:
- App Store reviews (extended, thousands vs RSS 50-100)
- App Store What's New / version history
- App Store privacy labels
- Reddit discussions (web scraping, no API)
- Competitor websites

All data is used to enrich AI components in the App Store Scraper.
"""

import asyncio
import logging
import os
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Security, BackgroundTasks, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import APIKeyHeader
from pydantic_settings import BaseSettings
from sse_starlette.sse import EventSourceResponse

# Load environment variables
load_dotenv()

# Models
from models.schemas import (
    AppStoreReviewRequest,
    AppStoreReviewResponse,
    AppStoreWhatsNewRequest,
    AppStoreWhatsNewResponse,
    AppStorePrivacyRequest,
    AppStorePrivacyResponse,
    RedditCrawlRequest,
    RedditCrawlResponse,
    WebsiteCrawlRequest,
    WebsiteCrawlResponse,
    BatchCrawlRequest,
    BatchCrawlResponse,
    CrawlJob,
    CrawlJobStatus,
    CrawlType,
    HealthResponse,
)

# Crawlers
from crawlers.app_store import AppStoreCrawler
from crawlers.reddit import RedditCrawler
from crawlers.websites import WebsiteCrawler

# Utilities
from utils.rate_limiter import RateLimiter
from utils.cache import CacheManager

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

    # API Security
    crawl_service_api_key: str = ""

    # Supabase
    supabase_url: str = ""
    supabase_service_key: str = ""

    # Rate Limits
    crawl_max_concurrent: int = 5
    crawl_requests_per_minute: int = 30
    crawl_cache_ttl_hours: int = 24

    # Crawl4AI
    crawl4ai_headless: bool = True

    class Config:
        env_file = ".env"


settings = Settings()


# ============================================================================
# Globals
# ============================================================================

# Service start time for uptime tracking
start_time = time.time()

# In-memory job storage (for async job tracking)
jobs: dict[str, CrawlJob] = {}

# Shared instances (initialized in lifespan)
rate_limiter: Optional[RateLimiter] = None
cache_manager: Optional[CacheManager] = None
app_store_crawler: Optional[AppStoreCrawler] = None
reddit_crawler: Optional[RedditCrawler] = None
website_crawler: Optional[WebsiteCrawler] = None


# ============================================================================
# Lifespan
# ============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize and cleanup resources."""
    global rate_limiter, cache_manager
    global app_store_crawler, reddit_crawler, website_crawler

    logger.info("Starting Crawl4AI service...")

    # Initialize rate limiter
    rate_limiter = RateLimiter(
        requests_per_minute=settings.crawl_requests_per_minute,
        max_concurrent=settings.crawl_max_concurrent,
        per_domain_rpm={
            "apps.apple.com": 20,
            "old.reddit.com": 15,
        },
    )

    # Initialize cache manager (with Supabase if configured)
    supabase_client = None
    if settings.supabase_url and settings.supabase_service_key:
        try:
            from supabase import create_client
            supabase_client = create_client(
                settings.supabase_url,
                settings.supabase_service_key,
            )
            logger.info("Connected to Supabase for caching")
        except Exception as e:
            logger.warning(f"Could not connect to Supabase: {e}")

    cache_manager = CacheManager(
        supabase_client=supabase_client,
        default_ttl_hours=settings.crawl_cache_ttl_hours,
    )

    # Initialize crawlers
    app_store_crawler = AppStoreCrawler(
        rate_limiter=rate_limiter,
        cache_manager=cache_manager,
        headless=settings.crawl4ai_headless,
    )

    reddit_crawler = RedditCrawler(
        rate_limiter=rate_limiter,
        cache_manager=cache_manager,
        headless=settings.crawl4ai_headless,
    )

    website_crawler = WebsiteCrawler(
        rate_limiter=rate_limiter,
        cache_manager=cache_manager,
        headless=settings.crawl4ai_headless,
    )

    logger.info("Crawl4AI service ready")

    yield

    # Cleanup
    logger.info("Shutting down Crawl4AI service...")


# ============================================================================
# FastAPI App
# ============================================================================

app = FastAPI(
    title="Crawl4AI Deep Integration Service",
    description="Crawl service for enriching App Store Scraper with extended data",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict to your Next.js domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# Security
# ============================================================================

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


async def verify_api_key(api_key: str = Security(api_key_header)):
    """Verify API key if configured."""
    if settings.crawl_service_api_key:
        if not api_key or api_key != settings.crawl_service_api_key:
            raise HTTPException(status_code=401, detail="Invalid or missing API key")
    return api_key


# ============================================================================
# Health Check
# ============================================================================

@app.get("/health", response_model=HealthResponse, tags=["Health"])
async def health_check():
    """Check service health."""
    return HealthResponse(
        status="healthy",
        version="1.0.0",
        crawl4ai_ready=app_store_crawler is not None,
        supabase_connected=cache_manager is not None and cache_manager.client is not None,
        uptime_seconds=time.time() - start_time,
    )


# ============================================================================
# App Store Endpoints
# ============================================================================

@app.post(
    "/crawl/app-store/reviews",
    response_model=AppStoreReviewResponse,
    tags=["App Store"],
    dependencies=[Security(verify_api_key)],
)
async def crawl_app_store_reviews(request: AppStoreReviewRequest):
    """
    Crawl extended reviews for an App Store app.

    Uses browser automation to scroll and load thousands of reviews,
    far exceeding the RSS limit of 50-100.
    """
    if not app_store_crawler:
        raise HTTPException(status_code=503, detail="Crawler not initialized")

    try:
        result = await app_store_crawler.crawl_reviews(
            app_id=request.app_id,
            country=request.country,
            max_reviews=request.max_reviews,
            min_rating=request.min_rating,
            max_rating=request.max_rating,
            force_refresh=request.force_refresh,
        )
        return result

    except Exception as e:
        logger.error(f"Error crawling reviews: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post(
    "/crawl/app-store/whats-new",
    response_model=AppStoreWhatsNewResponse,
    tags=["App Store"],
    dependencies=[Security(verify_api_key)],
)
async def crawl_app_store_whats_new(request: AppStoreWhatsNewRequest):
    """
    Crawl What's New / version history for an App Store app.
    """
    if not app_store_crawler:
        raise HTTPException(status_code=503, detail="Crawler not initialized")

    try:
        result = await app_store_crawler.crawl_whats_new(
            app_id=request.app_id,
            country=request.country,
            max_versions=request.max_versions,
            force_refresh=request.force_refresh,
        )
        return result

    except Exception as e:
        logger.error(f"Error crawling What's New: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post(
    "/crawl/app-store/privacy",
    response_model=AppStorePrivacyResponse,
    tags=["App Store"],
    dependencies=[Security(verify_api_key)],
)
async def crawl_app_store_privacy(request: AppStorePrivacyRequest):
    """
    Crawl privacy nutrition labels for an App Store app.
    """
    if not app_store_crawler:
        raise HTTPException(status_code=503, detail="Crawler not initialized")

    try:
        result = await app_store_crawler.crawl_privacy_labels(
            app_id=request.app_id,
            country=request.country,
            force_refresh=request.force_refresh,
        )
        return result

    except Exception as e:
        logger.error(f"Error crawling privacy labels: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Reddit Endpoints
# ============================================================================

@app.post(
    "/crawl/reddit",
    response_model=RedditCrawlResponse,
    tags=["Reddit"],
    dependencies=[Security(verify_api_key)],
)
async def crawl_reddit(request: RedditCrawlRequest):
    """
    Crawl Reddit discussions for keywords.

    Uses web scraping (no API registration needed) to find real user
    discussions about apps, features, and pain points.
    """
    if not reddit_crawler:
        raise HTTPException(status_code=503, detail="Crawler not initialized")

    try:
        result = await reddit_crawler.crawl_search(
            keywords=request.keywords,
            subreddits=request.subreddits,
            max_posts=request.max_posts,
            max_comments_per_post=request.max_comments_per_post,
            time_filter=request.time_filter,
            sort=request.sort,
            force_refresh=request.force_refresh,
        )
        return result

    except Exception as e:
        logger.error(f"Error crawling Reddit: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Website Endpoints
# ============================================================================

@app.post(
    "/crawl/website",
    response_model=WebsiteCrawlResponse,
    tags=["Website"],
    dependencies=[Security(verify_api_key)],
)
async def crawl_website(request: WebsiteCrawlRequest):
    """
    Crawl a competitor website.

    Extracts features, pricing, testimonials, and other relevant content.
    """
    if not website_crawler:
        raise HTTPException(status_code=503, detail="Crawler not initialized")

    try:
        result = await website_crawler.crawl_website(
            url=str(request.url),
            max_pages=request.max_pages,
            include_subpages=request.include_subpages,
            extract_pricing=request.extract_pricing,
            extract_features=request.extract_features,
            force_refresh=request.force_refresh,
        )
        return result

    except Exception as e:
        logger.error(f"Error crawling website: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Batch & Async Job Endpoints
# ============================================================================

@app.post(
    "/crawl/batch",
    response_model=BatchCrawlResponse,
    tags=["Batch"],
    dependencies=[Security(verify_api_key)],
)
async def start_batch_crawl(
    request: BatchCrawlRequest,
    background_tasks: BackgroundTasks,
):
    """
    Start a batch crawl job.

    Returns immediately with a job ID. Use /job/{id} to check status.
    """
    job_id = str(uuid.uuid4())

    # Count total tasks
    total_tasks = 0
    if request.app_store_reviews:
        total_tasks += len(request.app_store_reviews)
    if request.reddit:
        total_tasks += len(request.reddit)
    if request.websites:
        total_tasks += len(request.websites)

    if total_tasks == 0:
        raise HTTPException(status_code=400, detail="No crawl tasks provided")

    # Create job
    job = CrawlJob(
        id=job_id,
        type=CrawlType.APP_STORE_REVIEWS,  # Will be mixed
        status=CrawlJobStatus.PENDING,
        request=request.model_dump(),
        progress=0.0,
    )
    jobs[job_id] = job

    # Start background processing
    background_tasks.add_task(process_batch_job, job_id, request)

    return BatchCrawlResponse(
        job_id=job_id,
        status=CrawlJobStatus.PENDING,
        total_tasks=total_tasks,
        completed_tasks=0,
    )


async def process_batch_job(job_id: str, request: BatchCrawlRequest):
    """Process a batch crawl job in the background."""
    job = jobs.get(job_id)
    if not job:
        return

    job.status = CrawlJobStatus.RUNNING
    job.started_at = datetime.utcnow()

    results = {
        "app_store_reviews": [],
        "reddit": [],
        "websites": [],
    }
    completed = 0
    total = 0

    if request.app_store_reviews:
        total += len(request.app_store_reviews)
    if request.reddit:
        total += len(request.reddit)
    if request.websites:
        total += len(request.websites)

    try:
        # Process App Store reviews
        if request.app_store_reviews and app_store_crawler:
            for req in request.app_store_reviews:
                try:
                    result = await app_store_crawler.crawl_reviews(**req.model_dump())
                    results["app_store_reviews"].append(result.model_dump())
                except Exception as e:
                    logger.error(f"Batch review crawl error: {e}")
                completed += 1
                job.progress = completed / total

        # Process Reddit
        if request.reddit and reddit_crawler:
            for req in request.reddit:
                try:
                    result = await reddit_crawler.crawl_search(**req.model_dump())
                    results["reddit"].append(result.model_dump())
                except Exception as e:
                    logger.error(f"Batch Reddit crawl error: {e}")
                completed += 1
                job.progress = completed / total

        # Process websites
        if request.websites and website_crawler:
            for req in request.websites:
                try:
                    result = await website_crawler.crawl_website(
                        url=str(req.url),
                        max_pages=req.max_pages,
                        include_subpages=req.include_subpages,
                        extract_pricing=req.extract_pricing,
                        extract_features=req.extract_features,
                        force_refresh=req.force_refresh,
                    )
                    results["websites"].append(result.model_dump())
                except Exception as e:
                    logger.error(f"Batch website crawl error: {e}")
                completed += 1
                job.progress = completed / total

        job.result = results
        job.status = CrawlJobStatus.COMPLETED

    except Exception as e:
        logger.error(f"Batch job error: {e}")
        job.status = CrawlJobStatus.FAILED
        job.error = str(e)

    job.completed_at = datetime.utcnow()


@app.get(
    "/job/{job_id}",
    response_model=CrawlJob,
    tags=["Jobs"],
    dependencies=[Security(verify_api_key)],
)
async def get_job_status(job_id: str):
    """Get the status and result of a crawl job."""
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@app.get(
    "/job/{job_id}/stream",
    tags=["Jobs"],
    dependencies=[Security(verify_api_key)],
)
async def stream_job_progress(job_id: str):
    """
    Stream job progress via Server-Sent Events.

    Events:
    - progress: {progress: 0.0-1.0}
    - complete: {result: ...}
    - error: {error: "message"}
    """
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    async def event_generator():
        last_progress = -1

        while True:
            current_job = jobs.get(job_id)
            if not current_job:
                yield {"event": "error", "data": '{"error": "Job not found"}'}
                break

            # Send progress updates
            if current_job.progress != last_progress:
                last_progress = current_job.progress
                yield {
                    "event": "progress",
                    "data": f'{{"progress": {current_job.progress:.2f}}}',
                }

            # Check completion
            if current_job.status == CrawlJobStatus.COMPLETED:
                import json
                yield {
                    "event": "complete",
                    "data": json.dumps(current_job.result or {}),
                }
                break

            if current_job.status == CrawlJobStatus.FAILED:
                yield {
                    "event": "error",
                    "data": f'{{"error": "{current_job.error}"}}',
                }
                break

            await asyncio.sleep(1)

    return EventSourceResponse(event_generator())


# ============================================================================
# Cache Management
# ============================================================================

@app.get(
    "/cache/stats",
    tags=["Cache"],
    dependencies=[Security(verify_api_key)],
)
async def get_cache_stats():
    """Get cache statistics."""
    if not cache_manager:
        raise HTTPException(status_code=503, detail="Cache not initialized")
    return await cache_manager.get_stats()


@app.delete(
    "/cache/type/{cache_type}",
    tags=["Cache"],
    dependencies=[Security(verify_api_key)],
)
async def invalidate_cache_type(cache_type: str):
    """Invalidate all cache entries of a specific type."""
    if not cache_manager:
        raise HTTPException(status_code=503, detail="Cache not initialized")
    count = await cache_manager.invalidate_type(cache_type)
    return {"invalidated": count}


@app.post(
    "/cache/cleanup",
    tags=["Cache"],
    dependencies=[Security(verify_api_key)],
)
async def cleanup_expired_cache():
    """Remove all expired cache entries."""
    if not cache_manager:
        raise HTTPException(status_code=503, detail="Cache not initialized")
    count = await cache_manager.cleanup_expired()
    return {"removed": count}


# ============================================================================
# Main
# ============================================================================

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )
