import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText, resolveUrl, SiteHttpError } from "./utils";
import { enrichWithDetailPages } from "./detailFetcher";

const BASE = "https://tlo.mit.edu";
const INST = "MIT";
const LIST_PATH = "/industry-entrepreneurs/available-technologies";
// Do NOT add license_status filter here — it restricts to ~100 items (status "U" only)
// and cuts ~90% of the MIT TLO catalog. Probed 2026-04-21: without filter the catalog
// has 800+ listings across 40+ pages of 20 items each; all statuses (available,
// negotiating, licensed, etc.) are useful for discovery. Status labels are enriched
// from detail pages by enrichWithDetailPages below.
const LIST_FILTER = "search_api_fulltext=";

// How many pages to probe in parallel per window.
// MIT TLO has 50+ pages (20 items/page, ~1000 listings) — multiple windows will fire.
// The global semaphore already caps concurrent HTTP requests, so a large window
// does not overwhelm the target — it just queues within that semaphore pool.
const PAGE_WINDOW = 20;

// Per-page timeout: 15s is generous; TLO CDN cold-start rarely exceeds 8s.
const PAGE_TIMEOUT_MS = 15_000;

export const mitScraper: InstitutionScraper = {
  institution: INST,
  async scrape(signal?: AbortSignal): Promise<ScrapedListing[]> {
    try {
      const results: ScrapedListing[] = [];
      const seen = new Set<string>();

      // Helper: extract all technology listings from a parsed page.
      // Returns the RAW row count on the page (not post-dedupe additions) so the
      // window scan can detect a genuinely empty page regardless of how many titles
      // have already been seen across prior pages.
      const extractListings = ($: NonNullable<Awaited<ReturnType<typeof fetchHtml>>>): number => {
        const rows = $(".views-row");
        rows.each((_, el) => {
          const linkEl = $(el)
            .find("a.tech-brief-teaser__link, .tech-brief-teaser__heading a, h3 a, h2 a")
            .first();
          const title = cleanText(linkEl.text());
          if (!title || seen.has(title)) return;
          seen.add(title);
          const href = linkEl.attr("href") ?? "";
          results.push({
            title,
            description: cleanText($(el).find(".tech-brief-teaser__description, p").first().text()) || title,
            url: href ? resolveUrl(BASE, href) : BASE,
            institution: INST,
          });
        });
        // Return raw DOM row count — zero means the page truly has no listings
        // (not just that everything was a duplicate of a prior page).
        return rows.length;
      };

      // Step 1: fetch page 0 synchronously — seeds the results and confirms the site is up.
      const page0Url = `${BASE}${LIST_PATH}?${LIST_FILTER}`;
      const page0$ = await fetchHtml(page0Url, PAGE_TIMEOUT_MS, signal, 2, true);
      if (!page0$) {
        console.warn(`[scraper] ${INST}: could not fetch listing page 0`);
        return [];
      }
      extractListings(page0$);
      console.log(`[scraper] ${INST}: page 0 — ${results.length} listings`);

      // Step 2: adaptive parallel window scan.
      // Launch PAGE_WINDOW pages at once. Only stop when a fetch SUCCEEDS and returns
      // zero listings — that signals we've passed the last real page.
      // Transient network failures (null returns) are counted separately and never
      // trigger an early stop; a subsequent window will still probe beyond the failure.
      // Self-terminating: no pagination detection, no preset page count.
      // EMERGENCY_CEIL is not a design limit — it's a runaway-loop guard that should
      // never be reached for any real TTO catalog.
      const EMERGENCY_CEIL = 1000;
      let offset = 1;

      while (!signal?.aborted && offset < EMERGENCY_CEIL) {
        const pageNums: number[] = [];
        for (let i = 0; i < PAGE_WINDOW && offset + i < EMERGENCY_CEIL; i++) {
          pageNums.push(offset + i);
        }

        const pages = await Promise.all(
          pageNums.map((p) =>
            fetchHtml(`${BASE}${LIST_PATH}?${LIST_FILTER}&page=${p}`, PAGE_TIMEOUT_MS, signal, 1)
          )
        );

        const countBefore = results.length;
        let hitEmpty = false;
        let fetchFails = 0;
        for (const $ of pages) {
          if (!$) {
            // Network failure — treat as unknown, not as empty page.
            // The window will still check subsequent pages.
            fetchFails++;
            continue;
          }
          if (extractListings($) === 0) {
            hitEmpty = true;
          }
        }

        const successFetches = pageNums.length - fetchFails;
        const newListings = results.length - countBefore;

        console.log(
          `[scraper] ${INST}: scanned pages ${offset}–${offset + pageNums.length - 1}` +
          ` — ${results.length} listings so far` +
          (fetchFails ? ` (${fetchFails} page(s) failed to load)` : "")
        );

        // Stop when:
        //   (a) a successful fetch returned 0 rows — genuine end of catalog, OR
        //   (b) the entire window failed — avoid infinite loop on network outage, OR
        //   (c) we got successful fetches but zero new listings — safety net for CDNs
        //       that return cached page-0 content for all ?page=N values. MIT TLO
        //       correctly serves unique content per page (verified 2026-04-21), so this
        //       guard fires only at the true end of the catalog when all titles repeat.
        if (hitEmpty || fetchFails === pageNums.length || (successFetches > 0 && newListings === 0)) break;
        offset += PAGE_WINDOW;
      }

      console.log(`[scraper] ${INST}: ${results.length} listings total, enriching details...`);

      // Step 3: enrich detail pages for listings that lack a good description.
      // MIT TLO catalog verified 2026-04-21: ~800+ listings across 40+ pages
      // (20 items/page, no filter). Cap at 1000 to stay within scrape budget.
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
      }, 1000, signal);

      console.log(`[scraper] ${INST}: complete — ${results.length} listings`);
      return results;
    } catch (err: unknown) {
      if (err instanceof SiteHttpError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[scraper] ${INST} failed: ${msg}`);
      return [];
    }
  },
};
