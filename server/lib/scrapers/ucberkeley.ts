import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText, resolveUrl } from "./utils";

const BASE = "https://ipira.berkeley.edu";
const INST = "UC Berkeley";

export const ucBerkeleyScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    try {
      const urls = [
        `${BASE}/technologies-available-licensing`,
        `${BASE}/technologies-available-licensing?page=1`,
      ];
      const results: ScrapedListing[] = [];
      const seen = new Set<string>();

      for (const url of urls) {
        const $ = await fetchHtml(url);
        if (!$) continue;

        $("article, .views-row, .technology, .listing-item, li.tech-listing").each((_, el) => {
          const titleEl = $(el).find("h2 a, h3 a, .title a, a").first();
          const title = cleanText(titleEl.text());
          if (!title || title.length < 8 || seen.has(title)) return;
          seen.add(title);
          const href = titleEl.attr("href") ?? "";
          results.push({
            title,
            description: cleanText($(el).find("p, .summary").first().text()) || title,
            url: href ? resolveUrl(BASE, href) : BASE,
            institution: INST,
          });
        });
      }

      console.log(`[scraper] UC Berkeley: ${results.length} listings`);
      return results;
    } catch (err: any) {
      console.error(`[scraper] UC Berkeley failed: ${err?.message}`);
      return [];
    }
  },
};
