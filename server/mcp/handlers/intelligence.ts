/**
 * MCP handlers: get_convergence_signals, get_trending_areas
 *
 * Enterprise tier only.
 */

import { db } from "../../db";
import { convergenceSignals, ingestedAssets } from "../../../shared/schema";
import { eq, sql, desc } from "drizzle-orm";
import type { ToolConfig } from "../config";

export async function handleGetConvergenceSignals(
  args: Record<string, unknown>,
  cfg: ToolConfig,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const limit = Math.min(Number(args.limit ?? cfg.maxResults), cfg.maxResults!);
  const minInstitutions = Number(args.minInstitutions ?? 2);

  const rows = await db
    .select()
    .from(convergenceSignals)
    .where(
      minInstitutions > 1
        ? sql`institution_count >= ${minInstitutions}`
        : undefined,
    )
    .orderBy(desc(convergenceSignals.score))
    .limit(limit);

  const results = rows.map((s) => ({
    id: s.id,
    therapyArea: s.therapyArea,
    targetOrMechanism: s.targetOrMechanism,
    institutionCount: s.institutionCount,
    institutions: s.institutions ?? [],
    score: s.score,
    assetCount: (s.assetIds as number[] | null)?.length ?? 0,
    detectedAt: s.detectedAt.toISOString(),
    lastUpdatedAt: s.lastUpdatedAt.toISOString(),
  }));

  return {
    content: [{ type: "text", text: JSON.stringify({ count: results.length, signals: results }, null, 2) }],
  };
}

export async function handleGetTrendingAreas(
  args: Record<string, unknown>,
  cfg: ToolConfig,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const limit = Math.min(Number(args.limit ?? cfg.maxResults), cfg.maxResults!);
  const windowDays = Number(args.windowDays ?? 90);
  const cutoff = new Date(Date.now() - windowDays * 86_400_000);

  // Count new relevant assets per therapy area (indication) in the window
  const rows = await db
    .select({
      indication: ingestedAssets.indication,
      newAssets: sql<number>`count(*)::int`,
      avgCompleteness: sql<number>`avg(completeness_score)::real`,
      institutions: sql<string[]>`array_agg(distinct institution)`,
    })
    .from(ingestedAssets)
    .where(
      sql`relevant = true AND first_seen_at >= ${cutoff.toISOString()}::timestamptz AND indication IS NOT NULL AND indication != 'unknown'`,
    )
    .groupBy(ingestedAssets.indication)
    .orderBy(sql`count(*) DESC`)
    .limit(limit);

  // Enrich with convergence signal scores where we have them
  const indications = rows.map((r) => r.indication).filter(Boolean) as string[];
  const signals = indications.length
    ? await db
        .select({ therapyArea: convergenceSignals.therapyArea, score: convergenceSignals.score })
        .from(convergenceSignals)
        .where(sql`therapy_area = ANY(${indications}::text[])`)
    : [];

  const signalByArea = new Map(signals.map((s) => [s.therapyArea, s.score]));

  const results = rows.map((r) => ({
    indication: r.indication,
    newAssetsInWindow: r.newAssets,
    avgCompleteness: r.avgCompleteness ? Math.round(r.avgCompleteness) : null,
    institutionCount: (r.institutions as string[])?.length ?? 0,
    institutions: r.institutions ?? [],
    convergenceScore: signalByArea.get(r.indication!) ?? null,
    windowDays,
  }));

  return {
    content: [{ type: "text", text: JSON.stringify({ count: results.length, trendingAreas: results }, null, 2) }],
  };
}
