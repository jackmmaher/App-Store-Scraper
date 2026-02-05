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
        try:
            self.playwright = await async_playwright().start()
            self.browser = await self.playwright.chromium.launch(
                headless=self.headless,
                args=[
                    '--disable-blink-features=AutomationControlled',
                    '--disable-dev-shm-usage',
                    '--no-sandbox',
                ]
            )
        except Exception as e:
            logger.error(f"Failed to start browser: {e}")
            # Clean up partial initialization
            if self.playwright:
                try:
                    await self.playwright.stop()
                except Exception:
                    pass
                self.playwright = None
            raise RuntimeError(f"Browser initialization failed: {e}. Run 'playwright install chromium' if browsers are not installed.")
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
        reviews_lock = asyncio.Lock()

        # Determine which countries to scrape - use more countries for better coverage
        # Always include the requested country first, then add high-volume countries
        if multi_country and max_reviews > 100:
            priority_countries = ['us', 'gb', 'ca', 'au', 'de', 'fr', 'jp', 'in', 'br', 'mx', 'es', 'it', 'nl', 'kr', 'ru', 'sg']
            # Always start with the requested country, then add other priority countries
            countries_to_scrape = [country] + [c for c in priority_countries if c != country]

            # Scale browser countries based on target
            if max_reviews >= 3000:
                countries_to_scrape = countries_to_scrape[:16]
            elif max_reviews >= 1500:
                countries_to_scrape = countries_to_scrape[:12]
            else:
                countries_to_scrape = countries_to_scrape[:8]
        else:
            countries_to_scrape = [country]

        logger.info(f"Starting browser crawl for app {app_id}, target: {max_reviews} reviews, countries: {len(countries_to_scrape)}")

        # Process each country with a fresh browser page to avoid stale state
        for country_index, current_country in enumerate(countries_to_scrape):
            if len(all_reviews) >= max_reviews:
                logger.info(f"Reached target of {max_reviews} reviews, stopping early")
                break

            logger.info(f"Starting country {country_index + 1}/{len(countries_to_scrape)}: {current_country}")

            try:
                async with self._managed_page() as browser_page:
                    page = browser_page.page

                    # Try to load the app page for this country
                    url = f"https://apps.apple.com/{current_country}/app/id{app_id}"

                    page_loaded = False
                    try:
                        logger.info(f"Trying URL: {url}")
                        response = await page.goto(url, wait_until='domcontentloaded', timeout=30000)

                        if response:
                            # Check for redirects - Apple may redirect to different country
                            final_url = page.url
                            if response.status == 200:
                                page_loaded = True
                                if final_url != url:
                                    logger.info(f"Redirected to: {final_url}")
                            elif response.status in (301, 302, 303, 307, 308):
                                # Follow redirects - page might have loaded anyway
                                page_loaded = True
                                logger.info(f"Redirect {response.status} to: {final_url}")
                            else:
                                logger.warning(f"Page returned status {response.status} for {current_country}")
                        else:
                            logger.warning(f"No response received for {current_country}")

                    except Exception as e:
                        logger.warning(f"Failed to load page for {current_country}: {e}")

                    if not page_loaded:
                        logger.warning(f"Could not load page for country {current_country}")
                        continue

                    # Wait for page to fully render
                    await asyncio.sleep(3)

                    # Try to click "See All Reviews" link if present
                    try:
                        # Try proper Playwright locator API first (more resilient than CSS pseudo-selectors)
                        see_all_clicked = False
                        for link_text in ['See All', 'Ratings and Reviews']:
                            try:
                                see_all = page.locator('a', has_text=link_text).first
                                if await see_all.is_visible(timeout=2000):
                                    await see_all.click(timeout=5000)
                                    await asyncio.sleep(2)
                                    logger.info(f"Clicked '{link_text}' link for {current_country}")
                                    see_all_clicked = True
                                    break
                            except (PlaywrightTimeout, Exception) as e:
                                logger.debug(f"Link text '{link_text}' failed: {e}")
                                continue

                        # Fallback: try CSS selectors
                        if not see_all_clicked:
                            fallback_selectors = [
                                'a[href*="see-all=reviews"]',
                                '.we-truncate__button',
                            ]
                            for selector in fallback_selectors:
                                try:
                                    link = page.locator(selector).first
                                    if await link.is_visible(timeout=2000):
                                        await link.click()
                                        await asyncio.sleep(2)
                                        logger.info(f"Clicked fallback selector for {current_country}")
                                        break
                                except (PlaywrightTimeout, Exception) as e:
                                    logger.debug(f"Fallback selector {selector} failed: {e}")
                                    continue
                    except Exception as e:
                        logger.warning(f"Could not find 'See All' button: {e}")

                    # Extract reviews with multiple scroll attempts
                    total_new_this_country = 0
                    no_new_reviews_count = 0

                    for scroll_attempt in range(25):  # Increased from 10 to 25 for better coverage
                        if len(all_reviews) >= max_reviews:
                            break

                        page_reviews = await self._extract_reviews(page, current_country)

                        new_count = 0
                        for review in page_reviews:
                            # Use deterministic hash for deduplication (not Python's randomized hash())
                            content_key = f"{review.get('author', '')}:{review.get('content', '')[:100]}"
                            review_id = hashlib.sha256(content_key.encode()).hexdigest()[:16]

                            async with reviews_lock:
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
                            if no_new_reviews_count >= 5:  # Increased from 3 to 5 for lazy-loading tolerance
                                logger.info(f"No new reviews after {scroll_attempt + 1} scrolls, moving to next country")
                                break
                        else:
                            no_new_reviews_count = 0

                        if scroll_attempt < 24:
                            await self._scroll_page(page)
                            # Longer wait for early scrolls when page is still loading
                            wait_time = 2.5 if scroll_attempt < 5 else 1.5
                            await asyncio.sleep(wait_time)

                    logger.info(f"Country {current_country}: got {total_new_this_country} new reviews (total: {len(all_reviews)})")

            except Exception as e:
                logger.error(f"Failed to scrape country {current_country}: {e}")
                continue  # Don't fail entire operation - try next country

            # Delay between countries
            await asyncio.sleep(1.5)

        logger.info(f"Browser crawl complete: {len(all_reviews)} reviews collected from {len(countries_to_scrape)} countries")

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

                if isinstance(data, dict) and data.get('results'):
                    result = data['results'][0]
                    if isinstance(result, dict):
                        return result.get('trackViewUrl')
        except Exception as e:
            logger.error(f"Error getting app URL: {e}")

        return None

    async def _extract_reviews(self, page: Page, country: str) -> List[dict]:
        """Extract review data from the page using updated selectors for Apple's Svelte-based DOM"""
        reviews = []

        try:
            # Extract reviews using JavaScript with multi-strategy selectors for Apple's Svelte-based DOM
            reviews_data = await page.evaluate(r"""
                () => {
                    const results = [];
                    const seenContent = new Set();


                    // Strategy 1: Modern Apple DOM - review containers by common patterns
                    let reviewCards = Array.from(document.querySelectorAll('[class*="review"], [class*="Review"], [data-test*="review"]'));
                    reviewCards = reviewCards.filter(el => el.textContent.length > 50 && el.querySelector('*'));

                    // Strategy 2: Original selectors - article elements with review ID
                    if (reviewCards.length === 0) {
                        reviewCards = Array.from(document.querySelectorAll('article[aria-labelledby^="review-"]'));
                    }

                    // Strategy 3: Star rating elements - traverse up
                    if (reviewCards.length === 0) {
                        const starEls = document.querySelectorAll('[aria-label*="Star"], [aria-label*="star"], figure[role="img"]');
                        const seen = new Set();
                        starEls.forEach(star => {
                            let parent = star.closest('article, section, [class*="review"]');
                            if (!parent) { parent = star.parentElement; for (let i=0;i<5&&parent;i++){if(parent.textContent.length>80)break;parent=parent.parentElement;} }
                            if (parent && !seen.has(parent) && parent.textContent.length > 50) { seen.add(parent); reviewCards.push(parent); }
                        });
                    }

                    // Strategy 4: elements with review-header class
                    if (reviewCards.length === 0) {
                        const reviewHeaders = document.querySelectorAll('.review-header');
                        reviewHeaders.forEach(header => {
                            const article = header.closest('article');
                            if (article && !reviewCards.includes(article)) {
                                reviewCards.push(article);
                            }
                        });
                        console.log('Strategy 4: Found ' + reviewCards.length + ' review cards via .review-header');
                    }

                    // Strategy 5: ol.stars with aria-label and traverse up
                    if (reviewCards.length === 0) {
                        const starLists = document.querySelectorAll('ol.stars[aria-label*="Star"]');
                        starLists.forEach(stars => {
                            const article = stars.closest('article');
                            if (article && !reviewCards.includes(article)) {
                                reviewCards.push(article);
                            }
                        });
                        console.log('Strategy 5: Found ' + reviewCards.length + ' review cards via ol.stars');
                    }

                    if (reviewCards.length === 0) { console.log('WARNING: No review cards found with any strategy'); }
                    console.log('Total cards: ' + reviewCards.length);

                    // Process each review card
                    reviewCards.forEach((card, index) => {
                        try {
                            // Extract title - try multiple selectors
                            let title = '';
                            const titleSels = ['h3.title .multiline-clamp__text', 'h3[id^="review-"] .multiline-clamp__text', 'h3.title', 'h3[id^="review-"]', '[class*="title"] h3', 'h3'];
                            for (const sel of titleSels) {
                                const el = card.querySelector(sel);
                                if (el && el.textContent.trim().length > 0) { title = el.textContent.trim(); break; }
                            }

                            // Extract rating - try multiple approaches
                            let rating = 0;
                            const starsEl = card.querySelector('ol.stars[aria-label], [aria-label*="Star"], [aria-label*="star"]');
                            if (starsEl) {
                                const ariaLabel = starsEl.getAttribute('aria-label') || '';
                                const match = ariaLabel.match(/(\d+)\s*Stars?/i);
                                if (match) {
                                    rating = parseInt(match[1]);
                                }
                            }

                            // Approach 2: figure with aria-label
                            if (rating === 0) {
                                const figureEl = card.querySelector('figure[aria-label*="star" i], figure[role="img"][aria-label]');
                                if (figureEl) {
                                    const al = figureEl.getAttribute('aria-label') || '';
                                    const m = al.match(/(\d+)/);
                                    if (m) rating = parseInt(m[1]);
                                }
                            }

                            // Approach 3: Count filled star elements
                            if (rating === 0) {
                                const starItems = card.querySelectorAll('ol.stars li.star, [class*="star-filled"], [class*="StarFilled"]');
                                if (starItems.length > 0 && starItems.length <= 5) {
                                    rating = starItems.length;
                                }
                            }

                            // Extract date - try multiple selectors
                            let date = '';
                            let dateISO = '';
                            const timeEl = card.querySelector('time.date, time[datetime], [class*="date"] time, time');
                            if (timeEl) {
                                date = timeEl.textContent.trim();
                                dateISO = timeEl.getAttribute('datetime') || '';
                            }

                            // Extract author - try multiple selectors
                            let author = '';
                            const authorSels = ['p.author', '.author', '[class*="author"]', '[class*="Author"]'];
                            for (const sel of authorSels) {
                                const el = card.querySelector(sel);
                                if (el && el.textContent.trim().length > 0) { author = el.textContent.trim(); break; }
                            }

                            // Extract content - try multiple selectors
                            let content = '';
                            const contentEl = card.querySelector('p[data-testid="truncate-text"], div.content p.content, div.content p, [class*="content"] p, [class*="body"] p');
                            if (contentEl) {
                                content = contentEl.textContent.trim();
                            }

                            // Fallback: get text from content div
                            if (!content) {
                                const contentDiv = card.querySelector('div.content, [class*="content"], [class*="body"]');
                                if (contentDiv) {
                                    content = contentDiv.textContent.trim();
                                }
                            }

                            // Skip if no meaningful content
                            if (!content || content.length < 10) return;

                            // Dedupe by content
                            const contentKey = content.substring(0, 100);
                            if (seenContent.has(contentKey)) return;
                            seenContent.add(contentKey);

                            // Get review ID from aria-labelledby if available
                            const ariaLabelledBy = card.getAttribute('aria-labelledby') || '';
                            const reviewIdMatch = ariaLabelledBy.match(/review-(\d+)/);
                            const reviewId = reviewIdMatch ? reviewIdMatch[1] : `browser_${index}_${Date.now()}`;

                            const validRating = (rating >= 1 && rating <= 5) ? rating : null;
                            results.push({
                                id: reviewId,
                                date: date,
                                dateISO: dateISO,
                                author: author || 'Anonymous',
                                content: content.substring(0, 5000),
                                rating: validRating,
                                title: title,
                            });
                        } catch (e) {
                            console.error('Error extracting review:', e);
                        }
                    });

                    console.log('Extracted ' + results.length + ' valid reviews');
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
        """Scroll down to load more reviews - handles both modal and page scrolling"""
        try:
            # First, try to find and scroll the reviews modal container
            # Apple's "See All Reviews" opens a modal with its own scrollable container
            modal_scrolled = await page.evaluate("""
                () => {
                    // Common modal/dialog selectors for Apple's App Store
                    const modalSelectors = [
                        // Dialog/modal containers
                        '[role="dialog"]',
                        '[role="dialog"] [class*="scroll"]',
                        '[aria-modal="true"]',
                        // Apple-specific modal content areas
                        '.modal__content',
                        '.we-modal__content',
                        '[class*="modal"] [class*="content"]',
                        '[class*="dialog"] [class*="content"]',
                        // Scrollable containers within modals
                        '[class*="review"] [class*="scroll"]',
                        '[class*="reviews-list"]',
                        // Generic scrollable containers that might contain reviews
                        '[class*="infinite-scroll"]',
                        '[class*="virtual-scroll"]',
                    ];

                    for (const selector of modalSelectors) {
                        const containers = document.querySelectorAll(selector);
                        for (const container of containers) {
                            // Check if this container is scrollable
                            const isScrollable = container.scrollHeight > container.clientHeight;
                            const hasReviews = container.querySelector('article[aria-labelledby^="review-"]') !== null ||
                                             container.querySelector('.review-header') !== null;

                            if (isScrollable && (hasReviews || container.closest('[role="dialog"]'))) {
                                // Scroll this container
                                const scrollAmount = container.clientHeight * 0.8;
                                container.scrollTop += scrollAmount;
                                console.log(`Scrolled modal container: ${selector}, by ${scrollAmount}px`);
                                return { scrolled: true, selector: selector, scrollTop: container.scrollTop };
                            }
                        }
                    }

                    // Also check for any scrollable parent of review articles
                    const reviewArticle = document.querySelector('article[aria-labelledby^="review-"]');
                    if (reviewArticle) {
                        let parent = reviewArticle.parentElement;
                        while (parent && parent !== document.body) {
                            if (parent.scrollHeight > parent.clientHeight + 10) {
                                const scrollAmount = parent.clientHeight * 0.8;
                                parent.scrollTop += scrollAmount;
                                console.log(`Scrolled review parent container, by ${scrollAmount}px`);
                                return { scrolled: true, selector: 'review-parent', scrollTop: parent.scrollTop };
                            }
                            parent = parent.parentElement;
                        }
                    }

                    return { scrolled: false };
                }
            """)

            if modal_scrolled and modal_scrolled.get('scrolled'):
                logger.debug(f"Scrolled modal container: {modal_scrolled.get('selector')}")
                # Wait for lazy-loaded content in modal
                await asyncio.sleep(0.8)
                return

            # Fallback: scroll the main page (for non-modal review pages)
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
