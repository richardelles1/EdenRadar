import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText } from "./utils";

const INST = "Florida State University";
const BASE = "https://www.research.fsu.edu";
const CATEGORIES = ["healthcare", "life-science", "biomedical", "chemistry", "agricultural"];

function slugToTitle(slug: string): string {
  return slug
    .replace(/\/$/, "")
    .replace(/-+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

export const fsuScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    console.log(`[scraper] ${INST}: fetching technology listings...`);
    const seen = new Set<string>();
    const results: ScrapedListing[] = [];

    const urlsToTry = [
      `${BASE}/research-offices/oc/technologies/`,
      ...CATEGORIES.map((c) => `${BASE}/research-offices/oc/technologies/?category=${c}`),
    ];

    for (const url of urlsToTry) {
      try {
        const $ = await fetchHtml(url);
        if (!$) continue;

        $("a[href]").each((_, el) => {
          const href = $(el).attr("href") ?? "";
          if (!href.includes("/research-offices/oc/technologies/") || href.endsWith("/technologies/")) return;
          const fullUrl = href.startsWith("http") ? href : `${BASE}${href}`;
          if (seen.has(fullUrl)) return;
          seen.add(fullUrl);

          const slug = href.split("/technologies/").pop() ?? "";
          const titleFromLink = cleanText($(el).text());
          const title = (titleFromLink && titleFromLink.length > 5)
            ? titleFromLink
            : slugToTitle(slug);

          if (!title || title.length < 5) return;
          results.push({ title, description: "", url: fullUrl, institution: INST });
        });
      } catch {
        continue;
      }
    }

    console.log(`[scraper] ${INST}: scraped ${results.length} listings`);
    return results;
  },
};
