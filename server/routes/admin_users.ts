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

export function registerUserRoutes(app: Express): void {
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
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

}