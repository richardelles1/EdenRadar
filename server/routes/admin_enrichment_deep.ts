import fs from "fs";
import path from "path";
import type { Express } from "express";
import { z } from "zod";
import { db, pool } from "../db";
import { sql } from "drizzle-orm";
import { storage } from "../storage";
import { deepEnrichBatch } from "../lib/pipeline/deepEnrichBatch";
import { embedAssets } from "../lib/pipeline/embedAssets";

// Re-fetch state persistence
const REFETCH_STATE_FILE = path.join(process.cwd(), ".local", "refetch-state.json");
let _refetchState: Record<string, unknown> = {};
try {
  _refetchState = JSON.parse(fs.readFileSync(REFETCH_STATE_FILE, "utf8"));
} catch {}
function saveRefetchState(key: string, value: unknown): void {
  try {
    _refetchState[key] = value;
    fs.mkdirSync(path.dirname(REFETCH_STATE_FILE), { recursive: true });
    fs.writeFileSync(REFETCH_STATE_FILE, JSON.stringify(_refetchState, null, 2));
  } catch (e) {
    console.warn("[refetch-state] Failed to persist state to disk:", e);
  }
}

// ── EDEN state ────────────────────────────────────────────────────────────────
let edenJobId: number | null = null;
let edenRunning = false;
let edenProcessed = 0;
let edenTotal = 0;
let edenImproved = 0;
let edenFailed = 0;
let edenSkipped = 0;
let edenShouldStop = false;
const _rawCap = parseInt(process.env.ENRICH_MAX_PER_CYCLE ?? "500", 10);
const ENRICH_MAX_PER_CYCLE = Number.isFinite(_rawCap) && _rawCap > 0 ? _rawCap : 500;
let edenLastCycleCount = 0;
let edenLastCycleDeferred = 0;
let edenStartMs = 0;
let edenSnapshotBefore: Record<number, string> = {};
let edenLastSummary: {
  succeeded: number; failed: number; skipped: number; total: number; deferred: number;
  durationMs: number; bandMovements: Record<string, number>; completedAt: string;
} | null = null;

// ── Classify state ────────────────────────────────────────────────────────────
let classifyRunning = false;
let classifyProcessed = 0;
let classifyTotal = 0;
let classifySucceeded = 0;
let classifyFailed = 0;
let classifySkipped = 0;
let classifyShouldStop = false;
let classifyInputTokens = 0;
let classifyOutputTokens = 0;
let classifyStartMs = 0;
let classifyLastSummary: {
  succeeded: number; failed: number; skipped: number; total: number;
  inputTokens: number; outputTokens: number; costUsd: number; durationMs: number; completedAt: string;
} | null = (_refetchState.classify as typeof classifyLastSummary) ?? null;

// ── Stage fill state ──────────────────────────────────────────────────────────
let stageFillRunning = false;
let stageFillProcessed = 0;
let stageFillTotal = 0;
let stageFillRegexFilled = 0;
let stageFillLlmFilled = 0;
let stageFillShouldStop = false;
let stageFillLastSummary: {
  regexFilled: number; llmFilled: number; rescored: number;
  costUsd: number; durationMs: number; completedAt: string;
} | null = null;

// ── Band enrichment state ─────────────────────────────────────────────────────
let bandRunning = false;
let bandBand = "";
let bandGapFill = false;
let bandProcessed = 0;
let bandTotal = 0;
let bandSucceeded = 0;
let bandFailed = 0;
let bandShouldStop = false;
let bandInputTokens = 0;
let bandOutputTokens = 0;
let bandFieldCounts: Record<string, number> = {};
let bandTargetFields: string[] = [];
let bandAvgScoreBefore: number | null = null;
let bandAssetIds: number[] = [];
let bandSnapshotBefore: Record<number, string> = {};
let bandLastSummary: {
  band: string; gapFill: boolean; total: number; succeeded: number; failed: number;
  inputTokens: number; outputTokens: number; costUsd: number; durationMs: number;
  fieldsFilledNames: string[];
  fieldFillCounts: Record<string, number>;
  avgScoreBefore: number | null;
  avgScoreAfter: number | null;
  bandMovements: Record<string, number>;
  completedAt: string;
} | null = null;

const BAND_SCORE_RANGES: Record<string, { min: number | null; max: number | null }> = {
  rich:       { min: 80,  max: null },
  decent:     { min: 60,  max: 79   },
  sparse:     { min: 40,  max: 59   },
  very_sparse:{ min: 1,   max: 39   },
  bare:       { min: null, max: 0   },
};

// ── Embed state ───────────────────────────────────────────────────────────────
let embedRunning = false;
let embedProcessed = 0;
let embedTotal = 0;
let embedSucceeded = 0;
let embedFailed = 0;

// ── Helpers ───────────────────────────────────────────────────────────────────
const scoreToBand = (score: number | null | undefined): string => {
  if (score == null || score === 0) return "bare";
  if (score >= 80) return "rich";
  if (score >= 60) return "decent";
  if (score >= 40) return "sparse";
  return "very_sparse";
};

const computeBandMovements = (
  before: Record<number, string>,
  rows: Array<{ id: number; completeness_score: number | null }>,
): Record<string, number> => {
  const movements: Record<string, number> = {};
  for (const row of rows) {
    const bnd = scoreToBand(row.completeness_score);
    const prev = before[row.id];
    if (prev && bnd !== prev) {
      const key = `${prev}→${bnd}`;
      movements[key] = (movements[key] ?? 0) + 1;
    }
  }
  return movements;
};

export function registerDeepEnrichmentRoutes(app: Express): void {

  // ── EDEN routes ───────────────────────────────────────────────────────────

  app.get("/api/admin/eden/stats", async (req, res) => {
    try {
      const [coverage, embeddingCoverage, latest, breakdown] = await Promise.all([
        storage.getDeepEnrichmentCoverage(),
        storage.getEmbeddingCoverage(),
        storage.getLatestDeepEnrichmentJob(),
        storage.getAssetsNeedingDeepEnrichBreakdown(),
      ]);
      res.json({
        coverage,
        embeddingCoverage,
        latestJob: latest ?? null,
        needingDeepEnrich: breakdown.total,
        breakdown,
        live: edenRunning ? { processed: edenProcessed, total: edenTotal } : null,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/admin/eden/analytics", async (req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') AS queries_24h,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')  AS queries_7d,
          COUNT(*) FILTER (WHERE intent = 'search'    AND created_at >= NOW() - INTERVAL '7 days') AS search_7d,
          COUNT(*) FILTER (WHERE intent = 'aggregation' AND created_at >= NOW() - INTERVAL '7 days') AS aggregation_7d,
          COUNT(*) FILTER (WHERE intent = 'conversational' AND created_at >= NOW() - INTERVAL '7 days') AS conversational_7d,
          COUNT(*) FILTER (WHERE intent = 'back_ref'  AND created_at >= NOW() - INTERVAL '7 days') AS back_ref_7d,
          COUNT(*) FILTER (WHERE intent = 'comparative' AND created_at >= NOW() - INTERVAL '7 days') AS comparative_7d,
          COUNT(*) FILTER (WHERE intent = 'definitional' AND created_at >= NOW() - INTERVAL '7 days') AS definitional_7d,
          COUNT(*) FILTER (WHERE empty_result = true AND intent = 'search' AND created_at >= NOW() - INTERVAL '7 days') AS empty_searches_7d,
          ROUND(AVG(latency_ms) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days'))::int AS avg_latency_ms_7d
        FROM eden_queries
      `);
      const feedbackResult = await db.execute(sql`
        SELECT
          COUNT(*) FILTER (WHERE sentiment = 'up'   AND created_at >= NOW() - INTERVAL '7 days') AS up_7d,
          COUNT(*) FILTER (WHERE sentiment = 'down' AND created_at >= NOW() - INTERVAL '7 days') AS down_7d
        FROM eden_message_feedback
      `);
      const row = result.rows[0] as Record<string, unknown>;
      const fb = feedbackResult.rows[0] as Record<string, unknown>;
      const search7d = Number(row.search_7d ?? 0);
      const empty7d = Number(row.empty_searches_7d ?? 0);
      res.json({
        queries24h: Number(row.queries_24h ?? 0),
        queries7d: Number(row.queries_7d ?? 0),
        intentBreakdown7d: {
          search: search7d,
          aggregation: Number(row.aggregation_7d ?? 0),
          conversational: Number(row.conversational_7d ?? 0),
          back_ref: Number(row.back_ref_7d ?? 0),
          comparative: Number(row.comparative_7d ?? 0),
          definitional: Number(row.definitional_7d ?? 0),
        },
        emptyResultRate7d: search7d > 0 ? Math.round((empty7d / search7d) * 100) : null,
        avgLatencyMs7d: Number(row.avg_latency_ms_7d ?? 0) || null,
        feedback7d: {
          up: Number(fb.up_7d ?? 0),
          down: Number(fb.down_7d ?? 0),
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/eden/enrich", async (req, res) => {
    if (edenRunning) return res.status(409).json({ error: "Deep enrichment already running" });
    try {
      const [assets, breakdown] = await Promise.all([
        storage.getAssetsNeedingDeepEnrich(),
        storage.getAssetsNeedingDeepEnrichBreakdown(),
      ]);
      if (assets.length === 0) return res.json({ message: "All relevant assets already deeply enriched", total: 0, breakdown: { fresh: 0, legacy: 0, lowQualityRetry: 0, nullCategory: 0, total: 0 } });

      const capped = assets.slice(0, ENRICH_MAX_PER_CYCLE);
      const deferred = assets.length - capped.length;
      if (deferred > 0) {
        console.log(`[EDEN] Per-cycle cap hit: processing ${capped.length} assets, deferring ${deferred} to next run (cap=${ENRICH_MAX_PER_CYCLE})`);
      }

      edenTotal = capped.length;
      edenProcessed = 0;
      edenRunning = true;
      edenShouldStop = false;
      edenImproved = 0;
      edenFailed = 0;
      edenSkipped = 0;
      edenStartMs = Date.now();

      // Snapshot band distribution of the assets we are about to process so we
      // can report band movements (e.g. bare→very_sparse) after the run.
      edenSnapshotBefore = {};
      try {
        const cappedIds = capped.map((a) => a.id);
        const snapRows = await db.execute<{ id: number; completeness_score: number | null }>(sql`
          SELECT id, completeness_score FROM ingested_assets WHERE id = ANY(${cappedIds}::int[])
        `);
        for (const r of snapRows.rows) edenSnapshotBefore[r.id] = scoreToBand(r.completeness_score);
      } catch (snapErr: any) { console.error("[EDEN] pre-run band snapshot failed:", snapErr?.message); }

      const job = await storage.createDeepEnrichmentJob(capped.length);
      edenJobId = job.id;

      res.json({ message: "Deep enrichment started", jobId: job.id, total: capped.length, totalAvailable: assets.length, deferred, breakdown });

      deepEnrichBatch(
        capped.map((a) => ({
          id: a.id,
          assetName: a.assetName,
          summary: a.summary,
          abstract: a.abstract,
          sourceType: a.sourceType,
          biology: a.biology,
          ctx: {
            categories: a.categories,
            patentStatus: a.patentStatus,
            licensingStatus: a.licensingStatus,
            inventors: a.inventors,
            sourceUrl: a.sourceUrl,
          },
        })),
        20,
        async (batch) => {
          return storage.bulkUpdateIngestedAssetsDeepEnrichment(batch, "deep");
        },
        (processed, _total, succeeded, failed, skipped) => {
          edenProcessed = processed;
          edenImproved = succeeded;
          edenFailed = failed;
          edenSkipped = skipped;
          if (edenJobId !== null) {
            storage.updateEnrichmentJob(edenJobId, { processed: succeeded + failed, improved: succeeded }).catch(() => {});
          }
        },
        () => edenShouldStop,
      ).then(async (batchResult) => {
        edenRunning = false;
        edenImproved = batchResult.succeeded;
        edenFailed = batchResult.failed;
        edenSkipped = batchResult.skipped;
        edenLastCycleCount = batchResult.succeeded;
        edenLastCycleDeferred = deferred;
        if (edenJobId !== null) {
          await storage.updateEnrichmentJob(edenJobId, {
            status: edenShouldStop ? "stopped" : "done",
            completedAt: new Date(),
            processed: batchResult.succeeded + batchResult.failed,
            improved: batchResult.succeeded,
          }).catch(() => {});
        }
        const edenDurationMs = Date.now() - edenStartMs;
        // Compute band movements by re-querying the same asset IDs post-run
        let edenBandMovements: Record<string, number> = {};
        try {
          const cappedIds = Object.keys(edenSnapshotBefore).map(Number);
          if (cappedIds.length > 0) {
            const postRows = await db.execute<{ id: number; completeness_score: number | null }>(sql`
              SELECT id, completeness_score FROM ingested_assets WHERE id = ANY(${cappedIds}::int[])
            `);
            edenBandMovements = computeBandMovements(edenSnapshotBefore, postRows.rows);
          }
        } catch { /* non-fatal */ }
        edenLastSummary = {
          succeeded: batchResult.succeeded,
          failed: batchResult.failed,
          skipped: batchResult.skipped,
          total: edenTotal,
          deferred,
          durationMs: edenDurationMs,
          bandMovements: edenBandMovements,
          completedAt: new Date().toISOString(),
        };
        storage.saveEnrichmentRun("eden", edenLastSummary as unknown as Record<string, unknown>).catch(() => {});
        console.log(`[EDEN] Deep enrichment ${edenShouldStop ? "stopped" : "complete"}: ${batchResult.succeeded} enriched, ${batchResult.failed} failed, ${batchResult.skipped} skipped (thin content)`);
        // Automatically trigger near-duplicate detection after enrichment completes
        if (!edenShouldStop) {
          storage.runNearDuplicateDetection((msg) => console.log(`[dedup/post-enrich] ${msg}`))
            .then((r) => console.log(`[dedup/post-enrich] Done: ${r.flagged} flagged, ${r.embedded} embedded`))
            .catch((e: any) => console.error("[dedup/post-enrich] Failed:", e?.message));
        }
      }).catch(async (e) => {
        edenRunning = false;
        if (edenJobId !== null) {
          await storage.updateEnrichmentJob(edenJobId, { status: "failed", completedAt: new Date(), processed: edenProcessed, improved: edenImproved }).catch(() => {});
        }
        console.error("[EDEN] Deep enrichment failed:", e);
      });
    } catch (err: any) {
      edenRunning = false;
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/admin/eden/enrich/status", async (req, res) => {
    try {
      const latest = await storage.getLatestDeepEnrichmentJob();
      // staleJobDetected: a job was in-progress when the server last restarted and
      // has not been resumed or completed. The admin must explicitly resume it.
      const staleJob = !edenRunning ? await storage.getRunningDeepEnrichmentJob() : null;
      const staleJobDetected = staleJob !== null && staleJob !== undefined;
      // Lazy-load from DB if in-memory summary was cleared by a server restart
      if (edenLastSummary === null) {
        try {
          const stored = await storage.getLastEnrichmentRun("eden");
          if (stored) edenLastSummary = stored as unknown as typeof edenLastSummary;
        } catch { /* non-fatal */ }
      }
      res.json({
        running: edenRunning,
        capPerCycle: ENRICH_MAX_PER_CYCLE,
        processed: edenProcessed,
        total: edenTotal,
        succeeded: edenImproved,
        failed: edenFailed,
        skipped: edenSkipped,
        lastCycleCount: edenLastCycleCount,
        lastCycleDeferred: edenLastCycleDeferred,
        job: latest ?? null,
        staleJobDetected,
        staleJobId: staleJob?.id ?? null,
        lastSummary: edenLastSummary,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/eden/enrich/stop", async (req, res) => {
    if (!edenRunning) return res.json({ message: "No EDEN enrichment running" });
    edenShouldStop = true;
    res.json({ message: "Stop signal sent – finishing in-flight batch then halting" });
  });

  // ── Classify Unclassified (Step 2b) ──────────────────────────────────────
  // Targets all relevant assets where asset_class IS NULL (never deep-enriched).
  // deepEnrichBatch model routing: <40 chars → skip; 40–119 → gpt-4o-mini lite;
  // 120–599 → gpt-4o-mini full; ≥600 → gpt-4o (abstracts only).

  app.get("/api/admin/enrichment/classify-unclassified/count", async (req, res) => {
    try {
      const rows = await db.execute<{
        thick_count: string; thin_count: string; too_thin_count: string; total_processable: string; exhausted_count: string;
      }>(sql`
        SELECT
          COUNT(*) FILTER (WHERE length(COALESCE(summary, asset_name, '')) >= 120 AND classify_attempts < 3)::int AS thick_count,
          COUNT(*) FILTER (WHERE length(COALESCE(summary, asset_name, '')) BETWEEN 40 AND 119 AND classify_attempts < 3)::int AS thin_count,
          COUNT(*) FILTER (WHERE length(COALESCE(summary, asset_name, '')) < 40)::int AS too_thin_count,
          COUNT(*) FILTER (WHERE length(COALESCE(summary, asset_name, '')) >= 40 AND classify_attempts < 3)::int AS total_processable,
          COUNT(*) FILTER (WHERE classify_attempts >= 3)::int AS exhausted_count
        FROM ingested_assets
        WHERE relevant = true AND (asset_class IS NULL OR asset_class = '')
      `);
      const r = rows.rows[0] ?? { thick_count: "0", thin_count: "0", too_thin_count: "0", total_processable: "0", exhausted_count: "0" };
      const thick = parseInt(r.thick_count, 10);
      const thin = parseInt(r.thin_count, 10);
      const tooThin = parseInt(r.too_thin_count, 10);
      const total = parseInt(r.total_processable, 10);
      const exhausted = parseInt(r.exhausted_count, 10);
      // Cost: thick → gpt-4o ($2.50/1M input, $10/1M output, ~853 in + 400 out tokens)
      //       thin  → gpt-4o-mini ($0.15/1M input, $0.60/1M output, ~732 in + 200 out tokens)
      const estCost = parseFloat((
        thick * (853 * 2.50 + 400 * 10.0) / 1_000_000 +
        thin  * (732 * 0.15 + 200 *  0.60) / 1_000_000
      ).toFixed(2));
      res.json({ thick, thin, tooThin, total, estCost, exhausted });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/admin/enrichment/classify-unclassified/status", async (req, res) => {
    const GPT4O_INPUT_PER_M = 2.50;
    const GPT4O_OUTPUT_PER_M = 10.0;
    const liveCostUsd = (classifyInputTokens * GPT4O_INPUT_PER_M + classifyOutputTokens * GPT4O_OUTPUT_PER_M) / 1_000_000;
    res.json({
      running: classifyRunning,
      processed: classifyProcessed,
      total: classifyTotal,
      succeeded: classifySucceeded,
      failed: classifyFailed,
      skipped: classifySkipped,
      liveCostUsd: parseFloat(liveCostUsd.toFixed(4)),
      lastSummary: classifyLastSummary,
    });
  });

  app.post("/api/admin/enrichment/classify-unclassified/stop", async (req, res) => {
    if (!classifyRunning) return res.json({ message: "No classify run in progress" });
    classifyShouldStop = true;
    res.json({ message: "Stop signal sent" });
  });

  app.post("/api/admin/enrichment/classify-unclassified", async (req, res) => {
    if (classifyRunning) return res.status(409).json({ error: "Classify run already in progress" });
    if (bandRunning) return res.status(409).json({ error: "Band enrichment is running – stop it first" });
    if (edenRunning) return res.status(409).json({ error: "Eden deep enrichment is running – stop it first" });

    try {
      const { cap: rawCap } = z.object({ cap: z.number().int().min(10).max(50000).default(30000) }).parse(req.body ?? {});
      const cap = rawCap;

      const rows = await db.execute<{
        id: number; asset_name: string; summary: string; abstract: string | null;
        categories: string[] | null; patent_status: string | null; licensing_readiness: string | null;
        inventors: string[] | null; source_url: string | null; source_type: string; biology: string | null;
      }>(sql`
        SELECT id, asset_name, summary, abstract, categories, patent_status,
               licensing_readiness, inventors, source_url, source_type, biology
        FROM ingested_assets
        WHERE relevant = true
          AND (asset_class IS NULL OR asset_class = '')
          AND length(COALESCE(summary, asset_name, '')) >= 40
          AND classify_attempts < 3
        ORDER BY
          CASE WHEN length(COALESCE(summary, '')) >= 120 THEN 0 ELSE 1 END,
          first_seen_at DESC NULLS LAST
        LIMIT ${cap}
      `);

      const assets = rows.rows.map((r) => ({
        id: r.id,
        assetName: r.asset_name,
        summary: r.summary,
        abstract: r.abstract,
        sourceType: r.source_type,
        biology: r.biology,
        ctx: {
          categories: r.categories,
          patentStatus: r.patent_status,
          licensingStatus: r.licensing_readiness,
          inventors: r.inventors,
          sourceUrl: r.source_url,
        },
      }));

      if (assets.length === 0) {
        return res.json({ message: "No unclassified assets to process", total: 0 });
      }

      classifyRunning = true;
      classifyProcessed = 0;
      classifyTotal = assets.length;
      classifySucceeded = 0;
      classifyFailed = 0;
      classifySkipped = 0;
      classifyShouldStop = false;
      classifyInputTokens = 0;
      classifyOutputTokens = 0;
      classifyStartMs = Date.now();

      res.json({ message: "Classify unclassified started", total: assets.length });

      deepEnrichBatch(
        assets,
        20,
        async (batch) => storage.bulkUpdateIngestedAssetsDeepEnrichment(batch, "classify"),
        (processed, _total, succeeded, failed, skipped) => {
          classifyProcessed = processed;
          classifySucceeded = succeeded;
          classifyFailed = failed;
          classifySkipped = skipped;
        },
        () => classifyShouldStop,
        (inTok, outTok) => {
          classifyInputTokens += inTok;
          classifyOutputTokens += outTok;
        },
      ).then((result) => {
        classifyRunning = false;
        const durationMs = Date.now() - classifyStartMs;
        const GPT4O_INPUT_PER_M = 2.50;
        const GPT4O_OUTPUT_PER_M = 10.0;
        const costUsd = (result.inputTokens * GPT4O_INPUT_PER_M + result.outputTokens * GPT4O_OUTPUT_PER_M) / 1_000_000;
        classifyLastSummary = {
          succeeded: result.succeeded,
          failed: result.failed,
          skipped: result.skipped,
          total: classifyTotal,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          costUsd: parseFloat(costUsd.toFixed(4)),
          durationMs,
          completedAt: new Date().toISOString(),
        };
        saveRefetchState("classify", classifyLastSummary);
        console.log(`[classify] Complete: ${result.succeeded} classified, ${result.skipped} thin-skipped, ${result.failed} failed – $${costUsd.toFixed(4)}`);
      }).catch((e) => {
        classifyRunning = false;
        console.error("[classify] Failed:", e);
      });
    } catch (err: any) {
      classifyRunning = false;
      res.status(500).json({ error: err.message });
    }
  });

  // ── TTO Licensing Fill (zero API cost – source_type structural rule) ───────

  app.get("/api/admin/enrichment/tto-licensing-fill/count", async (req, res) => {
    try {
      const result = await db.execute<{ total: number }>(sql`
        SELECT COUNT(*)::int AS total
        FROM ingested_assets
        WHERE relevant = true
          AND source_type = 'tech_transfer'
          AND (licensing_readiness IS NULL OR licensing_readiness IN ('unknown', '', 'Unknown'))
      `);
      res.json({ total: result.rows[0].total ?? 0 });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/enrichment/tto-licensing-fill", async (req, res) => {
    try {
      const before = await db.execute<{ n: number }>(sql`
        SELECT COUNT(*)::int AS n FROM ingested_assets
        WHERE relevant = true AND source_type = 'tech_transfer'
          AND (licensing_readiness IS NULL OR licensing_readiness IN ('unknown', '', 'Unknown'))
      `);
      const beforeCount = before.rows[0].n ?? 0;

      const result = await db.execute(sql`
        UPDATE ingested_assets
        SET
          licensing_readiness = 'available',
          enrichment_sources = COALESCE(enrichment_sources, '{}'::jsonb) || '{"licensing_readiness":"rule:tto_source"}'::jsonb
        WHERE relevant = true
          AND source_type = 'tech_transfer'
          AND (licensing_readiness IS NULL OR licensing_readiness IN ('unknown', '', 'Unknown'))
      `);
      const filled = result.rowCount ?? 0;
      console.log(`[tto-licensing-fill] Filled licensing_readiness for ${filled} TTO assets (${beforeCount} were missing)`);
      res.json({ filled, beforeCount });
    } catch (err: any) {
      console.error("[tto-licensing-fill] Error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── Modality Fill (Step 2c – rule-based keyword matching, zero API cost) ──

  app.get("/api/admin/enrichment/modality-fill/count", async (req, res) => {
    try {
      const result = await db.execute<{ total: string }>(sql`
        SELECT COUNT(*)::int AS total
        FROM ingested_assets
        WHERE relevant = true
          AND (modality IS NULL OR modality IN ('unknown', ''))
          AND (
            LOWER(COALESCE(asset_name,'') || ' ' || COALESCE(summary,''))
            ~* 'bispecific.*antibod|antibody.drug.conjugate|car-t|car t cell|chimeric antigen receptor|protac|targeted protein degradation|proteolysis targeting|gene edit|crispr|zinc finger nuclease|talen|gene therap|\ymrna\y|messenger rna|\ysirna\y|\yshrna\y|antisense oligonucleotide|\yrnai\y|cell therap|\ynanoparticle\y|lipid nanoparticle|liposome|\yantibod|\ypeptide\y|\yvaccine\y|\yimmunization\y|diagnostic|\ybiosensor\y|lateral flow|immunoassay|small molecule|platform technolog'
          )
      `);
      res.json({ total: parseInt((result.rows[0] as any).total, 10) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/enrichment/modality-fill", async (req, res) => {
    try {
      // Run as a single SQL CTE: detect modality from title+summary, write only
      // where the pattern actually matches (new_modality IS NOT NULL).
      // Also stamps enrichment_sources so we know this field came from rules.
      const result = await db.execute(sql`
        WITH fills AS (
          SELECT id,
            CASE
              WHEN LOWER(COALESCE(asset_name,'') || ' ' || COALESCE(summary,'')) ~* 'bispecific.*antibod'                       THEN 'bispecific antibody'
              WHEN LOWER(COALESCE(asset_name,'') || ' ' || COALESCE(summary,'')) ~* 'antibody.drug.conjugate'                   THEN 'adc'
              WHEN LOWER(COALESCE(asset_name,'') || ' ' || COALESCE(summary,'')) ~* 'car-t|car t cell|chimeric antigen receptor' THEN 'car-t'
              WHEN LOWER(COALESCE(asset_name,'') || ' ' || COALESCE(summary,'')) ~* 'protac|targeted protein degradation|proteolysis targeting' THEN 'protac'
              WHEN LOWER(COALESCE(asset_name,'') || ' ' || COALESCE(summary,'')) ~* 'gene edit|crispr|zinc finger nuclease|talen' THEN 'gene editing'
              WHEN LOWER(COALESCE(asset_name,'') || ' ' || COALESCE(summary,'')) ~* 'gene therap'                               THEN 'gene therapy'
              WHEN LOWER(COALESCE(asset_name,'') || ' ' || COALESCE(summary,'')) ~* '\ymrna\y|messenger rna'                   THEN 'mrna therapy'
              WHEN LOWER(COALESCE(asset_name,'') || ' ' || COALESCE(summary,'')) ~* '\ysirna\y|\yshrna\y|antisense oligonucleotide|\yrnai\y' THEN 'sirna'
              WHEN LOWER(COALESCE(asset_name,'') || ' ' || COALESCE(summary,'')) ~* 'cell therap|cell-based therap'            THEN 'cell therapy'
              WHEN LOWER(COALESCE(asset_name,'') || ' ' || COALESCE(summary,'')) ~* '\ynanoparticle\y|lipid nanoparticle|liposome' THEN 'nanoparticle'
              WHEN LOWER(COALESCE(asset_name,'') || ' ' || COALESCE(summary,'')) ~* '\yantibod'                                THEN 'antibody'
              WHEN LOWER(COALESCE(asset_name,'') || ' ' || COALESCE(summary,'')) ~* '\ypeptide\y'                              THEN 'peptide'
              WHEN LOWER(COALESCE(asset_name,'') || ' ' || COALESCE(summary,'')) ~* '\yvaccine\y|\yimmunization\y|\yimmunisation\y' THEN 'vaccine'
              WHEN LOWER(COALESCE(asset_name,'') || ' ' || COALESCE(summary,'')) ~* 'diagnostic|\ybiosensor\y|lateral flow|immunoassay' THEN 'diagnostic'
              WHEN LOWER(COALESCE(asset_name,'') || ' ' || COALESCE(summary,'')) ~* 'small molecule'                           THEN 'small molecule'
              WHEN LOWER(COALESCE(asset_name,'') || ' ' || COALESCE(summary,'')) ~* 'platform technolog'                      THEN 'platform technology'
            END AS new_modality
          FROM ingested_assets
          WHERE relevant = true
            AND (modality IS NULL OR modality IN ('unknown', ''))
        )
        UPDATE ingested_assets ia
        SET
          modality = f.new_modality,
          enrichment_sources = COALESCE(enrichment_sources, '{}'::jsonb) || '{"modality":"rule"}'::jsonb
        FROM fills f
        WHERE ia.id = f.id
          AND f.new_modality IS NOT NULL
      `);
      const filled = result.rowCount ?? 0;
      console.log(`[modality-fill] Filled modality for ${filled} assets via keyword rules`);
      res.json({ filled });
    } catch (err: any) {
      console.error("[modality-fill] Error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── Dev-Stage Fill (regex + LLM two-phase pass) ───────────────────────────

  app.get("/api/admin/enrichment/fill-stage/count", async (_req, res) => {
    try {
      const result = await db.execute<{ total: string; llm_eligible: string }>(sql`
        SELECT
          COUNT(*) FILTER (
            WHERE relevant = true
              AND (development_stage IS NULL OR development_stage IN ('unknown', ''))
              AND char_length(COALESCE(summary, '') || COALESCE(abstract, '')) >= 50
              AND (asset_class IS NULL OR asset_class NOT IN ('medical_device', 'research_tool', 'software'))
          )::int AS total,
          COUNT(*) FILTER (
            WHERE relevant = true
              AND (development_stage IS NULL OR development_stage IN ('unknown', ''))
              AND char_length(COALESCE(summary, '') || COALESCE(abstract, '')) >= 120
              AND (asset_class IS NULL OR asset_class NOT IN ('medical_device', 'research_tool', 'software'))
          )::int AS llm_eligible
        FROM ingested_assets
      `);
      const row = result.rows[0] as any;
      res.json({
        total: Number(row?.total ?? 0),
        llmEligible: Number(row?.llm_eligible ?? 0),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/admin/enrichment/fill-stage/status", (_req, res) => {
    res.json({
      running: stageFillRunning,
      processed: stageFillProcessed,
      total: stageFillTotal,
      regexFilled: stageFillRegexFilled,
      llmFilled: stageFillLlmFilled,
      lastSummary: stageFillLastSummary,
    });
  });

  app.post("/api/admin/enrichment/fill-stage/stop", (_req, res) => {
    if (!stageFillRunning) return res.status(409).json({ error: "Not running" });
    stageFillShouldStop = true;
    res.json({ stopped: true });
  });

  app.post("/api/admin/enrichment/fill-stage", async (req, res) => {
    if (stageFillRunning) return res.status(409).json({ error: "Stage fill already running" });

    const { cap, phase: rawPhase } = z.object({
      cap: z.number().int().min(10).max(20000).default(5000),
      phase: z.number().int().min(1).max(4).optional(),
    }).parse(req.body ?? {});
    const onlyPhase: number | null = rawPhase ?? null;

    stageFillRunning = true;
    stageFillProcessed = 0;
    stageFillRegexFilled = 0;
    stageFillLlmFilled = 0;
    stageFillShouldStop = false;

    // Count eligible (with asset_class exclusion matching actual fill queries)
    const countRes = await db.execute<{ total: string }>(sql`
      SELECT COUNT(*)::int AS total FROM ingested_assets
      WHERE relevant = true
        AND (development_stage IS NULL OR development_stage IN ('unknown', ''))
        AND char_length(COALESCE(summary, '') || COALESCE(abstract, '')) >= 50
        AND (asset_class IS NULL OR asset_class NOT IN ('medical_device', 'research_tool', 'software'))
    `);
    stageFillTotal = Number((countRes.rows[0] as any)?.total ?? 0);
    res.json({ started: true, total: stageFillTotal });

    // ── Inline SQL score expression matching computeCompletenessScore() ──────
    // Allows stage write + score update to be one atomic SQL UPDATE per phase.
    const STAGE_FILL_SCORE_SQL = `
      LEAST(100,
        CASE WHEN ia.indication IS NOT NULL AND length(ia.indication) >= 3
                  AND ia.indication NOT IN ('unknown','') THEN 25 ELSE 0 END +
        CASE WHEN ia.modality IS NOT NULL AND length(ia.modality) >= 3
                  AND ia.modality NOT IN ('unknown','') THEN 20 ELSE 0 END +
        CASE WHEN new_stage IS NOT NULL AND length(new_stage) >= 3
                  AND new_stage NOT IN ('unknown','') THEN 20 ELSE 0 END +
        CASE WHEN length(COALESCE(ia.summary,'')) >= 300 THEN 15
             WHEN length(COALESCE(ia.summary,'')) >= 150 THEN 10
             WHEN length(COALESCE(ia.summary,'')) >= 50  THEN 5 ELSE 0 END +
        CASE WHEN ia.mechanism_of_action IS NOT NULL AND length(ia.mechanism_of_action) >= 3
                  AND ia.mechanism_of_action NOT IN ('unknown','') THEN 12 ELSE 0 END +
        CASE WHEN (ia.ip_type IS NOT NULL AND length(ia.ip_type) >= 3
                   AND ia.ip_type NOT IN ('unknown',''))
               OR (ia.patent_status IS NOT NULL AND length(ia.patent_status) >= 3
                   AND ia.patent_status NOT IN ('unknown',''))
               OR ia.source_type = 'tech_transfer'
             THEN 8 ELSE 0 END
      )`;

    // ── Background job ────────────────────────────────────────────────────────
    (async () => {
      const t0 = Date.now();
      let costUsd = 0;

      try {
        // ── Phase 1: SQL regex – atomic stage + score UPDATE in one CTE ──
        if (!onlyPhase || onlyPhase === 1) {
          const p1 = await pool.query<{ id: number }>(`
            WITH source AS (
              SELECT id,
                CASE
                  WHEN txt ~* '\\mFDA[- ]approved\\M|\\mFDA[- ]cleared\\M|commercially available|marketed drug|on the market|approved for sale|post[- ]market'
                    THEN 'commercial'
                  WHEN txt ~* '\\mphase\\s*(III|3)\\M(?!\\s*/)'
                    THEN 'phase 3'
                  WHEN txt ~* '\\mphase\\s*(II|2)\\s*/\\s*(III|3)\\M'
                    THEN 'phase 2'
                  WHEN txt ~* '\\mphase\\s*(II|2)\\M(?!\\s*/)'
                    THEN 'phase 2'
                  WHEN txt ~* '\\mphase\\s*(I|1)\\M|\\mphase\\s*(I|1)\\s*/\\s*(II|2)\\M'
                    THEN 'phase 1'
                  WHEN txt ~* '\\mIND\\s+(filed|application|submitted|approved|enabling)\\M|\\mIND-enabling\\M'
                    THEN 'IND filed'
                  WHEN txt ~* '\\mdiscovery stage\\M|\\mearly[- ]stage discovery\\M|\\mhit[- ]to[- ]lead\\M|\\mhit identification\\M|\\mtarget validation\\M'
                    THEN 'discovery'
                  WHEN txt ~* '\\mpreclinical\\M|\\mpre[- ]clinical\\M|\\mlead[- ]optimi.ation\\M'
                    THEN 'preclinical'
                END AS new_stage
              FROM (
                SELECT id,
                       LOWER(COALESCE(summary, '') || ' ' || COALESCE(abstract, '')) AS txt
                FROM ingested_assets
                WHERE relevant = true
                  AND (development_stage IS NULL OR development_stage IN ('unknown', ''))
                  AND char_length(COALESCE(summary, '') || COALESCE(abstract, '')) >= 50
                  AND (asset_class IS NULL OR asset_class NOT IN ('medical_device', 'research_tool', 'software'))
              ) t
            )
            UPDATE ingested_assets ia
            SET
              development_stage  = s.new_stage,
              completeness_score = ${STAGE_FILL_SCORE_SQL},
              enrichment_sources = COALESCE(enrichment_sources, '{}'::jsonb)
                || '{"development_stage":"regex"}'::jsonb
            FROM source s
            WHERE ia.id = s.id AND s.new_stage IS NOT NULL
            RETURNING ia.id
          `);
          stageFillRegexFilled = p1.rows.length;
          stageFillProcessed += stageFillRegexFilled;
          console.log(`[fill-stage] Phase 1 regex: ${stageFillRegexFilled} filled (stage + score atomic)`);
        }

        if (stageFillShouldStop) {
          console.log("[fill-stage] Stop requested after Phase 1");
        } else if (!onlyPhase || onlyPhase === 2) {
          // ── Phase 2: LLM – collect results, then single atomic batch UPDATE ──
          if (!process.env.OPENAI_API_KEY) {
            console.warn("[fill-stage] Phase 2 skipped – OPENAI_API_KEY not set");
          } else {
            const OpenAI = (await import("openai")).default;
            const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

            const STAGE_ENUM_VALS = [
              "discovery", "preclinical", "IND filed",
              "phase 1", "phase 2", "phase 3", "commercial",
            ];
            const systemPrompt = `You are a biotech development stage classifier.
Given a technology description, identify the development stage. Respond with exactly one value from:
${STAGE_ENUM_VALS.join(", ")}
If no explicit stage is stated, respond with: unknown
Do not respond with anything else.`;

            const { rows: llmRows } = await pool.query<{ id: number; summary: string; abstract: string | null }>(
              `SELECT id, summary, abstract
               FROM ingested_assets
               WHERE relevant = true
                 AND (development_stage IS NULL OR development_stage IN ('unknown', ''))
                 AND char_length(COALESCE(summary, '') || COALESCE(abstract, '')) >= 120
                 AND (asset_class IS NULL OR asset_class NOT IN ('medical_device', 'research_tool', 'software'))
               ORDER BY COALESCE(completeness_score, 0) DESC
               LIMIT $1`,
              [cap],
            );

            console.log(`[fill-stage] Phase 2 LLM: ${llmRows.length} eligible (cap=${cap})`);

            // Collect all (id, stage) results first – then one atomic batch UPDATE
            const llmResults = new Map<number, string>(); // id → stage to write
            const CONCURRENCY = 5;
            const queue = [...llmRows];

            const worker = async () => {
              while (queue.length > 0 && !stageFillShouldStop) {
                const row = queue.shift()!;
                const text = `${row.summary ?? ""} ${row.abstract ?? ""}`.slice(0, 1000);
                try {
                  const resp = await openai.chat.completions.create({
                    model: "gpt-4o-mini",
                    temperature: 0,
                    max_tokens: 20,
                    messages: [
                      { role: "system", content: systemPrompt },
                      { role: "user", content: text },
                    ],
                  });
                  const raw = (resp.choices[0]?.message?.content ?? "").trim().toLowerCase();
                  const matched = STAGE_ENUM_VALS.find((s) => s.toLowerCase() === raw);
                  // Any response not in enum (including "unknown") is not written
                  if (matched) llmResults.set(row.id, matched);
                } catch (e: any) {
                  console.warn(`[stage-fill] Asset ${row.id} LLM error:`, e?.message);
                }
                stageFillProcessed++;
              }
            };

            await Promise.all(Array.from({ length: CONCURRENCY }, worker));

            // Single atomic batch UPDATE: stage + score together, no separate rescore pass
            stageFillLlmFilled = llmResults.size;
            if (llmResults.size > 0) {
              const ids    = Array.from(llmResults.keys());
              const stages = ids.map((id) => llmResults.get(id)!);
              await pool.query(`
                WITH updates AS (
                  SELECT unnest($1::int[]) AS id, unnest($2::text[]) AS new_stage
                )
                UPDATE ingested_assets ia
                SET
                  development_stage  = u.new_stage,
                  completeness_score = ${STAGE_FILL_SCORE_SQL},
                  enrichment_sources = COALESCE(enrichment_sources, '{}'::jsonb)
                    || '{"development_stage":"llm"}'::jsonb
                FROM updates u
                WHERE ia.id = u.id
              `, [ids, stages]);
            }

            // Rough cost estimate: ~700 input + ~5 output tokens per call @ gpt-4o-mini pricing
            costUsd = llmRows.length * ((700 * 0.15 + 5 * 0.60) / 1_000_000);
            console.log(`[fill-stage] Phase 2 LLM: ${stageFillLlmFilled} filled (stage + score atomic), est. cost $${costUsd.toFixed(4)}`);
          }
        }
      } catch (err: any) {
        console.error("[fill-stage] Error:", err.message);
      } finally {
        stageFillLastSummary = {
          regexFilled: stageFillRegexFilled,
          llmFilled: stageFillLlmFilled,
          rescored: stageFillRegexFilled + stageFillLlmFilled,
          costUsd,
          durationMs: Date.now() - t0,
          completedAt: new Date().toISOString(),
        };
        stageFillRunning = false;
        console.log(`[fill-stage] Done – regex=${stageFillRegexFilled} llm=${stageFillLlmFilled}`);
      }
    })();
  });

  // ── Surgical band enrichment (Step 3 GPT-4o) ─────────────────────────────

  app.get("/api/admin/enrichment/bands", async (req, res) => {
    try {
      const rows = await db.execute<{
        band: string; total: string; gap_fill_count: string;
        missing_target: string; missing_modality: string; missing_indication: string; missing_stage: string;
        missing_moa: string; missing_unmet: string; missing_comparable: string; missing_innovation: string;
        pop_b_count: string;
      }>(sql`
        SELECT
          CASE
            WHEN completeness_score >= 80 THEN 'rich'
            WHEN completeness_score >= 60 THEN 'decent'
            WHEN completeness_score >= 40 THEN 'sparse'
            WHEN completeness_score >= 1  THEN 'very_sparse'
            ELSE 'bare'
          END AS band,
          COUNT(*) AS total,
          COUNT(CASE
            WHEN asset_class = 'drug_biologic'
              AND (summary IS NOT NULL AND LENGTH(summary) >= 120)
              AND (
                (mechanism_of_action IS NULL OR mechanism_of_action = '')
                OR (unmet_need IS NULL OR unmet_need = '')
                OR (comparable_drugs IS NULL OR comparable_drugs = '')
                OR (innovation_claim IS NULL OR innovation_claim = '')
                OR (target IS NULL OR target = '' OR target = 'unknown')
                OR (modality IS NULL OR modality = '' OR modality = 'unknown')
                OR (indication IS NULL OR indication = '' OR indication = 'unknown')
                OR (development_stage = 'unknown')
              )
            THEN 1 END
          ) AS gap_fill_count,
          COUNT(CASE WHEN asset_class = 'drug_biologic' AND (summary IS NOT NULL AND LENGTH(summary) >= 120) AND (target IS NULL OR target = '' OR target = 'unknown') THEN 1 END) AS missing_target,
          COUNT(CASE WHEN asset_class = 'drug_biologic' AND (summary IS NOT NULL AND LENGTH(summary) >= 120) AND (modality IS NULL OR modality = '' OR modality = 'unknown') THEN 1 END) AS missing_modality,
          COUNT(CASE WHEN asset_class = 'drug_biologic' AND (summary IS NOT NULL AND LENGTH(summary) >= 120) AND (indication IS NULL OR indication = '' OR indication = 'unknown') THEN 1 END) AS missing_indication,
          COUNT(CASE WHEN asset_class = 'drug_biologic' AND (summary IS NOT NULL AND LENGTH(summary) >= 120) AND (development_stage = 'unknown') THEN 1 END) AS missing_stage,
          COUNT(CASE WHEN asset_class = 'drug_biologic' AND (summary IS NOT NULL AND LENGTH(summary) >= 120) AND (mechanism_of_action IS NULL OR mechanism_of_action = '') THEN 1 END) AS missing_moa,
          COUNT(CASE WHEN asset_class = 'drug_biologic' AND (summary IS NOT NULL AND LENGTH(summary) >= 120) AND (unmet_need IS NULL OR unmet_need = '') THEN 1 END) AS missing_unmet,
          COUNT(CASE WHEN asset_class = 'drug_biologic' AND (summary IS NOT NULL AND LENGTH(summary) >= 120) AND (comparable_drugs IS NULL OR comparable_drugs = '') THEN 1 END) AS missing_comparable,
          COUNT(CASE WHEN asset_class = 'drug_biologic' AND (summary IS NOT NULL AND LENGTH(summary) >= 120) AND (innovation_claim IS NULL OR innovation_claim = '') THEN 1 END) AS missing_innovation,
          COUNT(CASE WHEN summary IS NOT NULL AND LENGTH(summary) >= 120 THEN 1 END) AS pop_b_count
        FROM ingested_assets
        WHERE relevant = true
        GROUP BY band
      `);
      const bandMap: Record<string, {
        count: number; gapFillCount: number;
        missingTarget: number; missingModality: number; missingIndication: number; missingStage: number;
        missingMoa: number; missingUnmet: number; missingComparable: number; missingInnovation: number;
        popBCount: number;
      }> = {};
      for (const r of rows.rows) {
        bandMap[r.band] = {
          count: parseInt(r.total, 10),
          gapFillCount: parseInt(r.gap_fill_count, 10),
          missingTarget: parseInt(r.missing_target, 10),
          missingModality: parseInt(r.missing_modality, 10),
          missingIndication: parseInt(r.missing_indication, 10),
          missingStage: parseInt(r.missing_stage, 10),
          missingMoa: parseInt(r.missing_moa, 10),
          missingUnmet: parseInt(r.missing_unmet, 10),
          missingComparable: parseInt(r.missing_comparable, 10),
          missingInnovation: parseInt(r.missing_innovation, 10),
          popBCount: parseInt(r.pop_b_count, 10),
        };
      }
      const GPT4O_INPUT_PER_M = 2.50;
      const GPT4O_OUTPUT_PER_M = 10.0;
      // Full-pass: fixed cost per asset (all fields)
      const costPerAsset = (1500 * GPT4O_INPUT_PER_M + 700 * GPT4O_OUTPUT_PER_M) / 1_000_000;
      // Gap-fill: cost per targeted field-fill (8 fields split evenly across 1000 input + 500 output)
      const costPerFieldFill = ((1000 / 8) * GPT4O_INPUT_PER_M + (500 / 8) * GPT4O_OUTPUT_PER_M) / 1_000_000;
      const bands = ["rich", "decent", "sparse", "very_sparse", "bare"].map((id) => {
        const d = bandMap[id] ?? { count: 0, gapFillCount: 0, missingTarget: 0, missingModality: 0, missingIndication: 0, missingStage: 0, missingMoa: 0, missingUnmet: 0, missingComparable: 0, missingInnovation: 0, popBCount: 0 };
        const isBare = id === "bare";
        // Formula-based gap-fill cost: total missing field-fills across all gap-fill eligible assets
        // Includes primary fields (target/modality/indication/stage) + secondary (moa/unmet/comparable/innovation)
        const totalMissingFields = d.missingTarget + d.missingModality + d.missingIndication + d.missingStage + d.missingMoa + d.missingUnmet + d.missingComparable + d.missingInnovation;
        return {
          id,
          count: d.count,
          gapFillCount: d.gapFillCount,
          missingTarget: d.missingTarget,
          missingModality: d.missingModality,
          missingIndication: d.missingIndication,
          missingStage: d.missingStage,
          missingMoa: d.missingMoa,
          missingUnmet: d.missingUnmet,
          missingComparable: d.missingComparable,
          missingInnovation: d.missingInnovation,
          totalMissingFields,
          // Bare assets have no content – zero cost, re-scrape required
          estCostFull: isBare ? 0 : parseFloat((d.count * costPerAsset).toFixed(2)),
          // Gap-fill cost = avg missing fields per asset × per-field-fill cost × eligible asset count
          estCostGapFill: isBare ? 0 : parseFloat((totalMissingFields * costPerFieldFill).toFixed(2)),
          needsRescrape: isBare,
          // Population B: bare assets with summary >= 120 chars (can be enriched without re-scraping)
          populationB: isBare ? d.popBCount : 0,
        };
      });
      res.json({ bands });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/admin/enrichment/band/status", async (req, res) => {
    const GPT4O_INPUT_PER_M = 2.50;
    const GPT4O_OUTPUT_PER_M = 10.0;
    const liveCostUsd = (bandInputTokens * GPT4O_INPUT_PER_M + bandOutputTokens * GPT4O_OUTPUT_PER_M) / 1_000_000;
    const costPerAssetFull = (1500 * GPT4O_INPUT_PER_M + 700 * GPT4O_OUTPUT_PER_M) / 1_000_000;
    const costPerAssetGap = (1000 * GPT4O_INPUT_PER_M + 500 * GPT4O_OUTPUT_PER_M) / 1_000_000;
    const liveProjectedTotalUsd = bandTotal * (bandGapFill ? costPerAssetGap : costPerAssetFull);
    // Lazy-load from DB if in-memory summary was cleared by a server restart
    if (bandLastSummary === null) {
      try {
        const stored = await storage.getLastEnrichmentRun("band");
        if (stored) bandLastSummary = stored as unknown as typeof bandLastSummary;
      } catch { /* non-fatal */ }
    }
    res.json({
      running: bandRunning,
      band: bandBand || null,
      gapFill: bandGapFill,
      processed: bandProcessed,
      total: bandTotal,
      succeeded: bandSucceeded,
      failed: bandFailed,
      liveCostUsd: parseFloat(liveCostUsd.toFixed(4)),
      liveProjectedTotalUsd: parseFloat(liveProjectedTotalUsd.toFixed(4)),
      liveInputTokens: bandInputTokens,
      liveOutputTokens: bandOutputTokens,
      liveFieldCounts: bandFieldCounts,
      targetFields: bandTargetFields,
      lastSummary: bandLastSummary,
    });
  });

  app.post("/api/admin/enrichment/band/stop", async (req, res) => {
    if (!bandRunning) return res.json({ message: "No band enrichment running" });
    bandShouldStop = true;
    res.json({ message: "Stop signal sent" });
  });

  app.post("/api/admin/enrichment/run-band", async (req, res) => {
    if (bandRunning) return res.status(409).json({ error: "Band enrichment already running" });
    if (edenRunning) return res.status(409).json({ error: "EDEN deep enrichment is already running – stop it first" });

    const { band, gapFill, cap, newestFirst, fields } = z.object({
      band: z.string(),
      gapFill: z.boolean().default(true),
      cap: z.number().int().min(10).max(5000).default(500),
      newestFirst: z.boolean().default(false),
      fields: z.array(z.string()).optional(),
    }).parse(req.body ?? {});
    const range = BAND_SCORE_RANGES[band];
    if (!range) return res.status(400).json({ error: `Unknown band: ${band}` });
    try {
      // Fetch assets in the target score band
      let assets: Array<{
        id: number; assetName: string; summary: string; abstract: string | null;
        assetClass: string | null; mechanismOfAction: string | null; unmetNeed: string | null;
        comparableDrugs: string | null; innovationClaim: string | null;
        categories: string[] | null; patentStatus: string | null; licensingStatus: string | null;
        inventors: string[] | null; sourceUrl: string | null; sourceType: string;
        target: string | null; modality: string | null; indication: string | null; developmentStage: string;
        biology: string | null;
      }>;

      if (gapFill) {
        // Gap-fill: drug_biologic assets missing at least one of the 4 target fields in this band
        const rangeClause = range.min !== null && range.max !== null
          ? sql`completeness_score BETWEEN ${range.min} AND ${range.max}`
          : range.min !== null
            ? sql`completeness_score >= ${range.min}`
            : sql`(completeness_score IS NULL OR completeness_score = 0)`;

        const rows = await db.execute<{
          id: number; asset_name: string; summary: string; abstract: string | null;
          asset_class: string | null; mechanism_of_action: string | null; unmet_need: string | null;
          comparable_drugs: string | null; innovation_claim: string | null;
          categories: string[] | null; patent_status: string | null; licensing_readiness: string | null;
          inventors: string[] | null; source_url: string | null; source_type: string;
          target: string | null; modality: string | null; indication: string | null; development_stage: string;
          biology: string | null;
        }>(sql`
          SELECT id, asset_name, summary, abstract, asset_class, mechanism_of_action, unmet_need,
                 comparable_drugs, innovation_claim,
                 categories, patent_status, licensing_readiness, inventors, source_url, source_type,
                 target, modality, indication, development_stage, biology
          FROM ingested_assets
          WHERE relevant = true
            AND asset_class = 'drug_biologic'
            AND (
              (mechanism_of_action IS NULL OR mechanism_of_action = '')
              OR (unmet_need IS NULL OR unmet_need = '')
              OR (comparable_drugs IS NULL OR comparable_drugs = '')
              OR (innovation_claim IS NULL OR innovation_claim = '')
              OR (target IS NULL OR target = '' OR target = 'unknown')
              OR (modality IS NULL OR modality = '' OR modality = 'unknown')
              OR (indication IS NULL OR indication = '' OR indication = 'unknown')
              OR (development_stage = 'unknown')
            )
            AND ${rangeClause}
            AND (summary IS NOT NULL AND LENGTH(summary) >= 120)
          ORDER BY ${newestFirst ? sql`first_seen_at DESC NULLS LAST` : sql`completeness_score DESC NULLS LAST`}
          LIMIT ${cap}
        `);
        assets = rows.rows.map((r) => ({
          id: r.id, assetName: r.asset_name, summary: r.summary, abstract: r.abstract,
          assetClass: r.asset_class, mechanismOfAction: r.mechanism_of_action, unmetNeed: r.unmet_need,
          comparableDrugs: r.comparable_drugs, innovationClaim: r.innovation_claim,
          categories: r.categories, patentStatus: r.patent_status, licensingStatus: r.licensing_readiness,
          inventors: r.inventors, sourceUrl: r.source_url, sourceType: r.source_type,
          target: r.target, modality: r.modality, indication: r.indication, developmentStage: r.development_stage,
          biology: r.biology,
        }));
      } else {
        // Full pass: all assets in this band
        const rangeClause = range.min !== null && range.max !== null
          ? sql`completeness_score BETWEEN ${range.min} AND ${range.max}`
          : range.min !== null
            ? sql`completeness_score >= ${range.min}`
            : sql`(completeness_score IS NULL OR completeness_score = 0)`;

        const rows = await db.execute<{
          id: number; asset_name: string; summary: string; abstract: string | null;
          asset_class: string | null; mechanism_of_action: string | null; unmet_need: string | null;
          comparable_drugs: string | null; innovation_claim: string | null;
          categories: string[] | null; patent_status: string | null; licensing_readiness: string | null;
          inventors: string[] | null; source_url: string | null; source_type: string;
          target: string | null; modality: string | null; indication: string | null; development_stage: string;
          biology: string | null;
        }>(sql`
          SELECT id, asset_name, summary, abstract, asset_class, mechanism_of_action, unmet_need,
                 comparable_drugs, innovation_claim,
                 categories, patent_status, licensing_readiness, inventors, source_url, source_type,
                 target, modality, indication, development_stage, biology
          FROM ingested_assets
          WHERE relevant = true
            AND ${rangeClause}
            AND (summary IS NOT NULL AND LENGTH(summary) >= 120)
          ORDER BY ${newestFirst ? sql`first_seen_at DESC NULLS LAST` : sql`completeness_score DESC NULLS LAST`}
          LIMIT ${cap}
        `);
        assets = rows.rows.map((r) => ({
          id: r.id, assetName: r.asset_name, summary: r.summary, abstract: r.abstract,
          assetClass: r.asset_class, mechanismOfAction: r.mechanism_of_action, unmetNeed: r.unmet_need,
          comparableDrugs: r.comparable_drugs, innovationClaim: r.innovation_claim,
          categories: r.categories, patentStatus: r.patent_status, licensingStatus: r.licensing_readiness,
          inventors: r.inventors, sourceUrl: r.source_url, sourceType: r.source_type,
          target: r.target, modality: r.modality, indication: r.indication, developmentStage: r.development_stage,
          biology: r.biology,
        }));
      }

      if (assets.length === 0) return res.json({ message: "No assets found for this band/mode", total: 0 });

      // ── Pre-run: sample avg completeness score + snapshot band distribution ──
      const assetIdList = assets.map((a) => a.id);
      let avgScoreBefore: number | null = null;
      bandSnapshotBefore = {};
      try {
        const scoreRow = await db.execute<{ id: number; avg_score: string | null; completeness_score: number | null }>(sql`
          SELECT id, completeness_score, AVG(completeness_score) OVER ()::float AS avg_score
          FROM ingested_assets
          WHERE id = ANY(${assetIdList}::int[])
        `);
        for (const r of scoreRow.rows) bandSnapshotBefore[r.id] = scoreToBand(r.completeness_score);
        const raw = scoreRow.rows[0]?.avg_score;
        avgScoreBefore = raw != null ? parseFloat(parseFloat(raw).toFixed(1)) : null;
      } catch (snapErr: any) { console.error("[band-enrich] pre-run snapshot failed:", snapErr?.message); }

      // ── Canonical gap-fill target fields (overridable) ──────────────────────
      // Primary fields first (target/modality/indication/stage) – these power Scout cards and ranking.
      // Secondary fields follow (MoA/unmet/comparable/innovation) – these enrich the dossier.
      const ALL_GAP_FILL_FIELDS = ["target", "modality", "indication", "developmentStage", "mechanismOfAction", "unmetNeed", "comparableDrugs", "innovationClaim"];
      const GAP_FILL_FIELDS = (fields && fields.length > 0) ? fields : ALL_GAP_FILL_FIELDS;
      const FULL_PASS_FIELDS = ["target", "modality", "indication", "developmentStage", "mechanismOfAction", "innovationClaim", "unmetNeed", "comparableDrugs", "licensingReadiness"];

      bandRunning = true;
      bandBand = band;
      bandGapFill = gapFill;
      bandProcessed = 0;
      bandTotal = assets.length;
      bandSucceeded = 0;
      bandFailed = 0;
      bandShouldStop = false;
      bandInputTokens = 0;
      bandOutputTokens = 0;
      bandFieldCounts = {};
      bandTargetFields = GAP_FILL_FIELDS;
      bandAvgScoreBefore = avgScoreBefore;
      bandAssetIds = assetIdList;

      res.json({ message: "Band enrichment started", band, gapFill, newestFirst, total: assets.length });

      const startMs = Date.now();

      // Helper: compute per-asset missing fields – only include fields that are null/empty for THIS asset
      const isEmpty = (v: string | null | undefined) => !v || v.trim() === "" || v.trim().toLowerCase() === "unknown";
      const perAssetFields = (a: typeof assets[0]) =>
        GAP_FILL_FIELDS.filter((f) => {
          if (f === "target") return isEmpty(a.target);
          if (f === "modality") return isEmpty(a.modality);
          if (f === "indication") return isEmpty(a.indication);
          if (f === "developmentStage") return isEmpty(a.developmentStage);
          if (f === "mechanismOfAction") return isEmpty(a.mechanismOfAction);
          if (f === "unmetNeed") return isEmpty(a.unmetNeed);
          if (f === "comparableDrugs") return isEmpty(a.comparableDrugs);
          if (f === "innovationClaim") return isEmpty(a.innovationClaim);
          return false; // unknown field – skip
        });

      deepEnrichBatch(
        assets.map((a) => {
          // Gap-fill: compute actual per-asset missing fields so we only request what's needed
          const assetFields = gapFill ? perAssetFields(a) : null;
          return {
            id: a.id,
            assetName: a.assetName,
            summary: a.summary,
            abstract: a.abstract,
            sourceType: a.sourceType,
            biology: a.biology,
            ctx: {
              categories: a.categories,
              patentStatus: a.patentStatus,
              licensingStatus: a.licensingStatus,
              inventors: a.inventors,
              sourceUrl: a.sourceUrl,
              currentValues: {
                target: a.target,
                modality: a.modality,
                indication: a.indication,
                developmentStage: a.developmentStage,
              },
              fieldsToGenerate: assetFields && assetFields.length > 0 ? assetFields : null,
            },
          };
        }),
        20,
        async (batch) => {
          if (gapFill) {
            // Gap-fill: selective writer that only writes target fields and merges completeness score.
            // Primary fields (target/modality/indication/developmentStage) are included so the
            // "only upgrade" logic in storage can promote null/"unknown" → real value.
            return storage.bulkUpdateIngestedAssetsGapFill(
              batch.map((r) => ({
                id: r.id,
                mechanismOfAction: r.mechanismOfAction,
                unmetNeed: r.unmetNeed,
                comparableDrugs: r.comparableDrugs,
                innovationClaim: r.innovationClaim,
                target: r.target,
                modality: r.modality,
                indication: r.indication,
                developmentStage: r.developmentStage,
              })),
              "gpt4o",
              (field) => { bandFieldCounts[field] = (bandFieldCounts[field] ?? 0) + 1; },
            );
          }
          return storage.bulkUpdateIngestedAssetsDeepEnrichment(batch, "deep");
        },
        (processed, _total, succeeded, failed) => {
          bandProcessed = processed;
          bandSucceeded = succeeded;
          bandFailed = failed;
        },
        () => bandShouldStop,
        (inTok, outTok) => {
          bandInputTokens += inTok;
          bandOutputTokens += outTok;
        },
      ).then(async (result) => {
        bandRunning = false;
        const durationMs = Date.now() - startMs;
        const GPT4O_INPUT_PER_M = 2.50;
        const GPT4O_OUTPUT_PER_M = 10.0;
        const costUsd = (result.inputTokens * GPT4O_INPUT_PER_M + result.outputTokens * GPT4O_OUTPUT_PER_M) / 1_000_000;

        // Post-run: query avg completeness score of the same asset IDs
        let avgScoreAfter: number | null = null;
        try {
          const postRow = await db.execute<{ avg_score: string | null }>(sql`
            SELECT AVG(completeness_score)::float AS avg_score
            FROM ingested_assets
            WHERE id = ANY(${bandAssetIds}::int[]) AND completeness_score IS NOT NULL
          `);
          const rawPost = postRow.rows[0]?.avg_score;
          avgScoreAfter = rawPost != null ? parseFloat(parseFloat(rawPost).toFixed(1)) : null;
        } catch (scoreErr: any) { console.error("[band-enrich] post-run avg score query failed:", scoreErr?.message); }

        // Compute band movements by re-querying the same asset IDs post-run
        let bandMovements: Record<string, number> = {};
        try {
          const postRows = await db.execute<{ id: number; completeness_score: number | null }>(sql`
            SELECT id, completeness_score FROM ingested_assets WHERE id = ANY(${bandAssetIds}::int[])
          `);
          bandMovements = computeBandMovements(bandSnapshotBefore, postRows.rows);
        } catch (movErr: any) { console.error("[band-enrich] band movement computation failed:", movErr?.message); }

        bandLastSummary = {
          band, gapFill, total: assets.length, succeeded: result.succeeded, failed: result.failed,
          inputTokens: result.inputTokens, outputTokens: result.outputTokens,
          costUsd: parseFloat(costUsd.toFixed(4)), durationMs,
          fieldsFilledNames: gapFill ? GAP_FILL_FIELDS : FULL_PASS_FIELDS,
          fieldFillCounts: { ...bandFieldCounts },
          avgScoreBefore: bandAvgScoreBefore,
          avgScoreAfter,
          bandMovements,
          completedAt: new Date().toISOString(),
        };
        storage.saveEnrichmentRun("band", bandLastSummary as unknown as Record<string, unknown>).catch(() => {});
        console.log(`[band-enrich] ${band} ${gapFill ? "(gap-fill)" : "(full)"} complete: ${result.succeeded} succeeded, ${result.failed} failed, $${costUsd.toFixed(4)}, score ${bandAvgScoreBefore} → ${avgScoreAfter}, movements: ${JSON.stringify(bandMovements)}`);
      }).catch((e) => {
        bandRunning = false;
        console.error("[band-enrich] failed:", e);
      });
    } catch (err: any) {
      bandRunning = false;
      res.status(500).json({ error: err.message });
    }
  });

  // ── EDEN embedding routes ─────────────────────────────────────────────────

  app.post("/api/admin/eden/embed", async (req, res) => {
    if (embedRunning) return res.status(409).json({ error: "Embedding already running" });
    try {
      const mode = req.body?.mode === "biology" ? "biology" : "missing";
      const assets = mode === "biology"
        ? await storage.getAssetsNeedingBiologyReEmbed()
        : await storage.getAssetsNeedingEmbedding();
      if (assets.length === 0) return res.json({ message: mode === "biology" ? "No assets with biology/categories found to re-embed" : "All relevant assets already embedded", total: 0 });

      embedTotal = assets.length;
      embedProcessed = 0;
      embedSucceeded = 0;
      embedFailed = 0;
      embedRunning = true;

      res.json({ message: "Embedding started", total: assets.length });

      embedAssets(assets, (processed, _total, succeeded, failed) => {
        embedProcessed = processed;
        embedSucceeded = succeeded;
        embedFailed = failed;
      }).then((result) => {
        embedRunning = false;
        embedSucceeded = result.succeeded;
        embedFailed = result.failed;
        console.log(`[EDEN] Embedding complete: ${result.succeeded} succeeded, ${result.failed} failed`);
      }).catch((e) => {
        embedRunning = false;
        console.error("[EDEN] Embedding failed:", e);
      });
    } catch (err: any) {
      embedRunning = false;
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/admin/eden/embed/status", async (req, res) => {
    res.json({
      running: embedRunning,
      processed: embedProcessed,
      total: embedTotal,
      succeeded: embedSucceeded,
      failed: embedFailed,
    });
  });

  // ── Researcher portal routes ──────────────────────────────────────────────

}
