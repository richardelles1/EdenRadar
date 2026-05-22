/**
 * NTNU Technology Transfer Office (NTNU TTO)
 *
 * Platform: WordPress + Avada theme — avada_portfolio custom post type
 * API: WP REST API, no proxy required (www.ntnutto.no is publicly accessible)
 *
 * Licensing categories included:
 *   available-for-licensing, ie-available-technologies, ongoingprojects
 * (Verified 2026-05-21: ~14–21 licensable technologies across these three categories)
 */

import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchJson } from "./utils";

const INST = "NTNU";
const BASE = "https://www.ntnutto.no";
const PER_PAGE = 100;
const LICENSING_SLUGS = new Set([
  "available-for-licensing",
  "ie-available-technologies",
  "ongoingprojects",
]);

interface WpPortfolioItem {
  id: number;
  link: string;
  title: { rendered: string };
  excerpt: { rendered: string };
  portfolio_category: number[];
}

interface WpTaxTerm {
  id: number;
  slug: string;
}

function cleanHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchLicensingTermIds(): Promise<Set<number>> {
  const terms = await fetchJson<WpTaxTerm[]>(
    `${BASE}/wp-json/wp/v2/portfolio_category?per_page=100&_fields=id,slug`,
    10_000
  );
  if (!terms) return new Set();
  return new Set(
    terms.filter((t) => LICENSING_SLUGS.has(t.slug)).map((t) => t.id)
  );
}

async function fetchFilteredItems(termIds: Set<number>): Promise<ScrapedListing[]> {
  const items = await fetchJson<WpPortfolioItem[]>(
    `${BASE}/wp-json/wp/v2/avada_portfolio?per_page=${PER_PAGE}&_fields=id,title,excerpt,link,portfolio_category`,
    15_000
  );
  if (!items || items.length === 0) return [];

  const results: ScrapedListing[] = [];
  for (const item of items) {
    const include =
      termIds.size === 0 ||
      item.portfolio_category?.some((id) => termIds.has(id));
    if (!include) continue;

    const title = cleanHtml(item.title.rendered);
    if (title.length < 4) continue;

    results.push({
      title,
      description: cleanHtml(item.excerpt?.rendered ?? ""),
      url: item.link,
      institution: INST,
    });
  }
  return results;
}

export const ntnuScraper: InstitutionScraper = {
  institution: INST,
  scraperType: "api",

  async probe(maxResults = 3): Promise<ScrapedListing[]> {
    const termIds = await fetchLicensingTermIds();
    const all = await fetchFilteredItems(termIds);
    return all.slice(0, maxResults);
  },

  async scrape(): Promise<ScrapedListing[]> {
    console.log(`[scraper] ${INST}: fetching via WP REST API (avada_portfolio CPT)...`);
    const termIds = await fetchLicensingTermIds();
    const results = await fetchFilteredItems(termIds);
    console.log(`[scraper] ${INST}: ${results.length} listings`);
    return results;
  },
};
