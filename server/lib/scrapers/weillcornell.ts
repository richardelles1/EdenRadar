/**
 * Weill Cornell Medicine — Enterprise Innovation Office
 *
 * Platform: Drupal Views, SSR, no bot protection
 * Listing: https://innovation.weill.cornell.edu/technology-portfolio
 * Pagination: ?page=N (0-indexed Drupal pager; last page is ?page=28, ~290 total)
 * Item selector: div.views-row h3 a → title + relative href
 * Detail pages: https://innovation.weill.cornell.edu/industry-investors-partners/technology-portfolio/[slug]
 *   Description in .entry-content / .field--name-body
 *   Cornell Reference ID as technologyId
 *
 * Separate institution from cornellScraper (which covers Cornell Ithaca via TechPublisher).
 * Verified accessible 2026-05-21: ~290 technologies, 29 pages.
 */

import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText } from "./utils";
import { enrichWithDetailPages } from "./detailFetcher";

const INST = "Weill Cornell Medicine";
const BASE = "https://innovation.weill.cornell.edu";
const LISTING = `${BASE}/technology-portfolio`;
const MAX_PAGES = 32;
const RATE_DELAY_MS = 300;

const DETAIL_SELECTORS = {
  description: [
    ".field--name-body",
    ".field--type-text-with-summary",
    ".entry-content",
    "main article p",
  ],
  technologyId: [
    ".cornell-reference",
    ".field--name-field-ref-number",
  ],
};

async function fetchListingPage(page: number): Promise<ScrapedListing[]> {
  const url = page === 0 ? LISTING : `${LISTING}?page=${page}`;
  const $ = await fetchHtml(url, 15_000);
  if (!$) return [];

  const items: ScrapedListing[] = [];
  $(".views-row h3 a").each((_, el) => {
    const title = cleanText($(el).text());
    const href = $(el).attr("href") ?? "";
    if (title.length < 4 || !href) return;
    items.push({
      title,
      url: href.startsWith("http") ? href : `${BASE}${href}`,
      institution: INST,
      description: "",
    });
  });
  return items;
}

export const weillCornellScraper: InstitutionScraper = {
  institution: INST,

  async probe(maxResults = 3): Promise<ScrapedListing[]> {
    return fetchListingPage(0).then((r) => r.slice(0, maxResults));
  },

  async scrape(): Promise<ScrapedListing[]> {
    console.log(`[scraper] ${INST}: fetching listing pages...`);
    const all: ScrapedListing[] = [];

    for (let page = 0; page <= MAX_PAGES; page++) {
      const items = await fetchListingPage(page);
      if (items.length === 0) break;
      all.push(...items);
      if (page < MAX_PAGES && items.length > 0) {
        await new Promise((r) => setTimeout(r, RATE_DELAY_MS));
      }
    }

    console.log(`[scraper] ${INST}: ${all.length} listings — enriching descriptions...`);
    await enrichWithDetailPages(all, DETAIL_SELECTORS);
    console.log(`[scraper] ${INST}: done`);
    return all;
  },
};
