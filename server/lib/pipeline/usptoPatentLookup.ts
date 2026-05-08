/**
 * USPTO PatentsView cross-reference service for EdenRadar patent enrichment.
 *
 * Queries https://api.patentsview.org/patents/query for granted patents by assignee,
 * then fuzzy-matches against TTO asset titles to fill ip_type / patent_status.
 *
 * Auth: X-Api-Key header (USPTO_ODP_API_KEY env var)
 * Cache: in-memory Map keyed by candidateName, invalidated each calendar day.
 * Multi-candidate: loops over all candidateNames per institution, deduplicates by patent number.
 */

import { db } from "../../db";
import { sql } from "drizzle-orm";
import { ASSIGNEE_MAP, findAssigneeEntry } from "./usptoAssigneeMap";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface PatentRecord {
  patentNumber: string;
  title: string;
  grantDate: string | null;
  filingDate: string | null;
  assignee: string;
  status: "granted" | "filed";
}

export interface SpotCheckResult {
  institution: string;
  assigneeName: string;
  count: number;
  hasTitle: boolean;
  hasValidDate: boolean;
  sample: Array<{ number: string; title: string; date: string | null }>;
  error?: string;
  valid: boolean;
}

export interface SpotCheckValidation {
  results: SpotCheckResult[];
  validCount: number;
  passed: boolean;
  reason?: string;
}

export interface CrossRefProgress {
  processed: number;
  total: number;
  matched: number;
  unmatched: number;
  skipped: number;
}

export interface CrossRefSummary {
  processed: number;
  matched: number;
  unmatched: number;
  skipped: number;
  missingIpTypeCount: number;
  institutions: number;
  errors: string[];
}

export interface AssetRow {
  id: number;
  assetName: string | null;
  institution: string | null;
  ipType: string | null;
  patentStatus: string | null;
  humanVerified: Record<string, boolean> | null;
  enrichmentSources: Record<string, string> | null;
}

export interface CrossRefMatch {
  assetId: number;
  ipType: string;
  patentStatus: string;
  patentNumber: string;
  grantDate: string | null;
}

// ── In-memory cache ────────────────────────────────────────────────────────────

interface CacheEntry {
  patents: PatentRecord[];
  date: string;
}

const cache = new Map<string, CacheEntry>();

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

function getCached(key: string): PatentRecord[] | null {
  const entry = cache.get(key);
  if (!entry || entry.date !== todayString()) return null;
  return entry.patents;
}

function setCached(key: string, patents: PatentRecord[]): void {
  cache.set(key, { patents, date: todayString() });
}

// ── USPTO ODP API fetch (api.uspto.gov) ───────────────────────────────────────
// The old api.patentsview.org endpoint is permanently shut down as of 2025.
// Free API key available at: https://developer.uspto.gov/api-catalog/pta-patentsview

const USPTO_ODP_URL = "https://api.uspto.gov/patent/v1/patents/search";
const FIFTEEN_YEARS_AGO = new Date(Date.now() - 15 * 365.25 * 24 * 60 * 60 * 1000)
  .toISOString()
  .slice(0, 10);
const TODAY = new Date().toISOString().slice(0, 10);

async function fetchPatentsByAssignee(
  assigneeName: string,
  apiKey: string,
): Promise<PatentRecord[]> {
  if (!apiKey) throw new Error("USPTO_ODP_API_KEY is not set — get a free key at developer.uspto.gov");

  const cacheKey = `${assigneeName}::${todayString()}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  // New USPTO ODP API uses GET with Lucene query syntax
  const q = `assigneeNameText:"${assigneeName}"`;
  const params = new URLSearchParams({
    q,
    dateRangeField: "grantDate",
    startdt: FIFTEEN_YEARS_AGO,
    enddt: TODAY,
    start: "0",
    rows: "500",
  });

  const res = await fetch(`${USPTO_ODP_URL}?${params.toString()}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "X-API-KEY": apiKey,
    },
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`USPTO ODP HTTP ${res.status}: ${errBody.slice(0, 200)}`);
  }

  const rawText = await res.text();
  const data = JSON.parse(rawText) as {
    patents?: Array<{
      patentNumber?: string;
      patentTitle?: string;
      grantDate?: string | null;
      filingDate?: string | null;
      assignees?: Array<{ assigneeNameText?: string | null }>;
    }>;
    count?: number;
  };

  const patents: PatentRecord[] = (data.patents ?? []).map((p) => ({
    patentNumber: p.patentNumber ?? "",
    title: p.patentTitle ?? "",
    grantDate: p.grantDate ?? null,
    filingDate: p.filingDate ?? null,
    assignee: assigneeName,
    status: p.grantDate ? "granted" : "filed",
  }));

  setCached(cacheKey, patents);
  return patents;
}

/**
 * Fetches patents for an institution, trying all candidate assignee names
 * and deduplicating by patent number.
 */
export async function fetchPatentsForInstitution(
  institution: string,
  apiKey: string,
): Promise<PatentRecord[]> {
  const entry = findAssigneeEntry(institution);
  if (!entry) return [];

  const seen = new Set<string>();
  const all: PatentRecord[] = [];

  for (const candidateName of entry.candidateNames) {
    const records = await fetchPatentsByAssignee(candidateName, apiKey);
    for (const r of records) {
      const key = r.patentNumber || `${r.assignee}::${r.title}`;
      if (!seen.has(key)) {
        seen.add(key);
        all.push(r);
      }
    }
  }

  return all;
}

// ── Spot check — validates API response quality before any writes ──────────────

const SPOT_CHECK_INSTITUTIONS = [
  "Johns Hopkins University",
  "MIT",
  "Stanford University",
  "Columbia University",
  "Northwestern University",
];

function isValidDateString(s: string | null | undefined): boolean {
  if (!s) return false;
  const d = new Date(s);
  return !isNaN(d.getTime()) && s.length >= 8;
}

export async function runSpotCheck(apiKey: string): Promise<SpotCheckValidation> {
  const results: SpotCheckResult[] = [];

  for (const institution of SPOT_CHECK_INSTITUTIONS) {
    const entry = findAssigneeEntry(institution);
    if (!entry) {
      results.push({
        institution,
        assigneeName: "(unmapped)",
        count: 0,
        hasTitle: false,
        hasValidDate: false,
        sample: [],
        error: "Not in assignee map",
        valid: false,
      });
      continue;
    }
    try {
      const patents = await fetchPatentsForInstitution(institution, apiKey);

      // Log raw response diagnostic (first 3 patents) for audit trail
      console.log(
        `[uspto-spot-check] ${institution} (${entry.candidateNames[0]}) — ${patents.length} patents. Sample:`,
        JSON.stringify(
          patents.slice(0, 3).map((p) => ({
            patentNumber: p.patentNumber,
            title: p.title,
            grantDate: p.grantDate,
            status: p.status,
          })),
          null,
          2,
        ),
      );

      const hasTitle = patents.some((p) => p.title && p.title.trim().length > 0);
      const hasValidDate = patents.some((p) => isValidDateString(p.grantDate));
      const valid = patents.length > 0 && hasTitle;

      results.push({
        institution,
        assigneeName: entry.candidateNames[0],
        count: patents.length,
        hasTitle,
        hasValidDate,
        sample: patents.slice(0, 3).map((p) => ({
          number: p.patentNumber,
          title: p.title.slice(0, 80),
          date: p.grantDate,
        })),
        valid,
      });
    } catch (err: any) {
      console.error(`[uspto-spot-check] FAILED for ${institution}: ${err.message}`);
      results.push({
        institution,
        assigneeName: entry.candidateNames[0],
        count: 0,
        hasTitle: false,
        hasValidDate: false,
        sample: [],
        error: err.message ?? "Unknown error",
        valid: false,
      });
    }
  }

  const validCount = results.filter((r) => r.valid).length;
  const passed = validCount >= 3;
  const reason = passed
    ? undefined
    : `Only ${validCount} of ${results.length} spot-check institutions returned valid patent data (need ≥3). Check USPTO/PatentsView API connectivity.`;

  if (!passed) {
    console.error(`[uspto-spot-check] GATE FAILED — ${reason}`);
  } else {
    console.log(`[uspto-spot-check] GATE PASSED — ${validCount}/${results.length} valid institutions`);
  }

  return { results, validCount, passed, reason };
}

// ── Jaccard title matching ─────────────────────────────────────────────────────

function normalizeTitle(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const word of a) {
    if (b.has(word)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

const JACCARD_THRESHOLD = 0.35;

function findBestMatch(assetTitle: string, patents: PatentRecord[]): PatentRecord | null {
  const assetWords = normalizeTitle(assetTitle);
  let best: { record: PatentRecord; score: number } | null = null;

  for (const patent of patents) {
    const patentWords = normalizeTitle(patent.title);
    const score = jaccardSimilarity(assetWords, patentWords);
    if (score >= JACCARD_THRESHOLD) {
      if (!best || score > best.score) {
        best = { record: patent, score };
      }
    }
  }

  return best?.record ?? null;
}

// ── Cross-reference run (returns matches without writing) ─────────────────────

/**
 * For a batch of TTO assets (missing ip_type), attempt title-based patent matching.
 * Returns write-back objects — does NOT write to DB itself.
 */
export async function crossReferenceAssets(
  assets: AssetRow[],
  apiKey: string,
  onProgress?: (done: number, total: number, matched: number) => void,
): Promise<{ matches: CrossRefMatch[]; summary: Omit<CrossRefSummary, "processed" | "missingIpTypeCount"> }> {
  const matches: CrossRefMatch[] = [];
  const summary = {
    matched: 0,
    unmatched: 0,
    skipped: 0,
    total: assets.length,
    institutions: 0,
    errors: [] as string[],
  };

  const byInstitution = new Map<string, AssetRow[]>();
  for (const asset of assets) {
    if (!asset.institution || !asset.assetName) {
      summary.skipped++;
      continue;
    }
    const key = asset.institution;
    if (!byInstitution.has(key)) byInstitution.set(key, []);
    byInstitution.get(key)!.push(asset);
  }

  summary.institutions = byInstitution.size;
  let done = 0;

  for (const [institution, institutionAssets] of byInstitution) {
    let patents: PatentRecord[];
    try {
      patents = await fetchPatentsForInstitution(institution, apiKey);
    } catch (err: any) {
      const msg = `${institution}: ${err.message}`;
      summary.errors.push(msg);
      console.warn(`[uspto-crossref] API error for ${institution}: ${err.message}`);
      summary.skipped += institutionAssets.length;
      done += institutionAssets.length;
      onProgress?.(done, summary.total, summary.matched);
      continue;
    }

    if (patents.length === 0) {
      summary.skipped += institutionAssets.length;
      done += institutionAssets.length;
      onProgress?.(done, summary.total, summary.matched);
      continue;
    }

    for (const asset of institutionAssets) {
      const hv = asset.humanVerified ?? {};
      if (hv.ipType) {
        summary.skipped++;
        done++;
        onProgress?.(done, summary.total, summary.matched);
        continue;
      }

      const match = findBestMatch(asset.assetName!, patents);
      if (match) {
        matches.push({
          assetId: asset.id,
          ipType: "patent",
          patentStatus: match.status,
          patentNumber: match.patentNumber,
          grantDate: match.grantDate,
        });
        summary.matched++;
      } else {
        summary.unmatched++;
      }

      done++;
      onProgress?.(done, summary.total, summary.matched);
    }
  }

  return { matches, summary };
}

// ── Main DB-writing cross-reference run ───────────────────────────────────────

export interface CrossRefRunOptions {
  apiKey: string;
  onProgress?: (p: CrossRefProgress) => void;
  shouldStop?: () => boolean;
}

export async function runUsptoPatentCrossRef(
  options: CrossRefRunOptions,
): Promise<CrossRefSummary> {
  const { apiKey, onProgress, shouldStop } = options;

  // Fetch assets with missing ip_type (null or 'unknown'), relevant=true,
  // also respecting human_verified locks on both ip_type and patent_status
  const rows = await db.execute<{
    id: number;
    asset_name: string;
    institution: string;
    ip_type: string | null;
    patent_status: string | null;
    human_verified: Record<string, boolean> | null;
    enrichment_sources: Record<string, string> | null;
  }>(sql`
    SELECT id, asset_name, institution, ip_type, patent_status, human_verified, enrichment_sources
    FROM ingested_assets
    WHERE relevant = true
      AND (ip_type IS NULL OR ip_type = 'unknown')
      AND (human_verified IS NULL OR (human_verified->>'ipType') IS NULL OR (human_verified->>'ipType')::boolean = false)
    ORDER BY id
  `);

  const assets = rows.rows;
  const total = assets.length;
  console.log(`[uspto-xref] Starting cross-reference on ${total} assets with missing ip_type`);

  let processed = 0;
  let matched = 0;
  let unmatched = 0;
  let skipped = 0;
  let institutions = 0;
  const errors: string[] = [];

  const byInstitution = new Map<string, typeof assets>();
  for (const asset of assets) {
    const list = byInstitution.get(asset.institution) ?? [];
    list.push(asset);
    byInstitution.set(asset.institution, list);
  }
  institutions = byInstitution.size;

  for (const [institution, institutionAssets] of byInstitution) {
    if (shouldStop?.()) break;

    const entry = findAssigneeEntry(institution);
    if (!entry) {
      skipped += institutionAssets.length;
      processed += institutionAssets.length;
      onProgress?.({ processed, total, matched, unmatched, skipped });
      continue;
    }

    let patents: PatentRecord[];
    try {
      patents = await fetchPatentsForInstitution(institution, apiKey);
    } catch (err: any) {
      const msg = `${institution}: ${err.message}`;
      errors.push(msg);
      console.warn(`[uspto-xref] Failed to fetch patents for ${institution}: ${err.message}`);
      skipped += institutionAssets.length;
      processed += institutionAssets.length;
      onProgress?.({ processed, total, matched, unmatched, skipped });
      continue;
    }

    if (patents.length === 0) {
      unmatched += institutionAssets.length;
      processed += institutionAssets.length;
      onProgress?.({ processed, total, matched, unmatched, skipped });
      continue;
    }

    for (const asset of institutionAssets) {
      if (shouldStop?.()) break;

      const match = findBestMatch(asset.asset_name ?? "", patents);

      if (match) {
        const ipType = "patent";
        const patentStatus = match.status;

        // Guard both ip_type AND patent_status — never overwrite existing non-null
        // values or human-verified fields on either column.
        await db.execute(sql`
          UPDATE ingested_assets
          SET
            ip_type = ${ipType},
            patent_status = CASE
              WHEN (patent_status IS NULL OR patent_status = 'unknown')
                AND (human_verified IS NULL OR (human_verified->>'patentStatus') IS NULL OR (human_verified->>'patentStatus')::boolean = false)
              THEN ${patentStatus}
              ELSE patent_status
            END,
            enrichment_sources = COALESCE(enrichment_sources, '{}'::jsonb)
              || jsonb_build_object('ip_type', 'rule:uspto_patentsview', 'patent_status', 'rule:uspto_patentsview')
          WHERE id = ${asset.id}
            AND (ip_type IS NULL OR ip_type = 'unknown')
            AND (human_verified IS NULL OR (human_verified->>'ipType') IS NULL OR (human_verified->>'ipType')::boolean = false)
        `);
        matched++;
      } else {
        unmatched++;
      }

      processed++;
      onProgress?.({ processed, total, matched, unmatched, skipped });
    }
  }

  console.log(
    `[uspto-xref] Done — matched: ${matched}, unmatched: ${unmatched}, skipped: ${skipped}, total: ${total}`,
  );

  return { processed, matched, unmatched, skipped, missingIpTypeCount: total, institutions, errors };
}

// ── Count assets with missing ip_type ─────────────────────────────────────────

export async function countMissingIpType(): Promise<number> {
  const result = await db.execute<{ count: string }>(sql`
    SELECT COUNT(*)::text AS count
    FROM ingested_assets
    WHERE relevant = true
      AND (ip_type IS NULL OR ip_type = 'unknown')
  `);
  return parseInt(result.rows[0]?.count ?? "0", 10);
}

/** Expose the full assignee map for coverage info */
export function getAssigneeMapCoverage(): { institution: string; candidateNames: string[] }[] {
  return ASSIGNEE_MAP.map((e) => ({ institution: e.institution, candidateNames: e.candidateNames }));
}
