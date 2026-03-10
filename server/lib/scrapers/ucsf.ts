import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText, resolveUrl } from "./utils";

const BASE = "https://inno.ucsf.edu";
const INST = "University of California San Francisco";

export const ucsfScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    try {
      const urls = [
        `${BASE}/technologies`,
        `${BASE}/technologies?page=1`,
      ];
      const results: ScrapedListing[] = [];
      const seen = new Set<string>();

      for (const url of urls) {
        const $ = await fetchHtml(url);
        if (!$) continue;

        $("article, .views-row, .technology-item, .tech-card").each((_, el) => {
          const titleEl = $(el).find("h2 a, h3 a, .title a, a.tech-title").first();
          const title = cleanText(titleEl.text());
          if (!title || seen.has(title)) return;
          seen.add(title);
          const href = titleEl.attr("href") ?? "";
          results.push({
            title,
            description: cleanText($(el).find("p, .summary, .body").first().text()) || title,
            url: href ? resolveUrl(BASE, href) : BASE,
            institution: INST,
          });
        });
      }

      console.log(`[scraper] UCSF: ${results.length} listings`);
      return results;
    } catch (err: any) {
      console.error(`[scraper] UCSF failed: ${err?.message}`);
      return [];
    }
  },
};
