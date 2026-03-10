import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText } from "./utils";

const BASE = "https://jhu.technologypublisher.com";
const INST = "Johns Hopkins University";

export const jhuScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    try {
      const results: ScrapedListing[] = [];
      const seen = new Set<string>();

      for (let pg = 0; pg <= 220; pg++) {
        const url = `${BASE}/SearchResults.aspx?type=Tech&q=&pg=${pg}`;
        const $ = await fetchHtml(url);
        if (!$) break;

        let pageCount = 0;
        $("h2 a[href*='/technology/']").each((_, el) => {
          const href = $(el).attr("href") ?? "";
          const title = cleanText($(el).text());
          if (!title || title.length < 10 || seen.has(title)) return;
          seen.add(title);
          pageCount++;
          results.push({
            title,
            description: title,
            url: href.startsWith("http") ? href : `${BASE}${href}`,
            institution: INST,
          });
        });

        if (pageCount === 0) break;
      }

      console.log(`[scraper] ${INST}: ${results.length} listings`);
      return results;
    } catch (err: any) {
      console.error(`[scraper] ${INST} failed: ${err?.message}`);
      return [];
    }
  },
};
