import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText, resolveUrl } from "./utils";
import { enrichWithDetailPages } from "./detailFetcher";

const BASE = "https://tlo.mit.edu";
const INST = "MIT";
const LIST_PATH = "/industry-entrepreneurs/available-technologies";
const LIST_FILTER = "search_api_fulltext=&license_status%5BU%5D=U";
const MAX_PAGES = 200;

export const mitScraper: InstitutionScraper = {
  institution: INST,
  async scrape(signal?: AbortSignal): Promise<ScrapedListing[]> {
    try {
      const results: ScrapedListing[] = [];
      const seen = new Set<string>();

      for (let page = 0; page < MAX_PAGES; page++) {
        if (signal?.aborted) break;
        const url = page === 0
          ? `${BASE}${LIST_PATH}?${LIST_FILTER}`
          : `${BASE}${LIST_PATH}?${LIST_FILTER}&page=${page}`;
        const $ = await fetchHtml(url, 15_000, signal);
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
          ".tech-brief-body__inner",
          ".paragraphs-body",
          ".field--name-body .field__item",
          ".node__content p",
        ],
        abstract: [
          ".tech-brief-header__details",
          ".field--name-field-abstract",
        ],
        inventors: [
          ".tech-brief-details__researchers-list a",
          ".tech-brief-details__researchers-list span",
          ".field--name-field-inventors li",
        ],
        patentStatus: [
          ".tech-brief-details__ip .accordion__content",
          ".field--name-field-patent-status",
        ],
      }, 100, signal);

      console.log(`[scraper] ${INST}: ${results.length} listings (detail-enriched)`);
      return results;
    } catch (err: any) {
      console.error(`[scraper] ${INST} failed: ${err?.message}`);
      return [];
    }
  },
};
