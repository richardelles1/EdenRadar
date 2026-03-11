import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText } from "./utils";

const INST = "University of Washington";

export const uwashingtonScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    try {
      const sitemapUrl = "https://comotion.uw.edu/startups-sitemap.xml";
      const $ = await fetchHtml(sitemapUrl);
      if (!$) {
        console.log(`[scraper] ${INST}: could not fetch startups sitemap`);
        return [];
      }

      const urls: string[] = [];
      $("url loc").each((_, el) => {
        const loc = $(el).text().trim();
        if (loc.includes("/startups/") && !loc.endsWith("/startups/")) {
          urls.push(loc);
        }
      });

      if (urls.length === 0) {
        console.log(`[scraper] ${INST}: no startup URLs found in sitemap`);
        return [];
      }

      const results: ScrapedListing[] = urls.map((url) => {
        const slug = url.replace(/\/$/, "").split("/").pop() ?? "";
        const title = slug
          .split("-")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ");
        return { title, description: "", url, institution: INST };
      });

      console.log(`[scraper] ${INST}: ${results.length} startups via CoMotion sitemap`);
      return results;
    } catch (err: any) {
      console.error(`[scraper] ${INST} failed: ${err?.message}`);
      return [];
    }
  },
};
