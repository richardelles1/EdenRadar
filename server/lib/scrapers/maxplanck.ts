import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText } from "./utils";

const INST = "Max Planck Innovation";
const BASE = "https://www.max-planck-innovation.com";
const HOME_URL = `${BASE}/`;

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
    try {
      const res = await fetch(HOME_URL, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html",
        },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        console.warn(`[scraper] ${INST}: home page HTTP ${res.status}`);
        return [];
      }
      const html = await res.text();

      const pattern = /<h3>([^<]+)<\/h3>\s*<p><a href="technology-offers\/technology-offer\/([^"]+)">[^<]*<\/a><\/p>/gi;
      const offers: { title: string; slug: string }[] = [];
      const seen = new Set<string>();
      let match: RegExpExecArray | null;

      while ((match = pattern.exec(html)) !== null) {
        const title = decodeHtmlEntities(match[1]);
        const slug = match[2];
        if (!title || title.length < 5 || seen.has(slug)) continue;
        seen.add(slug);
        offers.push({ title, slug });
      }

      if (offers.length === 0) {
        console.log(`[scraper] ${INST}: 0 tech offers found on home page`);
        return [];
      }

      const results: ScrapedListing[] = [];

      for (const { title, slug } of offers) {
        const detailUrl = `${BASE}/technology-offers/technology-offer/${slug}`;
        let description = title;

        try {
          const $ = await fetchHtml(detailUrl, 12_000);
          if ($) {
            const pageTitle = cleanText($("h1").first().text());
            if (pageTitle && pageTitle.length > 10 && !pageTitle.includes("Technology Transfer for the Max Planck")) {
              const bodyText = cleanText(
                $("main p").map((_, el) => $(el).text()).get().join(" ")
              ).slice(0, 2000);
              if (bodyText && bodyText.length > 20) {
                description = bodyText;
              }
            }
          }
        } catch {}

        results.push({
          title,
          description,
          url: detailUrl,
          institution: INST,
        });
      }

      console.log(`[scraper] ${INST}: ${results.length} listings (detail-enriched)`);
      return results;
    } catch (err: any) {
      console.error(`[scraper] ${INST} failed: ${err?.message}`);
      return [];
    }
  },
};
