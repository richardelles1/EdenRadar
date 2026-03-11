import type { CheerioAPI } from "cheerio";
import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText } from "./utils";

export interface TechPublisherOptions {
  baseUrl?: string;
  selector?: string;
  maxPg?: number;
}

const CONCURRENCY = 5;

async function runConcurrent<T>(
  items: T[],
  fn: (item: T) => Promise<void>
): Promise<void> {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift()!;
      await fn(item);
    }
  });
  await Promise.all(workers);
}

export function createTechPublisherScraper(
  slug: string,
  institution: string,
  opts: TechPublisherOptions = {}
): InstitutionScraper {
  const base = opts.baseUrl ?? `https://${slug}.technologypublisher.com`;

  async function fetchTitle(url: string): Promise<string | null> {
    const $ = await fetchHtml(url);
    if (!$) return null;
    const h1 = cleanText($("h1").first().text());
    if (h1 && h1.length > 5) return h1;
    const title = cleanText($("title").first().text()).replace(/\s*[-|].*$/, "");
    return title.length > 5 ? title : null;
  }

  function harvestLinks(
    $: CheerioAPI,
    techSelector: string,
    seenUrls: Set<string>,
    seenTitles: Set<string>,
    out: ScrapedListing[]
  ) {
    $(techSelector).each((_, el) => {
      const href = $(el).attr("href") ?? "";
      if (!href) return;
      const fullUrl = href.startsWith("http") ? href : `${base}${href}`;
      if (seenUrls.has(fullUrl)) return;
      const title = cleanText($(el).text());
      if (!title || title.length < 8 || seenTitles.has(title)) return;
      seenUrls.add(fullUrl);
      seenTitles.add(title);
      out.push({ title, description: "", url: fullUrl, institution });
    });
  }

  async function parseSitemap(): Promise<{ techUrls: string[]; catUrls: string[] }> {
    try {
      const res = await fetch(`${base}/sitemap.xml`, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { techUrls: [], catUrls: [] };
      const xml = await res.text();
      const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) =>
        m[1].replace(/&amp;/g, "&")
      );
      const techUrls = locs
        .filter((u) => /\/(technology|tech)\//.test(u))
        .map((u) => (u.startsWith("http://") ? u.replace("http://", "https://") : u));
      const catUrls = locs
        .filter((u) => u.includes("type=c"))
        .map((u) => (u.startsWith("http://") ? u.replace("http://", "https://") : u));
      return { techUrls, catUrls };
    } catch {
      return { techUrls: [], catUrls: [] };
    }
  }

  async function parseRss(): Promise<ScrapedListing[]> {
    try {
      const res = await fetch(`${base}/RSS.aspx`, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return [];
      const xml = await res.text();
      const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];
      const out: ScrapedListing[] = [];
      for (const m of items) {
        const body = m[1];
        const titleM = body.match(/<title>([^<]+)<\/title>/);
        const linkM = body.match(/<link>([^<]+)<\/link>/);
        if (!titleM || !linkM) continue;
        const title = cleanText(titleM[1].replace(/<!\[CDATA\[|\]\]>/g, ""));
        const url = linkM[1].trim().replace("http://", "https://");
        if (title.length > 8 && url.includes(slug)) {
          out.push({ title, description: "", url, institution });
        }
      }
      return out;
    } catch {
      return [];
    }
  }

  return {
    institution,
    async scrape(): Promise<ScrapedListing[]> {
      try {
        const { techUrls: sitemapTechUrls, catUrls: sitemapCatUrls } = await parseSitemap();

        const results: ScrapedListing[] = [];
        const seenUrls = new Set<string>();
        const seenTitles = new Set<string>();

        function addResult(item: ScrapedListing) {
          if (seenUrls.has(item.url) || seenTitles.has(item.title)) return;
          seenUrls.add(item.url);
          seenTitles.add(item.title);
          results.push(item);
        }

        const techSelector = opts.selector ??
          (sitemapTechUrls.some((u) => u.includes("/tech/")) || sitemapCatUrls.length === 0
            ? "a[href*='/tech/'],a[href*='/technology/']"
            : "a[href*='/technology/']");

        const $home = await fetchHtml(`${base}/SearchResults.aspx?type=Tech&q=`);
        if ($home) {
          harvestLinks($home, techSelector, seenUrls, seenTitles, results);
          const homePageCats = new Set<string>();
          $home("a[href]").each((_, el) => {
            const href = $home(el).attr("href") ?? "";
            if (href.includes("type=c")) {
              homePageCats.add(href.startsWith("http") ? href : `${base}${href}`);
            }
          });
          sitemapCatUrls.forEach((u) => homePageCats.add(u));
          const allCatUrls = [...homePageCats];
          await runConcurrent(allCatUrls, async (catUrl) => {
            const $c = await fetchHtml(catUrl);
            if ($c) harvestLinks($c, techSelector, seenUrls, seenTitles, results);
          });
        }

        if (sitemapTechUrls.length > 0) {
          const uncovered = sitemapTechUrls.filter((u) => !seenUrls.has(u));
          if (uncovered.length > 0) {
            await runConcurrent(uncovered, async (url) => {
              const title = await fetchTitle(url);
              if (title) addResult({ title, description: "", url, institution });
            });
          }
          console.log(
            `[scraper] ${institution}: ${results.length} listings ` +
            `(sitemap: ${sitemapTechUrls.length} known, ${uncovered.length} fetched individually)`
          );
        } else {
          const rssItems = await parseRss();
          for (const item of rssItems) addResult(item);
          console.log(
            `[scraper] ${institution}: ${results.length} listings ` +
            `(no sitemap, ${sitemapCatUrls.length} cats + RSS)`
          );
        }

        return results;
      } catch (err: any) {
        console.error(`[scraper] ${institution} failed: ${err?.message}`);
        return [];
      }
    },
  };
}
