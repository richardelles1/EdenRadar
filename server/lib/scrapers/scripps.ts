import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText, resolveUrl } from "./utils";

const BASE = "https://www.scripps.edu";
const INST = "Scripps Research";

export const scrippsScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    try {
      const urls = [
        `${BASE}/science-and-medicine/ttvd/`,
        `${BASE}/science-and-medicine/ttvd/available-technologies/`,
      ];
      const results: ScrapedListing[] = [];
      const seen = new Set<string>();

      for (const url of urls) {
        const $ = await fetchHtml(url);
        if (!$) continue;

        $("article, .views-row, .technology, .listing, .post").each((_, el) => {
          const titleEl = $(el).find("h2 a, h3 a, h4 a, .title a").first();
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

      console.log(`[scraper] Scripps: ${results.length} listings`);
      return results;
    } catch (err: any) {
      console.error(`[scraper] Scripps failed: ${err?.message}`);
      return [];
    }
  },
};
