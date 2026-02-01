"""
Reddit Crawler - Simplified version using Reddit's JSON API
"""

import asyncio
import logging
import random
from datetime import datetime
from typing import List, Optional
from urllib.parse import quote_plus

from .base import BaseCrawler

logger = logging.getLogger(__name__)


class RedditCrawler(BaseCrawler):
    """Crawl Reddit discussions using public JSON endpoints"""

    # Reddit-specific headers to avoid being blocked
    REDDIT_HEADERS = {
        "User-Agent": "AppStoreScraper/1.0 (by /u/app_scraper_bot; educational/research)",
        "Accept": "application/json",
        "Accept-Language": "en-US,en;q=0.9",
    }

    async def crawl_discussions(
        self,
        keywords: List[str],
        subreddits: Optional[List[str]] = None,
        max_posts: int = 50,
        max_comments_per_post: int = 20,
        time_filter: str = "year",
        sort: str = "relevance",
    ) -> dict:
        """
        Search Reddit for discussions matching keywords.
        Returns posts and comments.
        """
        all_posts = []
        seen_ids = set()

        # Default subreddits for app-related discussions
        if not subreddits:
            subreddits = ["iphone", "ios", "apple", "apps", "AppHookup"]

        for keyword in keywords:
            if len(all_posts) >= max_posts:
                break

            # URL-encode the keyword and search Reddit using JSON API
            encoded_keyword = quote_plus(keyword)
            search_url = f"https://www.reddit.com/search.json?q={encoded_keyword}&sort={sort}&t={time_filter}&limit=25"

            try:
                data = await self.fetch_json(search_url, extra_headers=self.REDDIT_HEADERS)
                if not data:
                    continue

                posts = data.get("data", {}).get("children", [])

                for post_data in posts:
                    if len(all_posts) >= max_posts:
                        break

                    post = post_data.get("data", {})
                    post_id = post.get("id", "")

                    if post_id in seen_ids:
                        continue
                    seen_ids.add(post_id)

                    all_posts.append({
                        "id": post_id,
                        "subreddit": post.get("subreddit", ""),
                        "title": post.get("title", ""),
                        "content": post.get("selftext", ""),
                        "url": f"https://reddit.com{post.get('permalink', '')}",
                        "author": post.get("author", "deleted"),
                        "score": post.get("score", 0),
                        "upvote_ratio": post.get("upvote_ratio", 0),
                        "num_comments": post.get("num_comments", 0),
                        "created_utc": post.get("created_utc", 0),
                        "keywords": [keyword],
                    })

                await asyncio.sleep(random.uniform(1.0, 2.0))

            except Exception as e:
                logger.error(f"Error searching Reddit for '{keyword}': {e}")
                continue

        # Fetch comments for top posts
        posts_with_comments = []
        for post in all_posts[:10]:  # Only fetch comments for top 10 posts
            comments = await self._fetch_comments(
                post["id"],
                post["subreddit"],
                max_comments_per_post
            )
            post["comments"] = comments
            posts_with_comments.append(post)
            await asyncio.sleep(random.uniform(0.5, 1.0))

        # Add remaining posts without comments
        for post in all_posts[10:]:
            post["comments"] = []
            posts_with_comments.append(post)

        return {
            "posts": posts_with_comments,
            "total_posts": len(posts_with_comments),
            "keywords_searched": keywords,
        }

    async def _fetch_comments(
        self,
        post_id: str,
        subreddit: str,
        max_comments: int,
    ) -> List[dict]:
        """Fetch comments for a specific post"""
        url = f"https://www.reddit.com/r/{subreddit}/comments/{post_id}.json?limit={max_comments}"

        try:
            data = await self.fetch_json(url, extra_headers=self.REDDIT_HEADERS)
            if not data or len(data) < 2:
                return []

            comments_data = data[1].get("data", {}).get("children", [])
            comments = []

            for comment_data in comments_data[:max_comments]:
                comment = comment_data.get("data", {})
                if comment.get("body"):
                    comments.append({
                        "id": comment.get("id", ""),
                        "author": comment.get("author", "deleted"),
                        "content": comment.get("body", ""),
                        "score": comment.get("score", 0),
                        "created_utc": comment.get("created_utc", 0),
                    })

            return comments

        except Exception as e:
            logger.error(f"Error fetching comments for {post_id}: {e}")
            return []

    async def crawl_deep_dive(
        self,
        search_topics: List[str],
        subreddits: List[str],
        time_filter: str = "month",
        max_posts_per_combo: int = 50,
        max_comments_per_post: int = 30,
    ) -> dict:
        """
        Deep dive scraping for Reddit analysis.
        Searches each topic in each subreddit, fetches comments on high-engagement posts.
        Returns structured data for AI analysis.

        Args:
            search_topics: List of topics to search for
            subreddits: List of subreddit names to search in
            time_filter: Time range - week, month, year
            max_posts_per_combo: Maximum posts to fetch per subreddit+topic combo
            max_comments_per_post: Maximum comments to fetch per post

        Returns:
            Dict with posts (including comments) and stats
        """
        all_posts = {}  # Use dict for deduplication by ID
        total_comments = 0
        earliest_timestamp = None
        latest_timestamp = None

        for subreddit in subreddits:
            for topic in search_topics:
                encoded_topic = quote_plus(topic)
                search_url = (
                    f"https://www.reddit.com/r/{subreddit}/search.json"
                    f"?q={encoded_topic}&restrict_sr=on&sort=relevance"
                    f"&limit={max_posts_per_combo}&t={time_filter}"
                )

                try:
                    data = await self._fetch_with_rate_limit(search_url)
                    if not data:
                        continue

                    posts = data.get("data", {}).get("children", [])

                    for post_data in posts:
                        post = post_data.get("data", {})
                        post_id = post.get("id", "")

                        if not post_id or post_id in all_posts:
                            continue

                        score = post.get("score", 0)
                        num_comments = post.get("num_comments", 0)
                        created_utc = post.get("created_utc", 0)

                        # Engagement threshold filter
                        if score <= 5 and num_comments <= 3:
                            continue

                        # Track date range
                        if created_utc:
                            if earliest_timestamp is None or created_utc < earliest_timestamp:
                                earliest_timestamp = created_utc
                            if latest_timestamp is None or created_utc > latest_timestamp:
                                latest_timestamp = created_utc

                        all_posts[post_id] = {
                            "id": post_id,
                            "subreddit": post.get("subreddit", subreddit),
                            "title": post.get("title", ""),
                            "selftext": post.get("selftext", ""),
                            "score": score,
                            "num_comments": num_comments,
                            "created_utc": created_utc,
                            "permalink": post.get("permalink", ""),
                            "url": f"https://reddit.com{post.get('permalink', '')}",
                            "author": post.get("author", "deleted"),
                            "upvote_ratio": post.get("upvote_ratio", 0),
                            "comments": [],
                            "search_topic": topic,
                        }

                except Exception as e:
                    logger.error(f"Error searching r/{subreddit} for '{topic}': {e}")
                    continue

        # Sort posts by engagement and fetch comments for top high-engagement posts
        posts_list = list(all_posts.values())
        # Sort by a combination of score and comments
        posts_list.sort(key=lambda p: p["score"] + (p["num_comments"] * 2), reverse=True)

        # Fetch comments for top 20 high-engagement posts (score > 20 or comments > 10)
        high_engagement_posts = [
            p for p in posts_list
            if p["score"] > 20 or p["num_comments"] > 10
        ][:20]

        for post in high_engagement_posts:
            comments = await self._fetch_comments_deep(
                post["id"],
                post["subreddit"],
                max_comments_per_post
            )
            post["comments"] = comments
            total_comments += len(comments)

        # Format date range
        date_range = {
            "start": datetime.utcfromtimestamp(earliest_timestamp).isoformat() if earliest_timestamp else None,
            "end": datetime.utcfromtimestamp(latest_timestamp).isoformat() if latest_timestamp else None,
        }

        return {
            "posts": posts_list,
            "stats": {
                "total_posts": len(posts_list),
                "total_comments": total_comments,
                "subreddits_searched": subreddits,
                "topics_searched": search_topics,
                "date_range": date_range,
            }
        }

    async def _fetch_with_rate_limit(self, url: str, retry_on_429: bool = True) -> Optional[dict]:
        """
        Fetch JSON with rate limiting (1.5s between requests).
        Handles 429 responses with 60s wait and retry.
        """
        # Rate limit: 1.5s between requests
        await asyncio.sleep(1.5)

        try:
            data = await self.fetch_json(url, extra_headers=self.REDDIT_HEADERS)
            return data
        except Exception as e:
            error_str = str(e)
            if "429" in error_str and retry_on_429:
                logger.warning(f"Rate limited (429), waiting 60s before retry: {url}")
                await asyncio.sleep(60)
                # Retry once without the retry flag
                return await self._fetch_with_rate_limit(url, retry_on_429=False)
            raise

    async def _fetch_comments_deep(
        self,
        post_id: str,
        subreddit: str,
        max_comments: int,
    ) -> List[dict]:
        """Fetch comments for a specific post with rate limiting"""
        url = f"https://www.reddit.com/r/{subreddit}/comments/{post_id}.json?limit={max_comments}&sort=top"

        try:
            data = await self._fetch_with_rate_limit(url)
            if not data or len(data) < 2:
                return []

            comments_data = data[1].get("data", {}).get("children", [])
            comments = []

            for comment_data in comments_data[:max_comments]:
                comment = comment_data.get("data", {})
                body = comment.get("body", "")
                if body and body != "[deleted]" and body != "[removed]":
                    comments.append({
                        "id": comment.get("id", ""),
                        "author": comment.get("author", "deleted"),
                        "body": body,
                        "score": comment.get("score", 0),
                        "created_utc": comment.get("created_utc", 0),
                    })

            return comments

        except Exception as e:
            logger.error(f"Error fetching comments for {post_id}: {e}")
            return []
