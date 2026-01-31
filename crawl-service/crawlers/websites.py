"""Website crawler for competitor landing pages."""

import asyncio
import logging
import re
from datetime import datetime
from typing import Optional
from urllib.parse import urljoin, urlparse
from bs4 import BeautifulSoup
from crawl4ai import CrawlerRunConfig

from .base import BaseCrawler
from models.schemas import WebsiteContent, WebsiteCrawlResponse

logger = logging.getLogger(__name__)


class WebsiteCrawler(BaseCrawler):
    """
    Crawler for competitor websites.

    Extracts:
    - Landing page content
    - Feature lists
    - Pricing information
    - Screenshots
    - Testimonials
    - Technology stack hints
    - Social links
    """

    @property
    def cache_type(self) -> str:
        return "website"

    async def crawl_website(
        self,
        url: str,
        max_pages: int = 10,
        include_subpages: bool = True,
        extract_pricing: bool = True,
        extract_features: bool = True,
        force_refresh: bool = False,
    ) -> WebsiteCrawlResponse:
        """
        Crawl a competitor website.

        Args:
            url: Website URL
            max_pages: Maximum pages to crawl
            include_subpages: Whether to follow links
            extract_pricing: Extract pricing information
            extract_features: Extract feature lists
            force_refresh: Bypass cache

        Returns:
            WebsiteCrawlResponse with extracted content
        """
        cache_params = {
            "max_pages": max_pages,
            "include_subpages": include_subpages,
        }

        # Normalize URL
        if not url.startswith("http"):
            url = f"https://{url}"

        parsed = urlparse(url)
        base_domain = parsed.netloc

        async def do_crawl():
            content = {
                "url": url,
                "title": "",
                "description": "",
                "main_content": "",
                "features": [],
                "pricing_info": None,
                "screenshots": [],
                "testimonials": [],
                "technology_stack": [],
                "social_links": {},
                "crawled_pages": 0,
            }

            visited = set()
            to_visit = [url]

            while to_visit and len(visited) < max_pages:
                current_url = to_visit.pop(0)

                if current_url in visited:
                    continue

                try:
                    result = await self.crawl_page(current_url)

                    if not result or not result.get("html"):
                        continue

                    visited.add(current_url)
                    content["crawled_pages"] += 1

                    soup = BeautifulSoup(result["html"], "lxml")

                    # Extract content based on page type
                    if current_url == url:
                        # Main landing page
                        self._extract_main_page_content(soup, content)
                    else:
                        # Subpage - check if it's pricing or features
                        if self._is_pricing_page(current_url, soup):
                            content["pricing_info"] = self._extract_pricing(soup)
                        elif self._is_features_page(current_url, soup):
                            content["features"].extend(self._extract_features(soup))

                    # Find more links to crawl
                    if include_subpages and len(visited) < max_pages:
                        links = self._find_relevant_links(soup, base_domain, visited)
                        to_visit.extend(links[:max_pages - len(visited)])

                    # Rate limiting
                    await asyncio.sleep(0.5)

                except Exception as e:
                    logger.warning(f"Error crawling {current_url}: {e}")

            # Deduplicate features
            content["features"] = list(set(content["features"]))

            return content

        cached_or_fresh = await self.get_cached_or_crawl(
            identifier=base_domain,
            crawl_func=do_crawl,
            params=cache_params,
            force_refresh=force_refresh,
        )

        return WebsiteCrawlResponse(
            url=url,
            content=WebsiteContent(**cached_or_fresh),
            cached=not force_refresh and self.cache_manager is not None,
        )

    def _extract_main_page_content(self, soup: BeautifulSoup, content: dict) -> None:
        """Extract content from the main landing page."""
        # Title
        title_elem = soup.find("title")
        if title_elem:
            content["title"] = title_elem.get_text(strip=True)

        # Meta description
        meta_desc = soup.find("meta", attrs={"name": "description"})
        if meta_desc:
            content["description"] = meta_desc.get("content", "")

        # OG description as fallback
        if not content["description"]:
            og_desc = soup.find("meta", attrs={"property": "og:description"})
            if og_desc:
                content["description"] = og_desc.get("content", "")

        # Main content (hero, headlines)
        main_content_parts = []

        # Hero section
        for selector in ["hero", "jumbotron", "banner", "[class*='hero']", "header"]:
            hero = soup.select_one(selector)
            if hero:
                text = hero.get_text(" ", strip=True)[:1000]
                if text:
                    main_content_parts.append(text)
                break

        # Main headings
        for h in soup.find_all(["h1", "h2"], limit=10):
            text = h.get_text(strip=True)
            if text and len(text) > 10:
                main_content_parts.append(text)

        content["main_content"] = "\n\n".join(main_content_parts[:5])

        # Features
        content["features"] = self._extract_features(soup)

        # Pricing (if on main page)
        pricing = self._extract_pricing(soup)
        if pricing:
            content["pricing_info"] = pricing

        # Screenshots/images
        content["screenshots"] = self._extract_screenshots(soup)

        # Testimonials
        content["testimonials"] = self._extract_testimonials(soup)

        # Technology hints
        content["technology_stack"] = self._detect_technology(soup)

        # Social links
        content["social_links"] = self._extract_social_links(soup)

    def _extract_features(self, soup: BeautifulSoup) -> list[str]:
        """Extract feature list from page."""
        features = []

        # Look for features section
        feature_selectors = [
            "[class*='feature']",
            "[class*='benefit']",
            "[id*='feature']",
            ".capabilities li",
            ".services li",
        ]

        for selector in feature_selectors:
            elements = soup.select(selector)
            for elem in elements[:20]:
                # Get heading or strong text
                heading = elem.select_one("h2, h3, h4, strong, b")
                if heading:
                    text = heading.get_text(strip=True)
                    if text and 5 < len(text) < 100:
                        features.append(text)

        # Also look for list items in feature-like sections
        feature_sections = soup.select("[class*='feature'], [class*='benefit']")
        for section in feature_sections[:5]:
            for li in section.select("li")[:10]:
                text = li.get_text(strip=True)
                if text and 5 < len(text) < 200:
                    features.append(text[:100])

        return list(set(features))[:30]

    def _extract_pricing(self, soup: BeautifulSoup) -> Optional[dict]:
        """Extract pricing information from page."""
        pricing = {
            "plans": [],
            "has_free_tier": False,
            "currency": "USD",
        }

        # Look for pricing cards/tables
        pricing_containers = soup.select(
            "[class*='pricing'], [class*='plan'], [id*='pricing']"
        )

        for container in pricing_containers[:10]:
            plan = {}

            # Plan name
            name_elem = container.select_one("h2, h3, .plan-name, [class*='title']")
            if name_elem:
                plan["name"] = name_elem.get_text(strip=True)

            # Price
            price_elem = container.select_one("[class*='price'], .amount")
            if price_elem:
                price_text = price_elem.get_text(strip=True)
                plan["price_text"] = price_text

                # Check for free tier
                if any(word in price_text.lower() for word in ["free", "$0", "0/mo"]):
                    pricing["has_free_tier"] = True

                # Extract currency
                if "$" in price_text:
                    pricing["currency"] = "USD"
                elif "€" in price_text:
                    pricing["currency"] = "EUR"
                elif "£" in price_text:
                    pricing["currency"] = "GBP"

            # Features for this plan
            feature_list = container.select("li, .feature")
            plan["features"] = [
                f.get_text(strip=True)[:100]
                for f in feature_list[:10]
                if f.get_text(strip=True)
            ]

            if plan.get("name") or plan.get("price_text"):
                pricing["plans"].append(plan)

        return pricing if pricing["plans"] else None

    def _extract_screenshots(self, soup: BeautifulSoup) -> list[str]:
        """Extract screenshot/product image URLs."""
        screenshots = []

        # Look for app screenshots, product images
        img_selectors = [
            "img[class*='screenshot']",
            "img[class*='product']",
            "img[class*='preview']",
            "img[alt*='screenshot']",
            "[class*='gallery'] img",
            "[class*='carousel'] img",
        ]

        for selector in img_selectors:
            for img in soup.select(selector)[:10]:
                src = img.get("src") or img.get("data-src")
                if src and not any(skip in src.lower() for skip in ["icon", "logo", "avatar", "profile"]):
                    screenshots.append(src)

        # Deduplicate
        return list(set(screenshots))[:10]

    def _extract_testimonials(self, soup: BeautifulSoup) -> list[str]:
        """Extract testimonials/reviews from page."""
        testimonials = []

        # Look for testimonial sections
        testimonial_containers = soup.select(
            "[class*='testimonial'], [class*='review'], [class*='quote'], blockquote"
        )

        for container in testimonial_containers[:10]:
            text = container.get_text(strip=True)
            if text and 20 < len(text) < 500:
                testimonials.append(text[:300])

        return testimonials[:5]

    def _detect_technology(self, soup: BeautifulSoup) -> list[str]:
        """Detect technology stack from page hints."""
        tech_hints = []

        # Check for common technology indicators in scripts/links
        html = str(soup)

        tech_patterns = {
            "React": [r"react", r"_reactRoot"],
            "Vue.js": [r"vue", r"__vue__"],
            "Angular": [r"ng-app", r"angular"],
            "Next.js": [r"__NEXT_DATA__", r"next/"],
            "Nuxt.js": [r"__nuxt", r"nuxt"],
            "Tailwind CSS": [r"tailwind"],
            "Bootstrap": [r"bootstrap"],
            "jQuery": [r"jquery"],
            "WordPress": [r"wp-content", r"wordpress"],
            "Shopify": [r"shopify", r"cdn.shopify"],
            "Webflow": [r"webflow"],
            "Stripe": [r"stripe\.js", r"stripe\.com"],
            "Intercom": [r"intercom"],
            "Segment": [r"segment\.com", r"analytics\.js"],
            "Google Analytics": [r"google-analytics", r"gtag"],
            "Hotjar": [r"hotjar"],
            "Cloudflare": [r"cloudflare"],
        }

        for tech, patterns in tech_patterns.items():
            for pattern in patterns:
                if re.search(pattern, html, re.IGNORECASE):
                    tech_hints.append(tech)
                    break

        return list(set(tech_hints))

    def _extract_social_links(self, soup: BeautifulSoup) -> dict[str, str]:
        """Extract social media links."""
        social_links = {}

        social_patterns = {
            "twitter": r"twitter\.com/(\w+)",
            "facebook": r"facebook\.com/(\w+)",
            "linkedin": r"linkedin\.com/(company|in)/(\w+)",
            "instagram": r"instagram\.com/(\w+)",
            "youtube": r"youtube\.com/(c|channel|user)/(\w+)",
            "github": r"github\.com/(\w+)",
            "discord": r"discord\.(gg|com)",
        }

        for link in soup.find_all("a", href=True):
            href = link.get("href", "")

            for platform, pattern in social_patterns.items():
                if platform not in social_links:
                    match = re.search(pattern, href, re.IGNORECASE)
                    if match:
                        social_links[platform] = href

        return social_links

    def _find_relevant_links(
        self,
        soup: BeautifulSoup,
        base_domain: str,
        visited: set[str]
    ) -> list[str]:
        """Find relevant subpages to crawl."""
        relevant_links = []

        # Priority keywords for relevant pages
        priority_keywords = [
            "pricing", "price", "plans",
            "features", "capabilities",
            "about", "company",
            "testimonials", "reviews", "customers",
            "faq", "help",
        ]

        for link in soup.find_all("a", href=True):
            href = link.get("href", "")

            # Skip external links, anchors, and already visited
            if href.startswith("#") or href.startswith("mailto:") or href.startswith("tel:"):
                continue

            # Make absolute URL
            if not href.startswith("http"):
                href = urljoin(f"https://{base_domain}", href)

            parsed = urlparse(href)

            # Must be same domain
            if parsed.netloc and parsed.netloc != base_domain:
                continue

            # Skip if already visited
            if href in visited:
                continue

            # Prioritize relevant pages
            href_lower = href.lower()
            link_text = link.get_text(strip=True).lower()

            for keyword in priority_keywords:
                if keyword in href_lower or keyword in link_text:
                    if href not in relevant_links:
                        relevant_links.insert(0, href)  # Priority at front
                    break
            else:
                if href not in relevant_links:
                    relevant_links.append(href)

        return relevant_links

    def _is_pricing_page(self, url: str, soup: BeautifulSoup) -> bool:
        """Check if this is a pricing page."""
        url_lower = url.lower()
        if any(kw in url_lower for kw in ["pricing", "price", "plans", "subscription"]):
            return True

        title = soup.find("title")
        if title and any(kw in title.get_text().lower() for kw in ["pricing", "plans"]):
            return True

        return False

    def _is_features_page(self, url: str, soup: BeautifulSoup) -> bool:
        """Check if this is a features page."""
        url_lower = url.lower()
        if any(kw in url_lower for kw in ["features", "capabilities", "product"]):
            return True

        title = soup.find("title")
        if title and any(kw in title.get_text().lower() for kw in ["features", "capabilities"]):
            return True

        return False

    async def crawl(self, **kwargs) -> WebsiteCrawlResponse:
        """Crawl a website."""
        return await self.crawl_website(
            url=kwargs["url"],
            max_pages=kwargs.get("max_pages", 10),
            include_subpages=kwargs.get("include_subpages", True),
            extract_pricing=kwargs.get("extract_pricing", True),
            extract_features=kwargs.get("extract_features", True),
            force_refresh=kwargs.get("force_refresh", False),
        )
