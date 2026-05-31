import crypto from "crypto";
import type { Express } from "express";
import { z } from "zod";
import { db } from "../db";
import { eq, and, ne, desc, inArray, sql } from "drizzle-orm";
import { storage, insertAdminEvent } from "../storage";
import type { RetrievedAsset } from "../storage";
import {
  industryProfiles,
  emailUnsubscribes,
  sharedLinks,
  apiKeys,
  apiUsageLogs,
  apiKeyAuditLog,
  API_TIER_CONFIG,
  apiRateLimitWindows,
  ingestedAssets,
} from "@shared/schema";
import { verifyAnyAuth, tryGetUserId, requireAdmin, getAdminUser } from "../lib/supabaseAuth";
import { backfillDefaultAlerts } from "../lib/alertMailer";
import { requireApiKey } from "../lib/apiKeyAuth";
import {
  verifyUnsubscribeToken,
  verifyUnsubscribeTokenForEmail,
} from "../email";

// ── Export rate-limiting state ─────────────────────────────────────────────
const EXPORT_RATE_WINDOW_MS = 60_000;
const EXPORT_RATE_MAX = 20; // per user, per minute
const exportRateBuckets = new Map<string, { count: number; resetAt: number }>();
function rateLimitOk(userId: string): boolean {
  const now = Date.now();
  const bucket = exportRateBuckets.get(userId);
  if (!bucket || now > bucket.resetAt) {
    exportRateBuckets.set(userId, { count: 1, resetAt: now + EXPORT_RATE_WINDOW_MS });
    return true;
  }
  if (bucket.count >= EXPORT_RATE_MAX) return false;
  bucket.count += 1;
  return true;
}

// ── Export helpers ─────────────────────────────────────────────────────────
const exportBodySchema = z.object({
  filename: z.string().min(1).max(200),
  fileType: z.string().min(1).max(50).default("document"),
  content: z.string().min(1),
  campaignSlug: z.string().min(1).max(120).regex(/^[a-z0-9][a-z0-9._-]*$/i).optional(),
});

const MAX_EXPORT_BYTES = 8 * 1024 * 1024;

function folderForFileType(fileType: string, campaignSlug?: string): string {
  const t = fileType.toLowerCase();
  if (t === "ad-campaign" && campaignSlug) return `EdenRadar/Ads/${campaignSlug}`;
  if (t === "csv" || t === "xlsx" || t === "export") return "EdenRadar/Exports";
  if (t === "template" || t === "email") return "EdenRadar/Templates";
  return "EdenRadar/Documents";
}

// ── V1 API helpers ─────────────────────────────────────────────────────────
function formatV1Asset(a: RetrievedAsset) {
  return {
    id: a.id,
    name: a.assetName,
    target: a.target ?? null,
    modality: a.modality ?? null,
    indication: a.indication ?? null,
    stage: a.developmentStage,
    institution: a.institution,
    summary: a.summary ?? null,
    mechanism_of_action: a.mechanismOfAction ?? null,
    ip_type: a.ipType ?? null,
    licensing_readiness: a.licensingReadiness ?? null,
    source_url: a.sourceUrl ?? null,
    completeness_score: a.completenessScore ?? null,
    last_seen_at: a.lastSeenAt ?? null,
  };
}

const v1AssetSearchSchema = z.object({
  q: z.string().min(1).max(300),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  modality: z.string().optional(),
  stage: z.string().optional(),
  indication: z.string().optional(),
  institution: z.string().optional(),
});

export function registerMiscRoutes(app: Express): void {

  // ── Public system status ───────────────────────────────────────────────
  app.get("/api/status", async (_req, res) => {
    const t0 = Date.now();

    // DB latency + pipeline data — single query, uses the new partial indexes
    const [dbResult, alertResult] = await Promise.allSettled([
      (async (): Promise<{ latencyMs: number; total_assets: number | null; last_indexed_at: string | null; indexed_7d: number | null }> => {
        const t = Date.now();
        const row = await db.execute(sql`
          SELECT
            COUNT(*)::int                              AS total_assets,
            MAX(first_seen_at)                         AS last_indexed_at,
            COUNT(*) FILTER (WHERE first_seen_at >= NOW() - INTERVAL '7 days')::int AS indexed_7d
          FROM ingested_assets WHERE relevant = true
        `);
        const r = row.rows[0] as Record<string, unknown>;
        return {
          latencyMs: Date.now() - t,
          total_assets: r.total_assets != null ? Number(r.total_assets) : null,
          last_indexed_at: r.last_indexed_at ? String(r.last_indexed_at) : null,
          indexed_7d: r.indexed_7d != null ? Number(r.indexed_7d) : null,
        };
      })(),
      (async () => {
        const row = await db.execute(sql`
          SELECT MAX(sent_at) AS last_sent_at FROM alert_emails LIMIT 1
        `).catch(() => ({ rows: [{}] }));
        return row.rows[0] as Record<string, unknown>;
      })(),
    ]);

    const dbMs = dbResult.status === "fulfilled" ? (dbResult.value.latencyMs as number) : null;
    const totalAssets = dbResult.status === "fulfilled" ? (dbResult.value.total_assets as number) : null;
    const lastIndexedAt = dbResult.status === "fulfilled" ? (dbResult.value.last_indexed_at as string | null) : null;
    const indexed7d = dbResult.status === "fulfilled" ? (dbResult.value.indexed_7d as number) : null;
    const lastAlertAt = alertResult.status === "fulfilled" ? (alertResult.value.last_sent_at as string | null) : null;

    const openaiOk = !!process.env.OPENAI_API_KEY;

    res.json({
      status: "operational",
      checkedAt: new Date().toISOString(),
      responseMs: Date.now() - t0,
      database: { status: dbResult.status === "fulfilled" ? "operational" : "degraded", latencyMs: dbMs },
      pipeline: { status: "operational", totalAssets, lastIndexedAt, indexed7d },
      alerts: { status: "operational", lastSentAt: lastAlertAt },
      embedding: { status: openaiOk ? "operational" : "degraded" },
    });
  });

  // ── Unsubscribe helpers ────────────────────────────────────────────────

  async function handleUnsubscribe(token: string): Promise<{ ok: boolean; alreadyUnsubscribed?: boolean; error?: string }> {
    // Email-keyed token (admin manual dispatch recipients with no Eden account)
    const email = verifyUnsubscribeTokenForEmail(token);
    if (email) {
      try {
        const already = await db.select({ email: emailUnsubscribes.email })
          .from(emailUnsubscribes).where(eq(emailUnsubscribes.email, email)).limit(1);
        if (already.length > 0) {
          return { ok: true, alreadyUnsubscribed: true };
        }
        await db.insert(emailUnsubscribes).values({ email }).onConflictDoNothing();
        void (async () => {
          try {
            const sbUrl = process.env.VITE_SUPABASE_URL ?? "";
            const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
            if (!sbUrl || !sbKey) return;
            const { createClient } = await import("@supabase/supabase-js");
            const sb = createClient(sbUrl, sbKey);
            let matchedId: string | null = null;
            for (let page = 1; page <= 50 && !matchedId; page++) {
              const { data } = await sb.auth.admin.listUsers({ page, perPage: 200 });
              const users = data?.users ?? [];
              matchedId = users.find(u => (u.email ?? "").toLowerCase() === email)?.id ?? null;
              if (users.length < 200) break;
            }
            if (matchedId) {
              await db.insert(industryProfiles).values({ userId: matchedId, subscribedToDigest: false })
                .onConflictDoUpdate({ target: industryProfiles.userId, set: { subscribedToDigest: false } });
            }
          } catch (syncErr: any) {
            console.warn("[unsubscribe] best-effort account sync failed:", syncErr?.message);
          }
        })();
        console.log(`[unsubscribe] Email ${email} added to email_unsubscribes via token link`);
        return { ok: true };
      } catch (err: any) {
        console.error("[unsubscribe] email-token error:", err?.message);
        return { ok: false, error: "Could not process unsubscribe" };
      }
    }
    const userId = verifyUnsubscribeToken(token);
    if (!userId) return { ok: false, error: "Invalid or expired unsubscribe link" };
    try {
      const existing = await db.select({ subscribedToDigest: industryProfiles.subscribedToDigest })
        .from(industryProfiles).where(eq(industryProfiles.userId, userId)).limit(1);
      if (existing.length === 0) {
        await db.insert(industryProfiles).values({ userId, subscribedToDigest: false }).onConflictDoNothing();
        return { ok: true };
      }
      if (!existing[0].subscribedToDigest) return { ok: true, alreadyUnsubscribed: true };
      await db.update(industryProfiles).set({ subscribedToDigest: false }).where(eq(industryProfiles.userId, userId));
      console.log(`[unsubscribe] User ${userId} unsubscribed via token link`);
      return { ok: true };
    } catch (err: any) {
      console.error("[unsubscribe] Error:", err?.message);
      return { ok: false, error: "Could not process unsubscribe" };
    }
  }

  app.post("/api/digest/unsubscribe", async (req, res) => {
    const token = (req.body?.token ?? req.query?.t ?? "") as string;
    const result = await handleUnsubscribe(token);
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  });

  // RFC 8058 one-click unsubscribe (Gmail/Yahoo bulk-sender requirement).
  app.post("/unsubscribe", async (req, res) => {
    const token = (req.query?.t ?? req.body?.t ?? "") as string;
    const result = await handleUnsubscribe(token);
    if (!result.ok) return res.status(400).send(result.error ?? "Invalid request");
    res.send("Unsubscribed");
  });

  // ── Users ──────────────────────────────────────────────────────────────

  app.patch("/api/users/subscribe", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      if (!userId) return res.status(400).json({ error: "Missing user id" });
      const schema = z.object({ subscribedToDigest: z.boolean() });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid body" });
      const { subscribedToDigest } = parsed.data;
      const sbUrl = process.env.VITE_SUPABASE_URL ?? "";
      const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
      if (!sbUrl || !sbKey) return res.status(500).json({ error: "Supabase not configured" });
      const { createClient } = await import("@supabase/supabase-js");
      const admin = createClient(sbUrl, sbKey);
      const { data: existing, error: fetchErr } = await admin.auth.admin.getUserById(userId);
      if (fetchErr || !existing?.user) return res.status(404).json({ error: "User not found" });
      const { data, error } = await admin.auth.admin.updateUserById(userId, {
        user_metadata: { ...existing.user.user_metadata, subscribedToDigest },
      });
      if (error) return res.status(500).json({ error: "Internal server error" });
      await storage.setIndustryProfileSubscription(userId, subscribedToDigest).catch(() => {});
      if (subscribedToDigest) backfillDefaultAlerts().catch(() => {});
      return res.json({ subscribedToDigest: data.user.user_metadata?.subscribedToDigest ?? false });
    } catch (err: any) {
      console.error("[users/subscribe]", err);
      return res.status(500).json({ error: "Failed to update subscription" });
    }
  });

  app.patch("/api/users/notification-prefs", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const userRole = req.headers["x-user-role"] as string;
      if (!userId) return res.status(400).json({ error: "Missing user id" });
      if (userRole !== "industry") return res.status(403).json({ error: "Industry role required" });
      const schema = z.object({
        matchAlerts: z.enum(["off", "daily", "frequent"]),
        weeklyRecap: z.boolean(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid body" });
      const existing = await storage.getIndustryProfileByUserId(userId);
      const base = existing ?? {
        userName: "", companyName: "", companyType: "",
        therapeuticAreas: [], dealStages: [], modalities: [],
        onboardingDone: false, notificationPrefs: null,
      };
      const notificationPrefs = { matchAlerts: parsed.data.matchAlerts, weeklyRecap: parsed.data.weeklyRecap };
      const updated = await storage.upsertIndustryProfile(userId, { ...base, notificationPrefs });
      await storage.setIndustryProfileSubscription(userId, parsed.data.matchAlerts !== "off").catch(() => {});
      if (parsed.data.matchAlerts !== "off") backfillDefaultAlerts().catch(() => {});
      return res.json({ notificationPrefs: updated.notificationPrefs });
    } catch (err: any) {
      console.error("[users/notification-prefs]", err);
      return res.status(500).json({ error: "Failed to save prefs" });
    }
  });

  // ── Shareable links ────────────────────────────────────────────────────

  app.post("/api/share", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const { type, entityId, payload, password, expiresInDays = 7 } = req.body;

      if (!type || !payload) {
        return res.status(400).json({ error: "type and payload are required" });
      }
      if (!["dossier", "pipeline_brief"].includes(type)) {
        return res.status(400).json({ error: "type must be dossier or pipeline_brief" });
      }
      const payloadSize = JSON.stringify(payload).length;
      if (payloadSize > 64_000) {
        return res.status(400).json({ error: "Payload too large (max 64 KB)" });
      }
      if (password && String(password).length > 256) {
        return res.status(400).json({ error: "Password too long (max 256 characters)" });
      }

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + Math.min(Math.max(1, expiresInDays), 30));

      let passwordHash: string | undefined;
      if (password) {
        passwordHash = crypto.createHash("sha256").update(password).digest("hex");
      }

      const link = await storage.createSharedLink({
        type,
        entityId: entityId ?? undefined,
        payload,
        createdBy: userId ?? undefined,
        expiresAt,
        passwordHash,
      });

      const configuredBase = process.env.APP_BASE_URL?.replace(/\/$/, "");
      const originHeader = (req.headers.origin ?? "").replace(/\/$/, "");
      const hostFallback = `https://${req.headers.host}`;
      const baseUrl = configuredBase || originHeader || hostFallback;
      const url = `${baseUrl}/share/${link.token}`;

      res.json({ token: link.token, expiresAt: link.expiresAt, url });
    } catch (err: any) {
      console.error("[share/create]", err?.message);
      res.status(500).json({ error: "Failed to create shared link" });
    }
  });

  type ResolvedShareLink = { type: string; entityId: string | null; payload: unknown; expiresAt: Date; createdAt: Date };
  type ShareLinkError = { httpStatus: number; body: Record<string, unknown> };

  async function fetchSharedLinkData(token: string, password: string | undefined): Promise<{ ok: true; data: ResolvedShareLink } | { ok: false; error: ShareLinkError }> {
    const link = await storage.getSharedLinkByToken(token);
    if (!link) {
      return { ok: false, error: { httpStatus: 404, body: { error: "Link not found" } } };
    }
    if (link.expiresAt < new Date()) {
      return { ok: false, error: { httpStatus: 410, body: { error: "Link has expired" } } };
    }
    if (link.passwordHash) {
      if (!password) {
        return { ok: false, error: { httpStatus: 401, body: { error: "Password required", passwordRequired: true } } };
      }
      const hash = crypto.createHash("sha256").update(password).digest("hex");
      if (hash !== link.passwordHash) {
        return { ok: false, error: { httpStatus: 401, body: { error: "Incorrect password", passwordRequired: true } } };
      }
    }
    return { ok: true, data: { type: link.type, entityId: link.entityId, payload: link.payload, expiresAt: link.expiresAt, createdAt: link.createdAt } };
  }

  app.get("/api/share/:token", async (req, res) => {
    try {
      const result = await fetchSharedLinkData(req.params.token, undefined);
      if (!result.ok) return res.status(result.error.httpStatus).json(result.error.body);
      res.json(result.data);
    } catch (err: any) {
      console.error("[share/get]", err?.message);
      res.status(500).json({ error: "Failed to retrieve shared link" });
    }
  });

  app.post("/api/share/:token/resolve", async (req, res) => {
    try {
      const { password } = req.body as { password?: string };
      const result = await fetchSharedLinkData(req.params.token, password);
      if (!result.ok) return res.status(result.error.httpStatus).json(result.error.body);
      res.json(result.data);
    } catch (err: any) {
      console.error("[share/resolve]", err?.message);
      res.status(500).json({ error: "Failed to retrieve shared link" });
    }
  });

  // ── Cloud export ───────────────────────────────────────────────────────

  app.get("/api/export/status", async (_req, res) => {
    try {
      const { isOneDriveConnected } = await import("../lib/oneDriveClient");
      const { isGoogleDriveConnected } = await import("../lib/googleDriveClient");
      const [onedrive, googledrive] = await Promise.all([
        isOneDriveConnected(),
        isGoogleDriveConnected(),
      ]);
      res.json({ onedrive, googledrive });
    } catch {
      res.json({ onedrive: false, googledrive: false });
    }
  });

  app.post("/api/export/onedrive", async (req, res) => {
    const userId = await tryGetUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Authentication required to export to cloud storage." });
    }
    if (!rateLimitOk(userId)) {
      return res.status(429).json({ error: "Too many exports. Please wait a minute and try again." });
    }
    let parsed: z.infer<typeof exportBodySchema>;
    try {
      parsed = exportBodySchema.parse(req.body);
    } catch (err: any) {
      return res.status(400).json({ error: "Invalid request: " + (err.message ?? String(err)) });
    }
    if (Math.floor(parsed.content.length * 0.75) > MAX_EXPORT_BYTES) {
      return res.status(413).json({ error: `Payload too large. Max ${Math.floor(MAX_EXPORT_BYTES / 1024 / 1024)}MB.` });
    }
    const folder = folderForFileType(parsed.fileType, parsed.campaignSlug);
    try {
      const { uploadToOneDrive } = await import("../lib/oneDriveClient");
      const buffer = Buffer.from(parsed.content, "base64");
      const result = await uploadToOneDrive(parsed.filename, buffer, folder);
      await storage.logExport({
        filename: parsed.filename,
        destination: "onedrive",
        fileType: parsed.fileType,
        exportedBy: userId ?? null,
        shareUrl: result.webUrl,
        success: true,
        errorMessage: null,
      });
      res.json({ success: true, url: result.webUrl, webUrl: result.webUrl });
    } catch (err: any) {
      const message = err?.message ?? "OneDrive upload failed";
      await storage.logExport({
        filename: parsed.filename,
        destination: "onedrive",
        fileType: parsed.fileType,
        exportedBy: userId ?? null,
        shareUrl: null,
        success: false,
        errorMessage: message,
      }).catch(() => {});
      res.status(502).json({ error: message });
    }
  });

  app.post("/api/export/googledrive", async (req, res) => {
    const userId = await tryGetUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Authentication required to export to cloud storage." });
    }
    if (!rateLimitOk(userId)) {
      return res.status(429).json({ error: "Too many exports. Please wait a minute and try again." });
    }
    let parsed: z.infer<typeof exportBodySchema>;
    try {
      parsed = exportBodySchema.parse(req.body);
    } catch (err: any) {
      return res.status(400).json({ error: "Invalid request: " + (err.message ?? String(err)) });
    }
    if (Math.floor(parsed.content.length * 0.75) > MAX_EXPORT_BYTES) {
      return res.status(413).json({ error: `Payload too large. Max ${Math.floor(MAX_EXPORT_BYTES / 1024 / 1024)}MB.` });
    }
    const folder = folderForFileType(parsed.fileType, parsed.campaignSlug);
    try {
      const { uploadToGoogleDrive, isGoogleDriveConnected } = await import("../lib/googleDriveClient");
      if (!(await isGoogleDriveConnected())) {
        return res.status(400).json({ error: "Google Drive is not connected. Connect it in your Replit workspace integrations to enable Drive exports." });
      }
      const buffer = Buffer.from(parsed.content, "base64");
      const result = await uploadToGoogleDrive(parsed.filename, buffer, folder);
      if (!result) {
        return res.status(400).json({ error: "Google Drive is not connected." });
      }
      await storage.logExport({
        filename: parsed.filename,
        destination: "googledrive",
        fileType: parsed.fileType,
        exportedBy: userId ?? null,
        shareUrl: result.editUrl,
        success: true,
        errorMessage: null,
      });
      res.json({ success: true, url: result.editUrl, editUrl: result.editUrl });
    } catch (err: any) {
      const message = err?.message ?? "Google Drive upload failed";
      await storage.logExport({
        filename: parsed.filename,
        destination: "googledrive",
        fileType: parsed.fileType,
        exportedBy: userId ?? null,
        shareUrl: null,
        success: false,
        errorMessage: message,
      }).catch(() => {});
      res.status(502).json({ error: message });
    }
  });

  app.get("/api/admin/export-log", async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit ?? 20), 100);
      const exports = await storage.getRecentExports(limit);
      res.json({ exports });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ── Weekly Recap ───────────────────────────────────────────────────────

  app.get("/api/recap/current", async (req, res) => {
    try {
      const { assembleRecap, upsertRecap, startOfWeek, resolveRequestOrgId } = await import("../lib/weeklyRecap");
      const userId = await tryGetUserId(req);
      const orgId = await resolveRequestOrgId(userId ?? undefined);
      if (!orgId) return res.status(404).json({ error: "No organization for this user" });
      const weekStart = startOfWeek(new Date());
      const payload = await assembleRecap(orgId, weekStart);
      await upsertRecap(orgId, weekStart, payload, false);
      res.json({ weekStart: weekStart.toISOString(), frozen: false, payload });
    } catch (err: any) {
      console.error("[recap/current] Error:", err);
      res.status(500).json({ error: err?.message ?? "Failed to assemble recap" });
    }
  });

  app.get("/api/recap/list", async (req, res) => {
    try {
      const { listRecaps, resolveRequestOrgId } = await import("../lib/weeklyRecap");
      const userId = await tryGetUserId(req);
      const orgId = await resolveRequestOrgId(userId ?? undefined);
      if (!orgId) return res.status(404).json({ error: "No organization for this user" });
      const weeks = await listRecaps(orgId, 12);
      res.json({ weeks });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Failed to list recaps" });
    }
  });

  app.get("/api/recap/:weekStart", async (req, res) => {
    try {
      const { assembleRecap, getStoredRecap, upsertRecap, startOfWeek, resolveRequestOrgId } = await import("../lib/weeklyRecap");
      const userId = await tryGetUserId(req);
      const orgId = await resolveRequestOrgId(userId ?? undefined);
      if (!orgId) return res.status(404).json({ error: "No organization for this user" });
      const d = new Date(req.params.weekStart);
      const weekStart = isNaN(d.getTime()) ? null : startOfWeek(d);
      if (!weekStart) return res.status(400).json({ error: "Invalid weekStart date" });
      const stored = await getStoredRecap(orgId, weekStart);
      if (stored) {
        return res.json({
          weekStart: stored.weekStartDate.toISOString(),
          frozen: stored.frozen,
          payload: stored.payload,
        });
      }
      const thisWeek = startOfWeek(new Date());
      const payload = await assembleRecap(orgId, weekStart);
      const isPast = weekStart.getTime() < thisWeek.getTime();
      await upsertRecap(orgId, weekStart, payload, isPast);
      res.json({ weekStart: weekStart.toISOString(), frozen: isPast, payload });
    } catch (err: any) {
      console.error("[recap/:weekStart] Error:", err);
      res.status(500).json({ error: err?.message ?? "Failed to load recap" });
    }
  });

  app.post("/api/admin/recap/regenerate", requireAdmin, async (req, res) => {
    try {
      const { assembleRecap, upsertRecap, startOfWeek, runWeeklyRecapJob } = await import("../lib/weeklyRecap");
      const body = req.body as { weekStart?: string; orgId?: number } | undefined;
      if (body?.weekStart && body?.orgId) {
        const d = new Date(body.weekStart);
        const weekStart = isNaN(d.getTime()) ? null : startOfWeek(d);
        if (!weekStart) return res.status(400).json({ error: "Invalid weekStart" });
        const payload = await assembleRecap(body.orgId, weekStart);
        await upsertRecap(body.orgId, weekStart, payload, true);
        return res.json({ ok: true, orgId: body.orgId, weekStart: weekStart.toISOString() });
      }
      const result = await runWeeklyRecapJob({ force: true });
      res.json({ ok: true, ...result });
    } catch (err: any) {
      res.status(500).json({ error: "Regenerate failed" });
    }
  });

  // ── V1 Public API ──────────────────────────────────────────────────────

  app.get("/v1/health", requireApiKey(), (req, res) => {
    const key = req.apiKey!;
    res.json({
      status: "ok",
      key: key.keyPrefix + "…",
      tier: key.tier,
      scopes: key.scopes,
    });
  });

  app.get("/v1/assets/search", requireApiKey("read:assets"), async (req, res) => {
    const parsed = v1AssetSearchSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid parameters", details: parsed.error.flatten().fieldErrors });
    }
    const { q, limit, offset, modality, stage, indication, institution } = parsed.data;
    try {
      const results = await storage.keywordSearchIngestedAssets(q, limit + offset + 1, {
        modality, stage, indication, institution,
      });
      const page = results.slice(offset, offset + limit);
      return res.json({
        data: page.map(formatV1Asset),
        query: q,
        total_returned: page.length,
        limit,
        offset,
        has_more: results.length > offset + limit,
      });
    } catch (err) {
      console.error("[v1/assets/search]", err);
      return res.status(500).json({ error: "Search failed", code: "search_error" });
    }
  });

  app.get("/v1/assets/:id", requireApiKey("read:assets"), async (req, res) => {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid asset ID", code: "invalid_id" });
    }
    try {
      const rows = await db.select().from(ingestedAssets)
        .where(and(eq(ingestedAssets.id, id), eq(ingestedAssets.relevant, true)))
        .limit(1);
      if (!rows.length) {
        return res.status(404).json({ error: "Asset not found", code: "not_found" });
      }
      const r = rows[0];
      return res.json({ data: formatV1Asset({
        id: r.id,
        assetName: r.assetName,
        target: r.target ?? null,
        modality: r.modality ?? null,
        indication: r.indication ?? null,
        developmentStage: r.developmentStage ?? "",
        institution: r.institution ?? "",
        mechanismOfAction: r.mechanismOfAction ?? null,
        innovationClaim: r.innovationClaim ?? null,
        unmetNeed: r.unmetNeed ?? null,
        comparableDrugs: r.comparableDrugs ?? null,
        completenessScore: r.completenessScore ?? null,
        licensingReadiness: r.licensingReadiness ?? null,
        ipType: r.ipType ?? null,
        sourceUrl: r.sourceUrl ?? null,
        sourceName: r.sourceName ?? null,
        summary: r.summary ?? null,
        categories: null,
        technologyId: r.technologyId ?? null,
        similarity: 1.0,
        lastSeenAt: r.lastSeenAt ? r.lastSeenAt.toISOString() : null,
      }) });
    } catch (err) {
      console.error("[v1/assets/:id]", err);
      return res.status(500).json({ error: "Lookup failed", code: "lookup_error" });
    }
  });

  // ── API Management (admin) ─────────────────────────────────────────────

  app.get("/api/admin/api-management/overview", requireAdmin, async (req, res) => {
    try {
      const [keysResult, callsTodayResult, callsMonthResult] = await Promise.all([
        db.select({ status: apiKeys.status, count: sql<number>`count(*)::int` })
          .from(apiKeys)
          .groupBy(apiKeys.status),
        db.select({ count: sql<number>`count(*)::int` })
          .from(apiUsageLogs)
          .where(sql`called_at >= now() - interval '24 hours'`),
        db.select({ count: sql<number>`count(*)::int` })
          .from(apiUsageLogs)
          .where(sql`called_at >= date_trunc('month', now())`),
      ]);
      const activeKeys = keysResult.find(r => r.status === "active")?.count ?? 0;
      const totalKeys = keysResult.reduce((s, r) => s + (r.count ?? 0), 0);
      const callsToday = callsTodayResult[0]?.count ?? 0;
      const callsMonth = callsMonthResult[0]?.count ?? 0;

      const topOrgs = await db.select({
        orgName: apiUsageLogs.orgName,
        calls: sql<number>`count(*)::int`,
      })
        .from(apiUsageLogs)
        .where(sql`called_at >= date_trunc('month', now()) AND org_name IS NOT NULL`)
        .groupBy(apiUsageLogs.orgName)
        .orderBy(sql`count(*) desc`)
        .limit(5);

      const sparkline = await db.select({
        day: sql<string>`to_char(date_trunc('day', called_at), 'MM/DD')`,
        calls: sql<number>`count(*)::int`,
      })
        .from(apiUsageLogs)
        .where(sql`called_at >= now() - interval '30 days'`)
        .groupBy(sql`date_trunc('day', called_at)`)
        .orderBy(sql`date_trunc('day', called_at)`);

      res.json({ activeKeys, totalKeys, callsToday, callsMonth, topOrgs, sparkline });
    } catch {
      res.json({ activeKeys: 0, totalKeys: 0, callsToday: 0, callsMonth: 0, topOrgs: [], sparkline: [] });
    }
  });

  app.get("/api/admin/api-management/keys", requireAdmin, async (req, res) => {
    try {
      const search = (req.query.search as string) ?? "";
      const status = (req.query.status as string) ?? "all";
      const rows = await db.select().from(apiKeys).orderBy(desc(apiKeys.createdAt));
      let filtered = rows;
      if (status !== "all") filtered = filtered.filter(k => k.status === status);
      if (search) {
        const q = search.toLowerCase();
        filtered = filtered.filter(k =>
          k.keyPrefix.toLowerCase().includes(q) ||
          (k.orgName ?? "").toLowerCase().includes(q) ||
          (k.userEmail ?? "").toLowerCase().includes(q) ||
          k.label.toLowerCase().includes(q)
        );
      }
      const keyIds = filtered.map(k => k.id);
      const todayCountsRaw = keyIds.length > 0
        ? await db.select({ keyId: apiUsageLogs.keyId, count: sql<number>`count(*)::int` })
            .from(apiUsageLogs)
            .where(and(sql`called_at >= now() - interval '24 hours'`, inArray(apiUsageLogs.keyId, keyIds)))
            .groupBy(apiUsageLogs.keyId)
        : [];
      const todayCounts: Record<number, number> = {};
      for (const r of todayCountsRaw) { if (r.keyId) todayCounts[r.keyId] = r.count; }
      const result = filtered.map(k => ({ ...k, callsToday: todayCounts[k.id] ?? 0 }));
      res.json({ keys: result });
    } catch {
      res.json({ keys: [] });
    }
  });

  app.post("/api/admin/api-management/keys/:id/suspend", requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { reason } = req.body as { reason?: string };
      const adminEmail = String(req.headers["x-admin-email"] ?? "admin");
      await db.update(apiKeys)
        .set({ status: "suspended", suspendedAt: new Date(), suspendedBy: adminEmail, suspendReason: reason ?? null })
        .where(eq(apiKeys.id, id));
      await db.insert(apiKeyAuditLog).values({
        action: "key_suspended", keyId: id, actorType: "admin",
        actorId: adminEmail,
        payload: { reason },
      });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: "Internal server error" }); }
  });

  app.post("/api/admin/api-management/keys/:id/restore", requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const adminEmail = String(req.headers["x-admin-email"] ?? "admin");
      await db.update(apiKeys)
        .set({ status: "active", suspendedAt: null, suspendedBy: null, suspendReason: null })
        .where(eq(apiKeys.id, id));
      await db.insert(apiKeyAuditLog).values({
        action: "key_restored", keyId: id, actorType: "admin", actorId: adminEmail,
      });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: "Internal server error" }); }
  });

  app.post("/api/admin/api-management/keys/:id/revoke", requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const adminEmail = String(req.headers["x-admin-email"] ?? "admin");
      await db.update(apiKeys)
        .set({ status: "revoked", revokedAt: new Date(), revokedBy: adminEmail })
        .where(eq(apiKeys.id, id));
      await db.insert(apiKeyAuditLog).values({
        action: "key_revoked", keyId: id, actorType: "admin", actorId: adminEmail,
      });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: "Internal server error" }); }
  });

  app.get("/api/admin/api-management/orgs", requireAdmin, async (req, res) => {
    try {
      const orgSummaries = await db.select({
        orgId: apiKeys.orgId,
        orgName: apiKeys.orgName,
        keyCount: sql<number>`count(*)::int`,
        activeKeys: sql<number>`count(*) filter (where status = 'active')::int`,
        tier: sql<string>`max(tier)`,
      })
        .from(apiKeys)
        .where(sql`org_id IS NOT NULL`)
        .groupBy(apiKeys.orgId, apiKeys.orgName);

      const callsMonth = await db.select({
        orgId: apiUsageLogs.orgId,
        calls: sql<number>`count(*)::int`,
      })
        .from(apiUsageLogs)
        .where(sql`called_at >= date_trunc('month', now()) AND org_id IS NOT NULL`)
        .groupBy(apiUsageLogs.orgId);

      const callMap: Record<number, number> = {};
      for (const r of callsMonth) { if (r.orgId) callMap[r.orgId] = r.calls; }

      const result = orgSummaries.map(o => ({
        ...o,
        callsThisMonth: o.orgId ? (callMap[o.orgId] ?? 0) : 0,
      }));
      res.json({ orgs: result });
    } catch {
      res.json({ orgs: [] });
    }
  });

  app.get("/api/admin/api-management/usage", requireAdmin, async (req, res) => {
    try {
      const [volumeByDay, byEndpoint, byStatus] = await Promise.all([
        db.select({
          day: sql<string>`to_char(date_trunc('day', called_at), 'MM/DD')`,
          calls: sql<number>`count(*)::int`,
        })
          .from(apiUsageLogs)
          .where(sql`called_at >= now() - interval '30 days'`)
          .groupBy(sql`date_trunc('day', called_at)`)
          .orderBy(sql`date_trunc('day', called_at)`),
        db.select({
          endpoint: apiUsageLogs.endpoint,
          calls: sql<number>`count(*)::int`,
        })
          .from(apiUsageLogs)
          .where(sql`called_at >= date_trunc('month', now())`)
          .groupBy(apiUsageLogs.endpoint)
          .orderBy(sql`count(*) desc`)
          .limit(10),
        db.select({
          statusCode: apiUsageLogs.statusCode,
          calls: sql<number>`count(*)::int`,
        })
          .from(apiUsageLogs)
          .where(sql`called_at >= date_trunc('month', now())`)
          .groupBy(apiUsageLogs.statusCode),
      ]);
      res.json({ volumeByDay, byEndpoint, byStatus });
    } catch {
      res.json({ volumeByDay: [], byEndpoint: [], byStatus: [] });
    }
  });

  app.get("/api/admin/api-management/audit", requireAdmin, async (req, res) => {
    try {
      const events = await db.select()
        .from(apiKeyAuditLog)
        .orderBy(desc(apiKeyAuditLog.createdAt))
        .limit(200);
      res.json({ events });
    } catch {
      res.json({ events: [] });
    }
  });

  // ── User API key self-service ──────────────────────────────────────────

  app.get("/api/user/api-key", verifyAnyAuth, async (req, res) => {
    const userId = req.headers["x-user-id"] as string;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    try {
      const rows = await db.select().from(apiKeys)
        .where(and(eq(apiKeys.userId, userId), ne(apiKeys.status, "revoked")))
        .orderBy(desc(apiKeys.createdAt))
        .limit(1);
      if (!rows.length) return res.json({ key: null });
      const key = rows[0];
      const today = new Date();
      const todayStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
      const windowRows = await db.select().from(apiRateLimitWindows).where(eq(apiRateLimitWindows.keyId, key.id)).limit(1);
      const window = windowRows[0];
      const callsToday = (window && new Date(window.windowStart) >= todayStart) ? window.callCount : 0;
      return res.json({
        key: {
          id: key.id,
          prefix: key.keyPrefix,
          tier: key.tier,
          status: key.status,
          scopes: key.scopes,
          dailyLimit: key.limitOverride ?? key.dailyLimit,
          callsToday,
          createdAt: key.createdAt,
          lastUsedAt: key.lastUsedAt,
        },
      });
    } catch (err) {
      console.error("[user/api-key GET]", err);
      return res.status(500).json({ error: "Internal error" });
    }
  });

  app.post("/api/user/api-key", verifyAnyAuth, async (req, res) => {
    const userId = req.headers["x-user-id"] as string;
    const userEmail = req.headers["x-user-email"] as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    try {
      await db.update(apiKeys)
        .set({ status: "revoked", revokedAt: new Date(), revokedBy: userId })
        .where(and(eq(apiKeys.userId, userId), eq(apiKeys.status, "active")));

      const prefix = crypto.randomBytes(4).toString("hex");
      const secret = crypto.randomBytes(16).toString("hex");
      const raw = `eden_${prefix}_${secret}`;
      const hash = crypto.createHash("sha256").update(raw).digest("hex");

      const tier = "starter";
      const { dailyLimit, scopes } = API_TIER_CONFIG[tier];

      const [inserted] = await db.insert(apiKeys).values({
        keyHash: hash,
        keyPrefix: prefix,
        label: "My API Key",
        userId,
        userEmail: userEmail ?? null,
        keyType: "personal",
        tier,
        scopes: scopes as string[],
        status: "active",
        dailyLimit,
      }).returning();

      await db.insert(apiKeyAuditLog).values({
        action: "key_issued",
        keyId: inserted.id,
        keyPrefix: prefix,
        actorId: userId,
        actorType: "user",
        targetUserId: userId,
      }).catch(() => {});

      return res.json({ raw, prefix, tier, scopes, dailyLimit });
    } catch (err) {
      console.error("[user/api-key POST]", err);
      return res.status(500).json({ error: "Internal error" });
    }
  });

  app.delete("/api/user/api-key", verifyAnyAuth, async (req, res) => {
    const userId = req.headers["x-user-id"] as string;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    try {
      const result = await db.update(apiKeys)
        .set({ status: "revoked", revokedAt: new Date(), revokedBy: userId })
        .where(and(eq(apiKeys.userId, userId), eq(apiKeys.status, "active")))
        .returning({ id: apiKeys.id, keyPrefix: apiKeys.keyPrefix });
      if (!result.length) return res.status(404).json({ error: "No active key found" });
      await db.insert(apiKeyAuditLog).values({
        action: "key_revoked",
        keyId: result[0].id,
        keyPrefix: result[0].keyPrefix,
        actorId: userId,
        actorType: "user",
        targetUserId: userId,
      }).catch(() => {});
      return res.json({ ok: true });
    } catch (err) {
      console.error("[user/api-key DELETE]", err);
      return res.status(500).json({ error: "Internal error" });
    }
  });

  // Admin: issue a key on behalf of a user
  app.post("/api/admin/api-management/keys", requireAdmin, async (req, res) => {
    const adminUser = await getAdminUser(req);
    const { userId, userEmail, orgId, orgName, tier = "starter", label = "API Key", note } =
      req.body as { userId: string; userEmail?: string; orgId?: number; orgName?: string; tier?: string; label?: string; note?: string };
    if (!userId) return res.status(400).json({ error: "userId required" });
    try {
      const tierConfig = API_TIER_CONFIG[tier as keyof typeof API_TIER_CONFIG];
      if (!tierConfig) return res.status(400).json({ error: "Invalid tier" });
      const prefix = crypto.randomBytes(4).toString("hex");
      const secret = crypto.randomBytes(16).toString("hex");
      const raw = `eden_${prefix}_${secret}`;
      const hash = crypto.createHash("sha256").update(raw).digest("hex");
      const [inserted] = await db.insert(apiKeys).values({
        keyHash: hash,
        keyPrefix: prefix,
        label,
        userId,
        userEmail: userEmail ?? null,
        orgId: orgId ?? null,
        orgName: orgName ?? null,
        keyType: orgId ? "org" : "personal",
        tier,
        scopes: tierConfig.scopes as string[],
        status: "active",
        dailyLimit: tierConfig.dailyLimit,
        grantedByAdmin: adminUser?.email ?? "admin",
        accessGrantNote: note ?? null,
      }).returning();
      await db.insert(apiKeyAuditLog).values({
        action: "access_granted",
        keyId: inserted.id,
        keyPrefix: prefix,
        actorId: adminUser?.id ?? null,
        actorType: "admin",
        targetUserId: userId,
        payload: { tier, label, note, keyType: orgId ? "org" : "personal" },
      }).catch(() => {});
      if (adminUser) {
        await insertAdminEvent({
          adminUserId: adminUser.id,
          adminEmail: adminUser.email,
          action: "api_key_created",
          targetUserId: userId,
          targetOrgId: orgId ?? undefined,
          payload: { tier, keyType: orgId ? "org" : "personal", prefix },
        });
      }
      return res.json({ ok: true, prefix, raw });
    } catch (err) {
      console.error("[admin/api-management/keys POST]", err);
      return res.status(500).json({ error: "Internal error" });
    }
  });
}
