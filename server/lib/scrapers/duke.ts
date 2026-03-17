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

async function fetchWpPage(page: number): Promise<WpPost[]> {
  const url = `${WP_API}?per_page=${PER_PAGE}&page=${page}&_fields=id,title,link,excerpt`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; EdenRadar/2.0)",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const totalPages = parseInt(res.headers.get("X-WP-TotalPages") ?? "1", 10);
  const posts: WpPost[] = await res.json();
  return Object.assign(posts, { totalPages });
}

// ── Network Block Notice ───────────────────────────────────────────────────────
// otc.duke.edu is blocked at the TCP level from our server's IP range.
// All connection attempts return HTTP 000 / ConnectTimeoutError (verified March 2026).
// This affects EVERY endpoint on the domain — the root page, the WP REST API,
// sitemaps, and individual technology pages all fail with the same TCP timeout.
// The site IS publicly accessible from browsers; the block is IP-range-specific
// (likely Duke's CDN/WAF targeting cloud hosting providers).
//
// Do NOT attempt alternative URL patterns, different user-agents, or proxy tricks —
// the block is at the TCP handshake layer, not HTTP. Until Duke's CDN allows
// server-side access, this scraper will always return 0 results.
//
// To unblock: contact Duke OTC (otcinfo@duke.edu) and request server-IP allowlisting,
// or set up a proxy/tunnel outside the blocked IP range.
// ──────────────────────────────────────────────────────────────────────────────

export const dukeScraper: InstitutionScraper = {
  institution: INST,

  async probe(maxResults = 3): Promise<ScrapedListing[]> {
    // otc.duke.edu is TCP-blocked from our server — always returns [].
    // See block notice above.
    try {
      const posts = await fetchWpPage(1);
      return posts.slice(0, maxResults).map((p) => ({
        title: cleanHtml(p.title.rendered),
        description: cleanHtml(p.excerpt?.rendered ?? ""),
        url: p.link,
        institution: INST,
      })).filter((r) => r.title.length > 3);
    } catch {
      return [];
    }
  },

  async scrape(): Promise<ScrapedListing[]> {
    // otc.duke.edu is TCP-blocked from our server — always returns [].
    // See block notice above for full details and remediation steps.
    console.log(`[scraper] ${INST}: attempting WP REST API (note: otc.duke.edu is TCP-blocked from server IP range)...`);
    try {
      const firstPage = await fetchWpPage(1);
      const totalPages: number = (firstPage as any).totalPages ?? 1;
      const results: ScrapedListing[] = firstPage
        .map((p) => ({
          title: cleanHtml(p.title.rendered),
          description: cleanHtml(p.excerpt?.rendered ?? ""),
          url: p.link,
          institution: INST,
        }))
        .filter((r) => r.title.length > 3);

      for (let page = 2; page <= Math.min(totalPages, 50); page++) {
        const posts = await fetchWpPage(page);
        for (const p of posts) {
          results.push({
            title: cleanHtml(p.title.rendered),
            description: cleanHtml(p.excerpt?.rendered ?? ""),
            url: p.link,
            institution: INST,
          });
        }
      }

      console.log(`[scraper] ${INST}: ${results.length} listings via WP REST API`);
      return results;
    } catch (err: any) {
      console.warn(`[scraper] ${INST}: WP REST API failed (${err?.message}) — TCP-blocked from server IP range (see block notice in source)`);
      return [];
    }
  },
};
