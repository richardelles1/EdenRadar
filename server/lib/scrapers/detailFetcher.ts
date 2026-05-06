import type { ScrapedListing } from "./types";
import { fetchHtml, cleanText, extractText } from "./utils";

const NEXT_DATA_RE = /<script id="__NEXT_DATA__"[^>]*>([\s\S]+?)<\/script>/;

const DETAIL_CONCURRENCY = 5;
const DETAIL_TIMEOUT = 12_000;
const DETAIL_BATCH_LIMIT = 500;

export interface DetailSelectors {
  description?: string[];
  abstract?: string[];
  inventors?: string[];
  patentStatus?: string[];
  licensingStatus?: string[];
  categories?: string[];
  contactEmail?: string[];
  technologyId?: string[];
}

/** Flat list of CSS selectors for extracting the main description/abstract text
 * from a TTO detail page. Exported so the admin retroactive re-fetch job can
 * reuse the same selector set without duplicating it. */
export const DESCRIPTION_SELECTORS: string[] = [
  ".field--name-body",
  ".tech-detail__description",
  ".technology-description",
  "#description",
  ".description",
  "article .content",
  ".entry-content",
  "main p",
  ".field--name-field-abstract",
  ".tech-detail__abstract",
  ".technology-abstract",
  "#abstract",
  ".abstract",
];

const DEFAULT_SELECTORS: DetailSelectors = {
  description: [
    ".field--name-body",
    ".tech-detail__description",
    ".technology-description",
    "#description",
    ".description",
    "article .content",
    ".entry-content",
    "main p",
  ],
  abstract: [
    ".field--name-field-abstract",
    ".tech-detail__abstract",
    ".technology-abstract",
    "#abstract",
    ".abstract",
  ],
  inventors: [
    ".field--name-field-inventors",
    ".tech-detail__inventors",
    ".inventors li",
    ".inventor-name",
  ],
  patentStatus: [
    ".field--name-field-patent-status",
    ".patent-status",
    ".ip-status",
  ],
};

/**
 * Fetches InPart detail pages and extracts tech descriptions from __NEXT_DATA__.
 * InPart portals are Next.js SPAs; CSS selectors return nothing. The tech
 * description lives at: queries[0].state.data.details.{precis, contentV2}.
 */
export async function enrichInPartListings(
  results: ScrapedListing[],
  concurrency = 5,
): Promise<void> {
  const toEnrich = results.filter(
    (r) => !r.description || r.description.length < 30,
  );
  if (toEnrich.length === 0) return;

  const enrich = async (listing: ScrapedListing): Promise<void> => {
    try {
      const res = await fetch(listing.url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; EdenRadar/2.0)" },
        signal: AbortSignal.timeout(DETAIL_TIMEOUT),
      });
      if (!res.ok) return;
      const html = await res.text();
      if (html.length < 1_000) return;

      const m = NEXT_DATA_RE.exec(html);
      if (!m) return;

      const nd = JSON.parse(m[1]);
      const queries: any[] =
        nd?.props?.pageProps?.dehydratedState?.queries ?? [];
      if (queries.length === 0) return;

      const data: any = queries[0]?.state?.data;
      if (!data) return;
      const details: any = data.details ?? {};

      const precis =
        typeof details.precis === "string" ? details.precis.trim() : "";

      let bodyText = "";
      if (Array.isArray(details.contentV2)) {
        bodyText = (details.contentV2 as any[])
          .map((block: any) =>
            typeof block.value === "string"
              ? block.value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
              : "",
          )
          .filter((s: string) => s.length > 0)
          .join(" ")
          .slice(0, 1_000);
      }

      const description = precis || bodyText;
      if (description.length >= 30) {
        listing.description = description.slice(0, 1_000);
      }
    } catch {
      // silently skip
    }
  };

  for (let i = 0; i < toEnrich.length; i += concurrency) {
    await Promise.allSettled(
      toEnrich.slice(i, i + concurrency).map(enrich),
    );
  }
}

export async function enrichWithDetailPages(
  listings: ScrapedListing[],
  selectors: DetailSelectors = DEFAULT_SELECTORS,
  maxDetail = DETAIL_BATCH_LIMIT,
  signal?: AbortSignal,
  minDescLength = 30
): Promise<ScrapedListing[]> {
  const needsDetail = listings.filter(
    (l) => !l.description || l.description === l.title || l.description.length < minDescLength
  );

  const toFetch = needsDetail.slice(0, maxDetail);
  if (toFetch.length === 0) return listings;

  let idx = 0;

  async function worker() {
    while (idx < toFetch.length) {
      if (signal?.aborted) break;
      const listing = toFetch[idx++];
      if (!listing) continue;
      try {
        const $ = await fetchHtml(listing.url, DETAIL_TIMEOUT, signal, 1);
        if (!$) continue;

        if (selectors.description) {
          const desc = extractText($, selectors.description);
          if (desc && desc.length > 30) listing.description = desc.slice(0, 5000);
        }

        if (selectors.abstract) {
          const abs = extractText($, selectors.abstract);
          if (abs && abs.length > 20) listing.abstract = abs.slice(0, 5000);
        }

        if (selectors.inventors) {
          const inventorEls: string[] = [];
          for (const sel of selectors.inventors) {
            $(sel).each((_, el) => {
              const t = cleanText($(el).text());
              if (t && t.length > 2) inventorEls.push(t);
            });
            if (inventorEls.length > 0) break;
          }
          if (inventorEls.length > 0) listing.inventors = inventorEls;
        }

        if (selectors.patentStatus) {
          const ps = extractText($, selectors.patentStatus);
          if (ps) listing.patentStatus = ps.slice(0, 200);
        }

        if (selectors.licensingStatus) {
          const ls = extractText($, selectors.licensingStatus);
          if (ls) listing.licensingStatus = ls.slice(0, 200);
        }

        if (selectors.technologyId) {
          const tid = extractText($, selectors.technologyId);
          if (tid) listing.technologyId = tid.slice(0, 100);
        }

        if (selectors.contactEmail) {
          const email = extractText($, selectors.contactEmail);
          if (email) listing.contactEmail = email.slice(0, 200);
        }
      } catch {}
    }
  }

  const workers = Array.from(
    { length: Math.min(DETAIL_CONCURRENCY, toFetch.length) },
    worker
  );
  await Promise.all(workers);

  return listings;
}
