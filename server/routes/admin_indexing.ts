import type { Express } from "express";
import { z } from "zod";
import { db } from "../db";
import { eq, and, sql, desc, isNull } from "drizzle-orm";
import { storage } from "../storage";
import { conceptCards, researchProjects, ingestedAssets, pipelineLists, savedAssets } from "@shared/schema";
import { ALL_SCRAPERS, getScraperTier } from "../lib/scrapers/index";
import { getSchedulerStatus, getScraperHealthCache } from "../lib/scheduler";
import { getActiveSyncs } from "../lib/ingestion";

export function registerIndexingRoutes(app: Express): void {
  app.get("/api/discoveries", async (_req, res) => {
    try {
      const cards = await storage.getPublishedDiscoveryCards();
      res.json({ cards });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/admin/wipe-assets", async (req, res) => {
    try {
      await storage.wipeAllAssets();
      res.json({ ok: true, message: "All ingested assets wiped" });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
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
      return res.status(500).json({ error: "Internal server error" });
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
      return res.status(500).json({ error: "Internal server error" });
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
      return res.status(500).json({ error: "Internal server error" });
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
      res.status(500).json({ error: "Internal server error" });
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
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // â”€â”€ Indexing Queue quarantine controls â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  app.get("/api/admin/indexing-queue/quarantine-summary", async (req, res) => {
    try {
      const summary = await storage.getQuarantineSummary();
      res.json({ summary });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
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
      res.status(500).json({ error: "Internal server error" });
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
      res.status(500).json({ error: "Internal server error" });
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
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/admin/review-queue", async (req, res) => {
    try {
      const items = await storage.getReviewQueue();
      res.json({ items });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
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
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Admin: research queue â€” all published discovery cards for review
  app.get("/api/admin/research-queue", async (req, res) => {
    try {
      const cards = await storage.getAllDiscoveryCardsForAdmin();
      res.json({ cards });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
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
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/taxonomy/therapy-areas", async (_req, res) => {
    try {
      const { getTherapyAreas } = await import("../lib/pipeline/taxonomyPipeline");
      const areas = await getTherapyAreas();
      res.json({ areas });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/taxonomy/convergence", async (_req, res) => {
    try {
      const { getConvergenceSignals } = await import("../lib/pipeline/taxonomyPipeline");
      const signals = await getConvergenceSignals();
      res.json({ signals });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/admin/taxonomy/refresh", async (req, res) => {
    try {
      const { refreshTaxonomyCounts, detectConvergenceSignals } = await import("../lib/pipeline/taxonomyPipeline");
      await refreshTaxonomyCounts();
      await detectConvergenceSignals();
      res.json({ ok: true, message: "Taxonomy and convergence refreshed" });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
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
          developmentStage: ingestedAssets.developmentStage,
          summary: ingestedAssets.summary,
          mechanismOfAction: ingestedAssets.mechanismOfAction,
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
      res.status(500).json({ error: "Internal server error" });
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
      res.status(500).json({ error: "Internal server error" });
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
      res.status(500).json({ error: "Internal server error" });
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
      res.status(500).json({ error: "Internal server error" });
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
      // EdenRadar/Institutions alongside scraped tech-transfer assets.
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
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // â”€â”€ Admin Analytics â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
      res.status(500).json({ error: "Failed to fetch scan matrix" });
    }
  });

  app.get("/api/admin/collector-health", async (req, res) => {
    try {

      const manualScraperNames = new Set(ALL_SCRAPERS.filter((s) => s.scraperType === "manual").map((s) => s.institution));
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

      const allComputedRows = allInstitutionNames.map((name) => {
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

      const rows = allComputedRows.filter((r) => !manualScraperNames.has(r.institution));
      const manualRows = allComputedRows.filter((r) => manualScraperNames.has(r.institution));

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
        manualRows,
        activeSearchRows,
        totalInDb,
        totalBiotechRelevant,
        totalInstitutions: rows.length,
        totalActiveSearch: manualInsts.length,
        issueCount,
        syncingCount,
        syncedToday,
        scheduler,
      });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch collector health" });
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
      res.status(500).json({ error: "Failed to fetch indexing queue" });
    }
  });

  app.post("/api/admin/new-arrivals/push", async (req, res) => {
    try {
      const body = req.body as { institution?: unknown };
      const institution: string | undefined = typeof body.institution === "string" ? body.institution : undefined;
      const result = await storage.pushNewArrivals(institution);
      res.json({ updated: result.updated, message: `Marked ${result.updated} asset${result.updated !== 1 ? "s" : ""} as enrichment done` });
    } catch (err: any) {
      res.status(500).json({ error: "Push failed" });
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
      res.status(500).json({ error: "Reject failed" });
    }
  });

}