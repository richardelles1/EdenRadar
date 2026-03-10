import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText } from "./utils";

const BASE = "https://tech.wustl.edu";
const INST = "Washington University in St. Louis";

export const wustlScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    try {
      const results: ScrapedListing[] = [];
      const seen = new Set<string>();

      const $ = await fetchHtml(`${BASE}/basic-tech-summary-search/`);
      if (!$) {
        console.log(`[scraper] ${INST}: no response`);
        return [];
      }

      $("a[href*='/tech-summary/']").each((_, el) => {
        const href = $(el).attr("href") ?? "";
        const title = cleanText($(el).text());
        if (!title || title.length < 10 || seen.has(title)) return;
        seen.add(title);
        results.push({
          title,
          description: title,
          url: href.startsWith("http") ? href : `${BASE}${href}`,
          institution: INST,
        });
      });

      console.log(`[scraper] ${INST}: ${results.length} listings`);
      return results;
    } catch (err: any) {
      console.error(`[scraper] ${INST} failed: ${err?.message}`);
      return [];
    }
  },
};
