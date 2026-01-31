"""Reddit crawler for discussions and user feedback."""

import asyncio
import logging
import re
from datetime import datetime
from typing import Optional
from bs4 import BeautifulSoup
from crawl4ai import CrawlerRunConfig

from .base import BaseCrawler
from models.schemas import (
    RedditPost,
    RedditComment,
    RedditDiscussion,
    RedditCrawlResponse,
)

logger = logging.getLogger(__name__)


class RedditCrawler(BaseCrawler):
    """
    Crawler for Reddit discussions via web scraping (no API needed).

    Replaces simulated Reddit data with real discussions about apps,
    user pain points, feature requests, and market trends.
    """

    # Common app-related subreddits
    DEFAULT_SUBREDDITS = [
        "apps",
        "iphone",
        "ios",
        "apple",
        "productivity",
        "GetMotivated",
        "Entrepreneur",
        "startups",
        "SideProject",
        "androidapps",
    ]

    @property
    def cache_type(self) -> str:
        return "reddit"

    def _get_search_url(
        self,
        query: str,
        subreddit: Optional[str] = None,
        sort: str = "relevance",
        time_filter: str = "year",
    ) -> str:
        """Generate Reddit search URL."""
        base = "https://old.reddit.com"

        if subreddit:
            url = f"{base}/r/{subreddit}/search"
        else:
            url = f"{base}/search"

        params = f"?q={query}&sort={sort}&t={time_filter}"

        if subreddit:
            params += "&restrict_sr=on"

        return url + params

    def _get_post_url(self, permalink: str) -> str:
        """Generate full URL for a Reddit post."""
        if permalink.startswith("http"):
            return permalink
        return f"https://old.reddit.com{permalink}"

    async def crawl_search(
        self,
        keywords: list[str],
        subreddits: Optional[list[str]] = None,
        max_posts: int = 50,
        max_comments_per_post: int = 20,
        time_filter: str = "year",
        sort: str = "relevance",
        force_refresh: bool = False,
    ) -> RedditCrawlResponse:
        """
        Search Reddit for discussions matching keywords.

        Args:
            keywords: Search keywords
            subreddits: Specific subreddits to search (None = all)
            max_posts: Maximum posts to fetch
            max_comments_per_post: Max comments per post
            time_filter: Time filter (hour, day, week, month, year, all)
            sort: Sort order (relevance, hot, new, top)
            force_refresh: Bypass cache

        Returns:
            RedditCrawlResponse with discussions
        """
        cache_params = {
            "keywords": sorted(keywords),
            "subreddits": sorted(subreddits) if subreddits else None,
            "time_filter": time_filter,
            "sort": sort,
        }
        cache_key = "_".join(keywords[:3])

        async def do_crawl():
            all_discussions: list[dict] = []
            subreddits_searched = set()

            # Determine which subreddits to search
            search_subs = subreddits or self.DEFAULT_SUBREDDITS

            for keyword in keywords:
                for subreddit in search_subs:
                    if len(all_discussions) >= max_posts:
                        break

                    try:
                        discussions = await self._search_subreddit(
                            keyword=keyword,
                            subreddit=subreddit,
                            max_posts=min(10, max_posts - len(all_discussions)),
                            max_comments=max_comments_per_post,
                            sort=sort,
                            time_filter=time_filter,
                        )

                        all_discussions.extend(discussions)
                        subreddits_searched.add(subreddit)

                        # Rate limiting between subreddits
                        await asyncio.sleep(1)

                    except Exception as e:
                        logger.warning(f"Error searching r/{subreddit} for '{keyword}': {e}")

            # Deduplicate by post ID
            seen_ids = set()
            unique_discussions = []
            for disc in all_discussions:
                if disc["post"]["id"] not in seen_ids:
                    seen_ids.add(disc["post"]["id"])
                    unique_discussions.append(disc)

            return {
                "keywords": keywords,
                "subreddits_searched": list(subreddits_searched),
                "total_posts": len(unique_discussions),
                "discussions": unique_discussions[:max_posts],
            }

        cached_or_fresh = await self.get_cached_or_crawl(
            identifier=cache_key,
            crawl_func=do_crawl,
            params=cache_params,
            force_refresh=force_refresh,
        )

        # Convert to response models
        discussions = []
        for d in cached_or_fresh.get("discussions", []):
            try:
                comments = [
                    RedditComment(
                        id=c["id"],
                        author=c.get("author", "deleted"),
                        content=c["content"],
                        score=c.get("score", 0),
                        created_at=datetime.fromisoformat(c["created_at"]),
                        is_op=c.get("is_op", False),
                    )
                    for c in d["post"].get("comments", [])
                ]

                post = RedditPost(
                    id=d["post"]["id"],
                    title=d["post"]["title"],
                    content=d["post"].get("content", ""),
                    url=d["post"]["url"],
                    subreddit=d["post"]["subreddit"],
                    author=d["post"].get("author", "deleted"),
                    score=d["post"].get("score", 0),
                    upvote_ratio=d["post"].get("upvote_ratio", 0.0),
                    num_comments=d["post"].get("num_comments", 0),
                    created_at=datetime.fromisoformat(d["post"]["created_at"]),
                    flair=d["post"].get("flair"),
                    is_self=d["post"].get("is_self", True),
                    comments=comments,
                )

                discussions.append(RedditDiscussion(
                    keyword=d["keyword"],
                    subreddit=d["subreddit"],
                    post=post,
                    relevance_score=d.get("relevance_score", 0.0),
                ))
            except Exception as e:
                logger.warning(f"Error parsing discussion: {e}")

        return RedditCrawlResponse(
            keywords=cached_or_fresh["keywords"],
            subreddits_searched=cached_or_fresh["subreddits_searched"],
            total_posts=len(discussions),
            discussions=discussions,
            cached=not force_refresh and self.cache_manager is not None,
        )

    async def _search_subreddit(
        self,
        keyword: str,
        subreddit: str,
        max_posts: int = 10,
        max_comments: int = 20,
        sort: str = "relevance",
        time_filter: str = "year",
    ) -> list[dict]:
        """Search a specific subreddit for posts matching a keyword."""
        discussions = []

        try:
            search_url = self._get_search_url(keyword, subreddit, sort, time_filter)

            result = await self.crawl_page(search_url, wait_for=".search-result")

            if not result or not result.get("html"):
                return []

            soup = BeautifulSoup(result["html"], "lxml")

            # Parse search results (old Reddit format)
            post_elements = soup.select(".search-result, .thing.link")[:max_posts]

            for elem in post_elements:
                try:
                    post_data = self._parse_search_result(elem, subreddit)

                    if post_data:
                        # Optionally fetch comments
                        if max_comments > 0:
                            comments = await self._fetch_comments(
                                post_data["url"],
                                max_comments
                            )
                            post_data["comments"] = comments

                        discussions.append({
                            "keyword": keyword,
                            "subreddit": subreddit,
                            "post": post_data,
                            "relevance_score": self._calculate_relevance(post_data, keyword),
                        })

                except Exception as e:
                    logger.warning(f"Error parsing search result: {e}")

        except Exception as e:
            logger.error(f"Error in _search_subreddit: {e}")

        return discussions

    def _parse_search_result(self, elem: BeautifulSoup, default_subreddit: str) -> Optional[dict]:
        """Parse a Reddit search result element."""
        try:
            # Get post ID
            post_id = elem.get("data-fullname", "").replace("t3_", "")
            if not post_id:
                thing_id = elem.get("id", "")
                if thing_id.startswith("thing_t3_"):
                    post_id = thing_id.replace("thing_t3_", "")

            if not post_id:
                return None

            # Get title and link
            title_elem = elem.select_one("a.search-title, a.title, a[data-event-action='title']")
            if not title_elem:
                return None

            title = title_elem.get_text(strip=True)
            permalink = title_elem.get("href", "")
            url = self._get_post_url(permalink)

            # Get subreddit
            subreddit_elem = elem.select_one("a.search-subreddit-link, a.subreddit")
            subreddit = default_subreddit
            if subreddit_elem:
                sub_text = subreddit_elem.get_text(strip=True)
                subreddit = sub_text.replace("r/", "")

            # Get author
            author_elem = elem.select_one("a.author")
            author = author_elem.get_text(strip=True) if author_elem else "deleted"

            # Get score
            score_elem = elem.select_one(".search-score, .score.unvoted")
            score = 0
            if score_elem:
                score_text = score_elem.get_text(strip=True)
                match = re.search(r"(\d+)", score_text.replace(",", ""))
                if match:
                    score = int(match.group(1))

            # Get comment count
            comments_elem = elem.select_one("a.search-comments, a.comments")
            num_comments = 0
            if comments_elem:
                comments_text = comments_elem.get_text(strip=True)
                match = re.search(r"(\d+)", comments_text.replace(",", ""))
                if match:
                    num_comments = int(match.group(1))

            # Get post content if available
            content = ""
            content_elem = elem.select_one(".search-result-body, .md")
            if content_elem:
                content = content_elem.get_text(strip=True)[:2000]

            # Get flair
            flair = None
            flair_elem = elem.select_one(".linkflairlabel, .flair")
            if flair_elem:
                flair = flair_elem.get_text(strip=True)

            # Get timestamp
            time_elem = elem.select_one("time, .search-time")
            created_at = datetime.utcnow()
            if time_elem:
                datetime_attr = time_elem.get("datetime")
                if datetime_attr:
                    try:
                        created_at = datetime.fromisoformat(datetime_attr.replace("Z", "+00:00"))
                    except ValueError:
                        pass

            return {
                "id": post_id,
                "title": title,
                "content": content,
                "url": url,
                "subreddit": subreddit,
                "author": author,
                "score": score,
                "num_comments": num_comments,
                "created_at": created_at.isoformat(),
                "flair": flair,
                "is_self": not url.startswith("http") or "reddit.com" in url,
                "comments": [],
            }

        except Exception as e:
            logger.warning(f"Error in _parse_search_result: {e}")
            return None

    async def _fetch_comments(self, post_url: str, max_comments: int = 20) -> list[dict]:
        """Fetch comments for a Reddit post."""
        comments = []

        try:
            # Use old.reddit.com for easier parsing
            if "old.reddit.com" not in post_url:
                post_url = post_url.replace("www.reddit.com", "old.reddit.com")
                post_url = post_url.replace("reddit.com", "old.reddit.com")

            result = await self.crawl_page(post_url, wait_for=".comment")

            if not result or not result.get("html"):
                return []

            soup = BeautifulSoup(result["html"], "lxml")

            # Find the OP's username
            op_elem = soup.select_one(".thing.link .author")
            op_username = op_elem.get_text(strip=True) if op_elem else None

            # Parse comments
            comment_elements = soup.select(".comment")[:max_comments]

            for elem in comment_elements:
                try:
                    comment_data = self._parse_comment(elem, op_username)
                    if comment_data:
                        comments.append(comment_data)
                except Exception as e:
                    logger.debug(f"Error parsing comment: {e}")

        except Exception as e:
            logger.warning(f"Error fetching comments for {post_url}: {e}")

        return comments

    def _parse_comment(self, elem: BeautifulSoup, op_username: Optional[str] = None) -> Optional[dict]:
        """Parse a single comment element."""
        try:
            # Get comment ID
            comment_id = elem.get("data-fullname", "").replace("t1_", "")
            if not comment_id:
                return None

            # Get author
            author_elem = elem.select_one(".author")
            author = author_elem.get_text(strip=True) if author_elem else "deleted"

            # Get content
            content_elem = elem.select_one(".md")
            if not content_elem:
                return None
            content = content_elem.get_text(strip=True)[:2000]

            if not content or content == "[deleted]" or content == "[removed]":
                return None

            # Get score
            score = 0
            score_elem = elem.select_one(".score.unvoted")
            if score_elem:
                score_text = score_elem.get_text(strip=True)
                match = re.search(r"(-?\d+)", score_text.replace(",", ""))
                if match:
                    score = int(match.group(1))

            # Get timestamp
            time_elem = elem.select_one("time")
            created_at = datetime.utcnow()
            if time_elem:
                datetime_attr = time_elem.get("datetime")
                if datetime_attr:
                    try:
                        created_at = datetime.fromisoformat(datetime_attr.replace("Z", "+00:00"))
                    except ValueError:
                        pass

            return {
                "id": comment_id,
                "author": author,
                "content": content,
                "score": score,
                "created_at": created_at.isoformat(),
                "is_op": author == op_username if op_username else False,
            }

        except Exception as e:
            logger.debug(f"Error in _parse_comment: {e}")
            return None

    def _calculate_relevance(self, post: dict, keyword: str) -> float:
        """Calculate relevance score for a post."""
        score = 0.0

        title = post.get("title", "").lower()
        content = post.get("content", "").lower()
        keyword_lower = keyword.lower()

        # Title match is most important
        if keyword_lower in title:
            score += 0.5

        # Content match
        if keyword_lower in content:
            score += 0.3

        # Boost by engagement
        post_score = post.get("score", 0)
        if post_score > 100:
            score += 0.1
        if post_score > 500:
            score += 0.1

        return min(score, 1.0)

    async def crawl(self, **kwargs) -> RedditCrawlResponse:
        """Crawl Reddit discussions."""
        return await self.crawl_search(
            keywords=kwargs["keywords"],
            subreddits=kwargs.get("subreddits"),
            max_posts=kwargs.get("max_posts", 50),
            max_comments_per_post=kwargs.get("max_comments_per_post", 20),
            time_filter=kwargs.get("time_filter", "year"),
            sort=kwargs.get("sort", "relevance"),
            force_refresh=kwargs.get("force_refresh", False),
        )
