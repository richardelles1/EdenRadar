import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText, resolveUrl } from "./utils";

const BASE = "https://www.bu.edu";
const INST = "Boston University";

export const buScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    try {
      const results: ScrapedListing[] = [];
      const seen = new Set<string>();

      const urls = [
        `${BASE}/otd/available-technologies/`,
        `${BASE}/research/collaboration-partnership/otd/technology/`,
      ];

      for (const url of urls) {
        const $ = await fetchHtml(url);
        if (!$) continue;

        $("article, .views-row, .technology, .tech-item, li.result, .post").each((_, el) => {
          const titleEl = $(el).find("h2 a, h3 a, h4 a, .title a, .entry-title a").first();
          const title = cleanText(titleEl.text());
          if (!title || title.length < 15 || seen.has(title)) return;
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

      console.log(`[scraper] ${INST}: ${results.length} listings`);
      return results;
    } catch (err: any) {
      console.error(`[scraper] ${INST} failed: ${err?.message}`);
      return [];
    }
  },
};
