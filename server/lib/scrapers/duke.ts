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

export const dukeScraper: InstitutionScraper = {
  institution: INST,

  async probe(maxResults = 3): Promise<ScrapedListing[]> {
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
    console.log(`[scraper] ${INST}: attempting WP REST API...`);
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
      console.warn(`[scraper] ${INST}: WP REST API failed (${err?.message}) — site may be JS-rendered or rate-limited`);
      return [];
    }
  },
};
