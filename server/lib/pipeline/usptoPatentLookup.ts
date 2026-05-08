/**
 * USPTO patent cross-reference service for EdenRadar patent enrichment.
 *
 * PRIMARY: Queries https://api.uspto.gov/api/v1/patent/applications/search
 *   by institution assignee name, then fuzzy-matches patent titles against
 *   TTO asset names (Jaccard ≥ 0.35) to fill ip_type / patent_status.
 *   Uses the same endpoint and X-API-KEY auth as Scout's patents source.
 *
 * SUPPLEMENT: After the API pass, a SQL regex pass extracts patent numbers
 *   directly embedded in asset text (e.g. "US 10,690,653") to catch
 *   institutions not in the assignee map and assets the API didn't match.
 *
 * Cache: in-memory Map keyed by candidateName, invalidated each calendar day.
 * Multi-candidate: loops over all candidateNames per institution, deduplicates.
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

export interface CrossRefRunOptions {
  apiKey: string;
  onProgress?: (p: CrossRefProgress) => void;
  shouldStop?: () => boolean;
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

// ── USPTO ODP API fetch ────────────────────────────────────────────────────────
// Same endpoint and X-API-KEY auth as Scout's patents.ts source.

const USPTO_APPS_URL = "https://api.uspto.gov/api/v1/patent/applications/search";

async function fetchPatentsByAssignee(
  assigneeName: string,
  apiKey: string,
): Promise<PatentRecord[]> {
  const cacheKey = `${assigneeName}::${todayString()}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const body = {
    q: `"${assigneeName}"`,
    fields: [
      "applicationNumberText",
      "applicationMetaData.inventionTitle",
      "applicationMetaData.grantDate",
      "applicationMetaData.filingDate",
      "applicationMetaData.applicationStatusDescriptionText",
      "assignmentBag",
    ],
    filters: [
      { name: "applicationMetaData.applicationTypeLabelName", value: ["Utility"] },
    ],
    sort: [{ field: "applicationMetaData.grantDate", order: "desc" }],
    pagination: { offset: 0, limit: 100 },
  };

  const res = await fetch(USPTO_APPS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-API-KEY": apiKey,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    // Legitimate empty result for this assignee — not an error
    if (res.status === 404 && /no matching records/i.test(errBody)) {
      setCached(cacheKey, []);
      return [];
    }
    throw new Error(`USPTO ODP HTTP ${res.status}: ${errBody.slice(0, 200)}`);
  }

  const data = await res.json() as {
    patentFileWrapperDataBag?: Array<{
      applicationNumberText?: string;
      applicationMetaData?: {
        inventionTitle?: string;
        grantDate?: string | null;
        filingDate?: string | null;
        applicationStatusDescriptionText?: string;
      };
      assignmentBag?: Array<{
        assigneeBag?: Array<{ assigneeNameText?: string | null }>;
      }>;
    }>;
  };

  const patents: PatentRecord[] = (data.patentFileWrapperDataBag ?? []).map((r) => {
    const meta = r.applicationMetaData ?? {};
    const grantDate = meta.grantDate ?? null;
    return {
      patentNumber: r.applicationNumberText ?? "",
      title: meta.inventionTitle ?? "",
      grantDate,
      filingDate: meta.filingDate ?? null,
      assignee: assigneeName,
      status: grantDate ? "granted" : "filed",
    };
  });

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

// ── Spot check — validates API response before any writes ─────────────────────

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
  if (!apiKey) {
    return {
      results: [],
      validCount: 0,
      passed: false,
      reason: "USPTO_ODP_API_KEY is not set — add it to your environment secrets to enable this feature.",
    };
  }

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

      console.log(
        `[uspto-spot-check] ${institution} — ${patents.length} patents. Sample:`,
        JSON.stringify(patents.slice(0, 2).map((p) => ({ number: p.patentNumber, title: p.title, grantDate: p.grantDate })), null, 2),
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
    : `Only ${validCount} of ${results.length} spot-check institutions returned valid patent data (need ≥3). Check USPTO API key and connectivity.`;

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

// ── Regex supplement pass (no API needed) ─────────────────────────────────────
// Catches assets the API pass missed: TTO assets with patent numbers embedded
// in their text (e.g. "US 10,690,653", "US20200215228A1", "Patent No. 8,679,531").

async function runRegexSupplementPass(): Promise<{ granted: number; filed: number }> {
  const grantedRes = await db.execute<{ count: string }>(sql`
    WITH updated AS (
      UPDATE ingested_assets
      SET
        ip_type = 'patent',
        patent_status = CASE
          WHEN (patent_status IS NULL OR patent_status IN ('unknown', ''))
            AND (human_verified IS NULL OR (human_verified->>'patentStatus') IS NULL OR (human_verified->>'patentStatus')::boolean = false)
          THEN 'granted'
          ELSE patent_status
        END,
        enrichment_sources = COALESCE(enrichment_sources, '{}'::jsonb)
          || '{"ip_type":"rule:patent_text_extraction","patent_status":"rule:patent_text_extraction"}'::jsonb
      WHERE relevant = true
        AND source_type = 'tech_transfer'
        AND (ip_type IS NULL OR ip_type IN ('unknown', ''))
        AND (human_verified IS NULL OR (human_verified->>'ipType') IS NULL OR (human_verified->>'ipType')::boolean = false)
        AND (
          (asset_name || ' ' || COALESCE(summary, '')) ~* 'US[[:space:]]*[0-9]{1,2},[0-9]{3},[0-9]{3}'
          OR (asset_name || ' ' || COALESCE(summary, '')) ~* 'US[[:space:]]*[0-9]{7,8}[[:space:]]*B[12]'
          OR (asset_name || ' ' || COALESCE(summary, '')) ~* 'Patent No\.?[[:space:]]'
        )
      RETURNING id
    )
    SELECT COUNT(*)::text AS count FROM updated
  `);
  const granted = parseInt(grantedRes.rows[0]?.count ?? "0", 10);

  const filedRes = await db.execute<{ count: string }>(sql`
    WITH updated AS (
      UPDATE ingested_assets
      SET
        ip_type = 'patent',
        patent_status = CASE
          WHEN (patent_status IS NULL OR patent_status IN ('unknown', ''))
            AND (human_verified IS NULL OR (human_verified->>'patentStatus') IS NULL OR (human_verified->>'patentStatus')::boolean = false)
          THEN 'filed'
          ELSE patent_status
        END,
        enrichment_sources = COALESCE(enrichment_sources, '{}'::jsonb)
          || '{"ip_type":"rule:patent_text_extraction","patent_status":"rule:patent_text_extraction"}'::jsonb
      WHERE relevant = true
        AND source_type = 'tech_transfer'
        AND (ip_type IS NULL OR ip_type IN ('unknown', ''))
        AND (human_verified IS NULL OR (human_verified->>'ipType') IS NULL OR (human_verified->>'ipType')::boolean = false)
        AND NOT (
          (asset_name || ' ' || COALESCE(summary, '')) ~* 'US[[:space:]]*[0-9]{1,2},[0-9]{3},[0-9]{3}'
          OR (asset_name || ' ' || COALESCE(summary, '')) ~* 'US[[:space:]]*[0-9]{7,8}[[:space:]]*B[12]'
          OR (asset_name || ' ' || COALESCE(summary, '')) ~* 'Patent No\.?[[:space:]]'
        )
        AND (
          (asset_name || ' ' || COALESCE(summary, '')) ~* 'US[[:space:]]*20[0-9]{8}[[:space:]]*A[0-9]'
          OR (asset_name || ' ' || COALESCE(summary, '')) ~* 'PCT/[A-Z]{2}[0-9]'
        )
      RETURNING id
    )
    SELECT COUNT(*)::text AS count FROM updated
  `);
  const filed = parseInt(filedRes.rows[0]?.count ?? "0", 10);

  console.log(`[patent-regex-supplement] granted: ${granted}, filed: ${filed}`);
  return { granted, filed };
}

// ── Main DB-writing cross-reference run ───────────────────────────────────────

export async function runUsptoPatentCrossRef(
  options: CrossRefRunOptions,
): Promise<CrossRefSummary> {
  const { apiKey, onProgress, shouldStop } = options;

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
  const errors: string[] = [];

  const byInstitution = new Map<string, typeof assets>();
  for (const asset of assets) {
    const list = byInstitution.get(asset.institution) ?? [];
    list.push(asset);
    byInstitution.set(asset.institution, list);
  }
  const institutions = byInstitution.size;

  // ── Phase 1: API-based Jaccard matching ──────────────────────────────────────
  if (apiKey) {
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
          await db.execute(sql`
            UPDATE ingested_assets
            SET
              ip_type = 'patent',
              patent_status = CASE
                WHEN (patent_status IS NULL OR patent_status = 'unknown')
                  AND (human_verified IS NULL OR (human_verified->>'patentStatus') IS NULL OR (human_verified->>'patentStatus')::boolean = false)
                THEN ${match.status}
                ELSE patent_status
              END,
              enrichment_sources = COALESCE(enrichment_sources, '{}'::jsonb)
                || jsonb_build_object('ip_type', 'rule:uspto_jaccard', 'patent_status', 'rule:uspto_jaccard')
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
  } else {
    console.log("[uspto-xref] No API key — skipping API pass, running regex supplement only");
    skipped = total;
    processed = total;
    onProgress?.({ processed, total, matched, unmatched, skipped });
  }

  // ── Phase 2: Regex supplement pass (always runs) ─────────────────────────────
  if (!shouldStop?.()) {
    const regex = await runRegexSupplementPass();
    matched += regex.granted + regex.filed;
  }

  const remainingRes = await db.execute<{ count: string }>(sql`
    SELECT COUNT(*)::text AS count
    FROM ingested_assets
    WHERE relevant = true
      AND (ip_type IS NULL OR ip_type = 'unknown')
  `);
  const remaining = parseInt(remainingRes.rows[0]?.count ?? "0", 10);

  console.log(`[uspto-xref] Done — matched: ${matched}, unmatched: ${unmatched}, skipped: ${skipped}, total: ${total}`);

  return { processed, matched, unmatched, skipped, missingIpTypeCount: remaining, institutions, errors };
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
