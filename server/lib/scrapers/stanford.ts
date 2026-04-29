import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText, resolveUrl, SiteHttpError } from "./utils";
import { enrichWithDetailPages } from "./detailFetcher";

const BASE = "https://techfinder.stanford.edu";
const INST = "Stanford University";
// Parallel batch size for list-page fetching. Reduced to 2: CDN cache sharding
// causes specific page numbers to consistently take 10-12s even sequentially
// (confirmed: page 7=10.4s, page 9=10.1s). Smaller batches reduce the chance
// of two cold-cache pages colliding in the same parallel slot.
const PAGE_WINDOW = 2;
// Per-page timeout raised to 30s: cold-cache pages hit 10-12s sequentially;
// with PAGE_WINDOW=2 and mild parallel load they may reach ~15-20s.
// 30s gives comfortable headroom. 75 batches × avg 5s = ~375s total — well
// within the 20-min scraperTimeoutMs.
const PAGE_TIMEOUT_MS = 30_000;

export const stanfordScraper: InstitutionScraper = {
  institution: INST,
  scraperTimeoutMs: 20 * 60 * 1000, // 20 min — manual syncs; CDN worst-case is ~320s list scan
  async scrape(signal?: AbortSignal): Promise<ScrapedListing[]> {
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
      // Uses the Drupal 11 class h3.teaser__title a — this is the dedicated
      // title anchor for technology listings and avoids picking up any nav or
      // category links that also happen to start with /technology/.
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
      // EMERGENCY_CEIL is a runaway-loop guard only.
      // Stanford has ~100-150 list pages × 30s worst-case = well within the 20-min limit.
      const EMERGENCY_CEIL = 500;
      // Stop only after this many consecutive batches where EVERY page failed.
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
          // Every page in the batch failed — possible full CDN block.
          consecutiveFullFails++;
          if (consecutiveFullFails >= CDN_BLOCK_CEIL) {
            console.warn(
              `[scraper] ${INST}: ${CDN_BLOCK_CEIL} consecutive all-fail batches — CDN blocking, stopping early`
            );
            break;
          }
        } else {
          consecutiveFullFails = 0; // partial failures are sporadic, reset counter
        }

        offset += PAGE_WINDOW;
      }

      if (skipped > 0) {
        console.warn(`[scraper] ${INST}: ${skipped} list page(s) skipped due to timeout/error`);
      }

      console.log(`[scraper] ${INST}: ${results.length} listings total, fetching details (cap 25)...`);

      // Step 3: enrich detail pages with Drupal 11 selectors — cap 25.
      // Confirmed selectors on live pages (Drupal 11 upgrade, Apr 2026):
      //   description/abstract: .docket__text (main body container)
      //   inventors: .docket__related-people a (Innovators section links)
      //   patentStatus: no longer a structured field — removed
      await enrichWithDetailPages(
        results,
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
        25,
        signal
      );

      console.log(`[scraper] ${INST}: ${results.length} listings (detail-enriched)`);
      return results;
    } catch (err: unknown) {
      if (err instanceof SiteHttpError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[scraper] ${INST} failed: ${msg}`);
      return [];
    }
  },
};
