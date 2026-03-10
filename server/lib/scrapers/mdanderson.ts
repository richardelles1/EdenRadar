import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText, resolveUrl } from "./utils";

const BASE = "https://www.mdanderson.org";
const LISTING_URL = `${BASE}/research/departments-labs-institutes/programs-centers/technology-commercialization/available-technologies.html`;
const INST = "MD Anderson Cancer Center";

export const mdandersonScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    try {
      const $ = await fetchHtml(LISTING_URL);
      if (!$) return [];
      const results: ScrapedListing[] = [];
      const seen = new Set<string>();

      $("article, .technology-listing, .listing-item, li.technology, .views-row").each((_, el) => {
        const titleEl = $(el).find("h2 a, h3 a, h4 a, .title a, a").first();
        const title = cleanText(titleEl.text());
        if (!title || title.length < 8 || seen.has(title)) return;
        seen.add(title);
        const href = titleEl.attr("href") ?? "";
        results.push({
          title,
          description: cleanText($(el).find("p, .summary").first().text()) || title,
          url: href ? resolveUrl(BASE, href) : LISTING_URL,
          institution: INST,
        });
      });

      if (results.length === 0) {
        $("a[href*='technology'], a[href*='commercialization']").each((_, el) => {
          const title = cleanText($(el).text());
          if (!title || title.length < 10 || seen.has(title)) return;
          seen.add(title);
          const href = $(el).attr("href") ?? "";
          results.push({ title, description: title, url: resolveUrl(BASE, href), institution: INST });
        });
      }

      console.log(`[scraper] MD Anderson: ${results.length} listings`);
      return results;
    } catch (err: any) {
      console.error(`[scraper] MD Anderson failed: ${err?.message}`);
      return [];
    }
  },
};
