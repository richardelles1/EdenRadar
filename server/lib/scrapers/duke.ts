/**
 * Duke University — Office of Technology Commercialization (OTC)
 *
 * Platform: WordPress, CPT slug pt__technology
 * API: WP REST API at /wp-json/wp/v2/pt__technology
 * Anti-bot: Anubis proof-of-work gate — blocks browser User-Agents (Mozilla/5.0 etc.)
 *   but passes non-browser UAs through to the REST API without challenge.
 * Fix: raw fetch() with EdenRadar-Indexer/1.0 UA — never use fetchJson() here.
 * Per-page cap: WordPress limits to 9 per page regardless of per_page param.
 * Verified 2026-06-09: 548 technologies across 61 pages at 9/page.
 */

import type { InstitutionScraper, ScrapedListing } from "./types";

const INST = "Duke University";
const BASE = "https://otc.duke.edu";
const WP_API = `${BASE}/wp-json/wp/v2/pt__technology`;
const BOT_UA = "EdenRadar-Indexer/1.0";

interface WpPost {
  id: number;
  title: { rendered: string };
  link: string;
  excerpt?: { rendered: string };
}

function cleanHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();
}

async function fetchPage(page: number, perPage: number): Promise<{ posts: WpPost[]; totalPages: number }> {
  const url = `${WP_API}?per_page=${perPage}&page=${page}&_fields=id,title,link,excerpt`;
  const res = await fetch(url, {
    headers: { "User-Agent": BOT_UA },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) return { posts: [], totalPages: 0 };
  const totalPages = parseInt(res.headers.get("X-WP-TotalPages") ?? "1", 10);
  const posts: WpPost[] = await res.json();
  return { posts, totalPages };
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
  scraperType: "api",

  async probe(maxResults = 3): Promise<ScrapedListing[]> {
    const { posts } = await fetchPage(1, maxResults);
    return posts.map(mapPost).filter((r) => r.title.length > 3).slice(0, maxResults);
  },

  async scrape(): Promise<ScrapedListing[]> {
    console.log(`[scraper] ${INST}: fetching via WP REST API (non-browser UA)...`);
    const results: ScrapedListing[] = [];

    const { posts: firstPage, totalPages } = await fetchPage(1, 9);
    if (firstPage.length === 0) {
      console.error(`[scraper] ${INST}: page 1 returned 0 posts — possible block`);
      return [];
    }
    for (const p of firstPage) {
      const listing = mapPost(p);
      if (listing.title.length > 3) results.push(listing);
    }

    const maxPages = Math.max(totalPages, 65);
    for (let page = 2; page <= maxPages; page++) {
      const { posts } = await fetchPage(page, 9);
      if (posts.length === 0) break;
      for (const p of posts) {
        const listing = mapPost(p);
        if (listing.title.length > 3) results.push(listing);
      }
    }

    console.log(`[scraper] ${INST}: ${results.length} listings`);
    return results;
  },
};
