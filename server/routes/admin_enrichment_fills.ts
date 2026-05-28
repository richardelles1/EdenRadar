import type { Express } from "express";
import { spawn } from "child_process";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { storage } from "../storage";
import { computeCompletenessScore } from "../lib/pipeline/contentHash";

// ── Rule-fill state: backed by /tmp/rule-fill-progress.json so it survives
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

let rescoreRunning = false;
let rescoreProcessed = 0;
let rescoreTotal = 0;
let rescoreUpdated = 0;
let rescoreElapsedMs = 0;
let rescoreStartedAt = 0;
let rescoreLastSummary: { updated: number; total: number; durationMs: number; completedAt: string } | null = null;

let modalityFillRunning = false;
let modalityFillResult: import("../lib/pipeline/modalityFill").ModalityFillSummary | null = null;
let modalityFillAbortController: AbortController | null = null;

let dealCompsIngestRunning = false;
let dealCompsIngestLastLine = "";
let dealCompsIngestChild: ReturnType<typeof spawn> | null = null;

let biologyFillRunning = false;
let biologyFillResult: import("../lib/pipeline/biologyFill").BiologyFillSummary | null = null;
let biologyFillProgress: import("../lib/pipeline/biologyFill").BiologyFillProgress | null = null;
let biologyFillAbortController: AbortController | null = null;

let moaFillRunning = false;
let moaFillResult: import("../lib/pipeline/moaFill").MoaFillSummary | null = null;
let moaFillProgress: import("../lib/pipeline/moaFill").MoaFillProgress | null = null;
let moaFillAbortController: AbortController | null = null;

let usptoRunning = false;
let usptoProgress: { processed: number; total: number; matched: number; unmatched: number; skipped: number } | null = null;
let usptoResult: { processed: number; matched: number; unmatched: number; skipped: number; missingIpTypeCount: number } | null = null;
let usptoShouldStop = false;
let usptoSpotCheckValidation: { results: Array<{ institution: string; assigneeName: string; count: number; hasTitle: boolean; hasValidDate: boolean; sample: Array<{ number: string; title: string; date: string | null }>; error?: string; valid: boolean }>; validCount: number; passed: boolean; reason?: string } | null = null;

export function registerFillRoutes(app: Express): void {

  app.get("/api/admin/enrichment/stats", async (req, res) => {
    try {
      const stats = await storage.getEnrichmentStats();
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch enrichment stats" });
    }
  });

  // Institution-level enrichment queue breakdown – used by the enrichment
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

  // On-demand snapshot – lets the admin manually bookmark current quality state.
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

  // ── Rule-Based Fill ────────────────────────────────────────────────────────

  app.get("/api/admin/enrichment/rule-fill/estimate", async (req, res) => {
    try {
      const { estimateRuleBasedFill } = await import("../lib/pipeline/ruleBasedFill");
      const result = await estimateRuleBasedFill();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to estimate" });
    }
  });

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

      // Spawn as detached child process – survives server restarts
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

  // ── Rescore All Assets ────────────────────────────────────────────────────
  // Re-computes completeness_score for every TTO asset using the current
  // field weights in computeCompletenessScore. Run this after bulk field
  // updates (MOA fill, biology fill, etc.) to apply the new weights.

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
        console.log(`[rescore] Done – ${updated}/${rescoreProcessed} updated in ${Math.round(durationMs / 1000)}s`);
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

  // ── Modality Rule-Fill ────────────────────────────────────────────────────

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
            `[modality-fill] Done – updated ${summary.totalUpdated} assets` +
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

  // ── Deal Comparables Ingest (SEC EDGAR) ──────────────────────────────────────

  app.get("/api/admin/deal-comparables/status", (_req, res) => {
    res.json({ running: dealCompsIngestRunning, lastLine: dealCompsIngestLastLine });
  });

  app.post("/api/admin/deal-comparables/ingest", (_req, res) => {
    if (dealCompsIngestRunning) {
      return res.status(409).json({ error: "Deal comparables ingest already running" });
    }
    dealCompsIngestRunning = true;
    dealCompsIngestLastLine = "Starting…";

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

  // ── Biology Fill ──────────────────────────────────────────────────────────────

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
            `[biology-fill] Done – fetched ${summary.total}, updated ${summary.totalUpdated} assets` +
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

  // ── MOA Fill ─────────────────────────────────────────────────────────────────

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

      // ── Pass 1: run synchronously before responding ────────────────────────
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
        console.log(`[moa-fill] Pass 1 done – ${pass1Filled}/${pass1Total} biology→MOA`);
      } finally {
        pass1Client.release();
      }

      // Respond now so the client receives pass1 results without waiting for AI
      res.json({ started: true, pass1Filled, pass1Total });

      // ── Pass 2: run async in the background ────────────────────────────────
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
            `[moa-fill] Done – pass1:${pass1Filled}/${pass1Total} biology→MOA` +
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

  // ── Data-Sparse Flag Reset ────────────────────────────────────────────────

  app.post("/api/admin/enrichment/clear-sparse", async (req, res) => {
    try {
      const { resetDataSparseFlags } = await import("../lib/pipeline/ruleBasedFill");
      const count = await resetDataSparseFlags();
      res.json({ cleared: count });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to clear sparse flags" });
    }
  });

  // ── USPTO PatentsView Cross-Reference ─────────────────────────────────────

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
          error: validation.reason ?? "Spot check gate failed – fewer than 3 institutions returned valid patent data",
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
}
