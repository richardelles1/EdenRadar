import type { Express } from "express";
import { z } from "zod";
import { db } from "../db";
import { eq, sql, inArray } from "drizzle-orm";
import { storage } from "../storage";
import { ingestedAssets, emailUnsubscribes } from "@shared/schema";
import { sendEmail, unsubscribeUrlForEmail, FROM_DIGEST } from "../email";
import { resolveSubjectTokens } from "../lib/resolveSubjectTokens";

export { resolveSubjectTokens };

const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseUrl = process.env.VITE_SUPABASE_URL || "";

export function registerDispatchRoutes(app: Express): void {
  app.get("/api/admin/alerts/latency", async (_req, res) => {
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
      return res.status(500).json({ error: "Failed to load filter options" });
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
      return res.status(500).json({ error: "Failed to load discoveries" });
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
      return res.status(500).json({ error: "Preview failed" });
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
      return res.status(500).json({ error: "Dispatch failed" });
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
      return res.status(500).json({ error: "Failed to trigger alert emails" });
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
      if (error) return res.status(500).json({ error: "Internal server error" });
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
      return res.status(500).json({ error: "Failed to load subscribers" });
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
      return res.status(500).json({ error: "Failed" });
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
      return res.status(500).json({ error: "Failed" });
    }
  });

  app.get("/api/admin/dispatch/history", async (req, res) => {
    try {
      const history = await storage.getDispatchHistory(30);
      return res.json({ history });
    } catch (err: any) {
      console.error("[dispatch/history] Error:", err);
      return res.status(500).json({ error: "Failed to load history" });
    }
  });

}