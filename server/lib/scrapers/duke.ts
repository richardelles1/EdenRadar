/**
 * Duke University — Office of Technology Commercialization (OTC)
 *
 * Platform: WordPress, CPT slug pt__technology (changed from "technologies")
 * API: WP REST API at /wp-json/wp/v2/pt__technology — bypasses Anubis bot protection
 *   (Anubis blocks HTML pages; the REST API endpoint is unprotected)
 * No proxy required — direct fetch works from any IP.
 * X-WP-Total / X-WP-TotalPages headers available directly.
 * Verified 2026-05-21: 548 technologies across 6 pages at per_page=100.
 */

import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchJson } from "./utils";

const INST = "Duke University";
const BASE = "https://otc.duke.edu";
const WP_API = `${BASE}/wp-json/wp/v2/pt__technology`;
const PER_PAGE = 100;

interface WpPost {
  id: number;
  title: { rendered: string };
  link: string;
  excerpt?: { rendered: string };
}

function cleanHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();
}

function mapPost(p: WpPost): ScrapedListing {
  return {
    title: cleanHtml(p.title.rendered),
    description: cleanHtml(p.excerpt?.rendered ?? ""),
    url: p.link,
    institution: INST,
  };
}

export const dukeScraper: InstitutionScraper = {
  institution: INST,
  scraperType: "manual",

  async probe(maxResults = 3): Promise<ScrapedListing[]> {
    const posts = await fetchJson<WpPost[]>(
      `${WP_API}?per_page=${maxResults}&page=1&_fields=id,title,link,excerpt`,
      15_000
    );
    if (!posts) return [];
    return posts.map(mapPost).filter((r) => r.title.length > 3).slice(0, maxResults);
  },

  async scrape(): Promise<ScrapedListing[]> {
    console.log(`[scraper] ${INST}: fetching via WP REST API (pt__technology)...`);
    const results: ScrapedListing[] = [];

    for (let page = 1; page <= 10; page++) {
      const posts = await fetchJson<WpPost[]>(
        `${WP_API}?per_page=${PER_PAGE}&page=${page}&_fields=id,title,link,excerpt`,
        20_000
      );
      if (!posts || posts.length === 0) break;

      for (const p of posts) {
        const listing = mapPost(p);
        if (listing.title.length > 3) results.push(listing);
      }

      if (posts.length < PER_PAGE) break;
    }

    console.log(`[scraper] ${INST}: ${results.length} listings`);
    return results;
  },
};
