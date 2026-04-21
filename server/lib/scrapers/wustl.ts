import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText, SiteHttpError } from "./utils";
import { enrichWithDetailPages } from "./detailFetcher";

const BASE = "https://tech.wustl.edu";
const INST = "Washington University in St. Louis";
const MAX_PAGES = 50;

export const wustlScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    try {
      const results: ScrapedListing[] = [];
      const seen = new Set<string>();

      for (let page = 1; page <= MAX_PAGES; page++) {
        const url = page === 1
          ? `${BASE}/basic-tech-summary-search/`
          : `${BASE}/basic-tech-summary-search/?wpv_view_count=107390&wpv_paged=${page}`;
        const $ = await fetchHtml(url, 15_000, undefined, 2, page === 1);
        if (!$) break;

        let pageNew = 0;
        $("a[href*='/tech-summary/']").each((_, el) => {
          const href = $(el).attr("href") ?? "";
          const fullUrl = href.startsWith("http") ? href : `${BASE}${href}`;
          if (seen.has(fullUrl)) return;
          seen.add(fullUrl);
          const title = cleanText($(el).text());
          if (!title || title.length < 10) return;
          pageNew++;
          results.push({
            title,
            description: title,
            url: fullUrl,
            institution: INST,
          });
        });
        if (pageNew === 0) break;
      }

      console.log(`[scraper] ${INST}: ${results.length} listings, fetching details...`);

      await enrichWithDetailPages(results, {
        description: [
          ".entry-content",
          ".tech-summary-content",
          "article .content p",
          "main p",
        ],
        patentStatus: [
          ".patent-status",
          ".ip-status",
        ],
      });

      console.log(`[scraper] ${INST}: ${results.length} listings (detail-enriched)`);
      return results;
    } catch (err: any) {
      if (err instanceof SiteHttpError) throw err;
      console.error(`[scraper] ${INST} failed: ${err?.message}`);
      return [];
    }
  },
};
