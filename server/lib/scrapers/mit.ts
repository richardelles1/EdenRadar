import type { InstitutionScraper, ScrapedListing } from "./types";
import { fetchHtml, cleanText, resolveUrl } from "./utils";
import { enrichWithDetailPages } from "./detailFetcher";

const BASE = "https://tlo.mit.edu";
const INST = "MIT";
const LIST_PATH = "/industry-entrepreneurs/available-technologies";
const LIST_FILTER = "search_api_fulltext=&license_status%5BU%5D=U";

// How many pages to probe in parallel per window.
// MIT fits in one window (page 0 + window 1-20). Large sites need 2-3 windows.
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
      // Returns count of NEW listings added (0 means the page is effectively empty).
      const extractListings = ($: NonNullable<Awaited<ReturnType<typeof fetchHtml>>>): number => {
        let added = 0;
        $(".views-row").each((_, el) => {
          const linkEl = $(el)
            .find("a.tech-brief-teaser__link, .tech-brief-teaser__heading a, h3 a, h2 a")
            .first();
          const title = cleanText(linkEl.text());
          if (!title || seen.has(title)) return;
          seen.add(title);
          added++;
          const href = linkEl.attr("href") ?? "";
          results.push({
            title,
            description: cleanText($(el).find(".tech-brief-teaser__description, p").first().text()) || title,
            url: href ? resolveUrl(BASE, href) : BASE,
            institution: INST,
          });
        });
        return added;
      };

      // Step 1: fetch page 0 synchronously — seeds the results and confirms the site is up.
      const page0Url = `${BASE}${LIST_PATH}?${LIST_FILTER}`;
      const page0$ = await fetchHtml(page0Url, PAGE_TIMEOUT_MS, signal);
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

        console.log(
          `[scraper] ${INST}: scanned pages ${offset}–${offset + pageNums.length - 1}` +
          ` — ${results.length} listings so far` +
          (fetchFails ? ` (${fetchFails} page(s) failed to load)` : "")
        );

        // Stop only when a successful fetch confirmed there are no more listings.
        // If the entire window failed (all null) we stop to avoid spinning forever.
        if (hitEmpty || fetchFails === pageNums.length) break;
        offset += PAGE_WINDOW;
      }

      console.log(`[scraper] ${INST}: ${results.length} listings total, enriching details...`);

      // Step 3: enrich detail pages for listings that lack a good description.
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

      console.log(`[scraper] ${INST}: complete — ${results.length} listings`);
      return results;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[scraper] ${INST} failed: ${msg}`);
      return [];
    }
  },
};
