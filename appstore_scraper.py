#!/usr/bin/env python3
"""
App Store Category Scraper
Fetches top apps from App Store categories with review counts and ratings.
Sorts by review count to find apps with highest engagement.

Usage:
    python appstore_scraper.py --country us --category health-fitness --limit 100
    python appstore_scraper.py --country gb --category productivity --limit 200 --sort rating
"""

import argparse
import requests
import json
import csv
import time
import sys
from datetime import datetime
from pathlib import Path

# App Store category IDs (genre IDs)
CATEGORIES = {
    # Main categories
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
    
    # Game subcategories
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

# Common country codes
COUNTRY_CODES = {
    "us": "United States",
    "gb": "United Kingdom", 
    "ca": "Canada",
    "au": "Australia",
    "de": "Germany",
    "fr": "France",
    "jp": "Japan",
    "cn": "China",
    "kr": "South Korea",
    "in": "India",
    "br": "Brazil",
    "mx": "Mexico",
    "es": "Spain",
    "it": "Italy",
    "nl": "Netherlands",
    "se": "Sweden",
    "no": "Norway",
    "dk": "Denmark",
    "fi": "Finland",
    "ru": "Russia",
    "pl": "Poland",
    "tr": "Turkey",
    "sa": "Saudi Arabia",
    "ae": "UAE",
    "sg": "Singapore",
    "hk": "Hong Kong",
    "tw": "Taiwan",
    "nz": "New Zealand",
    "ie": "Ireland",
    "at": "Austria",
    "ch": "Switzerland",
    "be": "Belgium",
    "pt": "Portugal",
}


def get_rss_top_apps(country: str, category_id: int, feed_type: str = "topfreeapplications", limit: int = 100) -> list:
    """
    Fetch top apps from Apple's RSS feed.
    
    feed_type options:
        - topfreeapplications
        - toppaidapplications
        - topgrossingapplications
        - newapplications
    """
    # Apple RSS feed URL - can fetch up to 200 at once
    url = f"https://itunes.apple.com/{country}/rss/{feed_type}/limit={min(limit, 200)}/genre={category_id}/json"
    
    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        data = response.json()
        
        entries = data.get("feed", {}).get("entry", [])
        if not entries:
            print(f"Warning: No entries found in RSS feed for category {category_id}")
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
        
    except requests.exceptions.RequestException as e:
        print(f"Error fetching RSS feed: {e}")
        return []
    except json.JSONDecodeError as e:
        print(f"Error parsing RSS JSON: {e}")
        return []


def lookup_app_details(app_ids: list, country: str) -> dict:
    """
    Look up detailed app information including review counts using iTunes Search API.
    Can lookup up to 200 apps at once.
    """
    if not app_ids:
        return {}
    
    # iTunes lookup API accepts comma-separated IDs (max ~200)
    ids_str = ",".join(str(id) for id in app_ids[:200])
    url = f"https://itunes.apple.com/lookup?id={ids_str}&country={country}"
    
    try:
        response = requests.get(url, timeout=60)
        response.raise_for_status()
        data = response.json()
        
        results = {}
        for item in data.get("results", []):
            app_id = str(item.get("trackId", ""))
            results[app_id] = {
                "id": app_id,
                "name": item.get("trackName", ""),
                "bundle_id": item.get("bundleId", ""),
                "developer": item.get("artistName", ""),
                "developer_id": item.get("artistId", ""),
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
                "primary_genre_id": item.get("primaryGenreId", ""),
                "url": item.get("trackViewUrl", ""),
                "icon_url": item.get("artworkUrl512", item.get("artworkUrl100", "")),
                "description": item.get("description", "")[:500] + "..." if len(item.get("description", "")) > 500 else item.get("description", ""),
            }
        
        return results
        
    except requests.exceptions.RequestException as e:
        print(f"Error looking up app details: {e}")
        return {}
    except json.JSONDecodeError as e:
        print(f"Error parsing lookup JSON: {e}")
        return {}


def search_apps_in_category(country: str, category_id: int, search_terms: list = None, limit: int = 200) -> list:
    """
    Alternative method: Search for apps with specific terms in a category.
    Useful for finding more apps beyond the RSS feed limit.
    """
    if search_terms is None:
        # Default generic terms to find apps in category
        search_terms = ["app", "pro", "free", "best", "top", "new"]
    
    all_apps = {}
    
    for term in search_terms:
        url = f"https://itunes.apple.com/search"
        params = {
            "term": term,
            "country": country,
            "media": "software",
            "entity": "software",
            "genreId": category_id,
            "limit": 200,
        }
        
        try:
            response = requests.get(url, params=params, timeout=30)
            response.raise_for_status()
            data = response.json()
            
            for item in data.get("results", []):
                app_id = str(item.get("trackId", ""))
                if app_id and app_id not in all_apps:
                    all_apps[app_id] = {
                        "id": app_id,
                        "name": item.get("trackName", ""),
                        "bundle_id": item.get("bundleId", ""),
                        "developer": item.get("artistName", ""),
                        "developer_id": item.get("artistId", ""),
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
                        "primary_genre_id": item.get("primaryGenreId", ""),
                        "url": item.get("trackViewUrl", ""),
                        "icon_url": item.get("artworkUrl512", item.get("artworkUrl100", "")),
                        "description": item.get("description", "")[:500] + "..." if len(item.get("description", "")) > 500 else item.get("description", ""),
                    }
            
            # Rate limit: ~20 calls per minute
            time.sleep(3)
            
            if len(all_apps) >= limit:
                break
                
        except requests.exceptions.RequestException as e:
            print(f"Error searching for '{term}': {e}")
            continue
    
    return list(all_apps.values())[:limit]


def scrape_category(country: str, category: str, limit: int = 100, include_paid: bool = False, 
                    deep_search: bool = False, search_terms: list = None) -> list:
    """
    Main function to scrape apps from a category.
    
    Args:
        country: Two-letter country code (e.g., 'us', 'gb')
        category: Category name or ID
        limit: Maximum number of apps to return
        include_paid: Include paid apps RSS feed
        deep_search: Use search API to find more apps (slower)
        search_terms: Custom search terms for deep search
    
    Returns:
        List of app dictionaries with details
    """
    # Resolve category to ID
    if isinstance(category, str):
        category_lower = category.lower().replace(" ", "-").replace("_", "-")
        category_id = CATEGORIES.get(category_lower)
        if category_id is None:
            # Try to parse as numeric ID
            try:
                category_id = int(category)
            except ValueError:
                print(f"Unknown category: {category}")
                print(f"Available categories: {', '.join(sorted(CATEGORIES.keys()))}")
                return []
    else:
        category_id = category
    
    print(f"Scraping category ID {category_id} in {country.upper()} store...")
    
    all_apps = {}
    
    # Method 1: RSS feeds (fast, up to 200 per feed type)
    feed_types = ["topfreeapplications"]
    if include_paid:
        feed_types.extend(["toppaidapplications", "topgrossingapplications"])
    
    for feed_type in feed_types:
        print(f"  Fetching {feed_type}...")
        rss_apps = get_rss_top_apps(country, category_id, feed_type, min(limit, 200))
        
        if rss_apps:
            # Get IDs for lookup
            app_ids = [app["id"] for app in rss_apps if app["id"]]
            
            # Lookup in batches of 200
            for i in range(0, len(app_ids), 200):
                batch_ids = app_ids[i:i+200]
                print(f"    Looking up details for {len(batch_ids)} apps...")
                details = lookup_app_details(batch_ids, country)
                all_apps.update(details)
                
                if i + 200 < len(app_ids):
                    time.sleep(1)  # Brief pause between batches
        
        time.sleep(1)  # Pause between feed types
    
    # Method 2: Search API (slower, but can find more apps)
    if deep_search and len(all_apps) < limit:
        print(f"  Deep searching for more apps...")
        search_results = search_apps_in_category(
            country, category_id, 
            search_terms=search_terms,
            limit=limit - len(all_apps)
        )
        for app in search_results:
            if app["id"] not in all_apps:
                all_apps[app["id"]] = app
    
    return list(all_apps.values())[:limit]


def format_number(n):
    """Format large numbers with K/M suffix."""
    if n >= 1_000_000:
        return f"{n/1_000_000:.1f}M"
    elif n >= 1_000:
        return f"{n/1_000:.1f}K"
    return str(n)


def main():
    parser = argparse.ArgumentParser(
        description="Scrape App Store categories and sort by review count",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    python appstore_scraper.py --country us --category health-fitness
    python appstore_scraper.py --country gb --category productivity --limit 200
    python appstore_scraper.py --country us --category games --include-paid --deep-search
    python appstore_scraper.py --list-categories
    python appstore_scraper.py --list-countries

Available categories:
    """ + ", ".join(sorted(CATEGORIES.keys()))
    )
    
    parser.add_argument("--country", "-c", default="us",
                        help="Two-letter country code (default: us)")
    parser.add_argument("--category", "-g", default="health-fitness",
                        help="Category name or ID (default: health-fitness)")
    parser.add_argument("--limit", "-l", type=int, default=100,
                        help="Max apps to fetch (default: 100)")
    parser.add_argument("--sort", "-s", choices=["reviews", "rating", "name"], default="reviews",
                        help="Sort by: reviews, rating, or name (default: reviews)")
    parser.add_argument("--asc", action="store_true",
                        help="Sort ascending (lowest first) - useful for finding low-rated popular apps")
    parser.add_argument("--min-reviews", type=int, default=0,
                        help="Minimum review count filter")
    parser.add_argument("--max-reviews", type=int, default=0,
                        help="Maximum review count filter (0 = no limit)")
    parser.add_argument("--min-rating", type=float, default=0,
                        help="Minimum rating filter (0-5)")
    parser.add_argument("--max-rating", type=float, default=5,
                        help="Maximum rating filter (0-5) - find poorly rated apps")
    parser.add_argument("--include-paid", "-p", action="store_true",
                        help="Include paid apps (default: free only)")
    parser.add_argument("--deep-search", "-d", action="store_true",
                        help="Use search API for more results (slower)")
    parser.add_argument("--search-terms", nargs="+",
                        help="Custom search terms for deep search")
    parser.add_argument("--output", "-o", choices=["table", "csv", "json"], default="table",
                        help="Output format (default: table)")
    parser.add_argument("--output-file", "-f",
                        help="Save output to file")
    parser.add_argument("--list-categories", action="store_true",
                        help="List all available categories")
    parser.add_argument("--list-countries", action="store_true",
                        help="List all country codes")
    
    args = parser.parse_args()
    
    # Handle list commands
    if args.list_categories:
        print("\nAvailable Categories:")
        print("-" * 40)
        for name, cat_id in sorted(CATEGORIES.items()):
            print(f"  {name:<30} (ID: {cat_id})")
        return
    
    if args.list_countries:
        print("\nCountry Codes:")
        print("-" * 40)
        for code, name in sorted(COUNTRY_CODES.items()):
            print(f"  {code}  -  {name}")
        return
    
    # Validate country
    country = args.country.lower()
    if country not in COUNTRY_CODES and len(country) != 2:
        print(f"Warning: '{country}' may not be a valid country code")
    
    # Scrape apps
    apps = scrape_category(
        country=country,
        category=args.category,
        limit=args.limit,
        include_paid=args.include_paid,
        deep_search=args.deep_search,
        search_terms=args.search_terms,
    )
    
    if not apps:
        print("No apps found. Check category name and country code.")
        return
    
    # Apply filters
    if args.min_reviews > 0:
        apps = [a for a in apps if a.get("review_count", 0) >= args.min_reviews]
    
    if args.max_reviews > 0:
        apps = [a for a in apps if a.get("review_count", 0) <= args.max_reviews]
    
    if args.min_rating > 0:
        apps = [a for a in apps if a.get("rating", 0) >= args.min_rating]
    
    if args.max_rating < 5:
        apps = [a for a in apps if a.get("rating", 5) <= args.max_rating]
    
    # Sort
    reverse = not args.asc  # Default descending, --asc makes it ascending
    if args.sort == "reviews":
        apps.sort(key=lambda x: x.get("review_count", 0), reverse=reverse)
    elif args.sort == "rating":
        apps.sort(key=lambda x: (x.get("rating", 0), x.get("review_count", 0)), reverse=reverse)
    else:
        apps.sort(key=lambda x: x.get("name", "").lower(), reverse=not reverse)  # name: asc by default
    
    # Output
    if args.output == "json":
        output = json.dumps(apps, indent=2)
        if args.output_file:
            Path(args.output_file).write_text(output)
            print(f"Saved {len(apps)} apps to {args.output_file}")
        else:
            print(output)
    
    elif args.output == "csv":
        fieldnames = ["name", "review_count", "rating", "developer", "price", "version", "url"]
        
        if args.output_file:
            with open(args.output_file, "w", newline="", encoding="utf-8") as f:
                writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
                writer.writeheader()
                writer.writerows(apps)
            print(f"Saved {len(apps)} apps to {args.output_file}")
        else:
            import io
            output = io.StringIO()
            writer = csv.DictWriter(output, fieldnames=fieldnames, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(apps)
            print(output.getvalue())
    
    else:  # table
        print(f"\n{'='*100}")
        print(f"App Store: {country.upper()} | Category: {args.category} | Found: {len(apps)} apps")
        print(f"Sorted by: {args.sort} | Min reviews: {args.min_reviews} | Min rating: {args.min_rating}")
        print(f"{'='*100}\n")
        
        # Header
        print(f"{'#':<4} {'App Name':<40} {'Reviews':>12} {'Rating':>7} {'Developer':<30}")
        print("-" * 100)
        
        for i, app in enumerate(apps, 1):
            name = app.get("name", "Unknown")[:38]
            reviews = format_number(app.get("review_count", 0))
            rating = f"{app.get('rating', 0):.1f}" if app.get("rating") else "N/A"
            developer = app.get("developer", "Unknown")[:28]
            
            print(f"{i:<4} {name:<40} {reviews:>12} {rating:>7} {developer:<30}")
        
        print("-" * 100)
        print(f"\nTotal: {len(apps)} apps")
        
        if apps:
            total_reviews = sum(a.get("review_count", 0) for a in apps)
            avg_rating = sum(a.get("rating", 0) for a in apps if a.get("rating")) / max(1, len([a for a in apps if a.get("rating")]))
            print(f"Combined reviews: {format_number(total_reviews)}")
            print(f"Average rating: {avg_rating:.2f}")
        
        # Save to file if specified
        if args.output_file:
            with open(args.output_file, "w", encoding="utf-8") as f:
                f.write(f"App Store: {country.upper()} | Category: {args.category}\n")
                f.write(f"Generated: {datetime.now().isoformat()}\n")
                f.write("=" * 100 + "\n\n")
                f.write(f"{'#':<4} {'App Name':<40} {'Reviews':>12} {'Rating':>7} {'Developer':<30}\n")
                f.write("-" * 100 + "\n")
                for i, app in enumerate(apps, 1):
                    name = app.get("name", "Unknown")[:38]
                    reviews = format_number(app.get("review_count", 0))
                    rating = f"{app.get('rating', 0):.1f}" if app.get("rating") else "N/A"
                    developer = app.get("developer", "Unknown")[:28]
                    f.write(f"{i:<4} {name:<40} {reviews:>12} {rating:>7} {developer:<30}\n")
            print(f"\nSaved to: {args.output_file}")


if __name__ == "__main__":
    main()
