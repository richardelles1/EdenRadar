import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchJsonViaProxy } from "./utils";

const INST = "Duke University";
const BASE = "https://otc.duke.edu";
const WP_API = `${BASE}/wp-json/wp/v2/technologies`;
const PER_PAGE = 100;

interface WpPost {
  id: number;
  title: { rendered: string };
  link: string;
  excerpt?: { rendered: string };
}

function cleanHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();
}

// otc.duke.edu is TCP-blocked from Replit cloud IPs — route through Cloudflare proxy.
// Requires SCRAPER_PROXY_URL env secret pointing to the deployed worker.js.
// worker.js allowlist must include "otc.duke.edu".
// X-WP-TotalPages header is unavailable through the proxy, so we paginate until
// the API returns fewer than PER_PAGE results or a non-2xx status (page past last).

async function fetchWpPageViaProxy(page: number): Promise<WpPost[] | null> {
  const url = `${WP_API}?per_page=${PER_PAGE}&page=${page}&_fields=id,title,link,excerpt`;
  return fetchJsonViaProxy<WpPost[]>(url, 15_000);
}

export const dukeScraper: InstitutionScraper = {
  institution: INST,

  async probe(maxResults = 3): Promise<ScrapedListing[]> {
    const posts = await fetchWpPageViaProxy(1);
    if (!posts) return [];
    return posts.slice(0, maxResults).map((p) => ({
      title: cleanHtml(p.title.rendered),
      description: cleanHtml(p.excerpt?.rendered ?? ""),
      url: p.link,
      institution: INST,
    })).filter((r) => r.title.length > 3);
  },

  async scrape(): Promise<ScrapedListing[]> {
    console.log(`[scraper] ${INST}: fetching via Cloudflare proxy (WP REST API)...`);
    const results: ScrapedListing[] = [];

    for (let page = 1; page <= 50; page++) {
      const posts = await fetchWpPageViaProxy(page);
      if (!posts || posts.length === 0) break;

      for (const p of posts) {
        const title = cleanHtml(p.title.rendered);
        if (title.length > 3) {
          results.push({
            title,
            description: cleanHtml(p.excerpt?.rendered ?? ""),
            url: p.link,
            institution: INST,
          });
        }
      }

      if (posts.length < PER_PAGE) break;
    }

    console.log(`[scraper] ${INST}: ${results.length} listings via proxied WP REST API`);
    return results;
  },
};
