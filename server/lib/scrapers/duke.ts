import type { InstitutionScraper, ScrapedListing } from "./types";

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

// ── Network Block Notice ───────────────────────────────────────────────────────
// otc.duke.edu is protected by two layers:
//   1. TCP-level IP-range block targeting cloud hosting providers (HTTP 000 from Replit)
//   2. "within.website" WAF bot-detection challenge page served to ALL datacenter IPs,
//      including Cloudflare Worker egress — returns 200 with HTML challenge, not JSON.
//
// The Cloudflare Worker proxy (SCRAPER_PROXY_URL) bypasses layer 1 but NOT layer 2.
// Confirmed 2026-05-22: proxy returns a "Sorry, we were unable to verify that you are
// not a bot" HTML page even when hitting the WP REST API endpoint directly.
//
// To unblock Duke requires a RESIDENTIAL proxy (e.g. Bright Data, Oxylabs) — datacenter
// IPs of any kind (Replit, Cloudflare, AWS) will all hit the bot challenge.
//
// WP REST API is ready to go at /wp-json/wp/v2/technologies — scraper is fully written
// below and will activate automatically once a residential proxy is wired into
// fetchWpPageViaProxy(). Estimated yield: ~400 listings.
// ──────────────────────────────────────────────────────────────────────────────

async function fetchWpPageViaProxy(page: number): Promise<WpPost[]> {
  const proxyBase = process.env.SCRAPER_PROXY_URL?.trim();
  if (!proxyBase) return [];

  const targetUrl = `${WP_API}?per_page=${PER_PAGE}&page=${page}&_fields=id,title,link,excerpt`;
  const proxyUrl = `${proxyBase}?url=${encodeURIComponent(targetUrl)}`;

  try {
    const res = await fetch(proxyUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return [];
    const text = await res.text();
    if (text.trimStart().startsWith("<")) {
      // WAF bot-challenge HTML — datacenter proxy is insufficient, needs residential proxy
      console.warn(`[scraper] ${INST}: WAF bot-challenge detected via proxy — residential proxy required`);
      return [];
    }
    const posts: WpPost[] = JSON.parse(text);
    return Array.isArray(posts) ? posts : [];
  } catch {
    return [];
  }
}

export const dukeScraper: InstitutionScraper = {
  institution: INST,

  async probe(maxResults = 3): Promise<ScrapedListing[]> {
    const posts = await fetchWpPageViaProxy(1);
    return posts.slice(0, maxResults).map((p) => ({
      title: cleanHtml(p.title.rendered),
      description: cleanHtml(p.excerpt?.rendered ?? ""),
      url: p.link,
      institution: INST,
    })).filter((r) => r.title.length > 3);
  },

  async scrape(): Promise<ScrapedListing[]> {
    console.log(`[scraper] ${INST}: requires residential proxy — datacenter IPs (incl. Cloudflare Worker) hit WAF bot challenge`);
    const results: ScrapedListing[] = [];

    for (let page = 1; page <= 50; page++) {
      const posts = await fetchWpPageViaProxy(page);
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
      if (posts.length === 0 || posts.length < PER_PAGE) break;
    }

    if (results.length > 0) {
      console.log(`[scraper] ${INST}: ${results.length} listings via proxy`);
    }
    return results;
  },
};
