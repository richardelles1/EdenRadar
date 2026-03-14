import type { InstitutionScraper, ScrapedListing } from "./types";

const INST = "Columbia University";
const BASE = "https://inventions.techventures.columbia.edu";
const SITEMAP_URL = `${BASE}/sitemap.xml`;

function slugToTitle(slug: string): string {
  return slug
    .replace(/--[A-Z0-9]+$/, "")
    .replace(/-+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

export const columbiaScraper: InstitutionScraper = {
  institution: INST,

  async scrape(): Promise<ScrapedListing[]> {
    console.log(`[scraper] ${INST}: fetching sitemap...`);
    try {
      const res = await fetch(SITEMAP_URL, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; EdenRadar/2.0)" },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const xml = await res.text();

      const results: ScrapedListing[] = [];
      const re = /<loc>(https:\/\/inventions\.techventures\.columbia\.edu\/technologies\/([^<]+))<\/loc>/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(xml)) !== null) {
        const url = m[1];
        const slug = m[2];
        const title = slugToTitle(slug);
        if (title.length > 3) {
          results.push({ title, description: "", url, institution: INST });
        }
      }

      console.log(`[scraper] ${INST}: ${results.length} listings from sitemap`);
      return results;
    } catch (err: any) {
      console.error(`[scraper] ${INST} sitemap failed: ${err?.message}`);
      return [];
    }
  },
};
