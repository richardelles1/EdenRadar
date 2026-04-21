/**
 * FDA Designation Enrichment Job
 *
 * Pulls orphan drug designations from the openFDA API (no auth required) and
 * tags matching ingested_assets with the designation type and grant date.
 *
 * Matching logic: case-insensitive substring match between the FDA designation's
 * `generic_name` / `trade_name` and the asset's `asset_name` (either direction).
 *
 * Note: Fast-track and breakthrough-therapy designations are not available via
 * a public API; only orphan drug designations are covered here.
 */

import { storage } from "../storage";
import type { IngestedAsset } from "@shared/schema";

const OPENFDA_BASE = "https://api.fda.gov/other/orphan_drug.json";
const PAGE_LIMIT = 100;
const DESIGNATION_TYPE = "Orphan Drug";

interface OrphanDrugRecord {
  trade_name?: string;
  generic_name?: string;
  date_of_fda_orphan_designation?: string;
  orphan_designation?: string;
  designated_indication?: string;
}

interface OpenFdaResponse {
  meta?: { results?: { total?: number; skip?: number; limit?: number } };
  results?: OrphanDrugRecord[];
  error?: { code?: string; message?: string };
}

async function fetchOrphanDrugPage(skip: number): Promise<OpenFdaResponse> {
  const url = `${OPENFDA_BASE}?limit=${PAGE_LIMIT}&skip=${skip}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`openFDA HTTP ${res.status}`);
  return res.json();
}

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
  // openFDA dates come as YYYYMMDD
  if (/^\d{8}$/.test(raw)) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  }
  return raw;
}

export interface FdaDesignationResult {
  total: number;
  matched: number;
  tagged: number;
  errors: number;
}

export async function runFdaDesignationMatch(): Promise<FdaDesignationResult> {
  const result: FdaDesignationResult = { total: 0, matched: 0, tagged: 0, errors: 0 };

  console.log("[fda-designations] Starting orphan drug designation match...");

  let allRecords: OrphanDrugRecord[] = [];

  try {
    const first = await fetchOrphanDrugPage(0);
    if (first.error) {
      console.error("[fda-designations] openFDA error:", first.error.message);
      return result;
    }

    const totalAvailable = first.meta?.results?.total ?? 0;
    allRecords = first.results ?? [];
    result.total += allRecords.length;

    console.log(`[fda-designations] openFDA total orphan drug records: ${totalAvailable}`);

    for (let skip = PAGE_LIMIT; skip < Math.min(totalAvailable, 20_000); skip += PAGE_LIMIT) {
      try {
        const page = await fetchOrphanDrugPage(skip);
        const rows = page.results ?? [];
        allRecords = allRecords.concat(rows);
        result.total += rows.length;
        if (rows.length < PAGE_LIMIT) break;
      } catch (err: any) {
        console.warn(`[fda-designations] page skip=${skip} failed: ${err?.message}`);
        result.errors++;
        break;
      }
    }

    console.log(`[fda-designations] Fetched ${result.total} orphan drug records`);
  } catch (err: any) {
    console.error("[fda-designations] Failed to fetch from openFDA:", err?.message);
    result.errors++;
    return result;
  }

  let assets: IngestedAsset[];
  try {
    assets = await storage.getIngestedAssetsForFdaTagging();
  } catch (err: any) {
    console.error("[fda-designations] Failed to load assets:", err?.message);
    result.errors++;
    return result;
  }

  console.log(`[fda-designations] Matching ${allRecords.length} FDA records against ${assets.length} assets...`);

  for (const asset of assets) {
    const assetName = asset.assetName;
    if (!assetName || assetName === "unknown") continue;

    for (const record of allRecords) {
      const fdaGeneric = record.generic_name;
      const fdaTrade = record.trade_name;

      if (namesMatch(fdaGeneric, assetName) || namesMatch(fdaTrade, assetName)) {
        result.matched++;
        const designationDate = formatDate(record.date_of_fda_orphan_designation);

        try {
          await storage.updateFdaDesignation(asset.id, DESIGNATION_TYPE, designationDate);
          result.tagged++;
          console.log(
            `[fda-designations] Tagged asset #${asset.id} "${assetName}" ` +
            `with ${DESIGNATION_TYPE} (${fdaGeneric ?? fdaTrade}, ${designationDate ?? "no date"})`
          );
        } catch (err: any) {
          console.warn(`[fda-designations] Failed to tag asset #${asset.id}: ${err?.message}`);
          result.errors++;
        }
        break;
      }
    }
  }

  console.log(
    `[fda-designations] Done. total=${result.total} assets=${assets.length} ` +
    `matched=${result.matched} tagged=${result.tagged} errors=${result.errors}`
  );

  return result;
}
