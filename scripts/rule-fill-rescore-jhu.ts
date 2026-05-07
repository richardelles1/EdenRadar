/**
 * Targeted rule-fill + re-score for a single institution.
 * Usage: tsx scripts/rule-fill-rescore-jhu.ts [institution name]
 * Default: "Johns Hopkins University"
 */

import { db } from "../server/db";
import { sql } from "drizzle-orm";
import { applyRulesToAsset } from "../server/lib/pipeline/ruleBasedFill";
import { computeCompletenessScore } from "../server/lib/pipeline/contentHash";
import { ingestedAssets } from "../shared/schema";
import { eq } from "drizzle-orm";

const INSTITUTION = process.argv[2] ?? "Johns Hopkins University";

// ─── Step 1: Rule-based fill ─────────────────────────────────────────────────

async function runRuleFillForInstitution(): Promise<void> {
  console.log(`[rule-fill] Fetching JHU assets needing field fill…`);
  const rows = await db.execute<{
    id: number; asset_name: string; summary: string; abstract: string | null;
    development_stage: string; ip_type: string | null; licensing_readiness: string | null;
    indication: string; modality: string | null; target: string | null;
    categories: string[] | null; human_verified: Record<string, boolean> | null;
  }>(sql`
    SELECT id, asset_name, summary, abstract, development_stage, ip_type, licensing_readiness,
           indication, modality, target, categories, human_verified
    FROM ingested_assets
    WHERE relevant = true AND institution = ${INSTITUTION}
      AND (
        development_stage IS NULL OR development_stage = 'unknown'
        OR indication IS NULL OR indication = 'unknown'
        OR modality IS NULL OR modality = 'unknown'
        OR ip_type IS NULL OR ip_type = 'unknown'
      )
    ORDER BY id ASC
  `);

  console.log(`[rule-fill] ${rows.rows.length} assets with at least one missing field`);
  let filled = 0;
  const byField: Record<string, number> = {};

  for (const row of rows.rows) {
    const { fields, dataSparse } = applyRulesToAsset({
      id: row.id, assetName: row.asset_name, summary: row.summary, abstract: row.abstract,
      developmentStage: row.development_stage, ipType: row.ip_type,
      licensingReadiness: row.licensing_readiness, indication: row.indication,
      modality: row.modality, target: row.target,
      categories: row.categories, humanVerified: row.human_verified,
    });

    if (Object.keys(fields).length > 0 || dataSparse) {
      try {
        await db.update(ingestedAssets).set({
          dataSparse,
          ...(fields.developmentStage && { developmentStage: fields.developmentStage }),
          ...(fields.ipType && { ipType: fields.ipType }),
          ...(fields.licensingReadiness && { licensingReadiness: fields.licensingReadiness }),
          ...(fields.indication && { indication: fields.indication }),
          ...(fields.modality && { modality: fields.modality }),
          ...(fields.target && { target: fields.target }),
        }).where(eq(ingestedAssets.id, row.id));
        if (Object.keys(fields).length > 0) {
          filled++;
          for (const k of Object.keys(fields)) byField[k] = (byField[k] ?? 0) + 1;
        }
      } catch (e: any) {
        console.warn(`[rule-fill] write failed id=${row.id}: ${e.message}`);
      }
    }
  }

  console.log(`[rule-fill] Filled ${filled} assets. By field:`, byField);
}

// ─── Step 2: Re-score — single CASE..WHEN batch update ───────────────────────

async function runRescoreForInstitution(): Promise<void> {
  console.log(`\n[rescore] Fetching all JHU assets for v3 re-score…`);
  const rows = await db.execute<{
    id: number; asset_class: string | null; modality: string | null;
    indication: string | null; development_stage: string | null;
    mechanism_of_action: string | null; ip_type: string | null;
    summary: string | null; patent_status: string | null;
    completeness_score: number | null;
  }>(sql`
    SELECT id, asset_class, modality, indication, development_stage, mechanism_of_action,
           ip_type, summary, patent_status, completeness_score
    FROM ingested_assets
    WHERE relevant = true AND institution = ${INSTITUTION}
  `);

  console.log(`[rescore] ${rows.rows.length} JHU assets — computing scores…`);

  // Compute all new scores in-process first (pure TS, no DB round-trips)
  const updates: Array<{ id: number; score: number }> = [];
  for (const r of rows.rows) {
    const newScore = computeCompletenessScore({
      assetClass: r.asset_class, modality: r.modality, indication: r.indication,
      developmentStage: r.development_stage, mechanismOfAction: r.mechanism_of_action,
      ipType: r.ip_type, summary: r.summary, patentStatus: r.patent_status,
    }) ?? 0;
    const current = r.completeness_score != null ? Number(r.completeness_score) : null;
    if (newScore !== current) updates.push({ id: r.id, score: newScore });
  }

  if (updates.length === 0) {
    console.log(`[rescore] All scores already up to date.`);
    return;
  }

  // Write in chunks of 500 using a VALUES-based batch update
  const CHUNK = 500;
  let written = 0;
  for (let i = 0; i < updates.length; i += CHUNK) {
    const chunk = updates.slice(i, i + CHUNK);
    // Build: UPDATE ingested_assets SET completeness_score = v.score
    //   FROM (VALUES (id,score),(id,score),...) AS v(id,score)
    //   WHERE ingested_assets.id = v.id
    const valueRows = chunk.map(u => `(${u.id}, ${u.score})`).join(",");
    await db.execute(sql.raw(
      `UPDATE ingested_assets AS a SET completeness_score = v.score FROM (VALUES ${valueRows}) AS v(id,score) WHERE a.id = v.id`
    ));
    written += chunk.length;
    console.log(`[rescore] Written ${written}/${updates.length} score updates…`);
  }

  console.log(`[rescore] Done — ${written} of ${rows.rows.length} scores updated`);
}

// ─── After-stats ──────────────────────────────────────────────────────────────

async function printStats(): Promise<void> {
  const r = await db.execute<{
    avg_score: string; p25: string; p50: string; p75: string;
    zero_count: string; above60: string; above80: string;
    ind_filled: string; stage_filled: string; modality_filled: string;
  }>(sql`
    SELECT
      ROUND(AVG(COALESCE(completeness_score,0))::numeric,1) AS avg_score,
      ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY COALESCE(completeness_score,0))::numeric,1) AS p25,
      ROUND(PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY COALESCE(completeness_score,0))::numeric,1) AS p50,
      ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY COALESCE(completeness_score,0))::numeric,1) AS p75,
      COUNT(*) FILTER (WHERE COALESCE(completeness_score,0) = 0)   AS zero_count,
      COUNT(*) FILTER (WHERE COALESCE(completeness_score,0) >= 60) AS above60,
      COUNT(*) FILTER (WHERE COALESCE(completeness_score,0) >= 80) AS above80,
      COUNT(*) FILTER (WHERE indication IS NOT NULL AND indication != 'unknown') AS ind_filled,
      COUNT(*) FILTER (WHERE development_stage IS NOT NULL AND development_stage != 'unknown') AS stage_filled,
      COUNT(*) FILTER (WHERE modality IS NOT NULL AND modality != 'unknown') AS modality_filled
    FROM ingested_assets
    WHERE relevant = true AND institution = ${INSTITUTION}
  `);
  const s = r.rows[0];
  console.log(`\n[stats] JHU after rule-fill + rescore (v3 formula):`);
  console.log(`  avg score : ${s.avg_score}  |  p25=${s.p25}  p50=${s.p50}  p75=${s.p75}`);
  console.log(`  score=0   : ${s.zero_count}  |  score≥60: ${s.above60}  |  score≥80: ${s.above80}`);
  console.log(`  indication: ${s.ind_filled} filled  |  stage: ${s.stage_filled}  |  modality: ${s.modality_filled}`);
}

async function main() {
  console.log(`[pipeline] Institution: ${INSTITUTION}`);
  const startMs = Date.now();
  await runRuleFillForInstitution();
  await runRescoreForInstitution();
  await printStats();
  console.log(`\n[pipeline] Total: ${((Date.now() - startMs) / 1000).toFixed(1)}s`);
  process.exit(0);
}

main().catch(err => { console.error("[pipeline] Fatal:", err); process.exit(1); });
