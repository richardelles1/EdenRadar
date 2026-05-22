/**
 * KAIST Technology Licensing Office (TLO)
 *
 * Platform: Custom CMS (tlo.kaist.ac.kr), English version available
 * List URL: /eng/KAIST-patent-portfolio/index/search_field//category_depth1//page/{n}
 * Detail URL: /eng/KAIST-patent-portfolio/view/.../id/{id}
 * Pagination: 10 items/page, ~734 pages (~7,340 patents)
 * Fields: title (linked), category, description
 * No bot protection detected; server-side HTML.
 * Verified 2026-05-22: English content accessible.
 *
 * NOTE: CSS selectors were inferred — run probe() to verify and adjust if
 * item count is 0.
 */

import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText } from "./utils";
import type { CheerioAPI } from "cheerio";

const INST = "KAIST";
const BASE = "https://tlo.kaist.ac.kr";
const MAX_PAGES = 800;
const BATCH = 10;

function listUrl(page: number): string {
  return `${BASE}/eng/KAIST-patent-portfolio/index/search_field//category_depth1//page/${page}`;
}

function parsePage($: CheerioAPI): ScrapedListing[] {
  const results: ScrapedListing[] = [];

  $('a[href*="/KAIST-patent-portfolio/view/"]').each((_, anchor) => {
    const $a = $(anchor);
    const title = cleanText($a.text());
    if (!title || title.length < 4) return;

    const href = $a.attr("href") ?? "";
    const url = href.startsWith("http") ? href : `${BASE}${href}`;

    // Walk up to the card container and grab the first paragraph as description
    const $card = $a.closest("li, tr, article, .item, .patent-item, .portfolio-item, .board-list-item").first();
    const raw = $card.length
      ? $card.find("p, .description, .abstract, .summary").first().text()
      : "";
    const description = cleanText(raw).slice(0, 600);

    results.push({ title, url, description, institution: INST });
  });

  return results;
}

function getTotalPages($: CheerioAPI): number {
  // Pagination links look like /page/734 — find the highest page number
  let max = 1;
  $('a[href*="/page/"]').each((_, el) => {
    const m = ($(el).attr("href") ?? "").match(/\/page\/(\d+)/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  });
  return Math.min(max || 734, MAX_PAGES);
}

export const kaistScraper: InstitutionScraper = {
  institution: INST,

  async probe(maxResults = 3): Promise<ScrapedListing[]> {
    const $ = await fetchHtml(listUrl(1), 20_000);
    if (!$) return [];
    return parsePage($).slice(0, maxResults);
  },

  async scrape(): Promise<ScrapedListing[]> {
    console.log(`[scraper] ${INST}: fetching patent portfolio...`);

    const first$ = await fetchHtml(listUrl(1), 20_000, undefined, 2, true);
    if (!first$) return [];

    const totalPages = getTotalPages(first$);
    const results: ScrapedListing[] = parsePage(first$);

    console.log(`[scraper] ${INST}: ${totalPages} pages (~${totalPages * 10} patents), batching...`);

    for (let page = 2; page <= totalPages; page += BATCH) {
      const batch = Array.from(
        { length: Math.min(BATCH, totalPages - page + 1) },
        (_, i) => page + i
      );
      const pages = await Promise.all(batch.map((p) => fetchHtml(listUrl(p), 15_000)));
      for (const $ of pages) {
        if ($) results.push(...parsePage($));
      }
    }

    console.log(`[scraper] ${INST}: ${results.length} listings`);
    return results;
  },
};
