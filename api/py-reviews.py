"""
App Store Review Scraper - Vercel Serverless Function
Fetches reviews for a specific app from the App Store.
Supports smart scraping with multiple sort orders, stealth delays, and SSE streaming.
"""

import json
import math
import random
import time
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler


# Valid sort orders for App Store API
VALID_SORT_ORDERS = ['mostRecent', 'mostHelpful', 'mostFavorable', 'mostCritical']

# Default filter configuration (backwards compatible)
DEFAULT_FILTERS = [
    {'sort': 'mostRecent', 'target': 500},
    {'sort': 'mostHelpful', 'target': 500},
]

# Default stealth settings
DEFAULT_STEALTH = {
    'baseDelay': 2.0,
    'randomization': 50,
    'filterCooldown': 5.0,
    'autoThrottle': True,
}


def get_stealth_delay(base: float, randomization: int) -> float:
    """Return randomized delay for anti-detection."""
    if randomization <= 0:
        return base
    variance = base * (randomization / 100)
    return random.uniform(max(0.1, base - variance), base + variance)


def fetch_json(url: str, timeout: int = 30) -> tuple[dict, int]:
    """
    Fetch JSON from URL with retry logic.
    Returns (data, status_code) tuple.
    """
    max_retries = 3
    for attempt in range(max_retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "AppStoreScraper/1.0"})
            with urllib.request.urlopen(req, timeout=timeout) as response:
                return json.loads(response.read().decode()), response.status
        except urllib.error.HTTPError as e:
            if e.code == 429:
                # Rate limited - return special status
                return {}, 429
            if attempt < max_retries - 1:
                time.sleep(1 * (attempt + 1))
                continue
            return {}, e.code
        except (urllib.error.URLError, json.JSONDecodeError) as e:
            if attempt < max_retries - 1:
                time.sleep(1 * (attempt + 1))
                continue
            print(f"Error fetching {url}: {e}")
            return {}, 0
    return {}, 0


def scrape_reviews_streaming(
    app_id: str,
    country: str,
    filters: list,
    stealth: dict,
):
    """
    Generator that yields SSE events while scraping reviews.
    Supports all 4 sort orders with configurable targets and stealth delays.
    """
    all_reviews = {}
    base_delay = stealth.get('baseDelay', 2.0)
    randomization = stealth.get('randomization', 50)
    filter_cooldown = stealth.get('filterCooldown', 5.0)
    auto_throttle = stealth.get('autoThrottle', True)

    # Track throttle state
    current_delay_multiplier = 1.0

    # Start event
    yield {
        'type': 'start',
        'filters': len(filters),
        'totalTargetReviews': sum(f.get('target', 500) for f in filters),
    }

    for filter_idx, filter_config in enumerate(filters):
        sort_by = filter_config.get('sort', 'mostRecent')
        target = min(filter_config.get('target', 500), 2000)  # Cap at 2000
        max_pages = min(math.ceil(target / 50), 40)  # Max 40 pages (2000 reviews)

        # Track consecutive empty pages for early termination
        consecutive_empty = 0
        filter_reviews_count = 0

        for page in range(1, max_pages + 1):
            url = f"https://itunes.apple.com/{country}/rss/customerreviews/page={page}/id={app_id}/sortBy={sort_by}/json"

            data, status_code = fetch_json(url)

            # Handle rate limiting
            if status_code == 429:
                if auto_throttle:
                    current_delay_multiplier = min(current_delay_multiplier * 2, 4.0)
                    yield {
                        'type': 'throttle',
                        'filter': sort_by,
                        'page': page,
                        'newDelayMultiplier': current_delay_multiplier,
                        'message': 'Rate limited - increasing delays',
                    }
                    # Wait longer before retry
                    throttle_wait = base_delay * current_delay_multiplier * 2
                    time.sleep(throttle_wait)
                    # Retry the page
                    data, status_code = fetch_json(url)
                    if status_code == 429:
                        # Still rate limited, skip this filter
                        yield {
                            'type': 'filterSkipped',
                            'filter': sort_by,
                            'reason': 'Rate limited after retry',
                        }
                        break

            feed = data.get("feed", {})
            entries = feed.get("entry", [])

            page_reviews = []
            new_unique_count = 0

            if entries:
                for entry in entries:
                    # Skip if it's the app info entry (has im:name but no im:rating)
                    if "im:rating" not in entry:
                        continue

                    review_id = entry.get("id", {}).get("label", "")
                    if not review_id:
                        continue

                    # Safely parse numeric fields
                    try:
                        rating = int(entry.get("im:rating", {}).get("label", "0"))
                    except (ValueError, TypeError):
                        rating = 0
                    try:
                        vote_count = int(entry.get("im:voteCount", {}).get("label", "0"))
                    except (ValueError, TypeError):
                        vote_count = 0
                    try:
                        vote_sum = int(entry.get("im:voteSum", {}).get("label", "0"))
                    except (ValueError, TypeError):
                        vote_sum = 0

                    review = {
                        "id": review_id,
                        "title": entry.get("title", {}).get("label", ""),
                        "content": entry.get("content", {}).get("label", ""),
                        "rating": rating,
                        "author": entry.get("author", {}).get("name", {}).get("label", ""),
                        "version": entry.get("im:version", {}).get("label", ""),
                        "vote_count": vote_count,
                        "vote_sum": vote_sum,
                        "country": country,
                        "sort_source": sort_by,
                    }
                    page_reviews.append(review)

                    # Add to all_reviews if unique
                    if review_id not in all_reviews:
                        all_reviews[review_id] = review
                        new_unique_count += 1

                filter_reviews_count += len(page_reviews)
                consecutive_empty = 0
            else:
                consecutive_empty += 1

            # Calculate delay for next request
            delay = get_stealth_delay(base_delay * current_delay_multiplier, randomization)

            # Progress event
            yield {
                'type': 'progress',
                'filter': sort_by,
                'filterIndex': filter_idx,
                'page': page,
                'maxPages': max_pages,
                'reviewsThisPage': len(page_reviews),
                'newUniqueThisPage': new_unique_count,
                'filterReviewsTotal': filter_reviews_count,
                'totalUnique': len(all_reviews),
                'nextDelayMs': int(delay * 1000),
            }

            # Early termination: stop if 5 consecutive pages return 0 reviews
            # (increased from 2 to avoid premature stopping)
            if consecutive_empty >= 5:
                yield {
                    'type': 'filterEarlyStop',
                    'filter': sort_by,
                    'reason': 'No more reviews available from RSS API',
                    'pagesCompleted': page,
                }
                break

            # Early termination: reached target
            if filter_reviews_count >= target:
                yield {
                    'type': 'filterTargetReached',
                    'filter': sort_by,
                    'target': target,
                    'actual': filter_reviews_count,
                }
                break

            # Apply stealth delay between pages
            if page < max_pages:
                time.sleep(delay)

        # Filter complete event
        yield {
            'type': 'filterComplete',
            'filter': sort_by,
            'filterIndex': filter_idx,
            'reviewsCollected': filter_reviews_count,
            'totalUniqueNow': len(all_reviews),
        }

        # Apply filter cooldown between different sort orders
        if filter_idx < len(filters) - 1:
            cooldown_delay = get_stealth_delay(filter_cooldown, randomization)
            yield {
                'type': 'filterCooldown',
                'nextFilter': filters[filter_idx + 1].get('sort'),
                'cooldownMs': int(cooldown_delay * 1000),
            }
            time.sleep(cooldown_delay)

            # Gradually reduce throttle multiplier if no issues
            if current_delay_multiplier > 1.0:
                current_delay_multiplier = max(1.0, current_delay_multiplier * 0.75)

    # Calculate final stats
    reviews_list = list(all_reviews.values())
    if reviews_list:
        ratings = [r["rating"] for r in reviews_list]
        stats = {
            "total": len(reviews_list),
            "average_rating": round(sum(ratings) / len(ratings), 2),
            "rating_distribution": {
                "5": len([r for r in ratings if r == 5]),
                "4": len([r for r in ratings if r == 4]),
                "3": len([r for r in ratings if r == 3]),
                "2": len([r for r in ratings if r == 2]),
                "1": len([r for r in ratings if r == 1]),
            },
            "countries_scraped": [country],
            "filters_used": [f['sort'] for f in filters],
            "scrape_settings": {
                "filters": filters,
                "stealth": stealth,
            }
        }
    else:
        stats = {"total": 0, "average_rating": 0, "rating_distribution": {}}

    # Complete event with all data
    yield {
        'type': 'complete',
        'reviews': reviews_list,
        'stats': stats,
    }


def scrape_reviews_legacy(
    app_id: str,
    country: str = "us",
    max_pages: int = 10,
    use_multiple_sorts: bool = True,
    additional_countries: list = None,
    delay: float = 0.5
) -> tuple[list, dict]:
    """
    Legacy review scraping for backwards compatibility.
    Returns (reviews, stats) tuple.
    """
    all_reviews = {}

    # Determine which countries to scrape
    countries_to_scrape = [country]
    if additional_countries:
        countries_to_scrape.extend(additional_countries[:3])

    # Determine sort orders
    sort_orders = ["mostRecent"]
    if use_multiple_sorts:
        sort_orders.append("mostHelpful")

    # Scrape from each country and sort order
    for c in countries_to_scrape:
        for sort_by in sort_orders:
            for page in range(1, max_pages + 1):
                url = f"https://itunes.apple.com/{c}/rss/customerreviews/page={page}/id={app_id}/sortBy={sort_by}/json"
                data, _ = fetch_json(url)

                feed = data.get("feed", {})
                entries = feed.get("entry", [])

                if not entries:
                    break

                for entry in entries:
                    if "im:rating" not in entry:
                        continue

                    review_id = entry.get("id", {}).get("label", "")
                    if not review_id:
                        continue

                    # Safely parse numeric fields
                    try:
                        rating = int(entry.get("im:rating", {}).get("label", "0"))
                    except (ValueError, TypeError):
                        rating = 0
                    try:
                        vote_count = int(entry.get("im:voteCount", {}).get("label", "0"))
                    except (ValueError, TypeError):
                        vote_count = 0
                    try:
                        vote_sum = int(entry.get("im:voteSum", {}).get("label", "0"))
                    except (ValueError, TypeError):
                        vote_sum = 0

                    review = {
                        "id": review_id,
                        "title": entry.get("title", {}).get("label", ""),
                        "content": entry.get("content", {}).get("label", ""),
                        "rating": rating,
                        "author": entry.get("author", {}).get("name", {}).get("label", ""),
                        "version": entry.get("im:version", {}).get("label", ""),
                        "vote_count": vote_count,
                        "vote_sum": vote_sum,
                        "country": c,
                        "sort_source": sort_by,
                    }

                    if review_id not in all_reviews:
                        all_reviews[review_id] = review

                if page < max_pages:
                    time.sleep(delay)

            time.sleep(delay * 2)

    reviews_list = list(all_reviews.values())

    if reviews_list:
        ratings = [r["rating"] for r in reviews_list]
        countries_found = list(set(r["country"] for r in reviews_list))
        stats = {
            "total": len(reviews_list),
            "average_rating": round(sum(ratings) / len(ratings), 2),
            "rating_distribution": {
                "5": len([r for r in ratings if r == 5]),
                "4": len([r for r in ratings if r == 4]),
                "3": len([r for r in ratings if r == 3]),
                "2": len([r for r in ratings if r == 2]),
                "1": len([r for r in ratings if r == 1]),
            },
            "countries_scraped": countries_found,
            "scrape_settings": {
                "max_pages": max_pages,
                "multiple_sorts": use_multiple_sorts,
                "countries": countries_to_scrape,
            }
        }
    else:
        stats = {"total": 0, "average_rating": 0, "rating_distribution": {}}

    return reviews_list, stats


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            # Limit request size to 100KB to prevent memory exhaustion attacks
            max_content_length = 100 * 1024  # 100KB
            if content_length > max_content_length:
                self.send_response(413)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"error": "Request body too large"}).encode())
                return
            body = self.rfile.read(content_length).decode()
            params = json.loads(body) if body else {}

            app_id = params.get("appId")

            if not app_id:
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"error": "appId is required"}).encode())
                return

            # Check if this is a streaming request (new mode) or legacy request
            filters = params.get("filters")
            streaming = params.get("streaming", False)

            if filters or streaming:
                # New streaming mode with extended filters
                country = params.get("country", "us")

                # Validate and normalize filters (limit to 10 filters to prevent DoS)
                if not filters:
                    filters = DEFAULT_FILTERS
                else:
                    validated_filters = []
                    for f in filters[:10]:  # Limit to 10 filters max
                        sort_order = f.get('sort', 'mostRecent')
                        if sort_order in VALID_SORT_ORDERS:
                            validated_filters.append({
                                'sort': sort_order,
                                'target': min(max(f.get('target', 500), 10), 2000),
                            })
                    filters = validated_filters if validated_filters else DEFAULT_FILTERS

                # Validate stealth settings
                stealth_input = params.get("stealth", {})
                stealth = {
                    'baseDelay': min(max(stealth_input.get('baseDelay', 2.0), 0.5), 10.0),
                    'randomization': min(max(stealth_input.get('randomization', 50), 0), 100),
                    'filterCooldown': min(max(stealth_input.get('filterCooldown', 5.0), 1.0), 30.0),
                    'autoThrottle': stealth_input.get('autoThrottle', True),
                }

                # Send SSE streaming response
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
                self.send_header("Cache-Control", "no-cache")
                self.send_header("Connection", "keep-alive")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()

                # Stream events with error handling for client disconnections
                try:
                    for event in scrape_reviews_streaming(app_id, country, filters, stealth):
                        event_data = json.dumps(event)
                        self.wfile.write(f"data: {event_data}\n\n".encode())
                        self.wfile.flush()
                except (BrokenPipeError, ConnectionResetError):
                    # Client disconnected mid-stream, this is normal behavior
                    return

            else:
                # Legacy mode for backwards compatibility
                country = params.get("country", "us")
                max_pages = min(params.get("maxPages", 10), 10)
                use_multiple_sorts = params.get("useMultipleSorts", True)
                additional_countries = params.get("additionalCountries", [])
                delay = max(params.get("delay", 0.5), 0.3)

                if additional_countries:
                    additional_countries = additional_countries[:3]

                reviews, stats = scrape_reviews_legacy(
                    app_id=app_id,
                    country=country,
                    max_pages=max_pages,
                    use_multiple_sorts=use_multiple_sorts,
                    additional_countries=additional_countries,
                    delay=delay
                )

                response_data = {
                    "reviews": reviews,
                    "stats": stats,
                }

                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps(response_data).encode())

        except Exception as e:
            import traceback
            print(f"Error in py-reviews handler: {e}")
            traceback.print_exc()
            try:
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode())
            except (BrokenPipeError, ConnectionResetError):
                # Client already disconnected
                pass
