import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText, SiteHttpError } from "./utils";
import { enrichWithDetailPages } from "./detailFetcher";

const BASE = "https://techfinder.stanford.edu";
const INST = "Stanford University";
const SITEMAP_URL = `${BASE}/sitemap.xml`;

// Parallel batch size for the page-scan fallback.
const PAGE_WINDOW = 5;
const PAGE_TIMEOUT_MS = 30_000;

async function fetchStanfordSitemapUrls(signal?: AbortSignal): Promise<string[] | null> {
  try {
    const res = await fetch(SITEMAP_URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.any([signal ?? AbortSignal.timeout(20_000), AbortSignal.timeout(20_000)]),
    });
    if (res.status === 429) {
      console.warn(`[scraper] ${INST}: sitemap rate-limited (429)`);
      return null;
    }
    if (!res.ok) throw new Error(`Sitemap HTTP ${res.status}`);
    const xml = await res.text();
    const urls: string[] = [];
    const re = /<loc>(https:\/\/techfinder\.stanford\.edu\/technology\/[^<]+)<\/loc>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) !== null) {
      urls.push(m[1]);
    }
    console.log(`[scraper] ${INST}: sitemap returned ${urls.length} technology URLs`);
    return urls;
  } catch (err: any) {
    console.warn(`[scraper] ${INST}: sitemap fetch failed (${err?.message})`);
    return null;
  }
}

export const stanfordScraper: InstitutionScraper = {
  institution: INST,
  // 25 min covers first-time full runs where hundreds of detail pages need fetching.
  // On repeat syncs (knownUrls provided) the sitemap diff finds 0–20 new items,
  // so the run completes in well under 2 minutes — immune to server restarts.
  scraperTimeoutMs: 25 * 60 * 1000,

  async scrape(signal?: AbortSignal, knownUrls?: Set<string>): Promise<ScrapedListing[]> {
    try {
      // ── Sitemap-first approach (fast path) ────────────────────────────────
      // Single sitemap fetch (~2s) replaces slow 120-page paginated scan.
      // On repeat syncs only genuinely new URLs are detail-fetched (typically 0–20),
      // making the whole run complete in seconds rather than minutes.
      console.log(`[scraper] ${INST}: fetching sitemap…`);
      const allUrls = await fetchStanfordSitemapUrls(signal);

      if (allUrls && allUrls.length > 0) {
        const newUrls = knownUrls
          ? allUrls.filter((u) => !knownUrls.has(u))
          : allUrls;

        console.log(
          `[scraper] ${INST}: ${allUrls.length} sitemap URLs — ` +
            `${knownUrls?.size ?? 0} already known, ${newUrls.length} new`,
        );

        // Build stubs for ALL sitemap URLs. Already-known listings get a title
        // stub only (no detail fetch); new ones are enriched via detail pages.
        // Returning all listings lets the pipeline record real rawCollected /
        // relevant counts, matching the behaviour of every other scraper.
        const stubs: ScrapedListing[] = allUrls.map((url) => {
          const slug = url.split("/technology/")[1] ?? url;
          const titleStub = slug
            .replace(/-/g, " ")
            .replace(/\b\w/g, (c) => c.toUpperCase())
            .slice(0, 200);
          return {
            title: titleStub,
            description: "",
            url,
            institution: INST,
          };
        });

        if (newUrls.length > 0) {
          const newSet = new Set(newUrls);
          const toEnrich = stubs.filter((s) => newSet.has(s.url));
          console.log(`[scraper] ${INST}: fetching detail pages for ${toEnrich.length} new listings…`);
          await enrichWithDetailPages(
            toEnrich,
            {
              description: [".docket__text", "article p"],
              abstract: [".docket__text"],
              inventors: [
                ".docket__related-people a",
                ".docket__related-people li",
              ],
              patentStatus: [],
            },
            9999,
            signal,
          );
        } else {
          console.log(`[scraper] ${INST}: no new listings this cycle — returning ${stubs.length} stubs for pipeline count`);
        }

        const valid = stubs.filter((s) => s.title && s.title.length >= 5);
        console.log(`[scraper] ${INST}: ${valid.length} listings (${newUrls.length} detail-enriched)`);
        return valid;
      }

      // ── Sitemap unavailable — adaptive page-scan fallback ─────────────────
      // Preserves the original behavior if Stanford's sitemap becomes unavailable.
      console.warn(
        `[scraper] ${INST}: sitemap unavailable — falling back to adaptive page scan`,
      );

      const results: ScrapedListing[] = [];
      const seen = new Set<string>();

      const page0$ = await fetchHtml(`${BASE}/`, PAGE_TIMEOUT_MS, signal, 2, true);
      if (!page0$) {
        console.warn(`[scraper] ${INST}: could not fetch listing page 0`);
        return [];
      }

      const extractListings = (
        $: NonNullable<Awaited<ReturnType<typeof fetchHtml>>>,
      ): number => {
        let raw = 0;
        $("h3.teaser__title a").each((_, el) => {
          raw++;
          const href = $(el).attr("href") ?? "";
          if (!href.startsWith("/technology/")) return;
          const title = cleanText($(el).text());
          if (!title || title.length < 10 || seen.has(title)) return;
          seen.add(title);
          results.push({
            title,
            description: title,
            url: `${BASE}${href}`,
            institution: INST,
          });
        });
        return raw;
      };

      extractListings(page0$);
      console.log(`[scraper] ${INST}: page 0 — ${results.length} listings`);

      const EMERGENCY_CEIL = 500;
      const CDN_BLOCK_CEIL = 2;
      let offset = 1;
      let skipped = 0;
      let consecutiveFullFails = 0;

      while (!signal?.aborted && offset < EMERGENCY_CEIL) {
        const pageNums: number[] = [];
        for (
          let i = 0;
          i < PAGE_WINDOW && offset + i < EMERGENCY_CEIL;
          i++
        ) {
          pageNums.push(offset + i);
        }

        const pages = await Promise.all(
          pageNums.map((p) =>
            fetchHtml(`${BASE}/?page=${p}`, PAGE_TIMEOUT_MS, signal, 0),
          ),
        );

        let hitEmpty = false;
        let fetchFails = 0;
        for (const $ of pages) {
          if (!$) {
            fetchFails++;
            skipped++;
            continue;
          }
          if (extractListings($) === 0) hitEmpty = true;
        }

        const batchEnd = offset + pageNums.length - 1;
        console.log(
          `[scraper] ${INST}: scanned pages ${offset}–${batchEnd}` +
            ` — ${results.length} listings so far` +
            (fetchFails
              ? ` (${fetchFails}/${pageNums.length} page(s) failed to load)`
              : ""),
        );

        if (hitEmpty) break;

        if (fetchFails >= pageNums.length) {
          consecutiveFullFails++;
          if (consecutiveFullFails >= CDN_BLOCK_CEIL) {
            console.warn(
              `[scraper] ${INST}: ${CDN_BLOCK_CEIL} consecutive all-fail batches — CDN blocking, stopping early`,
            );
            break;
          }
        } else {
          consecutiveFullFails = 0;
        }

        offset += PAGE_WINDOW;
      }

      if (skipped > 0) {
        console.warn(
          `[scraper] ${INST}: ${skipped} list page(s) skipped due to timeout/error`,
        );
      }

      const toEnrich = knownUrls
        ? results.filter((r) => !knownUrls.has(r.url))
        : results;

      const knownCount = results.length - toEnrich.length;
      console.log(
        `[scraper] ${INST}: ${results.length} listings total — ` +
          `${toEnrich.length} new (need detail fetch), ${knownCount} already indexed (skipping detail fetch)`,
      );

      if (toEnrich.length > 0) {
        await enrichWithDetailPages(
          toEnrich,
          {
            description: [".docket__text", "article p"],
            abstract: [".docket__text"],
            inventors: [
              ".docket__related-people a",
              ".docket__related-people li",
            ],
            patentStatus: [],
          },
          9999,
          signal,
        );
      }

      console.log(
        `[scraper] ${INST}: ${results.length} listings (detail-enriched for ${toEnrich.length} new)`,
      );
      return results;
    } catch (err: unknown) {
      if (err instanceof SiteHttpError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[scraper] ${INST} failed: ${msg}`);
      return [];
    }
  },
};
