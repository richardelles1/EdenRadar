import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText, resolveUrl } from "./utils";

const BASE = "https://otm.illinois.edu";
const INST = "University of Illinois";

export const uillinoisScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    try {
      const results: ScrapedListing[] = [];
      const seen = new Set<string>();

      const $ = await fetchHtml(`${BASE}/browse-technologies-startups/technologies`);
      if (!$) {
        console.log(`[scraper] ${INST}: failed to load technologies page`);
        return [];
      }

      $('a[href*="/browse-technologies-startups/technologies/"]').each((_, el) => {
        const href = $(el).attr("href") ?? "";
        if (!href.match(/\/technologies\/\d+/)) return;
        const fullUrl = href.startsWith("http") ? href : resolveUrl(BASE, href);
        if (seen.has(fullUrl)) return;
        seen.add(fullUrl);

        const title = cleanText($(el).text());
        if (!title || title.length < 5) return;

        results.push({ title, description: "", url: fullUrl, institution: INST });
      });

      console.log(`[scraper] ${INST}: ${results.length} listings via OTM`);
      return results;
    } catch (err: any) {
      console.error(`[scraper] ${INST} failed: ${err?.message}`);
      return [];
    }
  },
};
