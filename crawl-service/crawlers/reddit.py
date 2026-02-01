"""
Reddit Crawler - Simplified version using Reddit's JSON API
"""

import asyncio
import logging
import random
import re
from datetime import datetime
from typing import List, Optional, Dict, Any
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

    # =========================================================================
    # Subreddit Validation & Discovery
    # =========================================================================

    async def validate_subreddit(self, subreddit: str) -> Optional[Dict[str, Any]]:
        """
        Check if subreddit exists and is active.

        Returns:
            dict with subreddit info if valid, None if invalid/private
            {
                'name': str,
                'subscribers': int,
                'active_users': int,
                'public': bool,
                'over18': bool,
                'description': str
            }
        """
        url = f"https://www.reddit.com/r/{subreddit}/about.json"

        try:
            data = await self._fetch_with_rate_limit(url)
            if not data or 'data' not in data:
                return None

            about = data['data']

            # Check if it's a valid public subreddit
            sub_type = about.get('subreddit_type', '')
            if sub_type not in ['public', 'restricted']:
                return None

            return {
                'name': subreddit,
                'subscribers': about.get('subscribers', 0),
                'active_users': about.get('accounts_active', 0),
                'public': sub_type == 'public',
                'over18': about.get('over18', False),
                'description': about.get('public_description', '')[:200] if about.get('public_description') else ''
            }
        except Exception as e:
            logger.warning(f"Failed to validate subreddit r/{subreddit}: {e}")
            return None

    async def validate_subreddits(self, subreddits: List[str]) -> Dict[str, Any]:
        """
        Validate multiple subreddits and return validation results.

        Returns:
            {
                'valid': [SubredditInfo],
                'invalid': [str],
                'discovered': [str]  # Related subreddits found
            }
        """
        valid = []
        invalid = []
        discovered = set()

        for subreddit in subreddits:
            info = await self.validate_subreddit(subreddit)
            if info:
                valid.append(info)
                # Try to discover related subreddits from this valid one
                related = await self.discover_related_subreddits(subreddit)
                discovered.update(related)
            else:
                invalid.append(subreddit)

        # Remove already-known subreddits from discovered
        known = set(subreddits)
        discovered = [s for s in discovered if s not in known]

        return {
            'valid': valid,
            'invalid': invalid,
            'discovered': discovered[:10]  # Limit to top 10 discoveries
        }

    async def discover_related_subreddits(self, seed_subreddit: str) -> List[str]:
        """
        Find related subreddits from sidebar/wiki or crossposted content.
        Uses multiple strategies:
        1. Parse sidebar text for r/ mentions
        2. Look at crossposted content sources (limited without auth)
        """
        discovered = set()

        # Strategy 1: Parse sidebar for r/ mentions
        try:
            url = f"https://www.reddit.com/r/{seed_subreddit}/about.json"
            data = await self._fetch_with_rate_limit(url)

            if data and 'data' in data:
                about = data['data']

                # Check public description and description
                for text_field in ['public_description', 'description']:
                    text = about.get(text_field, '') or ''
                    # Find r/subredditname patterns
                    matches = re.findall(r'r/([a-zA-Z0-9_]+)', text)
                    discovered.update(matches)
        except Exception as e:
            logger.debug(f"Could not discover from sidebar of r/{seed_subreddit}: {e}")

        # Strategy 2: Check wiki (common place for related subs)
        try:
            wiki_url = f"https://www.reddit.com/r/{seed_subreddit}/wiki/index.json"
            wiki_data = await self._fetch_with_rate_limit(wiki_url)

            if wiki_data and 'data' in wiki_data:
                content = wiki_data['data'].get('content_md', '') or ''
                matches = re.findall(r'r/([a-zA-Z0-9_]+)', content)
                discovered.update(matches)
        except Exception as e:
            logger.debug(f"Could not discover from wiki of r/{seed_subreddit}: {e}")

        # Remove the seed subreddit itself and common non-relevant subs
        excluded = {seed_subreddit.lower(), 'all', 'popular', 'random', 'mods', 'mod', 'announcements'}
        discovered = [s for s in discovered if s.lower() not in excluded]

        return list(discovered)[:15]  # Limit results

    async def get_engagement_threshold(self, subreddit: str) -> Dict[str, int]:
        """
        Get subreddit-specific engagement thresholds based on community size.
        Smaller communities have lower thresholds to capture more signal.
        """
        about = await self.validate_subreddit(subreddit)
        if not about:
            # Default thresholds if we can't validate
            return {'min_score': 5, 'min_comments': 3}

        subscribers = about['subscribers']

        # Scale thresholds based on community size
        if subscribers < 10000:
            return {'min_score': 2, 'min_comments': 1}
        elif subscribers < 100000:
            return {'min_score': 5, 'min_comments': 3}
        elif subscribers < 1000000:
            return {'min_score': 10, 'min_comments': 5}
        else:
            return {'min_score': 20, 'min_comments': 10}

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
        validate_subreddits: bool = True,
        use_adaptive_thresholds: bool = True,
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
            validate_subreddits: Whether to validate subreddits before crawling
            use_adaptive_thresholds: Whether to use community-size-based thresholds

        Returns:
            Dict with posts (including comments), stats, and validation info
        """
        all_posts = {}  # Use dict for deduplication by ID
        total_comments = 0
        earliest_timestamp = None
        latest_timestamp = None
        subreddit_stats = {}  # Track per-subreddit stats for yield tracking
        validated_subreddits = []
        invalid_subreddits = []
        discovered_subreddits = []

        # Validate subreddits if enabled
        if validate_subreddits:
            validation_result = await self.validate_subreddits(subreddits)
            validated_subreddits = [s['name'] for s in validation_result['valid']]
            invalid_subreddits = validation_result['invalid']
            discovered_subreddits = validation_result['discovered']

            if not validated_subreddits:
                logger.warning("No valid subreddits found after validation")
                return {
                    "posts": [],
                    "stats": {
                        "total_posts": 0,
                        "total_comments": 0,
                        "subreddits_searched": [],
                        "topics_searched": search_topics,
                        "date_range": {"start": None, "end": None},
                    },
                    "validation": {
                        "valid": [],
                        "invalid": invalid_subreddits,
                        "discovered": discovered_subreddits,
                    }
                }
        else:
            validated_subreddits = subreddits

        # Cache for engagement thresholds
        threshold_cache = {}

        for subreddit in validated_subreddits:
            # Get adaptive threshold for this subreddit
            if use_adaptive_thresholds and subreddit not in threshold_cache:
                threshold_cache[subreddit] = await self.get_engagement_threshold(subreddit)

            threshold = threshold_cache.get(subreddit, {'min_score': 5, 'min_comments': 3})
            min_score = threshold['min_score']
            min_comments = threshold['min_comments']

            subreddit_posts = 0
            subreddit_engagement = 0

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

                        # Adaptive engagement threshold filter
                        if score < min_score and num_comments < min_comments:
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

                        subreddit_posts += 1
                        subreddit_engagement += score + num_comments

                except Exception as e:
                    logger.error(f"Error searching r/{subreddit} for '{topic}': {e}")
                    continue

            # Track subreddit performance
            if subreddit_posts > 0:
                subreddit_stats[subreddit] = {
                    "posts_found": subreddit_posts,
                    "avg_engagement": subreddit_engagement / subreddit_posts,
                }

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
                max_comments_per_post,
                max_depth=3  # Enable nested comment threading
            )
            post["comments"] = comments
            total_comments += self._count_comments_recursive(comments)

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
                "subreddits_searched": validated_subreddits,
                "topics_searched": search_topics,
                "date_range": date_range,
                "subreddit_stats": subreddit_stats,  # For yield tracking
            },
            "validation": {
                "valid": validated_subreddits,
                "invalid": invalid_subreddits,
                "discovered": discovered_subreddits,
            }
        }

    def _count_comments_recursive(self, comments: List[dict]) -> int:
        """Count total comments including nested replies"""
        count = 0
        for comment in comments:
            count += 1
            if comment.get('replies'):
                count += self._count_comments_recursive(comment['replies'])
        return count

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
        max_depth: int = 3,
    ) -> List[dict]:
        """
        Fetch comments for a specific post with rate limiting.
        Supports nested comment threading up to max_depth levels.

        Args:
            post_id: Reddit post ID
            subreddit: Subreddit name
            max_comments: Maximum top-level comments to fetch
            max_depth: Maximum depth of nested replies to fetch (default 3)

        Returns:
            List of comment dicts with nested 'replies' arrays
        """
        url = f"https://www.reddit.com/r/{subreddit}/comments/{post_id}.json?limit={max_comments}&depth={max_depth}&sort=top"

        try:
            data = await self._fetch_with_rate_limit(url)
            if not data or len(data) < 2:
                return []

            comments_data = data[1].get("data", {}).get("children", [])

            def extract_comments(children: List[dict], depth: int = 0) -> List[dict]:
                """Recursively extract comments with nested replies"""
                comments = []

                for child in children:
                    if child.get('kind') != 't1':  # t1 = comment
                        continue

                    comment_data = child.get('data', {})
                    body = comment_data.get('body', '')

                    # Skip deleted/removed comments
                    if not body or body in ['[deleted]', '[removed]']:
                        continue

                    comment = {
                        'id': comment_data.get('id', ''),
                        'author': comment_data.get('author', 'deleted'),
                        'body': body,
                        'score': comment_data.get('score', 0),
                        'created_utc': comment_data.get('created_utc', 0),
                        'depth': depth,
                        'is_submitter': comment_data.get('is_submitter', False),  # OP reply
                        'parent_id': comment_data.get('parent_id', ''),
                        'replies': []
                    }

                    # Recursively get replies if within depth limit
                    if depth < max_depth:
                        replies_data = comment_data.get('replies')
                        if replies_data and isinstance(replies_data, dict):
                            reply_children = replies_data.get('data', {}).get('children', [])
                            comment['replies'] = extract_comments(reply_children, depth + 1)

                    comments.append(comment)

                return comments

            return extract_comments(comments_data[:max_comments])

        except Exception as e:
            logger.error(f"Error fetching comments for {post_id}: {e}")
            return []
