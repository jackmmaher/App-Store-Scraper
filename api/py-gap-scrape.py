"""
Gap Analysis Multi-Country Scraper - Vercel Serverless Function
Scrapes top apps from multiple countries for cross-market analysis.
Streams progress via SSE.
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


def scrape_country(country: str, category_id: int, limit: int = 50, include_paid: bool = True) -> list:
    """Scrape apps for a single country."""
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

                # Track rank position for each app
                for rank, app_id in enumerate(batch_ids, start=1):
                    if app_id in details:
                        if app_id not in all_apps:
                            all_apps[app_id] = details[app_id]
                            all_apps[app_id]["rank"] = rank
                        elif rank < all_apps[app_id].get("rank", 999):
                            all_apps[app_id]["rank"] = rank

                if i + 200 < len(app_ids):
                    time.sleep(0.3)

        time.sleep(0.3)

    # Sort by rank and limit
    sorted_apps = sorted(all_apps.values(), key=lambda x: x.get("rank", 999))
    return sorted_apps[:limit]


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def send_sse_event(self, event_type: str, data: dict):
        """Send an SSE event."""
        event_data = json.dumps({"type": event_type, **data})
        self.wfile.write(f"data: {event_data}\n\n".encode())
        self.wfile.flush()

    def do_POST(self):
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length).decode()
            params = json.loads(body) if body else {}

            category = params.get("category", "health-fitness")
            countries = params.get("countries", ["us"])
            apps_per_country = min(params.get("appsPerCountry", 50), 100)

            # Resolve category to ID
            category_lower = category.lower().replace(" ", "-").replace("_", "-")
            category_id = CATEGORIES.get(category_lower)

            if category_id is None:
                try:
                    category_id = int(category)
                except ValueError:
                    self.send_response(400)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": f"Invalid category: {category}"}).encode())
                    return

            # Set up SSE response
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "keep-alive")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()

            # Track all unique apps across countries
            all_apps = {}  # app_store_id -> { app_data, countries: {country: rank} }
            total_countries = len(countries)

            for index, country in enumerate(countries):
                # Send country start event
                self.send_sse_event("country_start", {
                    "country": country,
                    "index": index,
                    "total": total_countries
                })

                # Scrape this country
                country_apps = scrape_country(country, category_id, apps_per_country)
                unique_new = 0

                for app in country_apps:
                    app_id = app["id"]
                    rank = app.get("rank", 999)

                    if app_id in all_apps:
                        # Add country presence
                        all_apps[app_id]["countries"][country] = rank
                    else:
                        # New unique app
                        all_apps[app_id] = {
                            "app": app,
                            "countries": {country: rank}
                        }
                        unique_new += 1

                # Send country progress
                self.send_sse_event("country_progress", {
                    "country": country,
                    "apps_found": len(country_apps)
                })

                # Send country complete event
                self.send_sse_event("country_complete", {
                    "country": country,
                    "apps_found": len(country_apps),
                    "unique_new": unique_new,
                    "total_unique": len(all_apps)
                })

                # Rate limit between countries
                if index < total_countries - 1:
                    time.sleep(0.5)

            # Prepare final results
            results = []
            for app_id, data in all_apps.items():
                app = data["app"]
                country_ranks = data["countries"]
                countries_present = list(country_ranks.keys())

                # Calculate average rank (only from ranks we have)
                ranks = [r for r in country_ranks.values() if r is not None]
                avg_rank = sum(ranks) / len(ranks) if ranks else None

                results.append({
                    "app_store_id": app["id"],
                    "app_name": app["name"],
                    "app_icon_url": app.get("icon_url"),
                    "app_developer": app.get("developer"),
                    "app_rating": app.get("rating"),
                    "app_review_count": app.get("review_count", 0),
                    "app_primary_genre": app.get("primary_genre"),
                    "app_url": app.get("url"),
                    "countries_present": countries_present,
                    "country_ranks": country_ranks,
                    "presence_count": len(countries_present),
                    "average_rank": avg_rank,
                })

            # Sort by presence count (descending), then by average rank (ascending)
            results.sort(key=lambda x: (-x["presence_count"], x["average_rank"] or 999))

            # Send complete event with all results
            self.send_sse_event("complete", {
                "total_apps": sum(1 for _ in all_apps),
                "unique_apps": len(all_apps),
                "countries_scraped": countries,
                "apps": results
            })

        except Exception as e:
            import traceback
            error_msg = f"{str(e)}\n{traceback.format_exc()}"
            print(f"Error in gap scraper: {error_msg}")

            try:
                self.send_sse_event("error", {"message": str(e)})
            except:
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode())
