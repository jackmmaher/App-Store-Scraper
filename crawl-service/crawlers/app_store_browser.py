"""
App Store Browser Crawler - Uses Playwright for unlimited review scraping
Scrapes the actual App Store web pages instead of the limited RSS API
"""

import asyncio
import logging
import re
from datetime import datetime
from typing import List, Optional, Dict, Any
from playwright.async_api import async_playwright, Page, Browser, TimeoutError as PlaywrightTimeout

logger = logging.getLogger(__name__)


class AppStoreBrowserCrawler:
    """Crawl App Store reviews using browser automation for unlimited scraping"""

    def __init__(self, headless: bool = True):
        self.headless = headless
        self.browser: Optional[Browser] = None
        self.playwright = None

    async def __aenter__(self):
        self.playwright = await async_playwright().start()
        self.browser = await self.playwright.chromium.launch(
            headless=self.headless,
            args=[
                '--disable-blink-features=AutomationControlled',
                '--disable-dev-shm-usage',
                '--no-sandbox',
            ]
        )
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.browser:
            await self.browser.close()
        if self.playwright:
            await self.playwright.stop()

    async def _create_page(self) -> Page:
        """Create a new page with anti-detection measures"""
        context = await self.browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            locale='en-US',
        )
        page = await context.new_page()

        # Remove webdriver detection
        await page.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
            Object.defineProperty(navigator, 'plugins', {get: () => [1, 2, 3, 4, 5]});
        """)

        return page

    # Countries with significant App Store review volumes
    COUNTRIES = [
        'us', 'gb', 'ca', 'au', 'de', 'fr', 'jp', 'kr', 'cn', 'br',
        'mx', 'es', 'it', 'nl', 'se', 'no', 'dk', 'fi', 'ru', 'in',
        'sg', 'hk', 'tw', 'th', 'id', 'my', 'ph', 'vn', 'nz', 'za',
        'ae', 'sa', 'il', 'tr', 'pl', 'cz', 'at', 'ch', 'be', 'ie',
    ]

    async def crawl_reviews(
        self,
        app_id: str,
        country: str = "us",
        max_reviews: int = 5000,
        min_rating: Optional[int] = None,
        max_rating: Optional[int] = None,
        multi_country: bool = True,
    ) -> List[dict]:
        """
        Crawl reviews from the App Store web page.
        When multi_country=True, scrapes from multiple country stores to maximize review count.
        """
        all_reviews = {}

        # Determine which countries to scrape
        if multi_country and max_reviews > 100:
            # Use multiple countries, prioritizing the requested one
            countries_to_scrape = [country] + [c for c in self.COUNTRIES if c != country]
        else:
            countries_to_scrape = [country]

        logger.info(f"Starting browser crawl for app {app_id}, target: {max_reviews} reviews, countries: {len(countries_to_scrape)}")

        page = await self._create_page()

        try:
            for current_country in countries_to_scrape:
                if len(all_reviews) >= max_reviews:
                    break

                # Construct the reviews URL for this country
                reviews_url = f"https://apps.apple.com/{current_country}/app/id{app_id}?see-all=reviews"

                try:
                    # Navigate to the reviews page
                    await page.goto(reviews_url, wait_until='networkidle', timeout=30000)
                    await asyncio.sleep(2)

                    # Extract reviews from this page
                    page_reviews = await self._extract_reviews(page, current_country)

                    new_count = 0
                    for review in page_reviews:
                        # Create unique ID based on author + content hash
                        content_hash = hash(review.get('content', '')[:100])
                        review_id = f"{review.get('author', '')}_{content_hash}"

                        if review_id in all_reviews:
                            continue

                        rating = review.get('rating', 0)

                        # Apply rating filters
                        if min_rating and rating < min_rating:
                            continue
                        if max_rating and rating > max_rating:
                            continue

                        all_reviews[review_id] = review
                        new_count += 1

                    logger.info(f"Country {current_country}: got {new_count} new reviews (total: {len(all_reviews)})")

                    # Scroll to try to get more reviews from this country
                    for scroll_attempt in range(3):
                        if len(all_reviews) >= max_reviews:
                            break

                        await self._scroll_page(page)
                        await asyncio.sleep(1.5)

                        additional_reviews = await self._extract_reviews(page, current_country)
                        for review in additional_reviews:
                            content_hash = hash(review.get('content', '')[:100])
                            review_id = f"{review.get('author', '')}_{content_hash}"

                            if review_id in all_reviews:
                                continue

                            rating = review.get('rating', 0)
                            if min_rating and rating < min_rating:
                                continue
                            if max_rating and rating > max_rating:
                                continue

                            all_reviews[review_id] = review

                    # Small delay between countries to avoid rate limiting
                    await asyncio.sleep(1)

                except PlaywrightTimeout:
                    logger.warning(f"Timeout for country {current_country}, skipping")
                    continue
                except Exception as e:
                    logger.warning(f"Error for country {current_country}: {e}")
                    continue

            logger.info(f"Browser crawl complete: {len(all_reviews)} reviews collected from {len(countries_to_scrape)} countries")

        except Exception as e:
            logger.exception(f"Error during browser crawl: {e}")
        finally:
            await page.context.close()

        return list(all_reviews.values())[:max_reviews]

    async def _get_app_url(self, app_id: str, country: str) -> Optional[str]:
        """Get the full app URL from iTunes lookup API"""
        import httpx

        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"https://itunes.apple.com/lookup?id={app_id}&country={country}"
                )
                data = response.json()

                if data.get('results'):
                    return data['results'][0].get('trackViewUrl')
        except Exception as e:
            logger.error(f"Error getting app URL: {e}")

        return None

    async def _extract_reviews(self, page: Page, country: str) -> List[dict]:
        """Extract review data from the page using the actual App Store structure"""
        reviews = []

        try:
            # Extract reviews using JavaScript with the correct selectors
            reviews_data = await page.evaluate(r"""
                () => {
                    const results = [];
                    const seenAuthors = new Set();

                    // Find all review headers - the structure is .header.svelte-1jsby4n
                    // Each review card has: header (with date, author, stars) + content sibling
                    const reviewHeaders = document.querySelectorAll('.header.svelte-1jsby4n, .review-header');

                    reviewHeaders.forEach((header, index) => {
                        try {
                            // Get date from time element
                            const dateEl = header.querySelector('time.date, time');
                            const date = dateEl ? dateEl.textContent.trim() : '';
                            const dateISO = dateEl ? dateEl.getAttribute('datetime') : '';

                            // Get author from .author element
                            const authorEl = header.querySelector('.author, p.author');
                            const author = authorEl ? authorEl.textContent.trim() : '';

                            // Skip if we've seen this author+date combo (duplicates from nested elements)
                            const key = `${author}_${date}`;
                            if (seenAuthors.has(key)) return;
                            seenAuthors.add(key);

                            // Get title if present
                            const titleEl = header.querySelector('.title');
                            const title = titleEl ? titleEl.textContent.trim() : '';

                            // Get content from next sibling element (the content div comes after header)
                            let content = '';
                            const nextSibling = header.nextElementSibling;
                            if (nextSibling) {
                                content = nextSibling.textContent.trim();
                            }

                            // Get star rating from the stars container within the header
                            let rating = 0;
                            const starsContainer = header.querySelector('.stars, [class*="stars"]');
                            if (starsContainer) {
                                // Count the filled stars (usually have aria-label)
                                const starEls = starsContainer.querySelectorAll('.star, [class*="star"]');
                                starEls.forEach(star => {
                                    const label = star.getAttribute('aria-label') || '';
                                    const match = label.match(/(\d)\s*Star/i);
                                    if (match) {
                                        rating = parseInt(match[1]);
                                    }
                                });
                            }

                            // Alternative: look for any element with aria-label containing Stars
                            if (rating === 0) {
                                const allElements = header.querySelectorAll('[aria-label]');
                                allElements.forEach(el => {
                                    const label = el.getAttribute('aria-label') || '';
                                    const match = label.match(/(\d)\s*Stars?/i);
                                    if (match && parseInt(match[1]) >= 1 && parseInt(match[1]) <= 5) {
                                        rating = parseInt(match[1]);
                                    }
                                });
                            }

                            // Also check parent for rating
                            if (rating === 0 && header.parentElement) {
                                const parentStars = header.parentElement.querySelectorAll('[aria-label*="Star"]');
                                parentStars.forEach(el => {
                                    const label = el.getAttribute('aria-label') || '';
                                    const match = label.match(/(\d)\s*Stars?/i);
                                    if (match && parseInt(match[1]) >= 1 && parseInt(match[1]) <= 5) {
                                        rating = parseInt(match[1]);
                                    }
                                });
                            }

                            if (author && content) {
                                results.push({
                                    id: `browser_${index}_${Date.now()}`,
                                    date: date,
                                    dateISO: dateISO,
                                    author: author,
                                    content: content,
                                    rating: rating,
                                    title: title,
                                });
                            }
                        } catch (e) {
                            console.error('Error extracting review:', e);
                        }
                    });

                    return results;
                }
            """)

            for review in reviews_data:
                review['country'] = country
                review['source'] = 'browser'
                reviews.append(review)

            logger.debug(f"Extracted {len(reviews)} reviews from current page view")

        except PlaywrightTimeout:
            logger.debug("Timeout waiting for review elements")
        except Exception as e:
            logger.error(f"Error extracting reviews: {e}")

        return reviews

    async def _scroll_page(self, page: Page):
        """Scroll down to load more reviews"""
        try:
            # Get current scroll position and document height
            scroll_info = await page.evaluate("""
                () => {
                    const scrollY = window.scrollY;
                    const innerHeight = window.innerHeight;
                    const scrollHeight = document.body.scrollHeight;
                    return { scrollY, innerHeight, scrollHeight };
                }
            """)

            # Scroll down gradually to trigger lazy loading
            current_pos = scroll_info['scrollY']
            target_pos = current_pos + scroll_info['innerHeight'] * 1.5

            # Smooth scroll
            await page.evaluate(f"""
                () => {{
                    window.scrollTo({{
                        top: {target_pos},
                        behavior: 'smooth'
                    }});
                }}
            """)

            await asyncio.sleep(0.5)

            # Also scroll to bottom
            await page.evaluate("""
                () => {
                    window.scrollTo(0, document.body.scrollHeight);
                }
            """)

            # Press End key as additional trigger
            await page.keyboard.press('End')

            # Wait for any lazy-loaded content
            await asyncio.sleep(1)

        except Exception as e:
            logger.debug(f"Error scrolling: {e}")

    async def crawl_whats_new(
        self,
        app_id: str,
        country: str = "us",
        max_versions: int = 50,
    ) -> List[dict]:
        """
        Get version history from the App Store page.
        Browser can access the full version history.
        """
        versions = []

        reviews_url = f"https://apps.apple.com/{country}/app/id{app_id}"
        page = await self._create_page()

        try:
            await page.goto(reviews_url, wait_until='networkidle', timeout=60000)
            await asyncio.sleep(3)

            # Try to find and click "Version History" link
            try:
                version_link = page.locator('a:has-text("Version History"), a[href*="version-history"]')
                if await version_link.count() > 0:
                    await version_link.first.click()
                    await asyncio.sleep(2)
            except:
                pass

            # Extract version info from the page
            versions_data = await page.evaluate("""
                () => {
                    const versions = [];

                    // Look for version history items
                    const versionItems = document.querySelectorAll('[class*="version"]');

                    versionItems.forEach(item => {
                        const text = item.textContent.trim();
                        // Try to parse version info
                        const versionMatch = text.match(/Version\\s*([\\d.]+)/i);
                        if (versionMatch) {
                            versions.push({
                                version: versionMatch[1],
                                text: text.substring(0, 500)
                            });
                        }
                    });

                    // Also get current version from page
                    const currentVersion = document.querySelector('[class*="version"]');
                    if (currentVersion && versions.length === 0) {
                        versions.push({
                            version: currentVersion.textContent.trim(),
                            text: 'Current version'
                        });
                    }

                    return versions;
                }
            """)

            versions = versions_data[:max_versions]
            logger.info(f"Found {len(versions)} version entries")

        except Exception as e:
            logger.error(f"Error crawling version history: {e}")
        finally:
            await page.context.close()

        return versions

    async def crawl_privacy_labels(
        self,
        app_id: str,
        country: str = "us",
    ) -> List[dict]:
        """
        Get privacy labels from the App Store page.
        """
        labels = []

        app_url = f"https://apps.apple.com/{country}/app/id{app_id}"
        page = await self._create_page()

        try:
            await page.goto(app_url, wait_until='networkidle', timeout=60000)
            await asyncio.sleep(3)

            # Try to expand privacy section
            try:
                privacy_link = page.locator('a:has-text("See Details"), a:has-text("App Privacy")')
                if await privacy_link.count() > 0:
                    await privacy_link.first.click()
                    await asyncio.sleep(2)
            except:
                pass

            # Extract privacy info
            labels_data = await page.evaluate("""
                () => {
                    const labels = [];

                    // Look for privacy-related sections
                    const privacySections = document.querySelectorAll('[class*="privacy"], [class*="Privacy"]');

                    privacySections.forEach(section => {
                        const text = section.textContent.trim();
                        if (text.length > 10 && text.length < 1000) {
                            labels.push({
                                category: 'Privacy Information',
                                text: text.substring(0, 500),
                                data_types: [],
                                purposes: []
                            });
                        }
                    });

                    return labels;
                }
            """)

            labels = labels_data
            logger.info(f"Found {len(labels)} privacy label sections")

        except Exception as e:
            logger.error(f"Error crawling privacy labels: {e}")
        finally:
            await page.context.close()

        return labels
