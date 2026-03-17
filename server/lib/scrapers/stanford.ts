import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText, resolveUrl } from "./utils";
import { enrichWithDetailPages } from "./detailFetcher";

const BASE = "https://techfinder.stanford.edu";
const INST = "Stanford University";
// /technology redirects to / — pagination is served from /?page=N (Drupal views).
// 900 listings / 15 per page ≈ 60 pages needed; 70 gives headroom without risking timeout.
const MAX_PAGES = 70;

export const stanfordScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    try {
      const results: ScrapedListing[] = [];
      const seen = new Set<string>();

      for (let page = 0; page < MAX_PAGES; page++) {
        // Use / directly (not /technology which 301-redirects) so each fetch is one hop.
        const url = page === 0 ? `${BASE}/` : `${BASE}/?page=${page}`;
        const $ = await fetchHtml(url, 15_000);
        if (!$) break;

        let pageCount = 0;
        $("a[href]").each((_, el) => {
          const href = $(el).attr("href") ?? "";
          if (!href.startsWith("/technology/")) return;
          const title = cleanText($(el).text());
          if (!title || title.length < 10 || seen.has(title)) return;
          seen.add(title);
          pageCount++;
          results.push({
            title,
            description: title,
            url: resolveUrl(BASE, href),
            institution: INST,
          });
        });
        if (pageCount === 0) break;
        if (page % 10 === 0 && page > 0) {
          console.log(`[scraper] ${INST}: page ${page} — ${results.length} listings so far`);
        }
      }

      console.log(`[scraper] ${INST}: ${results.length} listings, fetching details...`);

      // Cap at 50 detail pages to stay comfortably within the 5-minute scraper timeout.
      await enrichWithDetailPages(
        results,
        {
          description: [
            ".field--name-body .field__item",
            ".field--name-field-brief-description",
            ".node__content p",
            "article .content p",
          ],
          abstract: [
            ".field--name-field-abstract",
            ".field--name-field-description",
          ],
          inventors: [
            ".field--name-field-inventors .field__item",
            ".field--name-field-inventor li",
          ],
          patentStatus: [
            ".field--name-field-patent-status .field__item",
            ".field--name-field-ip-status .field__item",
          ],
        },
        50
      );

      console.log(`[scraper] ${INST}: ${results.length} listings (detail-enriched)`);
      return results;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[scraper] ${INST} failed: ${msg}`);
      return [];
    }
  },
};
