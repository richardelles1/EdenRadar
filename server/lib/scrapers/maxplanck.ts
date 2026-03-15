import type { InstitutionScraper, ScrapedListing } from "./types";

const INST = "Max Planck Innovation";
const BASE = "https://www.max-planck-innovation.de/en";

const CATEGORIES = [
  "medicine",
  "nucleic-acid-protein-and-cell-related-technologies",
  "processes-and-methods-incl-screening",
  "research-tools",
  "green-biotech",
  "imaging-microscopy",
  "analytics",
  "new-materials",
  "sensors-devices-components",
];

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#40;/g, "(")
    .replace(/&#41;/g, ")")
    .replace(/&#38;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .trim();
}

export const maxPlanckScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    const seen = new Set<string>();
    const results: ScrapedListing[] = [];

    for (const category of CATEGORIES) {
      try {
        const catUrl = `${BASE}/technology-offers/${category}.html`;
        const res = await fetch(catUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            Accept: "text/html",
          },
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) continue;
        const html = await res.text();

        const pattern = /<h3>([^<]+)<\/h3>\s*<p><a href="technology-offers\/technology-offer\/([^"]+)">[^<]*<\/a><\/p>/gi;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(html)) !== null) {
          const title = decodeHtmlEntities(match[1]);
          const slug = match[2];
          if (!title || title.length < 5 || seen.has(slug)) continue;
          seen.add(slug);

          results.push({
            title,
            description: title,
            url: `${BASE}/technology-offers/technology-offer/${slug}`,
            institution: INST,
            categories: [category.replace(/-/g, " ")],
          });
        }
      } catch (err: any) {
        console.warn(`[scraper] ${INST}: category ${category} failed: ${err?.message}`);
      }
    }

    console.log(`[scraper] ${INST}: ${results.length} listings (${CATEGORIES.length} categories swept)`);
    return results;
  },
};
