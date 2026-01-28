"""
App Store Review Scraper - Vercel Serverless Function
Fetches reviews for a specific app from the App Store.
Supports smart scraping with multiple sort orders and countries.
"""

import json
import time
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler


def fetch_json(url: str, timeout: int = 30) -> dict:
    """Fetch JSON from URL with retry logic."""
    max_retries = 3
    for attempt in range(max_retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "AppStoreScraper/1.0"})
            with urllib.request.urlopen(req, timeout=timeout) as response:
                return json.loads(response.read().decode())
        except (urllib.error.URLError, json.JSONDecodeError) as e:
            if attempt < max_retries - 1:
                time.sleep(1 * (attempt + 1))  # Exponential backoff
                continue
            print(f"Error fetching {url}: {e}")
            return {}
    return {}


def scrape_reviews_for_sort(app_id: str, country: str, sort_by: str, max_pages: int, delay: float) -> list:
    """Scrape reviews for a specific sort order."""
    reviews = []

    for page in range(1, max_pages + 1):
        url = f"https://itunes.apple.com/{country}/rss/customerreviews/page={page}/id={app_id}/sortBy={sort_by}/json"
        data = fetch_json(url)

        feed = data.get("feed", {})
        entries = feed.get("entry", [])

        if not entries:
            break

        for entry in entries:
            # Skip if it's the app info entry (has im:name but no im:rating)
            if "im:rating" not in entry:
                continue

            review_id = entry.get("id", {}).get("label", "")
            if not review_id:
                continue

            review = {
                "id": review_id,
                "title": entry.get("title", {}).get("label", ""),
                "content": entry.get("content", {}).get("label", ""),
                "rating": int(entry.get("im:rating", {}).get("label", "0")),
                "author": entry.get("author", {}).get("name", {}).get("label", ""),
                "version": entry.get("im:version", {}).get("label", ""),
                "vote_count": int(entry.get("im:voteCount", {}).get("label", "0")),
                "vote_sum": int(entry.get("im:voteSum", {}).get("label", "0")),
                "country": country,
                "sort_source": sort_by,
            }
            reviews.append(review)

        # Smart rate limiting
        if page < max_pages:
            time.sleep(delay)

    return reviews


def scrape_reviews(
    app_id: str,
    country: str = "us",
    max_pages: int = 10,
    use_multiple_sorts: bool = True,
    additional_countries: list = None,
    delay: float = 0.5
) -> list:
    """
    Smart review scraping with multiple strategies.

    - Single sort (mostRecent): up to 500 reviews
    - Multiple sorts (mostRecent + mostHelpful): up to ~1000 unique reviews
    - Multiple countries: multiply by number of countries

    With 2 sort orders and 2 countries, can get ~2000+ unique reviews.
    """
    all_reviews = {}

    # Determine which countries to scrape
    countries_to_scrape = [country]
    if additional_countries:
        countries_to_scrape.extend(additional_countries)

    # Determine sort orders
    sort_orders = ["mostRecent"]
    if use_multiple_sorts:
        sort_orders.append("mostHelpful")

    # Scrape from each country and sort order
    for c in countries_to_scrape:
        for sort_by in sort_orders:
            reviews = scrape_reviews_for_sort(app_id, c, sort_by, max_pages, delay)

            # Deduplicate by review ID
            for review in reviews:
                review_id = review["id"]
                if review_id not in all_reviews:
                    all_reviews[review_id] = review

            # Pause between different sort orders/countries
            time.sleep(delay * 2)

    return list(all_reviews.values())


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
            body = self.rfile.read(content_length).decode()
            params = json.loads(body) if body else {}

            app_id = params.get("appId")
            country = params.get("country", "us")
            max_pages = min(params.get("maxPages", 10), 10)  # Cap at 10 pages per sort
            use_multiple_sorts = params.get("useMultipleSorts", True)
            additional_countries = params.get("additionalCountries", [])
            delay = max(params.get("delay", 0.5), 0.3)  # Min 0.3s delay

            if not app_id:
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"error": "appId is required"}).encode())
                return

            # Limit additional countries to prevent timeout
            if additional_countries:
                additional_countries = additional_countries[:3]  # Max 4 countries total

            reviews = scrape_reviews(
                app_id=app_id,
                country=country,
                max_pages=max_pages,
                use_multiple_sorts=use_multiple_sorts,
                additional_countries=additional_countries,
                delay=delay
            )

            # Calculate stats
            if reviews:
                ratings = [r["rating"] for r in reviews]
                countries_found = list(set(r["country"] for r in reviews))
                stats = {
                    "total": len(reviews),
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
                        "countries": [country] + (additional_countries or []),
                    }
                }
            else:
                stats = {"total": 0, "average_rating": 0, "rating_distribution": {}}

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
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())
