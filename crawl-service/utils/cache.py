"""Cache manager for crawled content using Supabase."""

import hashlib
import json
import logging
from datetime import datetime, timedelta
from typing import Any, Optional
from pydantic import BaseModel

logger = logging.getLogger(__name__)


class CacheEntry(BaseModel):
    """A cached entry."""
    key: str
    data: dict
    created_at: datetime
    expires_at: datetime
    hit_count: int = 0


class CacheManager:
    """
    Cache manager for storing crawled content in Supabase.

    Features:
    - TTL-based expiration
    - Content deduplication via hashing
    - Hit counting for analytics
    - Async operations
    """

    def __init__(
        self,
        supabase_client: Any = None,
        default_ttl_hours: int = 24,
        table_name: str = "crawled_content",
    ):
        """
        Initialize cache manager.

        Args:
            supabase_client: Supabase client instance
            default_ttl_hours: Default cache TTL in hours
            table_name: Name of the cache table in Supabase
        """
        self.client = supabase_client
        self.default_ttl = timedelta(hours=default_ttl_hours)
        self.table_name = table_name

        # In-memory cache for frequently accessed items
        self._memory_cache: dict[str, CacheEntry] = {}
        self._memory_cache_max_size = 100

    def _generate_key(self, cache_type: str, identifier: str, params: Optional[dict] = None) -> str:
        """
        Generate a unique cache key.

        Args:
            cache_type: Type of cached content (e.g., "app_store_reviews")
            identifier: Primary identifier (e.g., app ID)
            params: Additional parameters to include in key
        """
        key_parts = [cache_type, identifier]

        if params:
            # Sort params for consistent hashing
            sorted_params = json.dumps(params, sort_keys=True)
            params_hash = hashlib.md5(sorted_params.encode()).hexdigest()[:8]
            key_parts.append(params_hash)

        return ":".join(key_parts)

    async def get(
        self,
        cache_type: str,
        identifier: str,
        params: Optional[dict] = None,
    ) -> Optional[dict]:
        """
        Get cached content.

        Args:
            cache_type: Type of cached content
            identifier: Primary identifier
            params: Additional parameters

        Returns:
            Cached data or None if not found/expired
        """
        key = self._generate_key(cache_type, identifier, params)

        # Check memory cache first
        if key in self._memory_cache:
            entry = self._memory_cache[key]
            if datetime.utcnow() < entry.expires_at:
                entry.hit_count += 1
                logger.debug(f"Memory cache hit: {key}")
                return entry.data
            else:
                del self._memory_cache[key]

        # Check Supabase cache
        if self.client:
            try:
                response = self.client.table(self.table_name).select("*").eq("cache_key", key).single().execute()

                if response.data:
                    expires_at = datetime.fromisoformat(response.data["expires_at"].replace("Z", "+00:00"))

                    if datetime.utcnow().replace(tzinfo=expires_at.tzinfo) < expires_at:
                        data = response.data["content"]

                        # Update hit count
                        self.client.table(self.table_name).update({
                            "hit_count": response.data.get("hit_count", 0) + 1
                        }).eq("cache_key", key).execute()

                        # Add to memory cache
                        self._add_to_memory_cache(key, data, expires_at)

                        logger.debug(f"Supabase cache hit: {key}")
                        return data
                    else:
                        # Expired - delete it
                        self.client.table(self.table_name).delete().eq("cache_key", key).execute()

            except Exception as e:
                logger.error(f"Cache get error: {e}")

        logger.debug(f"Cache miss: {key}")
        return None

    async def set(
        self,
        cache_type: str,
        identifier: str,
        data: dict,
        params: Optional[dict] = None,
        ttl: Optional[timedelta] = None,
    ) -> str:
        """
        Store content in cache.

        Args:
            cache_type: Type of cached content
            identifier: Primary identifier
            data: Content to cache
            params: Additional parameters for key generation
            ttl: Custom TTL (uses default if not provided)

        Returns:
            The cache key used
        """
        key = self._generate_key(cache_type, identifier, params)
        ttl = ttl or self.default_ttl
        expires_at = datetime.utcnow() + ttl

        # Add to memory cache
        self._add_to_memory_cache(key, data, expires_at)

        # Store in Supabase
        if self.client:
            try:
                self.client.table(self.table_name).upsert({
                    "cache_key": key,
                    "cache_type": cache_type,
                    "identifier": identifier,
                    "content": data,
                    "created_at": datetime.utcnow().isoformat(),
                    "expires_at": expires_at.isoformat(),
                    "hit_count": 0,
                }).execute()

                logger.debug(f"Cached: {key} (TTL: {ttl})")

            except Exception as e:
                logger.error(f"Cache set error: {e}")

        return key

    def _add_to_memory_cache(self, key: str, data: dict, expires_at: datetime) -> None:
        """Add item to memory cache with LRU eviction."""
        # Evict if at capacity
        if len(self._memory_cache) >= self._memory_cache_max_size:
            # Remove least recently used (lowest hit count)
            lru_key = min(self._memory_cache.keys(), key=lambda k: self._memory_cache[k].hit_count)
            del self._memory_cache[lru_key]

        self._memory_cache[key] = CacheEntry(
            key=key,
            data=data,
            created_at=datetime.utcnow(),
            expires_at=expires_at,
            hit_count=0,
        )

    async def invalidate(
        self,
        cache_type: str,
        identifier: str,
        params: Optional[dict] = None,
    ) -> bool:
        """
        Invalidate a specific cache entry.

        Args:
            cache_type: Type of cached content
            identifier: Primary identifier
            params: Additional parameters

        Returns:
            True if entry was found and deleted
        """
        key = self._generate_key(cache_type, identifier, params)

        # Remove from memory cache
        if key in self._memory_cache:
            del self._memory_cache[key]

        # Remove from Supabase
        if self.client:
            try:
                response = self.client.table(self.table_name).delete().eq("cache_key", key).execute()
                return len(response.data) > 0
            except Exception as e:
                logger.error(f"Cache invalidate error: {e}")

        return False

    async def invalidate_type(self, cache_type: str) -> int:
        """
        Invalidate all entries of a specific type.

        Args:
            cache_type: Type of cached content to invalidate

        Returns:
            Number of entries invalidated
        """
        count = 0

        # Remove from memory cache
        keys_to_remove = [k for k in self._memory_cache if k.startswith(f"{cache_type}:")]
        for key in keys_to_remove:
            del self._memory_cache[key]
            count += 1

        # Remove from Supabase
        if self.client:
            try:
                response = self.client.table(self.table_name).delete().eq("cache_type", cache_type).execute()
                count += len(response.data)
            except Exception as e:
                logger.error(f"Cache invalidate_type error: {e}")

        return count

    async def cleanup_expired(self) -> int:
        """
        Remove all expired cache entries.

        Returns:
            Number of entries removed
        """
        count = 0
        now = datetime.utcnow()

        # Clean memory cache
        expired_keys = [k for k, v in self._memory_cache.items() if v.expires_at < now]
        for key in expired_keys:
            del self._memory_cache[key]
            count += 1

        # Clean Supabase
        if self.client:
            try:
                response = self.client.table(self.table_name).delete().lt("expires_at", now.isoformat()).execute()
                count += len(response.data)
            except Exception as e:
                logger.error(f"Cache cleanup error: {e}")

        logger.info(f"Cleaned up {count} expired cache entries")
        return count

    async def get_stats(self) -> dict:
        """Get cache statistics."""
        stats = {
            "memory_cache_size": len(self._memory_cache),
            "memory_cache_max_size": self._memory_cache_max_size,
        }

        if self.client:
            try:
                # Count total entries
                response = self.client.table(self.table_name).select("cache_type", count="exact").execute()
                stats["supabase_total_entries"] = response.count or 0

                # Count by type
                type_response = self.client.table(self.table_name).select("cache_type").execute()
                type_counts: dict[str, int] = {}
                for row in type_response.data or []:
                    cache_type = row.get("cache_type", "unknown")
                    type_counts[cache_type] = type_counts.get(cache_type, 0) + 1
                stats["entries_by_type"] = type_counts

            except Exception as e:
                logger.error(f"Cache stats error: {e}")

        return stats
