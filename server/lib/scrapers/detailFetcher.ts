import { load } from "cheerio";
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
  // TechPublisher platform (jhu, ucla, usf, ufl, uta, suny, princeton, czbiohub, etc.)
  // These must come first — they are the most specific and highest-signal match.
  ".c_tp_description",
  ".tech-description",
  // UC system (techtransfer.universityofcalifornia.edu)
  ".ncd-data",
  ".ncd-main-right-panel",
  // Drupal/standard TTO themes
  ".field--name-body",
  ".field--body",
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

        if (selectors.categories && (!listing.categories || listing.categories.length === 0)) {
          const catEls: string[] = [];
          for (const sel of selectors.categories) {
            $(sel).each((_, el) => {
              const t = cleanText($(el).text());
              if (t && t.length > 1) catEls.push(t);
            });
            if (catEls.length > 0) break;
          }
          if (catEls.length > 0) listing.categories = catEls;
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

// ---------------------------------------------------------------------------
// TechPublisher-specific structured extraction
// ---------------------------------------------------------------------------
// Three-pass per-page strategy: (1) JSON data island — script[type=application/json]
// and __NEXT_DATA__; (2) TechPublisher HTML conventions — type=i inventor anchors,
// meta keywords, mailto; (3) CSS-selector fallbacks (#inventorLinks etc.).
// Fetches for both thin listings and listings missing inventors.

const TP_CONCURRENCY = 5;
const TP_TIMEOUT = 14_000;

// Matches TechPublisher reference numbers in body text, e.g. "URV Reference Number: 1-18137".
const TP_REF_RE =
  /(?:Reference\s*(?:Number|No\.?)|Docket\s*(?:Number|No\.?)|Case\s*(?:Number|No\.?))[\s:]+([A-Z0-9][\w\-\/\.]{1,30})/i;

/** Structured fields that may be extracted from a JSON data island. */
interface TpJsonIsland {
  inventors?: string[];
  patentStatus?: string;
  licensingStatus?: string;
  technologyId?: string;
  categories?: string[];
  description?: string;
  abstract?: string;
}

/**
 * Pass 1 — try to extract structured fields from embedded JSON.
 * Checks <script type="application/json"> tags and __NEXT_DATA__ (Next.js).
 * Returns an empty object when no usable JSON is found.
 */
function parseTechPublisherJsonIsland(
  html: string,
  $: ReturnType<typeof load>,
): TpJsonIsland {
  const result: TpJsonIsland = {};

  function applyJsonObject(data: Record<string, unknown>): boolean {
    let found = false;

    // Inventor field name variants used by different TechPublisher versions.
    const invRaw =
      data["inventors"] ?? data["Inventors"] ?? data["inventorNames"] ??
      data["inventor_list"] ?? data["inventorList"];
    if (Array.isArray(invRaw) && invRaw.length > 0) {
      result.inventors = (invRaw as unknown[])
        .map((i) => (typeof i === "string" ? i : (i as Record<string,string>)?.name ?? ""))
        .filter((s) => s.length > 2);
      if (result.inventors.length > 0) found = true;
    }

    const psRaw = data["patentStatus"] ?? data["patent_status"] ??
      data["PatentStatus"] ?? data["ipStatus"];
    if (typeof psRaw === "string" && psRaw) { result.patentStatus = psRaw; found = true; }

    const lsRaw = data["licensingStatus"] ?? data["licensing_status"] ??
      data["LicensingStatus"];
    if (typeof lsRaw === "string" && lsRaw) { result.licensingStatus = lsRaw; found = true; }

    const tidRaw =
      data["technologyId"] ?? data["technology_id"] ?? data["caseNumber"] ??
      data["docketNumber"] ?? data["referenceNumber"];
    if (typeof tidRaw === "string" && tidRaw) { result.technologyId = tidRaw; found = true; }

    const catsRaw = data["categories"] ?? data["Keywords"] ?? data["keywords"] ?? data["tags"];
    if (Array.isArray(catsRaw) && catsRaw.length > 0) {
      result.categories = (catsRaw as unknown[]).map((c) => String(c)).filter((s) => s.length > 0);
      if (result.categories.length > 0) found = true;
    }

    return found;
  }

  // 1a. <script type="application/json"> embedded data blobs — scan all of them
  //     so non-inventor fields (patentStatus, technologyId, etc.) are captured
  //     even when inventors are found in an earlier script tag.
  $('script[type="application/json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).text()) as Record<string, unknown>;
      if (data && typeof data === "object") applyJsonObject(data);
    } catch {}
  });

  // 1b. __NEXT_DATA__ (Next.js SPA shell) — dehydrated query state.
  // Always attempted to pick up non-inventor structured fields regardless
  // of whether Pass 1a already found inventors.
  const ndm = NEXT_DATA_RE.exec(html);
  if (ndm) {
    try {
      const nd = JSON.parse(ndm[1]) as Record<string, unknown>;
      const queries: Record<string, unknown>[] =
        (((nd?.props as Record<string, unknown>)?.pageProps as Record<string, unknown>)
          ?.dehydratedState as Record<string, unknown>)?.queries as Record<string, unknown>[] ?? [];
      for (const q of queries) {
        const data = (q?.state as Record<string, unknown>)?.data as Record<string, unknown>;
        if (!data) continue;
        if (applyJsonObject(data)) break;
        const details = data?.details as Record<string, unknown>;
        if (details && applyJsonObject(details)) break;
      }
    } catch {}
  }

  return result;
}

export async function enrichTechPublisherListings(
  results: ScrapedListing[],
  signal?: AbortSignal,
): Promise<void> {
  const toEnrich = results.filter(
    (l) =>
      !l.description ||
      l.description === l.title ||
      l.description.length < 30 ||
      !l.inventors ||
      l.inventors.length === 0,
  );
  if (toEnrich.length === 0) return;

  const enrich = async (listing: ScrapedListing): Promise<void> => {
    try {
      const timeout = signal
        ? AbortSignal.any([signal, AbortSignal.timeout(TP_TIMEOUT)])
        : AbortSignal.timeout(TP_TIMEOUT);

      const res = await fetch(listing.url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; EdenRadar/2.0)" },
        signal: timeout,
      });
      if (!res.ok) return;
      const html = await res.text();
      if (html.length < 500) return;

      const $ = load(html);

      // ── Pass 1: JSON data island ──────────────────────────────────────────
      const island = parseTechPublisherJsonIsland(html, $);

      if ((!listing.inventors || listing.inventors.length === 0) && island.inventors && island.inventors.length > 0)
        listing.inventors = island.inventors;
      if (!listing.patentStatus && island.patentStatus)
        listing.patentStatus = island.patentStatus.slice(0, 200);
      if (!listing.licensingStatus && island.licensingStatus)
        listing.licensingStatus = island.licensingStatus.slice(0, 200);
      if (!listing.technologyId && island.technologyId)
        listing.technologyId = island.technologyId.slice(0, 100);
      if ((!listing.categories || listing.categories.length === 0) && island.categories)
        listing.categories = island.categories;

      // ── Pass 2: TechPublisher HTML conventions ────────────────────────────
      // Inventor links: each inventor is an anchor whose href contains `type=i`.
      if (!listing.inventors || listing.inventors.length === 0) {
        const inventors: string[] = [];
        $('a[href*="type=i"]').each((_, el) => {
          const name = cleanText($(el).text());
          if (name && name.length > 2) inventors.push(name);
        });
        if (inventors.length > 0) listing.inventors = inventors;
      }

      // Categories: <meta name="keywords"> (machine-readable, preferred)
      // or type=c anchor links (fallback).
      if (!listing.categories || listing.categories.length === 0) {
        const kwContent = $('meta[name="keywords"]').attr("content");
        if (kwContent) {
          const cats = kwContent.split(",").map((c) => c.trim()).filter((c) => c.length > 0);
          if (cats.length > 0) listing.categories = cats;
        }
        if (!listing.categories || listing.categories.length === 0) {
          const catEls: string[] = [];
          $('a[href*="type=c"]').each((_, el) => {
            const t = cleanText($(el).text());
            if (t && t.length > 1) catEls.push(t);
          });
          if (catEls.length > 0) listing.categories = catEls;
        }
      }

      // Contact email.
      if (!listing.contactEmail) {
        const href = $('a[href^="mailto:"]').first().attr("href");
        if (href) listing.contactEmail = href.replace(/^mailto:/i, "").trim().slice(0, 200);
      }

      // ── Pass 3: Generic CSS selectors (last-resort fallback) ──────────────
      // Inventors.
      if (!listing.inventors || listing.inventors.length === 0) {
        const cssInvSels = [
          "#inventorLinks",
          ".field--name-field-inventors li",
          ".field--name-field-inventors .field__item",
          ".inventors li",
          ".inventor-name",
        ];
        for (const sel of cssInvSels) {
          const invs: string[] = [];
          $(sel).each((_, el) => {
            const t = cleanText($(el).text());
            if (t && t.length > 2) invs.push(t);
          });
          if (invs.length > 0) { listing.inventors = invs; break; }
        }
      }

      // Description.
      if (!listing.description || listing.description.length < 30) {
        const descSels = [
          ".c_tp_description", ".tech-description",
          ".field--name-body .field__item", ".field--name-body",
          ".technology-listing-description", "#field-description",
          ".views-field-body .field-content", ".tech-detail__description",
          ".technology-description", "#description", ".description",
          "article .content", ".entry-content", "main p",
        ];
        for (const sel of descSels) {
          const text = cleanText($(sel).text());
          if (text && text.length > 30) { listing.description = text.slice(0, 5_000); break; }
        }
      }

      // Abstract.
      if (!listing.abstract) {
        const absSels = [
          ".field--name-field-abstract .field__item", ".field--name-field-abstract",
          ".abstract", "#abstract",
        ];
        for (const sel of absSels) {
          const text = cleanText($(sel).text());
          if (text && text.length > 20) { listing.abstract = text.slice(0, 5_000); break; }
        }
      }

      // Technology ID.
      if (!listing.technologyId) {
        const tidSels = [".field--name-field-technology-id .field__item", ".tech-id", ".docket-number"];
        for (const sel of tidSels) {
          const text = cleanText($(sel).text());
          if (text) { listing.technologyId = text.slice(0, 100); break; }
        }
        if (!listing.technologyId) {
          const m = TP_REF_RE.exec(html);
          if (m && m[1] && m[1].length < 40) listing.technologyId = m[1].trim();
        }
      }

      // Patent status.
      if (!listing.patentStatus) {
        const psSels = [
          ".c_tp_patent", ".field--name-field-patent-status .field__item", ".patent-status",
        ];
        for (const sel of psSels) {
          const text = cleanText($(sel).text());
          if (text) { listing.patentStatus = text.slice(0, 200); break; }
        }
      }

      // Licensing status.
      if (!listing.licensingStatus) {
        const lsSels = [
          ".field--name-field-licensing-status .field__item", ".licensing-status",
        ];
        for (const sel of lsSels) {
          const text = cleanText($(sel).text());
          if (text) { listing.licensingStatus = text.slice(0, 200); break; }
        }
      }
    } catch {
      // silently skip failed pages
    }
  };

  for (let i = 0; i < toEnrich.length; i += TP_CONCURRENCY) {
    if (signal?.aborted) break;
    await Promise.allSettled(toEnrich.slice(i, i + TP_CONCURRENCY).map(enrich));
  }
}
