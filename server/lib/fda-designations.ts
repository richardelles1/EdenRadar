/**
 * FDA Designation Enrichment Job
 *
 * Pulls three FDA designation types from official openFDA datasets and tags
 * matching ingested_assets:
 *
 *   1. Orphan Drug — openFDA `other/orphan_drug.json`
 *      Official orphan drug designation list. generic_name + trade_name fields.
 *      Full coverage of all granted ODD designations (pre- and post-approval).
 *
 *   2. Breakthrough Therapy -- openFDA `drug/label.json` (approved interim)
 *      Searches approved drug labels where `indications_and_usage` or
 *      `clinical_pharmacology` fields contain "breakthrough therapy" text.
 *      COVERAGE NOTE: Only covers drugs with an approved label that mentions
 *      BT designation. Pre-approval BT designations are excluded because the
 *      FDA/CDER does not publish a public structured endpoint for pre-approval
 *      BT designation lists. When the FDA publishes a public BT designation
 *      dataset (e.g., via openFDA or data.gov), this should be replaced.
 *
 *   3. Fast Track -- openFDA `drug/label.json` (approved interim)
 *      Same approach as BT: label text search for "fast track" designation.
 *      COVERAGE NOTE: Same pre-approval gap as BT. No public structured FDA API
 *      exposes the CDER Fast Track designation list. Label-text search is the
 *      highest-fidelity public source available.
 *
 * Matching: normalised drug name tokens are indexed in a single-pass Map so
 * asset name lookups are O(assets × tokens_per_name) rather than O(assets × FDA_records).
 */

import { storage } from "../storage";
import type { IngestedAsset } from "@shared/schema";

// ── Shared utilities ──────────────────────────────────────────────────────────

const PAGE_LIMIT = 100;
const FETCH_TIMEOUT_MS = 30_000;

async function safeFetchJson(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url.slice(0, 100)}`);
  return res.json();
}

function normName(s: string | undefined | null): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
}

function formatDate(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  // openFDA dates come as YYYYMMDD
  if (/^\d{8}$/.test(raw)) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  }
  return raw;
}

export interface NormalizedDesignation {
  name: string;       // canonical drug name to match against
  date?: string;      // YYYY-MM-DD designation date if available
  type: string;       // "Orphan Drug" | "Breakthrough Therapy" | "Fast Track"
}

// ── 1. Orphan Drug — openFDA other/orphan_drug.json ──────────────────────────

interface OrphanDrugRecord {
  trade_name?: string;
  generic_name?: string;
  date_of_fda_orphan_designation?: string;
}

export async function fetchOrphanDrugDesignations(): Promise<NormalizedDesignation[]> {
  const BASE = "https://api.fda.gov/other/orphan_drug.json";
  const results: NormalizedDesignation[] = [];

  let first: any;
  try {
    first = await safeFetchJson(`${BASE}?limit=${PAGE_LIMIT}&skip=0`);
  } catch (err: any) {
    console.warn(`[fda-designations] orphan_drug first page failed: ${err?.message}`);
    return results;
  }
  if (first.error) {
    console.warn("[fda-designations] orphan_drug openFDA error:", first.error.message);
    return results;
  }

  const totalAvailable = first.meta?.results?.total ?? 0;
  for (const r of (first.results ?? []) as OrphanDrugRecord[]) {
    const name = r.generic_name || r.trade_name;
    if (name) results.push({ name, date: formatDate(r.date_of_fda_orphan_designation), type: "Orphan Drug" });
  }

  for (let skip = PAGE_LIMIT; skip < Math.min(totalAvailable, 20_000); skip += PAGE_LIMIT) {
    try {
      const page = await safeFetchJson(`${BASE}?limit=${PAGE_LIMIT}&skip=${skip}`);
      for (const r of (page.results ?? []) as OrphanDrugRecord[]) {
        const name = r.generic_name || r.trade_name;
        if (name) results.push({ name, date: formatDate(r.date_of_fda_orphan_designation), type: "Orphan Drug" });
      }
      if ((page.results ?? []).length < PAGE_LIMIT) break;
    } catch (err: any) {
      console.warn(`[fda-designations] orphan_drug page skip=${skip} failed: ${err?.message}`);
      break;
    }
  }

  console.log(`[fda-designations] Orphan Drug: fetched ${results.length} records (of ${totalAvailable} available)`);
  return results;
}

// ── 2 & 3. Breakthrough Therapy + Fast Track — openFDA drug/label.json ───────
//
// FDA-approved drug labels contain explicit language in `indications_and_usage`
// and `clinical_pharmacology` sections when a drug received an expedited
// designation. This is the official openFDA source for approved BT/FT drugs.
// Pre-approval designated drugs (not yet NDA/BLA approved) are not captured
// since no public API exposes the CDER pre-approval designation registry.

interface LabelRecord {
  openfda?: {
    brand_name?: string[];
    generic_name?: string[];
    substance_name?: string[];
    application_number?: string[];
  };
}

function extractLabelDrugName(r: LabelRecord): string | undefined {
  return (
    r.openfda?.generic_name?.[0] ||
    r.openfda?.brand_name?.[0] ||
    r.openfda?.substance_name?.[0]
  );
}

async function fetchLabelDesignations(
  designationType: "Breakthrough Therapy" | "Fast Track",
  searchPhrase: string,
): Promise<NormalizedDesignation[]> {
  const BASE = "https://api.fda.gov/drug/label.json";
  const results: NormalizedDesignation[] = [];
  const seen = new Set<string>();

  // Search in both `indications_and_usage` and `clinical_pharmacology` sections
  const fields = ["indications_and_usage", "clinical_pharmacology"];

  for (const field of fields) {
    const encoded = encodeURIComponent(`"${searchPhrase}"`);
    let totalAvailable = 0;

    for (let skip = 0; skip < 5_000; skip += PAGE_LIMIT) {
      const url = `${BASE}?search=${field}:${encoded}&limit=${PAGE_LIMIT}&skip=${skip}`;
      let data: any;
      try {
        data = await safeFetchJson(url);
      } catch (err: any) {
        console.warn(`[fda-designations] ${designationType} label search (${field}, skip=${skip}) failed: ${err?.message}`);
        break;
      }
      if (data.error) {
        // 404 = no results for this query (normal)
        if (data.error.code === "NOT_FOUND") break;
        console.warn(`[fda-designations] ${designationType} openFDA error: ${data.error.message}`);
        break;
      }
      if (skip === 0) totalAvailable = data.meta?.results?.total ?? 0;

      for (const r of (data.results ?? []) as LabelRecord[]) {
        const name = extractLabelDrugName(r);
        if (!name) continue;
        const key = normName(name);
        if (!seen.has(key)) {
          seen.add(key);
          results.push({ name, type: designationType });
        }
      }
      if ((data.results ?? []).length < PAGE_LIMIT) break;
    }

    console.log(
      `[fda-designations] ${designationType} via label.${field}: ~${totalAvailable} total hits, ` +
      `${results.length} unique names so far`
    );
  }

  return results;
}

export async function fetchBreakthroughTherapyDesignations(): Promise<NormalizedDesignation[]> {
  return fetchLabelDesignations("Breakthrough Therapy", "breakthrough therapy");
}

export async function fetchFastTrackDesignations(): Promise<NormalizedDesignation[]> {
  return fetchLabelDesignations("Fast Track", "fast track");
}

// ── Indexed matching ──────────────────────────────────────────────────────────
//
// Build a token→designations index from all FDA records so each asset is matched
// in O(tokens_per_name) rather than O(FDA_records). Tokens shorter than 4 chars
// are excluded to reduce false-positive collisions.

const MIN_TOKEN_LEN = 4;

type DesignationIndex = Map<string, NormalizedDesignation[]>;

function buildIndex(designations: NormalizedDesignation[]): DesignationIndex {
  const index: DesignationIndex = new Map();
  for (const d of designations) {
    const tokens = normName(d.name).split(" ").filter((t) => t.length >= MIN_TOKEN_LEN);
    for (const token of tokens) {
      const bucket = index.get(token);
      if (bucket) {
        bucket.push(d);
      } else {
        index.set(token, [d]);
      }
    }
  }
  return index;
}

/**
 * Return the first designation from `index` that overlaps with `assetName`,
 * using full substring verification after a cheap token-index lookup.
 */
function lookupAsset(assetName: string, index: DesignationIndex): NormalizedDesignation | null {
  const assetNorm = normName(assetName);
  if (assetNorm.length < MIN_TOKEN_LEN) return null;

  const assetTokens = assetNorm.split(" ").filter((t) => t.length >= MIN_TOKEN_LEN);
  const candidates = new Set<NormalizedDesignation>();

  for (const token of assetTokens) {
    for (const d of index.get(token) ?? []) candidates.add(d);
  }

  for (const d of candidates) {
    const fdaNorm = normName(d.name);
    if (fdaNorm.includes(assetNorm) || assetNorm.includes(fdaNorm)) return d;
  }
  return null;
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

  console.log(
    "[fda-designations] Starting full FDA designation match " +
    "(Orphan Drug via openFDA + BT/FT via drug label search)..."
  );

  // ── Fetch all three designation lists concurrently ─────────────────────────
  const [orphanResult, btResult, ftResult] = await Promise.allSettled([
    fetchOrphanDrugDesignations(),
    fetchBreakthroughTherapyDesignations(),
    fetchFastTrackDesignations(),
  ]);

  const allDesignations: NormalizedDesignation[] = [
    ...(orphanResult.status === "fulfilled" ? orphanResult.value : []),
    ...(btResult.status === "fulfilled" ? btResult.value : []),
    ...(ftResult.status === "fulfilled" ? ftResult.value : []),
  ];

  if (orphanResult.status === "rejected") {
    console.warn("[fda-designations] Orphan Drug fetch failed:", (orphanResult.reason as any)?.message);
    result.errors++;
  }
  if (btResult.status === "rejected") {
    console.warn("[fda-designations] Breakthrough Therapy fetch failed:", (btResult.reason as any)?.message);
    result.errors++;
  }
  if (ftResult.status === "rejected") {
    console.warn("[fda-designations] Fast Track fetch failed:", (ftResult.reason as any)?.message);
    result.errors++;
  }

  result.total = allDesignations.length;
  console.log(
    `[fda-designations] Fetched ${result.total} total designation records ` +
    `(Orphan=${orphanResult.status === "fulfilled" ? orphanResult.value.length : 0}, ` +
    `BT=${btResult.status === "fulfilled" ? btResult.value.length : 0}, ` +
    `FT=${ftResult.status === "fulfilled" ? ftResult.value.length : 0})`
  );

  // ── Build token index ─────────────────────────────────────────────────────
  const designationIndex = buildIndex(allDesignations);
  console.log(`[fda-designations] Index built: ${designationIndex.size} unique tokens`);

  // ── Load assets and match via index ──────────────────────────────────────
  let assets: IngestedAsset[];
  try {
    assets = await storage.getIngestedAssetsForFdaTagging();
  } catch (err: any) {
    console.error("[fda-designations] Failed to load assets:", err?.message);
    result.errors++;
    return result;
  }

  console.log(`[fda-designations] Matching ${assets.length} assets against ${designationIndex.size}-token index...`);

  for (const asset of assets) {
    const assetName = asset.assetName;
    if (!assetName || assetName === "unknown") continue;

    const match = lookupAsset(assetName, designationIndex);
    if (!match) continue;

    result.matched++;
    try {
      await storage.updateFdaDesignation(asset.id, match.type, match.date);
      result.tagged++;
      result.byType[match.type] = (result.byType[match.type] ?? 0) + 1;
      console.log(
        `[fda-designations] Tagged #${asset.id} "${assetName}" → ${match.type} ` +
        `(matched: "${match.name}", date: ${match.date ?? "n/a"})`
      );
    } catch (err: any) {
      console.warn(`[fda-designations] Failed to tag asset #${asset.id}: ${err?.message}`);
      result.errors++;
    }
  }

  console.log(
    `[fda-designations] Done. total=${result.total} assets=${assets.length} ` +
    `matched=${result.matched} tagged=${result.tagged} errors=${result.errors} ` +
    `byType=${JSON.stringify(result.byType)}`
  );

  return result;
}
