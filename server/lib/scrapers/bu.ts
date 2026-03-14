import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText, resolveUrl } from "./utils";

const BASE = "https://www.bu.edu";
const DB_PATH = "/research/collaboration-partnership/otd/technologies-database/";
const INST = "Boston University";

export const buScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    try {
      const $ = await fetchHtml(`${BASE}${DB_PATH}`, 15_000);
      if (!$) {
        console.log(`[scraper] ${INST}: technologies-database page unreachable`);
        return [];
      }

      const results: ScrapedListing[] = [];
      const seen = new Set<string>();

      $("a[href]").each((_, el) => {
        const href = $(el).attr("href") ?? "";
        if (
          !href.includes("/technolog") &&
          !href.includes("/invention") &&
          !href.includes("/available")
        )
          return;
        if (href === DB_PATH || href.endsWith("/technologies-database/")) return;
        const title = cleanText($(el).text());
        if (!title || title.length < 10 || seen.has(title)) return;
        seen.add(title);
        results.push({
          title,
          description: "",
          url: href.startsWith("http") ? href : resolveUrl(BASE, href),
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
