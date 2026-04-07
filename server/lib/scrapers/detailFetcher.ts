import type { ScrapedListing } from "./types";
import { fetchHtml, cleanText, extractText } from "./utils";

const DETAIL_CONCURRENCY = 5;
const DETAIL_TIMEOUT = 12_000;
const DETAIL_BATCH_LIMIT = 100;

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

export async function enrichWithDetailPages(
  listings: ScrapedListing[],
  selectors: DetailSelectors = DEFAULT_SELECTORS,
  maxDetail = DETAIL_BATCH_LIMIT,
  signal?: AbortSignal
): Promise<ScrapedListing[]> {
  const needsDetail = listings.filter(
    (l) => !l.description || l.description === l.title || l.description.length < 30
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
