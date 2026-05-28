import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import type { Express } from "express";
import { db, pool } from "../db";
import { sql } from "drizzle-orm";
import { storage, type EnrichFilter } from "../storage";
import { computeCompletenessScore } from "../lib/pipeline/contentHash";
import { classifyAsset } from "../lib/pipeline/classifyAsset";
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
  } catch {}
}

export function registerEnrichmentRoutes(app: Express): void {
  let liveEnrichment: {
    jobId: number;
    processed: number;
    improved: number;
    total: number;
    resumed: boolean;
    drain: boolean;
    tokenCost: number;
    filters: EnrichFilter;
  } | null = null;
  // Persists the final token cost of the last run so the "done" status response
  // can include it even after liveEnrichment is set to null on completion.
  let lastRunTokenCost = 0;
  let standardEnrichShouldStop = false;

  async function runEnrichmentWorker(
    jobId: number,
    assets: Array<{ id: number; assetName: string; summary: string; abstract: string | null; target: string; modality: string; indication: string; developmentStage: string; categories: string[] | null; patentStatus: string | null; licensingStatus: string | null; inventors: string[] | null; sourceUrl: string | null; sourceType?: string | null }>,
    startProcessed: number,
    startImproved: number,
    resumed: boolean,
    drain: boolean = false,
    filters: EnrichFilter = {},
  ) {
    liveEnrichment = { jobId, processed: startProcessed, improved: startImproved, total: startProcessed + assets.length, resumed, drain, tokenCost: 0, filters };
    const MINI_INPUT_PER_M = 0.15;   // gpt-4o-mini input $/1M tokens
    const MINI_OUTPUT_PER_M = 0.60;  // gpt-4o-mini output $/1M tokens
    const CONCURRENCY = 30;
    let idx = 0;

    async function worker() {
      while (idx < assets.length) {
        if (standardEnrichShouldStop) break;
        const asset = assets[idx++];
        if (!asset) continue;
        try {
          // Use the type-aware classifyAsset pipeline (gpt-4o-mini, non-deep pass) so that
          // all new fields (assetClass, deviceAttributes, vocab-normalized target/indication)
          // are populated consistently with the rest of the pipeline.
          // Pass the asset's abstract + ctx (categories/patent/licensing/inventors/sourceUrl)
          // and current known field values â€” the prompt uses these to focus on filling the
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
          // We still track "improved" for the job counter â€” counts only when pharma-style
          // unknownâ†’known transitions occur.
          await storage.updateIngestedAssetEnrichment(asset.id, {
            ...classification,
            completenessScore: score,
          });

          // Accumulate real token cost from the API response
          const inTok = classification.tokenUsage?.inputTokens ?? 0;
          const outTok = classification.tokenUsage?.outputTokens ?? 0;
          liveEnrichment!.tokenCost += (inTok * MINI_INPUT_PER_M + outTok * MINI_OUTPUT_PER_M) / 1_000_000;

          const isKnown = (v: string | null | undefined) =>
            v != null && v !== "" && v !== "unknown";
          const improved =
            ((!asset.target || asset.target === "unknown") && isKnown(classification.target)) ||
            ((!asset.modality || asset.modality === "unknown") && isKnown(classification.modality)) ||
            ((!asset.indication || asset.indication === "unknown") && isKnown(classification.indication)) ||
            (asset.developmentStage === "unknown" && isKnown(classification.developmentStage));

          if (improved) liveEnrichment!.improved++;
        } catch (e) {
          console.error(`[enrichment] failed for asset ${asset.id}:`, e);
          // Hard GPT failure: still count toward the attempt cap so the asset is not retried
          // indefinitely. This is a thin atomic increment (no full enrichment write needed).
          await storage.incrementMiniEnrichAttempts(asset.id);
        }
        await storage.stampEnrichedAt(asset.id);
        liveEnrichment!.processed++;
        await storage.updateEnrichmentJob(jobId, { processed: liveEnrichment!.processed, improved: liveEnrichment!.improved });
      }
    }

    try {
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, assets.length) }, worker));

      // Drain mode: after the current batch finishes, keep pulling the next 500
      // un-scanned assets from the same mini-queue and continue under the same
      // job until the queue is empty (or stop is requested). The mini-queue
      // criteria already exclude assets we've just scored, so we will not pay
      // twice for the same asset.
      while (drain && !standardEnrichShouldStop) {
        const next = await storage.getMiniEnrichBatch(500, filters);
        if (next.length === 0) break;
        idx = 0;
        assets = next;
        liveEnrichment!.total += next.length;
        await storage.updateEnrichmentJob(jobId, { total: liveEnrichment!.total });
        console.log(`[enrichment] Drain: fetched next batch of ${next.length} assets for job ${jobId}`);
        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, assets.length) }, worker));
      }

      lastRunTokenCost = liveEnrichment!.tokenCost;

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
        processed: liveEnrichment!.processed,
        improved: liveEnrichment!.improved,
        completedAt: new Date(),
        ...(completenessAfterRun !== null ? { completenessAfterRun } : {}),
      });
      console.log(`[enrichment] Job ${jobId} completed: ${liveEnrichment!.improved} improved out of ${liveEnrichment!.processed} processed Â· $${lastRunTokenCost.toFixed(4)} spent`);
      // Fire-and-forget quality snapshot for institution-scoped runs.
      if (filters.institution) {
        storage.captureInstitutionQualitySnapshot(filters.institution).catch(() => {});
      }
    } catch (e: any) {
      await storage.updateEnrichmentJob(jobId, { status: "error", processed: liveEnrichment!.processed, improved: liveEnrichment!.improved, completedAt: new Date() });
      console.error("[enrichment] Job failed:", e);
    } finally {
      liveEnrichment = null;
    }
  }

  // Every /api/admin/* route requires a Supabase Bearer token for an admin email.
  // Must be registered before the admin routes to take effect.

  app.get("/api/admin/enrichment/stats", async (req, res) => {
    try {
      const stats = await storage.getEnrichmentStats();
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch enrichment stats" });
    }
  });

  // Institution-level enrichment queue breakdown â€” used by the enrichment
  // filter combobox to show only institutions with pending work + their counts.
  app.get("/api/admin/enrichment/institution-queues", async (req, res) => {
    try {
      const institutions = await storage.getEnrichmentInstitutionQueues();
      res.json({ institutions });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch institution queues" });
    }
  });

  // Per-institution quality snapshot history.
  app.get("/api/admin/enrichment/institution-quality/history", async (req, res) => {
    const institution = String(req.query.institution ?? "").trim();
    if (!institution) return res.status(400).json({ error: "institution query param required" });
    try {
      const history = await storage.getInstitutionQualityHistory(institution);
      res.json(history);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch quality history" });
    }
  });

  // On-demand snapshot â€” lets the admin manually bookmark current quality state.
  app.post("/api/admin/enrichment/institution-quality/snapshot", async (req, res) => {
    const institution = String(req.query.institution ?? "").trim();
    if (!institution) return res.status(400).json({ error: "institution query param required" });
    try {
      await storage.captureInstitutionQualitySnapshot(institution);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to capture snapshot" });
    }
  });

  // Per-institution enrichment quality snapshot used by the ExpandedSyncPanel.
  app.get("/api/admin/enrichment/institution-quality", async (req, res) => {
    const institution = String(req.query.institution ?? "").trim();
    if (!institution) return res.status(400).json({ error: "institution query param required" });
    try {
      const quality = await storage.getInstitutionEnrichmentQuality(institution);
      res.json(quality);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch institution quality" });
    }
  });

  // â”€â”€ Rule-Based Fill â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  app.get("/api/admin/enrichment/rule-fill/estimate", async (req, res) => {
    try {
      const { estimateRuleBasedFill } = await import("../lib/pipeline/ruleBasedFill");
      const result = await estimateRuleBasedFill();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to estimate" });
    }
  });

  // â”€â”€ Rule-fill state: backed by /tmp/rule-fill-progress.json so it survives
  // server restarts. The actual work runs as a detached child process
  // (scripts/run-rule-fill.ts) so Replit checkpoint deploys / port conflicts
  // can't kill it mid-run.
  const RULE_FILL_PROGRESS_FILE = "/tmp/rule-fill-progress.json";

  function readRuleFillState(): {
    status: "idle" | "running" | "done" | "failed";
    pid?: number;
    processed?: number;
    total?: number;
    filled?: number;
    result?: { processed: number; filled: number; fieldsWritten: number; byField: Record<string, number>; dataSparseTagged: number };
    error?: string;
  } {
    try {
      const raw = require("fs").readFileSync(RULE_FILL_PROGRESS_FILE, "utf8");
      return JSON.parse(raw);
    } catch {
      return { status: "idle" };
    }
  }

  function isProcessAlive(pid: number): boolean {
    try { process.kill(pid, 0); return true; } catch { return false; }
  }

  app.get("/api/admin/enrichment/rule-fill/status", async (req, res) => {
    try {
      const state = readRuleFillState();
      const running = state.status === "running" && !!state.pid && isProcessAlive(state.pid);
      res.json({
        running,
        progress: running ? { processed: state.processed ?? 0, total: state.total ?? 0, filled: state.filled ?? 0 } : null,
        result: state.status === "done" ? state.result ?? null : null,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed" });
    }
  });

  app.post("/api/admin/enrichment/rule-fill", async (req, res) => {
    try {
      const state = readRuleFillState();
      if (state.status === "running" && state.pid && isProcessAlive(state.pid)) {
        return res.status(409).json({ error: "Rule-based fill already running" });
      }

      // Spawn as detached child process â€” survives server restarts
      const { spawn } = require("child_process");
      const child = spawn(
        "npx", ["tsx", "scripts/run-rule-fill.ts"],
        {
          detached: true,
          stdio: "inherit",
          env: { ...process.env },
        }
      );
      child.unref();
      console.log(`[rule-fill] Spawned detached process pid=${child.pid}`);

      res.json({ started: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to start rule-based fill" });
    }
  });

  app.post("/api/admin/enrichment/rule-fill/stop", async (req, res) => {
    try {
      const state = readRuleFillState();
      if (state.pid && isProcessAlive(state.pid)) {
        process.kill(state.pid, "SIGTERM");
        console.log(`[rule-fill] Sent SIGTERM to pid=${state.pid}`);
        res.json({ stopped: true });
      } else {
        res.json({ stopped: false, reason: "No running process found" });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed" });
    }
  });

  // â”€â”€ Rescore All Assets â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Re-computes completeness_score for every TTO asset using the current
  // field weights in computeCompletenessScore. Run this after bulk field
  // updates (MOA fill, biology fill, etc.) to apply the new weights.
  let rescoreRunning = false;
  let rescoreProcessed = 0;
  let rescoreTotal = 0;
  let rescoreUpdated = 0;
  let rescoreElapsedMs = 0;
  let rescoreStartedAt = 0;
  let rescoreLastSummary: { updated: number; total: number; durationMs: number; completedAt: string } | null = null;

  app.get("/api/admin/enrichment/rescore/status", async (_req, res) => {
    res.json({
      running: rescoreRunning,
      processed: rescoreProcessed,
      total: rescoreTotal,
      updated: rescoreUpdated,
      elapsedMs: rescoreRunning ? Date.now() - rescoreStartedAt : rescoreElapsedMs,
      lastSummary: rescoreLastSummary,
    });
  });

  app.post("/api/admin/enrichment/rescore", async (req, res) => {
    if (rescoreRunning) {
      return res.status(409).json({ error: "Rescore already running" });
    }
    rescoreRunning = true;
    rescoreProcessed = 0;
    rescoreTotal = 0;
    rescoreUpdated = 0;
    rescoreStartedAt = Date.now();
    res.json({ started: true });

    (async () => {
      try {
        const countResult = await db.execute(sql`SELECT COUNT(*)::int AS n FROM ingested_assets WHERE relevant = true`);
        rescoreTotal = Number((countResult.rows[0] as any)?.n ?? 0);

        const BATCH = 100;
        let offset = 0;
        let updated = 0;

        while (rescoreRunning) {
          const rows = await db.execute(sql`
            SELECT id, indication, modality, development_stage, summary,
                   mechanism_of_action, ip_type, patent_status, source_type, biology
            FROM ingested_assets
            WHERE relevant = true
            ORDER BY id
            LIMIT ${BATCH} OFFSET ${offset}
          `);
          if (rows.rows.length === 0) break;

          for (const row of rows.rows as Record<string, unknown>[]) {
            const newScore = computeCompletenessScore({
              indication:       row.indication != null ? String(row.indication) : undefined,
              modality:         row.modality != null ? String(row.modality) : undefined,
              developmentStage: row.development_stage != null ? String(row.development_stage) : undefined,
              summary:          row.summary != null ? String(row.summary) : undefined,
              mechanismOfAction: row.mechanism_of_action != null ? String(row.mechanism_of_action) : undefined,
              ipType:           row.ip_type != null ? String(row.ip_type) : undefined,
              patentStatus:     row.patent_status != null ? String(row.patent_status) : undefined,
              sourceType:       row.source_type != null ? String(row.source_type) : undefined,
              biology:          row.biology != null ? String(row.biology) : undefined,
            });
            if (newScore != null) {
              await db.execute(sql`UPDATE ingested_assets SET completeness_score = ${newScore} WHERE id = ${Number(row.id)}`);
              updated++;
            }
            rescoreProcessed++;
          }

          offset += BATCH;
          if (rows.rows.length < BATCH) break;
        }

        const durationMs = Date.now() - rescoreStartedAt;
        rescoreElapsedMs = durationMs;
        rescoreUpdated = updated;
        rescoreLastSummary = { updated, total: rescoreProcessed, durationMs, completedAt: new Date().toISOString() };
        console.log(`[rescore] Done â€” ${updated}/${rescoreProcessed} updated in ${Math.round(durationMs / 1000)}s`);
      } catch (err: any) {
        console.error("[rescore] Error:", err.message);
      } finally {
        rescoreRunning = false;
      }
    })();
  });

  app.post("/api/admin/enrichment/rescore/stop", async (_req, res) => {
    if (!rescoreRunning) {
      return res.json({ stopped: false, reason: "No rescore running" });
    }
    rescoreRunning = false;
    res.json({ stopped: true });
  });

  // â”€â”€ Modality Rule-Fill â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  let modalityFillRunning = false;
  let modalityFillResult: import("../lib/pipeline/modalityFill").ModalityFillSummary | null = null;

  app.get("/api/admin/enrich/modality-fill/status", (_req, res) => {
    res.json({ running: modalityFillRunning, result: modalityFillResult });
  });

  app.post("/api/admin/enrich/modality-fill", async (req, res) => {
    try {
      if (modalityFillRunning) {
        return res.status(409).json({ error: "Modality fill already running" });
      }
      modalityFillRunning = true;
      modalityFillResult = null;
      res.json({ started: true });

      // Run async without blocking the response
      (async () => {
        const { Pool } = await import("pg");
        const { runModalityFill } = await import("../lib/pipeline/modalityFill");
        const dbPool = new Pool({ connectionString: process.env.SUPABASE_DATABASE_URL!, ssl: { rejectUnauthorized: false } });
        const client = await dbPool.connect();
        try {
          const summary = await runModalityFill(client);
          modalityFillResult = summary;
          console.log(
            `[modality-fill] Done â€” updated ${summary.totalUpdated} assets` +
            ` (T1:${summary.tierCounts.t1} T2:${summary.tierCounts.t2} T3:${summary.tierCounts.t3}` +
            ` GPT-sent:${summary.gptSent} GPT-resolved:${summary.gptResolved})`,
          );
        } finally {
          client.release();
          await dbPool.end();
          modalityFillRunning = false;
        }
      })().catch(err => {
        console.error("[modality-fill] Async error:", err);
        modalityFillRunning = false;
      });
    } catch (err: any) {
      modalityFillRunning = false;
      res.status(500).json({ error: err.message ?? "Failed to start modality fill" });
    }
  });

  // â”€â”€ Deal Comparables Ingest (SEC EDGAR) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  let dealCompsIngestRunning = false;
  let dealCompsIngestLastLine = "";
  let dealCompsIngestChild: ReturnType<typeof spawn> | null = null;

  app.get("/api/admin/deal-comparables/status", (_req, res) => {
    res.json({ running: dealCompsIngestRunning, lastLine: dealCompsIngestLastLine });
  });

  app.post("/api/admin/deal-comparables/ingest", (_req, res) => {
    if (dealCompsIngestRunning) {
      return res.status(409).json({ error: "Deal comparables ingest already running" });
    }
    dealCompsIngestRunning = true;
    dealCompsIngestLastLine = "Startingâ€¦";

    const child = spawn("tsx", ["scripts/ingest-deal-comparables.ts"], {
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    dealCompsIngestChild = child;

    const handleLine = (chunk: Buffer, prefix = "") => {
      const lines = chunk.toString().split("\n").map(l => l.trim()).filter(Boolean);
      if (lines.length) dealCompsIngestLastLine = prefix + lines[lines.length - 1];
    };
    child.stdout?.on("data", (c: Buffer) => handleLine(c));
    child.stderr?.on("data", (c: Buffer) => handleLine(c, "[err] "));
    child.on("close", (code: number | null) => {
      dealCompsIngestRunning = false;
      dealCompsIngestLastLine = code === 0 ? "Completed successfully" : `Exited with code ${code ?? "?"}`;
      dealCompsIngestChild = null;
    });

    res.json({ started: true });
  });

  app.post("/api/admin/deal-comparables/ingest/stop", (_req, res) => {
    if (!dealCompsIngestRunning || !dealCompsIngestChild) {
      return res.status(409).json({ error: "No ingest is currently running" });
    }
    dealCompsIngestChild.kill("SIGTERM");
    dealCompsIngestRunning = false;
    dealCompsIngestLastLine = "Stopped by admin";
    dealCompsIngestChild = null;
    res.json({ stopped: true });
  });

  // â”€â”€ Biology Fill â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  let biologyFillRunning = false;
  let biologyFillResult: import("../lib/pipeline/biologyFill").BiologyFillSummary | null = null;
  let biologyFillProgress: import("../lib/pipeline/biologyFill").BiologyFillProgress | null = null;
  let biologyFillAbortController: AbortController | null = null;

  app.get("/api/admin/enrich/biology-fill/status", (_req, res) => {
    res.json({ running: biologyFillRunning, result: biologyFillResult, progress: biologyFillProgress });
  });

  app.post("/api/admin/enrich/biology-fill/stop", (_req, res) => {
    if (!biologyFillRunning || !biologyFillAbortController) {
      return res.status(409).json({ error: "Biology fill is not running" });
    }
    biologyFillAbortController.abort();
    res.json({ stopped: true });
  });

  app.get("/api/admin/enrich/biology-fill/count", async (req, res) => {
    try {
      const { Pool } = await import("pg");
      const dbPool = new Pool({ connectionString: process.env.SUPABASE_DATABASE_URL!, ssl: { rejectUnauthorized: false } });
      const client = await dbPool.connect();
      try {
        const { rows } = await client.query(
          `SELECT COUNT(*) AS total FROM ingested_assets
           WHERE relevant = true AND (biology IS NULL OR biology = '' OR biology = 'unknown')`,
        );
        res.json({ total: parseInt(rows[0].total, 10) });
      } finally {
        client.release();
        await dbPool.end();
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to count" });
    }
  });

  app.get("/api/admin/deal-comparables/stats", async (_req, res) => {
    try {
      const stats = await storage.getDealComparablesStats();
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch stats" });
    }
  });

  app.post("/api/admin/enrich/biology-fill", async (req, res) => {
    try {
      if (biologyFillRunning) {
        return res.status(409).json({ error: "Biology fill already running" });
      }
      biologyFillRunning = true;
      biologyFillResult = null;
      biologyFillProgress = null;
      biologyFillAbortController = new AbortController();
      res.json({ started: true });

      const cap = typeof req.body?.cap === "number" && req.body.cap > 0 ? req.body.cap : undefined;
      console.log(`[biology-fill] Starting${cap ? ` (cap=${cap})` : " (full run)"}`);

      (async () => {
        const { Pool } = await import("pg");
        const { runBiologyFill } = await import("../lib/pipeline/biologyFill");
        const dbPool = new Pool({ connectionString: process.env.SUPABASE_DATABASE_URL!, ssl: { rejectUnauthorized: false } });
        const client = await dbPool.connect();
        try {
          const summary = await runBiologyFill(client, {
            cap,
            signal: biologyFillAbortController!.signal,
            onProgress: (p) => {
              biologyFillProgress = p;
            },
          });
          biologyFillResult = summary;
          console.log(
            `[biology-fill] Done â€” fetched ${summary.total}, updated ${summary.totalUpdated} assets` +
            ` (target_derived:${summary.targetDerived} rule:${summary.ruleMatched}` +
            ` gpt_sent:${summary.gptSent} gpt_resolved:${summary.gptResolved}` +
            ` unresolved:${summary.unresolved})`,
          );
        } finally {
          client.release();
          await dbPool.end();
          biologyFillRunning = false;
          biologyFillAbortController = null;
        }
      })().catch(err => {
        console.error("[biology-fill] Async error:", err);
        biologyFillRunning = false;
        biologyFillAbortController = null;
      });
    } catch (err: any) {
      biologyFillRunning = false;
      biologyFillAbortController = null;
      res.status(500).json({ error: err.message ?? "Failed to start biology fill" });
    }
  });

  // â”€â”€ MOA Fill â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  let moaFillRunning = false;
  let moaFillResult: import("../lib/pipeline/moaFill").MoaFillSummary | null = null;
  let moaFillProgress: import("../lib/pipeline/moaFill").MoaFillProgress | null = null;
  let moaFillAbortController: AbortController | null = null;

  app.get("/api/admin/enrich/moa-fill/status", (_req, res) => {
    res.json({ running: moaFillRunning, result: moaFillResult, progress: moaFillProgress });
  });

  app.post("/api/admin/enrich/moa-fill/stop", (_req, res) => {
    if (!moaFillRunning || !moaFillAbortController) {
      return res.status(409).json({ error: "MOA fill is not running" });
    }
    moaFillAbortController.abort();
    res.json({ stopped: true });
  });

  app.get("/api/admin/enrich/moa-fill/count", async (_req, res) => {
    try {
      const { Pool } = await import("pg");
      const dbPool = new Pool({ connectionString: process.env.SUPABASE_DATABASE_URL!, ssl: { rejectUnauthorized: false } });
      const client = await dbPool.connect();
      try {
        // Count assets that would be addressed by either pass.
        // Pass 1: has biology bucket but no MOA.
        // Pass 2: has rich text (summary OR abstract OR innovation_claim > 200 chars combined) but no MOA.
        const { rows } = await client.query<{ total: string }>(
          `SELECT COUNT(*)::text AS total FROM ingested_assets
           WHERE relevant = true
             AND (mechanism_of_action IS NULL OR mechanism_of_action = '' OR mechanism_of_action = 'unknown')
             AND (
               (biology IS NOT NULL AND biology != '' AND biology != 'unknown')
               OR LENGTH(COALESCE(summary, '')) > 200
               OR LENGTH(COALESCE(abstract, '')) > 200
               OR LENGTH(COALESCE(innovation_claim, '')) > 200
               OR (LENGTH(COALESCE(summary, '')) + LENGTH(COALESCE(abstract, '')) + LENGTH(COALESCE(innovation_claim, ''))) > 200
             )`,
        );
        res.json({ total: parseInt(rows[0]?.total ?? "0", 10) });
      } finally {
        client.release();
        await dbPool.end();
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to count MOA fill queue" });
    }
  });

  app.post("/api/admin/enrich/moa-fill", async (req, res) => {
    try {
      if (moaFillRunning) {
        return res.status(409).json({ error: "MOA fill already running" });
      }
      moaFillRunning = true;
      moaFillResult = null;
      moaFillProgress = null;
      moaFillAbortController = new AbortController();

      const cap = typeof req.body?.cap === "number" && req.body.cap > 0 ? req.body.cap : undefined;
      console.log(`[moa-fill] Starting${cap ? ` (cap=${cap})` : " (full run)"}`);

      // â”€â”€ Pass 1: run synchronously before responding â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      // This is fast (deterministic lookup, no AI calls) so it completes before
      // the HTTP response, letting the caller see pass1 results immediately.
      const { Pool } = await import("pg");
      const { runMoaFillPass1, runMoaFillPass2 } = await import("../lib/pipeline/moaFill");
      const dbPool = new Pool({ connectionString: process.env.SUPABASE_DATABASE_URL!, ssl: { rejectUnauthorized: false } });
      const pass1Client = await dbPool.connect();
      let pass1Filled = 0;
      let pass1Total = 0;
      try {
        const p1 = await runMoaFillPass1(pass1Client, {
          cap,
          signal: moaFillAbortController.signal,
          onProgress: (p) => { moaFillProgress = p; },
        });
        pass1Filled = p1.pass1Filled;
        pass1Total = p1.pass1Total;
        console.log(`[moa-fill] Pass 1 done â€” ${pass1Filled}/${pass1Total} biologyâ†’MOA`);
      } finally {
        pass1Client.release();
      }

      // Respond now so the client receives pass1 results without waiting for AI
      res.json({ started: true, pass1Filled, pass1Total });

      // â”€â”€ Pass 2: run async in the background â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      const pass2Cap = cap ? Math.max(0, cap - pass1Total) : undefined;
      (async () => {
        const client2 = await dbPool.connect();
        try {
          const { pass2Total, aiFilled, failed } = await runMoaFillPass2(client2, {
            cap: pass2Cap,
            signal: moaFillAbortController!.signal,
            onProgress: (p) => { moaFillProgress = p; },
            pass1Filled,
          });
          const summary = { pass1Total, pass1Filled, pass2Total, aiFilled, failed, totalWritten: pass1Filled + aiFilled };
          moaFillResult = summary;
          console.log(
            `[moa-fill] Done â€” pass1:${pass1Filled}/${pass1Total} biologyâ†’MOA` +
            ` pass2:${aiFilled}/${pass2Total} AI` +
            ` total written:${summary.totalWritten} failed:${failed}`,
          );
        } finally {
          client2.release();
          await dbPool.end();
          moaFillRunning = false;
          moaFillAbortController = null;
        }
      })().catch(err => {
        console.error("[moa-fill] Pass 2 async error:", err);
        moaFillRunning = false;
        moaFillAbortController = null;
        dbPool.end().catch(() => {});
      });
    } catch (err: any) {
      moaFillRunning = false;
      moaFillAbortController = null;
      if (!res.headersSent) {
        res.status(500).json({ error: err.message ?? "Failed to start MOA fill" });
      }
    }
  });

  // â”€â”€ Data-Sparse Flag Reset â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  app.post("/api/admin/enrichment/clear-sparse", async (req, res) => {
    try {
      const { resetDataSparseFlags } = await import("../lib/pipeline/ruleBasedFill");
      const count = await resetDataSparseFlags();
      res.json({ cleared: count });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to clear sparse flags" });
    }
  });

  // â”€â”€ USPTO PatentsView Cross-Reference â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  let usptoRunning = false;
  let usptoProgress: { processed: number; total: number; matched: number; unmatched: number; skipped: number } | null = null;
  let usptoResult: { processed: number; matched: number; unmatched: number; skipped: number; missingIpTypeCount: number } | null = null;
  let usptoShouldStop = false;
  let usptoSpotCheckValidation: { results: Array<{ institution: string; assigneeName: string; count: number; hasTitle: boolean; hasValidDate: boolean; sample: Array<{ number: string; title: string; date: string | null }>; error?: string; valid: boolean }>; validCount: number; passed: boolean; reason?: string } | null = null;

  app.get("/api/admin/enrichment/uspto/status", async (req, res) => {
    try {
      res.json({
        running: usptoRunning,
        progress: usptoProgress,
        result: usptoResult,
        spotCheck: usptoSpotCheckValidation,
        noApiKey: !process.env.USPTO_ODP_API_KEY,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed" });
    }
  });

  app.get("/api/admin/enrichment/uspto/count", async (req, res) => {
    try {
      const { countMissingIpType } = await import("../lib/pipeline/usptoPatentLookup");
      const count = await countMissingIpType();
      res.json({ missingIpTypeCount: count });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to count" });
    }
  });

  app.post("/api/admin/enrichment/uspto/spot-check", async (req, res) => {
    try {
      const apiKey = process.env.USPTO_ODP_API_KEY ?? "";
      const { runSpotCheck } = await import("../lib/pipeline/usptoPatentLookup");
      const validation = await runSpotCheck(apiKey);
      usptoSpotCheckValidation = validation;
      if (!validation.passed) {
        return res.status(502).json({
          error: validation.reason ?? "Spot check gate failed â€” fewer than 3 institutions returned valid patent data",
          validation,
        });
      }
      res.json({ validation });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Spot check failed" });
    }
  });

  app.post("/api/admin/enrichment/uspto/run", async (req, res) => {
    try {
      if (usptoRunning) return res.status(409).json({ error: "USPTO cross-reference already running" });

      const apiKey = process.env.USPTO_ODP_API_KEY ?? "";
      usptoRunning = true;
      usptoProgress = { processed: 0, total: 0, matched: 0, unmatched: 0, skipped: 0 };
      usptoResult = null;
      usptoShouldStop = false;

      res.json({ started: true });

      import("../lib/pipeline/usptoPatentLookup").then(({ runUsptoPatentCrossRef }) => {
        runUsptoPatentCrossRef({
          apiKey,
          onProgress: (p) => { usptoProgress = p; },
          shouldStop: () => usptoShouldStop,
        }).then((summary) => {
          usptoResult = summary;
          console.log(`[uspto-xref] Done: matched=${summary.matched} unmatched=${summary.unmatched} skipped=${summary.skipped}`);
        }).catch((err) => {
          console.error("[uspto-xref] Failed:", err);
        }).finally(() => {
          usptoRunning = false;
        });
      });
    } catch (err: any) {
      usptoRunning = false;
      res.status(500).json({ error: err.message ?? "Failed to start USPTO cross-reference" });
    }
  });

  app.post("/api/admin/enrichment/uspto/stop", async (req, res) => {
    try {
      usptoShouldStop = true;
      res.json({ stopped: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed" });
    }
  });

  // â”€â”€ Human-Verified Field Locking â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  app.post("/api/admin/assets/:id/verify-field", async (req, res) => {
    try {
      const assetId = parseInt(String(req.params.id));
      if (isNaN(assetId)) return res.status(400).json({ error: "Invalid asset ID" });
      const { field, verified } = req.body;
      if (!field || typeof field !== "string") return res.status(400).json({ error: "field required" });
      await storage.setHumanVerified(assetId, field, verified !== false);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed" });
    }
  });

  // â”€â”€ Mini Enrich Queue â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  app.get("/api/admin/enrichment/mini-queue", async (req, res) => {
    try {
      const queue = await storage.getMiniEnrichQueue();
      res.json(queue);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed" });
    }
  });

  // One-time backfill: seeds mini_enrich_attempts = 1 for assets that were already
  // processed (enriched_at IS NOT NULL) but still have 3+ unknowns. Prevents the new
  // attempt cap from immediately giving them a fresh 3-attempt slate when the new column
  // defaults to 0 â€” they still get 2 more attempts (1 â†’ 3) with the improved prompts.
  app.post("/api/admin/enrichment/mini-backfill", async (req, res) => {
    try {
      const updated = await storage.backfillMiniEnrichAttempts();
      console.log(`[enrichment] mini-backfill: seeded mini_enrich_attempts=1 for ${updated} assets`);
      res.json({ updated });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Backfill failed" });
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
          ROUND(100.0 * COUNT(CASE WHEN target IS NOT NULL AND target NOT IN ('unknown','') THEN 1 END) / NULLIF(COUNT(*),0), 1) AS fill_target,
          ROUND(100.0 * COUNT(CASE WHEN indication IS NOT NULL AND indication NOT IN ('unknown','') THEN 1 END) / NULLIF(COUNT(*),0), 1) AS fill_indication,
          ROUND(100.0 * COUNT(CASE WHEN modality IS NOT NULL AND modality NOT IN ('unknown','') THEN 1 END) / NULLIF(COUNT(*),0), 1) AS fill_modality,
          ROUND(100.0 * COUNT(CASE WHEN development_stage IS NOT NULL AND development_stage NOT IN ('unknown','') THEN 1 END) / NULLIF(COUNT(*),0), 1) AS fill_stage,
          ROUND(100.0 * COUNT(CASE WHEN licensing_readiness IS NOT NULL AND licensing_readiness NOT IN ('unknown','') THEN 1 END) / NULLIF(COUNT(*),0), 1) AS fill_licensing,
          ROUND(100.0 * COUNT(CASE WHEN ip_type IS NOT NULL AND ip_type NOT IN ('unknown','') THEN 1 END) / NULLIF(COUNT(*),0), 1) AS fill_patent,
          ROUND(100.0 * COUNT(CASE WHEN biology IS NOT NULL AND biology NOT IN ('unknown','','other') THEN 1 END) / NULLIF(COUNT(*),0), 1) AS fill_biology,
          ROUND(100.0 * COUNT(CASE WHEN mechanism_of_action IS NOT NULL AND mechanism_of_action NOT IN ('unknown','') THEN 1 END) / NULLIF(COUNT(*),0), 1) AS fill_moa,
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
      res.status(500).json({ error: err.message ?? "Failed to fetch dataset quality" });
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
      res.status(500).json({ error: err.message ?? "Failed to fetch class breakdown" });
    }
  });

  // --- Dimensional Analytics ---

  const DIM_COL: Record<string, string> = {
    modality: "modality",
    stage: "development_stage",
    indication: "indication",
    biology: "biology",
  };

  app.get("/api/admin/dataset-quality/dimensions", async (req, res) => {
    try {

      const dim = String(req.query.dim ?? "modality");
      const col = DIM_COL[dim];
      if (!col) return res.status(400).json({ error: "Invalid dim â€” use modality, stage, indication, or biology" });

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
      res.status(500).json({ error: err.message ?? "Failed to fetch dimensions" });
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
      res.status(500).json({ error: err.message ?? "Export failed" });
    }
  });

  // â”€â”€ Confidence Distribution + Save-Rate by Confidence (Task #693) â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Surfaces (a) how the classifier's confidence is distributed across the
  // corpus and (b) whether higher-confidence rows are actually saved more
  // often by users â€” a feedback loop for tuning the confidence-aware ranker.
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
      res.status(500).json({ error: err.message ?? "Failed to fetch confidence distribution" });
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
      res.status(500).json({ error: err.message ?? "Failed to fetch institution assets" });
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
      res.status(500).json({ error: err.message ?? "Export failed" });
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
      res.status(500).json({ error: err.message ?? "Export failed" });
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
      res.status(500).json({ error: err.message ?? "Failed" });
    }
  });

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
      res.status(500).json({ error: err.message ?? "Failed to fetch assets" });
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
      res.status(500).json({ error: err.message ?? "Export failed" });
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
      res.status(500).json({ error: err.message ?? "Patch failed" });
    }
  });

  app.get("/api/admin/enrichment/status", async (req, res) => {

    const lastJob = await storage.getLatestEnrichmentJob();

    if (liveEnrichment && lastJob && liveEnrichment.jobId === lastJob.id) {
      return res.json({
        status: "running",
        jobId: lastJob.id,
        processed: liveEnrichment.processed,
        total: liveEnrichment.total,
        improved: liveEnrichment.improved,
        resumed: liveEnrichment.resumed,
        tokenCost: liveEnrichment.tokenCost,
        filters: Object.keys(liveEnrichment.filters).length > 0 ? liveEnrichment.filters : undefined,
      });
    }

    if (lastJob) {
      // "completed" is the reset/dismissed state â€” treat as idle for UI purposes
      if (lastJob.status === "completed") {
        return res.json({ status: "idle", processed: 0, total: 0, improved: 0, resumed: false });
      }
      return res.json({
        status: lastJob.status as string,
        jobId: lastJob.id,
        processed: lastJob.processed,
        total: lastJob.total,
        improved: lastJob.improved,
        resumed: false,
        // Include spend from the last completed run so the "done" banner and toast show cost.
        tokenCost: lastJob.status === "done" ? lastRunTokenCost : undefined,
      });
    }

    res.json({ status: "idle", processed: 0, total: 0, improved: 0, resumed: false });
  });

  app.post("/api/admin/enrichment/reset", async (req, res) => {
    try {
      if (liveEnrichment) {
        return res.status(409).json({ error: "Cannot reset while enrichment is running" });
      }
      await storage.resetLatestEnrichmentJob();
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to reset enrichment status" });
    }
  });

  app.get("/api/admin/enrichment/health", async (req, res) => {
    try {
      // readyCount uses getFilteredEnrichCount({}) so it always matches the
      // /count endpoint and the run-button label â€” same buildEnrichWhere criteria.
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
      res.status(500).json({ error: err.message ?? "Failed to fetch enrichment health" });
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
      res.status(500).json({ error: err.message ?? "Failed to count enrichment queue" });
    }
  });

  app.get("/api/admin/enrichment/jobs", async (req, res) => {
    try {
      const institution = req.query.institution ? String(req.query.institution) : undefined;
      if (!institution) return res.status(400).json({ error: "institution query param required" });
      const jobs = await storage.getEnrichmentJobsForInstitution(institution);
      res.json(jobs);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch enrichment jobs" });
    }
  });

  app.post("/api/admin/enrichment/run", async (req, res) => {
    try {

      if (liveEnrichment) {
        return res.status(409).json({ error: "Enrichment job already running" });
      }

      const existingJob = await storage.getRunningEnrichmentJob();
      if (existingJob) {
        return res.status(409).json({ error: "Enrichment job already running â€” resume manually from the Data Quality tab if interrupted" });
      }

      // ?all=1 (or POST body { all: true }) drains the entire mini-queue under a single
      // job, fetching the next 500 un-scanned assets after each batch finishes. The
      // selection query already excludes anything we just scored, so we never re-pay
      // for the same asset.
      const drainAll = req.query.all === "1" || req.body?.all === true;

      // Extract optional targeting filters from the POST body.
      const filters: EnrichFilter = {};
      if (req.body?.institution) filters.institution = String(req.body.institution);
      if (req.body?.modality) filters.modality = String(req.body.modality);
      if (req.body?.stage) filters.stage = String(req.body.stage);
      if (req.body?.indication) filters.indication = String(req.body.indication);
      if (req.body?.tier) filters.tier = String(req.body.tier);
      if (req.body?.missingField) filters.missingField = String(req.body.missingField);

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

      standardEnrichShouldStop = false;
      runEnrichmentWorker(job.id, assets, 0, 0, false, drainAll, filters);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to start enrichment" });
    }
  });

  // On startup, mark any stale mini-enrichment job as interrupted so the admin
  // can resume it manually from the Data Quality tab. Auto-resume is disabled
  // to prevent unbounded cost on server restart.
  // Note: only handles mini-enrichment jobs (model != "gpt-4o"). Stale EDEN
  // deep-enrichment jobs (model = "gpt-4o") keep status = "running" so the
  // stale-job resume banner in the Data Quality tab can detect and surface them.
  setTimeout(async () => {
    try {
      const staleJob = await storage.getRunningEnrichmentJob();
      if (staleJob && staleJob.model !== "gpt-4o") {
        const remaining = await storage.getMiniEnrichBatch(500);
        if (remaining.length > 0) {
          console.log(`[enrichment] Stale mini-enrichment job ${staleJob.id} detected (${remaining.length} assets remaining). Auto-resume disabled â€” resume from the Data Quality tab.`);
          await storage.updateEnrichmentJob(staleJob.id, { status: "interrupted" });
        } else {
          await storage.updateEnrichmentJob(staleJob.id, { status: "done", completedAt: new Date() });
          console.log(`[enrichment] Stale mini-enrichment job ${staleJob.id} had no remaining work â€” marked done`);
        }
      }
    } catch (e) {
      console.error("[enrichment] Failed to check for stale jobs:", e);
    }
  }, 15_000);

  // â”€â”€ EDEN routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
      // can report band movements (e.g. bareâ†’very_sparse) after the run.
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
    res.json({ message: "Stop signal sent â€” finishing in-flight batch then halting" });
  });

  app.post("/api/admin/enrichment/stop", async (req, res) => {
    if (!liveEnrichment) return res.json({ message: "No standard enrichment running" });
    standardEnrichShouldStop = true;
    res.json({ message: "Stop signal sent â€” finishing in-flight assets then halting" });
  });

  // â”€â”€ Classify Unclassified (Step 2b) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Targets all relevant assets where asset_class IS NULL (never deep-enriched).
  // deepEnrichBatch model routing: <40 chars â†’ skip; 40â€“119 â†’ gpt-4o-mini lite;
  // 120â€“599 â†’ gpt-4o-mini full; â‰¥600 â†’ gpt-4o (abstracts only).

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
      // Cost: thick â†’ gpt-4o ($2.50/1M input, $10/1M output, ~853 in + 400 out tokens)
      //       thin  â†’ gpt-4o-mini ($0.15/1M input, $0.60/1M output, ~732 in + 200 out tokens)
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
    if (bandRunning) return res.status(409).json({ error: "Band enrichment is running â€” stop it first" });
    if (edenRunning) return res.status(409).json({ error: "Eden deep enrichment is running â€” stop it first" });

    try {
      const { cap: rawCap = 30000 } = req.body as { cap?: number };
      const cap = Math.min(50000, Math.max(10, Number(rawCap) || 30000));

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
        console.log(`[classify] Complete: ${result.succeeded} classified, ${result.skipped} thin-skipped, ${result.failed} failed â€” $${costUsd.toFixed(4)}`);
      }).catch((e) => {
        classifyRunning = false;
        console.error("[classify] Failed:", e);
      });
    } catch (err: any) {
      classifyRunning = false;
      res.status(500).json({ error: err.message });
    }
  });

  // â”€â”€ TTO Licensing Fill (zero API cost â€” source_type structural rule) â”€â”€â”€â”€â”€â”€â”€â”€

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

  // â”€â”€ Modality Fill (Step 2c â€” rule-based keyword matching, zero API cost) â”€â”€

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

  // â”€â”€ Dev-Stage Fill (regex + LLM two-phase pass) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

    const { cap: rawCap = 5000, phase: rawPhase } = req.body as { cap?: number; phase?: number };
    const cap = Math.min(20000, Math.max(10, Number(rawCap) || 5000));
    const onlyPhase: number | null = rawPhase ? Number(rawPhase) : null;

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

    // â”€â”€ Inline SQL score expression matching computeCompletenessScore() â”€â”€â”€â”€â”€â”€
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

    // â”€â”€ Background job â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    (async () => {
      const t0 = Date.now();
      let costUsd = 0;

      try {
        // â”€â”€ Phase 1: SQL regex â€” atomic stage + score UPDATE in one CTE â”€â”€
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
          // â”€â”€ Phase 2: LLM â€” collect results, then single atomic batch UPDATE â”€â”€
          if (!process.env.OPENAI_API_KEY) {
            console.warn("[fill-stage] Phase 2 skipped â€” OPENAI_API_KEY not set");
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

            // Collect all (id, stage) results first â€” then one atomic batch UPDATE
            const llmResults = new Map<number, string>(); // id â†’ stage to write
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
                } catch {
                  // swallow individual errors
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
        console.log(`[fill-stage] Done â€” regex=${stageFillRegexFilled} llm=${stageFillLlmFilled}`);
      }
    })();
  });

  // â”€â”€ Surgical band enrichment (Step 3 GPT-4o) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
        const key = `${prev}â†’${bnd}`;
        movements[key] = (movements[key] ?? 0) + 1;
      }
    }
    return movements;
  };

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
          // Bare assets have no content â€” zero cost, re-scrape required
          estCostFull: isBare ? 0 : parseFloat((d.count * costPerAsset).toFixed(2)),
          // Gap-fill cost = avg missing fields per asset Ã— per-field-fill cost Ã— eligible asset count
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
    if (edenRunning) return res.status(409).json({ error: "EDEN deep enrichment is already running â€” stop it first" });

    const { band, gapFill = true, cap: rawCap = 500, newestFirst = false, fields } = req.body as { band: string; gapFill?: boolean; cap?: number; newestFirst?: boolean; fields?: string[] };
    const cap = Math.min(5000, Math.max(10, Number(rawCap) || 500));
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

      // â”€â”€ Pre-run: sample avg completeness score + snapshot band distribution â”€â”€
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

      // â”€â”€ Canonical gap-fill target fields (overridable) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      // Primary fields first (target/modality/indication/stage) â€” these power Scout cards and ranking.
      // Secondary fields follow (MoA/unmet/comparable/innovation) â€” these enrich the dossier.
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

      // Helper: compute per-asset missing fields â€” only include fields that are null/empty for THIS asset
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
          return false; // unknown field â€” skip
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
            // "only upgrade" logic in storage can promote null/"unknown" â†’ real value.
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
        console.log(`[band-enrich] ${band} ${gapFill ? "(gap-fill)" : "(full)"} complete: ${result.succeeded} succeeded, ${result.failed} failed, $${costUsd.toFixed(4)}, score ${bandAvgScoreBefore} â†’ ${avgScoreAfter}, movements: ${JSON.stringify(bandMovements)}`);
      }).catch((e) => {
        bandRunning = false;
        console.error("[band-enrich] failed:", e);
      });
    } catch (err: any) {
      bandRunning = false;
      res.status(500).json({ error: err.message });
    }
  });

  // â”€â”€ EDEN embedding routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  let embedRunning = false;
  let embedProcessed = 0;
  let embedTotal = 0;
  let embedSucceeded = 0;
  let embedFailed = 0;

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

  // â”€â”€ Researcher portal routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

}