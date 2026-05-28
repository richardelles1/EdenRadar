import crypto from "crypto";
import type { Express } from "express";
import { db } from "../db";
import { eq, and, sql, desc } from "drizzle-orm";
import { storage } from "../storage";
import { ingestedAssets } from "@shared/schema";
import { requireAdmin, getAdminUser } from "../lib/supabaseAuth";
import { getSourceHealthEntries, type SourceKey } from "../lib/sources/index";
import { ALL_SCRAPERS, getScraperTier } from "../lib/scrapers/index";
import { runIngestionPipeline, isIngestionRunning, getEnrichingCount, getScrapingProgress, getUpsertProgress, isSyncRunning, getSyncRunningFor, getActiveSyncs, runInstitutionSync, tryAcquireSyncLock, releaseSyncLock, runScrapedFieldRefresh } from "../lib/ingestion";
import { getSchedulerStatus, startScheduler, pauseScheduler, resetAndStartScheduler, bumpToFront, setDelay, invalidateHealthCacheEntry, startTierOnly, startStalenessFirstScan, startDailySweep, setConcurrency, getMaxHttpConcurrent, getScraperHealthCache, cancelCurrentSync, isTransientDbError } from "../lib/scheduler";
import { getAllScraperHealth, clearScraperBackoff, updateScraperHealth } from "../lib/scraperState";

export function registerIngestRoutes(app: Express): void {
  app.get("/api/scrapers/active", (_req, res) => {
    res.json({ institutions: ALL_SCRAPERS.map((s) => s.institution) });
  });


  app.post("/api/ingest/run", requireAdmin, async (_req, res) => {
    if (isIngestionRunning()) {
      const lastRun = await storage.getLastIngestionRun();
      return res.json({ message: "Ingestion already in progress", status: "running", runId: lastRun?.id });
    }
    if (isSyncRunning()) {
      return res.status(409).json({ error: `Institution sync is running for ${getSyncRunningFor()} — cannot start full ingestion` });
    }
    res.json({ message: "Ingestion started" });
    runIngestionPipeline().catch((err) => {
      console.error("[ingestion] Background run failed:", err);
    });
  });

  app.get("/api/ingest/status", async (_req, res) => {
    try {
      const lastRun = await storage.getLastIngestionRun();
      if (!lastRun) {
        return res.json({ status: "never_run", totalFound: 0, newCount: 0, ranAt: null });
      }
      const running = isIngestionRunning();
      return res.json({
        ...lastRun,
        status: running ? "running" : lastRun.status,
        enrichingCount: getEnrichingCount(),
        scrapingProgress: getScrapingProgress(),
        upsertProgress: getUpsertProgress(),
        syncRunning: isSyncRunning(),
        syncRunningFor: getSyncRunningFor(),
      });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch status" });
    }
  });

  app.get("/api/ingest/history", requireAdmin, async (req, res) => {
    try {
      const runs = await storage.getIngestionRunHistory(5);
      res.json(runs);
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/ingest/delta", async (_req, res) => {
    try {
      const lastRun = await storage.getLastIngestionRun();
      if (!lastRun || lastRun.status !== "completed") {
        return res.json({ runId: null, ranAt: null, totalNew: 0, byInstitution: [] });
      }
      const byInstitution = await storage.getIngestionDelta(lastRun.ranAt);
      const totalNew = byInstitution.reduce((sum, row) => sum + row.count, 0);
      return res.json({ runId: lastRun.id, ranAt: lastRun.ranAt, totalNew, byInstitution });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch delta" });
    }
  });

  app.get("/api/ingest/sync/sessions", requireAdmin, async (req, res) => {
    try {

      const sessions = await storage.getLatestSyncSessions();
      res.json({ sessions });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch sync sessions" });
    }
  });

  app.get("/api/ingest/sync-global-status", requireAdmin, async (req, res) => {
    res.json({
      syncRunning: isSyncRunning(),
      syncRunningFor: getSyncRunningFor(),
      ingestionRunning: isIngestionRunning(),
    });
  });

  app.get("/api/ingest/scheduler/status", requireAdmin, async (req, res) => {
    res.json(getSchedulerStatus());
  });

  app.post("/api/ingest/scheduler/start", requireAdmin, async (req, res) => {
    const result = startScheduler();
    res.json(result);
  });

  app.post("/api/ingest/scheduler/pause", requireAdmin, async (req, res) => {
    try {
      const result = await pauseScheduler();
      res.json(result);
    } catch (err: any) {
      console.error(`[scheduler] Pause DB write failed: ${err?.message}`);
      res.status(500).json({ error: "Pause succeeded in-memory but failed to persist â€” restart risk remains", detail: err?.message });
    }
  });

  app.post("/api/ingest/scheduler/reset", requireAdmin, async (req, res) => {
    const result = resetAndStartScheduler();
    res.json({ ...result, status: getSchedulerStatus() });
  });

  app.post("/api/ingest/scheduler/run-tier", requireAdmin, async (req, res) => {
    const { tier } = req.body ?? {};
    if (![1, 2, 3, 4].includes(tier)) return res.status(400).json({ error: "tier must be 1, 2, 3, or 4" });
    const result = startTierOnly(tier as 1 | 2 | 3 | 4);
    res.json({ ...result, status: getSchedulerStatus() });
  });

  app.post("/api/ingest/scheduler/stale-first", requireAdmin, async (req, res) => {
    try {
      const result = await startStalenessFirstScan();
      res.json({ ...result, status: getSchedulerStatus() });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to start staleness-first scan" });
    }
  });

  app.post("/api/ingest/scheduler/daily-sweep", requireAdmin, async (req, res) => {
    try {
      const result = await startDailySweep();
      res.json({ ...result, status: getSchedulerStatus() });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to start daily sweep" });
    }
  });

  app.post("/api/ingest/scheduler/bump", requireAdmin, async (req, res) => {
    const { institution } = req.body ?? {};
    if (!institution) return res.status(400).json({ error: "institution is required" });
    const result = bumpToFront(institution);
    res.json(result);
  });

  app.post("/api/ingest/scheduler/delay", requireAdmin, async (req, res) => {
    const { delayMs } = req.body ?? {};
    if (typeof delayMs !== "number") return res.status(400).json({ error: "delayMs (number) is required" });
    const result = setDelay(delayMs);
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  });

  app.post("/api/ingest/scheduler/concurrency", requireAdmin, async (req, res) => {
    const { concurrency } = req.body ?? {};
    if (concurrency !== 1 && concurrency !== 2 && concurrency !== 3) return res.status(400).json({ error: "concurrency must be 1, 2, or 3" });
    setConcurrency(concurrency as 1 | 2 | 3);
    res.json({ ok: true, message: `Concurrency set to ${concurrency}`, concurrency });
  });

  app.get("/api/admin/scraper-health", async (req, res) => {
    try {
      const rows = await getAllScraperHealth();
      const now = Date.now();
      const enriched = rows.map((r) => ({
        ...r,
        lastFailureAt: r.lastFailureAt?.toISOString() ?? null,
        lastSuccessAt: r.lastSuccessAt?.toISOString() ?? null,
        backoffUntil: r.backoffUntil?.toISOString() ?? null,
        inBackoff: r.backoffUntil ? r.backoffUntil.getTime() > now : false,
      }));
      res.json({ rows: enriched, total: enriched.length, inBackoff: enriched.filter((r) => r.inBackoff).length });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch scraper health" });
    }
  });

  app.post("/api/admin/scraper-health/:institution/clear-backoff", async (req, res) => {
    try {
      const institution = decodeURIComponent(String(req.params.institution));
      await clearScraperBackoff(institution);
      invalidateHealthCacheEntry(institution);  // immediate effect on scheduling decisions
      res.json({ ok: true, message: `Backoff cleared for ${institution}` });
    } catch (err: any) {
      res.status(500).json({ error: "Clear backoff failed" });
    }
  });

  app.post("/api/ingest/sync/:institution/cancel", requireAdmin, async (req, res) => {
    try {

      const institution = decodeURIComponent(String(req.params.institution));
      const sessions = await storage.getLatestSyncSessions();
      const session = sessions.find((s) => s.institution === institution && s.status === "running");

      if (!session) return res.status(404).json({ error: "No running session found for this institution" });

      await storage.updateSyncSession(session.sessionId, {
        status: "failed",
        phase: "done",
        completedAt: new Date(),
        errorMessage: "Cancelled by admin (stale session)",
      });

      releaseSyncLock(institution);
      cancelCurrentSync(institution);

      res.json({ ok: true, message: `Sync for ${institution} cancelled` });
    } catch (err: any) {
      res.status(500).json({ error: "Cancel failed" });
    }
  });

  app.post("/api/ingest/sync/:institution", requireAdmin, async (req, res) => {
    try {

      const institution = decodeURIComponent(String(req.params.institution));
      if (isIngestionRunning()) return res.status(409).json({ error: "Full ingestion is running â€” cannot sync" });

      const scraper = ALL_SCRAPERS.find((s) => s.institution === institution);
      if (!scraper) return res.status(404).json({ error: `No scraper found for: ${institution}` });

      const scraperType = (scraper.scraperType === "stub" ? "http" : (scraper.scraperType ?? "http")) as "playwright" | "http" | "api";
      if (!tryAcquireSyncLock(institution, scraperType)) {
        return res.status(409).json({ error: `Sync already running or lock unavailable for ${getSyncRunningFor()}` });
      }

      const sessionId = crypto.randomUUID();
      res.json({ message: "Sync started", institution, sessionId });

      runInstitutionSync(institution, sessionId)
        .then((result) => {
          updateScraperHealth(institution, true, undefined, result.newCount, result.rawCount).catch(() => {});
          invalidateHealthCacheEntry(institution, { newCount: result.newCount, rawCount: result.rawCount });
        })
        .catch((err) => {
          const msg = err?.message ?? "";
          console.error(`[sync] Background sync failed for ${institution}:`, msg);
          if (!isTransientDbError(msg)) {
            updateScraperHealth(institution, false, msg).catch(() => {});
          }
        });
    } catch (err: any) {
      res.status(500).json({ error: "Sync failed" });
    }
  });

  app.get("/api/ingest/sync/:institution/status", requireAdmin, async (req, res) => {
    try {

      const institution = decodeURIComponent(String(req.params.institution));
      const sessions = await storage.getLatestSyncSessions();
      const session = sessions.find((s) => s.institution === institution);

      if (!session) return res.json({ found: false });

      const stagingRows = session.status !== "running"
        ? await storage.getSyncStagingRows(session.sessionId)
        : [];

      const currentIndexed = await storage.getInstitutionIndexedCount(institution);

      res.json({
        found: true,
        session: {
          ...session,
          currentIndexed,
        },
        newEntries: stagingRows
          .filter((r) => r.isNew && r.relevant === true)
          .map((r) => ({
            assetName: r.assetName,
            sourceUrl: r.sourceUrl,
            target: r.target,
            modality: r.modality,
            indication: r.indication,
            developmentStage: r.developmentStage,
            firstSeenAt: r.createdAt,
          })),
        syncRunning: isSyncRunning(),
        syncRunningFor: getSyncRunningFor(),
      });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch sync status" });
    }
  });

  app.get("/api/ingest/sync/:institution/history", requireAdmin, async (req, res) => {
    try {
      const institution = decodeURIComponent(String(req.params.institution));
      const sessions = await storage.getInstitutionSyncHistory(institution, 5);
      res.json({ sessions });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch sync history" });
    }
  });

  app.post("/api/ingest/sync/:institution/push", requireAdmin, async (req, res) => {
    try {

      const institution = decodeURIComponent(String(req.params.institution));
      const sessions = await storage.getLatestSyncSessions();
      const session = sessions.find((s) => s.institution === institution);

      if (!session) return res.status(404).json({ error: "No sync session found" });
      if (session.status === "pushed") return res.status(400).json({ error: "Already pushed" });
      if (session.status !== "enriched") return res.status(400).json({ error: `Session not ready for push (status: ${session.status})` });
      if (session.rawCount === 0) return res.status(400).json({ error: "Cannot push â€” scraper returned 0 results. The site was likely rate-limited or unreachable during the sync. Run a manual scrape to retry." });

      const stagingRows = await storage.getSyncStagingRows(session.sessionId);
      const toPush = stagingRows.filter((r) => r.isNew && r.relevant === true);

      if (toPush.length === 0) {
        await storage.updateSyncSession(session.sessionId, { pushedCount: 0, contentUpdated: 0, status: "pushed", lastRefreshedAt: new Date() });
        return res.json({ pushed: 0, contentUpdated: 0, message: "No new relevant assets to push" });
      }

      const { newAssets, contentUpdated } = await storage.bulkUpsertIngestedAssets(
        toPush.map((r) => ({
          fingerprint: r.fingerprint,
          assetName: r.assetName,
          institution: r.institution,
          summary: r.summary,
          sourceUrl: r.sourceUrl,
          sourceType: "tech_transfer" as const,
          developmentStage: r.developmentStage,
          target: r.target,
          modality: r.modality,
          indication: r.indication,
          relevant: true,
          runId: 0,
          abstract: r.abstract || null,
          inventors: r.inventors && r.inventors.length > 0 ? r.inventors : null,
          patentStatus: r.patentStatus || null,
          licensingStatus: r.licensingStatus || null,
          categories: r.categories && r.categories.length > 0 ? r.categories : null,
          contactEmail: r.contactEmail || null,
          technologyId: r.technologyId || null,
        }))
      );

      for (const asset of newAssets) {
        const staged = toPush.find((r) => r.fingerprint === asset.fingerprint);
        if (staged) {
          await storage.updateIngestedAssetEnrichment(asset.id, {
            target: staged.target,
            modality: staged.modality,
            indication: staged.indication,
            developmentStage: staged.developmentStage,
            biotechRelevant: true,
          });
          await storage.stampEnrichedAt(asset.id);
        }
      }

      await storage.updateSyncStagingStatus(session.sessionId, "pushed", true, true);
      await storage.updateSyncStagingStatus(session.sessionId, "skipped", false);
      const skippedNonRelevant = await storage.updateSyncStagingStatus(session.sessionId, "skipped", true, false);

      await storage.updateSyncSession(session.sessionId, {
        pushedCount: newAssets.length,
        contentUpdated,
        status: "pushed",
        lastRefreshedAt: new Date(),
      });

      res.json({
        pushed: newAssets.length,
        contentUpdated,
        skipped: skippedNonRelevant,
        message: `Pushed ${newAssets.length} new assets to index`,
      });
    } catch (err: any) {
      res.status(500).json({ error: "Push failed" });
    }
  });

  // â"€â"€ Refresh scraped fields for an institution (Task #881 / #946) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  // Re-runs the scraper and null-fills rich fields on already-indexed assets
  // without touching the sync staging pipeline or new-asset detection.
  // Assets whose content grew substantially have enrichedAt reset so they will
  // be picked up by the next enrichment run; this endpoint does not start
  // enrichment itself â€” use the /api/admin/enrichment/start endpoint for that.
  app.post("/api/ingest/sync/:institution/refresh-scraped-fields", requireAdmin, async (req, res) => {
    const institution = decodeURIComponent(String(req.params.institution));
    try {
      const result = await runScrapedFieldRefresh(institution);

      const parts: string[] = [`Checked ${result.checked} assets â€” ${result.fieldsUpdated} fields filled`];
      if (result.queuedRelevant > 0) {
        parts.push(`${result.queuedRelevant} relevant asset${result.queuedRelevant !== 1 ? "s" : ""} queued for AI enrichment`);
        if (result.queuedTotal > result.queuedRelevant) {
          parts.push(`${result.queuedTotal - result.queuedRelevant} non-relevant skipped`);
        }
      } else if (result.queuedTotal > 0) {
        parts.push(`${result.queuedTotal} reset (none are biotech-relevant)`);
      }

      res.json({
        ...result,
        message: parts.join(" Â· "),
      });
    } catch (err: any) {
      console.error(`[refresh-scraped-fields] ${institution}: ${err.message}`);
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
