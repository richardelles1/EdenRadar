import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText, resolveUrl } from "./utils";
import { enrichWithDetailPages } from "./detailFetcher";

const BASE = "https://tlo.mit.edu";
const INST = "MIT";
const LIST_PATH = "/industry-entrepreneurs/available-technologies";
const LIST_FILTER = "search_api_fulltext=&license_status%5BU%5D=U";
// Safety ceiling — TLO has ~80-100 pages as of 2026. Raised to 150 to handle growth.
const MAX_PAGES = 150;
// Parallel batch size for list-page fetching.
// 5 concurrent requests avoids CDN rate-limiting while cutting sequential time ~5x.
const PAGE_BATCH = 5;
// Per-page timeout: 15s is enough for TLO; CDN cold-start rarely exceeds 10s.
const PAGE_TIMEOUT_MS = 15_000;

export const mitScraper: InstitutionScraper = {
  institution: INST,
  scraperTimeoutMs: 8 * 60 * 1000, // 8 min — headroom for slow CDN days
  async scrape(signal?: AbortSignal): Promise<ScrapedListing[]> {
    try {
      const results: ScrapedListing[] = [];
      const seen = new Set<string>();

      // Step 1: fetch page 0 — required to detect actual page count.
      const page0Url = `${BASE}${LIST_PATH}?${LIST_FILTER}`;
      const page0$ = await fetchHtml(page0Url, PAGE_TIMEOUT_MS, signal);
      if (!page0$) {
        console.warn(`[scraper] ${INST}: could not fetch listing page 0`);
        return [];
      }

      // Detect actual last page from pagination widget.
      // MIT's pagination links contain &page=N (alongside the filter params).
      let detectedMax = 0;
      page0$("a[href*='page=']").each((_, el) => {
        const m = (page0$(el).attr("href") ?? "").match(/[?&]page=(\d+)/);
        if (m) detectedMax = Math.max(detectedMax, parseInt(m[1], 10));
      });
      const lastPage = Math.min(detectedMax || MAX_PAGES, MAX_PAGES);
      console.log(`[scraper] ${INST}: detected ${lastPage + 1} pages (pages 0–${lastPage})`);

      // Helper: extract all technology listings from a parsed page.
      const extractListings = ($: NonNullable<Awaited<ReturnType<typeof fetchHtml>>>): void => {
        $(".views-row").each((_, el) => {
          const linkEl = $(el)
            .find("a.tech-brief-teaser__link, .tech-brief-teaser__heading a, h3 a, h2 a")
            .first();
          const title = cleanText(linkEl.text());
          if (!title || title.length < 5 || seen.has(title)) return;
          seen.add(title);
          const href = linkEl.attr("href") ?? "";
          results.push({
            title,
            description: cleanText($(el).find(".tech-brief-teaser__description, p").first().text()) || title,
            url: href ? resolveUrl(BASE, href) : BASE,
            institution: INST,
          });
        });
      };

      // Extract from page 0 immediately.
      extractListings(page0$);

      // Step 2: build remaining page URLs (1..lastPage).
      const remaining: string[] = [];
      for (let p = 1; p <= lastPage; p++) {
        remaining.push(`${BASE}${LIST_PATH}?${LIST_FILTER}&page=${p}`);
      }

      // Step 3: fetch remaining pages in parallel batches of PAGE_BATCH.
      // retries=1 (2 total attempts) — one silent retry handles transient CDN blips.
      let skipped = 0;
      for (let i = 0; i < remaining.length; i += PAGE_BATCH) {
        if (signal?.aborted) break;
        const batch = remaining.slice(i, i + PAGE_BATCH);
        const pages = await Promise.all(
          batch.map((u) => fetchHtml(u, PAGE_TIMEOUT_MS, signal, 1))
        );
        for (const $ of pages) {
          if (!$) { skipped++; continue; }
          extractListings($);
        }
        const batchEnd = Math.min(i + PAGE_BATCH, remaining.length);
        console.log(`[scraper] ${INST}: fetched pages ${i + 1}–${batchEnd} — ${results.length} listings so far`);
      }

      if (skipped > 0) {
        console.warn(`[scraper] ${INST}: ${skipped} list page(s) skipped due to timeout/error`);
      }

      console.log(`[scraper] ${INST}: ${results.length} listings total, fetching details (cap 100)...`);

      // Step 4: enrich detail pages.
      await enrichWithDetailPages(results, {
        description: [
          ".tech-brief-body__inner",
          ".paragraphs-body",
          ".field--name-body .field__item",
          ".node__content p",
        ],
        abstract: [
          ".tech-brief-header__details",
          ".field--name-field-abstract",
        ],
        inventors: [
          ".tech-brief-details__researchers-list a",
          ".tech-brief-details__researchers-list span",
          ".field--name-field-inventors li",
        ],
        patentStatus: [
          ".tech-brief-details__ip .accordion__content",
          ".field--name-field-patent-status",
        ],
      }, 100, signal);

      console.log(`[scraper] ${INST}: ${results.length} listings (detail-enriched)`);
      return results;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[scraper] ${INST} failed: ${msg}`);
      return [];
    }
  },
};
