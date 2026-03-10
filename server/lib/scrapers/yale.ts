import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText, resolveUrl } from "./utils";

const BASE = "https://ventures.yale.edu";
const INST = "Yale University";

export const yaleScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    try {
      const results: ScrapedListing[] = [];
      const seen = new Set<string>();

      const urls = [
        `${BASE}/yale-technologies`,
        `${BASE}/yale-technologies?page=1`,
        `${BASE}/yale-technologies?page=2`,
      ];

      for (const url of urls) {
        const $ = await fetchHtml(url);
        if (!$) continue;

        $("a[href*='/technologies/']").each((_, el) => {
          const href = $(el).attr("href") ?? "";
          if (!href.includes("/technologies/") || href.includes("technology_type") || href.includes("technology_subtype") || href.includes("tags") || href.includes("fs=")) return;
          const title = cleanText($(el).text());
          if (!title || title.length < 10 || seen.has(title)) return;
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
