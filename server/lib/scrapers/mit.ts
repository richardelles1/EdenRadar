import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText, resolveUrl } from "./utils";
import { enrichWithDetailPages } from "./detailFetcher";

const BASE = "https://tlo.mit.edu";
const INST = "MIT";
const LIST_PATH = "/industry-entrepreneurs/available-technologies";
const MAX_PAGES = 200;

export const mitScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    try {
      const results: ScrapedListing[] = [];
      const seen = new Set<string>();

      for (let page = 0; page < MAX_PAGES; page++) {
        const url = page === 0 ? `${BASE}${LIST_PATH}` : `${BASE}${LIST_PATH}?page=${page}`;
        const $ = await fetchHtml(url, 15_000);
        if (!$) break;

        let pageCount = 0;
        $(".views-row").each((_, el) => {
          const linkEl = $(el).find("a.tech-brief-teaser__link, .tech-brief-teaser__heading a, h3 a, h2 a").first();
          const title = cleanText(linkEl.text());
          if (!title || seen.has(title)) return;
          seen.add(title);
          pageCount++;
          const href = linkEl.attr("href") ?? "";
          results.push({
            title,
            description: cleanText($(el).find(".tech-brief-teaser__description, p").first().text()) || title,
            url: href ? resolveUrl(BASE, href) : BASE,
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
          ".tech-brief__body",
          ".field--name-body .field__item",
          ".node__content p",
          "article .content p",
        ],
        abstract: [
          ".tech-brief__abstract",
          ".field--name-field-abstract",
        ],
        inventors: [
          ".tech-brief__inventors li",
          ".field--name-field-inventors li",
        ],
        patentStatus: [
          ".tech-brief__patent-status",
          ".field--name-field-patent-status",
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
