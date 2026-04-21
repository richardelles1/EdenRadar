import type { CheerioAPI } from "cheerio";
import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText, SiteHttpError } from "./utils";

export interface TechPublisherOptions {
  baseUrl?: string;
  selector?: string;
  maxPg?: number;
  maxCats?: number;
  maxTech?: number;
  institutionTimeoutMs?: number;
}

const CONCURRENCY = 5;
const PAGE_WINDOW = 5; // parallel pages per window for adaptive pagination scan
const FETCH_TIMEOUT_MS = 15_000;

async function runConcurrent<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  signal?: AbortSignal
): Promise<void> {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (queue.length > 0) {
      if (signal?.aborted) return;
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

  async function fetchTitle(url: string, signal: AbortSignal): Promise<string | null> {
    const $ = await fetchHtml(url, FETCH_TIMEOUT_MS, signal);
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

  // Count raw link elements on a page — used by the adaptive scan to detect
  // an empty page without being confused by deduplication.
  function countRawLinks($: CheerioAPI, techSelector: string): number {
    return $(techSelector).length;
  }

  async function parseSitemap(signal: AbortSignal): Promise<{ techUrls: string[]; catUrls: string[] }> {
    try {
      const res = await fetch(`${base}/sitemap.xml`, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.any([signal, AbortSignal.timeout(FETCH_TIMEOUT_MS)]),
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

  async function parseRss(signal: AbortSignal): Promise<ScrapedListing[]> {
    try {
      const res = await fetch(`${base}/RSS.aspx`, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.any([signal, AbortSignal.timeout(FETCH_TIMEOUT_MS)]),
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

  async function scrapeInner(signal: AbortSignal): Promise<ScrapedListing[]> {
    const [{ techUrls: sitemapTechUrls, catUrls: sitemapCatUrls }, rssItems] = await Promise.all([
      parseSitemap(signal),
      parseRss(signal),
    ]);

    if (signal.aborted) return [];

    const results: ScrapedListing[] = [];
    const seenUrls = new Set<string>();
    const seenTitles = new Set<string>();

    function addResult(item: ScrapedListing) {
      if (seenUrls.has(item.url) || seenTitles.has(item.title)) return;
      seenUrls.add(item.url);
      seenTitles.add(item.title);
      results.push(item);
    }

    for (const item of rssItems) addResult(item);
    const rssCount = results.length;

    const techSelector = opts.selector ??
      (sitemapTechUrls.some((u) => u.includes("/tech/")) || sitemapCatUrls.length === 0
        ? "a[href*='/tech/'],a[href*='/technology/']"
        : "a[href*='/technology/']");

    const $home = await fetchHtml(`${base}/SearchResults.aspx?type=Tech&q=`, FETCH_TIMEOUT_MS, signal, 2, true);
    if (signal.aborted) {
      console.log(`[scraper] ${institution}: ${results.length} listings (aborted after RSS: ${rssCount})`);
      return results;
    }

    let catCount = 0;
    let pgCount = 1;
    if ($home) {
      harvestLinks($home, techSelector, seenUrls, seenTitles, results);

      // Adaptive parallel window scan for paginated search results.
      // Fetch PAGE_WINDOW pages at once; stop when any page in the batch returns
      // zero raw link elements — that signals we've passed the last real page.
      // opts.maxPg acts as an emergency ceiling (runaway-loop guard), not a preset count.
      if (opts.maxPg != null && opts.maxPg > 1) {
        let offset = 2;
        const EMERGENCY_CEIL = opts.maxPg;

        while (!signal.aborted && offset <= EMERGENCY_CEIL) {
          const pageNums: number[] = [];
          for (let i = 0; i < PAGE_WINDOW && offset + i <= EMERGENCY_CEIL; i++) {
            pageNums.push(offset + i);
          }

          const pages = await Promise.all(
            pageNums.map((pg) =>
              fetchHtml(`${base}/SearchResults.aspx?type=Tech&q=&page=${pg}`, FETCH_TIMEOUT_MS, signal)
            )
          );

          let hitEmpty = false;
          let fetchFails = 0;
          for (const $pg of pages) {
            if (!$pg) { fetchFails++; continue; }
            if (countRawLinks($pg, techSelector) === 0) {
              hitEmpty = true;
            } else {
              harvestLinks($pg, techSelector, seenUrls, seenTitles, results);
            }
          }

          pgCount = offset + pageNums.length - 1;

          console.log(
            `[scraper] ${institution}: scanned pages ${offset}–${pgCount}` +
            ` — ${results.length} listings so far` +
            (fetchFails ? ` (${fetchFails} page(s) failed)` : "")
          );

          if (hitEmpty || fetchFails === pageNums.length) break;
          offset += PAGE_WINDOW;
        }
      }

      const homePageCats = new Set<string>();
      $home("a[href]").each((_, el) => {
        const href = $home(el).attr("href") ?? "";
        if (href.includes("type=c")) {
          homePageCats.add(href.startsWith("http") ? href : `${base}${href}`);
        }
      });
      sitemapCatUrls.forEach((u) => homePageCats.add(u));

      const allCatUrls = opts.maxCats != null
        ? [...homePageCats].slice(0, opts.maxCats)
        : [...homePageCats];
      await runConcurrent(allCatUrls, async (catUrl) => {
        const $c = await fetchHtml(catUrl, FETCH_TIMEOUT_MS, signal);
        if ($c) harvestLinks($c, techSelector, seenUrls, seenTitles, results);
      }, signal);
      catCount = results.length - rssCount;
    }

    if (signal.aborted) {
      console.log(`[scraper] ${institution}: ${results.length} listings (aborted — RSS: ${rssCount}, cats: ${catCount})`);
      return results;
    }

    let sitemapPageCount = 0;
    if (sitemapTechUrls.length > 0) {
      const seenPaths = new Set<string>();
      for (const u of seenUrls) {
        try { seenPaths.add(new URL(u).pathname); } catch {}
      }
      let uncovered = sitemapTechUrls.filter((u) => {
        if (seenUrls.has(u)) return false;
        try { return !seenPaths.has(new URL(u).pathname); } catch { return true; }
      });
      if (opts.maxTech != null) uncovered = uncovered.slice(0, opts.maxTech);
      if (uncovered.length > 0) {
        await runConcurrent(uncovered, async (url) => {
          const title = await fetchTitle(url, signal);
          if (title) addResult({ title, description: "", url, institution });
        }, signal);
      }
      sitemapPageCount = results.length - rssCount - catCount;
    }

    console.log(
      `[scraper] ${institution}: ${results.length} listings ` +
      `(RSS: ${rssCount}, pages: ${pgCount}, cats: ${catCount}, sitemap-pages: ${sitemapPageCount})`
    );

    return results;
  }

  return {
    institution,
    async scrape(signal?: AbortSignal): Promise<ScrapedListing[]> {
      const controller = new AbortController();
      if (signal) {
        if (signal.aborted) controller.abort();
        else signal.addEventListener("abort", () => controller.abort(), { once: true });
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      if (opts.institutionTimeoutMs) {
        timer = setTimeout(() => controller.abort(), opts.institutionTimeoutMs);
      }
      try {
        return await scrapeInner(controller.signal);
      } catch (err: any) {
        if (err instanceof SiteHttpError) throw err;
        if (err?.name !== "AbortError") {
          console.error(`[scraper] ${institution} failed: ${err?.message}`);
        }
        return [];
      } finally {
        if (timer) clearTimeout(timer);
      }
    },
  };
}
