import type { InstitutionScraper, ScrapedListing } from "./types";

const BASE = "https://otm.illinois.edu";
const SITEMAP_URL = `${BASE}/sitemap.xml`;
const INST = "University of Illinois";
const TECH_PATH_RE = /\/browse-technologies-startups\/technologies\/\d+\/(.+)/;

function slugToTitle(slug: string): string {
  return slug
    .replace(/-+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

export const uillinoisScraper: InstitutionScraper = {
  institution: INST,

  async probe(maxResults = 3): Promise<ScrapedListing[]> {
    const full = await this.scrape();
    return full.slice(0, maxResults);
  },

  async scrape(): Promise<ScrapedListing[]> {
    try {
      const res = await fetch(SITEMAP_URL, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; EdenRadar/2.0)",
          Accept: "text/xml,application/xml",
        },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`Sitemap HTTP ${res.status}`);
      const xml = await res.text();

      const locTags = xml.match(/<loc>[^<]+<\/loc>/g) ?? [];
      const seen = new Set<string>();
      const results: ScrapedListing[] = [];

      for (const tag of locTags) {
        const url = tag.slice(5, -6);
        const m = TECH_PATH_RE.exec(url);
        if (!m) continue;
        if (seen.has(url)) continue;
        seen.add(url);
        const title = slugToTitle(m[1]);
        if (!title || title.length < 5) continue;
        results.push({ title, description: "", url, institution: INST });
      }

      console.log(`[scraper] ${INST}: ${results.length} listings from sitemap`);
      return results;
    } catch (err: any) {
      console.error(`[scraper] ${INST} failed: ${err?.message}`);
      return [];
    }
  },
};
