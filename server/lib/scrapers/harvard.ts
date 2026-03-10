import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText, resolveUrl } from "./utils";

const BASE = "https://otd.harvard.edu";
const INST = "Harvard University";

export const harvardScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    try {
      const urls = [
        `${BASE}/explore-innovations/technologies/`,
        `${BASE}/explore-innovations/technologies/?page=2`,
      ];
      const results: ScrapedListing[] = [];
      const seen = new Set<string>();

      for (const url of urls) {
        const $ = await fetchHtml(url);
        if (!$) continue;

        $(".technology-card, article, .views-row, .technology-listing, .node--type-technology").each((_, el) => {
          const titleEl = $(el).find("h2 a, h3 a, .technology-title a, a.card-title").first();
          const title = cleanText(titleEl.text());
          if (!title || seen.has(title)) return;
          seen.add(title);
          const href = titleEl.attr("href") ?? "";
          results.push({
            title,
            description: cleanText($(el).find("p, .summary, .teaser, .body").first().text()) || title,
            url: href ? resolveUrl(BASE, href) : BASE,
            institution: INST,
          });
        });
      }

      console.log(`[scraper] Harvard: ${results.length} listings`);
      return results;
    } catch (err: any) {
      console.error(`[scraper] Harvard failed: ${err?.message}`);
      return [];
    }
  },
};
