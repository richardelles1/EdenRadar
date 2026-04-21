import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText, resolveUrl, SiteHttpError } from "./utils";
import { enrichWithDetailPages } from "./detailFetcher";

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
        const $ = await fetchHtml(url, 15_000, undefined, 2, page === 1);
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

      console.log(`[scraper] ${INST}: ${results.length} listings, fetching details...`);

      await enrichWithDetailPages(results, {
        description: [
          ".field--name-body",
          ".technology-description",
          ".content-area p",
          "article p",
          "main p",
        ],
        inventors: [
          ".field--name-field-inventors li",
          ".inventor-list li",
        ],
        patentStatus: [
          ".field--name-field-patent-status",
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
