"""Rate limiter for crawl requests."""

import asyncio
from datetime import datetime, timedelta
from typing import Optional
from collections import deque
import logging

logger = logging.getLogger(__name__)


class RateLimiter:
    """
    Async rate limiter with per-domain and global limits.

    Features:
    - Sliding window rate limiting
    - Per-domain limits for different targets
    - Global concurrent request limit
    - Automatic backoff on 429 responses
    """

    def __init__(
        self,
        requests_per_minute: int = 30,
        max_concurrent: int = 5,
        per_domain_rpm: Optional[dict[str, int]] = None,
    ):
        """
        Initialize rate limiter.

        Args:
            requests_per_minute: Global requests per minute limit
            max_concurrent: Maximum concurrent requests
            per_domain_rpm: Optional per-domain limits, e.g., {"apple.com": 10}
        """
        self.requests_per_minute = requests_per_minute
        self.max_concurrent = max_concurrent
        self.per_domain_rpm = per_domain_rpm or {}

        # Sliding window for global requests
        self._global_requests: deque[datetime] = deque()

        # Per-domain sliding windows
        self._domain_requests: dict[str, deque[datetime]] = {}

        # Semaphore for concurrent request limiting
        self._semaphore = asyncio.Semaphore(max_concurrent)

        # Lock for thread-safe operations
        self._lock = asyncio.Lock()

        # Backoff tracking
        self._backoff_until: dict[str, datetime] = {}

    def _extract_domain(self, url: str) -> str:
        """Extract domain from URL."""
        from urllib.parse import urlparse
        parsed = urlparse(url)
        return parsed.netloc or url

    def _clean_old_requests(self, requests: deque[datetime], window_seconds: int = 60) -> None:
        """Remove requests outside the sliding window."""
        cutoff = datetime.utcnow() - timedelta(seconds=window_seconds)
        while requests and requests[0] < cutoff:
            requests.popleft()

    async def acquire(self, url: str) -> None:
        """
        Acquire permission to make a request.

        Will block if rate limits are exceeded.

        Args:
            url: The URL being requested (for per-domain limiting)
        """
        domain = self._extract_domain(url)

        # Check backoff
        async with self._lock:
            if domain in self._backoff_until:
                backoff_time = self._backoff_until[domain]
                if datetime.utcnow() < backoff_time:
                    wait_seconds = (backoff_time - datetime.utcnow()).total_seconds()
                    logger.info(f"Backing off for {domain}: {wait_seconds:.1f}s remaining")
                    await asyncio.sleep(wait_seconds)
                del self._backoff_until[domain]

        # Acquire semaphore for concurrent limiting
        await self._semaphore.acquire()

        try:
            async with self._lock:
                # Clean old requests
                self._clean_old_requests(self._global_requests)

                # Check global limit
                while len(self._global_requests) >= self.requests_per_minute:
                    # Calculate wait time
                    oldest = self._global_requests[0]
                    wait_until = oldest + timedelta(seconds=60)
                    wait_seconds = (wait_until - datetime.utcnow()).total_seconds()

                    if wait_seconds > 0:
                        logger.debug(f"Global rate limit: waiting {wait_seconds:.1f}s")
                        await asyncio.sleep(wait_seconds)

                    self._clean_old_requests(self._global_requests)

                # Check per-domain limit
                if domain in self.per_domain_rpm:
                    if domain not in self._domain_requests:
                        self._domain_requests[domain] = deque()

                    domain_requests = self._domain_requests[domain]
                    self._clean_old_requests(domain_requests)

                    domain_limit = self.per_domain_rpm[domain]
                    while len(domain_requests) >= domain_limit:
                        oldest = domain_requests[0]
                        wait_until = oldest + timedelta(seconds=60)
                        wait_seconds = (wait_until - datetime.utcnow()).total_seconds()

                        if wait_seconds > 0:
                            logger.debug(f"Domain rate limit ({domain}): waiting {wait_seconds:.1f}s")
                            await asyncio.sleep(wait_seconds)

                        self._clean_old_requests(domain_requests)

                # Record this request
                now = datetime.utcnow()
                self._global_requests.append(now)

                if domain in self.per_domain_rpm:
                    if domain not in self._domain_requests:
                        self._domain_requests[domain] = deque()
                    self._domain_requests[domain].append(now)

        finally:
            pass  # Keep semaphore acquired - release() must be called

    def release(self) -> None:
        """Release the concurrent request slot."""
        self._semaphore.release()

    async def backoff(self, url: str, seconds: float = 60.0) -> None:
        """
        Add backoff time for a domain after receiving 429.

        Args:
            url: The URL that returned 429
            seconds: How long to back off
        """
        domain = self._extract_domain(url)
        async with self._lock:
            self._backoff_until[domain] = datetime.utcnow() + timedelta(seconds=seconds)
            logger.warning(f"Added {seconds}s backoff for {domain}")

    async def __aenter__(self) -> "RateLimiter":
        """Context manager entry - no-op, use acquire() with specific URL."""
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        """Context manager exit."""
        pass


class DomainRateLimiter:
    """
    Simpler rate limiter for a specific domain.

    Use this when you only need to limit requests to one target.
    """

    def __init__(self, requests_per_minute: int = 30, max_concurrent: int = 3):
        self.rpm = requests_per_minute
        self._requests: deque[datetime] = deque()
        self._semaphore = asyncio.Semaphore(max_concurrent)
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        """Acquire permission to make a request."""
        await self._semaphore.acquire()

        async with self._lock:
            # Clean old requests
            cutoff = datetime.utcnow() - timedelta(seconds=60)
            while self._requests and self._requests[0] < cutoff:
                self._requests.popleft()

            # Wait if needed
            while len(self._requests) >= self.rpm:
                oldest = self._requests[0]
                wait_until = oldest + timedelta(seconds=60)
                wait_seconds = max(0, (wait_until - datetime.utcnow()).total_seconds())

                if wait_seconds > 0:
                    await asyncio.sleep(wait_seconds)

                # Clean again
                cutoff = datetime.utcnow() - timedelta(seconds=60)
                while self._requests and self._requests[0] < cutoff:
                    self._requests.popleft()

            # Record request
            self._requests.append(datetime.utcnow())

    def release(self) -> None:
        """Release concurrent slot."""
        self._semaphore.release()
