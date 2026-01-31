"""
Website Crawler - Simplified version using httpx and BeautifulSoup
"""

import asyncio
import logging
import re
from typing import List, Optional
from urllib.parse import urljoin, urlparse
from bs4 import BeautifulSoup

from .base import BaseCrawler

logger = logging.getLogger(__name__)


class WebsiteCrawler(BaseCrawler):
    """Crawl competitor websites for features, pricing, etc."""

    async def crawl_website(
        self,
        url: str,
        max_pages: int = 10,
        include_subpages: bool = True,
        extract_pricing: bool = True,
        extract_features: bool = True,
    ) -> dict:
        """
        Crawl a website and extract useful information.
        """
        parsed_url = urlparse(url)
        base_domain = f"{parsed_url.scheme}://{parsed_url.netloc}"

        result = {
            "url": url,
            "domain": parsed_url.netloc,
            "title": "",
            "description": "",
            "main_content": "",
            "features": [],
            "pricing_info": None,
            "screenshots": [],
            "testimonials": [],
            "social_links": {},
            "crawled_pages": 0,
        }

        # Crawl main page
        html = await self.fetch(url)
        if not html:
            return result

        soup = BeautifulSoup(html, "html.parser")
        result.update(self._extract_page_info(soup, url))
        result["crawled_pages"] = 1

        if extract_features:
            result["features"] = self._extract_features(soup)

        if extract_pricing:
            # Try to find and crawl pricing page
            pricing_urls = self._find_pricing_links(soup, base_domain)
            for pricing_url in pricing_urls[:1]:  # Only try first pricing link
                pricing_html = await self.fetch(pricing_url)
                if pricing_html:
                    pricing_soup = BeautifulSoup(pricing_html, "html.parser")
                    result["pricing_info"] = self._extract_pricing(pricing_soup)
                    result["crawled_pages"] += 1
                    break
                await asyncio.sleep(0.5)

        # Extract testimonials
        result["testimonials"] = self._extract_testimonials(soup)

        # Extract social links
        result["social_links"] = self._extract_social_links(soup)

        return result

    def _extract_page_info(self, soup: BeautifulSoup, url: str) -> dict:
        """Extract basic page information"""
        title = ""
        if soup.title:
            title = soup.title.string or ""

        description = ""
        meta_desc = soup.find("meta", attrs={"name": "description"})
        if meta_desc:
            description = meta_desc.get("content", "")

        # Extract main content (simplified)
        main_content = ""
        for tag in ["main", "article", "[role='main']"]:
            main = soup.select_one(tag)
            if main:
                main_content = main.get_text(separator=" ", strip=True)[:2000]
                break

        if not main_content:
            body = soup.find("body")
            if body:
                main_content = body.get_text(separator=" ", strip=True)[:2000]

        return {
            "title": title.strip(),
            "description": description.strip(),
            "main_content": main_content,
        }

    def _extract_features(self, soup: BeautifulSoup) -> List[str]:
        """Extract feature list from page"""
        features = []

        # Look for feature lists
        feature_selectors = [
            ".features li",
            ".feature-list li",
            "[class*='feature'] li",
            ".benefits li",
            "ul.features li",
        ]

        for selector in feature_selectors:
            items = soup.select(selector)
            for item in items[:20]:
                text = item.get_text(strip=True)
                if text and len(text) > 5 and len(text) < 200:
                    features.append(text)

        # Deduplicate
        return list(dict.fromkeys(features))[:15]

    def _find_pricing_links(self, soup: BeautifulSoup, base_domain: str) -> List[str]:
        """Find links to pricing pages"""
        pricing_urls = []

        for link in soup.find_all("a", href=True):
            href = link.get("href", "")
            text = link.get_text(strip=True).lower()

            if any(word in text for word in ["pricing", "plans", "price"]) or \
               any(word in href.lower() for word in ["pricing", "plans", "price"]):
                full_url = urljoin(base_domain, href)
                if full_url not in pricing_urls:
                    pricing_urls.append(full_url)

        return pricing_urls

    def _extract_pricing(self, soup: BeautifulSoup) -> Optional[dict]:
        """Extract pricing information"""
        pricing = {
            "plans": [],
            "currency": "USD",
        }

        # Look for pricing cards/tables
        price_patterns = [
            r'\$(\d+(?:\.\d{2})?)',
            r'(\d+(?:\.\d{2})?)\s*(?:USD|EUR|GBP)',
        ]

        price_containers = soup.select("[class*='price'], [class*='plan'], [class*='tier']")

        for container in price_containers[:5]:
            text = container.get_text(separator=" ", strip=True)
            for pattern in price_patterns:
                matches = re.findall(pattern, text)
                if matches:
                    pricing["plans"].append({
                        "text": text[:200],
                        "prices_found": matches[:3],
                    })
                    break

        return pricing if pricing["plans"] else None

    def _extract_testimonials(self, soup: BeautifulSoup) -> List[str]:
        """Extract testimonials/reviews"""
        testimonials = []

        selectors = [
            ".testimonial",
            ".review",
            "[class*='testimonial']",
            "blockquote",
        ]

        for selector in selectors:
            items = soup.select(selector)
            for item in items[:5]:
                text = item.get_text(strip=True)
                if text and len(text) > 20 and len(text) < 500:
                    testimonials.append(text)

        return testimonials[:5]

    def _extract_social_links(self, soup: BeautifulSoup) -> dict:
        """Extract social media links"""
        social = {}
        platforms = ["twitter", "facebook", "linkedin", "instagram", "youtube", "github"]

        for link in soup.find_all("a", href=True):
            href = link.get("href", "").lower()
            for platform in platforms:
                if platform in href and platform not in social:
                    social[platform] = link.get("href")

        return social
