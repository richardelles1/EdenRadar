import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText, resolveUrl } from "./utils";

const BASE = "https://tlo.mit.edu";
const INST = "MIT";

export const mitScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    try {
      const urls = [
        `${BASE}/industry-entrepreneurs/available-technologies`,
        `${BASE}/industry-entrepreneurs/available-technologies?page=1`,
        `${BASE}/industry-entrepreneurs/available-technologies?page=2`,
      ];
      const results: ScrapedListing[] = [];
      const seen = new Set<string>();

      for (const url of urls) {
        const $ = await fetchHtml(url);
        if (!$) continue;

        $("article, .views-row, .technology-item, li.tech, .node--type-technology").each((_, el) => {
          const titleEl = $(el).find("h2 a, h3 a, .field--name-title a, a.technology-link").first();
          const title = cleanText(titleEl.text());
          if (!title || seen.has(title)) return;
          seen.add(title);
          const href = titleEl.attr("href") ?? "";
          const listing: ScrapedListing = {
            title,
            description: cleanText($(el).find("p, .field--name-body, .summary").first().text()) || title,
            url: href ? resolveUrl(BASE, href) : BASE,
            institution: INST,
          };
          results.push(listing);
        });
      }

      console.log(`[scraper] MIT: ${results.length} listings`);
      return results;
    } catch (err: any) {
      console.error(`[scraper] MIT failed: ${err?.message}`);
      return [];
    }
  },
};
