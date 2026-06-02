import type { Express } from "express";
import { db } from "../db";
import { storage } from "../storage";
import { cacheGet, cacheSet } from "../lib/responseCache";
import { sql, eq, and, inArray, desc } from "drizzle-orm";
import { ingestedAssets, institutionMetadata } from "@shared/schema";
import { ALL_SCRAPERS } from "../lib/scrapers/index";
import { slugifyInstitutionName } from "../lib/institutionSeed";

const INSTITUTIONS_CACHE_KEY = "institutions:all:v5";
const INSTITUTIONS_CACHE_TTL_MS = 5 * 60 * 1000;

// Maps ingested indication values → display specialty tags.
// Curated specialties in institution_metadata always take precedence;
// this only fires for institutions with no hand-curated entry.
const INDICATION_TO_SPECIALTY: Record<string, string> = {
  "cancer":                 "Oncology",
  "oncology":               "Oncology",
  "tumor":                  "Oncology",
  "leukemia":               "Oncology",
  "neurological disorder":  "Neuroscience",
  "neuroscience":           "Neuroscience",
  "cns":                    "Neuroscience",
  "neurodegenerative":      "Neuroscience",
  "cardiovascular disease": "Cardiovascular",
  "cardiovascular":         "Cardiovascular",
  "heart disease":          "Cardiovascular",
  "infectious disease":     "Infectious Disease",
  "infection":              "Infectious Disease",
  "bacterial infection":    "Infectious Disease",
  "viral infection":        "Infectious Disease",
  "metabolic disease":      "Metabolic Disease",
  "diabetes":               "Metabolic Disease",
  "obesity":                "Metabolic Disease",
  "rare disease":           "Rare Disease",
  "genetic disorder":       "Rare Disease",
  "orphan disease":         "Rare Disease",
  "autoimmune disease":     "Immunology",
  "autoimmune":             "Immunology",
  "immunology":             "Immunology",
  "inflammatory disease":   "Immunology",
  "respiratory disease":    "Respiratory",
  "pulmonary disease":      "Respiratory",
  "asthma":                 "Respiratory",
  "ophthalmology":          "Ophthalmology",
  "ocular disease":         "Ophthalmology",
  "gene therapy":           "Gene Therapy",
  "cell therapy":           "Cell Therapy",
  "musculoskeletal":        "Musculoskeletal",
  "orthopedic":             "Musculoskeletal",
};

// Removes substring-redundant indications from a count-sorted list.
// Iterates in order; skips any term that is a substring of (or contains)
// an already-accepted term. "prostate cancer" gets dropped when "cancer"
// is already present; "cancer" gets dropped if "prostate cancer" came first.
function deduplicateIndications(indications: string[]): string[] {
  const result: string[] = [];
  for (const ind of indications) {
    const lo = ind.toLowerCase();
    const redundant = result.some((kept) => {
      const klo = kept.toLowerCase();
      return klo.includes(lo) || lo.includes(klo);
    });
    if (!redundant) result.push(ind);
  }
  return result;
}

function deriveSpecialties(indications: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const ind of indications) {
    const specialty = INDICATION_TO_SPECIALTY[ind.toLowerCase().trim()];
    if (specialty && !seen.has(specialty)) {
      seen.add(specialty);
      result.push(specialty);
      if (result.length >= 3) break;
    }
  }
  return result;
}

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

      const [metadataRows, counts, biologyAgg, indicationAgg] = await Promise.all([
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
        db.execute<{ institution: string; indications: string[] }>(sql`
          SELECT institution, array_agg(indication ORDER BY cnt DESC) AS indications
          FROM (
            SELECT institution, indication, COUNT(*) AS cnt
            FROM ingested_assets
            WHERE indication IS NOT NULL
              AND indication NOT IN ('unknown', '', 'not applicable', 'N/A', 'n/a')
            GROUP BY institution, indication
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

      // Build top-N indication list in canonical slug space for specialty derivation.
      const indicationsBySlug = new Map<string, string[]>();
      for (const row of indicationAgg.rows) {
        const slug = slugifyInstitutionName(row.institution);
        const existing = indicationsBySlug.get(slug) ?? [];
        indicationsBySlug.set(slug, existing);
        for (const ind of (row.indications ?? [])) {
          if (!existing.includes(ind)) existing.push(ind);
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
          specialties: (meta?.specialties?.length)
            ? meta.specialties
            : deriveSpecialties(indicationsBySlug.get(slug) ?? []),
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

  // Lightweight metadata for a single institution — avoids fetching the full
  // list just to resolve one slug on the detail page.
  app.get("/api/institutions/:slug", async (req, res) => {
    try {
      const { slug } = req.params;

      const [meta] = await db
        .select()
        .from(institutionMetadata)
        .where(eq(institutionMetadata.slug, slug))
        .limit(1);

      const aliasNames = new Set<string>();
      if (meta?.name) aliasNames.add(meta.name);
      for (const s of ALL_SCRAPERS) {
        if (slugifyInstitutionName(s.institution) === slug) aliasNames.add(s.institution);
      }

      const fallbackName =
        meta?.name ??
        Array.from(aliasNames)[0] ??
        slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

      let specialties: string[] = meta?.specialties ?? [];
      if (!specialties.length && aliasNames.size) {
        const indicationRows = await db
          .select({ indication: ingestedAssets.indication })
          .from(ingestedAssets)
          .where(and(
            inArray(ingestedAssets.institution, Array.from(aliasNames)),
            sql`indication IS NOT NULL AND indication NOT IN ('unknown', '', 'not applicable', 'N/A', 'n/a')`,
          ))
          .groupBy(ingestedAssets.indication)
          .orderBy(desc(sql`count(*)`))
          .limit(10);
        specialties = deriveSpecialties(
          indicationRows.map((r) => r.indication).filter((s): s is string => !!s),
        );
      }

      res.json({
        slug,
        name: fallbackName,
        city: meta?.city ?? null,
        ttoName: meta?.ttoName ?? null,
        website: meta?.website ?? null,
        specialties,
        continent: meta?.continent ?? null,
        noPublicPortal: meta?.noPublicPortal ?? false,
        accessRestricted: meta?.accessRestricted ?? false,
        count: 0,
        activeListings: 0,
        topBiology: [],
      });
    } catch (err: any) {
      console.error("[institutions/meta]", err);
      res.status(500).json({ error: "Failed to fetch institution metadata" });
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
          .limit(12),
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
        topIndications: deduplicateIndications(
          indicationRows.map((r) => r.indication).filter((s): s is string => !!s)
        ).slice(0, 5),
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
      const rawLimit = Math.min(500, Math.max(1, parseInt(String(req.query.limit ?? "200"), 10) || 200));
      const rawPage = Math.max(0, parseInt(String(req.query.page ?? "0"), 10) || 0);
      const offset = rawPage * rawLimit;

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
        ? await storage.getIngestedAssetsByInstitutionNames(Array.from(aliasNames), rawLimit, offset)
        : await storage.getIngestedAssetsByInstitution(displayName, rawLimit, offset);
      res.json({ assets, institution: displayName, page: rawPage, limit: rawLimit, hasMore: assets.length === rawLimit });
    } catch (err: any) {
      console.error("[institutions/assets]", err);
      res.status(500).json({ error: "Failed to fetch assets" });
    }
  });
}
