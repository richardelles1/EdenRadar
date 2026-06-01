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

  app.post("/api/admin/alerts/repair", async (req, res) => {
    try {
      const sbUrl = process.env.VITE_SUPABASE_URL ?? "";
      const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
      if (!sbUrl || !sbKey) return res.status(500).json({ error: "Supabase not configured" });

      const { createClient } = await import("@supabase/supabase-js");
      const admin = createClient(sbUrl, sbKey);

      // Step 1: sync all Supabase subscribers into industry_profiles
      let synced = 0;
      const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
      if (error) return res.status(500).json({ error: "Supabase listUsers failed: " + error.message });

      const users = data?.users ?? [];
      const report: { userId: string; email: string; action: string }[] = [];

      for (const u of users) {
        const email = u.user_metadata?.contactEmail || u.email || u.id;
        if (u.user_metadata?.subscribedToDigest === true) {
          await storage.setIndustryProfileSubscription(u.id, true);
          synced++;
          report.push({ userId: u.id, email, action: "synced_subscription" });
        }
      }

      // Step 2: backfill user_alerts rows for everyone now subscribed
      const { backfillDefaultAlerts } = await import("../lib/alertMailer");
      await backfillDefaultAlerts();

      // Step 3: return current state
      const { pool } = await import("../db");
      const profileCount = await pool.query("SELECT COUNT(*) FROM industry_profiles WHERE subscribed_to_digest = true");
      const alertCount = await pool.query("SELECT COUNT(*) FROM user_alerts WHERE enabled = true");

      return res.json({
        ok: true,
        supabaseUsersScanned: users.length,
        subscriptionsSynced: synced,
        subscribedProfiles: Number(profileCount.rows[0].count),
        enabledAlerts: Number(alertCount.rows[0].count),
        detail: report,
      });
    } catch (err: any) {
      console.error("[admin/alerts/repair] Error:", err?.message);
      return res.status(500).json({ error: err?.message ?? "Repair failed" });
    }
  });

  app.post("/api/admin/sweep/test-email", async (req, res) => {
    try {
      const to = process.env.AUTO_SWEEP_REPORT_EMAIL ?? "richardelles@gmail.com";
      const now = new Date();
      const timeLabel = now.toLocaleDateString("en-US", {
        month: "short", day: "numeric", year: "numeric",
        hour: "2-digit", minute: "2-digit", timeZone: "America/Los_Angeles",
      });
      const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;color:#111827">
  <div style="background:#f0fdf4;border:1px solid #a7f3d0;border-radius:10px;padding:20px 24px;margin-bottom:20px">
    <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#059669;text-transform:uppercase;letter-spacing:0.06em">EdenRadar Auto-Sweep</p>
    <h2 style="margin:0 0 4px;font-size:22px;font-weight:800;color:#111827">Test email — delivery confirmed</h2>
    <p style="margin:0;font-size:13px;color:#6b7280">Sent ${timeLabel} PT</p>
  </div>
  <p style="font-size:14px;color:#374151">The sweep report email is working correctly. This is what you'll receive after each 7:30am and 5:00pm sweep completes.</p>
  <p style="font-size:11px;color:#9ca3af;margin:0">Recipient: ${to}</p>
</div>`;
      await sendEmail(to, "[TEST] EdenRadar sweep report — delivery check", html, FROM_DIGEST);
      return res.json({ ok: true, sentTo: to });
    } catch (err: any) {
      console.error("[admin/sweep/test-email] Error:", err?.message);
      return res.status(500).json({ error: err?.message ?? "Failed to send test email" });
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