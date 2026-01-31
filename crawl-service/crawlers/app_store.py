"""
App Store Crawler - Simplified version using iTunes RSS API
"""

import asyncio
import logging
import random
from typing import List, Optional
from datetime import datetime

from .base import BaseCrawler

logger = logging.getLogger(__name__)


class AppStoreCrawler(BaseCrawler):
    """Crawl App Store reviews using iTunes RSS API"""

    SORT_OPTIONS = ['mostRecent', 'mostHelpful', 'mostFavorable', 'mostCritical']

    async def crawl_reviews(
        self,
        app_id: str,
        country: str = "us",
        max_reviews: int = 1000,
        min_rating: Optional[int] = None,
        max_rating: Optional[int] = None,
    ) -> List[dict]:
        """
        Crawl reviews for an app using iTunes RSS API.
        Returns up to max_reviews reviews.
        """
        all_reviews = {}
        max_pages = min(max_reviews // 50 + 1, 40)  # 50 reviews per page, max 40 pages

        logger.info(f"Starting review crawl for app {app_id} in {country}, max {max_reviews} reviews")

        for sort_by in self.SORT_OPTIONS:
            if len(all_reviews) >= max_reviews:
                break

            consecutive_empty = 0
            pages_crawled = 0

            for page in range(1, max_pages + 1):
                if len(all_reviews) >= max_reviews:
                    break

                url = f"https://itunes.apple.com/{country}/rss/customerreviews/page={page}/id={app_id}/sortBy={sort_by}/json"

                data = await self.fetch_json(url)

                # Handle various error cases
                if not data:
                    consecutive_empty += 1
                    logger.debug(f"Empty response for {sort_by} page {page}")
                    if consecutive_empty >= 3:
                        logger.info(f"Stopping {sort_by} after {consecutive_empty} consecutive empty pages")
                        break
                    continue

                # Check for XML error response (Apple sometimes returns XML errors)
                if isinstance(data, str) and data.strip().startswith('<?xml'):
                    logger.warning(f"Received XML error response for {sort_by} page {page}")
                    consecutive_empty += 1
                    if consecutive_empty >= 3:
                        break
                    continue

                feed = data.get("feed", {})
                entries = feed.get("entry", [])

                if not entries:
                    consecutive_empty += 1
                    logger.debug(f"No entries in {sort_by} page {page}")
                    if consecutive_empty >= 3:
                        logger.info(f"Stopping {sort_by} after {consecutive_empty} consecutive empty pages")
                        break
                    continue

                consecutive_empty = 0
                pages_crawled += 1
                new_reviews_this_page = 0

                for entry in entries:
                    # Skip app info entry
                    if "im:rating" not in entry:
                        continue

                    review_id = entry.get("id", {}).get("label", "")
                    if not review_id or review_id in all_reviews:
                        continue

                    try:
                        rating = int(entry.get("im:rating", {}).get("label", "0"))
                    except (ValueError, TypeError):
                        rating = 0

                    # Apply rating filters
                    if min_rating and rating < min_rating:
                        continue
                    if max_rating and rating > max_rating:
                        continue

                    try:
                        vote_count = int(entry.get("im:voteCount", {}).get("label", "0"))
                    except (ValueError, TypeError):
                        vote_count = 0

                    review = {
                        "id": review_id,
                        "title": entry.get("title", {}).get("label", ""),
                        "content": entry.get("content", {}).get("label", ""),
                        "rating": rating,
                        "author": entry.get("author", {}).get("name", {}).get("label", ""),
                        "version": entry.get("im:version", {}).get("label", ""),
                        "vote_count": vote_count,
                        "country": country,
                        "sort_source": sort_by,
                    }
                    all_reviews[review_id] = review
                    new_reviews_this_page += 1

                logger.debug(f"{sort_by} page {page}: {new_reviews_this_page} new reviews (total: {len(all_reviews)})")

                # Small delay between requests
                await asyncio.sleep(random.uniform(0.5, 1.5))

            logger.info(f"Completed {sort_by}: crawled {pages_crawled} pages, total unique reviews: {len(all_reviews)}")

            # Longer delay between sort types
            await asyncio.sleep(random.uniform(1.0, 2.0))

        logger.info(f"Review crawl complete: {len(all_reviews)} unique reviews collected")
        return list(all_reviews.values())[:max_reviews]

    async def crawl_whats_new(
        self,
        app_id: str,
        country: str = "us",
        max_versions: int = 50,
    ) -> List[dict]:
        """
        Get version history from iTunes lookup API.
        Note: iTunes API only returns current version info.
        """
        url = f"https://itunes.apple.com/lookup?id={app_id}&country={country}"
        data = await self.fetch_json(url)

        if not data or not data.get("results"):
            return []

        app_info = data["results"][0]

        return [{
            "version": app_info.get("version", ""),
            "release_date": app_info.get("currentVersionReleaseDate", ""),
            "release_notes": app_info.get("releaseNotes", ""),
            "size_bytes": app_info.get("fileSizeBytes", 0),
        }]

    async def crawl_privacy_labels(
        self,
        app_id: str,
        country: str = "us",
    ) -> List[dict]:
        """
        Get privacy labels from iTunes lookup API.
        Note: Full privacy labels require web scraping which isn't reliable.
        """
        url = f"https://itunes.apple.com/lookup?id={app_id}&country={country}"
        data = await self.fetch_json(url)

        if not data or not data.get("results"):
            return []

        app_info = data["results"][0]

        # Basic privacy info from API
        return [{
            "category": "App Information",
            "data_types": [],
            "purposes": [],
            "privacy_policy_url": app_info.get("sellerUrl", ""),
        }]
