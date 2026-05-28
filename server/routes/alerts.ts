import type { Express } from "express";
import { db } from "../db";
import { eq, and, sql, desc, or, ilike, inArray, gt, count as drizzleCount } from "drizzle-orm";
import { storage } from "../storage";
import { ingestedAssets, userAlerts, industryProfiles } from "@shared/schema";
import { tryGetUserId } from "../lib/supabaseAuth";
import { z } from "zod";

const alertBodySchema = z.object({
  name: z.string().min(1).max(200),
  query: z.string().max(500).nullable().optional(),
  modalities: z.array(z.string().max(100)).max(20).nullable().optional(),
  stages: z.array(z.string().max(100)).max(20).nullable().optional(),
  institutions: z.array(z.string().max(200)).max(100).nullable().optional(),
  criteriaType: z.enum(["all_new", "custom"]).optional(),
  enabled: z.boolean().optional(),
});

const alertPreviewSchema = z.object({
  query: z.string().max(500).nullable().optional(),
  modalities: z.array(z.string().max(100)).max(20).nullable().optional(),
  stages: z.array(z.string().max(100)).max(20).nullable().optional(),
  institutions: z.array(z.string().max(200)).max(100).nullable().optional(),
});
export function registerAlertsRoutes(app: Express): void {
  app.get("/api/alerts", async (req, res) => {
    try {
      const userId = await tryGetUserId(req);
      const alerts = await storage.listUserAlerts(userId);
      res.json(alerts);
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/alerts", async (req, res) => {
    try {
      const parsed = alertBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid request" });
      const { query, modalities, stages, institutions, name, criteriaType, enabled } = parsed.data;
      const trimmedName = name.trim();
      if (!trimmedName) {
        return res.status(400).json({ error: "Alert name is required" });
      }
      const isAllNew = criteriaType === "all_new";
      if (!isAllNew && !query && (!modalities?.length) && (!stages?.length) && (!institutions?.length)) {
        return res.status(400).json({ error: "At least one filter must be set" });
      }
      const userId = await tryGetUserId(req);
      const alert = await storage.createUserAlert({
        name: trimmedName,
        query: isAllNew ? null : (query ?? null),
        modalities: isAllNew ? null : (modalities ?? null),
        stages: isAllNew ? null : (stages ?? null),
        institutions: isAllNew ? null : (institutions ?? null),
        criteriaType: criteriaType ?? "custom",
        enabled: enabled !== false,
      }, userId);
      res.status(201).json(alert);
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/alerts/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      const userId = await tryGetUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      await storage.deleteUserAlert(id, userId);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/alerts/:id/enabled", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      const userId = await tryGetUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const { enabled } = req.body ?? {};
      if (typeof enabled !== "boolean") return res.status(400).json({ error: "enabled must be a boolean" });
      const updated = await storage.updateUserAlert(id, userId, { enabled });
      if (!updated) return res.status(404).json({ error: "Alert not found or access denied" });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/alerts/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      const userId = await tryGetUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const parsed = alertBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid request" });
      const { query, modalities, stages, institutions, name, criteriaType, enabled } = parsed.data;
      const trimmedName = name.trim();
      if (!trimmedName) {
        return res.status(400).json({ error: "Alert name is required" });
      }
      const isAllNew = criteriaType === "all_new";
      if (!isAllNew && !query && (!modalities?.length) && (!stages?.length) && (!institutions?.length)) {
        return res.status(400).json({ error: "At least one filter must be set" });
      }
      const updated = await storage.updateUserAlert(id, userId, {
        name: trimmedName,
        query: isAllNew ? null : (query ?? null),
        modalities: isAllNew ? null : (modalities ?? null),
        stages: isAllNew ? null : (stages ?? null),
        institutions: isAllNew ? null : (institutions ?? null),
        criteriaType: criteriaType ?? "custom",
        ...(enabled !== undefined ? { enabled: enabled !== false } : {}),
      });
      if (!updated) return res.status(404).json({ error: "Alert not found or access denied" });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // â”€â”€ Shared SQL alert predicate builder â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Mirrors the logic in server/lib/alertMailer.ts matchAssetsForAlert so that
  // in-app display and email delivery use identical matching semantics.
  // When criteriaType === "all_new", all filter conditions are skipped so every
  // relevant asset matches (the "All New Assets" catch-all alert type).
  function buildAlertWhere(
    alert: { query?: string | null; modalities?: string[] | null; stages?: string[] | null; institutions?: string[] | null; criteriaType?: string | null },
    extraConditions?: ReturnType<typeof and>[],
  ) {
    if (alert.criteriaType === "all_new") {
      return and(eq(ingestedAssets.relevant, true), ...(extraConditions ?? []));
    }
    const trimmedQuery = alert.query?.trim();
    return and(
      eq(ingestedAssets.relevant, true),
      ...(extraConditions ?? []),
      alert.institutions?.length ? inArray(ingestedAssets.institution, alert.institutions) : undefined,
      alert.modalities?.length ? inArray(ingestedAssets.modality, alert.modalities) : undefined,
      alert.stages?.length ? inArray(ingestedAssets.developmentStage, alert.stages) : undefined,
      trimmedQuery
        ? or(
            ilike(ingestedAssets.assetName, `%${trimmedQuery}%`),
            ilike(ingestedAssets.summary, `%${trimmedQuery}%`),
            ilike(ingestedAssets.indication, `%${trimmedQuery}%`),
            ilike(ingestedAssets.target, `%${trimmedQuery}%`),
          )
        : undefined,
    );
  }

  // â”€â”€ GET /api/alerts/delta â€” user-scoped, grouped by alert â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Uses identical SQL predicates to alertMailer.ts so in-app and email counts agree.
  // Only counts enabled alerts (enabled = true).
  app.get("/api/alerts/delta", async (req, res) => {
    try {
      const userId = await tryGetUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const allAlerts = await storage.listUserAlerts(userId);
      const alerts = allAlerts.filter((a) => a.enabled !== false);
      const sinceParam = req.query.since as string | undefined;
      const since = sinceParam && !isNaN(Date.parse(sinceParam))
        ? new Date(sinceParam)
        : new Date(Date.now() - 48 * 60 * 60 * 1000);

      if (alerts.length === 0) {
        return res.json({ byAlert: [], total: 0, distinctTotal: 0, since: since.toISOString() });
      }

      type AlertBucket = {
        alertId: number;
        alertName: string;
        matchCount: number;
        samples: Array<{ id: number; assetName: string; institution: string; modality: string; developmentStage: string }>;
      };
      const byAlert: AlertBucket[] = [];

      for (const alert of alerts) {
        const sinceCondition = gt(ingestedAssets.firstSeenAt, since);
        const rows = await db
          .select({
            id: ingestedAssets.id,
            assetName: ingestedAssets.assetName,
            institution: ingestedAssets.institution,
            modality: ingestedAssets.modality,
            developmentStage: ingestedAssets.developmentStage,
          })
          .from(ingestedAssets)
          .where(buildAlertWhere(alert, [sinceCondition]))
          .orderBy(desc(ingestedAssets.firstSeenAt));

        if (rows.length === 0) continue;
        byAlert.push({
          alertId: alert.id,
          alertName: alert.name ?? alert.query ?? "Untitled alert",
          matchCount: rows.length,
          samples: rows.slice(0, 5).map((r) => ({
            id: r.id,
            assetName: r.assetName,
            institution: r.institution ?? "",
            modality: r.modality ?? "",
            developmentStage: r.developmentStage ?? "",
          })),
        });
      }

      // Collect distinct asset IDs across all alert buckets so the top-level
      // count matches the sidebar badge (which also deduplicates).
      const distinctIds = new Set<number>();
      for (const alert of alerts) {
        const sinceCondition = gt(ingestedAssets.firstSeenAt, since);
        const ids = await db
          .select({ id: ingestedAssets.id })
          .from(ingestedAssets)
          .where(buildAlertWhere(alert, [sinceCondition]));
        for (const row of ids) distinctIds.add(row.id);
      }
      const distinctTotal = distinctIds.size;
      const total = byAlert.reduce((s, b) => s + b.matchCount, 0);
      return res.json({ byAlert, total, distinctTotal, since: since.toISOString() });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // â”€â”€ POST /api/alerts/preview â€” live match count for unsaved criteria â”€â”€â”€â”€â”€â”€
  // Runs SQL count(*) with the same predicates as alertMailer for an accurate total.
  app.post("/api/alerts/preview", async (req, res) => {
    try {
      const userId = await tryGetUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const previewParsed = alertPreviewSchema.safeParse(req.body ?? {});
      if (!previewParsed.success) return res.status(400).json({ error: previewParsed.error.errors[0]?.message ?? "Invalid request" });
      const { query, modalities, stages, institutions } = previewParsed.data;
      const trimmedQuery = query?.trim();
      const hasAnyFilter =
        !!trimmedQuery ||
        (modalities?.length ?? 0) > 0 ||
        (stages?.length ?? 0) > 0 ||
        (institutions?.length ?? 0) > 0;

      if (!hasAnyFilter) return res.json({ count: 0, samples: [] });

      const draft = {
        query: trimmedQuery || null,
        modalities: (modalities?.length ?? 0) > 0 ? (modalities as string[]) : null,
        stages: (stages?.length ?? 0) > 0 ? (stages as string[]) : null,
        institutions: (institutions?.length ?? 0) > 0 ? (institutions as string[]) : null,
      };
      const whereClause = buildAlertWhere(draft);

      const [{ totalCount }] = await db
        .select({ totalCount: drizzleCount() })
        .from(ingestedAssets)
        .where(whereClause);

      const samples = await db
        .select({
          id: ingestedAssets.id,
          assetName: ingestedAssets.assetName,
          institution: ingestedAssets.institution,
          modality: ingestedAssets.modality,
          developmentStage: ingestedAssets.developmentStage,
        })
        .from(ingestedAssets)
        .where(whereClause)
        .orderBy(desc(ingestedAssets.firstSeenAt))
        .limit(5);

      return res.json({
        count: Number(totalCount),
        samples,
      });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // â”€â”€ GET /api/alerts/unread-count â€” backend-driven badge count â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Returns the number of distinct ingested assets matching any of the user's
  // enabled saved alerts that have arrived since last_viewed_alerts_at. Uses the
  // same buildAlertWhere SQL predicate as alertMailer for accuracy.
  app.get("/api/alerts/unread-count", async (req, res) => {
    try {
      const userId = await tryGetUserId(req);
      if (!userId) return res.json({ count: 0 });

      const [profileRow] = await db
        .select({ lastViewedAlertsAt: industryProfiles.lastViewedAlertsAt })
        .from(industryProfiles)
        .where(eq(industryProfiles.userId, userId))
        .limit(1);

      const since = profileRow?.lastViewedAlertsAt
        ? profileRow.lastViewedAlertsAt
        : new Date(Date.now() - 48 * 60 * 60 * 1000);

      const userAlertsList = await db
        .select()
        .from(userAlerts)
        .where(and(eq(userAlerts.userId, userId), eq(userAlerts.enabled, true)))
        .orderBy(desc(userAlerts.createdAt));

      if (userAlertsList.length === 0) return res.json({ count: 0 });

      const sinceCondition = gt(ingestedAssets.firstSeenAt, since);
      const seenIds = new Set<number>();
      for (const alert of userAlertsList) {
        const rows = await db
          .select({ id: ingestedAssets.id })
          .from(ingestedAssets)
          .where(buildAlertWhere(alert, [sinceCondition]));
        for (const row of rows) seenIds.add(row.id);
      }

      res.json({ count: seenIds.size });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // â”€â”€ GET /api/alerts/viewed-since â€” return the DB-side last-viewed timestamp â”€
  // Frontend uses this as the authoritative sinceParam so badge and page counts agree.
  app.get("/api/alerts/viewed-since", async (req, res) => {
    try {
      const userId = await tryGetUserId(req);
      if (!userId) return res.json({ since: null });

      const [profileRow] = await db
        .select({ lastViewedAlertsAt: industryProfiles.lastViewedAlertsAt })
        .from(industryProfiles)
        .where(eq(industryProfiles.userId, userId))
        .limit(1);

      res.json({ since: profileRow?.lastViewedAlertsAt?.toISOString() ?? null });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // â”€â”€ POST /api/alerts/mark-read â€” clear the unread badge â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Updates last_viewed_alerts_at on industry_profiles so subsequent calls to
  // /api/alerts/unread-count return 0 until new assets arrive.
  // Returns the timestamp used so the client can sync its local sinceParam.
  app.post("/api/alerts/mark-read", async (req, res) => {
    try {
      const userId = await tryGetUserId(req);
      if (!userId) return res.json({ ok: true, lastViewedAt: null });

      const now = new Date();
      await db
        .update(industryProfiles)
        .set({ lastViewedAlertsAt: now })
        .where(eq(industryProfiles.userId, userId));

      res.json({ ok: true, lastViewedAt: now.toISOString() });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });
}