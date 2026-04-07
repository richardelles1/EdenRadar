import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText, resolveUrl } from "./utils";
import { enrichWithDetailPages } from "./detailFetcher";

const BASE = "https://techfinder.stanford.edu";
const INST = "Stanford University";
// Stanford TechFinder has 900+ listings; max confirmed ~127 pages as of 2026.
// Capped at 40 pages (~1,200 listings) so the scraper completes well within the
// 7-minute timeout.  The full index was seeded historically; incremental runs
// only need to pick up new or changed listings on the first few pages.
const MAX_PAGES = 40;
// Parallel batch size for list-page fetching — reduces wall-clock from ~175s to ~20s.
const PAGE_BATCH = 10;

export const stanfordScraper: InstitutionScraper = {
  institution: INST,
  scraperTimeoutMs: 7 * 60 * 1000,
  async scrape(signal?: AbortSignal): Promise<ScrapedListing[]> {
    try {
      const results: ScrapedListing[] = [];
      const seen = new Set<string>();

      // Step 1: fetch page 0, detect actual max page from pagination widget
      const page0$ = await fetchHtml(`${BASE}/`, 12_000, signal);
      if (!page0$) {
        console.warn(`[scraper] ${INST}: could not fetch listing page 0`);
        return [];
      }

      let detectedMax = 0;
      page0$("a[href*='?page=']").each((_, el) => {
        const m = (page0$(el).attr("href") ?? "").match(/\?page=(\d+)/);
        if (m) detectedMax = Math.max(detectedMax, parseInt(m[1], 10));
      });
      const lastPage = Math.min(detectedMax || MAX_PAGES, MAX_PAGES);
      console.log(`[scraper] ${INST}: detected ${lastPage + 1} pages (pages 0–${lastPage})`);

      // Extract listings from a parsed page
      const extractListings = ($: NonNullable<Awaited<ReturnType<typeof fetchHtml>>>): void => {
        $("a[href]").each((_, el) => {
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
      }

      // Extract from page 0 immediately
      extractListings(page0$);

      // Step 2: build list of remaining page URLs (1..lastPage)
      const remaining: string[] = [];
      for (let p = 1; p <= lastPage; p++) remaining.push(`${BASE}/?page=${p}`);

      // Step 3: fetch remaining pages in parallel batches of PAGE_BATCH
      for (let i = 0; i < remaining.length; i += PAGE_BATCH) {
        if (signal?.aborted) break;
        const batch = remaining.slice(i, i + PAGE_BATCH);
        // retries=0: list pages run 10-wide in parallel so per-page retry is
        // unnecessary; failed pages are simply skipped and re-scraped next cycle.
        const pages = await Promise.all(batch.map((u) => fetchHtml(u, 12_000, signal, 0)));
        for (const $ of pages) {
          if (!$) continue;
          extractListings($);
        }
        const batchEnd = Math.min(i + PAGE_BATCH, remaining.length);
        console.log(`[scraper] ${INST}: fetched pages ${i + 1}–${batchEnd + 1} — ${results.length} listings so far`);
      }

      console.log(`[scraper] ${INST}: ${results.length} listings total, fetching details (cap 25)...`);

      // Step 4: enrich detail pages — cap 25, pass abort signal through
      await enrichWithDetailPages(
        results,
        {
          description: [
            ".field--name-body .field__item",
            ".field--name-field-brief-description",
            ".node__content p",
            "article .content p",
          ],
          abstract: [
            ".field--name-field-abstract",
            ".field--name-field-description",
          ],
          inventors: [
            ".field--name-field-inventors .field__item",
            ".field--name-field-inventor li",
          ],
          patentStatus: [
            ".field--name-field-patent-status .field__item",
            ".field--name-field-ip-status .field__item",
          ],
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
