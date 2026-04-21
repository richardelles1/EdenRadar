/**
 * FDA Designation Enrichment Job
 *
 * Pulls three FDA designation types and tags matching ingested_assets:
 *   1. Orphan Drug          — openFDA other/orphan_drug.json (public, no auth)
 *   2. Breakthrough Therapy — openFDA drug/drugsfda.json (submission_class_code filter)
 *   3. Fast Track           — openFDA drug/drugsfda.json (submission_class_code filter)
 *
 * Matching logic: case-insensitive substring overlap between the FDA record's
 * generic_name / trade_name / brand_name / substance_name and asset_name.
 *
 * Note: openFDA coverage for Breakthrough Therapy and Fast Track is limited to
 * approved NDA/BLA applications.  Designated (pre-approval) drugs not yet in
 * the drug/drugsfda dataset will not be captured.
 */

import { storage } from "../storage";
import type { IngestedAsset } from "@shared/schema";

// ── shared helpers ────────────────────────────────────────────────────────────

const PAGE_LIMIT = 100;

function normName(s: string | undefined): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
}

function namesMatch(fdaName: string | undefined, assetName: string): boolean {
  if (!fdaName || !assetName) return false;
  const fda = normName(fdaName);
  const asset = normName(assetName);
  if (fda.length < 4 || asset.length < 4) return false;
  return fda.includes(asset) || asset.includes(fda);
}

function formatDate(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  if (/^\d{8}$/.test(raw)) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  }
  return raw;
}

async function safeFetch(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── 1. Orphan Drug ────────────────────────────────────────────────────────────

interface OrphanDrugRecord {
  trade_name?: string;
  generic_name?: string;
  date_of_fda_orphan_designation?: string;
  orphan_designation?: string;
  designated_indication?: string;
}

interface NormalizedDesignation {
  name: string;
  date?: string;
  type: string;
}

async function fetchOrphanDrugDesignations(): Promise<NormalizedDesignation[]> {
  const BASE = "https://api.fda.gov/other/orphan_drug.json";
  const results: NormalizedDesignation[] = [];
  let skip = 0;
  let totalAvailable = 0;

  try {
    const first = await safeFetch(`${BASE}?limit=${PAGE_LIMIT}&skip=0`);
    if (first.error) {
      console.warn("[fda-designations] orphan_drug openFDA error:", first.error.message);
      return results;
    }
    totalAvailable = first.meta?.results?.total ?? 0;
    for (const r of (first.results ?? []) as OrphanDrugRecord[]) {
      const name = r.generic_name || r.trade_name;
      if (name) results.push({ name, date: formatDate(r.date_of_fda_orphan_designation), type: "Orphan Drug" });
    }
    skip = PAGE_LIMIT;

    while (skip < Math.min(totalAvailable, 20_000)) {
      try {
        const page = await safeFetch(`${BASE}?limit=${PAGE_LIMIT}&skip=${skip}`);
        const rows = (page.results ?? []) as OrphanDrugRecord[];
        for (const r of rows) {
          const name = r.generic_name || r.trade_name;
          if (name) results.push({ name, date: formatDate(r.date_of_fda_orphan_designation), type: "Orphan Drug" });
        }
        if (rows.length < PAGE_LIMIT) break;
      } catch (err: any) {
        console.warn(`[fda-designations] orphan_drug page skip=${skip} failed: ${err?.message}`);
        break;
      }
      skip += PAGE_LIMIT;
    }

    console.log(`[fda-designations] Fetched ${results.length} Orphan Drug records (of ${totalAvailable} total)`);
  } catch (err: any) {
    console.warn(`[fda-designations] orphan_drug fetch failed: ${err?.message}`);
  }
  return results;
}

// ── 2 & 3. Breakthrough Therapy + Fast Track via openFDA drug/drugsfda ────────

interface DrugsFdaRecord {
  application_number?: string;
  sponsor_name?: string;
  openfda?: {
    brand_name?: string[];
    generic_name?: string[];
    substance_name?: string[];
  };
  submissions?: Array<{
    submission_type?: string;
    submission_status?: string;
    submission_status_date?: string;
    submission_class_code?: string;
    submission_class_code_description?: string;
    review_priority?: string;
  }>;
}

/**
 * Candidates for "Breakthrough Therapy" in the submission_class_code field.
 * openFDA does not expose BTD as a discrete field; these patterns cover known
 * values seen in NDA/BLA submissions that carry breakthrough therapy status.
 */
const BT_PATTERNS = [
  "breakthrough therapy",
  "breakthrough",
  "btd",
];

/**
 * Candidates for "Fast Track" in the submission_class_code or review_priority.
 * Priority review is frequently co-granted with Fast Track.
 */
const FT_PATTERNS = [
  "fast track",
  "fast-track",
  "ftd",
];

function extractDrugNames(r: DrugsFdaRecord): string[] {
  const names: string[] = [];
  for (const n of r.openfda?.brand_name ?? []) if (n) names.push(n);
  for (const n of r.openfda?.generic_name ?? []) if (n) names.push(n);
  for (const n of r.openfda?.substance_name ?? []) if (n) names.push(n);
  if (r.application_number) {
    // application_number is not a drug name — skip, but keep as a debug reference
  }
  return [...new Set(names)];
}

function submissionDate(r: DrugsFdaRecord): string | undefined {
  const sub = (r.submissions ?? []).find((s) => s.submission_status === "AP");
  return sub?.submission_status_date;
}

async function fetchDrugsFdaPage(url: string): Promise<DrugsFdaRecord[]> {
  try {
    const data = await safeFetch(url);
    if (data.error) {
      console.warn(`[fda-designations] drugsfda error: ${data.error.message}`);
      return [];
    }
    return (data.results ?? []) as DrugsFdaRecord[];
  } catch (err: any) {
    console.warn(`[fda-designations] drugsfda fetch failed (${url.slice(0, 80)}…): ${err?.message}`);
    return [];
  }
}

function matchesPatterns(r: DrugsFdaRecord, patterns: string[]): boolean {
  const submissions = r.submissions ?? [];
  for (const sub of submissions) {
    const code = (sub.submission_class_code ?? "").toLowerCase();
    const desc = (sub.submission_class_code_description ?? "").toLowerCase();
    const rev = (sub.review_priority ?? "").toLowerCase();
    if (patterns.some((p) => code.includes(p) || desc.includes(p) || rev.includes(p))) {
      return true;
    }
  }
  return false;
}

async function fetchExpeditedDesignations(
  designationType: "Breakthrough Therapy" | "Fast Track",
  patterns: string[],
): Promise<NormalizedDesignation[]> {
  const BASE = "https://api.fda.gov/drug/drugsfda.json";
  const results: NormalizedDesignation[] = [];

  // Try a targeted search first; openFDA supports nested field search
  const encodedPattern = encodeURIComponent(`"${designationType}"`);
  const searchUrl = `${BASE}?search=submissions.submission_class_code:${encodedPattern}&limit=${PAGE_LIMIT}`;
  const targeted = await fetchDrugsFdaPage(searchUrl);

  if (targeted.length > 0) {
    for (const r of targeted) {
      const names = extractDrugNames(r);
      if (names.length === 0) continue;
      const date = submissionDate(r);
      results.push({ name: names[0], date, type: designationType });
    }
    console.log(`[fda-designations] ${designationType}: targeted search returned ${targeted.length} records`);
    return results;
  }

  // Fallback: page through recent approved applications and filter locally
  console.log(
    `[fda-designations] ${designationType}: targeted search empty — scanning recent approvals with local filter`
  );

  const scanUrl = `${BASE}?search=submissions.submission_status:"AP"&sort=submissions.submission_status_date:desc&limit=${PAGE_LIMIT}`;
  let skip = 0;
  const MAX_PAGES = 10;

  for (let pg = 0; pg < MAX_PAGES; pg++) {
    const pageUrl = skip === 0 ? scanUrl : `${scanUrl}&skip=${skip}`;
    const rows = await fetchDrugsFdaPage(pageUrl);
    if (rows.length === 0) break;

    for (const r of rows) {
      if (!matchesPatterns(r, patterns)) continue;
      const names = extractDrugNames(r);
      if (names.length === 0) continue;
      const date = submissionDate(r);
      results.push({ name: names[0], date, type: designationType });
    }

    if (rows.length < PAGE_LIMIT) break;
    skip += PAGE_LIMIT;
  }

  console.log(`[fda-designations] ${designationType}: scan found ${results.length} candidate records`);
  return results;
}

async function fetchBreakthroughTherapyDesignations(): Promise<NormalizedDesignation[]> {
  return fetchExpeditedDesignations("Breakthrough Therapy", BT_PATTERNS);
}

async function fetchFastTrackDesignations(): Promise<NormalizedDesignation[]> {
  return fetchExpeditedDesignations("Fast Track", FT_PATTERNS);
}

// ── Main orchestrator ─────────────────────────────────────────────────────────

export interface FdaDesignationResult {
  total: number;
  matched: number;
  tagged: number;
  errors: number;
  byType: Record<string, number>;
}

export async function runFdaDesignationMatch(): Promise<FdaDesignationResult> {
  const result: FdaDesignationResult = { total: 0, matched: 0, tagged: 0, errors: 0, byType: {} };

  console.log("[fda-designations] Starting full FDA designation match (Orphan Drug + Breakthrough Therapy + Fast Track)...");

  // ── Fetch all three designation lists in parallel ──────────────────────────
  const [orphanRecords, btRecords, ftRecords] = await Promise.allSettled([
    fetchOrphanDrugDesignations(),
    fetchBreakthroughTherapyDesignations(),
    fetchFastTrackDesignations(),
  ]);

  const allDesignations: NormalizedDesignation[] = [
    ...(orphanRecords.status === "fulfilled" ? orphanRecords.value : []),
    ...(btRecords.status === "fulfilled" ? btRecords.value : []),
    ...(ftRecords.status === "fulfilled" ? ftRecords.value : []),
  ];

  if (orphanRecords.status === "rejected") {
    console.warn("[fda-designations] Orphan Drug fetch failed:", (orphanRecords.reason as any)?.message);
    result.errors++;
  }
  if (btRecords.status === "rejected") {
    console.warn("[fda-designations] Breakthrough Therapy fetch failed:", (btRecords.reason as any)?.message);
    result.errors++;
  }
  if (ftRecords.status === "rejected") {
    console.warn("[fda-designations] Fast Track fetch failed:", (ftRecords.reason as any)?.message);
    result.errors++;
  }

  result.total = allDesignations.length;
  console.log(
    `[fda-designations] Fetched ${result.total} total designation records ` +
    `(Orphan=${orphanRecords.status === "fulfilled" ? orphanRecords.value.length : 0}, ` +
    `BT=${btRecords.status === "fulfilled" ? btRecords.value.length : 0}, ` +
    `FT=${ftRecords.status === "fulfilled" ? ftRecords.value.length : 0})`
  );

  // ── Load assets and match ─────────────────────────────────────────────────
  let assets: IngestedAsset[];
  try {
    assets = await storage.getIngestedAssetsForFdaTagging();
  } catch (err: any) {
    console.error("[fda-designations] Failed to load assets:", err?.message);
    result.errors++;
    return result;
  }

  console.log(`[fda-designations] Matching ${allDesignations.length} FDA records against ${assets.length} assets...`);

  for (const asset of assets) {
    const assetName = asset.assetName;
    if (!assetName || assetName === "unknown") continue;

    for (const designation of allDesignations) {
      if (!namesMatch(designation.name, assetName)) continue;

      result.matched++;
      try {
        await storage.updateFdaDesignation(asset.id, designation.type, designation.date);
        result.tagged++;
        result.byType[designation.type] = (result.byType[designation.type] ?? 0) + 1;
        console.log(
          `[fda-designations] Tagged asset #${asset.id} "${assetName}" ` +
          `with ${designation.type} (${designation.name}, ${designation.date ?? "no date"})`
        );
      } catch (err: any) {
        console.warn(`[fda-designations] Failed to tag asset #${asset.id}: ${err?.message}`);
        result.errors++;
      }
      break; // one designation per asset (highest priority wins via list order)
    }
  }

  console.log(
    `[fda-designations] Done. total=${result.total} assets=${assets.length} ` +
    `matched=${result.matched} tagged=${result.tagged} errors=${result.errors} ` +
    `byType=${JSON.stringify(result.byType)}`
  );

  return result;
}
