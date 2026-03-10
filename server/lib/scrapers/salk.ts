import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText, resolveUrl } from "./utils";

const BASE = "https://www.salk.edu";
const INST = "Salk Institute for Biological Studies";

export const salkScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    try {
      const urls = [
        `${BASE}/partnerships-commercialization/`,
        `${BASE}/partnerships-commercialization/available-technologies/`,
      ];
      const results: ScrapedListing[] = [];
      const seen = new Set<string>();

      for (const url of urls) {
        const $ = await fetchHtml(url);
        if (!$) continue;

        $("article, .views-row, .technology, .listing, .tech-item").each((_, el) => {
          const titleEl = $(el).find("h2 a, h3 a, h4 a, .title a").first();
          const title = cleanText(titleEl.text());
          if (!title || seen.has(title)) return;
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

      console.log(`[scraper] Salk: ${results.length} listings`);
      return results;
    } catch (err: any) {
      console.error(`[scraper] Salk failed: ${err?.message}`);
      return [];
    }
  },
};
