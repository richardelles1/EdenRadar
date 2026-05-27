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

export async function registerImpersonationRoutes(app: Express): Promise<void> {
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

}