import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText, resolveUrl } from "./utils";

const BASE = "https://techventures.columbia.edu";
const INST = "Columbia University";

export const columbiaScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    try {
      const urls = [
        `${BASE}/explore-technologies/`,
        `${BASE}/explore-technologies/?page=2`,
      ];
      const results: ScrapedListing[] = [];
      const seen = new Set<string>();

      for (const url of urls) {
        const $ = await fetchHtml(url);
        if (!$) continue;

        $("article, .views-row, .technology, .tech-card, .post").each((_, el) => {
          const titleEl = $(el).find("h2 a, h3 a, .title a, a.tech-title").first();
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

      console.log(`[scraper] Columbia: ${results.length} listings`);
      return results;
    } catch (err: any) {
      console.error(`[scraper] Columbia failed: ${err?.message}`);
      return [];
    }
  },
};
