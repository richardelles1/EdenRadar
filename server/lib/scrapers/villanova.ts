import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText } from "./utils";

const INST = "Villanova University";
const BASE = "https://www.villanova.edu";
const LIST_URL = `${BASE}/university/research-scholarship/innovation-technology/available-inventions.html`;

export const villanovaScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    console.log(`[scraper] ${INST}: fetching listing page...`);
    const $ = await fetchHtml(LIST_URL, 15_000, undefined, 2, true);
    if (!$) {
      console.error(`[scraper] ${INST}: failed to fetch listing page`);
      return [];
    }

    const results: ScrapedListing[] = [];
    const seen = new Set<string>();

    // Each entry: bare <strong>Title</strong> sibling, then <p><a href="...pdf">IP Summary</a></p>
    // Investigators are <p><strong>...<br>...</strong></p> — inside a <p>, so prevAll("strong") skips them
    $(`a[href*="/available-inventions/"][href$=".pdf"]`).each((_, el) => {
      const href = $(el).attr("href") ?? "";
      if (!href) return;
      const fullUrl = href.startsWith("http") ? href : `${BASE}${href}`;
      if (seen.has(fullUrl)) return;
      seen.add(fullUrl);

      // Walk back through siblings of the containing <p> to find the nearest bare <strong>
      const title = cleanText($(el).closest("p").prevAll("strong").first().text());
      if (!title || title.length < 10) return;

      results.push({ title, description: "", url: fullUrl, institution: INST });
    });

    console.log(`[scraper] ${INST}: ${results.length} listings scraped`);
    return results;
  },
};
