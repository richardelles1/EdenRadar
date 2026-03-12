import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText, resolveUrl } from "./utils";

const BASE = "https://otd.harvard.edu";
const INST = "Harvard University";
const SEARCH_PATH = "/explore-innovation/technologies/results/";
const MAX_PAGES = 50;

export const harvardScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    try {
      const results: ScrapedListing[] = [];
      const seen = new Set<string>();

      for (let page = 1; page <= MAX_PAGES; page++) {
        const url = page === 1
          ? `${BASE}${SEARCH_PATH}?q=`
          : `${BASE}${SEARCH_PATH}p${page}/?q`;
        const $ = await fetchHtml(url, 15_000);
        if (!$) break;

        let pageNew = 0;
        $("a[href]").each((_, el) => {
          const href = $(el).attr("href") ?? "";
          if (!href.includes("/explore-innovation/technologies/") || href.includes("results") || href.includes("?q=")) return;
          const fullUrl = resolveUrl(BASE, href);
          if (seen.has(fullUrl)) return;
          seen.add(fullUrl);
          const title = cleanText($(el).text());
          if (!title || title.length < 15) return;
          pageNew++;
          results.push({
            title,
            description: title,
            url: fullUrl,
            institution: INST,
          });
        });

        if (pageNew === 0) break;
        if (page % 10 === 0) {
          console.log(`[scraper] ${INST}: page ${page} — ${results.length} listings so far`);
        }
      }

      console.log(`[scraper] ${INST}: ${results.length} listings`);
      return results;
    } catch (err: any) {
      console.error(`[scraper] ${INST} failed: ${err?.message}`);
      return [];
    }
  },
};
