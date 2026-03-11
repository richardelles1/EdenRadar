import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText } from "./utils";

const INST = "University of Colorado";
const BASE = "https://www.colorado.edu";
const LIST_URL = `${BASE}/venturepartners/technology-portfolio`;

export const ucoloradoScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    console.log(`[scraper] ${INST}: fetching technology portfolio...`);
    try {
      const results: ScrapedListing[] = [];
      const seen = new Set<string>();

      const $ = await fetchHtml(LIST_URL);
      if (!$) throw new Error("failed to fetch listing page");

      $("a[href]").each((_, el) => {
        const href = $(el).attr("href") ?? "";
        if (!href.includes("/venturepartners/technology") || href === LIST_URL) return;
        const url = href.startsWith("http") ? href : `${BASE}${href}`;
        if (seen.has(url)) return;
        seen.add(url);
        const title = cleanText($(el).text()) || cleanText($(el).attr("title") ?? "");
        if (!title || title.length < 5) return;
        results.push({ title, description: "", url, institution: INST });
      });

      console.log(`[scraper] ${INST}: scraped ${results.length} listings`);
      return results;
    } catch (err: any) {
      console.error(`[scraper] ${INST} failed: ${err?.message}`);
      return [];
    }
  },
};
