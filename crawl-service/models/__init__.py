"""Pydantic models for the Crawl service."""

from .schemas import (
    # Request models
    AppStoreReviewRequest,
    AppStoreWhatsNewRequest,
    AppStorePrivacyRequest,
    RedditCrawlRequest,
    WebsiteCrawlRequest,
    BatchCrawlRequest,
    # Response models
    ExtendedReview,
    AppStoreReviewResponse,
    WhatsNewEntry,
    AppStoreWhatsNewResponse,
    PrivacyLabel,
    AppStorePrivacyResponse,
    RedditPost,
    RedditComment,
    RedditDiscussion,
    RedditCrawlResponse,
    WebsiteContent,
    WebsiteCrawlResponse,
    BatchCrawlResponse,
    CrawlJob,
    CrawlJobStatus,
    HealthResponse,
)

__all__ = [
    # Request models
    "AppStoreReviewRequest",
    "AppStoreWhatsNewRequest",
    "AppStorePrivacyRequest",
    "RedditCrawlRequest",
    "WebsiteCrawlRequest",
    "BatchCrawlRequest",
    # Response models
    "ExtendedReview",
    "AppStoreReviewResponse",
    "WhatsNewEntry",
    "AppStoreWhatsNewResponse",
    "PrivacyLabel",
    "AppStorePrivacyResponse",
    "RedditPost",
    "RedditComment",
    "RedditDiscussion",
    "RedditCrawlResponse",
    "WebsiteContent",
    "WebsiteCrawlResponse",
    "BatchCrawlResponse",
    "CrawlJob",
    "CrawlJobStatus",
    "HealthResponse",
]
