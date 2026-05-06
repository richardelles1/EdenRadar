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
// TechPublisher is a classic ASP.NET WebForms platform used by ~70 institutions
// (Rochester, Tufts, Brown, Princeton, all UC campuses, etc.). It does NOT embed
// a JSON data island — there is no `__NEXT_DATA__` or `application/json` script.
//
// All rich fields are present in the **static HTML**:
//   • Inventors  — <a href="...type=i">Inventor Name</a>  (one anchor per person)
//   • Categories — <meta name="keywords" content="Cat1, Cat2"> (preferred)
//                  OR <a href="...type=c">Category</a> (fallback)
//   • Contact    — <a href="mailto:..."> (first mailto link)
//   • Tech ID    — reference-number pattern in page text (e.g. "1-18137")
//   • Description — .c_tp_description  (most reliable class across deployments)
//
// This function mirrors the pattern of enrichInPartListings: a dedicated
// structured-extraction pass for a known platform, using its native HTML
// conventions rather than generic CSS-selector guessing.
// ---------------------------------------------------------------------------

const TP_CONCURRENCY = 5;
const TP_TIMEOUT = 14_000;

// Matches TechPublisher reference numbers embedded as plain text, e.g.
// "URV Reference Number: 1-18137" or "Case No. 2024-ABC-001".
const TP_REF_RE =
  /(?:Reference\s*(?:Number|No\.?)|Docket\s*(?:Number|No\.?)|Case\s*(?:Number|No\.?))[\s:]+([A-Z0-9][\w\-\/\.]{1,30})/i;

export async function enrichTechPublisherListings(
  results: ScrapedListing[],
  signal?: AbortSignal,
): Promise<void> {
  const toEnrich = results.filter(
    (l) => !l.description || l.description === l.title || l.description.length < 30,
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

      // 1. Inventors — each inventor is a static anchor with `type=i` in the href.
      //    This is TechPublisher's own link convention; it never requires JS.
      if (!listing.inventors || listing.inventors.length === 0) {
        const inventors: string[] = [];
        $('a[href*="type=i"]').each((_, el) => {
          const name = cleanText($(el).text());
          if (name && name.length > 2) inventors.push(name);
        });
        if (inventors.length > 0) listing.inventors = inventors;
      }

      // 2. Categories — prefer the `<meta name="keywords">` tag (machine-readable,
      //    comma-separated); fall back to `type=c` category anchor links.
      if (!listing.categories || listing.categories.length === 0) {
        const kwContent = $('meta[name="keywords"]').attr("content");
        if (kwContent) {
          const cats = kwContent.split(",").map((c) => c.trim()).filter((c) => c.length > 0);
          if (cats.length > 0) {
            listing.categories = cats;
          }
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

      // 3. Contact email — first mailto link on the page.
      if (!listing.contactEmail) {
        const href = $('a[href^="mailto:"]').first().attr("href");
        if (href) listing.contactEmail = href.replace(/^mailto:/i, "").trim().slice(0, 200);
      }

      // 4. Description — TechPublisher-specific class hierarchy.
      if (!listing.description || listing.description.length < 30) {
        const descSelectors = [
          ".c_tp_description",
          ".tech-description",
          ".field--name-body .field__item",
          ".field--name-body",
          ".technology-listing-description",
          "#field-description",
          ".views-field-body .field-content",
          ".tech-detail__description",
          ".technology-description",
          "#description",
          ".description",
          "article .content",
          ".entry-content",
          "main p",
        ];
        for (const sel of descSelectors) {
          const text = cleanText($(sel).text());
          if (text && text.length > 30) {
            listing.description = text.slice(0, 5_000);
            break;
          }
        }
      }

      // 5. Abstract.
      if (!listing.abstract) {
        const absSelectors = [
          ".field--name-field-abstract .field__item",
          ".field--name-field-abstract",
          ".abstract",
          "#abstract",
        ];
        for (const sel of absSelectors) {
          const text = cleanText($(sel).text());
          if (text && text.length > 20) {
            listing.abstract = text.slice(0, 5_000);
            break;
          }
        }
      }

      // 6. Technology ID — try CSS selectors first, then regex on raw HTML.
      if (!listing.technologyId) {
        const tidSelectors = [
          ".field--name-field-technology-id .field__item",
          ".tech-id",
          ".docket-number",
        ];
        for (const sel of tidSelectors) {
          const text = cleanText($(sel).text());
          if (text) { listing.technologyId = text.slice(0, 100); break; }
        }
        if (!listing.technologyId) {
          const m = TP_REF_RE.exec(html);
          if (m && m[1] && m[1].length < 40) listing.technologyId = m[1].trim();
        }
      }

      // 7. Patent / licensing status — CSS selectors only (no reliable text pattern).
      if (!listing.patentStatus) {
        const psSels = [
          ".c_tp_patent",
          ".field--name-field-patent-status .field__item",
          ".patent-status",
        ];
        for (const sel of psSels) {
          const text = cleanText($(sel).text());
          if (text) { listing.patentStatus = text.slice(0, 200); break; }
        }
      }

      if (!listing.licensingStatus) {
        const lsSels = [
          ".field--name-field-licensing-status .field__item",
          ".licensing-status",
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
