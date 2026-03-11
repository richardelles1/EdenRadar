import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText, resolveUrl } from "./utils";

const BASE = "https://www.enterprise.cam.ac.uk";
const INST = "University of Cambridge";

export const cambridgeScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    try {
      const results: ScrapedListing[] = [];
      const seen = new Set<string>();

      const $ = await fetchHtml(`${BASE}/opportunities/`);
      if (!$) {
        console.log(`[scraper] ${INST}: failed to load opportunities page`);
        return [];
      }

      $('a[href*="/opportunities/"]').each((_, el) => {
        const href = $(el).attr("href") ?? "";
        if (!href.includes("/opportunities/") || href.endsWith("/opportunities/")) return;
        const fullUrl = href.startsWith("http") ? href : resolveUrl(BASE, href);
        if (seen.has(fullUrl)) return;
        seen.add(fullUrl);

        const title = cleanText($(el).text());
        if (!title || title.length < 5) return;

        const desc = cleanText($(el).closest("div, article, li").find("p").first().text()) || "";
        results.push({ title, description: desc, url: fullUrl, institution: INST });
      });

      console.log(`[scraper] ${INST}: ${results.length} listings via Cambridge Enterprise`);
      return results;
    } catch (err: any) {
      console.error(`[scraper] ${INST} failed: ${err?.message}`);
      return [];
    }
  },
};
