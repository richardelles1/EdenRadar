import type { InstitutionScraper, ScrapedListing } from "./types";

const INST = "Duke University";
const BASE = "https://otc.duke.edu";
const SITEMAP = `${BASE}/pt__technology-sitemap.xml`;

function slugToTitle(slug: string): string {
  return slug
    .replace(/\/$/, "")
    .replace(/-+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

export const dukeScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    console.log(`[scraper] ${INST}: fetching technology sitemap...`);
    try {
      const res = await fetch(SITEMAP, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; EdenRadar/2.0)" },
      });
      if (!res.ok) throw new Error(`sitemap HTTP ${res.status}`);
      const xml = await res.text();

      const results: ScrapedListing[] = [];
      const seen = new Set<string>();
      const re = /<loc>(https:\/\/otc\.duke\.edu\/technologies\/([^<]+)\/)<\/loc>/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(xml)) !== null) {
        const url = m[1];
        const slug = m[2];
        if (!seen.has(slug) && slug !== "") {
          seen.add(slug);
          results.push({
            title: slugToTitle(slug),
            description: "",
            url,
            institution: INST,
          });
        }
      }

      console.log(`[scraper] ${INST}: scraped ${results.length} listings`);
      return results;
    } catch (err: any) {
      console.error(`[scraper] ${INST} failed: ${err?.message}`);
      return [];
    }
  },
};
