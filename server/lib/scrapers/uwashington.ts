import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText } from "./utils";

const INST = "University of Washington";

export const uwashingtonScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    try {
      const results: ScrapedListing[] = [];
      const seen = new Set<string>();

      const techRes = await fetch("https://techtransfer.washington.edu/available-technologies/", {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; EdenRadar/2.0)" },
        signal: AbortSignal.timeout(15_000),
        redirect: "follow",
      }).catch(() => null);

      if (techRes && techRes.ok) {
        const html = await techRes.text();
        const cheerio = await import("cheerio");
        const $ = cheerio.load(html);
        $("a[href*='/technologies/'], a[href*='/available-technologies/']").each((_, el) => {
          const href = $(el).attr("href") ?? "";
          if (href.includes("available-technologies") && !href.includes("?")) return;
          const title = cleanText($(el).text());
          if (!title || title.length < 8 || seen.has(title)) return;
          seen.add(title);
          results.push({
            title,
            description: "",
            url: href.startsWith("http") ? href : `https://techtransfer.washington.edu${href}`,
            institution: INST,
          });
        });
        if (results.length > 0) {
          console.log(`[scraper] ${INST}: ${results.length} listings via techtransfer.washington.edu`);
          return results;
        }
      }

      const sitemapUrl = "https://comotion.uw.edu/startups-sitemap.xml";
      const $ = await fetchHtml(sitemapUrl);
      if ($) {
        $("url loc").each((_, el) => {
          const loc = $(el).text().trim();
          if (loc.includes("/startups/") && !loc.endsWith("/startups/")) {
            const slug = loc.replace(/\/$/, "").split("/").pop() ?? "";
            const title = slug
              .split("-")
              .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
              .join(" ");
            if (title.length > 3 && !seen.has(loc)) {
              seen.add(loc);
              results.push({ title, description: "", url: loc, institution: INST });
            }
          }
        });
        if (results.length > 0) {
          console.log(`[scraper] ${INST}: ${results.length} startups via CoMotion sitemap (TTO listing unavailable)`);
          return results;
        }
      }

      console.log(`[scraper] ${INST}: 0 results (techtransfer.washington.edu down, CoMotion empty)`);
      return [];
    } catch (err: any) {
      console.error(`[scraper] ${INST} failed: ${err?.message}`);
      return [];
    }
  },
};
