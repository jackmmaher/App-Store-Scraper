"""
Reddit Crawler - Simplified version using Reddit's JSON API
"""

import asyncio
import logging
import random
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
