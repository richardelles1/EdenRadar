import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText, resolveUrl } from "./utils";

const BASE = "https://ott.emory.edu";
const INST = "Emory University";

export const emoryScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    try {
      const results: ScrapedListing[] = [];
      const seen = new Set<string>();

      const $ = await fetchHtml(`${BASE}/industry/listings.html`);
      if (!$) {
        console.log(`[scraper] ${INST}: 0 listings (unreachable)`);
        return [];
      }

      $("tr, .listing-item, article, li").each((_, el) => {
        const titleEl = $(el).find("a").first();
        const title = cleanText(titleEl.text());
        if (!title || title.length < 15 || seen.has(title)) return;
        if (/(menu|nav|contact|about|home|back|next|prev|login)/i.test(title)) return;
        seen.add(title);
        const href = titleEl.attr("href") ?? "";
        results.push({
          title,
          description: cleanText($(el).find("td:nth-child(2), .description, p").first().text()) || title,
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
