import type { Express } from "express";
import { db } from "../db";
import { eq, and, sql, desc, gt } from "drizzle-orm";
import { conceptCards, researchProjects, userAlerts, type UserAlert, ingestedAssets } from "@shared/schema";
import { tryGetUserId } from "../lib/supabaseAuth";

export function registerIndustryRoutes(app: Express): void {
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
      res.status(500).json({ error: "Internal server error" });
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
      res.status(500).json({ error: "Internal server error" });
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
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // â”€â”€ Institutions â€” merged scraped + manual list â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
}