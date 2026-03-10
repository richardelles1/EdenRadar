import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText, resolveUrl } from "./utils";

const BASE = "https://otd.harvard.edu";
const INST = "Harvard University";

export const harvardScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    try {
      const results: ScrapedListing[] = [];
      const seen = new Set<string>();

      const urls = [
        `${BASE}/explore-innovation/technologies/results/?q=`,
        `${BASE}/industry-investors/emerging-technologies/`,
      ];

      for (const url of urls) {
        const $ = await fetchHtml(url);
        if (!$) continue;

        $("a[href]").each((_, el) => {
          const href = $(el).attr("href") ?? "";
          if (!href.includes("/explore-innovation/technologies/") || href.includes("results") || href.includes("?q=")) return;
          const title = cleanText($(el).text());
          if (!title || title.length < 15 || seen.has(title)) return;
          seen.add(title);
          results.push({
            title,
            description: title,
            url: resolveUrl(BASE, href),
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
