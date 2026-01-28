"""
App Store Review Scraper - Vercel Serverless Function
Fetches reviews for a specific app from the App Store.
"""

import json
import time
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler


def fetch_json(url: str, timeout: int = 30) -> dict:
    """Fetch JSON from URL."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "AppStoreScraper/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return json.loads(response.read().decode())
    except (urllib.error.URLError, json.JSONDecodeError) as e:
        print(f"Error fetching {url}: {e}")
        return {}


def scrape_reviews(app_id: str, country: str = "us", max_pages: int = 10) -> list:
    """
    Scrape reviews from Apple's RSS feed.
    Each page has up to 50 reviews, max 10 pages = 500 reviews.
    """
    all_reviews = []

    for page in range(1, max_pages + 1):
        url = f"https://itunes.apple.com/{country}/rss/customerreviews/page={page}/id={app_id}/sortBy=mostRecent/json"
        data = fetch_json(url)

        feed = data.get("feed", {})
        entries = feed.get("entry", [])

        if not entries:
            break

        # First entry is often the app info, not a review
        for entry in entries:
            # Skip if it's the app info entry (has im:name but no im:rating)
            if "im:rating" not in entry:
                continue

            review = {
                "id": entry.get("id", {}).get("label", ""),
                "title": entry.get("title", {}).get("label", ""),
                "content": entry.get("content", {}).get("label", ""),
                "rating": int(entry.get("im:rating", {}).get("label", "0")),
                "author": entry.get("author", {}).get("name", {}).get("label", ""),
                "version": entry.get("im:version", {}).get("label", ""),
                "vote_count": int(entry.get("im:voteCount", {}).get("label", "0")),
                "vote_sum": int(entry.get("im:voteSum", {}).get("label", "0")),
            }
            all_reviews.append(review)

        # Rate limiting
        if page < max_pages:
            time.sleep(0.3)

    return all_reviews


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
            max_pages = min(params.get("maxPages", 10), 10)  # Cap at 10 pages

            if not app_id:
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"error": "appId is required"}).encode())
                return

            reviews = scrape_reviews(app_id, country, max_pages)

            # Calculate stats
            if reviews:
                ratings = [r["rating"] for r in reviews]
                stats = {
                    "total": len(reviews),
                    "average_rating": round(sum(ratings) / len(ratings), 2),
                    "rating_distribution": {
                        "5": len([r for r in ratings if r == 5]),
                        "4": len([r for r in ratings if r == 4]),
                        "3": len([r for r in ratings if r == 3]),
                        "2": len([r for r in ratings if r == 2]),
                        "1": len([r for r in ratings if r == 1]),
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
