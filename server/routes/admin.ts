import crypto from "crypto";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import type { Express } from "express";
import { z } from "zod";
import { db, pool } from "../db";
import { eq, ne, and, sql, desc, or, ilike, inArray, gte, gt, count as drizzleCount, isNull } from "drizzle-orm";
import { storage, type EnrichFilter, insertAdminEvent, getAdminEvents, setIndustryProfileStatus, getPlanEntitlements, getOrgEntitlementOverrides, upsertOrgEntitlementOverride, deleteOrgEntitlementOverride, upgradeIndividualToOrg, assignUserToOrg } from "../storage";
import { insertDiscoveryCardSchema, insertConceptCardSchema, conceptCards, conceptInterests, researchNeeds, researchProjects, userAlerts, type UserAlert, type IngestedAsset, ingestedAssets, pipelineLists, savedAssets, insertManualInstitutionSchema, SAVED_ASSET_STATUSES, sharedLinks, industryProfiles, appEvents, marketEois, marketListings, marketDeals, marketDealTermSheets, marketDealObservers, marketDealFeedback, dealComparables, marketAvailabilityNotifications, marketSavedSearches, insertMarketSavedSearchSchema, scoutSavedSearches, insertScoutSavedSearchSchema, institutionMetadata, emailUnsubscribes, apiKeys, apiUsageLogs, apiKeyAuditLog, API_TIER_CONFIG, apiRateLimitWindows, edenQueries } from "@shared/schema";
import { slugifyInstitutionName } from "../lib/institutionSeed";
import { resolveAuthorName, logTeamActivity, logAppEvent } from "../lib/routeHelpers";
import { computeCompletenessScore, computeContentHash } from "../lib/pipeline/contentHash";
import { fetchHtml, extractText } from "../lib/scrapers/utils";
import { DESCRIPTION_SELECTORS } from "../lib/scrapers/detailFetcher";
import { makeFingerprint } from "../lib/ingestion";
import { classifyBatch, classifyAsset } from "../lib/pipeline/classifyAsset";
import OpenAI from "openai";
import Stripe from "stripe";
import multer from "multer";
import mammoth from "mammoth";
import { dataSources, getSourceHealthEntries } from "../lib/sources/index";
import { normalizeSignals } from "../lib/pipeline/normalizeSignals";
import { scoreAssets, scoreFreshness, scoreNovelty, scoreReadiness, scoreLicensability, scoreCompetition, scoreCompleteness, scoreAvailability, computeTotal, TTO_WEIGHTS } from "../lib/pipeline/scoreAssets";
import { deepEnrichBatch } from "../lib/pipeline/deepEnrichBatch";
import { embedAssets } from "../lib/pipeline/embedAssets";
import { embedQuery, ragQuery, fetchPortfolioStats, parseQueryFilters, hasMeaningfulFilters, getOrUpdateSessionFocus, detectInstitutionName, rerankAssets, persistSessionFocus, seedSessionFocusFromDb, classifyIntent, type UserContext, type SessionFocusContext } from "../lib/eden/rag";
import { verifyAnyAuth, verifyConceptAuth, tryGetUserId, requireAdmin, getAdminUser, getAdminEmails } from "../lib/supabaseAuth";
import { hasMarketRead, getMarketAccessState } from "../lib/marketAccess";
import { getEffectiveMarketAccess, getUserMarketEntitlement, setUserMarketEntitlement, syncOrgMembersMarketEntitlement, userHasMarketRead } from "../lib/marketEntitlement";
import { broadcastToOrg, broadcastToUsers, registerUserClient, unregisterUserClient } from "../lib/orgBroadcast";
import { ALL_SCRAPERS, getScraperTier } from "../lib/scrapers/index";
import { getSchedulerStatus, startScheduler, pauseScheduler, resetAndStartScheduler, bumpToFront, setDelay, invalidateHealthCacheEntry, startTierOnly, startStalenessFirstScan, startDailySweep, setConcurrency, getMaxHttpConcurrent, getScraperHealthCache, cancelCurrentSync, isTransientDbError } from "../lib/scheduler";
import { getAllScraperHealth, clearScraperBackoff, updateScraperHealth } from "../lib/scraperState";
import { runIngestionPipeline, isIngestionRunning, getEnrichingCount, getScrapingProgress, getUpsertProgress, isSyncRunning, getSyncRunningFor, getActiveSyncs, runInstitutionSync, tryAcquireSyncLock, releaseSyncLock, runScrapedFieldRefresh } from "../lib/ingestion";
import { isFatalOpenAIError, friendlyOpenAIError } from "../lib/llm";
import { ALL_PORTAL_ROLES } from "@shared/portals";
import { sendWelcomeEmail, sendTeamInviteEmail, sendAccountDeletionEmail, sendSubscriptionWelcomeEmail, sendPaymentFailedEmail, sendRenewalConfirmationEmail, sendMarketMutualInterestEmail, sendMarketNdaSignedEmail, sendDealRoomMessageEmail, sendDealRoomDocumentEmail, sendMarketGraceNoticeEmail, sendMarketEoiDeclinedEmail, sendMarketObserverInviteEmail, sendMarketFeedbackRequestEmail, APP_URL, sendEmail, sendMarketAdHocEmail, sendAdminNotificationEmail, verifyUnsubscribeToken, verifyUnsubscribeTokenForEmail, unsubscribeUrlForEmail, FROM_DIGEST } from "../email";
import { captureException as sentryCaptureException } from "../lib/sentry";
import { cacheGet, cacheSet } from "../lib/responseCache";
import { requireApiKey } from "../lib/apiKeyAuth";
import { createStripe } from "./billing";

// Admin /relevance/eval per-row probability cache
type RelevanceEvalCache = {
  key: string;
  scored: Array<{ label: boolean; prob: number; v1Kept: boolean }>;
  holdoutSize: number;
};
let relevanceEvalCache: RelevanceEvalCache | null = null;
function relevanceEvalCacheKey(classifierVersion: string, weightsSig: string): string {
  return `cv=${classifierVersion}|w=${weightsSig}`;
}
function invalidateRelevanceEvalCache(): void {
  relevanceEvalCache = null;
}

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

export async function registerAdminRoutes(app: Express): Promise<void> {
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
  app.use("/api/admin", requireAdmin);

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
  app.get("/api/admin/enrichment/institution-queues", requireAdmin, async (req, res) => {
    try {
      const institutions = await storage.getEnrichmentInstitutionQueues();
      res.json({ institutions });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch institution queues" });
    }
  });

  // Per-institution quality snapshot history.
  app.get("/api/admin/enrichment/institution-quality/history", requireAdmin, async (req, res) => {
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
  app.post("/api/admin/enrichment/institution-quality/snapshot", requireAdmin, async (req, res) => {
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
  app.get("/api/admin/enrichment/institution-quality", requireAdmin, async (req, res) => {
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

  app.get("/api/admin/enrich/modality-fill/status", requireAdmin, (_req, res) => {
    res.json({ running: modalityFillRunning, result: modalityFillResult });
  });

  app.post("/api/admin/enrich/modality-fill", requireAdmin, async (req, res) => {
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

  app.get("/api/admin/deal-comparables/status", requireAdmin, (_req, res) => {
    res.json({ running: dealCompsIngestRunning, lastLine: dealCompsIngestLastLine });
  });

  app.post("/api/admin/deal-comparables/ingest", requireAdmin, (_req, res) => {
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

  app.post("/api/admin/deal-comparables/ingest/stop", requireAdmin, (_req, res) => {
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

  app.get("/api/admin/enrich/biology-fill/status", requireAdmin, (_req, res) => {
    res.json({ running: biologyFillRunning, result: biologyFillResult, progress: biologyFillProgress });
  });

  app.post("/api/admin/enrich/biology-fill/stop", requireAdmin, (_req, res) => {
    if (!biologyFillRunning || !biologyFillAbortController) {
      return res.status(409).json({ error: "Biology fill is not running" });
    }
    biologyFillAbortController.abort();
    res.json({ stopped: true });
  });

  app.get("/api/admin/enrich/biology-fill/count", requireAdmin, async (req, res) => {
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

  app.get("/api/admin/deal-comparables/stats", requireAdmin, async (_req, res) => {
    try {
      const stats = await storage.getDealComparablesStats();
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch stats" });
    }
  });

  app.post("/api/admin/enrich/biology-fill", requireAdmin, async (req, res) => {
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

  app.get("/api/admin/enrich/moa-fill/status", requireAdmin, (_req, res) => {
    res.json({ running: moaFillRunning, result: moaFillResult, progress: moaFillProgress });
  });

  app.post("/api/admin/enrich/moa-fill/stop", requireAdmin, (_req, res) => {
    if (!moaFillRunning || !moaFillAbortController) {
      return res.status(409).json({ error: "MOA fill is not running" });
    }
    moaFillAbortController.abort();
    res.json({ stopped: true });
  });

  app.get("/api/admin/enrich/moa-fill/count", requireAdmin, async (_req, res) => {
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

  app.post("/api/admin/enrich/moa-fill", requireAdmin, async (req, res) => {
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
  app.post("/api/admin/enrichment/mini-backfill", requireAdmin, async (req, res) => {
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

  app.get("/api/admin/enrichment/health", requireAdmin, async (req, res) => {
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

  app.get("/api/admin/enrichment/count", requireAdmin, async (req, res) => {
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

  app.get("/api/admin/enrichment/jobs", requireAdmin, async (req, res) => {
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

  app.get("/api/admin/enrichment/classify-unclassified/count", requireAdmin, async (req, res) => {
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

  app.get("/api/admin/enrichment/classify-unclassified/status", requireAdmin, async (req, res) => {
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

  app.post("/api/admin/enrichment/classify-unclassified/stop", requireAdmin, async (req, res) => {
    if (!classifyRunning) return res.json({ message: "No classify run in progress" });
    classifyShouldStop = true;
    res.json({ message: "Stop signal sent" });
  });

  app.post("/api/admin/enrichment/classify-unclassified", requireAdmin, async (req, res) => {
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

  app.get("/api/admin/enrichment/tto-licensing-fill/count", requireAdmin, async (req, res) => {
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

  app.post("/api/admin/enrichment/tto-licensing-fill", requireAdmin, async (req, res) => {
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

  app.get("/api/admin/enrichment/modality-fill/count", requireAdmin, async (req, res) => {
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

  app.post("/api/admin/enrichment/modality-fill", requireAdmin, async (req, res) => {
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

  app.get("/api/admin/enrichment/fill-stage/count", requireAdmin, async (_req, res) => {
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

  app.get("/api/admin/enrichment/fill-stage/status", requireAdmin, (_req, res) => {
    res.json({
      running: stageFillRunning,
      processed: stageFillProcessed,
      total: stageFillTotal,
      regexFilled: stageFillRegexFilled,
      llmFilled: stageFillLlmFilled,
      lastSummary: stageFillLastSummary,
    });
  });

  app.post("/api/admin/enrichment/fill-stage/stop", requireAdmin, (_req, res) => {
    if (!stageFillRunning) return res.status(409).json({ error: "Not running" });
    stageFillShouldStop = true;
    res.json({ stopped: true });
  });

  app.post("/api/admin/enrichment/fill-stage", requireAdmin, async (req, res) => {
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

  app.get("/api/admin/enrichment/bands", requireAdmin, async (req, res) => {
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

  app.get("/api/admin/enrichment/band/status", requireAdmin, async (req, res) => {
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

  app.post("/api/admin/enrichment/band/stop", requireAdmin, async (req, res) => {
    if (!bandRunning) return res.json({ message: "No band enrichment running" });
    bandShouldStop = true;
    res.json({ message: "Stop signal sent" });
  });

  app.post("/api/admin/enrichment/run-band", requireAdmin, async (req, res) => {
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

  // Public: admin-approved discovery cards (used by industry Scout)
  app.get("/api/discoveries", async (_req, res) => {
    try {
      const cards = await storage.getPublishedDiscoveryCards();
      res.json({ cards });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/wipe-assets", async (req, res) => {
    try {
      await storage.wipeAllAssets();
      res.json({ ok: true, message: "All ingested assets wiped" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Inspect, reassign, or delete orphaned saved_assets / pipeline_lists rows with NULL user_id.
  // These were created before auth was wired up.  Three operations are available:
  //   GET    /api/admin/orphaned-records              â€” counts + 20-row preview
  //   POST   /api/admin/orphaned-records/reassign     â€” reassign to a target userId
  //   DELETE /api/admin/orphaned-records              â€” hard delete (requires confirm: true)
  // Auth: requireAdmin middleware (mounted on /api/admin).
  // Destructive operations additionally require { confirm: true } in the request body.

  app.get("/api/admin/orphaned-records", async (req, res) => {
    try {
      const [saCountResult, plCountResult, saPreview, plPreview] = await Promise.all([
        db.execute(sql`SELECT COUNT(*)::int AS n FROM saved_assets WHERE user_id IS NULL`),
        db.execute(sql`SELECT COUNT(*)::int AS n FROM pipeline_lists WHERE user_id IS NULL`),
        db.execute(sql`SELECT id, asset_name, saved_at FROM saved_assets WHERE user_id IS NULL ORDER BY saved_at DESC LIMIT 20`),
        db.execute(sql`SELECT id, name, created_at FROM pipeline_lists WHERE user_id IS NULL ORDER BY created_at DESC LIMIT 20`),
      ]);
      return res.json({
        savedAssets: {
          count: Number((saCountResult.rows[0] as Record<string, unknown>)?.n ?? 0),
          preview: saPreview.rows,
        },
        pipelineLists: {
          count: Number((plCountResult.rows[0] as Record<string, unknown>)?.n ?? 0),
          preview: plPreview.rows,
        },
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Reassign null-userId rows to a specific user (and optionally an org).
  // Call GET first to confirm what will be affected, then POST to commit.
  app.post("/api/admin/orphaned-records/reassign", async (req, res) => {
    const { targetUserId, targetOrgId, confirm: confirmed } = req.body as {
      targetUserId?: string;
      targetOrgId?: number;
      confirm?: boolean;
    };
    if (!targetUserId) return res.status(400).json({ error: "targetUserId is required" });
    if (!confirmed) return res.status(400).json({ error: "Pass { confirm: true } to execute" });
    try {
      // Count first so the response is informative even if no rows matched
      const [saCountResult, plCountResult] = await Promise.all([
        db.execute(sql`SELECT COUNT(*)::int AS n FROM saved_assets WHERE user_id IS NULL`),
        db.execute(sql`SELECT COUNT(*)::int AS n FROM pipeline_lists WHERE user_id IS NULL`),
      ]);
      const savedAssetCount = Number((saCountResult.rows[0] as Record<string, unknown>)?.n ?? 0);
      const pipelineListCount = Number((plCountResult.rows[0] as Record<string, unknown>)?.n ?? 0);

      // Perform reassignment â€” savedAssets has no orgId column, so we only set orgId on pipelineLists
      const saUpdateOpts = { userId: targetUserId };
      const plUpdateOpts = targetOrgId
        ? { userId: targetUserId, orgId: targetOrgId }
        : { userId: targetUserId };
      await Promise.all([
        db.update(savedAssets).set(saUpdateOpts).where(isNull(savedAssets.userId)),
        db.update(pipelineLists).set(plUpdateOpts).where(isNull(pipelineLists.userId)),
      ]);
      return res.json({ ok: true, reassignedSavedAssets: savedAssetCount, reassignedPipelineLists: pipelineListCount, targetUserId, targetOrgId: targetOrgId ?? null });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Hard-delete all remaining null-userId rows.  Run /reassign first for records worth keeping.
  app.delete("/api/admin/orphaned-records", async (req, res) => {
    const { confirm: confirmed } = req.body as { confirm?: boolean };
    if (!confirmed) return res.status(400).json({ error: "Pass { confirm: true } to execute" });
    try {
      // Count before deleting so the response accurately reflects what was removed
      const [saCountResult, plCountResult] = await Promise.all([
        db.execute(sql`SELECT COUNT(*)::int AS n FROM saved_assets WHERE user_id IS NULL`),
        db.execute(sql`SELECT COUNT(*)::int AS n FROM pipeline_lists WHERE user_id IS NULL`),
      ]);
      const savedAssetCount = Number((saCountResult.rows[0] as Record<string, unknown>)?.n ?? 0);
      const pipelineListCount = Number((plCountResult.rows[0] as Record<string, unknown>)?.n ?? 0);

      await Promise.all([
        db.delete(savedAssets).where(isNull(savedAssets.userId)),
        db.delete(pipelineLists).where(isNull(pipelineLists.userId)),
      ]);
      return res.json({ ok: true, deletedSavedAssets: savedAssetCount, deletedPipelineLists: pipelineListCount });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Wipe a single institution's ingested_assets + sync_staging rows.
  // Used when a scraper's fingerprint format changes (e.g., stub â†’ Flintbox scraper)
  // so that re-sync correctly detects existing technologies as new rather than
  // triggering the anomaly guard.
  // Auth: header-only (never query string, which appears in proxy/server logs).
  // Safeguards: institution must be registered in ALL_SCRAPERS; body must include
  // { confirm: true } to prevent accidental destructive calls.
  app.post("/api/admin/wipe-assets/:institution", async (req, res) => {
    const institution = decodeURIComponent(String(req.params.institution));
    // Only allow wiping institutions that have a registered scraper
    if (!ALL_SCRAPERS.some((s) => s.institution === institution)) {
      return res.status(400).json({ error: `No registered scraper for: ${institution}` });
    }
    if (req.body?.confirm !== true) {
      return res.status(400).json({ error: "Must send { confirm: true } to confirm destructive wipe" });
    }
    try {
      const deleted = await storage.wipeInstitutionAssets(institution);
      const callerIp = req.ip ?? req.headers["x-forwarded-for"] ?? "unknown";
      console.warn(
        `[admin] INSTITUTION WIPE: institution="${institution}" deleted=${deleted} ip=${callerIp} ts=${new Date().toISOString()}`
      );
      res.json({ ok: true, institution, deleted });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Quarantine all unpushed is_new=true staging rows for a specific institution.
  // Used to resolve false-new floods from URL/dedup churn before they reach the push step.
  // Legacy path kept for backward compat â€” new path is /api/admin/indexing-queue/quarantine.
  app.post("/api/admin/staging/quarantine", async (req, res) => {
    const { institution } = req.body as { institution?: string };
    if (!institution || typeof institution !== "string" || !institution.trim()) {
      return res.status(400).json({ error: "institution is required" });
    }
    try {
      const quarantined = await storage.quarantineNewStagingRows(institution.trim());
      res.json({ ok: true, institution: institution.trim(), quarantined });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // â”€â”€ Indexing Queue quarantine controls â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  app.get("/api/admin/indexing-queue/quarantine-summary", async (req, res) => {
    try {
      const summary = await storage.getQuarantineSummary();
      res.json({ summary });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/indexing-queue/quarantine", async (req, res) => {
    const { institution } = req.body as { institution?: string };
    if (!institution || typeof institution !== "string" || !institution.trim()) {
      return res.status(400).json({ error: "institution is required" });
    }
    try {
      const quarantined = await storage.quarantineNewStagingRows(institution.trim());
      res.json({ ok: true, institution: institution.trim(), quarantined });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/indexing-queue/release-quarantine", async (req, res) => {
    const { institution } = req.body as { institution?: string };
    if (!institution || typeof institution !== "string" || !institution.trim()) {
      return res.status(400).json({ error: "institution is required" });
    }
    try {
      const released = await storage.releaseQuarantinedRows(institution.trim());
      res.json({ ok: true, institution: institution.trim(), released });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/indexing-queue/discard-quarantine", async (req, res) => {
    const { institution } = req.body as { institution?: string };
    if (!institution || typeof institution !== "string" || !institution.trim()) {
      return res.status(400).json({ error: "institution is required" });
    }
    try {
      const discarded = await storage.discardQuarantinedRows(institution.trim());
      res.json({ ok: true, institution: institution.trim(), discarded });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/admin/review-queue", async (req, res) => {
    try {
      const items = await storage.getReviewQueue();
      res.json({ items });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/admin/review-queue/:id", async (req, res) => {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const { note } = req.body as { note?: string };
    try {
      await storage.resolveReviewItem(id, note ?? "");
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: research queue â€” all published discovery cards for review
  app.get("/api/admin/research-queue", async (req, res) => {
    try {
      const cards = await storage.getAllDiscoveryCardsForAdmin();
      res.json({ cards });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: approve or reject a discovery card
  app.patch("/api/admin/research-queue/:id", async (req, res) => {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const { adminStatus, adminNote } = req.body as { adminStatus: string; adminNote?: string };
    if (!["pending", "approved", "rejected"].includes(adminStatus)) {
      return res.status(400).json({ error: "Invalid adminStatus" });
    }
    try {
      const card = await storage.updateDiscoveryCardAdmin(id, { adminStatus, adminNote });
      if (!card) return res.status(404).json({ error: "Card not found" });
      res.json({ card });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/taxonomy/therapy-areas", async (_req, res) => {
    try {
      const { getTherapyAreas } = await import("../lib/pipeline/taxonomyPipeline");
      const areas = await getTherapyAreas();
      res.json({ areas });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/taxonomy/convergence", async (_req, res) => {
    try {
      const { getConvergenceSignals } = await import("../lib/pipeline/taxonomyPipeline");
      const signals = await getConvergenceSignals();
      res.json({ signals });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/taxonomy/refresh", async (req, res) => {
    try {
      const { refreshTaxonomyCounts, detectConvergenceSignals } = await import("../lib/pipeline/taxonomyPipeline");
      await refreshTaxonomyCounts();
      await detectConvergenceSignals();
      res.json({ ok: true, message: "Taxonomy and convergence refreshed" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/browse/new-arrivals", async (req, res) => {
    try {
      const windowParam = (req.query.window as string) || "7d";
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 2000);
      const offset = parseInt(req.query.offset as string) || 0;
      const is30d = windowParam === "30d";
      const is24h = windowParam === "24h";
      const intervalSql = is30d
        ? sql`${ingestedAssets.firstSeenAt} >= NOW() - INTERVAL '30 days'`
        : is24h
        ? sql`${ingestedAssets.firstSeenAt} >= NOW() - INTERVAL '24 hours'`
        : sql`${ingestedAssets.firstSeenAt} >= NOW() - INTERVAL '7 days'`;
      const intervalRawSql = is30d
        ? sql`first_seen_at >= NOW() - INTERVAL '30 days'`
        : is24h
        ? sql`first_seen_at >= NOW() - INTERVAL '24 hours'`
        : sql`first_seen_at >= NOW() - INTERVAL '7 days'`;
      const windowCondition = and(
        eq(ingestedAssets.relevant, true),
        intervalSql
      );

      // Full-window count and institution grouping (no limit)
      const [countResult, instRows] = await Promise.all([
        db
          .select({ n: sql<number>`count(*)::int` })
          .from(ingestedAssets)
          .where(windowCondition),
        db.execute(sql`
          SELECT institution, COUNT(*)::int AS count
          FROM ingested_assets
          WHERE relevant = true
            AND ${intervalRawSql}
          GROUP BY institution
          ORDER BY count DESC
        `),
      ]);

      const total = countResult[0]?.n ?? 0;
      const institutions = (instRows.rows as { institution: string; count: number }[])
        .map((r) => ({ institution: r.institution || "Unknown", count: r.count }));

      // Paginated asset list
      const assets = await db
        .select({
          id: ingestedAssets.id,
          assetName: ingestedAssets.assetName,
          institution: ingestedAssets.institution,
          modality: ingestedAssets.modality,
          indication: ingestedAssets.indication,
          completenessScore: ingestedAssets.completenessScore,
          firstSeenAt: ingestedAssets.firstSeenAt,
        })
        .from(ingestedAssets)
        .where(windowCondition)
        .orderBy(desc(ingestedAssets.firstSeenAt))
        .limit(limit)
        .offset(offset);

      res.json({ assets, institutions, total, window: windowParam, hasMore: offset + assets.length < total });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/browse/assets", async (req, res) => {
    try {
      const therapyArea = req.query.therapyArea as string | undefined;
      const institution = req.query.institution as string | undefined;
      const modality = req.query.modality as string | undefined;
      const stage = req.query.stage as string | undefined;
      const sortBy = req.query.sortBy as string | undefined;
      const minCompleteness = req.query.minCompleteness ? parseFloat(req.query.minCompleteness as string) : undefined;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const offset = parseInt(req.query.offset as string) || 0;

      const rawAreas: string[] = req.query.therapyAreas
        ? (Array.isArray(req.query.therapyAreas) ? req.query.therapyAreas as string[] : [req.query.therapyAreas as string])
        : therapyArea ? [therapyArea] : [];

      const conditions = [eq(ingestedAssets.relevant, true)];
      if (rawAreas.length > 0) {
        const areaConditions = rawAreas.map(area =>
          sql`lower(${ingestedAssets.categories}::text) LIKE ${"%" + area.toLowerCase() + "%"}`
        );
        conditions.push(areaConditions.length === 1 ? areaConditions[0] : sql`(${sql.join(areaConditions, sql` OR `)})`);
      }
      if (institution) {
        conditions.push(eq(ingestedAssets.institution, institution));
      }
      if (modality && modality !== "all") {
        conditions.push(eq(ingestedAssets.modality, modality));
      }
      if (stage && stage !== "all") {
        conditions.push(eq(ingestedAssets.developmentStage, stage));
      }
      if (minCompleteness !== undefined && !isNaN(minCompleteness)) {
        conditions.push(sql`${ingestedAssets.completenessScore} >= ${minCompleteness}`);
      }

      const orderClause = sortBy === "completeness"
        ? sql`${ingestedAssets.completenessScore} DESC NULLS LAST, ${ingestedAssets.firstSeenAt} DESC`
        : sql`${ingestedAssets.firstSeenAt} desc`;

      const results = await db
        .select({
          id: ingestedAssets.id,
          fingerprint: ingestedAssets.fingerprint,
          assetName: ingestedAssets.assetName,
          target: ingestedAssets.target,
          modality: ingestedAssets.modality,
          indication: ingestedAssets.indication,
          developmentStage: ingestedAssets.developmentStage,
          institution: ingestedAssets.institution,
          summary: ingestedAssets.summary,
          sourceUrl: ingestedAssets.sourceUrl,
          categories: ingestedAssets.categories,
          innovationClaim: ingestedAssets.innovationClaim,
          mechanismOfAction: ingestedAssets.mechanismOfAction,
          completenessScore: ingestedAssets.completenessScore,
          firstSeenAt: ingestedAssets.firstSeenAt,
        })
        .from(ingestedAssets)
        .where(and(...conditions))
        .limit(limit)
        .offset(offset)
        .orderBy(orderClause);

      res.json({ assets: results, hasMore: results.length === limit });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/admin/concepts", async (req, res) => {
    try {
      const results = await db
        .select()
        .from(conceptCards)
        .orderBy(desc(conceptCards.createdAt))
        .limit(200);
      res.json({ concepts: results });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/admin/industry-projects", async (req, res) => {
    try {
      const results = await db
        .select({
          id: researchProjects.id,
          title: researchProjects.title,
          discoveryTitle: researchProjects.discoveryTitle,
          researchArea: researchProjects.researchArea,
          status: researchProjects.status,
          adminStatus: researchProjects.adminStatus,
          publishToIndustry: researchProjects.publishToIndustry,
          discoverySummary: researchProjects.discoverySummary,
          projectUrl: researchProjects.projectUrl,
          lastEditedAt: researchProjects.lastEditedAt,
          openForCollaboration: researchProjects.openForCollaboration,
          developmentStage: researchProjects.developmentStage,
          adminNote: researchProjects.adminNote,
        })
        .from(researchProjects)
        .where(
          // Exclude drafts â€” only show projects researchers have explicitly submitted.
          sql`${researchProjects.adminStatus} IN ('pending', 'published', 'rejected')`,
        )
        .orderBy(
          sql`CASE WHEN ${researchProjects.adminStatus} = 'pending' THEN 0 WHEN ${researchProjects.adminStatus} = 'published' THEN 1 ELSE 2 END`,
          desc(researchProjects.lastEditedAt),
        );
      res.json({ projects: results });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/admin/industry-projects/:id/status", async (req, res) => {
    try {
      const { id } = req.params;
      const projectId = Number(id);
      const schema = z.object({
        adminStatus: z.enum(["pending", "published", "rejected"]),
        adminNote: z.string().nullable().optional(),
      });
      const { adminStatus, adminNote } = schema.parse(req.body);
      // Admin actions normalise the publish flag so the researcher-facing status
      // badge stays in sync (pending = awaiting review, so publish flag stays true).
      const publishToIndustry = adminStatus === "rejected" ? false : true;
      // Reset the rejection note unless the admin is rejecting now.
      const noteUpdate = adminStatus === "rejected"
        ? { adminNote: adminNote ?? null }
        : { adminNote: null };
      await db
        .update(researchProjects)
        .set({ adminStatus, publishToIndustry, ...noteUpdate })
        .where(eq(researchProjects.id, projectId));

      // Bridge into ingested_assets so approved researcher submissions surface in
      // EdenScout/Institutions alongside scraped tech-transfer assets.
      const fingerprint = `researcher-project-${projectId}`;
      if (adminStatus === "published") {
        const [project] = await db.select().from(researchProjects).where(eq(researchProjects.id, projectId)).limit(1);
        if (project) {
          const contributors = (project.projectContributors ?? []) as Array<{ name: string; institution: string; role: string; email: string }>;
          const institution = contributors.find((c) => c.institution)?.institution || "Researcher Submission";
          const assetName = project.discoveryTitle || project.title || `Research Project #${projectId}`;
          const summary = project.discoverySummary || project.description || project.hypothesis || "";
          const stage = (project.developmentStage || "unknown").toLowerCase();
          const inventors = contributors.map((c) => c.name).filter(Boolean);

          const [existing] = await db.select({ id: ingestedAssets.id })
            .from(ingestedAssets)
            .where(eq(ingestedAssets.fingerprint, fingerprint))
            .limit(1);

          if (existing) {
            await db.update(ingestedAssets)
              .set({
                assetName,
                institution,
                summary,
                developmentStage: stage,
                sourceUrl: project.projectUrl ?? null,
                relevant: true,
                lastSeenAt: new Date(),
                inventors: inventors.length > 0 ? inventors : null,
              })
              .where(eq(ingestedAssets.id, existing.id));
          } else {
            await db.insert(ingestedAssets).values({
              fingerprint,
              assetName,
              institution,
              summary,
              sourceType: "researcher",
              sourceName: "EdenLab Research Project",
              developmentStage: stage,
              sourceUrl: project.projectUrl ?? null,
              relevant: true,
              runId: 0,
              inventors: inventors.length > 0 ? inventors : null,
            });
          }
        }
      } else {
        // Unpublish or reject: hide from Scout but keep the row so re-publishing
        // does not need re-enrichment.
        await db.update(ingestedAssets)
          .set({ relevant: false })
          .where(eq(ingestedAssets.fingerprint, fingerprint));
      }

      res.json({ ok: true, id: projectId, adminStatus, publishToIndustry });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // â”€â”€ Admin Analytics â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  app.get("/api/admin/analytics/overview", async (req, res) => {
    try {

      const analyticsSupabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const analyticsSupabaseUrl = process.env.VITE_SUPABASE_URL || "";

      // Daily search volume â€” last 30 days
      const searchesPerDayResult = await db.execute(sql`
        SELECT DATE(created_at) AS day, COUNT(*) AS count
        FROM search_history
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY day
        ORDER BY day ASC
      `);
      const searchesPerDay = searchesPerDayResult.rows as { day: string; count: string }[];

      // Eden AI sessions per day â€” last 30 days
      const sessionsPerDayResult = await db.execute(sql`
        SELECT DATE(created_at) AS day, COUNT(*) AS count
        FROM eden_sessions
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY day
        ORDER BY day ASC
      `);
      const sessionsPerDay = sessionsPerDayResult.rows as { day: string; count: string }[];

      // Saved assets per day (cumulative growth proxy) â€” last 30 days
      const savedAssetsPerDayResult = await db.execute(sql`
        SELECT DATE(saved_at) AS day, COUNT(*) AS count
        FROM saved_assets
        WHERE saved_at >= NOW() - INTERVAL '30 days'
        GROUP BY day
        ORDER BY day ASC
      `);
      const savedAssetsPerDay = savedAssetsPerDayResult.rows as { day: string; count: string }[];

      // Dispatch logs per week â€” last 8 weeks
      const dispatchesPerWeekResult = await db.execute(sql`
        SELECT DATE_TRUNC('week', sent_at) AS week, COUNT(*) AS count
        FROM dispatch_logs
        WHERE sent_at >= NOW() - INTERVAL '8 weeks'
        GROUP BY week
        ORDER BY week ASC
      `);
      const dispatchesPerWeek = dispatchesPerWeekResult.rows as { week: string; count: string }[];

      // App event feature usage counts (all time)
      const featureUsageResult = await db.execute(sql`
        SELECT event, COUNT(*) AS count
        FROM app_events
        GROUP BY event
        ORDER BY count DESC
      `);
      const featureUsage = featureUsageResult.rows as { event: string; count: string }[];

      // Recent app events list (last 50)
      const recentEventsResult = await db.execute(sql`
        SELECT id, event, metadata, created_at
        FROM app_events
        ORDER BY created_at DESC
        LIMIT 50
      `);
      const recentEvents = recentEventsResult.rows as { id: number; event: string; metadata: Record<string, unknown> | null; created_at: string }[];

      // Aggregate totals
      const [totalSearches, totalSessions, totalSavedAssets, totalDispatches] = await Promise.all([
        db.execute(sql`SELECT COUNT(*) AS n FROM search_history`),
        db.execute(sql`SELECT COUNT(*) AS n FROM eden_sessions`),
        db.execute(sql`SELECT COUNT(*) AS n FROM saved_assets`),
        db.execute(sql`SELECT COUNT(*) AS n FROM dispatch_logs`),
      ]);

      type CountRow = { n: string };
      const toCount = (rows: unknown[]): number => Number((rows[0] as CountRow)?.n ?? 0);

      // New user signups by week (last 8 weeks) via Supabase admin API
      type SignupWeek = { week: string; count: number };
      let signupsPerWeek: SignupWeek[] = [];
      if (analyticsSupabaseKey && analyticsSupabaseUrl) {
        try {
          const { createClient } = await import("@supabase/supabase-js");
          const adminClient = createClient(analyticsSupabaseUrl, analyticsSupabaseKey);
          const cutoff = new Date();
          cutoff.setDate(cutoff.getDate() - 56); // 8 weeks
          // Paginate through all users to avoid the 500-user cap
          const allUsers: { created_at: string }[] = [];
          let page = 1;
          while (true) {
            const { data: pageData } = await adminClient.auth.admin.listUsers({ perPage: 1000, page });
            const batch = pageData?.users ?? [];
            allUsers.push(...batch);
            if (batch.length < 1000) break;
            page++;
          }
          // Bucket by ISO week (Monday-based)
          const weekMap = new Map<string, number>();
          for (const u of allUsers) {
            const created = new Date(u.created_at);
            if (created < cutoff) continue;
            // Get Monday of that week
            const day = created.getDay(); // 0=Sun
            const diff = (day === 0 ? -6 : 1) - day;
            const monday = new Date(created);
            monday.setDate(created.getDate() + diff);
            const key = monday.toISOString().slice(0, 10);
            weekMap.set(key, (weekMap.get(key) ?? 0) + 1);
          }
          signupsPerWeek = Array.from(weekMap.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([week, count]) => ({ week, count }));
        } catch {
          // Non-fatal: if Supabase admin fails, omit signup chart
        }
      }

      res.json({
        searchesPerDay: searchesPerDay.map(r => ({ day: r.day, count: Number(r.count) })),
        sessionsPerDay: sessionsPerDay.map(r => ({ day: r.day, count: Number(r.count) })),
        savedAssetsPerDay: savedAssetsPerDay.map(r => ({ day: r.day, count: Number(r.count) })),
        dispatchesPerWeek: dispatchesPerWeek.map(r => ({ week: r.week, count: Number(r.count) })),
        signupsPerWeek,
        featureUsage: featureUsage.map(r => ({ event: r.event, count: Number(r.count) })),
        recentEvents: recentEvents.map(r => ({ id: r.id, event: r.event, metadata: r.metadata, createdAt: r.created_at })),
        totals: {
          searches: toCount(totalSearches.rows),
          sessions: toCount(totalSessions.rows),
          savedAssets: toCount(totalSavedAssets.rows),
          dispatches: toCount(totalDispatches.rows),
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/admin/analytics/top-searches", async (req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT query, COUNT(*) AS count
        FROM search_history
        GROUP BY query
        ORDER BY count DESC
        LIMIT 20
      `);
      const rows = result.rows as { query: string; count: string }[];
      res.json({ searches: rows.map(r => ({ query: r.query, count: Number(r.count) })) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.VITE_SUPABASE_URL || "";

  app.get("/api/admin/events", requireAdmin, async (_req, res) => {
    try {
      const events = await getAdminEvents(200);
      res.json({ events });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // â”€â”€ JARVIS SQL Pad â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Read-only SQL execution for admin operator use. Blocks anything that isn't
  // a SELECT statement to prevent accidental writes via the UI.
  app.post("/api/admin/jarvis/sql", requireAdmin, async (req, res) => {
    const { query } = req.body as { query?: string };
    if (!query || typeof query !== "string") {
      return res.status(400).json({ error: "query is required" });
    }
    const trimmed = query.trim().replace(/;+$/, "");
    // Strip comments before checking â€” prevents `/**/SELECT` bypass.
    const stripped = trimmed.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ").trim();
    if (!/^SELECT\b/i.test(stripped)) {
      return res.status(400).json({ error: "Only SELECT statements are allowed" });
    }
    // Block DML inside CTEs (e.g. WITH x AS (DELETE ...) SELECT 1).
    if (/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE)\b/i.test(stripped)) {
      return res.status(400).json({ error: "Only SELECT statements are allowed" });
    }
    try {
      const result = await db.execute(sql.raw(trimmed));
      res.json({ rows: result.rows, rowCount: result.rows.length });
    } catch (err: any) {
      res.status(400).json({ error: err.message ?? "Query failed" });
    }
  });

  app.get("/api/admin/users", async (req, res) => {
    try {
      if (!supabaseServiceRoleKey || !supabaseUrl) {
        return res.status(500).json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" });
      }
      const { createClient } = await import("@supabase/supabase-js");
      const adminSupabase = createClient(supabaseUrl, supabaseServiceRoleKey);
      const { data, error } = await adminSupabase.auth.admin.listUsers({ perPage: 500 });
      if (error) return res.status(500).json({ error: error.message });
      const authUsers = data?.users ?? [];
      const userIds = authUsers.map((u) => u.id);
      const profileRows = userIds.length > 0
        ? await db.select({ userId: industryProfiles.userId, status: industryProfiles.status })
            .from(industryProfiles)
            .where(inArray(industryProfiles.userId, userIds))
        : [];
      const statusByUserId = new Map(profileRows.map((r) => [r.userId, r.status]));
      const users = authUsers.map((u) => {
        const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
        const name =
          (typeof meta.name === "string" && meta.name) ||
          (typeof meta.full_name === "string" && meta.full_name) ||
          (typeof meta.fullName === "string" && meta.fullName) ||
          (typeof meta.display_name === "string" && meta.display_name) ||
          null;
        const rawEnt = meta.marketEntitlement as Record<string, unknown> | undefined;
        const marketEntitlement = rawEnt && typeof rawEnt.active === "boolean"
          ? {
              active: rawEnt.active as boolean,
              source: (rawEnt.source === "admin" || rawEnt.source === "stripe") ? rawEnt.source as "admin" | "stripe" : null,
              grantedAt: typeof rawEnt.grantedAt === "string" ? rawEnt.grantedAt : null,
            }
          : null;
        return {
          id: u.id,
          email: u.email ?? "",
          name,
          contactEmail: (typeof meta.contactEmail === "string" ? meta.contactEmail : null),
          role: (typeof meta.role === "string" ? meta.role : null),
          subscribedToDigest: meta.subscribedToDigest === true,
          marketEntitlement,
          status: statusByUserId.get(u.id) ?? "active",
          createdAt: u.created_at,
          lastSignInAt: u.last_sign_in_at ?? null,
        };
      });
      res.json({ users });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/admin/users/:id/email", async (req, res) => {
    try {
      if (!supabaseServiceRoleKey || !supabaseUrl) {
        return res.status(500).json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" });
      }
      const { id } = req.params;
      const schema = z.object({ contactEmail: z.string().email().or(z.literal("")) });
      const { contactEmail } = schema.parse(req.body);
      const { createClient } = await import("@supabase/supabase-js");
      const adminSupabase = createClient(supabaseUrl, supabaseServiceRoleKey);
      const { data: existing, error: fetchErr } = await adminSupabase.auth.admin.getUserById(id);
      if (fetchErr || !existing?.user) return res.status(404).json({ error: "User not found" });
      const { data, error } = await adminSupabase.auth.admin.updateUserById(id, {
        user_metadata: { ...existing.user.user_metadata, contactEmail: contactEmail || null },
      });
      if (error) return res.status(500).json({ error: error.message });
      res.json({
        id: data.user.id,
        contactEmail: data.user.user_metadata?.contactEmail ?? null,
      });
    } catch (err: any) {
      if (err.name === "ZodError") return res.status(400).json({ error: "Invalid email" });
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/admin/users/:id/subscribed", async (req, res) => {
    try {
      if (!supabaseServiceRoleKey || !supabaseUrl) {
        return res.status(500).json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" });
      }
      const { id } = req.params;
      const schema = z.object({ subscribedToDigest: z.boolean() });
      const { subscribedToDigest } = schema.parse(req.body);
      const { createClient } = await import("@supabase/supabase-js");
      const adminSupabase = createClient(supabaseUrl, supabaseServiceRoleKey);
      const { data: existing, error: fetchErr } = await adminSupabase.auth.admin.getUserById(id);
      if (fetchErr || !existing?.user) return res.status(404).json({ error: "User not found" });
      const { data, error } = await adminSupabase.auth.admin.updateUserById(id, {
        user_metadata: { ...existing.user.user_metadata, subscribedToDigest },
      });
      if (error) return res.status(500).json({ error: error.message });
      // Sync to industry_profiles so alertMailer (which reads that table) sees the change
      await storage.setIndustryProfileSubscription(id, subscribedToDigest).catch((e: any) => {
        console.warn("[admin/subscribed] industry_profiles sync failed:", e?.message);
      });
      res.json({
        id: data.user.id,
        subscribedToDigest: data.user.user_metadata?.subscribedToDigest ?? false,
      });
    } catch (err: any) {
      if (err.name === "ZodError") return res.status(400).json({ error: "Invalid body" });
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/admin/users/:id/role", async (req, res) => {
    try {
      if (!supabaseServiceRoleKey || !supabaseUrl) {
        return res.status(500).json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" });
      }
      const { id } = req.params;
      const roleSchema = z.object({ role: z.enum(ALL_PORTAL_ROLES as [string, ...string[]]) });
      const { role } = roleSchema.parse(req.body);
      const { createClient } = await import("@supabase/supabase-js");
      const adminSupabase = createClient(supabaseUrl, supabaseServiceRoleKey);
      const { data, error } = await adminSupabase.auth.admin.updateUserById(id, {
        user_metadata: { role },
      });
      if (error) return res.status(500).json({ error: error.message });
      const adminUser = await getAdminUser(req);
      if (adminUser) {
        await insertAdminEvent({
          adminUserId: adminUser.id, adminEmail: adminUser.email,
          action: "role_change", targetUserId: id,
          targetEmail: data.user.email ?? "",
          payload: { newRole: role },
        });
      }
      res.json({
        id: data.user.id,
        email: data.user.email ?? "",
        role: data.user.user_metadata?.role ?? null,
      });
    } catch (err: any) {
      if (err.name === "ZodError") return res.status(400).json({ error: "Invalid role" });
      res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/admin/users/:id/market-access â€” Task #752: grant or revoke
  // EdenMarket access for an individual user (independent of org subscription).
  // Source is recorded as "admin" so subsequent Stripe-driven syncs do not
  // silently revoke admin grants â€” only the same source can flip it off via
  // the webhook path (admin always wins via this endpoint).
  app.patch("/api/admin/users/:id/market-access", async (req, res) => {
    try {
      if (!supabaseServiceRoleKey || !supabaseUrl) {
        return res.status(500).json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" });
      }
      const { id } = req.params;
      const schema = z.object({ active: z.boolean() });
      const { active } = schema.parse(req.body);
      const ent = await setUserMarketEntitlement(id, { active, source: "admin" });
      res.json({ id, marketEntitlement: ent });
    } catch (err: any) {
      if (err.name === "ZodError") return res.status(400).json({ error: "Invalid body" });
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/users/invite", async (req, res) => {
    try {
      if (!supabaseServiceRoleKey || !supabaseUrl) {
        return res.status(500).json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" });
      }
      const inviteSchema = z.object({
        email: z.string().email(),
        password: z.string().min(8),
        role: z.enum(ALL_PORTAL_ROLES as [string, ...string[]]),
      });
      const { email, password, role } = inviteSchema.parse(req.body);
      const { createClient } = await import("@supabase/supabase-js");
      const adminSupabase = createClient(supabaseUrl, supabaseServiceRoleKey);
      const { data, error } = await adminSupabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { role },
      });
      if (error) return res.status(500).json({ error: error.message });
      res.json({
        id: data.user.id,
        email: data.user.email ?? "",
        role: data.user.user_metadata?.role ?? null,
      });
    } catch (err: any) {
      if (err.name === "ZodError") return res.status(400).json({ error: "Invalid input: " + err.errors?.map((e: any) => e.message).join(", ") });
      res.status(500).json({ error: err.message });
    }
  });

  // â”€â”€ Organization Management Routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const orgBodySchema = z.object({
    name: z.string().min(1),
    planTier: z.enum(["individual", "team5", "team10", "enterprise"]).default("individual"),
    seatLimit: z.number().int().min(1).default(1),
    logoUrl: z.string().nullable().optional(),
    primaryColor: z.string().nullable().optional(),
    billingEmail: z.string().email().nullable().optional(),
    billingMethod: z.enum(["stripe", "ach", "invoice"]).default("stripe"),
    billingNotes: z.string().nullable().optional(),
  });

  app.get("/api/admin/organizations", async (req, res) => {
    try {
      const orgs = await storage.getAllOrganizations();
      const orgsWithCounts = await Promise.all(
        orgs.map(async (org) => ({
          ...org,
          memberCount: await storage.getOrgMemberCount(org.id),
        }))
      );
      res.json(orgsWithCounts);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/admin/organizations/:id", async (req, res) => {
    try {
      const org = await storage.getOrganization(Number(req.params.id));
      if (!org) return res.status(404).json({ error: "Not found" });
      const members = await storage.getOrgMembers(org.id);
      res.json({ ...org, members });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/organizations", async (req, res) => {
    try {
      const data = orgBodySchema.parse(req.body);
      const org = await storage.createOrganization(data);
      const adminUser = await getAdminUser(req);
      if (adminUser) {
        await insertAdminEvent({ adminUserId: adminUser.id, adminEmail: adminUser.email, action: "org_created", targetOrgId: org.id, payload: { name: org.name, planTier: org.planTier } });
      }
      res.json(org);
    } catch (err: any) {
      if (err.name === "ZodError") return res.status(400).json({ error: err.errors?.map((e: any) => e.message).join(", ") });
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/admin/organizations/:id", async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const data = orgBodySchema.partial().parse(req.body);
      const before = await storage.getOrganization(orgId);
      const org = await storage.updateOrganization(orgId, data);
      if (!org) return res.status(404).json({ error: "Not found" });
      const adminUser = await getAdminUser(req);
      if (adminUser) {
        const action = data.planTier && data.planTier !== before?.planTier ? "org_plan_change" : "org_updated";
        await insertAdminEvent({ adminUserId: adminUser.id, adminEmail: adminUser.email, action, targetOrgId: orgId, payload: { changes: data, prevPlanTier: before?.planTier } });
      }
      res.json(org);
    } catch (err: any) {
      if (err.name === "ZodError") return res.status(400).json({ error: err.errors?.map((e: any) => e.message).join(", ") });
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/admin/organizations/:id", async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const org = await storage.getOrganization(orgId);
      await storage.deleteOrganization(orgId);
      const adminUser = await getAdminUser(req);
      if (adminUser) {
        await insertAdminEvent({ adminUserId: adminUser.id, adminEmail: adminUser.email, action: "org_deleted", targetOrgId: orgId, payload: { name: org?.name } });
      }
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Billing history â€” returns all billing events for an org in reverse-chronological order
  app.get("/api/admin/organizations/:id/billing-history", async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      if (!orgId) return res.status(400).json({ error: "Invalid org id" });
      const events = await storage.getBillingHistory(orgId);
      res.json(events);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Logo upload â€” stores a URL or base64 data URL in logoUrl field
  app.post("/api/admin/organizations/:id/logo", async (req, res) => {
    try {
      const { logoUrl } = z.object({ logoUrl: z.string().min(1) }).parse(req.body);
      const org = await storage.updateOrganization(Number(req.params.id), { logoUrl });
      if (!org) return res.status(404).json({ error: "Not found" });
      res.json({ logoUrl: org.logoUrl });
    } catch (err: any) {
      if (err.name === "ZodError") return res.status(400).json({ error: err.errors?.map((e: any) => e.message).join(", ") });
      res.status(500).json({ error: err.message });
    }
  });

  // Add member â€” creates Supabase account, adds to org_members, sets industry_profiles.org_id
  app.post("/api/admin/organizations/:id/members", async (req, res) => {
    try {
      if (!supabaseServiceRoleKey || !supabaseUrl) {
        return res.status(500).json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" });
      }
      const memberSchema = z.object({
        email: z.string().email(),
        fullName: z.string().min(1),
        role: z.enum(["owner", "admin", "member"]).default("member"),
      });
      const { email, fullName, role } = memberSchema.parse(req.body);
      const orgId = Number(req.params.id);

      // Seat limit check
      const org = await storage.getOrganization(orgId);
      if (!org) return res.status(404).json({ error: "Organization not found" });
      const currentCount = await storage.getOrgMemberCount(orgId);
      if (currentCount >= org.seatLimit) {
        return res.status(400).json({ error: `Seat limit reached (${currentCount}/${org.seatLimit}). Upgrade the plan to add more members.` });
      }

      // Create Supabase user without a password â€” they set it via the emailed link
      const { createClient } = await import("@supabase/supabase-js");
      const adminSupabase = createClient(supabaseUrl, supabaseServiceRoleKey);
      const { data: userData, error: supabaseError } = await adminSupabase.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { role: "industry", fullName },
      });
      if (supabaseError) return res.status(500).json({ error: supabaseError.message });
      const userId = userData.user.id;

      // Generate a durable custom invite token stored in our DB.
      // Avoids Supabase OTP one-time-use tokens being burned by email security
      // scanners (Microsoft Safe Links, etc.) before the real user clicks.
      const inviteToken = crypto.randomUUID();
      await storage.createInviteToken({ token: inviteToken, userId, email, orgId, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) });
      const setPasswordLink = `${APP_URL}/set-password?invite_token=${inviteToken}`;

      // Add to org_members â€” store email/name for display in admin UI
      const member = await storage.addOrgMember({ orgId, userId, email, memberName: fullName, role, invitedBy: "admin", inviteSource: "admin", inviteStatus: "active" });

      // Set industry_profiles.org_id (creates profile row if missing)
      await storage.setIndustryProfileOrg(userId, orgId);

      const inviteAdmin = await getAdminUser(req);
      const inviterName = (inviteAdmin as any)?.user_metadata?.fullName as string | undefined;
      await sendTeamInviteEmail(email, fullName, org.name, org.planTier ?? "individual", setPasswordLink, inviterName).catch((err) =>
        console.error("[email] Team invite email failed:", err)
      );

      if (inviteAdmin) {
        await insertAdminEvent({ adminUserId: inviteAdmin.id, adminEmail: inviteAdmin.email, action: "org_member_added", targetUserId: userId, targetEmail: email, targetOrgId: orgId, payload: { role, memberName: fullName } });
      }

      res.json({ member, user: { id: userId, email: userData.user.email, fullName } });
    } catch (err: any) {
      if (err.name === "ZodError") return res.status(400).json({ error: err.errors?.map((e: any) => e.message).join(", ") });
      res.status(500).json({ error: err.message });
    }
  });

  // Remove member â€” removes from org_members, nulls industry_profiles.org_id
  app.delete("/api/admin/organizations/:id/members/:userId", async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const { userId } = req.params;
      const members = await storage.getOrgMembers(orgId);
      const member = members.find((m) => m.userId === userId);
      await storage.removeOrgMember(orgId, userId);
      const removeAdmin = await getAdminUser(req);
      if (removeAdmin) {
        await insertAdminEvent({ adminUserId: removeAdmin.id, adminEmail: removeAdmin.email, action: "org_member_removed", targetUserId: userId, targetEmail: member?.email ?? "", targetOrgId: orgId, payload: { memberName: member?.memberName } });
      }
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Resend invite â€” generates a fresh invite link and re-sends the team invite email
  app.post("/api/admin/organizations/:id/members/:userId/resend-invite", async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const { userId } = req.params;

      const org = await storage.getOrganization(orgId);
      if (!org) return res.status(404).json({ error: "Organization not found" });

      const members = await storage.getOrgMembers(orgId);
      const member = members.find((m) => m.userId === userId);
      if (!member) return res.status(404).json({ error: "Member not found in this organization" });
      if (!member.email) return res.status(400).json({ error: "Member has no email address on record" });

      const inviteToken = crypto.randomUUID();
      await storage.createInviteToken({ token: inviteToken, userId: member.userId, email: member.email, orgId, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) });
      const setPasswordLink = `${APP_URL}/set-password?invite_token=${inviteToken}`;

      await sendTeamInviteEmail(
        member.email,
        member.memberName ?? "",
        org.name,
        org.planTier ?? "individual",
        setPasswordLink,
      ).catch((err) => console.error("[email] Resend invite email failed:", err));

      res.json({ ok: true, email: member.email });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Delete user account â€” deletes from Supabase Auth, org_members (all orgs), and industry_profiles
  app.delete("/api/admin/members/:userId", async (req, res) => {
    try {
      const { userId } = req.params;
      if (!supabaseServiceRoleKey || !supabaseUrl) {
        return res.status(500).json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" });
      }
      const { createClient } = await import("@supabase/supabase-js");
      const adminSupabase = createClient(supabaseUrl, supabaseServiceRoleKey);

      // Fetch email BEFORE deleting so we can send a confirmation after
      let deletedEmail: string | undefined;
      let deletedName: string | undefined;
      try {
        const { data: authUser } = await adminSupabase.auth.admin.getUserById(userId);
        deletedEmail = authUser?.user?.email;
        deletedName = (authUser?.user?.user_metadata?.fullName as string | undefined) ?? undefined;
      } catch (lookupErr) {
        console.warn("[delete-account] Could not look up user email before deletion:", lookupErr);
      }

      // Cancel any active Stripe subscription before deleting the account
      try {
        const userOrg = await storage.getOrgForUser(userId);
        if (userOrg?.stripeSubscriptionId) {
          const stripe = createStripe();
          if (stripe) {
            await stripe.subscriptions.cancel(userOrg.stripeSubscriptionId);
            await storage.updateOrganization(userOrg.id, { stripeStatus: "canceled" });
            console.log(`[delete-account] Canceled Stripe subscription ${userOrg.stripeSubscriptionId} for org ${userOrg.id}`);
          } else {
            // Abort deletion to prevent orphaned billable subscriptions.
            return res.status(503).json({
              error: "Cannot delete account: an active subscription exists but the payment system is temporarily unavailable. Please try again or contact support@edennx.com.",
            });
          }
        }
      } catch (stripeErr: any) {
        console.error("[delete-account] Stripe cancellation failed, continuing with account deletion:", stripeErr?.message ?? stripeErr);
      }

      // Delete Supabase Auth user first â€” if this fails, nothing else is touched
      const { error: supabaseError } = await adminSupabase.auth.admin.deleteUser(userId);
      if (supabaseError) {
        console.error("[delete-account] Supabase delete error:", supabaseError.message);
        return res.status(500).json({ error: `Failed to delete auth account: ${supabaseError.message}` });
      }
      // Auth account removed â€” now clean up DB records
      await storage.deleteUserAccount(userId);

      // Audit log â€” best-effort, do not block response
      const deletingAdmin = await getAdminUser(req).catch(() => null);
      if (deletingAdmin) {
        await insertAdminEvent({
          adminUserId: deletingAdmin.id, adminEmail: deletingAdmin.email,
          action: "user_delete", targetUserId: userId,
          targetEmail: deletedEmail ?? "",
          payload: { name: deletedName ?? null },
        });
      }

      if (deletedEmail) {
        await sendAccountDeletionEmail(deletedEmail, deletedName ?? "").catch((err) =>
          console.error("[email] Account deletion email failed:", err)
        );
      }

      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Change member role
  app.patch("/api/admin/organizations/:id/members/:userId/role", async (req, res) => {
    try {
      const { role } = z.object({ role: z.enum(["owner", "admin", "member"]) }).parse(req.body);
      const orgId = Number(req.params.id);
      const { userId } = req.params;
      const members = await storage.getOrgMembers(orgId);
      const member = members.find((m) => m.userId === userId);
      await storage.updateOrgMemberRole(orgId, userId, role);
      const roleAdmin = await getAdminUser(req);
      if (roleAdmin) {
        await insertAdminEvent({ adminUserId: roleAdmin.id, adminEmail: roleAdmin.email, action: "org_member_role_change", targetUserId: userId, targetEmail: member?.email ?? "", targetOrgId: orgId, payload: { prevRole: member?.role, newRole: role } });
      }
      res.json({ ok: true });
    } catch (err: any) {
      if (err.name === "ZodError") return res.status(400).json({ error: err.errors?.map((e: any) => e.message).join(", ") });
      res.status(500).json({ error: err.message });
    }
  });

  // â”€â”€ User Account Status â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // PATCH /api/admin/users/:userId/status â€” set account status (active|suspended|deactivated)
  // Also updates Supabase user_metadata.account_status so auth middleware can enforce it
  // without an extra DB call on every request.
  app.patch("/api/admin/users/:userId/status", async (req, res) => {
    try {
      const { userId } = req.params;
      const { status, note } = z.object({
        status: z.enum(["active", "suspended", "deactivated"]),
        note: z.string().max(500).optional(),
      }).parse(req.body);
      if (!supabaseServiceRoleKey || !supabaseUrl) {
        return res.status(500).json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" });
      }
      const adminUser = await getAdminUser(req);
      if (!adminUser) return res.status(401).json({ error: "Admin authentication required" });

      // Persist in our DB (source of truth)
      await setIndustryProfileStatus(userId, status, adminUser.id, note);

      // Propagate to Supabase user_metadata so auth middleware can block on next request
      const { createClient } = await import("@supabase/supabase-js");
      const adminSupabase = createClient(supabaseUrl, supabaseServiceRoleKey);
      const { error: supabaseError } = await adminSupabase.auth.admin.updateUserById(userId, {
        user_metadata: { account_status: status === "active" ? null : status },
      });
      if (supabaseError) {
        console.warn("[user-status] Supabase metadata update failed:", supabaseError.message);
      }

      await insertAdminEvent({
        adminUserId: adminUser.id, adminEmail: adminUser.email,
        action: "user_status_change", targetUserId: userId,
        payload: { newStatus: status, note: note ?? null },
      });

      res.json({ ok: true, status });
    } catch (err: any) {
      if (err.name === "ZodError") return res.status(400).json({ error: err.errors?.map((e: any) => e.message).join(", ") });
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/admin/users/:userId/status â€” get current account status
  app.get("/api/admin/users/:userId/status", async (req, res) => {
    try {
      const { userId } = req.params;
      const profile = await storage.getIndustryProfileByUserId(userId);
      res.json({
        status: profile?.status ?? "active",
        statusChangedAt: profile?.statusChangedAt ?? null,
        statusChangedBy: profile?.statusChangedBy ?? null,
        statusNote: profile?.statusNote ?? null,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // â”€â”€ Plan Entitlements â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // GET /api/admin/entitlements â€” all plan entitlements (optionally filter by planTier)
  app.get("/api/admin/entitlements", async (req, res) => {
    try {
      const planTier = typeof req.query.planTier === "string" ? req.query.planTier : undefined;
      const entitlements = await getPlanEntitlements(planTier);
      res.json({ entitlements });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/admin/organizations/:id/entitlements â€” plan defaults + org overrides merged
  app.get("/api/admin/organizations/:id/entitlements", async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const org = await storage.getOrganization(orgId);
      if (!org) return res.status(404).json({ error: "Not found" });
      const [planDefaults, overrides] = await Promise.all([
        getPlanEntitlements(org.planTier),
        getOrgEntitlementOverrides(orgId),
      ]);
      const overrideMap = new Map(overrides.map((o) => [o.featureKey, o]));
      const merged = planDefaults.map((e) => ({
        ...e,
        override: overrideMap.get(e.featureKey) ?? null,
        effectiveValue: overrideMap.get(e.featureKey)?.overrideValue ?? e.limitValue,
        effectiveEnabled: overrideMap.get(e.featureKey)?.enabled ?? e.enabled,
      }));
      res.json({ planTier: org.planTier, entitlements: merged });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/admin/organizations/:id/entitlements/:featureKey â€” set or clear override
  app.patch("/api/admin/organizations/:id/entitlements/:featureKey", async (req, res) => {
    try {
      const orgId = Number(req.params.id);
      const { featureKey } = req.params;
      const bodySchema = z.object({
        overrideValue: z.number().int().nullable().optional(),
        enabled: z.boolean().nullable().optional(),
        note: z.string().max(500).optional(),
        remove: z.boolean().optional(), // true = delete the override row
      });
      const { overrideValue = null, enabled = null, note, remove } = bodySchema.parse(req.body);
      const adminUser = await getAdminUser(req);
      if (!adminUser) return res.status(401).json({ error: "Admin authentication required" });

      if (remove) {
        await deleteOrgEntitlementOverride(orgId, featureKey);
        await insertAdminEvent({ adminUserId: adminUser.id, adminEmail: adminUser.email, action: "entitlement_override_removed", targetOrgId: orgId, payload: { featureKey } });
        return res.json({ ok: true, removed: true });
      }

      const override = await upsertOrgEntitlementOverride(orgId, featureKey, overrideValue, enabled, adminUser.id, note);
      await insertAdminEvent({ adminUserId: adminUser.id, adminEmail: adminUser.email, action: "entitlement_override_set", targetOrgId: orgId, payload: { featureKey, overrideValue, enabled, note } });
      res.json({ ok: true, override });
    } catch (err: any) {
      if (err.name === "ZodError") return res.status(400).json({ error: err.errors?.map((e: any) => e.message).join(", ") });
      res.status(500).json({ error: err.message });
    }
  });

  // â”€â”€ Individual â†’ Org Upgrade â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // POST /api/admin/users/:userId/upgrade-to-org â€” convert a no-org individual user
  // into an org owner. Creates an org, migrates their pipeline lists, and links their profile.
  app.post("/api/admin/users/:userId/upgrade-to-org", async (req, res) => {
    try {
      const { userId } = req.params;
      const { orgName } = z.object({ orgName: z.string().min(1).max(200) }).parse(req.body);

      // Check user isn't already in an org
      const profile = await storage.getIndustryProfileByUserId(userId);
      if (profile?.orgId) {
        return res.status(400).json({ error: "User is already a member of an organization." });
      }

      const adminUser = await getAdminUser(req);
      if (!adminUser) return res.status(401).json({ error: "Admin authentication required" });

      const org = await upgradeIndividualToOrg(userId, orgName);

      await insertAdminEvent({
        adminUserId: adminUser.id, adminEmail: adminUser.email,
        action: "org_created", targetUserId: userId, targetOrgId: org.id,
        payload: { name: org.name, source: "individual_upgrade" },
      });

      res.json({ ok: true, org });
    } catch (err: any) {
      if (err.name === "ZodError") return res.status(400).json({ error: err.errors?.map((e: any) => e.message).join(", ") });
      res.status(500).json({ error: err.message });
    }
  });

  // â”€â”€ Assign Existing User to Existing Org â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // POST /api/admin/users/:userId/assign-org â€” move a user (with or without a current org)
  // into an existing org. Replaces any existing org_members row atomically.
  app.post("/api/admin/users/:userId/assign-org", async (req, res) => {
    try {
      const { userId } = req.params;
      const { orgId, role } = z.object({
        orgId: z.number().int().positive(),
        role: z.enum(["owner", "member"]).default("member"),
      }).parse(req.body);

      const adminUser = await getAdminUser(req);
      if (!adminUser) return res.status(401).json({ error: "Admin authentication required" });

      // Verify the target org exists
      const org = await storage.getOrganization(orgId);
      if (!org) return res.status(404).json({ error: "Organization not found" });

      const prevProfile = await storage.getIndustryProfileByUserId(userId);
      const prevOrgId = prevProfile?.orgId ?? null;

      await assignUserToOrg(userId, orgId, role, adminUser.email);

      await insertAdminEvent({
        adminUserId: adminUser.id, adminEmail: adminUser.email,
        action: "org_member_assigned", targetUserId: userId, targetOrgId: orgId,
        payload: { role, previousOrgId: prevOrgId, orgName: org.name },
      });

      res.json({ ok: true, orgId, orgName: org.name, role });
    } catch (err: any) {
      if (err.name === "ZodError") return res.status(400).json({ error: err.errors?.map((e: any) => e.message).join(", ") });
      res.status(500).json({ error: err.message });
    }
  });

  function stripPrivateFields(c: Record<string, any>) {
    const { submitterEmail, ...rest } = c;
    return rest;
  }

  app.get("/api/discovery/concepts", async (req, res) => {
    try {
      const page = Math.max(1, parseInt(String(req.query.page ?? "1")));
      const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? "20"))));
      const offset = (page - 1) * limit;
      const results = await db
        .select()
        .from(conceptCards)
        .where(eq(conceptCards.status, "active"))
        .orderBy(desc(conceptCards.createdAt))
        .limit(limit)
        .offset(offset);
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(conceptCards)
        .where(eq(conceptCards.status, "active"));
      res.json({ concepts: results.map(stripPrivateFields), page, limit, total: count, totalPages: Math.ceil(count / limit) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/discovery/my-concepts", verifyConceptAuth, async (req, res) => {
    try {
      const userId = req.headers["x-concept-user-id"] as string;
      const results = await db
        .select()
        .from(conceptCards)
        .where(eq(conceptCards.userId, userId))
        .orderBy(desc(conceptCards.createdAt));
      res.json({ concepts: results.map(stripPrivateFields) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/discovery/concepts/:id", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      const [concept] = await db
        .select()
        .from(conceptCards)
        .where(and(eq(conceptCards.id, id), eq(conceptCards.status, "active")));
      if (!concept) return res.status(404).json({ error: "Concept not found" });
      res.json({ concept: stripPrivateFields(concept) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/discovery/concepts", verifyConceptAuth, async (req, res) => {
    try {
      const conceptUserId = req.headers["x-concept-user-id"] as string;
      if (!conceptUserId) {
        console.error("[concept POST] x-concept-user-id header is empty â€” auth middleware may have failed");
        return res.status(401).json({ error: "User identification failed" });
      }
      const parsed = insertConceptCardSchema.parse({
        ...req.body,
        userId: conceptUserId,
      });

      let aiScore: number | null = null;
      let aiRationale: string | null = null;

      try {
        const openai = new (await import("openai")).default({ apiKey: process.env.OPENAI_API_KEY });
        const aiRes = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          temperature: 0.3,
          messages: [
            {
              role: "system",
              content: `You are a biotech concept evaluator. Score the scientific credibility of a pre-research concept on a 0-100 scale. Consider: scientific plausibility, clarity of problem statement, feasibility of proposed approach, and relevance to biotech/pharma. Return JSON: {"score": number, "rationale": "one sentence"}.`,
            },
            {
              role: "user",
              content: `Title: ${parsed.title}\nOne-liner: ${parsed.oneLiner}\nHypothesis: ${parsed.hypothesis ?? "N/A"}\nProblem: ${parsed.problem}\nApproach: ${parsed.proposedApproach}\nTherapy Area: ${parsed.therapeuticArea}\nModality: ${parsed.modality}\nRequired Expertise: ${parsed.requiredExpertise ?? "N/A"}`,
            },
          ],
          response_format: { type: "json_object" },
        });
        const json = JSON.parse(aiRes.choices[0]?.message?.content || "{}");
        aiScore = typeof json.score === "number" ? Math.min(100, Math.max(0, json.score)) : null;
        aiRationale = json.rationale || null;
      } catch (aiErr) {
        console.error("AI credibility scoring failed:", aiErr);
      }

      const conceptEmail = (req.headers["x-concept-user-email"] as string) || (req.body.submitterEmail as string) || null;
      const attachedFileSchema = z.array(z.object({
        name: z.string().max(255),
        url: z.string().url().refine((u) => u.startsWith("https://"), { message: "URL must use HTTPS" }),
        size: z.number().int().min(0).max(10 * 1024 * 1024),
      })).max(5).default([]);
      const attachedFiles = attachedFileSchema.parse(req.body.attachedFiles ?? []);
      const contentHash = crypto
        .createHash("sha256")
        .update(JSON.stringify({ ...parsed, ts: Date.now() }))
        .digest("hex")
        .substring(0, 16);
      const [concept] = await db
        .insert(conceptCards)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .values({
          ...(parsed as any),
          submitterEmail: conceptEmail,
          credibilityScore: aiScore,
          credibilityRationale: aiRationale,
          attachedFiles,
          contentHash,
          publishedAt: new Date(),
        })
        .returning();

      logAppEvent("concept_submitted", { therapeuticArea: parsed.therapeuticArea, modality: parsed.modality });
      res.json({ concept: stripPrivateFields(concept) });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete("/api/discovery/concepts/:id", verifyConceptAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      const conceptUserId = req.headers["x-concept-user-id"] as string;
      const [concept] = await db.select().from(conceptCards).where(eq(conceptCards.id, id));
      if (!concept) return res.status(404).json({ error: "Concept not found" });
      if (concept.userId !== conceptUserId) return res.status(403).json({ error: "Not your concept" });

      await db.delete(conceptInterests).where(eq(conceptInterests.conceptId, id));
      await db.delete(conceptCards).where(eq(conceptCards.id, id));

      const files = concept.attachedFiles as { name: string; url: string; size: number }[] | null;
      if (files && files.length > 0) {
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const supabaseUrl = process.env.VITE_SUPABASE_URL;
        if (serviceRoleKey && supabaseUrl) {
          try {
            const { createClient } = await import("@supabase/supabase-js");
            const adminClient = createClient(supabaseUrl, serviceRoleKey);
            const paths = files.map((f) => {
              const url = new URL(f.url);
              const match = url.pathname.match(/\/object\/public\/concept-files\/(.+)/);
              return match ? match[1] : null;
            }).filter((p): p is string => !!p);
            if (paths.length > 0) {
              const { error } = await adminClient.storage.from("concept-files").remove(paths);
              if (error) console.error(`[concept DELETE] Storage cleanup error:`, error);
              else console.log(`[concept DELETE] Cleaned up ${paths.length} file(s) from storage`);
            }
          } catch (storageErr) {
            console.error(`[concept DELETE] Storage cleanup failed:`, storageErr);
          }
        } else {
          console.log(`[concept DELETE] Concept ${id} had ${files.length} attached file(s). Storage cleanup skipped (no SUPABASE_SERVICE_ROLE_KEY).`);
        }
      }

      res.status(204).end();
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/discovery/concepts/:id/interest", verifyAnyAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      const type = (req.body?.type as string) || "collaborating";
      if (!["collaborating", "funding", "advising"].includes(type)) {
        return res.status(400).json({ error: "Invalid interest type" });
      }

      const [concept] = await db.select({ id: conceptCards.id, userId: conceptCards.userId }).from(conceptCards).where(eq(conceptCards.id, id));
      if (!concept) return res.status(404).json({ error: "Concept not found" });

      const userId = req.headers["x-user-id"] as string;
      if (concept.userId === userId) {
        return res.status(400).json({ error: "Cannot express interest in your own concept" });
      }
      const userEmail = req.headers["x-user-email"] as string || null;
      const userName = (req.body?.userName as string) || null;

      const existing = await db
        .select()
        .from(conceptInterests)
        .where(and(
          eq(conceptInterests.conceptId, id),
          eq(conceptInterests.userId, userId),
          eq(conceptInterests.type, type)
        ))
        .limit(1);

      let toggled: "on" | "off";
      if (existing.length > 0) {
        await db.delete(conceptInterests).where(eq(conceptInterests.id, existing[0].id));
        toggled = "off";
      } else {
        await db.insert(conceptInterests).values({
          conceptId: id,
          userId,
          userEmail,
          userName,
          type,
        }).onConflictDoNothing();
        toggled = "on";
      }

      const [collabCount] = await db.select({ count: sql<number>`count(*)::int` }).from(conceptInterests).where(and(eq(conceptInterests.conceptId, id), eq(conceptInterests.type, "collaborating")));
      const [fundCount] = await db.select({ count: sql<number>`count(*)::int` }).from(conceptInterests).where(and(eq(conceptInterests.conceptId, id), eq(conceptInterests.type, "funding")));
      const [adviseCount] = await db.select({ count: sql<number>`count(*)::int` }).from(conceptInterests).where(and(eq(conceptInterests.conceptId, id), eq(conceptInterests.type, "advising")));

      const [updated] = await db
        .update(conceptCards)
        .set({
          interestCollaborating: collabCount.count,
          interestFunding: fundCount.count,
          interestAdvising: adviseCount.count,
        })
        .where(eq(conceptCards.id, id))
        .returning();

      const action = toggled === "on" ? "added" : "removed";
      const responsePayload: Record<string, any> = {
        concept: stripPrivateFields(updated),
        action,
        toggled,
      };
      if (toggled === "on") {
        responsePayload.submitterEmail = updated.submitterEmail || null;
      }
      res.json(responsePayload);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/discovery/concepts/:id/my-interest", verifyAnyAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      const userId = req.headers["x-user-id"] as string;
      const rows = await db
        .select({ type: conceptInterests.type })
        .from(conceptInterests)
        .where(and(eq(conceptInterests.conceptId, id), eq(conceptInterests.userId, userId)));
      const typeSet = new Set(rows.map(r => r.type));
      res.json({
        collaborating: typeSet.has("collaborating"),
        funding: typeSet.has("funding"),
        advising: typeSet.has("advising"),
        types: rows.map(r => r.type),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/discovery/concepts/:id/interests", verifyConceptAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      const conceptUserId = req.headers["x-concept-user-id"] as string;
      const [concept] = await db.select().from(conceptCards).where(eq(conceptCards.id, id));
      if (!concept) return res.status(404).json({ error: "Concept not found" });
      if (concept.userId !== conceptUserId) return res.status(403).json({ error: "Not your concept" });
      const rows = await db
        .select()
        .from(conceptInterests)
        .where(eq(conceptInterests.conceptId, id))
        .orderBy(desc(conceptInterests.createdAt));
      const grouped: Record<string, typeof rows> = { collaborating: [], funding: [], advising: [] };
      for (const row of rows) {
        if (!grouped[row.type]) grouped[row.type] = [];
        grouped[row.type].push(row);
      }
      res.json({ interests: rows, byType: grouped, total: rows.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/discovery/concepts/:id/contact", verifyAnyAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      const userId = req.headers["x-user-id"] as string;

      const activeInterests = await db
        .select({ id: conceptInterests.id })
        .from(conceptInterests)
        .where(and(eq(conceptInterests.conceptId, id), eq(conceptInterests.userId, userId)))
        .limit(1);

      if (activeInterests.length === 0) {
        return res.status(403).json({ error: "Express interest first to view contact details" });
      }

      const [concept] = await db.select().from(conceptCards).where(eq(conceptCards.id, id));
      if (!concept) return res.status(404).json({ error: "Concept not found" });

      res.json({
        submitterName: concept.submitterName,
        submitterAffiliation: concept.submitterAffiliation,
        submitterEmail: concept.submitterEmail,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/discovery/concepts/:id/landscape", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

      const landscapeCacheKey = `concept-landscape:${id}`;
      const cachedLandscape = cacheGet<object>(landscapeCacheKey);
      if (cachedLandscape) return res.json(cachedLandscape);

      const [concept] = await db.select().from(conceptCards).where(eq(conceptCards.id, id));
      if (!concept) return res.status(404).json({ error: "Not found" });
      const therapyArea = concept.therapeuticArea?.toLowerCase() ?? "";
      const conceptModality = concept.modality?.toLowerCase() ?? "";
      const titleTerms = (concept.title ?? "").split(/\s+/).filter(w => w.length > 5).slice(0, 4).join(" ");
      const hypothesisTerms = (concept.hypothesis ?? "").split(/\s+/).filter(w => w.length > 5).slice(0, 3).join(" ");

      if (!therapyArea) {
        return res.json({ assets: [], literature: [], noResults: true });
      }

      const pubmedTermParts: string[] = [];
      if (titleTerms) pubmedTermParts.push(`(${titleTerms})[Title/Abstract]`);
      pubmedTermParts.push(`"${therapyArea}"[MeSH Terms]`);
      if (conceptModality && conceptModality !== "other" && conceptModality !== "unknown") pubmedTermParts.push(conceptModality);
      const pubmedQuery = pubmedTermParts.join(" AND ");

      const biorxivTerms = [titleTerms, therapyArea, conceptModality !== "other" && conceptModality !== "unknown" ? conceptModality : ""].filter(Boolean).join(" ");

      const assetWhereConditions = [
        eq(ingestedAssets.relevant, true),
        sql`lower(${ingestedAssets.indication}) like ${"%" + therapyArea + "%"}`,
      ];
      if (conceptModality && conceptModality !== "other" && conceptModality !== "unknown") {
        assetWhereConditions.push(sql`lower(${ingestedAssets.modality}) like ${"%" + conceptModality + "%"}`);
      }

      const [relatedAssets, pubmedResults] = await Promise.allSettled([
        db
          .select({
            id: ingestedAssets.id,
            assetName: ingestedAssets.assetName,
            institution: ingestedAssets.institution,
            modality: ingestedAssets.modality,
            developmentStage: ingestedAssets.developmentStage,
            target: ingestedAssets.target,
            sourceUrl: ingestedAssets.sourceUrl,
          })
          .from(ingestedAssets)
          .where(and(...assetWhereConditions))
          .orderBy(desc(ingestedAssets.firstSeenAt))
          .limit(6),

        (async () => {
          const [pubmedItems, biorxivItems] = await Promise.allSettled([
            (async () => {
              if (!pubmedQuery) return [];
              const searchTerm = encodeURIComponent(pubmedQuery);
              const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${searchTerm}&retmax=3&retmode=json&sort=relevance`;
              const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(5000) });
              if (!searchRes.ok) return [];
              const searchJson = await searchRes.json() as { esearchresult?: { idlist?: string[] } };
              const ids: string[] = searchJson.esearchresult?.idlist ?? [];
              if (ids.length === 0) return [];
              const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids.join(",")}&retmode=json`;
              const summaryRes = await fetch(summaryUrl, { signal: AbortSignal.timeout(5000) });
              if (!summaryRes.ok) return [];
              const summaryJson = await summaryRes.json() as { result?: Record<string, unknown> };
              const result = summaryJson.result ?? {};
              return ids.slice(0, 3).map((pmid) => {
                const doc = (result[pmid] ?? {}) as Record<string, unknown>;
                return {
                  source: "pubmed" as const,
                  pmid,
                  title: (doc.title as string) ?? "Untitled",
                  authors: (Array.isArray(doc.authors) ? doc.authors : []).slice(0, 2).map((a: Record<string, string>) => a.name).join(", "),
                  journal: (doc.fulljournalname as string) ?? (doc.source as string) ?? "",
                  year: typeof doc.pubdate === "string" ? doc.pubdate.substring(0, 4) : "",
                  url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
                };
              });
            })(),
            (async () => {
              if (!biorxivTerms.trim()) return [];
              const q = encodeURIComponent(biorxivTerms);
              const url = `https://api.crossref.org/works?query=${q}&filter=type:posted-content,member:246&rows=3&sort=relevance&mailto=eden@edenradar.io`;
              const biorxivRes = await fetch(url, { signal: AbortSignal.timeout(5000) });
              if (!biorxivRes.ok) return [];
              const json = await biorxivRes.json() as { message?: { items?: Record<string, unknown>[] } };
              return (json.message?.items ?? []).slice(0, 3).map((item) => {
                const doi = (item.DOI as string) ?? "";
                const authorArr = Array.isArray(item.author) ? item.author : [];
                const authors = authorArr.slice(0, 2).map((a: Record<string, string>) => `${a.given ?? ""} ${a.family ?? ""}`.trim()).join(", ");
                const created = item.created as Record<string, unknown> | undefined;
                const dateParts = created?.["date-parts"] as number[][] | undefined;
                const year = dateParts?.[0]?.[0]?.toString() ?? "";
                const titleArr = item.title as string[] | undefined;
                return {
                  source: "biorxiv" as const,
                  pmid: doi,
                  title: titleArr?.[0] ?? "Untitled",
                  authors,
                  journal: "bioRxiv preprint",
                  year,
                  url: `https://doi.org/${doi}`,
                };
              });
            })(),
          ]);
          const pubmed = pubmedItems.status === "fulfilled" ? pubmedItems.value : [];
          const biorxiv = biorxivItems.status === "fulfilled" ? biorxivItems.value : [];
          return [...pubmed, ...biorxiv].slice(0, 3);
        })(),
      ]);

      const assets = relatedAssets.status === "fulfilled" ? relatedAssets.value : [];
      const literature = pubmedResults.status === "fulfilled" ? pubmedResults.value : [];

      if (assets.length === 0 && literature.length === 0) {
        const emptyResp = { assets: [], literature: [], noResults: true };
        cacheSet(landscapeCacheKey, emptyResp, 2 * 60 * 60 * 1000);
        return res.json(emptyResp);
      }
      const landscapeResp = { assets, literature };
      cacheSet(landscapeCacheKey, landscapeResp, 2 * 60 * 60 * 1000);
      res.json(landscapeResp);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/discovery/concepts/:id â€” edit own concept
  app.patch("/api/discovery/concepts/:id", verifyConceptAuth, async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      const userId = req.headers["x-concept-user-id"] as string;
      const [existing] = await db.select().from(conceptCards).where(eq(conceptCards.id, id));
      if (!existing) return res.status(404).json({ error: "Not found" });
      if (existing.userId !== userId) return res.status(403).json({ error: "Forbidden" });

      const allowed = ["title", "oneLiner", "hypothesis", "problem", "proposedApproach",
        "requiredExpertise", "seeking", "therapeuticArea", "modality", "stage",
        "openQuestions", "mechanismTags"] as const;
      const updates: Record<string, any> = {};
      for (const key of allowed) {
        if (key in req.body) updates[key] = req.body[key];
      }
      if (Object.keys(updates).length === 0) return res.status(400).json({ error: "No valid fields" });

      const hash = crypto
        .createHash("sha256")
        .update(JSON.stringify({ ...existing, ...updates }))
        .digest("hex")
        .substring(0, 16);
      updates.contentHash = hash;

      const [updated] = await db.update(conceptCards).set(updates).where(eq(conceptCards.id, id)).returning();
      res.json({ concept: stripPrivateFields(updated) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/discovery/concepts/:id/escalate â€” request graduation to research project
  app.post("/api/discovery/concepts/:id/escalate", verifyConceptAuth, async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      const userId = req.headers["x-concept-user-id"] as string;
      const [existing] = await db.select().from(conceptCards).where(eq(conceptCards.id, id));
      if (!existing) return res.status(404).json({ error: "Not found" });
      if (existing.userId !== userId) return res.status(403).json({ error: "Forbidden" });
      if (existing.escalationStatus === "pending") return res.status(409).json({ error: "Escalation already pending" });
      if (existing.escalationStatus === "approved") return res.status(409).json({ error: "Already graduated to research project" });

      const [updated] = await db
        .update(conceptCards)
        .set({ escalationStatus: "pending", escalationRequestedAt: new Date() })
        .where(eq(conceptCards.id, id))
        .returning();
      res.json({ concept: stripPrivateFields(updated) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/admin/concept-escalations â€” admin escalation queue
  app.get("/api/admin/concept-escalations", requireAdmin, async (req, res) => {
    try {
      const concepts = await db
        .select()
        .from(conceptCards)
        .where(eq(conceptCards.escalationStatus, "pending"))
        .orderBy(conceptCards.escalationRequestedAt);
      res.json({ concepts });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/admin/concept-escalations/:id/approve â€” approve and create research project
  app.post("/api/admin/concept-escalations/:id/approve", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      const [concept] = await db.select().from(conceptCards).where(eq(conceptCards.id, id));
      if (!concept) return res.status(404).json({ error: "Not found" });
      if (concept.escalationStatus !== "pending") return res.status(409).json({ error: "Not pending" });

      const [project] = await db
        .insert(researchProjects)
        .values({
          researcherId: concept.userId,
          title: concept.title,
          researchDomain: concept.therapeuticArea,
          description: `${concept.oneLiner}\n\n${concept.problem}`,
          status: "planning",
        })
        .returning();

      await db
        .update(conceptCards)
        .set({ escalationStatus: "approved", escalationReviewedAt: new Date(), projectId: project.id })
        .where(eq(conceptCards.id, id));

      res.json({ projectId: project.id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/admin/concept-escalations/:id/reject â€” reject with optional note
  app.post("/api/admin/concept-escalations/:id/reject", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      const { note } = req.body;
      const [concept] = await db.select().from(conceptCards).where(eq(conceptCards.id, id));
      if (!concept) return res.status(404).json({ error: "Not found" });

      await db
        .update(conceptCards)
        .set({ escalationStatus: "rejected", escalationReviewedAt: new Date(), escalationNote: note ?? null })
        .where(eq(conceptCards.id, id));

      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/discovery/research-needs â€” public list of research needs posted by industry
  app.get("/api/discovery/research-needs", async (_req, res) => {
    try {
      const needs = await db
        .select()
        .from(researchNeeds)
        .where(eq(researchNeeds.status, "active"))
        .orderBy(desc(researchNeeds.createdAt))
        .limit(50);
      res.json({ needs });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/discovery/research-needs â€” industry posts a research need (admin-mediated)
  app.post("/api/discovery/research-needs", verifyAnyAuth, async (req, res) => {
    try {
      const userId = await tryGetUserId(req);
      if (!userId) return res.status(401).json({ error: "Authentication required" });
      const { companyName, title, description, therapeuticArea, mechanismTags, stagePreference, whatTheyOffer } = req.body;
      if (!companyName || !title || !description) return res.status(400).json({ error: "companyName, title and description required" });
      const [need] = await db
        .insert(researchNeeds)
        .values({ industryUserId: userId, companyName, title, description, therapeuticArea, mechanismTags, stagePreference, whatTheyOffer, status: "active" })
        .returning();
      res.json({ need });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/industry/projects", async (_req, res) => {
    try {
      const projects = await db
        .select()
        .from(researchProjects)
        .where(
          and(
            eq(researchProjects.publishToIndustry, true),
            eq(researchProjects.adminStatus, "published"),
          ),
        )
        .orderBy(desc(researchProjects.lastEditedAt));
      res.json({ projects });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/ingest/institutions/names", async (_req, res) => {
    try {
      const rows = await db
        .selectDistinct({ institution: ingestedAssets.institution })
        .from(ingestedAssets)
        .where(sql`${ingestedAssets.institution} IS NOT NULL AND ${ingestedAssets.institution} != ''`)
        .orderBy(ingestedAssets.institution)
        .limit(500);
      res.json(rows.map((r) => r.institution).filter(Boolean));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Mirrors buildAlertWhere semantics for in-memory filtering used by the
  // industry-grouped delta endpoint (exact inArray-equivalent matches for
  // institution/modality/stage; substring ILIKE-equivalent for query).
  function assetMatchesAlertJS(
    alert: UserAlert,
    asset: { assetName: string; institution: string | null; modality: string | null; developmentStage: string | null; summary?: string | null; indication?: string | null; target?: string | null }
  ): boolean {
    if (alert.criteriaType === "all_new") return true;
    const hasInst = (alert.institutions?.length ?? 0) > 0;
    const hasMod  = (alert.modalities?.length ?? 0) > 0;
    const hasSt   = (alert.stages?.length ?? 0) > 0;
    const hasQ    = !!(alert.query?.trim());
    if (!hasInst && !hasMod && !hasSt && !hasQ) return true;
    if (hasInst && !alert.institutions!.some((ai) => ai.toLowerCase() === (asset.institution ?? "").toLowerCase())) return false;
    if (hasMod  && !alert.modalities!.some((m)  => m.toLowerCase()  === (asset.modality ?? "").toLowerCase()))          return false;
    if (hasSt   && !alert.stages!.some((s)       => s.toLowerCase()  === (asset.developmentStage ?? "").toLowerCase())) return false;
    if (hasQ) {
      const q = alert.query!.toLowerCase().trim();
      const fields = [asset.assetName, asset.summary, asset.indication, asset.target].filter(Boolean).join(" ").toLowerCase();
      if (!fields.includes(q)) return false;
    }
    return true;
  }

  app.get("/api/industry/alerts/delta", async (req, res) => {
    try {
      const WINDOW_HOURS = 48;
      const sinceParam = req.query.since as string | undefined;
      const since = sinceParam && !isNaN(Date.parse(sinceParam))
        ? new Date(sinceParam)
        : new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000);

      const userId = await tryGetUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const [newAssetRows, newConceptRows, newProjectRows, savedAlerts] = await Promise.all([
        db
          .select({
            id: ingestedAssets.id,
            institution: ingestedAssets.institution,
            assetName: ingestedAssets.assetName,
            modality: ingestedAssets.modality,
            developmentStage: ingestedAssets.developmentStage,
            summary: ingestedAssets.summary,
            indication: ingestedAssets.indication,
            target: ingestedAssets.target,
          })
          .from(ingestedAssets)
          .where(
            and(
              eq(ingestedAssets.relevant, true),
              gt(ingestedAssets.firstSeenAt, since),
            )
          )
          .orderBy(desc(ingestedAssets.firstSeenAt)),

        db
          .select({
            id: conceptCards.id,
            title: conceptCards.title,
            therapeuticArea: conceptCards.therapeuticArea,
            submitterAffiliation: conceptCards.submitterAffiliation,
            oneLiner: conceptCards.oneLiner,
          })
          .from(conceptCards)
          .where(
            and(
              eq(conceptCards.status, "active"),
              sql`${conceptCards.createdAt} >= ${since}`,
            ),
          )
          .orderBy(desc(conceptCards.createdAt))
          .limit(20),

        db
          .select({
            id: researchProjects.id,
            title: researchProjects.title,
            discoveryTitle: researchProjects.discoveryTitle,
            researchArea: researchProjects.researchArea,
            status: researchProjects.status,
            discoverySummary: researchProjects.discoverySummary,
            description: researchProjects.description,
            projectUrl: researchProjects.projectUrl,
            projectContributors: researchProjects.projectContributors,
          })
          .from(researchProjects)
          .where(
            and(
              eq(researchProjects.publishToIndustry, true),
              eq(researchProjects.adminStatus, "published"),
              sql`${researchProjects.lastEditedAt} >= ${since}`,
            ),
          )
          .orderBy(desc(researchProjects.lastEditedAt))
          .limit(20),

        db.select().from(userAlerts).where(and(eq(userAlerts.userId, userId), eq(userAlerts.enabled, true))).orderBy(desc(userAlerts.createdAt)),
      ]);

      // Per-asset alert matching delegated to the module-level alertMatchesAsset
      // helper which also searches summary, indication, and target for consistency
      // with the automated email delivery logic.
      const hasAlerts = savedAlerts.length > 0;
      type InstEntry = {
        count: number;
        matchedCount: number;
        matchedBy: string | null;
        sampleAssets: Array<{ id: number; name: string }>;
        matchedSampleAssets: Array<{ id: number; name: string }>;
      };
      const institutionMap = new Map<string, InstEntry>();

      for (const row of newAssetRows) {
        const inst = row.institution || "Unknown";
        const existing = institutionMap.get(inst) ?? {
          count: 0,
          matchedCount: 0,
          matchedBy: null,
          sampleAssets: [],
          matchedSampleAssets: [],
        };
        existing.count++;

        if (hasAlerts) {
          for (const alert of savedAlerts) {
            if (assetMatchesAlertJS(alert, row)) {
              existing.matchedCount++;
              if (!existing.matchedBy) existing.matchedBy = alert.name ?? alert.query ?? "Your alert";
              // Only collect sample assets that actually matched
              if (existing.matchedSampleAssets.length < 5) {
                existing.matchedSampleAssets.push({ id: row.id, name: row.assetName });
              }
              break;
            }
          }
        }

        if (existing.sampleAssets.length < 5) existing.sampleAssets.push({ id: row.id, name: row.assetName });
        institutionMap.set(inst, existing);
      }

      const byInstitution = Array.from(institutionMap.entries())
        .map(([institution, { count, matchedCount, matchedBy, sampleAssets, matchedSampleAssets }]) => ({
          institution,
          count,
          matchedCount,
          matchedBy: matchedBy ?? null,
          sampleAssets,
          matchedSampleAssets,
        }))
        .sort((a, b) => b.count - a.count);

      const matchedTotal = byInstitution.reduce((sum, entry) => sum + entry.matchedCount, 0);

      const windowHours = Math.round((Date.now() - since.getTime()) / 3600000);
      res.json({
        newAssets: {
          total: newAssetRows.length,
          matchedTotal,
          hasAlerts,
          byInstitution,
        },
        newConcepts: { total: newConceptRows.length, items: newConceptRows },
        newProjects: { total: newProjectRows.length, items: newProjectRows },
        windowHours,
        since: since.toISOString(),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // â”€â”€ Institutions â€” merged scraped + manual list â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  app.get("/api/admin/institutions", async (req, res) => {
    try {
      const manual = await storage.getManualInstitutions();
      const scraperNames = ALL_SCRAPERS.map((s) => s.institution);
      const manualNames = manual.map((m) => m.name);
      const merged = Array.from(new Set([...scraperNames, ...manualNames])).sort((a, b) => a.localeCompare(b));
      return res.json({ institutions: merged, manual: manual.map((m) => ({ name: m.name, ttoUrl: m.ttoUrl })) });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/institutions", async (req, res) => {
    try {
      const parsed = insertManualInstitutionSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
      const row = await storage.createManualInstitution(parsed.data);
      return res.json({ institution: row });
    } catch (err: any) {
      if (err.message?.includes("unique") || err.message?.includes("duplicate")) {
        return res.status(409).json({ error: "Institution already exists" });
      }
      return res.status(500).json({ error: err.message });
    }
  });

  // â”€â”€ Manual Import â€” Parse (multipart form-data, returns asset array) â”€â”€â”€â”€â”€â”€
  const manualImportUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024, files: 15 },
  });

  app.post(
    "/api/admin/manual-import/parse",
    manualImportUpload.fields([
      { name: "images", maxCount: 10 },
      { name: "documents", maxCount: 5 },
    ]),
    async (req: any, res) => {

    const institution: string = (req.body?.institution ?? "").trim();
    if (!institution) return res.status(400).json({ error: "institution is required" });

    const rawText: string = (req.body?.rawText ?? "").trim();
    const filesMap: Record<string, Express.Multer.File[]> = (req.files as any) ?? {};
    const imageFiles: Express.Multer.File[] = filesMap["images"] ?? [];
    const docFiles: Express.Multer.File[] = filesMap["documents"] ?? [];

    if (!rawText && imageFiles.length === 0 && docFiles.length === 0) {
      return res.status(400).json({ error: "Provide rawText, at least one image, or at least one document" });
    }

    const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
    for (const file of imageFiles) {
      if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
        return res.status(400).json({ error: `Image type not supported: ${file.mimetype}. Use PNG, JPG, or WebP.` });
      }
    }

    const ALLOWED_DOC_TYPES = new Set([
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]);
    for (const file of docFiles) {
      if (!ALLOWED_DOC_TYPES.has(file.mimetype)) {
        return res.status(400).json({ error: `Document type not supported: ${file.mimetype}. Use PDF or DOCX.` });
      }
    }

    // Extract text from uploaded documents (no AI cost â€” lazy dynamic import for CJS/ESM compat)
    const docTexts: string[] = [];
    if (docFiles.length > 0) {
      // Dynamic import is safe: esbuild transforms it to require() in CJS bundle; tsx uses native import()
      const pdfParseMod = await import("pdf-parse");
      const pdfParseFn: (buf: Buffer) => Promise<{ text: string }> =
        (pdfParseMod as any).default ?? pdfParseMod;

      for (const file of docFiles) {
        try {
          if (file.mimetype === "application/pdf") {
            const parsed = await pdfParseFn(file.buffer);
            if (parsed.text?.trim()) docTexts.push(parsed.text.trim());
          } else {
            const result = await mammoth.extractRawText({ buffer: file.buffer });
            if (result.value?.trim()) docTexts.push(result.value.trim());
          }
        } catch (e: any) {
          console.warn(`[manual-import/parse] Could not extract text from ${file.originalname}: ${e?.message}`);
        }
      }
    }

    const combinedText = [rawText, ...docTexts].filter(Boolean).join("\n\n---\n\n");

    // Guard: if documents were uploaded but yielded no extractable text (e.g. scanned/image PDFs)
    if (docFiles.length > 0 && docTexts.length === 0 && !rawText && imageFiles.length === 0) {
      return res.status(400).json({ error: "No text could be extracted from the uploaded documents. The files may be scanned/image-only PDFs. Try copying the text manually and using Paste Text mode instead." });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Layout-aware prompt: describes the standard two-column TTO listing page structure
    // so the model hunts each field in its expected zone rather than guessing.
    const buildParsePrompt = (inst: string) =>
      `You are a biotech technology transfer analyst extracting a single licensable asset from a TTO (Technology Transfer Office) listing page for institution: ${inst}.

TTO listing pages typically follow this two-column layout:
- LEFT SIDEBAR: technology ID / IDF number / case number (look for labels like "IDF #:", "Case #:", "Tech ID:"), inventor names (under "Meet the Inventors" or "Inventors"), contact person name and email (under "Contact For More Info"), school or department name.
- MAIN CONTENT AREA: the technology title (large heading at top), then labelled sections such as "Unmet Need", "Value Proposition" (used by Duke and some others as an equivalent to "Unmet Need"), "Technology", "Other Applications", "Advantages" (bullet list), "Background", "Description".

Extract exactly one asset from this page. Return ONLY valid JSON with a single key "assets" containing a one-item array. The item must have these fields:
- name: the technology title from the main heading (string)
- description: 2-3 sentence summary combining the Technology, Unmet Need, and/or Value Proposition sections (string, "" if not visible)
- abstract: the full verbatim text from all main content sections concatenated (string, "" if not visible)
- sourceUrl: the page URL if visible in a browser address bar or breadcrumb (string, "" if not)
- inventors: array of inventor full names from the sidebar (string[], [] if none listed)
- technologyId: the technology ID, IDF number, or case number from the sidebar â€” look for "IDF #:", "T-" prefixed codes, "Case #:" (string, "" if not visible)
- contactEmail: the contact email address from the sidebar (string, "" if not visible)
- patentStatus: one of "patented", "patent pending", "provisional", "unknown" â€” infer from any patent application links or text mentioning PCT/provisional
- target: molecular or biological target if determinable, e.g. "AAV capsid", "PD-1" ("unknown" if not stated)
- modality: one of "small molecule", "antibody", "gene therapy", "cell therapy", "peptide", "vaccine", "nanoparticle", "medical device", "diagnostic", "platform technology", "research tool", "unknown"
- indication: disease or condition being targeted ("unknown" if not stated)
- developmentStage: one of "discovery", "preclinical", "phase 1", "phase 2", "phase 3", "approved", "unknown"
- categories: array of 2-4 therapeutic area tags e.g. ["oncology", "gene therapy"] ([] if not determinable)
- innovationClaim: 1-sentence key innovation from the Advantages or Technology section ("unknown" if not clear)
- mechanismOfAction: brief mechanism description ("unknown" if not stated)`;

    // Normalise a raw AI response into a typed asset array
    function normaliseAssets(raw: any[]): any[] {
      return raw.slice(0, 200).map((a: any) => ({
        name: String(a.name || "Unknown Asset"),
        description: String(a.description || ""),
        sourceUrl: String(a.sourceUrl || ""),
        inventors: Array.isArray(a.inventors) ? a.inventors.map(String) : [],
        patentStatus: String(a.patentStatus || "unknown"),
        technologyId: String(a.technologyId || ""),
        contactEmail: String(a.contactEmail || ""),
        target: String(a.target || "unknown"),
        modality: String(a.modality || "unknown"),
        indication: String(a.indication || "unknown"),
        developmentStage: String(a.developmentStage || "unknown"),
        abstract: String(a.abstract || ""),
        categories: Array.isArray(a.categories) ? a.categories.map(String) : [],
        innovationClaim: String(a.innovationClaim || "unknown"),
        mechanismOfAction: String(a.mechanismOfAction || "unknown"),
      }));
    }

    try {
      let assets: any[] = [];
      const failedImages: string[] = [];

      if (imageFiles.length > 0) {
        // â”€â”€ Image mode: gpt-4o, one API call per image â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        // Processing images individually eliminates cross-page content bleed and
        // gives each screenshot its own full context window.
        const prompt = buildParsePrompt(institution);
        for (const file of imageFiles) {
          const b64 = file.buffer.toString("base64");
          const parts: any[] = [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:${file.mimetype};base64,${b64}`, detail: "high" as const } },
          ];
          // If supplementary text was also uploaded, append it as context
          if (combinedText) {
            parts.push({ type: "text", text: `\n\n---\nSupplementary text (may relate to the same page):\n${combinedText.slice(0, 8000)}` });
          }
          try {
            const response = await openai.chat.completions.create({
              model: "gpt-4o",
              messages: [{ role: "user", content: parts }],
              response_format: { type: "json_object" },
              temperature: 0.1,
              max_tokens: 2048,
            });
            const aiContent = response.choices[0]?.message?.content ?? "";
            let parsedJson: any;
            try { parsedJson = JSON.parse(aiContent); } catch {
              failedImages.push(file.originalname);
              continue;
            }
            const rawAssets: any[] = Array.isArray(parsedJson?.assets) ? parsedJson.assets
              : Array.isArray(parsedJson) ? parsedJson : [];
            const normalised = normaliseAssets(rawAssets);
            if (normalised.length === 0) {
              failedImages.push(file.originalname);
            } else {
              assets.push(...normalised);
            }
          } catch (imgErr: any) {
            console.warn(`[manual-import/parse] gpt-4o call failed for image ${file.originalname}: ${imgErr?.message}`);
            failedImages.push(file.originalname);
          }
        }
        // If every image call failed or returned empty JSON, surface a real error
        if (assets.length === 0) {
          return res.status(500).json({ error: "No assets could be extracted from the uploaded images. The image quality may be too low, or the AI vision call failed â€” check server logs for details." });
        }
      } else if (combinedText) {
        // â”€â”€ Text-only mode: gpt-4o-mini, single call â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        // No vision needed â€” keep the cheaper model and a multi-asset prompt.
        const textPrompt = `You are a biotech technology transfer analyst. Extract every distinct licensable asset from the provided TTO (Technology Transfer Office) content for institution: ${institution}.

Return ONLY valid JSON with a single key "assets" containing an array (up to 200 items). Each item must have these fields:
- name: the technology/asset name as listed (string)
- description: 2-3 sentence summary of the technology (string, "" if not determinable)
- sourceUrl: URL of this specific listing if visible (string, "" if not)
- inventors: array of inventor names if listed (string[], [] if none stated)
- patentStatus: one of "patented", "patent pending", "provisional", "unknown"
- technologyId: technology ID or case number if visible (string, "" if not)
- contactEmail: contact email if listed (string, "" if not)
- target: molecular or biological target if determinable ("unknown" if not stated)
- modality: one of "small molecule", "antibody", "gene therapy", "cell therapy", "peptide", "vaccine", "nanoparticle", "medical device", "diagnostic", "platform technology", "research tool", "unknown"
- indication: disease or condition being targeted ("unknown" if not stated)
- developmentStage: one of "discovery", "preclinical", "phase 1", "phase 2", "phase 3", "approved", "unknown"
- abstract: full description text from listing if visible (string, "" if not)
- categories: array of 2-4 therapeutic area tags ([] if not determinable)
- innovationClaim: 1-sentence key innovation ("unknown" if not clear)
- mechanismOfAction: brief MoA description ("unknown" if not stated)

If multiple assets appear, return each as a separate array item.`;

        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: [
            { type: "text", text: textPrompt },
            { type: "text", text: `\n\n---\nContent:\n${combinedText.slice(0, 16000)}` },
          ] }],
          response_format: { type: "json_object" },
          temperature: 0.1,
          max_tokens: 4096,
        });
        const aiContent = response.choices[0]?.message?.content ?? "";
        let parsedJson: any;
        try { parsedJson = JSON.parse(aiContent); } catch { return res.status(500).json({ error: "AI returned invalid JSON" }); }
        const rawAssets: any[] = Array.isArray(parsedJson?.assets) ? parsedJson.assets
          : Array.isArray(parsedJson) ? parsedJson : [];
        assets = normaliseAssets(rawAssets);
      }

      return res.json({ assets, institution, failedImages });
    } catch (err: any) {
      console.error("[manual-import/parse] Error:", err);
      return res.status(500).json({ error: err.message ?? "Parse failed" });
    }
  });

  // â”€â”€ Manual Import â€” Batch Commit to Indexing Queue â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  app.post("/api/admin/manual-import/commit", async (req, res) => {

    const assetSchema = z.object({
      name: z.string().min(1),
      description: z.string().default(""),
      abstract: z.string().default(""),
      sourceUrl: z.string().default(""),
      inventors: z.array(z.string()).default([]),
      patentStatus: z.string().default("unknown"),
      technologyId: z.string().default(""),
      contactEmail: z.string().default(""),
      target: z.string().default("unknown"),
      modality: z.string().default("unknown"),
      indication: z.string().default("unknown"),
      developmentStage: z.string().default("unknown"),
    });

    const bodySchema = z.object({
      institution: z.string().min(1),
      assets: z.array(assetSchema).min(1).max(200),
    });

    const bodyParsed = bodySchema.safeParse(req.body);
    if (!bodyParsed.success) return res.status(400).json({ error: "Invalid request body" });
    const { institution, assets } = bodyParsed.data;

    try {
      const run = await storage.createIngestionRun();

      const listings = assets.map((a) => ({
        fingerprint: makeFingerprint(a.name, institution),
        assetName: a.name,
        institution,
        target: a.target && a.target !== "unknown" ? a.target : "unknown",
        modality: a.modality && a.modality !== "unknown" ? a.modality : "unknown",
        indication: a.indication && a.indication !== "unknown" ? a.indication : "unknown",
        developmentStage: a.developmentStage && a.developmentStage !== "unknown" ? a.developmentStage : "unknown",
        summary: a.description || a.name,
        abstract: a.abstract || null,
        sourceType: "tech_transfer" as const,
        sourceName: "manual",
        sourceUrl: a.sourceUrl || null,
        technologyId: a.technologyId || null,
        patentStatus: a.patentStatus !== "unknown" ? a.patentStatus : null,
        inventors: a.inventors.length > 0 ? a.inventors : null,
        contactEmail: a.contactEmail || null,
        relevant: true,
        runId: run.id,
      }));

      const { newAssets, totalProcessed } = await storage.bulkUpsertIngestedAssets(listings);
      const imported = newAssets.length;
      const skipped = totalProcessed - imported;

      await storage.updateIngestionRun(run.id, { status: "completed", totalFound: totalProcessed, newCount: imported });

      if (newAssets.length > 0) {
        const listingMap = new Map(listings.map((l) => [l.fingerprint, l]));
        const classifyInputs = newAssets.map((a) => ({
          id: a.id,
          title: a.assetName,
          description: listingMap.get(makeFingerprint(a.assetName, institution))?.summary ?? a.assetName,
          abstract: undefined as string | undefined,
        }));

        // Re-classify to fill any remaining unknown fields; preserve values already set from parse step
        const newAssetById = new Map(newAssets.map((a) => [a.id, a]));
        classifyBatch(classifyInputs, 5, async (id, classification) => {
          try {
            const stored = newAssetById.get(id);
            const listing = listingMap.get(makeFingerprint(stored?.assetName ?? "", institution));
            // Prefer parse-extracted values; only use classifier result when parse had "unknown"
            const finalTarget = (listing?.target && listing.target !== "unknown") ? listing.target : (classification.target ?? "unknown");
            const finalModality = (listing?.modality && listing.modality !== "unknown") ? listing.modality : (classification.modality ?? "unknown");
            const finalIndication = (listing?.indication && listing.indication !== "unknown") ? listing.indication : (classification.indication ?? "unknown");
            const finalStage = (listing?.developmentStage && listing.developmentStage !== "unknown") ? listing.developmentStage : classification.developmentStage;
            const score = computeCompletenessScore({
              assetClass: classification.assetClass,
              deviceAttributes: classification.deviceAttributes,
              target: finalTarget,
              modality: finalModality,
              indication: finalIndication,
              developmentStage: finalStage,
              categories: classification.categories,
              innovationClaim: classification.innovationClaim,
              mechanismOfAction: classification.mechanismOfAction,
              summary: listing?.summary ?? null,
              abstract: listing?.abstract ?? null,
              inventors: listing?.inventors ?? null,
              patentStatus: listing?.patentStatus ?? null,
            });
            await db
              .update(ingestedAssets)
              .set({
                target: finalTarget,
                modality: finalModality,
                indication: finalIndication,
                developmentStage: finalStage,
                ...(classification.categories ? { categories: classification.categories } : {}),
                ...(classification.categoryConfidence !== undefined ? { categoryConfidence: classification.categoryConfidence } : {}),
                ...(classification.innovationClaim ? { innovationClaim: classification.innovationClaim } : {}),
                ...(classification.mechanismOfAction ? { mechanismOfAction: classification.mechanismOfAction } : {}),
                completenessScore: score,
              })
              .where(eq(ingestedAssets.id, id));
          } catch (e: any) {
            console.error(`[manual-import/commit] classify error id=${id}: ${e?.message}`);
          }
        }).catch((e: any) => console.error("[manual-import/commit] classifyBatch error:", e?.message));
      }

      return res.json({ imported, skipped });
    } catch (err: any) {
      console.error("[manual-import/commit] Error:", err);
      return res.status(500).json({ error: err.message ?? "Commit failed" });
    }
  });

  function resolveSubjectTokens(subject: string, assets: Array<{ institution?: string | null }>): string {
    const count = assets.length;
    const institutionCount = new Set(assets.map((a) => a.institution ?? "")).size;
    const date = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    return subject
      .replace(/\{count\}/g, String(count))
      .replace(/\{institution_count\}/g, String(institutionCount))
      .replace(/\{date\}/g, date);
  }
  // ── Admin "Act as user" impersonation (Task #736) ─────────────────────────
  // Lives under /api/admin/* so requireAdmin gates everything. The startSession/
  // endSession routes use the verified admin id from x-admin-id; downstream
  // identity swap happens in the auth middleware via x-impersonation-token.
  {
    const imp = await import("../lib/impersonation");
    const { z } = await import("zod");

    app.post("/api/admin/impersonation/start", async (req, res) => {
      try {
        const adminId = String(req.headers["x-admin-id"] ?? "");
        const adminEmail = String(req.headers["x-admin-email"] ?? "");
        if (!adminId) return res.status(401).json({ error: "Admin auth required" });
        const schema = z.object({
          targetUserId: z.string().min(1),
          readOnly: z.boolean().default(true),
        });
        const body = schema.parse(req.body);
        const result = await imp.startSession({
          adminId,
          adminEmail,
          targetUserId: body.targetUserId,
          readOnly: body.readOnly,
        });
        if ("error" in result) return res.status(result.status).json({ error: result.error });
        await insertAdminEvent({
          adminUserId: adminId, adminEmail,
          action: "impersonation_start",
          targetUserId: result.session.targetUserId,
          targetEmail: result.session.targetEmail,
          payload: { readOnly: result.session.readOnly, sessionId: result.session.id },
        });
        res.json({
          token: result.token,
          session: {
            id: result.session.id,
            targetUserId: result.session.targetUserId,
            targetEmail: result.session.targetEmail,
            targetRole: result.session.targetRole,
            readOnly: result.session.readOnly,
            startedAt: result.session.startedAt,
          },
        });
      } catch (err: any) {
        if (err?.name === "ZodError") return res.status(400).json({ error: "Invalid input" });
        res.status(500).json({ error: err?.message ?? "Failed to start impersonation" });
      }
    });

    app.post("/api/admin/impersonation/end", async (req, res) => {
      try {
        const adminId = String(req.headers["x-admin-id"] ?? "");
        const schema = z.object({ sessionId: z.number().int().positive() });
        const { sessionId } = schema.parse(req.body);
        const ok = await imp.endSession(sessionId, adminId);
        if (!ok) {
          // Either the session belongs to a different admin, is already
          // ended, or doesn't exist. Surface as 404 so the client mutation
          // is treated as a failure (avoids silently clearing the local
          // token when nothing was actually ended).
          return res.status(404).json({ error: "Session not found or not yours to end", ended: false });
        }
        res.json({ ended: true });
      } catch (err: any) {
        if (err?.name === "ZodError") return res.status(400).json({ error: "Invalid input" });
        res.status(500).json({ error: err?.message ?? "Failed to end impersonation" });
      }
    });

    // List impersonation sessions. Default is scoped to the calling admin so
    // one admin's active session can never block or be ended by another. Pass
    // ?scope=all to include other admins (useful for organization-wide audit).
    app.get("/api/admin/impersonation/sessions", async (req, res) => {
      try {
        const adminId = String(req.headers["x-admin-id"] ?? "");
        const scope = String(req.query.scope ?? "mine");
        const sessions = scope === "all"
          ? await imp.listRecentSessions(100)
          : await imp.listSessionsForAdmin(adminId, 100);
        res.json({ sessions });
      } catch (err: any) {
        res.status(500).json({ error: err?.message ?? "Failed to list sessions" });
      }
    });

    app.get("/api/admin/impersonation/sessions/:id/events", async (req, res) => {
      try {
        const sessionId = Number(req.params.id);
        if (!Number.isFinite(sessionId)) return res.status(400).json({ error: "Invalid id" });
        // Scope: an admin can only read the events for their own sessions.
        const adminId = String(req.headers["x-admin-id"] ?? "");
        const ownerId = await imp.getSessionAdminId(sessionId);
        if (!ownerId) return res.status(404).json({ error: "Session not found" });
        if (ownerId !== adminId) return res.status(403).json({ error: "Not your session" });
        const events = await imp.listSessionEvents(sessionId, 200);
        res.json({ events });
      } catch (err: any) {
        res.status(500).json({ error: err?.message ?? "Failed to list events" });
      }
    });
  }

  // Read the current impersonation session (if any) for the calling admin.
  // Mounted on /api so it can be read without an admin token swap, but it
  // requires a valid bearer that matches the session's admin_id.
  app.get("/api/me/impersonation", async (req, res) => {
    try {
      const token = req.headers["x-impersonation-token"];
      if (typeof token !== "string" || !token) return res.json({ active: null });
      const bearer = req.headers.authorization?.replace("Bearer ", "");
      if (!bearer) return res.json({ active: null });
      const { createClient } = await import("@supabase/supabase-js");
      const sb = createClient(process.env.VITE_SUPABASE_URL || "", process.env.VITE_SUPABASE_ANON_KEY || "");
      const { data, error } = await sb.auth.getUser(bearer);
      if (error || !data.user) return res.json({ active: null });
      const imp = await import("../lib/impersonation");
      const session = await imp.loadActiveSessionByToken(token, data.user.id);
      if (!session) return res.json({ active: null });
      res.json({
        active: {
          id: session.id,
          targetUserId: session.targetUserId,
          targetEmail: session.targetEmail,
          targetRole: session.targetRole,
          readOnly: session.readOnly,
          startedAt: session.startedAt,
          actionCount: session.actionCount,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Failed to load impersonation state" });
    }
  });

  app.post("/api/admin/relevance/holdout/build", async (_req, res) => {
    try {
      const result = await storage.buildRelevanceHoldout();
      const stats = await storage.getRelevanceHoldoutStats();
      // Holdout membership changed → drop cached per-row scores so the next
      // /relevance/eval call rescores against the new row set.
      invalidateRelevanceEvalCache();
      res.json({ ...result, stats });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to build holdout" });
    }
  });

  app.get("/api/admin/relevance/eval", async (_req, res) => {
    try {
      const preFilterMod = await import("../lib/pipeline/relevancePreFilter");
      const classifierMod = await import("../lib/pipeline/relevanceClassifier");
      const { preFilterRelevance } = preFilterMod;
      const {
        scoreText,
        CLASSIFIER_THRESHOLD,
        CLASSIFIER_V2_ENABLED,
        CLASSIFIER_VERSION,
        getActiveThreshold,
        getActiveWeights,
        weightsSignature,
      } = classifierMod;
      const [activeThreshold, activeWeights] = await Promise.all([
        getActiveThreshold(),
        getActiveWeights(),
      ]);
      const activeWeightsSig = weightsSignature(activeWeights);

      // Production pipeline keeps anything that isn't an explicit reject:
      // both `pass` and `ambiguous` flow forward into the rest of ingestion.
      const decisionToKept = (d: "pass" | "reject" | "ambiguous") => d !== "reject";

      // Per-row cache: keyed by (eval row count, classifier version). The
      // probability vector + v1 decision are both pure functions of the row
      // text and the classifier weights, so they don't need to be recomputed
      // on every admin click. Invalidated when buildRelevanceHoldout runs
      // (route handler above) or when CLASSIFIER_VERSION is bumped (engineers
      // bump the constant when weights/keywords change).
      type ScoredRow = { label: boolean; prob: number; v1Kept: boolean };
      let scored: ScoredRow[];
      let holdoutSize: number;
      const cacheKey = relevanceEvalCacheKey(CLASSIFIER_VERSION, activeWeightsSig);
      if (relevanceEvalCache && relevanceEvalCache.key === cacheKey) {
        scored = relevanceEvalCache.scored;
        holdoutSize = relevanceEvalCache.holdoutSize;
      } else {
        // Eval split only — train/eval partitioning is enforced by
        // buildRelevanceHoldout.
        const rows = await storage.listRelevanceHoldout(20000, "eval");
        type Listing = Parameters<typeof preFilterRelevance>[0];
        const buildListing = (r: typeof rows[number]): Listing => ({
          title: r.text || "",
          description: "",
          url: "",
          institution: r.sourceName || "unknown",
        });
        scored = rows.map((r) => {
          const listing = buildListing(r);
          const text = `${listing.title} ${listing.description ?? ""}`;
          return {
            label: !!r.label,
            // Score with the *active* (possibly tuned) weights so the cached
            // probability vector reflects whatever production is using right
            // now. The cache key above includes the weights signature, so a
            // tune call invalidates this cache automatically.
            prob: scoreText(text, activeWeights).prob,
            v1Kept: decisionToKept(preFilterRelevance(listing)),
          };
        });
        holdoutSize = rows.length;
        relevanceEvalCache = { key: cacheKey, scored, holdoutSize };
      }

      if (holdoutSize === 0) {
        return res.json({
          holdoutSize: 0,
          threshold: CLASSIFIER_THRESHOLD,
          activeThreshold,
          currentVariant: CLASSIFIER_V2_ENABLED ? "v2_classifier" : "v1_keyword",
          v1: null,
          v2: null,
          current: null,
          sweep: [],
          bestThreshold: null,
        });
      }

      const tally = (preds: Array<{ label: boolean; pred: boolean }>) => {
        let tp = 0, fp = 0, tn = 0, fn = 0;
        for (const p of preds) {
          if (p.pred && p.label) tp++;
          else if (p.pred && !p.label) fp++;
          else if (!p.pred && p.label) fn++;
          else tn++;
        }
        const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
        const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
        const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
        return { tp, fp, tn, fn, precision, recall, f1 };
      };

      // preFilterRelevanceV2 only depends on the cached probability:
      //   prob >= t + 0.15 → pass, prob <= t - 0.15 → reject, else ambiguous.
      // We inline that here so the threshold sweep is O(N) over a number[]
      // instead of re-running scoreText/extractFeatures per row per threshold.
      const v2KeptAt = (t: number, prob: number) => prob > t - 0.15;

      const v1Stats = tally(scored.map((s) => ({ label: s.label, pred: s.v1Kept })));
      const evalV2At = (t: number) => tally(scored.map((s) => ({
        label: s.label,
        pred: v2KeptAt(t, s.prob),
      })));
      // v2 stats are evaluated at the *active* threshold (env > tuned > default),
      // not the bare CLASSIFIER_THRESHOLD constant. That way the v2 card and
      // the "Current pipeline" card always tell the same story after a tune,
      // and the head-to-head with v1 reflects what production actually runs.
      const v2Stats = evalV2At(activeThreshold);
      const sweep = [0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7].map((t) => ({
        threshold: t,
        ...evalV2At(t),
      }));
      // currentPipeline = whichever pre-filter actually runs in production
      // right now (v1 keyword OR v2 classifier at the active threshold).
      const currentStats = CLASSIFIER_V2_ENABLED ? evalV2At(activeThreshold) : v1Stats;
      // bestThreshold = sweep entry with the highest F1 — used by
      // POST /api/admin/relevance/threshold/tune to persist the choice.
      const best = sweep.reduce((acc, s) => (s.f1 > acc.f1 ? s : acc), sweep[0]);

      res.json({
        holdoutSize,
        threshold: CLASSIFIER_THRESHOLD,
        activeThreshold,
        currentVariant: CLASSIFIER_V2_ENABLED ? "v2_classifier" : "v1_keyword",
        v1: v1Stats,
        v2: v2Stats,
        current: currentStats,
        sweep,
        bestThreshold: best ? { threshold: best.threshold, f1: best.f1 } : null,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to evaluate";
      res.status(500).json({ error: msg });
    }
  });

  // POST → picks the best-F1 threshold from the sweep and persists it via
  // storage.setTunedClassifierThreshold. The classifier reads it lazily
  // (cached for 5 min) so production switches over without a restart.
  app.post("/api/admin/relevance/threshold/tune", async (_req, res) => {
    try {
      const classifierMod = await import("../lib/pipeline/relevanceClassifier");
      const { preFilterRelevanceV2, invalidateThresholdCache } = classifierMod;
      const rows = await storage.listRelevanceHoldout(20000, "eval");
      if (rows.length === 0) return res.status(400).json({ error: "Holdout is empty — build it first" });
      // Tune against the *real* v2 decision function (preFilterRelevanceV2),
      // so the chosen threshold optimizes the same pass/ambiguous/reject
      // routing that ingestion uses — not a proxy probability cutoff.
      type Listing = Parameters<typeof preFilterRelevanceV2>[0];
      const listings: Array<{ label: boolean; listing: Listing }> = rows.map((r) => ({
        label: !!r.label,
        listing: { title: r.text || "", description: "", url: "", institution: r.sourceName || "unknown" },
      }));
      let best = { threshold: 0.5, f1: -1 };
      for (const t of [0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70]) {
        let tp = 0, fp = 0, fn = 0;
        for (const p of listings) {
          const decision = preFilterRelevanceV2(p.listing, t);
          const pred = decision !== "reject"; // pass + ambiguous both flow forward
          if (pred && p.label) tp++;
          else if (pred && !p.label) fp++;
          else if (!pred && p.label) fn++;
        }
        const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
        const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
        const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
        if (f1 > best.f1) best = { threshold: t, f1 };
      }
      await storage.setTunedClassifierThreshold(best.threshold, best.f1);
      invalidateThresholdCache();
      res.json({ tuned: best, holdoutSize: rows.length });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to tune threshold";
      res.status(500).json({ error: msg });
    }
  });

  // Task #699: fit logistic-regression weights from the train split, choose
  // the threshold on the eval split, persist both — but only if the fitted
  // model strictly beats the current persisted/baseline F1 on eval. This
  // satisfies the task's "v2 strictly ≥ v1 on F1 before flag default flips
  // ON" gate. Pass ?force=1 to persist regardless (useful when iterating).
  app.post("/api/admin/relevance/weights/tune", async (req, res) => {
    try {
      const force = req.query.force === "1" || req.query.force === "true";
      const trainerMod = await import("../lib/pipeline/relevanceTrainer");
      const classifierMod = await import("../lib/pipeline/relevanceClassifier");
      const { fitAndEvaluate } = trainerMod;
      const {
        DEFAULT_WEIGHTS,
        getActiveWeights,
        invalidateWeightsCache,
        invalidateThresholdCache,
      } = classifierMod;

      const [trainRowsRaw, evalRowsRaw, currentActive] = await Promise.all([
        storage.listRelevanceHoldout(20000, "train"),
        storage.listRelevanceHoldout(20000, "eval"),
        getActiveWeights(),
      ]);
      if (trainRowsRaw.length < 50) {
        return res.status(400).json({
          error: `Train split too small (${trainRowsRaw.length} rows). Build holdout and collect more save/dismiss feedback first.`,
        });
      }
      if (evalRowsRaw.length < 20) {
        return res.status(400).json({
          error: `Eval split too small (${evalRowsRaw.length} rows). Build holdout first.`,
        });
      }

      const trainRows = trainRowsRaw.map((r) => ({ text: r.text || "", label: !!r.label }));
      const evalRows = evalRowsRaw.map((r) => ({ text: r.text || "", label: !!r.label }));

      // Baseline = whatever's currently live (DEFAULT_WEIGHTS if nothing has
      // ever been tuned). This is what the new weights have to beat.
      const result = fitAndEvaluate(trainRows, evalRows, currentActive);

      const improvedF1 = result.fittedEval.f1 > result.baselineEval.f1;
      const persisted = force || improvedF1;

      if (persisted) {
        await storage.setTunedClassifierWeights(result.fitted, result.fittedEval.f1);
        // Tuning weights also implies the chosen threshold — persist it too
        // so the active threshold reflects the same fit.
        await storage.setTunedClassifierThreshold(result.threshold, result.fittedEval.f1);
        invalidateWeightsCache();
        invalidateThresholdCache();
        invalidateRelevanceEvalCache();
      }

      res.json({
        persisted,
        improvedF1,
        forced: force,
        defaultWeights: DEFAULT_WEIGHTS,
        currentActiveWeights: currentActive,
        fitted: {
          weights: result.fitted,
          threshold: result.threshold,
          eval: result.fittedEval,
        },
        baseline: {
          // What the live weights score on the eval split *right now* (at the
          // best sweep threshold) — so the UI can render a fair head-to-head.
          weights: currentActive,
          threshold: result.baselineThreshold,
          eval: result.baselineEval,
        },
        trainSize: trainRows.length,
        evalSize: evalRows.length,
        trainResult: {
          iterations: result.trainResult.iterations,
          finalLoss: result.trainResult.finalLoss,
          positiveRate: result.trainResult.positiveRate,
          converged: result.trainResult.converged,
        },
        sweep: result.sweep,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to tune weights";
      res.status(500).json({ error: msg });
    }
  });

  app.get("/api/admin/relevance/metrics", async (_req, res) => {
    try {
      const rows = await storage.getLatestRelevanceMetrics(500);
      const lastAt = await storage.getLastRelevanceMetricsAt();
      res.json({ rows, lastComputedAt: lastAt });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch metrics" });
    }
  });

  app.post("/api/admin/relevance/metrics/refresh", async (_req, res) => {
    try {
      const result = await storage.computeRelevanceMetrics(7);
      res.json({ inserted: result.inserted });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to refresh metrics" });
    }
  });


  app.get("/api/admin/whoami", (req, res) => {
    res.json({
      id: req.headers["x-admin-id"],
      email: req.headers["x-admin-email"],
      isAdmin: true,
    });
  });

  app.get("/api/admin/scan-matrix", async (req, res) => {
    try {
      const limit = Math.min(parseInt(String(req.query.limit ?? "10"), 10) || 10, 50);
      const [data, indexedCounts] = await Promise.all([
        storage.getScanMatrix(limit),
        storage.getInstitutionAssetCounts(),
      ]);
      res.json({ ...data, indexedCounts });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch scan matrix" });
    }
  });

  app.get("/api/admin/collector-health", async (req, res) => {
    try {

      const allInstitutionNames = ALL_SCRAPERS.filter((s) => s.scraperType !== "stub").map((s) => s.institution);

      const healthData = await storage.getCollectorHealthData();
      const scraperHealthMap = getScraperHealthCache();
      const { institutions: instRows, syncSessions: sessions } = healthData;

      const instMap = new Map(instRows.map((r) => [r.institution, r]));
      const sessionsByInstitution = new Map<string, typeof sessions>();
      for (const s of sessions) {
        if (!sessionsByInstitution.has(s.institution)) {
          sessionsByInstitution.set(s.institution, []);
        }
        sessionsByInstitution.get(s.institution)!.push(s);
      }

      const STALE_THRESHOLD_MS = 10 * 60 * 1000;
      const now = Date.now();
      // Live active syncs — cross-reference against DB session health so the
      // "syncing" status is always accurate regardless of DB session heartbeat lag.
      const liveActiveSyncs = new Set(getActiveSyncs());

      const rows = allInstitutionNames.map((name) => {
        const dbRow = instMap.get(name);
        const totalInDb = dbRow?.totalInDb ?? 0;
        const biotechRelevant = dbRow?.biotechRelevant ?? 0;
        const instSessions = sessionsByInstitution.get(name) ?? [];
        const session = instSessions[0] ?? null;

        // Use scraper_health table consecutiveFailures — this is maintained by the
        // scheduler and correctly excludes transient DB/server-restart errors via
        // isTransientDbError(). Computing from session history would count transient
        // errors that never incremented the real failure counter.
        const scraperHealth = scraperHealthMap.get(name);
        const consecutiveFailures = scraperHealth?.consecutiveFailures ?? 0;

        type HealthStatus = "ok" | "warning" | "degraded" | "failing" | "stale" | "syncing" | "never" | "blocked" | "network_blocked" | "site_down" | "rate_limited" | "parser_failure" | "empty_response";

        function classifyByError(errMsg: string | null | undefined): HealthStatus {
          if (!errMsg) return "parser_failure";
          const m = errMsg.toLowerCase();
          if (/\b5\d{2}\b/.test(errMsg) || m.includes("service unavailable") || m.includes("maintenance")) return "site_down";
          if (m.includes(" 429") || m.includes("rate limit") || m.includes("rate-limit") || m.includes("too many request")) return "rate_limited";
          if (m.includes(" 403") || m.includes("cloudflare") || m.includes("bot challenge") || m.includes("access denied") || m.includes(" 401")) return "blocked";
          if (m.includes("network unreachable") || m.includes("blocks cloud") || m.includes("cloud/datacenter")) return "network_blocked";
          // Unrecognised error text on a completed session = scraper ran but
          // produced no listings -- treat as a parser / selector issue.
          return "parser_failure";
        }

        let health: HealthStatus;
        // Live lock takes precedence: if ingestion is actively holding a lock for this
        // institution, it's definitively "syncing" regardless of DB session state.
        if (liveActiveSyncs.has(name)) {
          health = "syncing";
        } else if (!session) {
          health = "never";
        } else if (session.status === "running") {
          const heartbeat = session.lastRefreshedAt ?? session.createdAt;
          const elapsed = now - new Date(heartbeat).getTime();
          health = elapsed > STALE_THRESHOLD_MS ? "stale" : "syncing";
        } else if (session.status === "enriched" || session.status === "completed" || session.status === "pushed") {
          if ((session.rawCount ?? 0) === 0) {
            if (session.errorMessage) {
              health = classifyByError(session.errorMessage);
            } else if (totalInDb > 0) {
              // rawCount=0 with no error message: could be a legitimately empty sitemap diff
              // OR a silent block (Cloudflare, rate-limit with no HTTP error). Flag as
              // empty_response so the admin can see it, rather than showing false green.
              health = "empty_response";
            } else {
              health = classifyByError(session.errorMessage);
            }
          } else {
            health = "ok";
          }
        } else if (session.status === "failed") {
          const errMsg = session.errorMessage ?? "";
          const m = errMsg.toLowerCase();
          if (m.includes(" 503") || m.includes(" 502") || m.includes(" 500") || m.includes("service unavailable") || m.includes("maintenance")) {
            health = "site_down";
          } else if (m.includes(" 429") || m.includes("rate limit") || m.includes("rate-limit") || m.includes("too many request")) {
            health = "rate_limited";
          } else if (m.includes(" 403") || m.includes("cloudflare") || m.includes("bot challenge") || m.includes("access denied")) {
            health = "blocked";
          } else {
            // Generic failure — use consecutiveFailures for severity.
            // consecutiveFailures is maintained by the scheduler and correctly
            // excludes transient events (server restart, DB blip) via isTransientDbError().
            // When it's 0, the last failure was transient — don't show Warning.
            health = consecutiveFailures >= 4 ? "failing" :
                     consecutiveFailures >= 2 ? "degraded" :
                     consecutiveFailures >= 1 ? "warning" :
                     "ok";
          }
        } else {
          health = "degraded";
        }

        return {
          institution: name,
          totalInDb,
          biotechRelevant,
          lastSyncAt: session?.completedAt ?? session?.createdAt ?? null,
          lastSyncStatus: session?.status ?? null,
          lastSyncError: (health !== "ok" && health !== "syncing" && health !== "never") ? (session?.errorMessage ?? null) : null,
          rawCount: session?.rawCount ?? 0,
          newCount: session?.newCount ?? 0,
          relevantCount: session?.relevantCount ?? 0,
          phase: (liveActiveSyncs.has(name) && session?.status !== "running") ? null : (session?.phase ?? null),
          sessionId: session?.sessionId ?? null,
          consecutiveFailures,
          health,
          tier: getScraperTier(name),
        };
      });

      const manualInsts = await storage.getManualInstitutions();
      const activeSearchRows = manualInsts.map((m) => {
        const dbRow = instMap.get(m.name);
        return {
          institution: m.name,
          ttoUrl: m.ttoUrl ?? "",
          totalInDb: dbRow?.totalInDb ?? 0,
          biotechRelevant: dbRow?.biotechRelevant ?? 0,
        };
      });

      // Compute totals from the raw DB aggregation (instRows) to avoid double-counting
      // institutions that appear in both ALL_SCRAPERS and manual_institutions.
      const totalInDb = instRows.reduce((s, r) => s + r.totalInDb, 0);
      const totalBiotechRelevant = instRows.reduce((s, r) => s + r.biotechRelevant, 0);
      const issueCount = rows.filter((r) => r.health !== "ok" && r.health !== "syncing" && r.health !== "never").length;
      const syncingCount = rows.filter((r) => r.health === "syncing").length;
      const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;
      const syncedToday = rows.filter((r) => r.lastSyncAt && new Date(r.lastSyncAt).getTime() > twentyFourHoursAgo).length;

      const scheduler = getSchedulerStatus();

      res.json({
        rows,
        activeSearchRows,
        totalInDb,
        totalBiotechRelevant,
        totalInstitutions: allInstitutionNames.length,
        totalActiveSearch: manualInsts.length,
        issueCount,
        syncingCount,
        syncedToday,
        scheduler,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch collector health" });
    }
  });

  app.get("/api/admin/new-arrivals", async (req, res) => {
    try {
      const groups = await storage.getNewArrivals();
      const totalUnindexed = groups.reduce((s, g) => s + g.count, 0);
      const totalPendingEnrichment = totalUnindexed;
      const totalInstitutions = groups.length;
      res.json({ totalUnindexed, totalPendingEnrichment, totalInstitutions, groups });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch indexing queue" });
    }
  });

  app.post("/api/admin/new-arrivals/push", async (req, res) => {
    try {
      const body = req.body as { institution?: unknown };
      const institution: string | undefined = typeof body.institution === "string" ? body.institution : undefined;
      const result = await storage.pushNewArrivals(institution);
      res.json({ updated: result.updated, message: `Marked ${result.updated} asset${result.updated !== 1 ? "s" : ""} as enrichment done` });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Push failed" });
    }
  });

  app.delete("/api/admin/new-arrivals/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      const found = await storage.rejectStagingItem(id);
      if (!found) return res.status(404).json({ error: "Item not found" });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Reject failed" });
    }
  });

  app.get("/api/admin/alerts/latency", requireAdmin, async (_req, res) => {
    try {
      const result: any = await db.execute(sql`
        SELECT
          AVG(EXTRACT(EPOCH FROM (dl.sent_at - ia.first_seen_at)) / 60.0)::float AS avg_minutes,
          COUNT(*)::int AS sample_size
        FROM dispatch_logs dl
        CROSS JOIN LATERAL unnest(dl.asset_ids) AS aid
        JOIN ingested_assets ia ON ia.id = aid
        WHERE dl.is_test = false
          AND dl.sent_at >= NOW() - INTERVAL '24 hours'
          AND ia.first_seen_at IS NOT NULL
          AND dl.sent_at >= ia.first_seen_at
      `);
      const row = (result.rows ?? result)[0] ?? {};
      res.json({
        avgMinutes: row.avg_minutes != null ? Number(row.avg_minutes) : null,
        sampleSize: row.sample_size ?? 0,
        windowHours: 24,
      });
    } catch (err: any) {
      console.error("[admin/alerts/latency] error:", err?.message);
      res.status(500).json({ error: err?.message ?? "Failed to compute latency" });
    }
  });

  app.get("/api/admin/dispatch/filter-options", async (req, res) => {
    try {
      const rows = await db
        .select({ institution: ingestedAssets.institution, modality: ingestedAssets.modality })
        .from(ingestedAssets)
        .where(eq(ingestedAssets.relevant, true));
      const institutions = Array.from(new Set(rows.map((r) => r.institution).filter(Boolean))).sort();
      const modalities = Array.from(
        new Set(rows.map((r) => r.modality).filter((m): m is string => !!m && m !== "unknown"))
      ).sort();
      return res.json({ institutions, modalities });
    } catch (err: any) {
      console.error("[dispatch/filter-options] Error:", err);
      return res.status(500).json({ error: err.message ?? "Failed to load filter options" });
    }
  });

  app.get("/api/admin/new-discoveries", async (req, res) => {
    try {
      const windowHours = Math.max(1, Math.min(8760, Number(req.query.windowHours ?? 168)));
      const parseList = (val: unknown): string[] => {
        if (typeof val === "string" && val) return val.split(",").map((s) => s.trim()).filter(Boolean);
        if (Array.isArray(val)) return (val as string[]).filter((s) => typeof s === "string" && s);
        return [];
      };
      const institutions = parseList(req.query.institutions);
      const modalities = parseList(req.query.modalities);
      const assets = await storage.getNewDiscoveries(windowHours, { institutions, modalities });
      return res.json({ assets, windowHours });
    } catch (err: any) {
      console.error("[new-discoveries] Error:", err);
      return res.status(500).json({ error: err.message ?? "Failed to load discoveries" });
    }
  });

  app.post("/api/admin/dispatch/preview", async (req, res) => {
    try {

      const schema = z.object({
        subject: z.string().min(1).max(200),
        assetIds: z.array(z.number().int()).min(1).max(200),
        windowHours: z.number().int().min(1).default(72),
        isTest: z.boolean().default(false),
        colorMode: z.enum(["light", "dark"]).default("light"),
      });

      const { subject, assetIds, windowHours, isTest, colorMode } = schema.parse(req.body);
      const { renderDispatchEmail } = await import("../lib/emailTemplate");

      const selectedAssets = await storage.getAssetsByIds(assetIds);

      const windowOptions: Record<number, string> = {
        24: "Last 24 hours", 48: "Last 48 hours", 72: "Last 72 hours",
        168: "Last 7 days", 336: "Last 14 days", 720: "Last 30 days",
      };
      const windowLabel = windowOptions[windowHours] ?? `${windowHours}h window`;
      const resolvedSubject = resolveSubjectTokens(subject, selectedAssets);
      const html = renderDispatchEmail({ subject: resolvedSubject, assets: selectedAssets, windowLabel, isTest, colorMode, settingsUrl: "https://edenradar.com/industry/settings" });
      return res.json({ html, resolvedSubject });
    } catch (err: any) {
      console.error("[dispatch/preview] Error:", err);
      return res.status(500).json({ error: err.message ?? "Preview failed" });
    }
  });

  app.post("/api/admin/dispatch/send", async (req, res) => {
    try {

      const schema = z.object({
        subject: z.string().min(1).max(200),
        recipients: z.array(z.string().email()).max(50).default([]),
        testAddress: z.string().email().optional(),
        assetIds: z.array(z.number().int()).min(1).max(200),
        windowHours: z.number().int().min(1).default(168),
        isTest: z.boolean().default(false),
        colorMode: z.enum(["light", "dark"]).default("light"),
      });

      const body = schema.parse(req.body);
      const { subject, recipients, testAddress, assetIds, windowHours, isTest, colorMode } = body;

      if (!isTest && recipients.length === 0) {
        return res.status(400).json({ error: "At least one recipient required for a non-test dispatch." });
      }
      if (isTest && !testAddress && recipients.length === 0) {
        return res.status(400).json({ error: "Provide a test address or at least one recipient for test sends." });
      }

      const { renderDispatchEmail } = await import("../lib/emailTemplate");
      const selectedAssets = await storage.getAssetsByIds(assetIds);
      if (selectedAssets.length === 0) {
        return res.status(400).json({ error: "None of the selected asset IDs could be found. Please refresh and try again." });
      }

      const windowOptions: Record<number, string> = {
        24: "Last 24 hours", 48: "Last 48 hours", 72: "Last 72 hours",
        168: "Last 7 days", 336: "Last 14 days", 720: "Last 30 days",
      };
      const windowLabel = windowOptions[windowHours] ?? `${windowHours}h window`;
      const resolvedSubject = resolveSubjectTokens(subject, selectedAssets);

      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey) {
        return res.status(503).json({ error: "RESEND_API_KEY is not configured. Add it to your environment secrets to enable email dispatch." });
      }

      const rawToList = isTest ? [testAddress ?? recipients[0]] : recipients;
      const finalSubject = isTest ? `[TEST] ${resolvedSubject}` : resolvedSubject;

      // Skip recipients who previously unsubscribed via an email-keyed token.
      // (Admin manual dispatch recipients have no Eden account, so they live in
      // the email_unsubscribes suppression list — not industry_profiles.)
      const normalizedRecipients = rawToList.map(a => a.trim().toLowerCase());
      const suppressedRows = normalizedRecipients.length > 0
        ? await db.select({ email: emailUnsubscribes.email })
            .from(emailUnsubscribes)
            .where(inArray(emailUnsubscribes.email, normalizedRecipients))
        : [];
      const suppressed = new Set(suppressedRows.map(r => r.email.toLowerCase()));
      const toList = rawToList.filter(addr => !suppressed.has(addr.trim().toLowerCase()));
      const suppressedCount = rawToList.length - toList.length;
      if (suppressedCount > 0) {
        console.log(`[dispatch/send] suppressed ${suppressedCount}/${rawToList.length} recipient(s) via email_unsubscribes`);
      }
      if (toList.length === 0) {
        return res.json({ ok: true, sentTo: 0, isTest, skipped: rawToList.length, reason: "all recipients unsubscribed" });
      }

      // Manual admin dispatch: render + send per-recipient so each email
      // carries a recipient-specific unsubscribe URL — both as the RFC 8058
      // one-click List-Unsubscribe header AND as the visible footer link
      // baked into the rendered template.
      try {
        await Promise.all(toList.map(addr => {
          const unsubscribeUrl = unsubscribeUrlForEmail(addr);
          const perRecipientHtml = renderDispatchEmail({
            subject: resolvedSubject,
            assets: selectedAssets,
            windowLabel,
            isTest,
            colorMode,
            settingsUrl: "https://edenradar.com/industry/settings",
            unsubscribeUrl,
          });
          return sendEmail(addr, finalSubject, perRecipientHtml, {
            from: FROM_DIGEST,
            replyTo: "support@edenradar.com",
            unsubscribeUrl,
          });
        }));
      } catch (sendErr: any) {
        console.error("[dispatch/send] Resend error:", sendErr);
        return res.status(502).json({ error: `Email provider error: ${sendErr?.message ?? "send failed"}` });
      }

      if (!isTest) {
        await storage.createDispatchLog({
          subject: resolvedSubject,
          recipients: toList,
          assetIds,
          assetNames: selectedAssets.map((a) => a.assetName),
          assetSourceUrls: selectedAssets.map((a) => a.sourceUrl ?? ""),
          assetCount: selectedAssets.length,
          windowHours,
          isTest: false,
        });
      }

      return res.json({ ok: true, sentTo: toList.length, isTest });
    } catch (err: any) {
      console.error("[dispatch/send] Error:", err);
      return res.status(500).json({ error: err.message ?? "Dispatch failed" });
    }
  });

  app.post("/api/admin/alerts/trigger-emails", async (req, res) => {
    try {
      const { checkAndSendAlerts } = await import("../lib/alertMailer");
      // Run async — don't await so the HTTP response returns immediately
      checkAndSendAlerts().catch((err: any) => {
        console.error("[admin/alerts/trigger-emails] Error:", err?.message);
      });
      return res.json({ ok: true, message: "Alert email evaluation started in background." });
    } catch (err: any) {
      console.error("[admin/alerts/trigger-emails] Error:", err);
      return res.status(500).json({ error: err.message ?? "Failed to trigger alert emails" });
    }
  });

  app.get("/api/admin/dispatch/subscribers", async (req, res) => {
    try {
      if (!supabaseServiceRoleKey || !supabaseUrl) {
        return res.status(500).json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" });
      }
      const { createClient } = await import("@supabase/supabase-js");
      const adminSupabase = createClient(supabaseUrl, supabaseServiceRoleKey);
      const { data, error } = await adminSupabase.auth.admin.listUsers({ perPage: 500 });
      if (error) return res.status(500).json({ error: error.message });
      const subscribers = (data?.users ?? [])
        .filter((u) => u.user_metadata?.subscribedToDigest === true)
        .map((u) => ({
          id: u.id,
          username: u.email ?? "",
          effectiveEmail: u.user_metadata?.contactEmail || u.email || "",
        }));
      return res.json({ subscribers });
    } catch (err: any) {
      console.error("[dispatch/subscribers] Error:", err);
      return res.status(500).json({ error: err.message ?? "Failed to load subscribers" });
    }
  });

  app.get("/api/admin/dispatch/subscriber-matches", async (req, res) => {
    try {
      const windowHours = Math.max(1, Math.min(8760, Number(req.query.windowHours) || 168));
      const [profileMatches, supabaseSubscribers, windowSummary] = await Promise.all([
        storage.getSubscriberMatches(windowHours),
        (async () => {
          if (!supabaseServiceRoleKey || !supabaseUrl) return [] as Array<{ id: string; email: string }>;
          const { createClient } = await import("@supabase/supabase-js");
          const adminSupabase = createClient(supabaseUrl, supabaseServiceRoleKey);
          const { data } = await adminSupabase.auth.admin.listUsers({ perPage: 500 });
          return (data?.users ?? [])
            .filter((u) => u.user_metadata?.subscribedToDigest === true)
            .map((u) => ({ id: u.id, email: u.user_metadata?.contactEmail || u.email || "" }));
        })(),
        storage.getWindowAssetSummary(windowHours),
      ]);
      const profileByUserId = new Map(profileMatches.map((m) => [m.userId, m]));
      const subscribers = supabaseSubscribers.map((s) => {
        const profile = profileByUserId.get(s.id);
        return profile
          ? { ...profile, email: s.email }
          : { userId: s.id, email: s.email, companyName: null, therapeuticAreas: [], modalities: [], dealStages: [], totalMatches: windowSummary.totalCount, top5AssetIds: windowSummary.top5Ids };
      }).sort((a, b) => b.totalMatches - a.totalMatches);
      return res.json({ subscribers, windowHours });
    } catch (err: any) {
      console.error("[dispatch/subscriber-matches]", err);
      return res.status(500).json({ error: err.message ?? "Failed" });
    }
  });

  app.get("/api/admin/dispatch/suggestions/:userId", async (req, res) => {
    try {
      const { userId } = req.params;
      if (!userId) return res.status(400).json({ error: "userId required" });
      const windowHours = Math.max(1, Math.min(8760, Number(req.query.windowHours) || 168));
      const assets = await storage.getSubscriberSuggestions(userId, windowHours);
      return res.json({ assets, windowHours });
    } catch (err: any) {
      console.error("[dispatch/suggestions]", err);
      return res.status(500).json({ error: err.message ?? "Failed" });
    }
  });

  app.get("/api/admin/dispatch/history", async (req, res) => {
    try {
      const history = await storage.getDispatchHistory(30);
      return res.json({ history });
    } catch (err: any) {
      console.error("[dispatch/history] Error:", err);
      return res.status(500).json({ error: err.message ?? "Failed to load history" });
    }
  });

  app.get("/api/admin/all-institutions", async (req, res) => {
    try {
      const institutions = await storage.getAllInstitutionNames();
      return res.json({ institutions });
    } catch (err: any) {
      console.error("[all-institutions] Error:", err);
      return res.status(500).json({ error: err.message ?? "Failed to load institutions" });
    }
  });


  app.get("/api/admin/platform-stats", async (req, res) => {
    try {
      const stats = await storage.getPlatformStats();
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch platform stats" });
    }
  });

  app.get("/api/admin/duplicate-candidates", async (req, res) => {
    try {
      const candidates = await storage.getDuplicateCandidates();
      res.json({ candidates, total: candidates.length });
    } catch (err: any) {
      console.error("[duplicate-candidates] Error:", err);
      res.status(500).json({ error: err.message ?? "Failed to load duplicate candidates" });
    }
  });

  app.post("/api/admin/duplicate-candidates/:id/dismiss", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      await storage.dismissDuplicateCandidate(id);
      res.json({ ok: true });
    } catch (err: any) {
      console.error("[duplicate-candidates/dismiss] Error:", err);
      res.status(500).json({ error: err.message ?? "Failed to dismiss duplicate" });
    }
  });

  app.post("/api/admin/duplicate-candidates/dismiss-all", async (req, res) => {
    try {
      const institution = (req.body as any)?.institution as string | undefined;
      const count = await storage.dismissAllDuplicateCandidates(institution);
      res.json({ ok: true, dismissed: count });
    } catch (err: any) {
      console.error("[duplicate-candidates/dismiss-all] Error:", err);
      res.status(500).json({ error: err.message ?? "Failed to bulk-dismiss duplicates" });
    }
  });

  app.post("/api/admin/duplicate-detection/run", async (req, res) => {
    try {
      const result = await storage.runNearDuplicateDetection((msg) => console.log(`[dedup] ${msg}`));
      res.json(result);
    } catch (err: any) {
      console.error("[duplicate-detection/run] Error:", err);
      res.status(500).json({ error: err.message ?? "Failed to run duplicate detection" });
    }
  });

  app.get("/api/admin/assets/export-csv", async (req, res) => {
    try {

      function csvEscape(val: unknown): string {
        if (val === null || val === undefined) return "";
        let s = Array.isArray(val) ? JSON.stringify(val) : String(val);
        // Neutralize CSV formula injection: prefix dangerous leading chars with a tab
        if (s.length > 0 && (s[0] === "=" || s[0] === "+" || s[0] === "-" || s[0] === "@" || s[0] === "|" || s[0] === "%")) {
          s = "\t" + s;
        }
        if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\t")) {
          return '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
      }

      const HEADERS = ["id","assetName","institution","summary","abstract","target","modality","indication","developmentStage","categories","mechanismOfAction","innovationClaim","unmetNeed","comparableDrugs","licensingReadiness","ipType","completenessScore"];

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="enrichment-${new Date().toISOString().slice(0,10)}.csv"`);
      res.write(HEADERS.join(",") + "\n");

      // Stream rows in batches of 1000 to avoid loading full dataset into memory
      const BATCH = 1000;
      let offset = 0;
      while (true) {
        const batch = await db
          .select({
            id: ingestedAssets.id,
            assetName: ingestedAssets.assetName,
            institution: ingestedAssets.institution,
            summary: ingestedAssets.summary,
            abstract: ingestedAssets.abstract,
            target: ingestedAssets.target,
            modality: ingestedAssets.modality,
            indication: ingestedAssets.indication,
            developmentStage: ingestedAssets.developmentStage,
            categories: ingestedAssets.categories,
            mechanismOfAction: ingestedAssets.mechanismOfAction,
            innovationClaim: ingestedAssets.innovationClaim,
            unmetNeed: ingestedAssets.unmetNeed,
            comparableDrugs: ingestedAssets.comparableDrugs,
            licensingReadiness: ingestedAssets.licensingReadiness,
            ipType: ingestedAssets.ipType,
            completenessScore: ingestedAssets.completenessScore,
          })
          .from(ingestedAssets)
          .orderBy(ingestedAssets.id)
          .limit(BATCH)
          .offset(offset);

        for (const r of batch) {
          res.write([
            r.id, csvEscape(r.assetName), csvEscape(r.institution), csvEscape(r.summary),
            csvEscape(r.abstract), csvEscape(r.target), csvEscape(r.modality), csvEscape(r.indication),
            csvEscape(r.developmentStage), csvEscape(r.categories), csvEscape(r.mechanismOfAction),
            csvEscape(r.innovationClaim), csvEscape(r.unmetNeed), csvEscape(r.comparableDrugs),
            csvEscape(r.licensingReadiness), csvEscape(r.ipType), csvEscape(r.completenessScore),
          ].join(",") + "\n");
        }

        offset += batch.length;
        if (batch.length < BATCH) break;
      }

      res.end();
    } catch (err: any) {
      console.error("[export-csv] Error:", err);
      if (!res.headersSent) res.status(500).json({ error: err.message ?? "Export failed" });
      else res.end();
    }
  });

  app.post("/api/admin/assets/bulk-update", async (req, res) => {
    try {

      const rowSchema = z.object({
        id: z.number().int(),
        assetName: z.string().optional(),
        institution: z.string().optional(),
        summary: z.string().optional(),
        abstract: z.string().optional(),
        target: z.string().optional(),
        modality: z.string().optional(),
        indication: z.string().optional(),
        developmentStage: z.string().optional(),
        categories: z.array(z.string()).optional(),
        mechanismOfAction: z.string().optional(),
        innovationClaim: z.string().optional(),
        unmetNeed: z.string().optional(),
        comparableDrugs: z.string().optional(),
        licensingReadiness: z.string().optional(),
        ipType: z.string().optional(),
        completenessScore: z.number().optional(),
      });

      // Accept a raw JSON array of rows
      const body = req.body;
      if (!Array.isArray(body)) {
        return res.status(400).json({ error: "Request body must be a JSON array of row objects" });
      }
      if (body.length === 0 || body.length > 50000) {
        return res.status(400).json({ error: `Array must have 1-50000 rows (got ${body.length})` });
      }

      // Per-row validation — invalid rows are skipped, not batch-fatal
      const validRows: z.infer<typeof rowSchema>[] = [];
      const skippedDetails: Array<{ index: number; id?: number; reason: string }> = [];
      for (let idx = 0; idx < body.length; idx++) {
        const parsed = rowSchema.safeParse(body[idx]);
        if (!parsed.success) {
          skippedDetails.push({ index: idx, id: body[idx]?.id, reason: parsed.error.issues.map((i: z.ZodIssue) => i.message).join("; ") });
        } else {
          validRows.push(parsed.data);
        }
      }

      const result = validRows.length > 0
        ? await storage.bulkUpdateAssetsFromCsv(validRows)
        : { updated: 0, skipped: 0, notFoundIds: [] as number[] };

      // Merge unknown-ID skips into skippedDetails
      const notFoundDetails = result.notFoundIds.map((id) => ({
        index: -1 as number,
        id,
        reason: "ID not found in database",
      }));
      const allSkipped = [...skippedDetails, ...notFoundDetails];

      res.json({
        ok: true,
        updated: result.updated,
        skipped: result.skipped + skippedDetails.length,
        validationSkipped: skippedDetails.length,
        notFoundCount: result.notFoundIds.length,
        skippedDetails: allSkipped.slice(0, 100),
      });
    } catch (err: any) {
      console.error("[bulk-update] Error:", err);
      res.status(500).json({ error: err.message ?? "Bulk update failed" });
    }
  });

  const DEFAULT_INDUSTRY_PROFILE = {
    userName: "", companyName: "", companyType: "",
    therapeuticAreas: [], dealStages: [], modalities: [], onboardingDone: false,
  };

  app.get("/api/industry/profile", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const userRole = req.headers["x-user-role"] as string;
      if (!userId) return res.status(400).json({ error: "Missing user id" });
      if (userRole !== "industry") return res.status(403).json({ error: "Industry role required" });
      const profile = await storage.getIndustryProfileByUserId(userId);
      return res.json({ profile: profile ?? DEFAULT_INDUSTRY_PROFILE });
    } catch (err: any) {
      console.error("[industry/profile GET]", err);
      return res.status(500).json({ error: "Failed to load profile" });
    }
  });

  app.put("/api/industry/profile", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const userRole = req.headers["x-user-role"] as string;
      if (!userId) return res.status(400).json({ error: "Missing user id" });
      if (userRole !== "industry") return res.status(403).json({ error: "Industry role required" });
      const schema = z.object({
        userName: z.string().default(""),
        companyName: z.string().default(""),
        companyType: z.string().default(""),
        therapeuticAreas: z.array(z.string()).default([]),
        dealStages: z.array(z.string()).default([]),
        modalities: z.array(z.string()).default([]),
        onboardingDone: z.boolean().default(false),
        notificationPrefs: z.object({ matchAlerts: z.enum(["off", "daily", "frequent"]), weeklyRecap: z.boolean() }).nullable().default(null),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
      }
      const isNewProfile = !(await storage.getIndustryProfileByUserId(userId));
      const profile = await storage.upsertIndustryProfile(userId, parsed.data);
      if (isNewProfile && supabaseServiceRoleKey && supabaseUrl) {
        (async () => {
          try {
            const { createClient } = await import("@supabase/supabase-js");
            const adminSupabase = createClient(supabaseUrl, supabaseServiceRoleKey);
            const { data: authUser } = await adminSupabase.auth.admin.getUserById(userId);
            const email = authUser?.user?.email;
            if (email) {
              await sendWelcomeEmail(email, profile.userName ?? "");
            }
          } catch (emailErr) {
            console.error("[email] Welcome email failed:", emailErr);
          }
        })();
      }
      return res.json({ profile });
    } catch (err: any) {
      console.error("[industry/profile PUT]", err);
      return res.status(500).json({ error: "Failed to save profile" });
    }
  });

  app.get("/api/admin/industry-profiles", async (req, res) => {
    try {
      const profiles = await storage.getAllIndustryProfiles();
      return res.json({ profiles });
    } catch (err: any) {
      console.error("[admin/industry-profiles]", err);
      return res.status(500).json({ error: "Failed to load profiles" });
    }
  });



  app.post("/api/admin/alerts/dispatch", async (req, res) => {
    try {
      const { runAlertDispatch } = await import("../lib/alertDispatch.js");
      const result = await runAlertDispatch();
      return res.json({ ok: true });
    } catch (err: any) {
      console.error("[admin/alerts/dispatch]", err);
      return res.status(500).json({ error: err.message ?? "Dispatch failed" });
    }
  });
  app.post("/api/admin/invites/purge-expired", requireAdmin, async (req, res) => {
    try {
      const removed = await storage.purgeExpiredPendingInvites(48);
      res.json({ ok: true, removed });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Purge failed" });
    }
  });
}
