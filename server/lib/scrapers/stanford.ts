import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText, resolveUrl, SiteHttpError } from "./utils";
import { enrichWithDetailPages } from "./detailFetcher";

const BASE = "https://techfinder.stanford.edu";
const INST = "Stanford University";
// Parallel batch size for list-page fetching.
// CDN cache sharding causes specific page numbers to take 10-12s (confirmed).
// PAGE_WINDOW=5 is correct: slow pages run alongside fast ones in parallel —
// each batch finishes in max(page times) ≈ 12s. 150 pages ÷ 5 = 30 batches
// × 12s = 360s ≈ 6 min, well within the scraperTimeoutMs.
const PAGE_WINDOW = 5;
// Per-page timeout: 30s. Cold-cache pages hit 10-12s; 30s gives headroom.
const PAGE_TIMEOUT_MS = 30_000;

export const stanfordScraper: InstitutionScraper = {
  institution: INST,
  // 25 min covers the full first-time run (6 min list + 15 min ~916 detail pages).
  // On repeat syncs with knownUrls supplied, detail enrichment is skipped for
  // already-indexed listings so the run completes in ~6 min (just list scan).
  scraperTimeoutMs: 25 * 60 * 1000,
  async scrape(signal?: AbortSignal, knownUrls?: Set<string>): Promise<ScrapedListing[]> {
    try {
      const results: ScrapedListing[] = [];
      const seen = new Set<string>();

      // Step 1: fetch page 0 with retries=2 (default) and 30s timeout.
      // Page 0 is required — if it fails the run produces 0 listings.
      const page0$ = await fetchHtml(`${BASE}/`, PAGE_TIMEOUT_MS, signal, 2, true);
      if (!page0$) {
        console.warn(`[scraper] ${INST}: could not fetch listing page 0`);
        return [];
      }

      // Extract listings from a parsed page.
      // Returns the RAW count of matching elements so the adaptive window scan
      // can detect a genuinely empty page regardless of deduplication.
      // Uses the Drupal 11 class h3.teaser__title a — the dedicated title anchor
      // for technology listings, avoids picking up nav or category links.
      const extractListings = ($: NonNullable<Awaited<ReturnType<typeof fetchHtml>>>): number => {
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
            url: resolveUrl(BASE, href),
            institution: INST,
          });
        });
        return raw;
      };

      // Extract from page 0 immediately.
      extractListings(page0$);
      console.log(`[scraper] ${INST}: page 0 — ${results.length} listings`);

      // Step 2: adaptive parallel window scan (no pagination-link detection).
      // Fetch PAGE_WINDOW pages at once; stop when any page in the batch returns
      // zero matching elements (end of results), OR when N consecutive batches
      // ALL fail to load (true CDN block). Sporadic individual page failures
      // (1 to PAGE_WINDOW-1 per batch) are tolerated — just skipped and logged.
      const EMERGENCY_CEIL = 500;
      const CDN_BLOCK_CEIL = 2;
      let offset = 1;
      let skipped = 0;
      let consecutiveFullFails = 0;

      while (!signal?.aborted && offset < EMERGENCY_CEIL) {
        const pageNums: number[] = [];
        for (let i = 0; i < PAGE_WINDOW && offset + i < EMERGENCY_CEIL; i++) {
          pageNums.push(offset + i);
        }

        const pages = await Promise.all(
          pageNums.map((p) => fetchHtml(`${BASE}/?page=${p}`, PAGE_TIMEOUT_MS, signal, 0))
        );

        let hitEmpty = false;
        let fetchFails = 0;
        for (const $ of pages) {
          if (!$) { fetchFails++; skipped++; continue; }
          if (extractListings($) === 0) hitEmpty = true;
        }

        const batchEnd = offset + pageNums.length - 1;
        console.log(
          `[scraper] ${INST}: scanned pages ${offset}–${batchEnd}` +
          ` — ${results.length} listings so far` +
          (fetchFails ? ` (${fetchFails}/${pageNums.length} page(s) failed to load)` : "")
        );

        if (hitEmpty) break;

        if (fetchFails >= pageNums.length) {
          consecutiveFullFails++;
          if (consecutiveFullFails >= CDN_BLOCK_CEIL) {
            console.warn(
              `[scraper] ${INST}: ${CDN_BLOCK_CEIL} consecutive all-fail batches — CDN blocking, stopping early`
            );
            break;
          }
        } else {
          consecutiveFullFails = 0;
        }

        offset += PAGE_WINDOW;
      }

      if (skipped > 0) {
        console.warn(`[scraper] ${INST}: ${skipped} list page(s) skipped due to timeout/error`);
      }

      // Step 3: enrich detail pages — but ONLY for listings not already indexed.
      // On first-time runs knownUrls is empty/undefined so all ~916 listings are
      // enriched (~15 min). On repeat syncs knownUrls contains the full catalog
      // so only genuinely new listings get detail-fetched, cutting the sync to
      // ~6 min (list scan only). This prevents server-restart kills on repeat runs.
      const toEnrich = knownUrls
        ? results.filter((r) => !knownUrls.has(r.url))
        : results;

      const knownCount = results.length - toEnrich.length;
      console.log(
        `[scraper] ${INST}: ${results.length} listings total — ` +
        `${toEnrich.length} new (need detail fetch), ${knownCount} already indexed (skipping detail fetch)`
      );

      if (toEnrich.length > 0) {
        await enrichWithDetailPages(
          toEnrich,
          {
            description: [
              ".docket__text",
              "article p",
            ],
            abstract: [
              ".docket__text",
            ],
            inventors: [
              ".docket__related-people a",
              ".docket__related-people li",
            ],
            patentStatus: [],
          },
          9999,
          signal
        );
      }

      console.log(`[scraper] ${INST}: ${results.length} listings (detail-enriched for ${toEnrich.length} new)`);
      return results;
    } catch (err: unknown) {
      if (err instanceof SiteHttpError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[scraper] ${INST} failed: ${msg}`);
      return [];
    }
  },
};
