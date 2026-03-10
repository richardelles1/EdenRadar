import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText, resolveUrl } from "./utils";

const BASE = "https://techfinder.stanford.edu";
const INST = "Stanford University";

async function scrapePage(url: string): Promise<ScrapedListing[]> {
  const $ = await fetchHtml(url);
  if (!$) return [];
  const results: ScrapedListing[] = [];

  $(".technology-listing, .views-row, article.technology, .tech-item, .result-item").each((_, el) => {
    const titleEl = $(el).find("h2 a, h3 a, .technology-title a, .views-field-title a").first();
    const title = cleanText(titleEl.text());
    if (!title) return;
    const href = titleEl.attr("href") ?? "";
    const url = href ? resolveUrl(BASE, href) : BASE;
    const desc = cleanText($(el).find("p, .views-field-body, .field-content").first().text());
    results.push({ title, description: desc || title, url, institution: INST });
  });

  if (results.length === 0) {
    $("h2 a[href], h3 a[href]").each((_, el) => {
      const title = cleanText($(el).text());
      if (!title || title.length < 10) return;
      const href = $(el).attr("href") ?? "";
      results.push({ title, description: title, url: resolveUrl(BASE, href), institution: INST });
    });
  }

  return results;
}

export const stanfordScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    try {
      const pages = [
        `${BASE}/technologies?field_stage_value=All&field_category_value=All&search_api_fulltext=biotech`,
        `${BASE}/technologies?field_category_value=All&search_api_fulltext=therapeutic`,
        `${BASE}/technologies?search_api_fulltext=drug`,
      ];
      const allResults: ScrapedListing[] = [];
      const seen = new Set<string>();
      for (const page of pages) {
        const listings = await scrapePage(page);
        for (const l of listings) {
          if (!seen.has(l.title)) {
            seen.add(l.title);
            allResults.push(l);
          }
        }
      }
      console.log(`[scraper] Stanford: ${allResults.length} listings`);
      return allResults;
    } catch (err: any) {
      console.error(`[scraper] Stanford failed: ${err?.message}`);
      return [];
    }
  },
};
