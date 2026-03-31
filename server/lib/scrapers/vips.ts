/**
 * VIPS (Visual Intellectual Property Search) — DOE national labs
 *
 * Platform: vips.pnnl.gov — SRS (Slykit) Angular SPA
 * API: pure HTTP, no Playwright required — guest session authentication
 *
 * Auth flow:
 *   POST /SRS/Sessions/AuthenticateGuest → .SRS.Session cookie
 *   POST /SRS/DataAdapters/Query        → {resultId, count}
 *   POST /SRS/Results/{resultId}/Values → paginated item array
 *
 * Lab coverage (Task #277):
 *   Adds 11 labs not previously in ALL_SCRAPERS. Labs already covered
 *   (Sandia, LLNL, ORNL, LBL, PNNL, LANL, ANL, INL, BNL) are excluded.
 *
 * Probe validated 2026-03-31: all 11 labs confirmed ≥1 result via direct API call.
 */

import type { InstitutionScraper, ScrapedListing } from "./types";

const BASE = "https://vips.pnnl.gov";
const DIL_GUID = "6c72f1aa-92b5-4df3-b087-b85126c08324";
const SYS_DEF_ID = 1;
const PAGE_SIZE = 100;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

const PROP_LIST = [
  { systemDefinitionId: SYS_DEF_ID, name: "Title" },
  { systemDefinitionId: SYS_DEF_ID, name: "Abstract" },
  { systemDefinitionId: SYS_DEF_ID, name: "Lab Name" },
  { systemDefinitionId: SYS_DEF_ID, name: "Type" },
  { systemDefinitionId: SYS_DEF_ID, name: "Patent Status" },
  { systemDefinitionId: SYS_DEF_ID, name: "Inventors" },
];

interface VipsItem {
  documentId: number;
  externalId?: string;
  propertyValues: Record<string, unknown>;
}

async function vipsAuth(): Promise<string> {
  const resp = await fetch(`${BASE}/SRS/Sessions/AuthenticateGuest`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": UA },
    body: "{}",
  });
  if (!resp.ok) throw new Error(`VIPS auth failed: ${resp.status}`);
  const setCookie = resp.headers.get("set-cookie") ?? "";
  const cookie = setCookie.split(";")[0].trim();
  if (!cookie) throw new Error("VIPS auth: no session cookie returned");
  return cookie;
}

async function vipsQuery(
  cookie: string,
  labNames: string[]
): Promise<{ resultId: number; count: number }> {
  // VIPS SRS query body — "Lab Name" filter accepts a single string.
  // For multiple lab names (e.g. Savannah River), we run separate queries
  // and merge results in the caller.
  const body = {
    query: {
      [DIL_GUID]: {
        "3": { "Lab Name": labNames[0] },
      },
    },
  };
  const resp = await fetch(`${BASE}/SRS/DataAdapters/Query`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": UA, Cookie: cookie },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`VIPS query failed: ${resp.status}`);
  const data = (await resp.json()) as { resultId: number; count: number };
  return data;
}

async function vipsFetchPage(
  cookie: string,
  resultId: number,
  startIndex: number,
  maxValues: number
): Promise<VipsItem[]> {
  const resp = await fetch(`${BASE}/SRS/Results/${resultId}/Values`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": UA, Cookie: cookie },
    body: JSON.stringify({ propertyList: PROP_LIST, parameters: { startIndex, maxValues } }),
  });
  if (!resp.ok) return [];
  const data = await resp.json();
  return Array.isArray(data) ? (data as VipsItem[]) : [];
}

function mapItem(item: VipsItem, institution: string): ScrapedListing {
  const v = item.propertyValues ?? {};
  const title = String(v["Title"] ?? "").trim();
  const description = String(v["Abstract"] ?? "").trim();
  const type = String(v["Type"] ?? "").trim();
  const patentStatus = String(v["Patent Status"] ?? "").trim();
  const inventorsRaw = v["Inventors"];
  const inventors = Array.isArray(inventorsRaw)
    ? (inventorsRaw as unknown[]).map(String)
    : inventorsRaw
    ? [String(inventorsRaw)]
    : undefined;

  return {
    title,
    description,
    url: `${BASE}/detail/${item.documentId}`,
    institution,
    ...(type ? { categories: [type] } : {}),
    ...(patentStatus ? { patentStatus } : {}),
    ...(inventors?.length ? { inventors } : {}),
    ...(item.externalId ? { technologyId: item.externalId } : {}),
  };
}

/**
 * Factory: creates a per-lab VIPS scraper.
 *
 * @param vipsLabNames  One or more "Lab Name" values as they appear in VIPS
 *                      (the first is used for the API query; extras are queried
 *                      and merged — used for Savannah River).
 * @param institution   Canonical institution name for ScrapedListing.institution
 */
export function createVipsScraper(
  vipsLabNames: string[],
  institution: string
): InstitutionScraper {
  const scrape = async (): Promise<ScrapedListing[]> => {
    let cookie: string;
    try {
      cookie = await vipsAuth();
    } catch (e) {
      console.warn(`[scraper] ${institution}: VIPS auth failed —`, (e as Error).message);
      return [];
    }

    const allItems = new Map<number, VipsItem>();

    for (const labName of vipsLabNames) {
      let resultId: number;
      let count: number;

      try {
        const q = await vipsQuery(cookie, [labName]);
        resultId = q.resultId;
        count = q.count;
      } catch (e) {
        console.warn(`[scraper] ${institution} (${labName}): VIPS query failed —`, (e as Error).message);
        continue;
      }

      if (count === 0) {
        console.warn(`[scraper] ${institution} (${labName}): 0 results from VIPS query`);
        continue;
      }

      let startIndex = 0;
      while (startIndex < count) {
        const page = await vipsFetchPage(cookie, resultId, startIndex, PAGE_SIZE);
        if (page.length === 0) break;
        for (const item of page) {
          const title = String(item.propertyValues?.["Title"] ?? "").trim();
          if (title.length >= 4) allItems.set(item.documentId, item);
        }
        startIndex += PAGE_SIZE;
        // Polite rate-limit between pages
        if (startIndex < count) await new Promise((r) => setTimeout(r, 200));
      }
    }

    if (allItems.size === 0) {
      console.warn(`[scraper] ${institution}: 0 valid listings returned from VIPS`);
      return [];
    }

    const results = Array.from(allItems.values()).map((item) => mapItem(item, institution));
    console.log(`[scraper] ${institution}: ${results.length} listings (VIPS API)`);
    return results;
  };

  const probe = async (maxResults = 5): Promise<ScrapedListing[]> => {
    let cookie: string;
    try {
      cookie = await vipsAuth();
    } catch (e) {
      console.warn(`[scraper] ${institution}: VIPS auth failed (probe) —`, (e as Error).message);
      return [];
    }

    const combined: ScrapedListing[] = [];

    for (const labName of vipsLabNames) {
      if (combined.length >= maxResults) break;
      let resultId: number;
      try {
        const q = await vipsQuery(cookie, [labName]);
        resultId = q.resultId;
        if (q.count === 0) continue;
      } catch {
        continue;
      }
      const page = await vipsFetchPage(cookie, resultId, 0, maxResults);
      for (const item of page) {
        const title = String(item.propertyValues?.["Title"] ?? "").trim();
        if (title.length >= 4) combined.push(mapItem(item, institution));
        if (combined.length >= maxResults) break;
      }
    }

    return combined.slice(0, maxResults);
  };

  return {
    institution,
    scraperType: "api",
    scrape,
    probe,
  };
}

// ── Per-lab instances ───────────────────────────────────────────────────────
// All verified via live API probe 2026-03-31 (counts from VIPS Lab Name facets).

/** National Renewable Energy Laboratory — 1,535 records */
export const nrelVipsScraper = createVipsScraper(
  ["National Renewable Energy Laboratory"],
  "National Renewable Energy Laboratory"
);

/** Kansas City National Security Campus — 392 records */
export const kcnscVipsScraper = createVipsScraper(
  ["Kansas City National Security Campus"],
  "Kansas City National Security Campus"
);

/** SLAC National Accelerator Laboratory — 271 records */
export const slacVipsScraper = createVipsScraper(
  ["SLAC National Accelerator Laboratory"],
  "SLAC National Accelerator Laboratory"
);

/** National Energy Technology Laboratory — 268 records */
export const netlVipsScraper = createVipsScraper(
  ["National Energy Technology Laboratory"],
  "National Energy Technology Laboratory"
);

/**
 * Savannah River National Laboratory — 261 records.
 * Also queries "Savannah River Site" (20 records, legacy naming) and merges.
 */
export const savannahRiverVipsScraper = createVipsScraper(
  ["Savannah River National Laboratory", "Savannah River Site"],
  "Savannah River National Laboratory"
);

/** Fermi National Accelerator Laboratory — 185 records */
export const fermiVipsScraper = createVipsScraper(
  ["Fermi National Accelerator Laboratory"],
  "Fermi National Accelerator Laboratory"
);

/** Ames Laboratory — 180 records */
export const amesLabVipsScraper = createVipsScraper(
  ["Ames Laboratory"],
  "Ames Laboratory"
);

/** Thomas Jefferson National Accelerator Facility — 157 records */
export const jlabVipsScraper = createVipsScraper(
  ["Thomas Jefferson National Accelerator Facility"],
  "Thomas Jefferson National Accelerator Facility"
);

/** Y-12 National Security Complex — 143 records */
export const y12VipsScraper = createVipsScraper(
  ["Y-12 National Security Complex"],
  "Y-12 National Security Complex"
);

/** Princeton Plasma Physics Laboratory — 52 records */
export const ppplVipsScraper = createVipsScraper(
  ["Princeton Plasma Physics Laboratory"],
  "Princeton Plasma Physics Laboratory"
);

/** Nevada National Security Site — 39 records */
export const nevadaNSSVipsScraper = createVipsScraper(
  ["Nevada National Security Site"],
  "Nevada National Security Site"
);
