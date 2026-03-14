import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText, resolveUrl } from "./utils";

const INST = "Mayo Clinic";

export const mayoScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    try {
      const urls = [
        "https://ventures.mayoclinic.org/technologies/",
        "https://ventures.mayoclinic.org/available-technologies/",
        "https://ventures.mayoclinic.org/",
      ];

      for (const url of urls) {
        const $ = await fetchHtml(url, 15_000);
        if (!$) continue;

        const results: ScrapedListing[] = [];
        const seen = new Set<string>();

        $("a[href*='/technolog'], a[href*='/invention'], a[href*='/available']").each((_, el) => {
          const href = $(el).attr("href") ?? "";
          if (href.endsWith("/technologies/") || href.endsWith("/available-technologies/")) return;
          const title = cleanText($(el).text());
          if (!title || title.length < 10 || seen.has(title)) return;
          seen.add(title);
          results.push({
            title,
            description: "",
            url: href.startsWith("http") ? href : resolveUrl("https://ventures.mayoclinic.org", href),
            institution: INST,
          });
        });

        if (results.length > 0) {
          console.log(`[scraper] ${INST}: ${results.length} listings`);
          return results;
        }
      }

      console.log(`[scraper] ${INST}: 0 results (ventures.mayoclinic.org unreachable or empty)`);
      return [];
    } catch (err: any) {
      console.error(`[scraper] ${INST} failed: ${err?.message}`);
      return [];
    }
  },
};
