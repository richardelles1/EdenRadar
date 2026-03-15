import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText } from "./utils";

const INST = "LifeArc";
const BASE = "https://www.lifearc.org";
const POST_TYPES = ["therapeutics", "diagnostics", "other-technologies"];

interface WpPost {
  title?: { rendered?: string };
  excerpt?: { rendered?: string };
  content?: { rendered?: string };
  link?: string;
  slug?: string;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&\w+;/g, " ").replace(/\s+/g, " ").trim();
}

export const lifeArcScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    const results: ScrapedListing[] = [];
    const seen = new Set<string>();

    for (const pt of POST_TYPES) {
      let page = 1;
      while (page <= 10) {
        try {
          const url = `${BASE}/wp-json/wp/v2/${pt}?per_page=100&page=${page}`;
          const res = await fetch(url, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              Accept: "application/json",
            },
            signal: AbortSignal.timeout(15_000),
          });
          if (!res.ok) break;
          const items: WpPost[] = await res.json();
          if (!Array.isArray(items) || items.length === 0) break;

          for (const item of items) {
            const title = stripHtml(item.title?.rendered ?? "");
            if (!title || title.length < 3) continue;
            const itemUrl = item.link ?? `${BASE}/${pt}/${item.slug}/`;
            if (seen.has(itemUrl)) continue;
            seen.add(itemUrl);

            const excerpt = stripHtml(item.excerpt?.rendered ?? "");
            const content = stripHtml(item.content?.rendered ?? "").slice(0, 2000);
            const description = content.length > excerpt.length ? content : excerpt;

            results.push({
              title,
              description: description || title,
              url: itemUrl,
              institution: INST,
              categories: [pt.replace(/-/g, " ")],
            });
          }

          if (items.length < 100) break;
          page++;
        } catch (err: any) {
          console.warn(`[scraper] ${INST}: ${pt} page ${page} failed: ${err?.message}`);
          break;
        }
      }
    }

    if (results.length > 0) {
      const BATCH = 5;
      for (let i = 0; i < results.length; i += BATCH) {
        await Promise.all(
          results.slice(i, i + BATCH).map(async (item) => {
            try {
              const $ = await fetchHtml(item.url, 12_000);
              if (!$) return;
              const bodyText = cleanText(
                $(".entry-content p, .single-content p, article p")
                  .map((_, el) => $(el).text())
                  .get()
                  .join(" ")
              ).slice(0, 2000);
              if (bodyText && bodyText.length > (item.description?.length ?? 0)) {
                item.description = bodyText;
              }
            } catch {}
          })
        );
      }
    }

    console.log(
      `[scraper] ${INST}: ${results.length} listings (${POST_TYPES.length} post types, detail-enriched)`
    );
    return results;
  },
};
