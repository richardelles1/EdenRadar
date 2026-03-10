import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText, resolveUrl } from "./utils";

const BASE = "https://tlo.mit.edu";
const INST = "MIT";

export const mitScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    try {
      const urls = [
        `${BASE}/industry-entrepreneurs/available-technologies`,
        `${BASE}/industry-entrepreneurs/available-technologies?page=1`,
        `${BASE}/industry-entrepreneurs/available-technologies?page=2`,
        `${BASE}/industry-entrepreneurs/available-technologies?page=3`,
      ];
      const results: ScrapedListing[] = [];
      const seen = new Set<string>();

      for (const url of urls) {
        const $ = await fetchHtml(url);
        if (!$) continue;

        $(".views-row").each((_, el) => {
          const linkEl = $(el).find("a.tech-brief-teaser__link, .tech-brief-teaser__heading a, h3 a, h2 a").first();
          const title = cleanText(linkEl.text());
          if (!title || seen.has(title)) return;
          seen.add(title);
          const href = linkEl.attr("href") ?? "";
          results.push({
            title,
            description: cleanText($(el).find(".tech-brief-teaser__description, p").first().text()) || title,
            url: href ? resolveUrl(BASE, href) : BASE,
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
