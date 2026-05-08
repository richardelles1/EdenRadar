/**
 * Patent IP-type enrichment via regex extraction from asset text.
 *
 * Extracts US patent numbers and PCT applications directly from asset_name + summary,
 * classifying ip_type = 'patent' and patent_status = 'granted' | 'filed'.
 * No external API required — works on all institutions, all assets.
 */

import { db } from "../../db";
import { sql } from "drizzle-orm";

// ── POSIX regex patterns (PostgreSQL ~* operator) ─────────────────────────────
// Granted: US 10,690,653 or US10690653B2 or "Patent No. 8,679,531"
const PAT_GRANTED = `(asset_name || ' ' || COALESCE(summary, '')) ~* 'US[[:space:]]*[0-9]{1,2},[0-9]{3},[0-9]{3}'
    OR (asset_name || ' ' || COALESCE(summary, '')) ~* 'US[[:space:]]*[0-9]{7,8}[[:space:]]*B[12]'
    OR (asset_name || ' ' || COALESCE(summary, '')) ~* 'Patent No\\.?[[:space:]]'`;

// Filed: US20200215228A1 or PCT/US2020/012345
const PAT_FILED = `(asset_name || ' ' || COALESCE(summary, '')) ~* 'US[[:space:]]*20[0-9]{8}[[:space:]]*A[0-9]'
    OR (asset_name || ' ' || COALESCE(summary, '')) ~* 'PCT/[A-Z]{2}[0-9]'`;

// Any patent signal
const PAT_ANY = `(${PAT_GRANTED}) OR (${PAT_FILED})`;

// ── Types ─────────────────────────────────────────────────────────────────────

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

export interface CrossRefRunOptions {
  apiKey?: string;
  onProgress?: (p: CrossRefProgress) => void;
  shouldStop?: () => boolean;
}

// ── Count ─────────────────────────────────────────────────────────────────────

export async function countMissingIpType(): Promise<number> {
  const result = await db.execute<{ count: string }>(sql`
    SELECT COUNT(*)::text AS count
    FROM ingested_assets
    WHERE relevant = true
      AND source_type = 'tech_transfer'
      AND (ip_type IS NULL OR ip_type IN ('unknown', ''))
      AND (human_verified IS NULL OR (human_verified->>'ipType') IS NULL OR (human_verified->>'ipType')::boolean = false)
  `);
  return parseInt(result.rows[0]?.count ?? "0", 10);
}

// ── Spot check (preview of assets that will be updated) ───────────────────────

export async function runSpotCheck(_apiKey?: string): Promise<SpotCheckValidation> {
  const rows = await db.execute<{
    id: number;
    asset_name: string;
    institution: string;
    is_granted: boolean;
    is_filed: boolean;
  }>(sql`
    SELECT
      id,
      asset_name,
      institution,
      (
        (asset_name || ' ' || COALESCE(summary, '')) ~* 'US[[:space:]]*[0-9]{1,2},[0-9]{3},[0-9]{3}'
        OR (asset_name || ' ' || COALESCE(summary, '')) ~* 'US[[:space:]]*[0-9]{7,8}[[:space:]]*B[12]'
        OR (asset_name || ' ' || COALESCE(summary, '')) ~* 'Patent No\.?[[:space:]]'
      ) AS is_granted,
      (
        (asset_name || ' ' || COALESCE(summary, '')) ~* 'US[[:space:]]*20[0-9]{8}[[:space:]]*A[0-9]'
        OR (asset_name || ' ' || COALESCE(summary, '')) ~* 'PCT/[A-Z]{2}[0-9]'
      ) AS is_filed
    FROM ingested_assets
    WHERE relevant = true
      AND source_type = 'tech_transfer'
      AND (ip_type IS NULL OR ip_type IN ('unknown', ''))
      AND (human_verified IS NULL OR (human_verified->>'ipType') IS NULL OR (human_verified->>'ipType')::boolean = false)
      AND (
        (asset_name || ' ' || COALESCE(summary, '')) ~* 'US[[:space:]]*[0-9]{1,2},[0-9]{3},[0-9]{3}'
        OR (asset_name || ' ' || COALESCE(summary, '')) ~* 'US[[:space:]]*[0-9]{7,8}[[:space:]]*B[12]'
        OR (asset_name || ' ' || COALESCE(summary, '')) ~* 'Patent No\.?[[:space:]]'
        OR (asset_name || ' ' || COALESCE(summary, '')) ~* 'US[[:space:]]*20[0-9]{8}[[:space:]]*A[0-9]'
        OR (asset_name || ' ' || COALESCE(summary, '')) ~* 'PCT/[A-Z]{2}[0-9]'
      )
    ORDER BY institution, id
    LIMIT 15
  `);

  // Group into institution-level preview rows (up to 5 institutions, 3 assets each)
  const byInstitution = new Map<string, typeof rows.rows>();
  for (const row of rows.rows) {
    const inst = row.institution ?? "Unknown";
    if (!byInstitution.has(inst)) byInstitution.set(inst, []);
    byInstitution.get(inst)!.push(row);
  }

  const results: SpotCheckResult[] = [];
  for (const [institution, assets] of byInstitution) {
    if (results.length >= 5) break;
    results.push({
      institution,
      assigneeName: institution,
      count: assets.length,
      hasTitle: true,
      hasValidDate: false,
      sample: assets.slice(0, 3).map((a) => ({
        number: a.is_granted ? "granted" : "filed",
        title: a.asset_name ?? "",
        date: null,
      })),
      valid: true,
    });
  }

  const totalResult = await db.execute<{ total: string }>(sql`
    SELECT COUNT(*)::text AS total
    FROM ingested_assets
    WHERE relevant = true
      AND source_type = 'tech_transfer'
      AND (ip_type IS NULL OR ip_type IN ('unknown', ''))
      AND (human_verified IS NULL OR (human_verified->>'ipType') IS NULL OR (human_verified->>'ipType')::boolean = false)
      AND (
        (asset_name || ' ' || COALESCE(summary, '')) ~* 'US[[:space:]]*[0-9]{1,2},[0-9]{3},[0-9]{3}'
        OR (asset_name || ' ' || COALESCE(summary, '')) ~* 'US[[:space:]]*[0-9]{7,8}[[:space:]]*B[12]'
        OR (asset_name || ' ' || COALESCE(summary, '')) ~* 'Patent No\.?[[:space:]]'
        OR (asset_name || ' ' || COALESCE(summary, '')) ~* 'US[[:space:]]*20[0-9]{8}[[:space:]]*A[0-9]'
        OR (asset_name || ' ' || COALESCE(summary, '')) ~* 'PCT/[A-Z]{2}[0-9]'
      )
  `);

  const total = parseInt(totalResult.rows[0]?.total ?? "0", 10);
  const validCount = results.length;
  const passed = total > 0;

  console.log(`[patent-extraction] Preview: ${total} assets with extractable patent numbers found`);

  return {
    results,
    validCount,
    passed,
    reason: passed ? undefined : "No TTO assets found with extractable patent numbers in their text.",
  };
}

// ── Main run (SQL UPDATE, no external API) ────────────────────────────────────

export async function runUsptoPatentCrossRef(
  options: CrossRefRunOptions,
): Promise<CrossRefSummary> {
  const { onProgress, shouldStop } = options;

  // Count total to process
  const countRes = await db.execute<{ total: string }>(sql`
    SELECT COUNT(*)::text AS total
    FROM ingested_assets
    WHERE relevant = true
      AND source_type = 'tech_transfer'
      AND (ip_type IS NULL OR ip_type IN ('unknown', ''))
      AND (human_verified IS NULL OR (human_verified->>'ipType') IS NULL OR (human_verified->>'ipType')::boolean = false)
      AND (
        (asset_name || ' ' || COALESCE(summary, '')) ~* 'US[[:space:]]*[0-9]{1,2},[0-9]{3},[0-9]{3}'
        OR (asset_name || ' ' || COALESCE(summary, '')) ~* 'US[[:space:]]*[0-9]{7,8}[[:space:]]*B[12]'
        OR (asset_name || ' ' || COALESCE(summary, '')) ~* 'Patent No\.?[[:space:]]'
        OR (asset_name || ' ' || COALESCE(summary, '')) ~* 'US[[:space:]]*20[0-9]{8}[[:space:]]*A[0-9]'
        OR (asset_name || ' ' || COALESCE(summary, '')) ~* 'PCT/[A-Z]{2}[0-9]'
      )
  `);
  const total = parseInt(countRes.rows[0]?.total ?? "0", 10);

  onProgress?.({ processed: 0, total, matched: 0, unmatched: 0, skipped: 0 });

  if (shouldStop?.()) {
    return { processed: 0, matched: 0, unmatched: 0, skipped: 0, missingIpTypeCount: total, institutions: 0, errors: [] };
  }

  // UPDATE granted patents (US patent numbers with commas or B1/B2 suffix, or "Patent No.")
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
  const grantedCount = parseInt(grantedRes.rows[0]?.count ?? "0", 10);

  onProgress?.({ processed: grantedCount, total, matched: grantedCount, unmatched: 0, skipped: 0 });

  if (shouldStop?.()) {
    return { processed: grantedCount, matched: grantedCount, unmatched: 0, skipped: 0, missingIpTypeCount: total, institutions: 0, errors: [] };
  }

  // UPDATE filed/pending patents (US application publications or PCT)
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
  const filedCount = parseInt(filedRes.rows[0]?.count ?? "0", 10);

  const matched = grantedCount + filedCount;
  onProgress?.({ processed: matched, total, matched, unmatched: total - matched, skipped: 0 });

  // Count remaining missing ip_type for the summary
  const remainingRes = await db.execute<{ count: string }>(sql`
    SELECT COUNT(*)::text AS count
    FROM ingested_assets
    WHERE relevant = true
      AND source_type = 'tech_transfer'
      AND (ip_type IS NULL OR ip_type IN ('unknown', ''))
  `);
  const remaining = parseInt(remainingRes.rows[0]?.count ?? "0", 10);

  console.log(`[patent-extraction] Done — ${grantedCount} granted, ${filedCount} filed, ${total - matched} no pattern found`);

  return {
    processed: total,
    matched,
    unmatched: total - matched,
    skipped: 0,
    missingIpTypeCount: remaining,
    institutions: 0,
    errors: [],
  };
}
