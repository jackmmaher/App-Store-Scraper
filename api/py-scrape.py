"""
App Store Scraper - Vercel Serverless Function
Fetches top apps from App Store categories with review counts and ratings.
"""

import json
import time
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler

# App Store category IDs (genre IDs)
CATEGORIES = {
    "books": 6018,
    "business": 6000,
    "developer-tools": 6026,
    "education": 6017,
    "entertainment": 6016,
    "finance": 6015,
    "food-drink": 6023,
    "games": 6014,
    "graphics-design": 6027,
    "health-fitness": 6013,
    "lifestyle": 6012,
    "magazines-newspapers": 6021,
    "medical": 6020,
    "music": 6011,
    "navigation": 6010,
    "news": 6009,
    "photo-video": 6008,
    "productivity": 6007,
    "reference": 6006,
    "shopping": 6024,
    "social-networking": 6005,
    "sports": 6004,
    "travel": 6003,
    "utilities": 6002,
    "weather": 6001,
    "action-games": 7001,
    "adventure-games": 7002,
    "arcade-games": 7003,
    "board-games": 7004,
    "card-games": 7005,
    "casino-games": 7006,
    "casual-games": 7003,
    "dice-games": 7007,
    "educational-games": 7008,
    "family-games": 7009,
    "music-games": 7011,
    "puzzle-games": 7012,
    "racing-games": 7013,
    "role-playing-games": 7014,
    "simulation-games": 7015,
    "sports-games": 7016,
    "strategy-games": 7017,
    "trivia-games": 7018,
    "word-games": 7019,
}


def fetch_json(url: str, timeout: int = 30) -> dict:
    """Fetch JSON from URL."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "AppStoreScraper/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return json.loads(response.read().decode())
    except (urllib.error.URLError, json.JSONDecodeError) as e:
        print(f"Error fetching {url}: {e}")
        return {}


def get_rss_top_apps(country: str, category_id: int, feed_type: str = "topfreeapplications", limit: int = 100) -> list:
    """Fetch top apps from Apple's RSS feed."""
    url = f"https://itunes.apple.com/{country}/rss/{feed_type}/limit={min(limit, 200)}/genre={category_id}/json"
    data = fetch_json(url)

    entries = data.get("feed", {}).get("entry", [])
    if not entries:
        return []

    apps = []
    for entry in entries:
        app_id = entry.get("id", {}).get("attributes", {}).get("im:id", "")
        app_name = entry.get("im:name", {}).get("label", "")
        apps.append({
            "id": app_id,
            "name": app_name,
            "category": entry.get("category", {}).get("attributes", {}).get("label", ""),
        })

    return apps


def lookup_app_details(app_ids: list, country: str) -> dict:
    """Look up detailed app information."""
    if not app_ids:
        return {}

    ids_str = ",".join(str(id) for id in app_ids[:200])
    url = f"https://itunes.apple.com/lookup?id={ids_str}&country={country}"
    data = fetch_json(url, timeout=60)

    results = {}
    for item in data.get("results", []):
        app_id = str(item.get("trackId", ""))
        description = item.get("description", "")
        if len(description) > 500:
            description = description[:500] + "..."

        results[app_id] = {
            "id": app_id,
            "name": item.get("trackName", ""),
            "bundle_id": item.get("bundleId", ""),
            "developer": item.get("artistName", ""),
            "developer_id": str(item.get("artistId", "")),
            "price": item.get("price", 0),
            "currency": item.get("currency", ""),
            "rating": item.get("averageUserRating", 0),
            "rating_current_version": item.get("averageUserRatingForCurrentVersion", 0),
            "review_count": item.get("userRatingCount", 0),
            "review_count_current_version": item.get("userRatingCountForCurrentVersion", 0),
            "version": item.get("version", ""),
            "release_date": item.get("releaseDate", ""),
            "current_version_release_date": item.get("currentVersionReleaseDate", ""),
            "min_os_version": item.get("minimumOsVersion", ""),
            "file_size_bytes": item.get("fileSizeBytes", ""),
            "content_rating": item.get("contentAdvisoryRating", ""),
            "genres": item.get("genres", []),
            "primary_genre": item.get("primaryGenreName", ""),
            "primary_genre_id": str(item.get("primaryGenreId", "")),
            "url": item.get("trackViewUrl", ""),
            "icon_url": item.get("artworkUrl512", item.get("artworkUrl100", "")),
            "description": description,
        }

    return results


def search_apps_in_category(country: str, category_id: int, limit: int = 200) -> list:
    """Search for apps using generic terms."""
    search_terms = ["app", "pro", "free", "best", "top", "new"]
    all_apps = {}

    for term in search_terms:
        url = f"https://itunes.apple.com/search?term={term}&country={country}&media=software&entity=software&genreId={category_id}&limit=200"
        data = fetch_json(url)

        for item in data.get("results", []):
            app_id = str(item.get("trackId", ""))
            if app_id and app_id not in all_apps:
                description = item.get("description", "")
                if len(description) > 500:
                    description = description[:500] + "..."

                all_apps[app_id] = {
                    "id": app_id,
                    "name": item.get("trackName", ""),
                    "bundle_id": item.get("bundleId", ""),
                    "developer": item.get("artistName", ""),
                    "developer_id": str(item.get("artistId", "")),
                    "price": item.get("price", 0),
                    "currency": item.get("currency", ""),
                    "rating": item.get("averageUserRating", 0),
                    "rating_current_version": item.get("averageUserRatingForCurrentVersion", 0),
                    "review_count": item.get("userRatingCount", 0),
                    "review_count_current_version": item.get("userRatingCountForCurrentVersion", 0),
                    "version": item.get("version", ""),
                    "release_date": item.get("releaseDate", ""),
                    "current_version_release_date": item.get("currentVersionReleaseDate", ""),
                    "min_os_version": item.get("minimumOsVersion", ""),
                    "file_size_bytes": item.get("fileSizeBytes", ""),
                    "content_rating": item.get("contentAdvisoryRating", ""),
                    "genres": item.get("genres", []),
                    "primary_genre": item.get("primaryGenreName", ""),
                    "primary_genre_id": str(item.get("primaryGenreId", "")),
                    "url": item.get("trackViewUrl", ""),
                    "icon_url": item.get("artworkUrl512", item.get("artworkUrl100", "")),
                    "description": description,
                }

        time.sleep(1)  # Rate limit

        if len(all_apps) >= limit:
            break

    return list(all_apps.values())[:limit]


def scrape_category(country: str, category: str, limit: int = 100, include_paid: bool = False, deep_search: bool = False) -> list:
    """Main scraping function."""
    # Resolve category to ID
    category_lower = category.lower().replace(" ", "-").replace("_", "-")
    category_id = CATEGORIES.get(category_lower)

    if category_id is None:
        try:
            category_id = int(category)
        except ValueError:
            return []

    all_apps = {}

    # RSS feeds
    feed_types = ["topfreeapplications"]
    if include_paid:
        feed_types.extend(["toppaidapplications", "topgrossingapplications"])

    for feed_type in feed_types:
        rss_apps = get_rss_top_apps(country, category_id, feed_type, min(limit, 200))

        if rss_apps:
            app_ids = [app["id"] for app in rss_apps if app["id"]]

            for i in range(0, len(app_ids), 200):
                batch_ids = app_ids[i:i+200]
                details = lookup_app_details(batch_ids, country)
                all_apps.update(details)

                if i + 200 < len(app_ids):
                    time.sleep(0.5)

        time.sleep(0.5)

    # Deep search
    if deep_search and len(all_apps) < limit:
        search_results = search_apps_in_category(country, category_id, limit - len(all_apps))
        for app in search_results:
            if app["id"] not in all_apps:
                all_apps[app["id"]] = app

    return list(all_apps.values())[:limit]


def apply_filters(apps: list, params: dict) -> list:
    """Apply filters to results."""
    min_reviews = params.get("minReviews", 0)
    max_reviews = params.get("maxReviews", 0)
    min_rating = params.get("minRating", 0)
    max_rating = params.get("maxRating", 5)

    filtered = apps

    if min_reviews > 0:
        filtered = [a for a in filtered if a.get("review_count", 0) >= min_reviews]

    if max_reviews > 0:
        filtered = [a for a in filtered if a.get("review_count", 0) <= max_reviews]

    if min_rating > 0:
        filtered = [a for a in filtered if a.get("rating", 0) >= min_rating]

    if max_rating < 5:
        filtered = [a for a in filtered if a.get("rating", 5) <= max_rating]

    # Sort by review count (descending)
    filtered.sort(key=lambda x: x.get("review_count", 0), reverse=True)

    return filtered


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

            country = params.get("country", "us")
            category = params.get("category", "health-fitness")
            limit = min(params.get("limit", 100), 200)
            include_paid = params.get("includePaid", False)
            deep_search = params.get("deepSearch", False)

            # Scrape
            results = scrape_category(
                country=country,
                category=category,
                limit=limit,
                include_paid=include_paid,
                deep_search=deep_search,
            )

            # Filter
            filtered = apply_filters(results, params)

            # Response
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(filtered).encode())

        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())
