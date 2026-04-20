import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText, resolveUrl } from "./utils";
import { enrichWithDetailPages } from "./detailFetcher";

const BASE = "https://techfinder.stanford.edu";
const INST = "Stanford University";
// Stanford TechFinder has ~1,895 listings across 127 pages as of 2026.
// The scraper auto-detects the real last page and caps at this constant.
const MAX_PAGES = 127;
// Parallel batch size for list-page fetching. Kept at 5 to avoid triggering
// Stanford's CDN connection throttling (10 caused scattered 20s timeouts).
const PAGE_BATCH = 5;
// Per-page timeout raised to 20s (CDN cold-start can reach ~15s).
const PAGE_TIMEOUT_MS = 20_000;

export const stanfordScraper: InstitutionScraper = {
  institution: INST,
  scraperTimeoutMs: 10 * 60 * 1000, // 10 min — headroom for slow CDN days
  async scrape(signal?: AbortSignal): Promise<ScrapedListing[]> {
    try {
      const results: ScrapedListing[] = [];
      const seen = new Set<string>();

      // Step 1: fetch page 0 with retries=2 (default) and 20s timeout.
      // Page 0 is required — if it fails the run produces 0 listings.
      const page0$ = await fetchHtml(`${BASE}/`, PAGE_TIMEOUT_MS, signal);
      if (!page0$) {
        console.warn(`[scraper] ${INST}: could not fetch listing page 0`);
        return [];
      }

      // Detect actual last page from pagination widget.
      let detectedMax = 0;
      page0$("a[href*='?page=']").each((_, el) => {
        const m = (page0$(el).attr("href") ?? "").match(/\?page=(\d+)/);
        if (m) detectedMax = Math.max(detectedMax, parseInt(m[1], 10));
      });
      const lastPage = Math.min(detectedMax || MAX_PAGES, MAX_PAGES);
      console.log(`[scraper] ${INST}: detected ${lastPage + 1} pages (pages 0–${lastPage})`);

      // Extract listings from a parsed page.
      // Uses the Drupal 11 class h3.teaser__title a — this is the dedicated
      // title anchor for technology listings and avoids picking up any nav or
      // category links that also happen to start with /technology/.
      const extractListings = ($: NonNullable<Awaited<ReturnType<typeof fetchHtml>>>): void => {
        $("h3.teaser__title a").each((_, el) => {
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
      };

      // Extract from page 0 immediately.
      extractListings(page0$);

      // Step 2: build list of remaining page URLs (1..lastPage).
      const remaining: string[] = [];
      for (let p = 1; p <= lastPage; p++) remaining.push(`${BASE}/?page=${p}`);

      // Step 3: fetch remaining pages in parallel batches of PAGE_BATCH.
      // retries=1 (2 total attempts) — one silent retry handles transient CDN
      // timeouts without slowing down fast runs.
      let skipped = 0;
      for (let i = 0; i < remaining.length; i += PAGE_BATCH) {
        if (signal?.aborted) break;
        const batch = remaining.slice(i, i + PAGE_BATCH);
        const pages = await Promise.all(batch.map((u) => fetchHtml(u, PAGE_TIMEOUT_MS, signal, 1)));
        for (const $ of pages) {
          if (!$) { skipped++; continue; }
          extractListings($);
        }
        const batchEnd = Math.min(i + PAGE_BATCH, remaining.length);
        console.log(`[scraper] ${INST}: fetched pages ${i + 1}–${batchEnd + 1} — ${results.length} listings so far`);
      }

      if (skipped > 0) {
        console.warn(`[scraper] ${INST}: ${skipped} list page(s) skipped due to timeout/error`);
      }

      console.log(`[scraper] ${INST}: ${results.length} listings total, fetching details (cap 25)...`);

      // Step 4: enrich detail pages with Drupal 11 selectors — cap 25.
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
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[scraper] ${INST} failed: ${msg}`);
      return [];
    }
  },
};
