import type { Express } from "express";
import { db } from "../db";
import { storage } from "../storage";
import { cacheGet, cacheSet } from "../lib/responseCache";
import { sql, eq, and, inArray, desc } from "drizzle-orm";
import { ingestedAssets, institutionMetadata } from "@shared/schema";
import { ALL_SCRAPERS } from "../lib/scrapers/index";
import { slugifyInstitutionName } from "../lib/institutionSeed";

const INSTITUTIONS_CACHE_KEY = "institutions:all:v4";
const INSTITUTIONS_CACHE_TTL_MS = 5 * 60 * 1000;

export function registerInstitutionRoutes(app: Express): void {
  app.get("/api/institutions/counts", async (_req, res) => {
    try {
      const counts = await storage.getInstitutionAssetCounts();
      res.json(counts);
    } catch (err: any) {
      console.error("[institutions/counts]", err);
      res.status(500).json({ error: "Failed to fetch counts" });
    }
  });

  // Canonical membership = ALL_SCRAPERS where scraperType !== "stub" (mirrors
  // Admin → Data Health). institution_metadata is a display overlay (city,
  // TTO, specialties, continent, restriction flags) and never adds members.
  // Stub scrapers (no real portal) and orphaned ingested_assets rows are
  // excluded so the public Institutions grid matches Data Health (~330–340).
  // ingested_assets is still LEFT-joined for per-card "active listings".
  app.get("/api/institutions", async (_req, res) => {
    try {
      const cached = cacheGet<object>(INSTITUTIONS_CACHE_KEY);
      if (cached) return res.json(cached);

      const [metadataRows, counts, biologyAgg] = await Promise.all([
        db.select().from(institutionMetadata),
        storage.getInstitutionAssetCounts(),
        db.execute<{ institution: string; biologies: string[] }>(sql`
          SELECT institution, array_agg(biology ORDER BY cnt DESC) AS biologies
          FROM (
            SELECT institution, biology, COUNT(*) AS cnt
            FROM ingested_assets
            WHERE biology IS NOT NULL AND biology NOT IN ('unknown', '')
            GROUP BY institution, biology
          ) sub
          GROUP BY institution
        `),
      ]);

      const metaBySlug = new Map(metadataRows.map((m) => [m.slug, m]));

      // Fold ingested counts (keyed by raw name) into canonical slug space so
      // name variants ("MIT" vs "Massachusetts Institute of Technology") merge.
      const countBySlug = new Map<string, number>();
      const nameBySlug = new Map<string, string>();
      for (const [rawName, n] of Object.entries(counts)) {
        const slug = slugifyInstitutionName(rawName);
        countBySlug.set(slug, (countBySlug.get(slug) ?? 0) + n);
        if (!nameBySlug.has(slug)) nameBySlug.set(slug, rawName);
      }

      // Build top-2 biology map in canonical slug space.
      const biologyBySlug = new Map<string, string[]>();
      for (const row of biologyAgg.rows) {
        const slug = slugifyInstitutionName(row.institution);
        const existing = biologyBySlug.get(slug) ?? [];
        biologyBySlug.set(slug, existing);
        for (const b of (row.biologies ?? [])) {
          if (!existing.includes(b) && existing.length < 2) existing.push(b);
        }
      }

      // Membership: only non-stub scrapers (mirrors Admin Data Health).
      const slugSet = new Set<string>();
      for (const s of ALL_SCRAPERS.filter((x) => x.scraperType !== "stub")) {
        const slug = slugifyInstitutionName(s.institution);
        slugSet.add(slug);
        if (!nameBySlug.has(slug)) nameBySlug.set(slug, s.institution);
      }

      const institutions = Array.from(slugSet).map((slug) => {
        const meta = metaBySlug.get(slug);
        const fallbackName = nameBySlug.get(slug) ?? slug;
        return {
          slug,
          name: meta?.name ?? fallbackName,
          city: meta?.city ?? null,
          ttoName: meta?.ttoName ?? null,
          website: meta?.website ?? null,
          specialties: meta?.specialties ?? [],
          continent: meta?.continent ?? null,
          noPublicPortal: meta?.noPublicPortal ?? false,
          accessRestricted: meta?.accessRestricted ?? false,
          // `count` is the legacy field name used across Sources/Dashboard/etc;
          // `activeListings` is the spec-named alias for new consumers. Keep
          // both until migration completes.
          count: countBySlug.get(slug) ?? 0,
          activeListings: countBySlug.get(slug) ?? 0,
          topBiology: biologyBySlug.get(slug) ?? [],
        };
      });

      institutions.sort((a, b) => a.name.localeCompare(b.name));
      const payload = { institutions, total: institutions.length };
      cacheSet(INSTITUTIONS_CACHE_KEY, payload, INSTITUTIONS_CACHE_TTL_MS);
      res.json(payload);
    } catch (err: any) {
      console.error("[institutions/list]", err);
      res.status(500).json({ error: "Failed to fetch institutions" });
    }
  });

  // Returns portfolio intelligence for a single institution: biology drivers,
  // stage mix, top indications, and standout assets (highest completeness).
  app.get("/api/institutions/:slug/profile", async (req, res) => {
    try {
      const slug = req.params.slug;
      const [meta, counts] = await Promise.all([
        db
          .select({ name: institutionMetadata.name })
          .from(institutionMetadata)
          .where(eq(institutionMetadata.slug, slug))
          .limit(1),
        storage.getInstitutionAssetCounts(),
      ]);

      const aliasNames = new Set<string>();
      if (meta[0]?.name) aliasNames.add(meta[0].name);
      for (const s of ALL_SCRAPERS) {
        if (slugifyInstitutionName(s.institution) === slug) aliasNames.add(s.institution);
      }
      for (const rawName of Object.keys(counts)) {
        if (slugifyInstitutionName(rawName) === slug) aliasNames.add(rawName);
      }

      if (!aliasNames.size) {
        return res.json({ biologyBreakdown: [], stageBreakdown: [], topIndications: [], standoutAssets: [], totalAssets: 0 });
      }

      const names = Array.from(aliasNames);
      const [biologyRows, stageRows, indicationRows, standoutRows, totalRow] = await Promise.all([
        db
          .select({ label: ingestedAssets.biology, cnt: sql<number>`count(*)::int` })
          .from(ingestedAssets)
          .where(and(inArray(ingestedAssets.institution, names), sql`biology IS NOT NULL AND biology NOT IN ('unknown', '')`))
          .groupBy(ingestedAssets.biology)
          .orderBy(desc(sql`count(*)`))
          .limit(8),
        db
          .select({ stage: ingestedAssets.developmentStage, cnt: sql<number>`count(*)::int` })
          .from(ingestedAssets)
          .where(and(inArray(ingestedAssets.institution, names), sql`development_stage IS NOT NULL AND development_stage NOT IN ('unknown', '')`))
          .groupBy(ingestedAssets.developmentStage)
          .orderBy(desc(sql`count(*)`)),
        db
          .select({ indication: ingestedAssets.indication, cnt: sql<number>`count(*)::int` })
          .from(ingestedAssets)
          .where(and(inArray(ingestedAssets.institution, names), sql`indication IS NOT NULL AND indication NOT IN ('unknown', '', 'not applicable', 'N/A', 'n/a')`))
          .groupBy(ingestedAssets.indication)
          .orderBy(desc(sql`count(*)`))
          .limit(5),
        db
          .select({
            id: ingestedAssets.id,
            assetName: ingestedAssets.assetName,
            completenessScore: ingestedAssets.completenessScore,
            developmentStage: ingestedAssets.developmentStage,
            indication: ingestedAssets.indication,
          })
          .from(ingestedAssets)
          .where(and(inArray(ingestedAssets.institution, names), sql`completeness_score IS NOT NULL`))
          .orderBy(desc(ingestedAssets.completenessScore))
          .limit(3),
        db
          .select({ cnt: sql<number>`count(*)::int` })
          .from(ingestedAssets)
          .where(inArray(ingestedAssets.institution, names)),
      ]);

      res.json({
        biologyBreakdown: biologyRows.map((r) => ({ label: r.label, count: r.cnt })),
        stageBreakdown: stageRows.map((r) => ({ stage: r.stage, count: r.cnt })),
        topIndications: indicationRows.map((r) => r.indication).filter(Boolean),
        standoutAssets: standoutRows.map((r) => ({
          id: r.id,
          assetName: r.assetName,
          completenessScore: r.completenessScore ?? 0,
          developmentStage: r.developmentStage,
          indication: r.indication,
        })),
        totalAssets: totalRow[0]?.cnt ?? 0,
      });
    } catch (err: any) {
      console.error("[institutions/profile]", err);
      res.status(500).json({ error: "Failed to fetch institution profile" });
    }
  });

  app.get("/api/institutions/:slug/assets", async (req, res) => {
    try {
      // Slug → assets resolution. Membership is canonical-by-slug, so we
      // gather EVERY raw institution name (from metadata, scrapers, and
      // ingested_assets) whose slug matches and query all aliases at once.
      // The display name is the metadata overlay if present, else the first
      // scraper/ingested name, else a titleized slug.
      const slug = req.params.slug;
      const [meta, counts] = await Promise.all([
        db
          .select({ name: institutionMetadata.name })
          .from(institutionMetadata)
          .where(eq(institutionMetadata.slug, slug))
          .limit(1),
        storage.getInstitutionAssetCounts(),
      ]);

      const aliasNames = new Set<string>();
      if (meta[0]?.name) aliasNames.add(meta[0].name);
      for (const s of ALL_SCRAPERS) {
        if (slugifyInstitutionName(s.institution) === slug) {
          aliasNames.add(s.institution);
        }
      }
      for (const rawName of Object.keys(counts)) {
        if (slugifyInstitutionName(rawName) === slug) {
          aliasNames.add(rawName);
        }
      }

      const displayName =
        meta[0]?.name ??
        Array.from(aliasNames)[0] ??
        slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

      const assets = aliasNames.size
        ? await storage.getIngestedAssetsByInstitutionNames(Array.from(aliasNames))
        : await storage.getIngestedAssetsByInstitution(displayName);
      res.json({ assets, institution: displayName });
    } catch (err: any) {
      console.error("[institutions/assets]", err);
      res.status(500).json({ error: "Failed to fetch assets" });
    }
  });
}
