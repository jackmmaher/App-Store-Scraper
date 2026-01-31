"""Base crawler class with common functionality."""

import asyncio
import logging
from abc import ABC, abstractmethod
from typing import Any, Optional
from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode

from utils.rate_limiter import RateLimiter
from utils.cache import CacheManager

logger = logging.getLogger(__name__)


class BaseCrawler(ABC):
    """
    Base class for all crawlers.

    Provides common functionality:
    - Browser automation via Crawl4AI
    - Rate limiting
    - Caching
    - Error handling
    """

    def __init__(
        self,
        rate_limiter: Optional[RateLimiter] = None,
        cache_manager: Optional[CacheManager] = None,
        headless: bool = True,
    ):
        """
        Initialize base crawler.

        Args:
            rate_limiter: Optional rate limiter instance
            cache_manager: Optional cache manager instance
            headless: Whether to run browser in headless mode
        """
        self.rate_limiter = rate_limiter or RateLimiter()
        self.cache_manager = cache_manager
        self.headless = headless

        # Browser configuration for Crawl4AI
        self.browser_config = BrowserConfig(
            browser_type="chromium",
            headless=headless,
            viewport_width=1280,
            viewport_height=800,
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            # Extra args for stability
            extra_args=[
                "--disable-gpu",
                "--disable-dev-shm-usage",
                "--no-sandbox",
                "--disable-setuid-sandbox",
            ],
        )

        # Default crawler run config
        self.default_run_config = CrawlerRunConfig(
            cache_mode=CacheMode.BYPASS,  # We handle caching ourselves
            wait_until="networkidle",
            page_timeout=60000,  # 60 second timeout
            verbose=False,
        )

    @property
    @abstractmethod
    def cache_type(self) -> str:
        """Return the cache type identifier for this crawler."""
        pass

    async def crawl_page(
        self,
        url: str,
        run_config: Optional[CrawlerRunConfig] = None,
        js_code: Optional[str] = None,
        wait_for: Optional[str] = None,
    ) -> Optional[dict]:
        """
        Crawl a single page using Crawl4AI.

        Args:
            url: URL to crawl
            run_config: Optional custom run configuration
            js_code: Optional JavaScript to execute on page
            wait_for: Optional CSS selector to wait for

        Returns:
            Dict with crawl results or None on failure
        """
        await self.rate_limiter.acquire(url)

        try:
            config = run_config or self.default_run_config

            # Add JS code and wait_for if provided
            if js_code:
                config = CrawlerRunConfig(
                    **{**config.__dict__, "js_code": js_code}
                )
            if wait_for:
                config = CrawlerRunConfig(
                    **{**config.__dict__, "wait_for": f"css:{wait_for}"}
                )

            async with AsyncWebCrawler(config=self.browser_config) as crawler:
                result = await crawler.arun(url=url, config=config)

                if result.success:
                    return {
                        "url": url,
                        "html": result.html,
                        "markdown": result.markdown,
                        "cleaned_html": result.cleaned_html,
                        "links": result.links,
                        "media": result.media,
                        "metadata": result.metadata,
                    }
                else:
                    logger.error(f"Crawl failed for {url}: {result.error_message}")
                    return None

        except Exception as e:
            logger.error(f"Error crawling {url}: {e}")
            return None

        finally:
            self.rate_limiter.release()

    async def crawl_with_pagination(
        self,
        base_url: str,
        page_param: str = "page",
        max_pages: int = 10,
        items_selector: str = "",
        next_button_selector: Optional[str] = None,
        js_scroll: bool = False,
    ) -> list[dict]:
        """
        Crawl multiple pages with pagination support.

        Args:
            base_url: Base URL to paginate
            page_param: Query parameter for page number (if using URL pagination)
            max_pages: Maximum pages to crawl
            items_selector: CSS selector for items to extract
            next_button_selector: CSS selector for next button (for click-based pagination)
            js_scroll: Whether to use infinite scroll

        Returns:
            List of crawl results from all pages
        """
        results = []

        if js_scroll:
            # Infinite scroll pagination
            scroll_js = """
            async () => {
                let lastHeight = document.body.scrollHeight;
                let scrollCount = 0;
                const maxScrolls = %d;

                while (scrollCount < maxScrolls) {
                    window.scrollTo(0, document.body.scrollHeight);
                    await new Promise(r => setTimeout(r, 2000));

                    const newHeight = document.body.scrollHeight;
                    if (newHeight === lastHeight) break;

                    lastHeight = newHeight;
                    scrollCount++;
                }
            }
            """ % max_pages

            result = await self.crawl_page(base_url, js_code=scroll_js)
            if result:
                results.append(result)

        elif next_button_selector:
            # Click-based pagination
            for page in range(max_pages):
                if page == 0:
                    result = await self.crawl_page(base_url)
                else:
                    # Click next button
                    click_js = f"""
                    const btn = document.querySelector('{next_button_selector}');
                    if (btn && !btn.disabled) btn.click();
                    """
                    result = await self.crawl_page(base_url, js_code=click_js)

                if result:
                    results.append(result)
                else:
                    break

                # Small delay between pages
                await asyncio.sleep(0.5)

        else:
            # URL-based pagination
            for page in range(1, max_pages + 1):
                separator = "&" if "?" in base_url else "?"
                url = f"{base_url}{separator}{page_param}={page}"

                result = await self.crawl_page(url)
                if result:
                    results.append(result)
                else:
                    break

                # Small delay between pages
                await asyncio.sleep(0.5)

        return results

    async def get_cached_or_crawl(
        self,
        identifier: str,
        crawl_func,
        params: Optional[dict] = None,
        force_refresh: bool = False,
    ) -> Any:
        """
        Get data from cache or crawl if not cached.

        Args:
            identifier: Cache identifier
            crawl_func: Async function to call if cache miss
            params: Additional cache parameters
            force_refresh: Skip cache and always crawl

        Returns:
            Cached or freshly crawled data
        """
        if self.cache_manager and not force_refresh:
            cached = await self.cache_manager.get(self.cache_type, identifier, params)
            if cached:
                logger.info(f"Cache hit for {self.cache_type}:{identifier}")
                return cached

        # Crawl fresh data
        logger.info(f"Crawling fresh data for {self.cache_type}:{identifier}")
        data = await crawl_func()

        # Cache the result
        if self.cache_manager and data:
            await self.cache_manager.set(self.cache_type, identifier, data, params)

        return data

    @abstractmethod
    async def crawl(self, **kwargs) -> Any:
        """
        Perform the crawl operation.

        Must be implemented by subclasses.
        """
        pass
