import type { InstitutionScraper, ScrapedListing } from "./types";
import { cleanText } from "./utils";

const INST = "Case Western Reserve University";
const BASE = "https://case.flintbox.com";
const ORG_ID = 58;
const ACCESS_KEY = "a1712fca-3f6b-4805-8024-9846e4c13a10";

interface FlintboxAttr {
  uuid?: string;
  name?: string;
  keyPoint1?: string;
  keyPoint2?: string;
  keyPoint3?: string;
  publishedOn?: string;
}

interface FlintboxTech {
  id?: string;
  type?: string;
  attributes?: FlintboxAttr;
}

interface FlintboxMeta {
  totalPages?: number;
  currentPage?: number;
  nextPage?: number | null;
}

interface FlintboxResponse {
  data?: FlintboxTech[];
  meta?: FlintboxMeta;
}

export const cwruScraper: InstitutionScraper = {
  institution: INST,
  async scrape(): Promise<ScrapedListing[]> {
    const results: ScrapedListing[] = [];
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages) {
      const url =
        `${BASE}/api/v1/technologies` +
        `?organizationId=${ORG_ID}` +
        `&organizationAccessKey=${ACCESS_KEY}` +
        `&page=${page}` +
        `&query=`;

      try {
        const res = await fetch(url, {
          headers: {
            Accept: "application/json",
            "X-Requested-With": "XMLHttpRequest",
            "User-Agent": "Mozilla/5.0",
          },
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) {
          console.error(`[scraper] ${INST}: API returned ${res.status} on page ${page}`);
          break;
        }
        const json: FlintboxResponse = await res.json();
        totalPages = json.meta?.totalPages ?? 1;

        for (const item of json.data ?? []) {
          const attrs = item.attributes;
          if (!attrs) continue;
          const title = cleanText(attrs.name ?? "");
          if (!title || title.length < 5) continue;
          const uuid = attrs.uuid ?? item.id ?? "";
          const techUrl = uuid ? `${BASE}/technologies/${uuid}` : `${BASE}/technologies`;
          const keyPoints = (
            [attrs.keyPoint1, attrs.keyPoint2, attrs.keyPoint3] as Array<string | undefined>
          )
            .filter((s): s is string => typeof s === "string" && s.length > 0)
            .map((s) => cleanText(s))
            .filter((s) => s.length > 0)
            .join(" ");

          results.push({
            title,
            description: keyPoints,
            url: techUrl,
            institution: INST,
            publishedDate: attrs.publishedOn,
          });
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[scraper] ${INST}: fetch error on page ${page}: ${msg}`);
        break;
      }
      page++;
    }

    console.log(`[scraper] ${INST}: ${results.length} listings via Flintbox API (pages: ${page - 1}/${totalPages})`);
    return results;
  },
};
