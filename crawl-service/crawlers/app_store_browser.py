"""
App Store Browser Crawler - Uses Playwright for unlimited review scraping
Scrapes the actual App Store web pages instead of the limited RSS API
"""

import asyncio
import hashlib
import logging
import re
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional, Dict, Any, Tuple
from playwright.async_api import (
    async_playwright,
    Page,
    Browser,
    BrowserContext,
    TimeoutError as PlaywrightTimeout,
)

logger = logging.getLogger(__name__)


@dataclass
class BrowserPage:
    """Container for browser context and page to prevent memory leaks"""
    context: BrowserContext
    page: Page

    async def close(self):
        """Properly close both page and context"""
        try:
            if self.page:
                await self.page.close()
        except Exception as e:
            logger.debug(f"Error closing page: {e}")
        try:
            if self.context:
                await self.context.close()
        except Exception as e:
            logger.debug(f"Error closing context: {e}")


class AppStoreBrowserCrawler:
    """Crawl App Store reviews using browser automation for unlimited scraping"""

    def __init__(self, headless: bool = True):
        self.headless = headless
        self.browser: Optional[Browser] = None
        self.playwright = None
        self._page_lock = asyncio.Lock()  # Prevent race conditions when creating pages

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

    async def _create_page(self) -> BrowserPage:
        """Create a new page with anti-detection measures.

        Returns a BrowserPage dataclass containing both context and page
        to ensure proper cleanup and prevent memory leaks.
        """
        async with self._page_lock:  # Prevent race conditions
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

            return BrowserPage(context=context, page=page)

    @asynccontextmanager
    async def _managed_page(self):
        """Async context manager for automatic page cleanup.

        Usage:
            async with self._managed_page() as browser_page:
                await browser_page.page.goto(url)
        """
        browser_page = await self._create_page()
        try:
            yield browser_page
        finally:
            await browser_page.close()

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

        # Determine which countries to scrape - use more countries for better coverage
        # Always include the requested country first, then add high-volume countries
        if multi_country and max_reviews > 100:
            priority_countries = ['us', 'gb', 'ca', 'au', 'de', 'fr', 'jp', 'in', 'br', 'mx', 'es', 'it', 'nl', 'kr', 'ru', 'sg']
            # Always start with the requested country, then add other priority countries
            countries_to_scrape = [country] + [c for c in priority_countries if c != country]
            countries_to_scrape = countries_to_scrape[:12]  # Use 12 countries for better coverage
        else:
            countries_to_scrape = [country]

        logger.info(f"Starting browser crawl for app {app_id}, target: {max_reviews} reviews, countries: {len(countries_to_scrape)}")

        async with self._managed_page() as browser_page:
            page = browser_page.page

            try:
                for current_country in countries_to_scrape:
                    if len(all_reviews) >= max_reviews:
                        break

                    # Try multiple URL patterns - Apple changes these
                    url_patterns = [
                        f"https://apps.apple.com/{current_country}/app/id{app_id}",
                        f"https://apps.apple.com/{current_country}/app/app/id{app_id}",
                    ]

                    page_loaded = False
                    for url in url_patterns:
                        try:
                            logger.info(f"Trying URL: {url}")
                            response = await page.goto(url, wait_until='domcontentloaded', timeout=30000)
                            if response and response.status == 200:
                                page_loaded = True
                                break
                        except Exception as e:
                            logger.debug(f"URL {url} failed: {e}")
                            continue

                    if not page_loaded:
                        logger.warning(f"Could not load page for country {current_country}")
                        continue

                    # Wait for page to fully render
                    await asyncio.sleep(3)

                    # Try to click "See All Reviews" link if present
                    try:
                        see_all_selectors = [
                            'a:has-text("See All")',
                            'a[href*="see-all=reviews"]',
                            'button:has-text("See All")',
                            '.we-truncate__button',
                            'a:has-text("Ratings and Reviews")',
                        ]
                        for selector in see_all_selectors:
                            try:
                                link = page.locator(selector).first
                                if await link.is_visible(timeout=2000):
                                    await link.click()
                                    await asyncio.sleep(2)
                                    logger.info(f"Clicked 'See All' link for {current_country}")
                                    break
                            except (PlaywrightTimeout, Exception) as e:
                                logger.debug(f"Selector {selector} failed: {e}")
                                continue
                    except Exception as e:
                        logger.debug(f"No 'See All' link found: {e}")

                    # Extract reviews with multiple scroll attempts
                    total_new_this_country = 0
                    previous_count = 0
                    no_new_reviews_count = 0

                    for scroll_attempt in range(10):  # More scroll attempts
                        if len(all_reviews) >= max_reviews:
                            break

                        page_reviews = await self._extract_reviews(page, current_country)

                        new_count = 0
                        for review in page_reviews:
                            # Use deterministic hash for deduplication (not Python's randomized hash())
                            content_key = f"{review.get('author', '')}:{review.get('content', '')[:100]}"
                            review_id = hashlib.sha256(content_key.encode()).hexdigest()[:16]

                            if review_id in all_reviews:
                                continue

                            rating = review.get('rating', 0)
                            if min_rating and rating < min_rating:
                                continue
                            if max_rating and rating > max_rating:
                                continue

                            all_reviews[review_id] = review
                            new_count += 1

                        total_new_this_country += new_count

                        if new_count == 0:
                            no_new_reviews_count += 1
                            if no_new_reviews_count >= 3:
                                logger.info(f"No new reviews after {scroll_attempt + 1} scrolls, moving to next country")
                                break
                        else:
                            no_new_reviews_count = 0

                        if scroll_attempt < 9:
                            await self._scroll_page(page)
                            await asyncio.sleep(1.5)

                    logger.info(f"Country {current_country}: got {total_new_this_country} new reviews (total: {len(all_reviews)})")

                    # Delay between countries
                    await asyncio.sleep(1.5)

                logger.info(f"Browser crawl complete: {len(all_reviews)} reviews collected from {len(countries_to_scrape)} countries")

            except Exception as e:
                logger.exception(f"Error during browser crawl: {e}")

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
        """Extract review data from the page using multiple selector strategies"""
        reviews = []

        try:
            # Extract reviews using JavaScript with multiple selector strategies
            reviews_data = await page.evaluate(r"""
                () => {
                    const results = [];
                    const seenContent = new Set();

                    // Strategy 1: Look for review cards by common class patterns
                    const cardSelectors = [
                        '.we-customer-review',
                        '[class*="CustomerReview"]',
                        '[class*="customer-review"]',
                        '[class*="review-card"]',
                        '[class*="ReviewCard"]',
                        '.l-row[data-metrics-location*="review"]',
                        '[data-testid*="review"]',
                        // Svelte-based selectors (Apple uses Svelte)
                        '[class*="svelte"][class*="review"]',
                        '.we-truncate',
                    ];

                    let reviewCards = [];
                    for (const selector of cardSelectors) {
                        const cards = document.querySelectorAll(selector);
                        if (cards.length > 0) {
                            reviewCards = Array.from(cards);
                            console.log(`Found ${cards.length} cards with selector: ${selector}`);
                            break;
                        }
                    }

                    // Strategy 2: If no cards found, look for any element with star ratings nearby
                    if (reviewCards.length === 0) {
                        const starContainers = document.querySelectorAll('[aria-label*="star"], [aria-label*="Star"], figure[class*="star"]');
                        starContainers.forEach(star => {
                            // Get the parent container that likely holds the review
                            let container = star.closest('div[class]');
                            for (let i = 0; i < 5 && container; i++) {
                                const text = container.textContent || '';
                                if (text.length > 50 && text.length < 5000) {
                                    reviewCards.push(container);
                                    break;
                                }
                                container = container.parentElement;
                            }
                        });
                    }

                    // Strategy 3: Look for blockquote or review-like text patterns
                    if (reviewCards.length === 0) {
                        const textBlocks = document.querySelectorAll('blockquote, [class*="content"], [class*="text"], p');
                        textBlocks.forEach(block => {
                            const text = block.textContent || '';
                            // Reviews typically have 20-2000 chars
                            if (text.length > 20 && text.length < 2000) {
                                const parent = block.closest('div[class], article, section');
                                if (parent && !reviewCards.includes(parent)) {
                                    reviewCards.push(parent);
                                }
                            }
                        });
                    }

                    console.log(`Total potential review containers: ${reviewCards.length}`);

                    // Process each potential review card
                    reviewCards.forEach((card, index) => {
                        try {
                            const cardText = card.textContent || '';

                            // Skip if too short or too long
                            if (cardText.length < 20 || cardText.length > 10000) return;

                            // Extract author - look for common patterns
                            let author = '';
                            const authorSelectors = [
                                '.we-customer-review__user',
                                '[class*="author"]',
                                '[class*="Author"]',
                                '[class*="user"]',
                                '[class*="name"]',
                                'span[class*="svelte"]',
                            ];
                            for (const sel of authorSelectors) {
                                const el = card.querySelector(sel);
                                if (el) {
                                    const text = el.textContent.trim();
                                    if (text && text.length < 100 && !text.includes('\n')) {
                                        author = text;
                                        break;
                                    }
                                }
                            }

                            // Extract title
                            let title = '';
                            const titleSelectors = [
                                '.we-customer-review__title',
                                '[class*="title"]',
                                '[class*="Title"]',
                                'h3', 'h4',
                            ];
                            for (const sel of titleSelectors) {
                                const el = card.querySelector(sel);
                                if (el) {
                                    const text = el.textContent.trim();
                                    if (text && text.length < 200) {
                                        title = text;
                                        break;
                                    }
                                }
                            }

                            // Extract content/body
                            let content = '';
                            const contentSelectors = [
                                '.we-customer-review__body',
                                '[class*="body"]',
                                '[class*="content"]',
                                '[class*="text"]',
                                'p',
                                'blockquote',
                            ];
                            for (const sel of contentSelectors) {
                                const el = card.querySelector(sel);
                                if (el) {
                                    const text = el.textContent.trim();
                                    if (text && text.length > 10) {
                                        content = text;
                                        break;
                                    }
                                }
                            }

                            // If no specific content found, use card text minus author/title
                            if (!content) {
                                content = cardText.replace(author, '').replace(title, '').trim();
                            }

                            // Extract rating from aria-label or star count
                            let rating = 0;

                            // Look for aria-label with star info
                            const ariaEls = card.querySelectorAll('[aria-label]');
                            ariaEls.forEach(el => {
                                const label = el.getAttribute('aria-label') || '';
                                const match = label.match(/(\d)\s*(?:out of 5\s*)?stars?/i);
                                if (match) {
                                    rating = parseInt(match[1]);
                                }
                            });

                            // Alternative: count filled star elements
                            if (rating === 0) {
                                const stars = card.querySelectorAll('[class*="star"][class*="full"], [class*="star"][aria-hidden="false"], svg[class*="star"]');
                                if (stars.length > 0 && stars.length <= 5) {
                                    rating = stars.length;
                                }
                            }

                            // Look for figure elements with star rating
                            if (rating === 0) {
                                const figures = card.querySelectorAll('figure[class*="star"], [role="img"][aria-label*="star"]');
                                figures.forEach(fig => {
                                    const label = fig.getAttribute('aria-label') || '';
                                    const match = label.match(/(\d)/);
                                    if (match) {
                                        rating = parseInt(match[1]);
                                    }
                                });
                            }

                            // Extract date
                            let date = '';
                            let dateISO = '';
                            const timeEl = card.querySelector('time');
                            if (timeEl) {
                                date = timeEl.textContent.trim();
                                dateISO = timeEl.getAttribute('datetime') || '';
                            }

                            // Dedupe by content hash
                            const contentKey = content.substring(0, 100);
                            if (seenContent.has(contentKey)) return;

                            // Must have content to be valid
                            if (content && content.length > 10) {
                                seenContent.add(contentKey);
                                // Use null for missing/invalid ratings to avoid biasing analytics
                                // (0 would pull down averages, 5 would pull up - null lets analytics filter them out)
                                const validRating = (rating >= 1 && rating <= 5) ? rating : null;
                                results.push({
                                    id: `browser_${index}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                                    date: date,
                                    dateISO: dateISO,
                                    author: author || 'Anonymous',
                                    content: content.substring(0, 5000),
                                    rating: validRating,
                                    title: title,
                                });
                            }
                        } catch (e) {
                            console.error('Error extracting review:', e);
                        }
                    });

                    console.log(`Extracted ${results.length} valid reviews`);
                    return results;
                }
            """)

            # Handle null/empty result from JavaScript evaluation
            if not reviews_data:
                logger.warning(f"No reviews extracted from {country} page (JS returned null/empty)")
                return reviews

            for review in reviews_data:
                review['country'] = country
                review['source'] = 'browser'
                reviews.append(review)

            logger.info(f"Extracted {len(reviews)} reviews from {country} page view")

        except PlaywrightTimeout:
            logger.warning("Timeout waiting for review elements")
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

        async with self._managed_page() as browser_page:
            page = browser_page.page

            try:
                await page.goto(reviews_url, wait_until='networkidle', timeout=60000)
                await asyncio.sleep(3)

                # Try to find and click "Version History" link
                try:
                    version_link = page.locator('a:has-text("Version History"), a[href*="version-history"]')
                    if await version_link.count() > 0:
                        await version_link.first.click()
                        await asyncio.sleep(2)
                except (PlaywrightTimeout, Exception) as e:
                    logger.debug(f"Version History link not found or not clickable: {e}")

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

        async with self._managed_page() as browser_page:
            page = browser_page.page

            try:
                await page.goto(app_url, wait_until='networkidle', timeout=60000)
                await asyncio.sleep(3)

                # Try to expand privacy section
                try:
                    privacy_link = page.locator('a:has-text("See Details"), a:has-text("App Privacy")')
                    if await privacy_link.count() > 0:
                        await privacy_link.first.click()
                        await asyncio.sleep(2)
                except (PlaywrightTimeout, Exception) as e:
                    logger.debug(f"Privacy section link not found or not clickable: {e}")

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

        return labels
