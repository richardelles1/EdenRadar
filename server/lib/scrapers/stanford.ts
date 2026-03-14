import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText, resolveUrl, extractText } from "./utils";
import { enrichWithDetailPages } from "./detailFetcher";

const BASE = "https://techfinder.stanford.edu";
const INST = "Stanford University";
const MAX_PAGES = 200;

export const stanfordScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    try {
      const results: ScrapedListing[] = [];
      const seen = new Set<string>();

      for (let page = 0; page < MAX_PAGES; page++) {
        const url = page === 0 ? `${BASE}/technology` : `${BASE}/technology?page=${page}`;
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
        if (page % 20 === 0 && page > 0) {
          console.log(`[scraper] ${INST}: page ${page} — ${results.length} listings so far`);
        }
      }

      console.log(`[scraper] ${INST}: ${results.length} listings, fetching details...`);

      await enrichWithDetailPages(results, {
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
      });

      console.log(`[scraper] ${INST}: ${results.length} listings (detail-enriched)`);
      return results;
    } catch (err: any) {
      console.error(`[scraper] ${INST} failed: ${err?.message}`);
      return [];
    }
  },
};
