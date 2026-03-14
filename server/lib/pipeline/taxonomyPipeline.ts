import { db } from "../../db";
import { ingestedAssets, therapyAreaTaxonomy, convergenceSignals } from "@shared/schema";
import { sql, eq, and, isNotNull } from "drizzle-orm";

const THERAPY_AREAS = [
  "oncology", "immunology", "neurology", "cardiology", "infectious disease",
  "rare disease", "metabolic disease", "ophthalmology", "dermatology",
  "respiratory", "gastroenterology", "hematology", "endocrinology",
  "musculoskeletal", "nephrology", "psychiatry", "women's health",
  "pediatrics", "gene therapy", "cell therapy", "diagnostics",
];

export async function refreshTaxonomyCounts(): Promise<void> {
  const assets = await db
    .select({ categories: ingestedAssets.categories })
    .from(ingestedAssets)
    .where(and(eq(ingestedAssets.relevant, true), isNotNull(ingestedAssets.categories)));

  const counts = new Map<string, number>();
  for (const row of assets) {
    const cats = row.categories as string[] | null;
    if (!cats) continue;
    for (const cat of cats) {
      const normalized = cat.toLowerCase().trim();
      counts.set(normalized, (counts.get(normalized) || 0) + 1);
    }
  }

  for (const area of THERAPY_AREAS) {
    const count = counts.get(area) || 0;
    const existing = await db
      .select({ id: therapyAreaTaxonomy.id })
      .from(therapyAreaTaxonomy)
      .where(eq(therapyAreaTaxonomy.name, area))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(therapyAreaTaxonomy)
        .set({ assetCount: count, lastUpdatedAt: new Date() })
        .where(eq(therapyAreaTaxonomy.id, existing[0].id));
    } else {
      await db
        .insert(therapyAreaTaxonomy)
        .values({ name: area, level: 0, assetCount: count });
    }
  }

  const activeNames = new Set(THERAPY_AREAS);
  for (const [area, count] of Array.from(counts.entries())) {
    if (THERAPY_AREAS.includes(area)) continue;
    if (count < 2) continue;
    activeNames.add(area);
    const existing = await db
      .select({ id: therapyAreaTaxonomy.id })
      .from(therapyAreaTaxonomy)
      .where(eq(therapyAreaTaxonomy.name, area))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(therapyAreaTaxonomy)
        .set({ assetCount: count, lastUpdatedAt: new Date() })
        .where(eq(therapyAreaTaxonomy.id, existing[0].id));
    } else {
      await db
        .insert(therapyAreaTaxonomy)
        .values({ name: area, level: 1, assetCount: count });
    }
  }

  const allRows = await db.select({ id: therapyAreaTaxonomy.id, name: therapyAreaTaxonomy.name }).from(therapyAreaTaxonomy);
  for (const row of allRows) {
    if (!activeNames.has(row.name)) {
      await db.update(therapyAreaTaxonomy).set({ assetCount: 0, lastUpdatedAt: new Date() }).where(eq(therapyAreaTaxonomy.id, row.id));
    }
  }
}

export async function detectConvergenceSignals(): Promise<void> {
  const assets = await db
    .select({
      id: ingestedAssets.id,
      target: ingestedAssets.target,
      institution: ingestedAssets.institution,
      categories: ingestedAssets.categories,
      mechanismOfAction: ingestedAssets.mechanismOfAction,
    })
    .from(ingestedAssets)
    .where(and(eq(ingestedAssets.relevant, true), isNotNull(ingestedAssets.categories)));

  const signalMap = new Map<string, {
    therapyArea: string;
    targetOrMechanism: string;
    assetIds: Set<number>;
    institutions: Set<string>;
  }>();

  for (const asset of assets) {
    const cats = (asset.categories as string[] | null) || [];
    const target = (asset.target || "").toLowerCase().trim();
    const moa = (asset.mechanismOfAction || "").toLowerCase().trim();
    const targetOrMech = target && target !== "unknown" ? target : moa && moa !== "unknown" && moa.length > 2 ? moa : null;
    if (!targetOrMech) continue;

    for (const cat of cats) {
      const normalized = cat.toLowerCase().trim();
      const key = `${normalized}::${targetOrMech}`;
      if (!signalMap.has(key)) {
        signalMap.set(key, {
          therapyArea: normalized,
          targetOrMechanism: targetOrMech,
          assetIds: new Set(),
          institutions: new Set(),
        });
      }
      const entry = signalMap.get(key)!;
      entry.assetIds.add(asset.id);
      entry.institutions.add(asset.institution);
    }
  }

  await db.delete(convergenceSignals);

  const signals = Array.from(signalMap.values())
    .filter((s) => s.institutions.size >= 2)
    .sort((a, b) => b.institutions.size - a.institutions.size)
    .slice(0, 100);

  for (const signal of signals) {
    const score = signal.institutions.size * 10 + signal.assetIds.size;
    await db.insert(convergenceSignals).values({
      therapyArea: signal.therapyArea,
      targetOrMechanism: signal.targetOrMechanism,
      institutionCount: signal.institutions.size,
      assetIds: Array.from(signal.assetIds),
      institutions: Array.from(signal.institutions),
      score,
    });
  }
}

export async function getTherapyAreas(): Promise<Array<{ name: string; assetCount: number; level: number }>> {
  const rows = await db
    .select({
      name: therapyAreaTaxonomy.name,
      assetCount: therapyAreaTaxonomy.assetCount,
      level: therapyAreaTaxonomy.level,
    })
    .from(therapyAreaTaxonomy)
    .orderBy(sql`${therapyAreaTaxonomy.assetCount} desc`);
  return rows;
}

export async function getConvergenceSignals(): Promise<Array<{
  therapyArea: string;
  targetOrMechanism: string;
  institutionCount: number;
  score: number;
  institutions: string[];
  assetCount: number;
}>> {
  const rows = await db
    .select({
      therapyArea: convergenceSignals.therapyArea,
      targetOrMechanism: convergenceSignals.targetOrMechanism,
      institutionCount: convergenceSignals.institutionCount,
      score: convergenceSignals.score,
      institutions: convergenceSignals.institutions,
      assetIds: convergenceSignals.assetIds,
    })
    .from(convergenceSignals)
    .orderBy(sql`${convergenceSignals.score} desc`)
    .limit(50);

  return rows.map((r) => ({
    therapyArea: r.therapyArea,
    targetOrMechanism: r.targetOrMechanism,
    institutionCount: r.institutionCount,
    score: r.score,
    institutions: (r.institutions as string[]) || [],
    assetCount: (r.assetIds as number[])?.length || 0,
  }));
}
