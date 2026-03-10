import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText, resolveUrl } from "./utils";

const BASE = "https://comotion.uw.edu";
const INST = "University of Washington";

export const uwashingtonScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    try {
      const urls = [
        `${BASE}/what-we-do/license/available-technologies/`,
        `${BASE}/what-we-do/license/available-technologies/?page=2`,
      ];
      const results: ScrapedListing[] = [];
      const seen = new Set<string>();

      for (const url of urls) {
        const $ = await fetchHtml(url);
        if (!$) continue;

        $("article, .views-row, .technology, .tech-item, .post").each((_, el) => {
          const titleEl = $(el).find("h2 a, h3 a, .title a, .entry-title a").first();
          const title = cleanText(titleEl.text());
          if (!title || seen.has(title)) return;
          seen.add(title);
          const href = titleEl.attr("href") ?? "";
          results.push({
            title,
            description: cleanText($(el).find("p, .summary, .excerpt").first().text()) || title,
            url: href ? resolveUrl(BASE, href) : BASE,
            institution: INST,
          });
        });
      }

      console.log(`[scraper] UWashington: ${results.length} listings`);
      return results;
    } catch (err: any) {
      console.error(`[scraper] UWashington failed: ${err?.message}`);
      return [];
    }
  },
};
