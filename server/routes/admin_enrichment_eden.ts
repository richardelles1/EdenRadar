import type { Express } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { storage } from "../storage";
import { deepEnrichBatch } from "../lib/pipeline/deepEnrichBatch";
import { embedAssets } from "../lib/pipeline/embedAssets";

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

// ── Embed state ───────────────────────────────────────────────────────────────
let embedRunning = false;
let embedProcessed = 0;
let embedTotal = 0;
let embedSucceeded = 0;
let embedFailed = 0;

// ── Helpers ───────────────────────────────────────────────────────────────────
export const scoreToBand = (score: number | null | undefined): string => {
  if (score == null || score === 0) return "bare";
  if (score >= 80) return "rich";
  if (score >= 60) return "decent";
  if (score >= 40) return "sparse";
  return "very_sparse";
};

export const computeBandMovements = (
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

export function isEdenRunning(): boolean { return edenRunning; }

export function registerEdenRoutes(app: Express): void {

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

}
