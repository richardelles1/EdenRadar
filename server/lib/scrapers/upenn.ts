import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText, resolveUrl } from "./utils";

const BASE = "https://pci.upenn.edu";
const INST = "University of Pennsylvania";

export const upennScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    try {
      const results: ScrapedListing[] = [];
      const seen = new Set<string>();

      const $ = await fetchHtml(`${BASE}/`);
      if (!$) {
        console.log(`[scraper] ${INST}: 0 listings (unreachable)`);
        return [];
      }

      $("article, .views-row, .technology, .tech-item, .post").each((_, el) => {
        const titleEl = $(el).find("h2 a, h3 a, .title a, .entry-title a").first();
        const title = cleanText(titleEl.text());
        if (!title || title.length < 10 || seen.has(title)) return;
        seen.add(title);
        const href = titleEl.attr("href") ?? "";
        results.push({
          title,
          description: cleanText($(el).find("p, .summary, .excerpt").first().text()) || title,
          url: href ? resolveUrl(BASE, href) : BASE,
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
