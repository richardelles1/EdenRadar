import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText } from "./utils";

const INST = "Kyoto University (TLO)";
const BASE = "https://www.tlo-kyoto.co.jp";

const CATEGORIES = [
  "life-science",
  "ips-cells",
  "drug-development",
  "medical-device",
  "aff",
  "organic-materials",
  "metals-and-inorganic-materials",
  "engineering-and-machining",
  "electrical-and-electronic",
  "information-and-communication",
  "environment-and-energy",
];

function extractPostUrls(html: string): string[] {
  const matches = [...html.matchAll(/href="(\/english\/patent\/post-\d+\.html)"/gi)];
  return [...new Set(matches.map((m) => m[1]))];
}

export const kyotoTloScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    const allPaths = new Set<string>();

    for (const cat of CATEGORIES) {
      try {
        const url = `${BASE}/english/patent/${cat}/`;
        const $ = await fetchHtml(url, 15_000);
        if (!$) continue;
        const html = $.html();
        const posts = extractPostUrls(html);
        for (const p of posts) allPaths.add(p);
      } catch {
        continue;
      }
    }

    if (allPaths.size === 0) {
      console.log(`[scraper] ${INST}: 0 tech items found across ${CATEGORIES.length} categories`);
      return [];
    }

    const results: ScrapedListing[] = [];
    const BATCH = 5;
    const paths = [...allPaths];

    for (let i = 0; i < paths.length; i += BATCH) {
      await Promise.all(
        paths.slice(i, i + BATCH).map(async (path) => {
          try {
            const url = `${BASE}${path}`;
            const $ = await fetchHtml(url, 12_000);
            if (!$) return;

            const rawTitle = cleanText($("title").first().text());
            const title = rawTitle
              .replace(/\s*\|\s*TLO-KYOTO.*$/i, "")
              .replace(/\s*\|\s*Kansai.*$/i, "")
              .trim();

            if (!title || title.length < 5 || /page not found/i.test(title)) return;

            const bodyParagraphs = $("main p, .entry-content p, article p, .post-content p")
              .map((_, el) => cleanText($(el).text()))
              .get()
              .filter((t: string) => t.length > 20);
            const description = bodyParagraphs.join(" ").slice(0, 2000) || title;

            results.push({
              title,
              description,
              url,
              institution: INST,
            });
          } catch {}
        })
      );
    }

    console.log(
      `[scraper] ${INST}: ${results.length} listings from ${allPaths.size} detail pages (${CATEGORIES.length} categories)`
    );
    return results;
  },
};
