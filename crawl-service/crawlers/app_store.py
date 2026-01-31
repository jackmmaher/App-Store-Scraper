"""App Store crawler for reviews, What's New, and privacy labels."""

import asyncio
import json
import logging
import re
from datetime import datetime
from typing import Optional
from bs4 import BeautifulSoup
from crawl4ai import CrawlerRunConfig

from .base import BaseCrawler
from models.schemas import (
    ExtendedReview,
    AppStoreReviewResponse,
    WhatsNewEntry,
    AppStoreWhatsNewResponse,
    PrivacyLabel,
    AppStorePrivacyResponse,
)

logger = logging.getLogger(__name__)


class AppStoreCrawler(BaseCrawler):
    """
    Crawler for App Store data including:
    - Extended reviews (thousands instead of RSS 50-100)
    - What's New / version history
    - Privacy nutrition labels
    """

    @property
    def cache_type(self) -> str:
        return "app_store"

    def _get_app_store_url(self, app_id: str, country: str = "us") -> str:
        """Generate App Store URL for an app."""
        return f"https://apps.apple.com/{country}/app/id{app_id}"

    def _get_reviews_url(self, app_id: str, country: str = "us") -> str:
        """Generate App Store reviews page URL."""
        return f"https://apps.apple.com/{country}/app/id{app_id}?see-all=reviews"

    async def crawl_reviews(
        self,
        app_id: str,
        country: str = "us",
        max_reviews: int = 1000,
        min_rating: Optional[int] = None,
        max_rating: Optional[int] = None,
        force_refresh: bool = False,
    ) -> AppStoreReviewResponse:
        """
        Crawl all reviews for an app using browser automation.

        This method uses Crawl4AI to load the App Store reviews page and
        scrolls to load more reviews dynamically, capturing thousands
        instead of the RSS limit of ~50-100.

        Args:
            app_id: App Store app ID
            country: Country code
            max_reviews: Maximum reviews to fetch
            min_rating: Filter minimum rating
            max_rating: Filter maximum rating
            force_refresh: Bypass cache

        Returns:
            AppStoreReviewResponse with extended reviews
        """
        cache_params = {
            "country": country,
            "max_reviews": max_reviews,
            "min_rating": min_rating,
            "max_rating": max_rating,
        }

        async def do_crawl():
            reviews: list[ExtendedReview] = []
            app_name = None
            rating_distribution = {"1": 0, "2": 0, "3": 0, "4": 0, "5": 0}

            try:
                # First, get the main app page to extract app name
                app_url = self._get_app_store_url(app_id, country)
                app_result = await self.crawl_page(app_url, wait_for="h1.product-header__title")

                if app_result and app_result.get("html"):
                    soup = BeautifulSoup(app_result["html"], "lxml")
                    title_elem = soup.select_one("h1.product-header__title")
                    if title_elem:
                        app_name = title_elem.get_text(strip=True).split("\n")[0]

                # Now crawl the reviews page with infinite scroll
                reviews_url = self._get_reviews_url(app_id, country)

                # JavaScript to scroll and load all reviews
                scroll_js = f"""
                async () => {{
                    const maxReviews = {max_reviews};
                    const maxScrollAttempts = Math.ceil(maxReviews / 10) + 10;
                    let lastCount = 0;
                    let sameCountStreak = 0;

                    for (let i = 0; i < maxScrollAttempts; i++) {{
                        // Scroll to bottom
                        window.scrollTo(0, document.body.scrollHeight);
                        await new Promise(r => setTimeout(r, 1500));

                        // Click "Show More" if visible
                        const showMoreBtn = document.querySelector('button.we-customer-review__show-more-reviews');
                        if (showMoreBtn) {{
                            showMoreBtn.click();
                            await new Promise(r => setTimeout(r, 1000));
                        }}

                        // Count current reviews
                        const currentCount = document.querySelectorAll('.we-customer-review').length;

                        if (currentCount >= maxReviews) break;

                        if (currentCount === lastCount) {{
                            sameCountStreak++;
                            if (sameCountStreak >= 5) break; // No more reviews loading
                        }} else {{
                            sameCountStreak = 0;
                        }}

                        lastCount = currentCount;
                    }}
                }}
                """

                result = await self.crawl_page(
                    reviews_url,
                    js_code=scroll_js,
                    wait_for=".we-customer-review"
                )

                if result and result.get("html"):
                    soup = BeautifulSoup(result["html"], "lxml")

                    # Parse reviews
                    review_elements = soup.select(".we-customer-review")
                    logger.info(f"Found {len(review_elements)} review elements for app {app_id}")

                    for idx, elem in enumerate(review_elements):
                        try:
                            review = self._parse_review_element(elem, app_id, country)
                            if review:
                                # Apply rating filters
                                if min_rating and review.rating < min_rating:
                                    continue
                                if max_rating and review.rating > max_rating:
                                    continue

                                reviews.append(review)
                                rating_distribution[str(review.rating)] = (
                                    rating_distribution.get(str(review.rating), 0) + 1
                                )

                                if len(reviews) >= max_reviews:
                                    break

                        except Exception as e:
                            logger.warning(f"Error parsing review {idx}: {e}")
                            continue

            except Exception as e:
                logger.error(f"Error crawling reviews for {app_id}: {e}")

            return {
                "app_id": app_id,
                "app_name": app_name,
                "country": country,
                "total_reviews": len(reviews),
                "reviews": [r.model_dump() for r in reviews],
                "rating_distribution": rating_distribution,
            }

        # Get from cache or crawl
        cached_or_fresh = await self.get_cached_or_crawl(
            identifier=app_id,
            crawl_func=do_crawl,
            params=cache_params,
            force_refresh=force_refresh,
        )

        # Convert back to response model
        reviews = [ExtendedReview(**r) for r in cached_or_fresh.get("reviews", [])]

        return AppStoreReviewResponse(
            app_id=cached_or_fresh["app_id"],
            app_name=cached_or_fresh.get("app_name"),
            country=cached_or_fresh["country"],
            total_reviews=cached_or_fresh["total_reviews"],
            reviews=reviews,
            rating_distribution=cached_or_fresh.get("rating_distribution", {}),
            cached=not force_refresh and self.cache_manager is not None,
        )

    def _parse_review_element(
        self,
        elem: BeautifulSoup,
        app_id: str,
        country: str
    ) -> Optional[ExtendedReview]:
        """Parse a single review element from the App Store page."""
        try:
            # Extract rating from star figure
            rating = 5  # Default
            star_figure = elem.select_one("figure.we-star-rating")
            if star_figure:
                aria_label = star_figure.get("aria-label", "")
                # e.g., "5 out of 5"
                match = re.search(r"(\d+)\s*out\s*of\s*5", aria_label)
                if match:
                    rating = int(match.group(1))

            # Extract title
            title_elem = elem.select_one(".we-customer-review__title")
            title = title_elem.get_text(strip=True) if title_elem else ""

            # Extract content
            content_elem = elem.select_one(".we-customer-review__body")
            content = content_elem.get_text(strip=True) if content_elem else ""

            if not content:
                return None

            # Extract author
            author_elem = elem.select_one(".we-customer-review__user")
            author = author_elem.get_text(strip=True) if author_elem else "Anonymous"

            # Extract date
            date_elem = elem.select_one(".we-customer-review__date")
            date_str = date_elem.get_text(strip=True) if date_elem else ""
            date = self._parse_date(date_str)

            # Generate unique ID
            review_id = f"{app_id}_{hash(content[:100])}"

            return ExtendedReview(
                id=review_id,
                title=title,
                content=content,
                rating=rating,
                author=author,
                date=date,
                app_id=app_id,
                country=country,
            )

        except Exception as e:
            logger.warning(f"Error parsing review element: {e}")
            return None

    def _parse_date(self, date_str: str) -> datetime:
        """Parse date string from App Store."""
        try:
            # Try common formats
            for fmt in ["%B %d, %Y", "%b %d, %Y", "%d %B %Y", "%d %b %Y"]:
                try:
                    return datetime.strptime(date_str, fmt)
                except ValueError:
                    continue

            # If parsing fails, return current time
            return datetime.utcnow()
        except Exception:
            return datetime.utcnow()

    async def crawl_whats_new(
        self,
        app_id: str,
        country: str = "us",
        max_versions: int = 50,
        force_refresh: bool = False,
    ) -> AppStoreWhatsNewResponse:
        """
        Crawl What's New / version history for an app.

        Args:
            app_id: App Store app ID
            country: Country code
            max_versions: Maximum versions to fetch
            force_refresh: Bypass cache

        Returns:
            AppStoreWhatsNewResponse with version history
        """
        cache_params = {"country": country, "max_versions": max_versions}

        async def do_crawl():
            versions: list[dict] = []
            app_name = None

            try:
                app_url = self._get_app_store_url(app_id, country)

                # Click on version history if available
                version_js = """
                async () => {
                    const versionLink = document.querySelector('a[href*="version-history"]');
                    if (versionLink) {
                        versionLink.click();
                        await new Promise(r => setTimeout(r, 2000));
                    }

                    // Also try to expand release notes
                    const expandBtns = document.querySelectorAll('button.we-truncate__button');
                    for (const btn of expandBtns) {
                        btn.click();
                        await new Promise(r => setTimeout(r, 100));
                    }
                }
                """

                result = await self.crawl_page(app_url, js_code=version_js)

                if result and result.get("html"):
                    soup = BeautifulSoup(result["html"], "lxml")

                    # Get app name
                    title_elem = soup.select_one("h1.product-header__title")
                    if title_elem:
                        app_name = title_elem.get_text(strip=True).split("\n")[0]

                    # Get current version from main page
                    current_version = soup.select_one(".whats-new__latest__version")
                    current_notes = soup.select_one(".we-truncate__child p")

                    if current_version and current_notes:
                        versions.append({
                            "version": current_version.get_text(strip=True).replace("Version ", ""),
                            "release_date": datetime.utcnow().isoformat(),
                            "release_notes": current_notes.get_text(strip=True),
                        })

                    # Parse version history if available
                    version_items = soup.select(".version-history__item")
                    for item in version_items[:max_versions]:
                        try:
                            ver_elem = item.select_one(".version-history__item__version")
                            date_elem = item.select_one(".version-history__item__date")
                            notes_elem = item.select_one(".version-history__item__release-notes")

                            if ver_elem and notes_elem:
                                versions.append({
                                    "version": ver_elem.get_text(strip=True),
                                    "release_date": self._parse_date(
                                        date_elem.get_text(strip=True) if date_elem else ""
                                    ).isoformat(),
                                    "release_notes": notes_elem.get_text(strip=True),
                                })
                        except Exception as e:
                            logger.warning(f"Error parsing version item: {e}")

            except Exception as e:
                logger.error(f"Error crawling What's New for {app_id}: {e}")

            return {
                "app_id": app_id,
                "app_name": app_name,
                "country": country,
                "total_versions": len(versions),
                "versions": versions,
            }

        cached_or_fresh = await self.get_cached_or_crawl(
            identifier=f"{app_id}_whats_new",
            crawl_func=do_crawl,
            params=cache_params,
            force_refresh=force_refresh,
        )

        versions = [
            WhatsNewEntry(
                version=v["version"],
                release_date=datetime.fromisoformat(v["release_date"]),
                release_notes=v["release_notes"],
            )
            for v in cached_or_fresh.get("versions", [])
        ]

        return AppStoreWhatsNewResponse(
            app_id=cached_or_fresh["app_id"],
            app_name=cached_or_fresh.get("app_name"),
            country=cached_or_fresh["country"],
            total_versions=cached_or_fresh["total_versions"],
            versions=versions,
            cached=not force_refresh and self.cache_manager is not None,
        )

    async def crawl_privacy_labels(
        self,
        app_id: str,
        country: str = "us",
        force_refresh: bool = False,
    ) -> AppStorePrivacyResponse:
        """
        Crawl privacy nutrition labels for an app.

        Args:
            app_id: App Store app ID
            country: Country code
            force_refresh: Bypass cache

        Returns:
            AppStorePrivacyResponse with privacy labels
        """
        async def do_crawl():
            labels: list[dict] = []
            app_name = None
            privacy_policy_url = None

            try:
                app_url = self._get_app_store_url(app_id, country)

                # Scroll to privacy section
                privacy_js = """
                async () => {
                    const privacySection = document.querySelector('.app-privacy');
                    if (privacySection) {
                        privacySection.scrollIntoView();
                        await new Promise(r => setTimeout(r, 1000));
                    }

                    // Click to expand privacy details
                    const seeDetailsBtn = document.querySelector('.app-privacy__see-details-link');
                    if (seeDetailsBtn) {
                        seeDetailsBtn.click();
                        await new Promise(r => setTimeout(r, 1500));
                    }
                }
                """

                result = await self.crawl_page(app_url, js_code=privacy_js)

                if result and result.get("html"):
                    soup = BeautifulSoup(result["html"], "lxml")

                    # Get app name
                    title_elem = soup.select_one("h1.product-header__title")
                    if title_elem:
                        app_name = title_elem.get_text(strip=True).split("\n")[0]

                    # Parse privacy sections
                    privacy_cards = soup.select(".app-privacy__card")
                    for card in privacy_cards:
                        try:
                            category_elem = card.select_one(".app-privacy__card-header")
                            category = category_elem.get_text(strip=True) if category_elem else "Unknown"

                            data_types = []
                            purposes = []

                            # Get data types
                            type_items = card.select(".app-privacy__data-category-heading")
                            for item in type_items:
                                data_types.append(item.get_text(strip=True))

                            # Get purposes
                            purpose_items = card.select(".app-privacy__purpose")
                            for item in purpose_items:
                                purposes.append(item.get_text(strip=True))

                            if category != "Unknown":
                                labels.append({
                                    "category": category,
                                    "data_types": data_types,
                                    "purposes": purposes,
                                })

                        except Exception as e:
                            logger.warning(f"Error parsing privacy card: {e}")

                    # Get privacy policy URL
                    privacy_link = soup.select_one('a[href*="privacy"]')
                    if privacy_link:
                        privacy_policy_url = privacy_link.get("href")

            except Exception as e:
                logger.error(f"Error crawling privacy labels for {app_id}: {e}")

            return {
                "app_id": app_id,
                "app_name": app_name,
                "country": country,
                "privacy_labels": labels,
                "privacy_policy_url": privacy_policy_url,
            }

        cached_or_fresh = await self.get_cached_or_crawl(
            identifier=f"{app_id}_privacy",
            crawl_func=do_crawl,
            params={"country": country},
            force_refresh=force_refresh,
        )

        labels = [
            PrivacyLabel(
                category=l["category"],
                data_types=l.get("data_types", []),
                purposes=l.get("purposes", []),
            )
            for l in cached_or_fresh.get("privacy_labels", [])
        ]

        return AppStorePrivacyResponse(
            app_id=cached_or_fresh["app_id"],
            app_name=cached_or_fresh.get("app_name"),
            country=cached_or_fresh["country"],
            privacy_labels=labels,
            privacy_policy_url=cached_or_fresh.get("privacy_policy_url"),
            cached=not force_refresh and self.cache_manager is not None,
        )

    async def crawl(self, **kwargs):
        """Generic crawl method - routes to specific crawl type."""
        crawl_type = kwargs.get("type", "reviews")

        if crawl_type == "reviews":
            return await self.crawl_reviews(
                app_id=kwargs["app_id"],
                country=kwargs.get("country", "us"),
                max_reviews=kwargs.get("max_reviews", 1000),
                min_rating=kwargs.get("min_rating"),
                max_rating=kwargs.get("max_rating"),
                force_refresh=kwargs.get("force_refresh", False),
            )
        elif crawl_type == "whats_new":
            return await self.crawl_whats_new(
                app_id=kwargs["app_id"],
                country=kwargs.get("country", "us"),
                max_versions=kwargs.get("max_versions", 50),
                force_refresh=kwargs.get("force_refresh", False),
            )
        elif crawl_type == "privacy":
            return await self.crawl_privacy_labels(
                app_id=kwargs["app_id"],
                country=kwargs.get("country", "us"),
                force_refresh=kwargs.get("force_refresh", False),
            )
        else:
            raise ValueError(f"Unknown crawl type: {crawl_type}")
