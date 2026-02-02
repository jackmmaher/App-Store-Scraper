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

        Note: iTunes RSS API is limited to ~500 reviews per country/sort.
        For more reviews, browser scraping is needed.
        """
        all_reviews = {}
        # iTunes RSS allows pages 1-10 (500 reviews max per sort)
        max_pages = 10

        logger.info(f"Starting RSS review crawl for app {app_id} in {country}, max {max_reviews} reviews")

        # Try multiple countries for RSS to maximize coverage
        countries_to_try = [country]
        if max_reviews > 500:
            additional_countries = ['us', 'gb', 'ca', 'au', 'de', 'fr']
            countries_to_try += [c for c in additional_countries if c != country]
            countries_to_try = countries_to_try[:4]  # Limit to 4 countries for RSS

        for current_country in countries_to_try:
            if len(all_reviews) >= max_reviews:
                break

            for sort_by in self.SORT_OPTIONS:
                if len(all_reviews) >= max_reviews:
                    break

                consecutive_empty = 0
                pages_crawled = 0

                for page in range(1, max_pages + 1):
                    if len(all_reviews) >= max_reviews:
                        break

                    url = f"https://itunes.apple.com/{current_country}/rss/customerreviews/page={page}/id={app_id}/sortBy={sort_by}/json"

                    data = await self.fetch_json(url)

                    # Handle various error cases
                    if not data:
                        consecutive_empty += 1
                        logger.debug(f"Empty response for {sort_by} page {page}")
                        if consecutive_empty >= 5:  # Increased threshold
                            logger.info(f"Stopping {sort_by} after {consecutive_empty} consecutive empty pages")
                            break
                        continue

                    # Check for XML error response (Apple sometimes returns XML errors)
                    if isinstance(data, str) and data.strip().startswith('<?xml'):
                        logger.warning(f"Received XML error response for {sort_by} page {page}")
                        consecutive_empty += 1
                        if consecutive_empty >= 5:
                            break
                        continue

                    feed = data.get("feed", {})
                    entries = feed.get("entry", [])

                    if not entries:
                        consecutive_empty += 1
                        logger.debug(f"No entries in {sort_by} page {page}")
                        if consecutive_empty >= 5:  # Increased threshold
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

                        # Parse rating - use None for missing/invalid to avoid biasing analytics
                        try:
                            rating_label = entry.get("im:rating", {}).get("label")
                            if rating_label is not None:
                                rating = int(rating_label)
                                if rating < 1 or rating > 5:
                                    rating = None
                            else:
                                rating = None
                        except (ValueError, TypeError):
                            rating = None

                        # Apply rating filters (skip reviews with null ratings if filters are set)
                        if min_rating and (rating is None or rating < min_rating):
                            continue
                        if max_rating and (rating is None or rating > max_rating):
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
                            "country": current_country,
                            "sort_source": sort_by,
                        }
                        all_reviews[review_id] = review
                        new_reviews_this_page += 1

                    logger.debug(f"{current_country}/{sort_by} page {page}: {new_reviews_this_page} new reviews (total: {len(all_reviews)})")

                    # Small delay between requests
                    await asyncio.sleep(random.uniform(0.3, 0.8))

                logger.info(f"Completed {current_country}/{sort_by}: crawled {pages_crawled} pages, total unique: {len(all_reviews)}")

                # Delay between sort types
                await asyncio.sleep(random.uniform(0.5, 1.0))

        logger.info(f"RSS review crawl complete: {len(all_reviews)} unique reviews collected from {len(countries_to_try)} countries")
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
