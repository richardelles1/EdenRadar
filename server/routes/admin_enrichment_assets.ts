import type { Express } from "express";
import { Job, registerJob } from "../lib/jobState";
import { z } from "zod";
import { db, pool } from "../db";
import { sql } from "drizzle-orm";
import { storage, type EnrichFilter } from "../storage";
import { computeCompletenessScore } from "../lib/pipeline/contentHash";
import { classifyAsset } from "../lib/pipeline/classifyAsset";
import { captureException } from "../lib/sentry";
import { didEnrichImprove } from "../lib/pipeline/didEnrichImprove";

const enrichJob = new Job();
registerJob("enrichment:assets", enrichJob);
let enrichJobId: number | null = null;
let enrichImproved = 0;
let enrichTokenCost = 0;
let enrichTotal = 0;
let enrichFilters: EnrichFilter = {};
let enrichResumed = false;
// Persists the final token cost of the last run so the "done" status response
// can include it even after the job finishes.
let lastRunTokenCost = 0;

async function runEnrichmentWorker(
  jobId: number,
  assets: Array<{ id: number; assetName: string; summary: string; abstract: string | null; target: string; modality: string; indication: string; developmentStage: string; categories: string[] | null; patentStatus: string | null; licensingStatus: string | null; inventors: string[] | null; sourceUrl: string | null; sourceType?: string | null }>,
  startProcessed: number,
  startImproved: number,
  resumed: boolean,
  drain: boolean = false,
  filters: EnrichFilter = {},
) {
  enrichJob.start(startProcessed + assets.length);
  enrichJobId = jobId;
  enrichImproved = startImproved;
  enrichTokenCost = 0;
  enrichTotal = startProcessed + assets.length;
  enrichFilters = filters;
  enrichResumed = resumed;
  const MINI_INPUT_PER_M = 0.15;   // gpt-4o-mini input $/1M tokens
  const MINI_OUTPUT_PER_M = 0.60;  // gpt-4o-mini output $/1M tokens
  const CONCURRENCY = 30;
  let idx = 0;

  async function worker() {
    while (idx < assets.length) {
      if (enrichJob.shouldStop) break;
      const asset = assets[idx++];
      if (!asset) continue;
      try {
        // Use the type-aware classifyAsset pipeline (gpt-4o-mini, non-deep pass) so that
        // all new fields (assetClass, deviceAttributes, vocab-normalized target/indication)
        // are populated consistently with the rest of the pipeline.
        // Pass the asset's abstract + ctx (categories/patent/licensing/inventors/sourceUrl)
        // and current known field values – the prompt uses these to focus on filling the
        // unknowns and to preserve already-known values unless the source contradicts them.
        const classification = await classifyAsset(
          asset.assetName,
          asset.summary,
          asset.abstract ?? undefined,
          "gpt-4o-mini",  // cost-efficient model for Step 2
          false,          // non-deep mode
          {
            categories: asset.categories,
            patentStatus: asset.patentStatus,
            licensingStatus: asset.licensingStatus,
            inventors: asset.inventors,
            sourceUrl: asset.sourceUrl,
            currentValues: {
              target: asset.target,
              modality: asset.modality,
              indication: asset.indication,
              developmentStage: asset.developmentStage,
            },
          },
        );
        const score = computeCompletenessScore({
          assetClass: classification.assetClass,
          target: classification.target,
          modality: classification.modality,
          indication: classification.indication,
          developmentStage: classification.developmentStage,
          mechanismOfAction: classification.mechanismOfAction,
          innovationClaim: classification.innovationClaim,
          unmetNeed: classification.unmetNeed,
          comparableDrugs: classification.comparableDrugs,
          licensingReadiness: classification.licensingReadiness,
          deviceAttributes: classification.deviceAttributes,
          sourceType: asset.sourceType,
        });
        // Always persist the type-aware classification (assetClass, deviceAttributes,
        // completenessScore, enrichmentSources, and any vocab-normalized fields).
        // The storage layer enforces human-verified locking, so locked fields are safe.
        // We still track "improved" for the job counter – counts only when pharma-style
        // unknown→known transitions occur.
        await storage.updateIngestedAssetEnrichment(asset.id, {
          ...classification,
          completenessScore: score,
        });

        // Accumulate real token cost from the API response
        const inTok = classification.tokenUsage?.inputTokens ?? 0;
        const outTok = classification.tokenUsage?.outputTokens ?? 0;
        enrichTokenCost += (inTok * MINI_INPUT_PER_M + outTok * MINI_OUTPUT_PER_M) / 1_000_000;

        if (didEnrichImprove(asset, classification)) enrichImproved++;
      } catch (e) {
        console.error(`[enrichment] failed for asset ${asset.id}:`, e);
        // Hard GPT failure: still count toward the attempt cap so the asset is not retried
        // indefinitely. This is a thin atomic increment (no full enrichment write needed).
        await storage.incrementMiniEnrichAttempts(asset.id);
      }
      await storage.stampEnrichedAt(asset.id);
      enrichJob.tick();
      await storage.updateEnrichmentJob(jobId, { processed: enrichJob.processed, improved: enrichImproved });
    }
  }

  try {
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, assets.length) }, worker));

    // Drain mode: after the current batch finishes, keep pulling the next 500
    // un-scanned assets from the same mini-queue and continue under the same
    // job until the queue is empty (or stop is requested). The mini-queue
    // criteria already exclude assets we've just scored, so we will not pay
    // twice for the same asset.
    while (drain && !enrichJob.shouldStop) {
      const next = await storage.getMiniEnrichBatch(500, filters);
      if (next.length === 0) break;
      idx = 0;
      assets = next;
      enrichTotal += next.length;
      await storage.updateEnrichmentJob(jobId, { total: enrichTotal });
      console.log(`[enrichment] Drain: fetched next batch of ${next.length} assets for job ${jobId}`);
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, assets.length) }, worker));
    }

    lastRunTokenCost = enrichTokenCost;

    // Capture avg_completeness after the run for institution-scoped jobs.
    let completenessAfterRun: number | null = null;
    if (filters.institution) {
      try {
        const quality = await storage.getInstitutionEnrichmentQuality(filters.institution);
        completenessAfterRun = quality.avgCompletenessScore;
      } catch { /* non-fatal */ }
    }

    await storage.updateEnrichmentJob(jobId, {
      status: "done",
      processed: enrichJob.processed,
      improved: enrichImproved,
      completedAt: new Date(),
      tokenCostUsd: String(enrichTokenCost.toFixed(6)),
      ...(completenessAfterRun !== null ? { completenessAfterRun } : {}),
    });
    console.log(`[enrichment] Job ${jobId} completed: ${enrichImproved} improved out of ${enrichJob.processed} processed · $${lastRunTokenCost.toFixed(4)} spent`);
    // Fire-and-forget quality snapshot for institution-scoped runs.
    if (filters.institution) {
      storage.captureInstitutionQualitySnapshot(filters.institution).catch(() => {});
    }
  } catch (e: any) {
    await storage.updateEnrichmentJob(jobId, { status: "error", processed: enrichJob.processed, improved: enrichImproved, completedAt: new Date() });
    console.error("[enrichment] Job failed:", e);
    captureException(e);
  } finally {
    enrichJob.finish({});
  }
}

// ── Dimensional analytics constant ────────────────────────────────────────────
const DIM_COL: Record<string, string> = {
  modality: "modality",
  stage: "development_stage",
  indication: "indication",
  biology: "biology",
};

function buildAssetWhere(q: Record<string, any>) {
  const parts: ReturnType<typeof sql>[] = [sql`relevant = true`];
  if (q.institution) parts.push(sql`institution ILIKE ${'%' + q.institution + '%'}`);
  if (q.modality) parts.push(sql`modality = ${q.modality}`);
  if (q.stage) parts.push(sql`development_stage = ${q.stage}`);
  if (q.indication) parts.push(sql`indication ILIKE ${'%' + q.indication + '%'}`);
  if (q.biology) parts.push(sql`biology = ${q.biology}`);
  if (q.q) parts.push(sql`asset_name ILIKE ${'%' + q.q + '%'}`);
  if (q.tier) {
    const t = q.tier;
    if (t === "excellent") parts.push(sql`completeness_score >= 80`);
    else if (t === "good") parts.push(sql`completeness_score >= 60 AND completeness_score < 80`);
    else if (t === "partial") parts.push(sql`completeness_score >= 40 AND completeness_score < 60`);
    else if (t === "poor") parts.push(sql`completeness_score >= 1 AND completeness_score < 40`);
    else if (t === "unscored") parts.push(sql`(completeness_score IS NULL OR completeness_score = 0)`);
  }
  if (q.missing) {
    const m = q.missing;
    if (m === "target") parts.push(sql`(target IS NULL OR target IN ('unknown',''))`);
    else if (m === "indication") parts.push(sql`(indication IS NULL OR indication IN ('unknown',''))`);
    else if (m === "modality") parts.push(sql`(modality IS NULL OR modality IN ('unknown',''))`);
    else if (m === "stage") parts.push(sql`(development_stage IS NULL OR development_stage IN ('unknown',''))`);
    else if (m === "capped") parts.push(sql`COALESCE(mini_enrich_attempts, 0) >= 3`);
  }
  return parts.reduce((a, b) => sql`${a} AND ${b}`);
}

export function registerAssetRoutes(app: Express): void {

  // ── Human-Verified Field Locking ──────────────────────────────────────────

  app.post("/api/admin/assets/:id/verify-field", async (req, res) => {
    try {
      const assetId = parseInt(String(req.params.id));
      if (isNaN(assetId)) return res.status(400).json({ error: "Invalid asset ID" });
      const { field, verified } = z.object({
        field: z.string().min(1),
        verified: z.boolean().default(true),
      }).parse(req.body);
      await storage.setHumanVerified(assetId, field, verified);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: "Failed" });
    }
  });

  // ── Mini Enrich Queue ─────────────────────────────────────────────────────

  app.get("/api/admin/enrichment/mini-queue", async (req, res) => {
    try {
      const queue = await storage.getMiniEnrichQueue();
      res.json(queue);
    } catch (err: any) {
      res.status(500).json({ error: "Failed" });
    }
  });

  // One-time backfill: seeds mini_enrich_attempts = 1 for assets that were already
  // processed (enriched_at IS NOT NULL) but still have 3+ unknowns. Prevents the new
  // attempt cap from immediately giving them a fresh 3-attempt slate when the new column
  // defaults to 0 – they still get 2 more attempts (1 → 3) with the improved prompts.
  app.post("/api/admin/enrichment/mini-backfill", async (req, res) => {
    try {
      const updated = await storage.backfillMiniEnrichAttempts();
      console.log(`[enrichment] mini-backfill: seeded mini_enrich_attempts=1 for ${updated} assets`);
      res.json({ updated });
    } catch (err: any) {
      res.status(500).json({ error: "Backfill failed" });
    }
  });

  // Selective cap reset: re-enqueues capped assets that now have rich content (>=300 chars)
  // and still have >=2 unknown primary fields. Resets attempts to 2 (one fresh chance).
  app.post("/api/admin/enrichment/mini-cap-reset", async (req, res) => {
    try {
      const { dryRun } = z.object({ dryRun: z.boolean().default(false) }).parse(req.body ?? {});
      const result = await storage.resetMiniEnrichCapSelective(dryRun);
      console.log(`[enrichment] mini-cap-reset: eligible=${result.eligible} reset=${result.reset} dryRun=${dryRun}`);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: "Cap reset failed" });
    }
  });

  // --- Dataset Quality Analytics (relevant=true only) ---

  app.get("/api/admin/dataset-quality", async (req, res) => {
    try {

      const [totalRelevant, globalResult, institutionResult] = await Promise.all([
        storage.getTotalRelevantCount(),
        db.execute(sql`
        SELECT
          COUNT(completeness_score)::int AS scored_count,
          ROUND(AVG(completeness_score)::numeric, 1) AS avg_score,
          COUNT(CASE WHEN completeness_score >= 80 THEN 1 END)::int AS tier_excellent,
          COUNT(CASE WHEN completeness_score >= 60 AND completeness_score < 80 THEN 1 END)::int AS tier_good,
          COUNT(CASE WHEN completeness_score >= 40 AND completeness_score < 60 THEN 1 END)::int AS tier_partial,
          COUNT(CASE WHEN completeness_score >= 1 AND completeness_score < 40 THEN 1 END)::int AS tier_poor,
          COUNT(CASE WHEN completeness_score IS NULL OR completeness_score = 0 THEN 1 END)::int AS tier_unscored,
          -- target and MoA are drug/biologic concepts: denominator scoped to that class only
          ROUND(100.0 * COUNT(CASE WHEN asset_class = 'drug_biologic' AND target IS NOT NULL AND target NOT IN ('unknown','') THEN 1 END)
            / NULLIF(COUNT(CASE WHEN asset_class = 'drug_biologic' THEN 1 END),0), 1) AS fill_target,
          ROUND(100.0 * COUNT(CASE WHEN indication IS NOT NULL AND indication NOT IN ('unknown','') THEN 1 END) / NULLIF(COUNT(*),0), 1) AS fill_indication,
          ROUND(100.0 * COUNT(CASE WHEN modality IS NOT NULL AND modality NOT IN ('unknown','') THEN 1 END) / NULLIF(COUNT(*),0), 1) AS fill_modality,
          ROUND(100.0 * COUNT(CASE WHEN development_stage IS NOT NULL AND development_stage NOT IN ('unknown','') THEN 1 END) / NULLIF(COUNT(*),0), 1) AS fill_stage,
          ROUND(100.0 * COUNT(CASE WHEN licensing_readiness IS NOT NULL AND licensing_readiness NOT IN ('unknown','') THEN 1 END) / NULLIF(COUNT(*),0), 1) AS fill_licensing,
          ROUND(100.0 * COUNT(CASE WHEN ip_type IS NOT NULL AND ip_type NOT IN ('unknown','') THEN 1 END) / NULLIF(COUNT(*),0), 1) AS fill_patent,
          ROUND(100.0 * COUNT(CASE WHEN biology IS NOT NULL AND biology NOT IN ('unknown','','other') THEN 1 END) / NULLIF(COUNT(*),0), 1) AS fill_biology,
          ROUND(100.0 * COUNT(CASE WHEN asset_class = 'drug_biologic' AND mechanism_of_action IS NOT NULL AND mechanism_of_action NOT IN ('unknown','') THEN 1 END)
            / NULLIF(COUNT(CASE WHEN asset_class = 'drug_biologic' THEN 1 END),0), 1) AS fill_moa,
          COUNT(CASE WHEN first_seen_at >= NOW() - INTERVAL '7 days' THEN 1 END)::int AS added_7d,
          COUNT(CASE WHEN first_seen_at >= NOW() - INTERVAL '30 days' THEN 1 END)::int AS added_30d
        FROM ingested_assets
        WHERE relevant = true
      `),
        db.execute(sql`
        SELECT
          COALESCE(institution, 'Unknown') AS institution,
          COUNT(*)::int AS relevant_count,
          ROUND(AVG(completeness_score)::numeric, 1) AS avg_completeness,
          ROUND(100.0 * COUNT(CASE WHEN target IS NOT NULL AND target NOT IN ('unknown','') THEN 1 END) / NULLIF(COUNT(*),0), 1) AS fill_target,
          ROUND(100.0 * COUNT(CASE WHEN indication IS NOT NULL AND indication NOT IN ('unknown','') THEN 1 END) / NULLIF(COUNT(*),0), 1) AS fill_indication,
          ROUND(100.0 * COUNT(CASE WHEN biology IS NOT NULL AND biology NOT IN ('unknown','','other') THEN 1 END) / NULLIF(COUNT(*),0), 1) AS fill_biology,
          ROUND(100.0 * COUNT(CASE WHEN mechanism_of_action IS NOT NULL AND mechanism_of_action NOT IN ('unknown','') THEN 1 END) / NULLIF(COUNT(*),0), 1) AS fill_moa
        FROM ingested_assets
        WHERE relevant = true
        GROUP BY institution
        ORDER BY COUNT(*) DESC
        LIMIT 500
      `),
      ]);

      res.json({
        global: { ...globalResult.rows[0], total_relevant: totalRelevant },
        institutions: institutionResult.rows,
      });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch dataset quality" });
    }
  });

  // --- By Asset Class Fill-Rate ---

  app.get("/api/admin/dataset-quality/by-class", async (req, res) => {
    try {

      const result = await db.execute(sql`
        SELECT
          COALESCE(asset_class, 'unclassified') AS asset_class,
          COUNT(*)::int AS count,
          ROUND(AVG(completeness_score)::numeric, 1) AS avg_score,
          ROUND(100.0 * COUNT(CASE WHEN target IS NOT NULL AND target NOT IN ('unknown','') THEN 1 END) / NULLIF(COUNT(*), 0), 1) AS fill_target,
          ROUND(100.0 * COUNT(CASE WHEN modality IS NOT NULL AND modality NOT IN ('unknown','') THEN 1 END) / NULLIF(COUNT(*), 0), 1) AS fill_modality,
          ROUND(100.0 * COUNT(CASE WHEN indication IS NOT NULL AND indication NOT IN ('unknown','') THEN 1 END) / NULLIF(COUNT(*), 0), 1) AS fill_indication,
          ROUND(100.0 * COUNT(CASE WHEN development_stage IS NOT NULL AND development_stage NOT IN ('unknown','') THEN 1 END) / NULLIF(COUNT(*), 0), 1) AS fill_stage,
          COUNT(CASE WHEN data_sparse = true THEN 1 END)::int AS sparse_count
        FROM ingested_assets
        WHERE relevant = true
        GROUP BY asset_class
        ORDER BY COUNT(*) DESC
      `);

      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch class breakdown" });
    }
  });

  // --- Dimensional Analytics ---

  app.get("/api/admin/dataset-quality/dimensions", async (req, res) => {
    try {

      const dim = String(req.query.dim ?? "modality");
      const col = DIM_COL[dim];
      if (!col) return res.status(400).json({ error: "Invalid dim – use modality, stage, indication, or biology" });

      const rows = await db.execute(sql`
        SELECT
          COALESCE(${sql.raw(col)}, 'unknown') AS value,
          COUNT(*)::int AS count,
          ROUND(AVG(completeness_score)::numeric, 1) AS avg_completeness,
          ROUND(100.0 * COUNT(CASE WHEN target IS NOT NULL AND target NOT IN ('unknown','') THEN 1 END) / NULLIF(COUNT(*),0), 1) AS fill_target,
          ROUND(100.0 * COUNT(CASE WHEN indication IS NOT NULL AND indication NOT IN ('unknown','') THEN 1 END) / NULLIF(COUNT(*),0), 1) AS fill_indication,
          ROUND(100.0 * COUNT(CASE WHEN biology IS NOT NULL AND biology NOT IN ('unknown','','other') THEN 1 END) / NULLIF(COUNT(*),0), 1) AS fill_biology
        FROM ingested_assets
        WHERE relevant = true
        GROUP BY ${sql.raw(col)}
        ORDER BY COUNT(*) DESC
        LIMIT 20
      `);

      res.json({ dim, rows: rows.rows });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch dimensions" });
    }
  });

  app.get("/api/admin/dataset-quality/dimensions/export", async (req, res) => {
    try {

      const dim = String(req.query.dim ?? "modality");
      const col = DIM_COL[dim];
      if (!col) return res.status(400).json({ error: "Invalid dim" });

      const rows = await db.execute(sql`
        SELECT
          COALESCE(${sql.raw(col)}, 'unknown') AS value,
          COUNT(*)::int AS count,
          ROUND(AVG(completeness_score)::numeric, 1) AS avg_completeness,
          ROUND(100.0 * COUNT(CASE WHEN target IS NOT NULL AND target NOT IN ('unknown','') THEN 1 END) / NULLIF(COUNT(*),0), 1) AS fill_target,
          ROUND(100.0 * COUNT(CASE WHEN indication IS NOT NULL AND indication NOT IN ('unknown','') THEN 1 END) / NULLIF(COUNT(*),0), 1) AS fill_indication,
          ROUND(100.0 * COUNT(CASE WHEN biology IS NOT NULL AND biology NOT IN ('unknown','','other') THEN 1 END) / NULLIF(COUNT(*),0), 1) AS fill_biology
        FROM ingested_assets
        WHERE relevant = true
        GROUP BY ${sql.raw(col)}
        ORDER BY COUNT(*) DESC
      `);

      const escape = (v: unknown) => {
        if (v == null) return "";
        const s = String(v).replace(/"/g, '""');
        return s.includes(",") || s.includes("\n") || s.includes('"') ? `"${s}"` : s;
      };

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="dimension-${dim}.csv"`);
      res.write("value,count,avg_completeness,fill_target,fill_indication,fill_biology\n");
      for (const row of rows.rows as Record<string, unknown>[]) {
        res.write([escape(row.value), escape(row.count), escape(row.avg_completeness), escape(row.fill_target), escape(row.fill_indication), escape(row.fill_biology)].join(",") + "\n");
      }
      res.end();
    } catch (err: any) {
      res.status(500).json({ error: "Export failed" });
    }
  });

  // ── Confidence Distribution + Save-Rate by Confidence (Task #693) ─────────
  // Surfaces (a) how the classifier's confidence is distributed across the
  // corpus and (b) whether higher-confidence rows are actually saved more
  // often by users – a feedback loop for tuning the confidence-aware ranker.
  app.get("/api/admin/dataset-quality/confidence-distribution", async (_req, res) => {
    try {
      const histogram = await db.execute(sql`
        SELECT
          bucket,
          COUNT(*)::int AS count,
          ROUND(AVG(completeness_score)::numeric, 1) AS avg_completeness
        FROM (
          SELECT
            completeness_score,
            CASE
              WHEN category_confidence IS NULL THEN 'unscored'
              WHEN category_confidence < 0.2 THEN '0.0-0.2'
              WHEN category_confidence < 0.4 THEN '0.2-0.4'
              WHEN category_confidence < 0.6 THEN '0.4-0.6'
              WHEN category_confidence < 0.8 THEN '0.6-0.8'
              ELSE '0.8-1.0'
            END AS bucket
          FROM ingested_assets
          WHERE relevant = true
        ) b
        GROUP BY bucket
        ORDER BY
          CASE bucket
            WHEN '0.0-0.2' THEN 1 WHEN '0.2-0.4' THEN 2 WHEN '0.4-0.6' THEN 3
            WHEN '0.6-0.8' THEN 4 WHEN '0.8-1.0' THEN 5 ELSE 6
          END
      `);

      const saveRate = await db.execute(sql`
        SELECT
          bucket,
          COUNT(DISTINCT ia.id)::int AS asset_count,
          COUNT(DISTINCT CASE WHEN s.id IS NOT NULL THEN ia.id END)::int AS saved_asset_count,
          ROUND(
            100.0 * COUNT(DISTINCT CASE WHEN s.id IS NOT NULL THEN ia.id END)
              / NULLIF(COUNT(DISTINCT ia.id), 0),
            1
          ) AS save_rate_pct
        FROM (
          SELECT
            id,
            CASE
              WHEN category_confidence IS NULL THEN 'unscored'
              WHEN category_confidence < 0.2 THEN '0.0-0.2'
              WHEN category_confidence < 0.4 THEN '0.2-0.4'
              WHEN category_confidence < 0.6 THEN '0.4-0.6'
              WHEN category_confidence < 0.8 THEN '0.6-0.8'
              ELSE '0.8-1.0'
            END AS bucket
          FROM ingested_assets
          WHERE relevant = true
        ) ia
        LEFT JOIN saved_assets s ON s.ingested_asset_id = ia.id
        GROUP BY bucket
        ORDER BY
          CASE bucket
            WHEN '0.0-0.2' THEN 1 WHEN '0.2-0.4' THEN 2 WHEN '0.4-0.6' THEN 3
            WHEN '0.6-0.8' THEN 4 WHEN '0.8-1.0' THEN 5 ELSE 6
          END
      `);

      res.json({
        histogram: histogram.rows,
        saveRate: saveRate.rows,
      });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch confidence distribution" });
    }
  });

  app.get("/api/admin/dataset-quality/institution/:name", async (req, res) => {
    try {

      const institutionName = req.params.name;
      const rows = await db.execute(sql`
        SELECT id, asset_name, target, indication, modality, development_stage, completeness_score
        FROM ingested_assets
        WHERE relevant = true
          AND COALESCE(institution, 'Unknown') = ${institutionName}
        ORDER BY completeness_score ASC NULLS FIRST
        LIMIT 5
      `);

      res.json({ assets: rows.rows });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch institution assets" });
    }
  });

  // --- CSV Exports (relevant=true only) ---

  app.get("/api/admin/export/unenriched-csv", async (req, res) => {
    try {

      const rows = await db.execute(sql`
        SELECT id, asset_name, abstract, summary, source_name
        FROM ingested_assets
        WHERE relevant = true AND completeness_score IS NULL
        ORDER BY id
      `);

      const escape = (v: unknown) => {
        if (v == null) return "";
        const s = String(v).replace(/"/g, '""');
        return s.includes(",") || s.includes("\n") || s.includes('"') ? `"${s}"` : s;
      };

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", "attachment; filename=\"unenriched-relevant-assets.csv\"");

      res.write("id,asset_name,abstract,summary,source_name\n");
      for (const row of rows.rows as Record<string, unknown>[]) {
        res.write(`${escape(row.id)},${escape(row.asset_name)},${escape(row.abstract)},${escape(row.summary)},${escape(row.source_name)}\n`);
      }
      res.end();
    } catch (err: any) {
      res.status(500).json({ error: "Export failed" });
    }
  });

  app.get("/api/admin/export/full-relevant-csv", async (req, res) => {
    try {

      const rows = await db.execute(sql`
        SELECT id, asset_name, source_name, target, indication, modality, development_stage,
               licensing_readiness, ip_type, completeness_score,
               abstract, summary, source_url, first_seen_at
        FROM ingested_assets
        WHERE relevant = true
        ORDER BY completeness_score DESC NULLS LAST
      `);

      const escape = (v: unknown) => {
        if (v == null) return "";
        const s = String(v).replace(/"/g, '""');
        return s.includes(",") || s.includes("\n") || s.includes('"') ? `"${s}"` : s;
      };

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", "attachment; filename=\"all-relevant-assets.csv\"");

      res.write("id,asset_name,source_name,target,indication,modality,development_stage,licensing_readiness,ip_type,completeness_score,abstract,summary,source_url,first_seen_at\n");
      for (const row of rows.rows as Record<string, unknown>[]) {
        res.write([
          escape(row.id), escape(row.asset_name), escape(row.source_name),
          escape(row.target), escape(row.indication), escape(row.modality),
          escape(row.development_stage), escape(row.licensing_readiness), escape(row.ip_type),
          escape(row.completeness_score), escape(row.abstract), escape(row.summary),
          escape(row.source_url), escape(row.first_seen_at),
        ].join(",") + "\n");
      }
      res.end();
    } catch (err: any) {
      res.status(500).json({ error: "Export failed" });
    }
  });

  // --- Asset Browser ---

  app.get("/api/admin/assets/filter-values", async (req, res) => {
    try {

      const [modRows, stageRows] = await Promise.all([
        db.execute(sql`
          SELECT DISTINCT modality AS value FROM ingested_assets
          WHERE relevant = true AND modality IS NOT NULL AND modality NOT IN ('unknown','')
          ORDER BY modality ASC LIMIT 80
        `),
        db.execute(sql`
          SELECT DISTINCT development_stage AS value FROM ingested_assets
          WHERE relevant = true AND development_stage IS NOT NULL AND development_stage NOT IN ('unknown','')
          ORDER BY development_stage ASC LIMIT 40
        `),
      ]);

      res.json({
        modalities: (modRows.rows as { value: string }[]).map(r => r.value),
        stages: (stageRows.rows as { value: string }[]).map(r => r.value),
      });
    } catch (err: any) {
      res.status(500).json({ error: "Failed" });
    }
  });

  app.get("/api/admin/assets", async (req, res) => {
    try {

      const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
      const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10)));
      const offset = (page - 1) * limit;

      const sortParam = String(req.query.sort ?? "score");
      const dirParam = String(req.query.dir ?? "desc").toLowerCase() === "asc" ? "ASC" : "DESC";
      const sortCol = sortParam === "name" ? "asset_name" : sortParam === "date" ? "first_seen_at" : "completeness_score";
      const nullsClause = sortCol === "completeness_score" ? "NULLS LAST" : "";

      const where = buildAssetWhere(req.query as Record<string, any>);

      const [countRes, globalRes, rowsRes] = await Promise.all([
        db.execute(sql`SELECT COUNT(*)::int AS total FROM ingested_assets WHERE ${where}`),
        db.execute(sql`SELECT COUNT(*)::int AS global_total FROM ingested_assets WHERE relevant = true`),
        db.execute(sql`
          SELECT id, asset_name, institution, target, indication, modality, development_stage,
                 ip_type, licensing_readiness, completeness_score, mechanism_of_action,
                 innovation_claim, unmet_need, comparable_drugs, source_url, abstract, summary,
                 first_seen_at, enriched_at, patent_status, categories, inventors,
                 human_verified, enrichment_sources
          FROM ingested_assets
          WHERE ${where}
          ORDER BY ${sql.raw(sortCol)} ${sql.raw(dirParam)} ${sql.raw(nullsClause)}
          LIMIT ${limit} OFFSET ${offset}
        `),
      ]);

      res.json({
        total: (countRes.rows[0] as any).total,
        globalTotal: (globalRes.rows[0] as any).global_total,
        page,
        limit,
        assets: rowsRes.rows,
      });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch assets" });
    }
  });

  app.get("/api/admin/assets/export", async (req, res) => {
    try {

      const where = buildAssetWhere(req.query as Record<string, any>);

      const rows = await db.execute(sql`
        SELECT id, asset_name, institution, target, indication, modality, development_stage,
               ip_type, licensing_readiness, completeness_score, mechanism_of_action,
               innovation_claim, unmet_need, comparable_drugs, source_url, abstract, summary,
               first_seen_at
        FROM ingested_assets
        WHERE ${where}
        ORDER BY completeness_score DESC NULLS LAST
      `);

      const escape = (v: unknown) => {
        if (v == null) return "";
        const s = String(v).replace(/"/g, '""');
        return s.includes(",") || s.includes("\n") || s.includes('"') ? `"${s}"` : s;
      };

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", "attachment; filename=\"assets-export.csv\"");
      res.write("id,asset_name,institution,target,indication,modality,development_stage,ip_type,licensing_readiness,completeness_score,mechanism_of_action,innovation_claim,unmet_need,comparable_drugs,source_url,abstract,summary,first_seen_at\n");
      for (const row of rows.rows as Record<string, unknown>[]) {
        res.write([
          escape(row.id), escape(row.asset_name), escape(row.institution),
          escape(row.target), escape(row.indication), escape(row.modality),
          escape(row.development_stage), escape(row.ip_type), escape(row.licensing_readiness),
          escape(row.completeness_score), escape(row.mechanism_of_action), escape(row.innovation_claim),
          escape(row.unmet_need), escape(row.comparable_drugs), escape(row.source_url),
          escape(row.abstract), escape(row.summary), escape(row.first_seen_at),
        ].join(",") + "\n");
      }
      res.end();
    } catch (err: any) {
      res.status(500).json({ error: "Export failed" });
    }
  });

  app.patch("/api/admin/assets/:id", async (req, res) => {
    try {

      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

      const existingRes = await db.execute(sql`
        SELECT target, indication, modality, development_stage, ip_type, licensing_readiness,
               mechanism_of_action, innovation_claim, unmet_need, comparable_drugs, summary, abstract,
               categories, inventors, patent_status, asset_class, device_attributes, source_type
        FROM ingested_assets WHERE id = ${id}
      `);
      if (existingRes.rows.length === 0) return res.status(404).json({ error: "Not found" });
      const existing = existingRes.rows[0] as Record<string, any>;

      const body = req.body ?? {};
      const editableFields = ["target", "indication", "modality", "development_stage", "ip_type",
        "licensing_readiness", "mechanism_of_action", "innovation_claim", "unmet_need",
        "comparable_drugs", "summary", "abstract"];

      const merged: Record<string, any> = {};
      for (const f of editableFields) {
        merged[f] = (f in body) ? (body[f] ?? null) : (existing[f] ?? null);
      }

      const score = computeCompletenessScore({
        assetClass: existing.asset_class ?? null,
        deviceAttributes: existing.device_attributes ?? null,
        target: merged.target,
        modality: merged.modality,
        indication: merged.indication,
        developmentStage: merged.development_stage,
        summary: merged.summary,
        abstract: merged.abstract,
        categories: existing.categories ?? null,
        innovationClaim: merged.innovation_claim,
        mechanismOfAction: merged.mechanism_of_action,
        inventors: existing.inventors ?? null,
        patentStatus: existing.patent_status ?? null,
        ipType: merged.ip_type ?? null,
        sourceType: existing.source_type ?? null,
      });

      await db.execute(sql`
        UPDATE ingested_assets SET
          target = ${merged.target},
          indication = ${merged.indication},
          modality = ${merged.modality},
          development_stage = ${merged.development_stage},
          ip_type = ${merged.ip_type},
          licensing_readiness = ${merged.licensing_readiness},
          mechanism_of_action = ${merged.mechanism_of_action},
          innovation_claim = ${merged.innovation_claim},
          unmet_need = ${merged.unmet_need},
          comparable_drugs = ${merged.comparable_drugs},
          summary = ${merged.summary},
          abstract = ${merged.abstract},
          completeness_score = ${score},
          enriched_at = NOW()
        WHERE id = ${id}
      `);

      const updatedRes = await db.execute(sql`
        SELECT id, asset_name, institution, target, indication, modality, development_stage,
               ip_type, licensing_readiness, completeness_score, mechanism_of_action,
               innovation_claim, unmet_need, comparable_drugs, source_url, abstract, summary,
               first_seen_at, enriched_at, patent_status, categories, inventors
        FROM ingested_assets WHERE id = ${id}
      `);

      res.json({ asset: updatedRes.rows[0] });
    } catch (err: any) {
      res.status(500).json({ error: "Patch failed" });
    }
  });

  app.get("/api/admin/enrichment/status", async (req, res) => {

    const lastJob = await storage.getLatestEnrichmentJob();

    if (enrichJob.running && lastJob && enrichJobId === lastJob.id) {
      return res.json({
        status: "running",
        jobId: lastJob.id,
        processed: enrichJob.processed,
        total: enrichTotal,
        improved: enrichImproved,
        resumed: enrichResumed,
        tokenCost: enrichTokenCost,
        filters: Object.keys(enrichFilters).length > 0 ? enrichFilters : undefined,
      });
    }

    if (lastJob) {
      // "completed" is the reset/dismissed state – treat as idle for UI purposes
      if (lastJob.status === "completed") {
        return res.json({ status: "idle", processed: 0, total: 0, improved: 0, resumed: false });
      }
      // For cost: prefer in-memory (accurate for current run), fall back to DB-persisted value
      // (survives server restarts). lastRunTokenCost resets to 0 on restart, so use DB when 0.
      const persistedCost = lastJob.tokenCostUsd != null ? parseFloat(String(lastJob.tokenCostUsd)) : 0;
      const tokenCost = lastJob.status === "done"
        ? (lastRunTokenCost > 0 ? lastRunTokenCost : persistedCost)
        : undefined;
      return res.json({
        status: lastJob.status as string,
        jobId: lastJob.id,
        processed: lastJob.processed,
        total: lastJob.total,
        improved: lastJob.improved,
        resumed: false,
        tokenCost,
      });
    }

    res.json({ status: "idle", processed: 0, total: 0, improved: 0, resumed: false });
  });

  app.post("/api/admin/enrichment/reset", async (req, res) => {
    try {
      if (enrichJob.running) {
        return res.status(409).json({ error: "Cannot reset while enrichment is running" });
      }
      await storage.resetLatestEnrichmentJob();
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to reset enrichment status" });
    }
  });

  app.get("/api/admin/enrichment/health", async (req, res) => {
    try {
      // readyCount uses getFilteredEnrichCount({}) so it always matches the
      // /count endpoint and the run-button label – same buildEnrichWhere criteria.
      type AuxRow = { needs_refetch_count: number; gave_up_count: number; enriched_24h_count: number };
      const [countResult, auxRows] = await Promise.all([
        storage.getFilteredEnrichCount({}),
        db.execute<AuxRow>(sql`
          SELECT
            COUNT(*) FILTER (
              WHERE relevant = true
                AND (data_sparse IS NULL OR data_sparse = false)
                AND char_length(COALESCE(summary, '') || COALESCE(abstract, '')) < 120
            )::int AS needs_refetch_count,
            COUNT(*) FILTER (
              WHERE relevant = true
                AND COALESCE(mini_enrich_attempts, 0) >= 3
            )::int AS gave_up_count,
            COUNT(*) FILTER (
              WHERE relevant = true
                AND enriched_at > NOW() - INTERVAL '24 hours'
            )::int AS enriched_24h_count
          FROM ingested_assets
        `),
      ]);
      const row = auxRows.rows[0];
      res.json({
        readyCount: countResult.count,
        needsRefetchCount: row.needs_refetch_count ?? 0,
        gaveUpCount: row.gave_up_count ?? 0,
        enriched24hCount: row.enriched_24h_count ?? 0,
      });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch enrichment health" });
    }
  });

  app.get("/api/admin/enrichment/count", async (req, res) => {
    try {
      const filters: EnrichFilter = {};
      if (req.query.institution) filters.institution = String(req.query.institution);
      if (req.query.modality) filters.modality = String(req.query.modality);
      if (req.query.stage) filters.stage = String(req.query.stage);
      if (req.query.indication) filters.indication = String(req.query.indication);
      if (req.query.tier) filters.tier = String(req.query.tier);
      if (req.query.missingField) filters.missingField = String(req.query.missingField);
      const result = await storage.getFilteredEnrichCount(filters);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to count enrichment queue" });
    }
  });

  app.get("/api/admin/enrichment/jobs", async (req, res) => {
    try {
      const institution = req.query.institution ? String(req.query.institution) : undefined;
      if (!institution) return res.status(400).json({ error: "institution query param required" });
      const jobs = await storage.getEnrichmentJobsForInstitution(institution);
      res.json(jobs);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch enrichment jobs" });
    }
  });

  app.post("/api/admin/enrichment/run", async (req, res) => {
    try {

      if (enrichJob.running) {
        return res.status(409).json({ error: "Enrichment job already running" });
      }

      const existingJob = await storage.getRunningEnrichmentJob();
      if (existingJob) {
        return res.status(409).json({ error: "Enrichment job already running – resume manually from the Data Quality tab if interrupted" });
      }

      const runSchema = z.object({
        all: z.boolean().default(false),
        institution: z.string().optional(),
        modality: z.string().optional(),
        stage: z.string().optional(),
        indication: z.string().optional(),
        tier: z.string().optional(),
        missingField: z.string().optional(),
      });
      // ?all=1 query param takes precedence over body
      const body = runSchema.parse(req.body ?? {});
      const drainAll = req.query.all === "1" || body.all;

      const filters: EnrichFilter = {};
      if (body.institution) filters.institution = body.institution;
      if (body.modality) filters.modality = body.modality;
      if (body.stage) filters.stage = body.stage;
      if (body.indication) filters.indication = body.indication;
      if (body.tier) filters.tier = body.tier;
      if (body.missingField) filters.missingField = body.missingField;

      const MINI_BATCH_CAP = 500;
      const assets = await storage.getMiniEnrichBatch(MINI_BATCH_CAP, filters);
      if (assets.length === 0) {
        return res.json({ message: "No assets in mini-enrich queue matching filters" });
      }

      // When the batch is capped, compute how many assets remain after this run.
      let deferred = 0;
      if (assets.length === MINI_BATCH_CAP) {
        const { count: totalCount } = await storage.getFilteredEnrichCount(filters);
        deferred = Math.max(0, totalCount - MINI_BATCH_CAP);
      }

      // Capture avg_completeness before the run so we can compute the delta on completion.
      let completenessBeforeRun: number | null = null;
      if (filters.institution) {
        try {
          const quality = await storage.getInstitutionEnrichmentQuality(filters.institution);
          completenessBeforeRun = quality.avgCompletenessScore;
        } catch { /* non-fatal */ }
      }

      const job = await storage.createEnrichmentJob(
        assets.length,
        Object.keys(filters).length > 0 ? filters as Record<string, string> : undefined,
        completenessBeforeRun,
      );
      res.json({ message: drainAll ? "Drain enrichment started" : "Enrichment started", total: assets.length, deferred, jobId: job.id, drain: drainAll, filters });

      runEnrichmentWorker(job.id, assets, 0, 0, false, drainAll, filters);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to start enrichment" });
    }
  });

  app.post("/api/admin/enrichment/stop", async (req, res) => {
    if (!enrichJob.running) return res.json({ message: "No standard enrichment running" });
    enrichJob.requestStop();
    res.json({ message: "Stop signal sent – finishing in-flight assets then halting" });
  });

  // On startup, mark any stale enrichment job as interrupted so the admin
  // can resume it manually from the Data Quality tab. Auto-resume is disabled
  // to prevent unbounded cost on server restart.
  setTimeout(async () => {
    try {
      const staleJob = await storage.getRunningEnrichmentJob();
      if (staleJob) {
        const remaining = await storage.getMiniEnrichBatch(500);
        if (remaining.length > 0) {
          console.log(`[enrichment] Stale job ${staleJob.id} (model=${staleJob.model}) detected (${remaining.length} assets remaining). Auto-resume disabled – resume from the Data Quality tab.`);
          await storage.updateEnrichmentJob(staleJob.id, { status: "interrupted" });
        } else {
          await storage.updateEnrichmentJob(staleJob.id, { status: "done", completedAt: new Date() });
          console.log(`[enrichment] Stale job ${staleJob.id} had no remaining work – marked done`);
        }
      }
    } catch (e) {
      console.error("[enrichment] Failed to check for stale jobs:", e);
    }
  }, 15_000);
}
