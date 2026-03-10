import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText, resolveUrl } from "./utils";

const BASE = "https://research.utexas.edu";
const INST = "University of Texas";

export const utexasScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    try {
      const results: ScrapedListing[] = [];
      const seen = new Set<string>();

      const urls = [
        `${BASE}/ott/`,
        `${BASE}/ott/technologies/`,
        "https://uttech.utexas.edu/available-technologies/",
      ];

      for (const url of urls) {
        const $ = await fetchHtml(url);
        if (!$) continue;

        $("article, .views-row, .technology, .tech-item, li.result").each((_, el) => {
          const titleEl = $(el).find("h2 a, h3 a, .title a").first();
          const title = cleanText(titleEl.text());
          if (!title || title.length < 10 || seen.has(title)) return;
          seen.add(title);
          const href = titleEl.attr("href") ?? "";
          const base = new URL(url).origin;
          results.push({
            title,
            description: cleanText($(el).find("p, .summary").first().text()) || title,
            url: href ? resolveUrl(base, href) : base,
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
