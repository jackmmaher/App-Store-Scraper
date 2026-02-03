"""
Base Crawler - Simplified version using httpx instead of crawl4ai
Works with Python 3.14 without compilation issues
"""

import asyncio
import logging
import random
from typing import Any, Optional
import httpx

logger = logging.getLogger(__name__)


class BaseCrawler:
    """Base class for all crawlers using httpx"""

    def __init__(self, max_retries: int = 3, base_delay: float = 1.0):
        self.client: Optional[httpx.AsyncClient] = None
        self.max_retries = max_retries
        self.base_delay = base_delay
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
        }

    async def __aenter__(self):
        self.client = httpx.AsyncClient(
            headers=self.headers,
            timeout=httpx.Timeout(60.0, connect=10.0),
            follow_redirects=True,
            limits=httpx.Limits(max_keepalive_connections=5, max_connections=10),
        )
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.client:
            await self.client.aclose()

    async def _retry_with_backoff(self, coro_factory, url: str):
        """Execute a coroutine with exponential backoff retry"""
        last_exception = None

        for attempt in range(self.max_retries):
            try:
                return await coro_factory()
            except httpx.HTTPStatusError as e:
                last_exception = e
                if e.response.status_code == 429:
                    # Rate limited - wait longer
                    delay = self.base_delay * (2 ** attempt) + random.uniform(1, 3)
                    logger.warning(f"Rate limited on {url}, waiting {delay:.1f}s (attempt {attempt + 1}/{self.max_retries})")
                    await asyncio.sleep(delay)
                elif e.response.status_code >= 500:
                    # Server error - retry with backoff
                    delay = self.base_delay * (2 ** attempt)
                    logger.warning(f"Server error {e.response.status_code} on {url}, retrying in {delay:.1f}s")
                    await asyncio.sleep(delay)
                else:
                    # Client error (4xx except 429) - don't retry
                    logger.error(f"HTTP {e.response.status_code} error fetching {url}: {e}")
                    return None
            except (httpx.ConnectError, httpx.ReadTimeout, httpx.ConnectTimeout) as e:
                last_exception = e
                delay = self.base_delay * (2 ** attempt)
                logger.warning(f"Connection error on {url}, retrying in {delay:.1f}s (attempt {attempt + 1}/{self.max_retries}): {e}")
                await asyncio.sleep(delay)
            except Exception as e:
                logger.error(f"Unexpected error fetching {url}: {e}")
                return None

        logger.error(f"Failed to fetch {url} after {self.max_retries} attempts: {last_exception}")
        return None

    async def fetch(self, url: str, extra_headers: Optional[dict] = None) -> Optional[str]:
        """Fetch a URL and return the content with retry logic"""
        if not self.client:
            raise RuntimeError("Crawler not initialized. Use 'async with' context.")

        async def do_fetch():
            headers = {**self.headers, **(extra_headers or {})}
            response = await self.client.get(url, headers=headers)
            response.raise_for_status()
            return response.text

        return await self._retry_with_backoff(do_fetch, url)

    async def fetch_json(self, url: str, extra_headers: Optional[dict] = None) -> Optional[Any]:
        """Fetch a URL and return JSON with retry logic"""
        if not self.client:
            raise RuntimeError("Crawler not initialized. Use 'async with' context.")

        async def do_fetch():
            headers = {**self.headers, **(extra_headers or {})}
            response = await self.client.get(url, headers=headers)
            response.raise_for_status()
            return response.json()

        result = await self._retry_with_backoff(do_fetch, url)
        if result is None:
            return None

        try:
            return result
        except Exception as e:
            logger.error(f"Error parsing JSON from {url}: {e}")
            return None
