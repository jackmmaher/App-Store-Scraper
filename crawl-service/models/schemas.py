"""Pydantic schemas for Crawl4AI service requests and responses."""

from datetime import datetime
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field, HttpUrl


# ============================================================================
# Enums
# ============================================================================

class CrawlJobStatus(str, Enum):
    """Status of a crawl job."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class CrawlType(str, Enum):
    """Type of crawl operation."""
    APP_STORE_REVIEWS = "app_store_reviews"
    APP_STORE_WHATS_NEW = "app_store_whats_new"
    APP_STORE_PRIVACY = "app_store_privacy"
    REDDIT = "reddit"
    WEBSITE = "website"


# ============================================================================
# Request Models
# ============================================================================

class AppStoreReviewRequest(BaseModel):
    """Request to crawl App Store reviews."""
    app_id: str = Field(..., description="App Store app ID (e.g., '123456789')")
    country: str = Field(default="us", description="Country code (e.g., 'us', 'gb')")
    max_reviews: int = Field(default=1000, ge=1, le=10000, description="Maximum reviews to fetch")
    min_rating: Optional[int] = Field(default=None, ge=1, le=5, description="Filter by minimum rating")
    max_rating: Optional[int] = Field(default=None, ge=1, le=5, description="Filter by maximum rating")
    force_refresh: bool = Field(default=False, description="Bypass cache and fetch fresh data")


class AppStoreWhatsNewRequest(BaseModel):
    """Request to crawl App Store 'What's New' history."""
    app_id: str = Field(..., description="App Store app ID")
    country: str = Field(default="us", description="Country code")
    max_versions: int = Field(default=50, ge=1, le=200, description="Maximum versions to fetch")
    force_refresh: bool = Field(default=False, description="Bypass cache")


class AppStorePrivacyRequest(BaseModel):
    """Request to crawl App Store privacy labels."""
    app_id: str = Field(..., description="App Store app ID")
    country: str = Field(default="us", description="Country code")
    force_refresh: bool = Field(default=False, description="Bypass cache")


class RedditCrawlRequest(BaseModel):
    """Request to crawl Reddit discussions."""
    keywords: list[str] = Field(..., min_length=1, max_length=10, description="Search keywords")
    subreddits: Optional[list[str]] = Field(default=None, description="Specific subreddits to search")
    max_posts: int = Field(default=50, ge=1, le=500, description="Maximum posts to fetch")
    max_comments_per_post: int = Field(default=20, ge=0, le=100, description="Max comments per post")
    time_filter: str = Field(default="year", description="Time filter: hour, day, week, month, year, all")
    sort: str = Field(default="relevance", description="Sort by: relevance, hot, new, top")
    force_refresh: bool = Field(default=False, description="Bypass cache")


class WebsiteCrawlRequest(BaseModel):
    """Request to crawl a competitor website."""
    url: HttpUrl = Field(..., description="Website URL to crawl")
    max_pages: int = Field(default=10, ge=1, le=100, description="Maximum pages to crawl")
    include_subpages: bool = Field(default=True, description="Crawl linked subpages")
    extract_pricing: bool = Field(default=True, description="Extract pricing information")
    extract_features: bool = Field(default=True, description="Extract feature lists")
    force_refresh: bool = Field(default=False, description="Bypass cache")


class BatchCrawlRequest(BaseModel):
    """Request for batch crawling multiple targets."""
    app_store_reviews: Optional[list[AppStoreReviewRequest]] = None
    reddit: Optional[list[RedditCrawlRequest]] = None
    websites: Optional[list[WebsiteCrawlRequest]] = None


# ============================================================================
# Response Models - App Store
# ============================================================================

class ExtendedReview(BaseModel):
    """A single App Store review with extended data."""
    id: str = Field(..., description="Unique review ID")
    title: str = Field(default="", description="Review title")
    content: str = Field(..., description="Review content/body")
    rating: int = Field(..., ge=1, le=5, description="Star rating (1-5)")
    author: str = Field(default="Anonymous", description="Reviewer username")
    date: datetime = Field(..., description="Review date")
    version: Optional[str] = Field(default=None, description="App version reviewed")
    helpful_count: int = Field(default=0, description="Number of helpful votes")
    app_id: str = Field(..., description="App Store app ID")
    country: str = Field(default="us", description="Country code")


class AppStoreReviewResponse(BaseModel):
    """Response from App Store review crawl."""
    app_id: str
    app_name: Optional[str] = None
    country: str
    total_reviews: int
    reviews: list[ExtendedReview]
    rating_distribution: dict[str, int] = Field(default_factory=dict)
    crawled_at: datetime = Field(default_factory=datetime.utcnow)
    cached: bool = False
    cache_expires_at: Optional[datetime] = None


class WhatsNewEntry(BaseModel):
    """A single 'What's New' entry for an app version."""
    version: str = Field(..., description="App version number")
    release_date: datetime = Field(..., description="Release date")
    release_notes: str = Field(..., description="What's new text")
    size_bytes: Optional[int] = Field(default=None, description="App size in bytes")


class AppStoreWhatsNewResponse(BaseModel):
    """Response from App Store What's New crawl."""
    app_id: str
    app_name: Optional[str] = None
    country: str
    total_versions: int
    versions: list[WhatsNewEntry]
    crawled_at: datetime = Field(default_factory=datetime.utcnow)
    cached: bool = False


class PrivacyLabel(BaseModel):
    """Privacy label data from App Store."""
    category: str = Field(..., description="Privacy category (e.g., 'Data Linked to You')")
    data_types: list[str] = Field(default_factory=list, description="Types of data collected")
    purposes: list[str] = Field(default_factory=list, description="Purposes for collection")


class AppStorePrivacyResponse(BaseModel):
    """Response from App Store privacy labels crawl."""
    app_id: str
    app_name: Optional[str] = None
    country: str
    privacy_labels: list[PrivacyLabel]
    privacy_policy_url: Optional[str] = None
    crawled_at: datetime = Field(default_factory=datetime.utcnow)
    cached: bool = False


# ============================================================================
# Response Models - Reddit
# ============================================================================

class RedditComment(BaseModel):
    """A Reddit comment."""
    id: str
    author: str = "deleted"
    content: str
    score: int = 0
    created_at: datetime
    is_op: bool = False


class RedditPost(BaseModel):
    """A Reddit post with comments."""
    id: str
    title: str
    content: str = ""
    url: str
    subreddit: str
    author: str = "deleted"
    score: int = 0
    upvote_ratio: float = 0.0
    num_comments: int = 0
    created_at: datetime
    flair: Optional[str] = None
    is_self: bool = True
    comments: list[RedditComment] = Field(default_factory=list)


class RedditDiscussion(BaseModel):
    """A Reddit discussion matching search criteria."""
    keyword: str = Field(..., description="Keyword that matched")
    subreddit: str
    post: RedditPost
    relevance_score: float = Field(default=0.0, description="How relevant to search (0-1)")


class RedditCrawlResponse(BaseModel):
    """Response from Reddit crawl."""
    keywords: list[str]
    subreddits_searched: list[str]
    total_posts: int
    discussions: list[RedditDiscussion]
    crawled_at: datetime = Field(default_factory=datetime.utcnow)
    cached: bool = False


# ============================================================================
# Response Models - Website
# ============================================================================

class WebsiteContent(BaseModel):
    """Crawled content from a competitor website."""
    url: str
    title: str = ""
    description: str = ""
    main_content: str = ""
    features: list[str] = Field(default_factory=list)
    pricing_info: Optional[dict] = None
    screenshots: list[str] = Field(default_factory=list)
    testimonials: list[str] = Field(default_factory=list)
    technology_stack: list[str] = Field(default_factory=list)
    social_links: dict[str, str] = Field(default_factory=dict)
    crawled_pages: int = 0


class WebsiteCrawlResponse(BaseModel):
    """Response from website crawl."""
    url: str
    content: WebsiteContent
    crawled_at: datetime = Field(default_factory=datetime.utcnow)
    cached: bool = False


# ============================================================================
# Response Models - Batch & Jobs
# ============================================================================

class BatchCrawlResponse(BaseModel):
    """Response from batch crawl request."""
    job_id: str
    status: CrawlJobStatus
    total_tasks: int
    completed_tasks: int
    created_at: datetime = Field(default_factory=datetime.utcnow)


class CrawlJob(BaseModel):
    """A crawl job for async tracking."""
    id: str
    type: CrawlType
    status: CrawlJobStatus
    request: dict
    result: Optional[dict] = None
    error: Optional[str] = None
    progress: float = Field(default=0.0, ge=0.0, le=1.0)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class HealthResponse(BaseModel):
    """Health check response."""
    status: str = "healthy"
    version: str = "1.0.0"
    crawl4ai_ready: bool = True
    supabase_connected: bool = True
    uptime_seconds: float = 0.0
