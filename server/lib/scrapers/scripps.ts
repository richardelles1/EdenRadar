import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText, resolveUrl } from "./utils";

const BASE = "https://www.scripps.edu";
const INST = "Scripps Research";

export const scrippsScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    try {
      const results: ScrapedListing[] = [];
      const seen = new Set<string>();

      const urls = [
        `${BASE}/science-and-medicine/offices-core-facilities-and-services/technology-licensing/available-technologies.html`,
        `${BASE}/science-and-medicine/offices-core-facilities-and-services/technology-licensing/`,
      ];

      for (const url of urls) {
        const $ = await fetchHtml(url);
        if (!$) continue;

        $("article, .views-row, .technology, li, tr").each((_, el) => {
          const titleEl = $(el).find("h2 a, h3 a, .title a, a").first();
          const title = cleanText(titleEl.text());
          if (!title || title.length < 15 || seen.has(title)) return;
          seen.add(title);
          const href = titleEl.attr("href") ?? "";
          results.push({
            title,
            description: cleanText($(el).find("p, .summary, td").first().text()) || title,
            url: href ? resolveUrl(BASE, href) : BASE,
            institution: INST,
          });
        });
      }

      console.log(`[scraper] ${INST}: ${results.length} listings`);
      return results;
    } catch (err: any) {
      console.error(`[scraper] ${INST} failed: ${err?.message}`);
      return [];
    }
  },
};
