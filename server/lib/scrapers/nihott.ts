import type { InstitutionScraper, ScrapedListing } from "./types";

const INST = "NIH Office of Technology Transfer";
const ALGOLIA_APP_ID = "WEXCESI5EU";
const ALGOLIA_API_KEY = "3986149b687b8f20e2468432f329f08c";
const ALGOLIA_INDEX = "ott";
const ALGOLIA_URL = `https://${ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/${ALGOLIA_INDEX}/query`;
const BASE_URL = "https://techtransfer.nih.gov";
const HITS_PER_PAGE = 200;

interface AlgoliaHit {
  title?: string;
  body?: string;
  url?: string;
  field_therapeutic_areas?: string[];
  field_development_stages?: string[];
  field_applications?: string[];
  field_ics?: string[];
  field_data_source?: string[];
  field_collaborations?: string[];
  field_date_published?: string;
  field_inventor_names?: string[];
  field_patent_statuses?: string[];
  field_inventor_emails?: string[];
  objectID?: string;
}

async function queryAlgolia(
  page: number,
  filters: string
): Promise<{ hits: AlgoliaHit[]; nbPages: number; nbHits: number }> {
  const res = await fetch(ALGOLIA_URL, {
    method: "POST",
    headers: {
      "X-Algolia-Application-Id": ALGOLIA_APP_ID,
      "X-Algolia-API-Key": ALGOLIA_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: "",
      hitsPerPage: HITS_PER_PAGE,
      page,
      filters,
      attributesToRetrieve: [
        "title", "body", "url",
        "field_therapeutic_areas", "field_development_stages",
        "field_applications", "field_ics", "field_data_source",
        "field_collaborations", "field_date_published",
        "field_inventor_names", "field_patent_statuses",
        "field_inventor_emails", "objectID",
      ],
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Algolia HTTP ${res.status}`);
  return res.json();
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();
}

function hitToListing(hit: AlgoliaHit, institution: string): ScrapedListing | null {
  const title = (hit.title ?? "").trim();
  if (!title || title.length < 5) return null;

  const rawUrl = hit.url ?? "";
  const url = rawUrl.startsWith("/") ? `${BASE_URL}${rawUrl}` : rawUrl;
  if (!url) return null;

  const description = stripHtml(hit.body ?? "").slice(0, 2000);

  return {
    title,
    description: description || title,
    url,
    institution,
    categories: [
      ...(hit.field_therapeutic_areas ?? []),
      ...(hit.field_applications ?? []),
    ].filter(Boolean),
    stage: (hit.field_development_stages ?? [])[0] ?? undefined,
    inventors: hit.field_inventor_names ?? undefined,
    patentStatus: (hit.field_patent_statuses ?? [])[0] ?? undefined,
    publishedDate: hit.field_date_published ?? undefined,
    contactEmail: (hit.field_inventor_emails ?? [])[0] ?? undefined,
    technologyId: hit.objectID ?? undefined,
  };
}

function createNihAlgoliaScraper(
  institution: string,
  filters: string
): InstitutionScraper {
  return {
    institution,
    async scrape(): Promise<ScrapedListing[]> {
      try {
        const first = await queryAlgolia(0, filters);
        console.log(`[scraper] ${institution}: Algolia reports ${first.nbHits} hits, ${first.nbPages} pages`);

        const results: ScrapedListing[] = [];
        const seen = new Set<string>();

        const processHits = (hits: AlgoliaHit[]) => {
          for (const hit of hits) {
            const listing = hitToListing(hit, institution);
            if (!listing) continue;
            const dedupKey = hit.objectID || listing.url || listing.title;
            if (seen.has(dedupKey)) continue;
            seen.add(dedupKey);
            results.push(listing);
          }
        };

        processHits(first.hits);

        for (let pg = 1; pg < first.nbPages && pg < 50; pg++) {
          try {
            const page = await queryAlgolia(pg, filters);
            processHits(page.hits);
          } catch (err: any) {
            console.warn(`[scraper] ${institution}: Algolia page ${pg} failed: ${err?.message}`);
            break;
          }
        }

        console.log(`[scraper] ${institution}: ${results.length} listings (Algolia)`);
        return results;
      } catch (err: any) {
        console.error(`[scraper] ${institution} failed: ${err?.message}`);
        return [];
      }
    },
  };
}

export const nihOttScraper = createNihAlgoliaScraper(
  INST,
  "type:tech"
);

export const nciTtcScraper = createNihAlgoliaScraper(
  "NCI Technology Transfer Center",
  'type:tech AND field_data_source:"NCI"'
);
