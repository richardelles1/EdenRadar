/**
 * MCP handlers: search_assets, get_asset, search_assets_deep
 */

import { db } from "../../db";
import { ingestedAssets } from "../../../shared/schema";
import { eq, and, ilike, or, sql } from "drizzle-orm";
import type { ToolConfig } from "../config";

// ── Shared shape helpers ─────────────────────────────────────────────────────

function summaryShape(a: typeof ingestedAssets.$inferSelect) {
  return {
    id: a.id,
    assetName: a.assetName,
    institution: a.institution,
    indication: a.indication ?? "unknown",
    modality: a.modality ?? "unknown",
    developmentStage: a.developmentStage,
    summary: a.summary.slice(0, 300),
    sourceUrl: a.sourceUrl ?? null,
  };
}

function detailShape(a: typeof ingestedAssets.$inferSelect) {
  return {
    id: a.id,
    assetName: a.assetName,
    institution: a.institution,
    indication: a.indication ?? "unknown",
    target: a.target ?? "unknown",
    modality: a.modality ?? "unknown",
    developmentStage: a.developmentStage,
    biology: a.biology ?? null,
    mechanismOfAction: a.mechanismOfAction ?? null,
    innovationClaim: a.innovationClaim ?? null,
    unmetNeed: a.unmetNeed ?? null,
    ipType: a.ipType ?? null,
    patentStatus: a.patentStatus ?? null,
    licensingStatus: a.licensingStatus ?? null,
    licensingReadiness: a.licensingReadiness ?? null,
    contactEmail: a.contactEmail ?? null,
    summary: a.summary,
    abstract: a.abstract ?? null,
    sourceUrl: a.sourceUrl ?? null,
    firstSeenAt: a.firstSeenAt?.toISOString() ?? null,
    completenessScore: a.completenessScore ?? null,
  };
}

export async function handleSearchAssets(
  args: Record<string, unknown>,
  cfg: ToolConfig,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const query = String(args.query ?? "").trim();
  const limit = Math.min(Number(args.limit ?? cfg.maxResults), cfg.maxResults!);

  const conditions = [eq(ingestedAssets.relevant, true)];

  if (query) {
    conditions.push(
      or(
        ilike(ingestedAssets.assetName, `%${query}%`),
        ilike(ingestedAssets.indication, `%${query}%`),
        ilike(ingestedAssets.target, `%${query}%`),
        ilike(ingestedAssets.summary, `%${query}%`),
      )!,
    );
  }
  if (args.institution) {
    conditions.push(ilike(ingestedAssets.institution, `%${String(args.institution)}%`));
  }
  if (args.modality) {
    conditions.push(ilike(ingestedAssets.modality, `%${String(args.modality)}%`));
  }
  if (args.stage) {
    conditions.push(ilike(ingestedAssets.developmentStage, `%${String(args.stage)}%`));
  }

  const rows = await db
    .select()
    .from(ingestedAssets)
    .where(and(...conditions))
    .limit(limit)
    .orderBy(sql`completeness_score DESC NULLS LAST`);

  const results = rows.map(summaryShape);
  return {
    content: [{ type: "text", text: JSON.stringify({ count: results.length, assets: results }, null, 2) }],
  };
}

export async function handleGetAsset(
  args: Record<string, unknown>,
  cfg: ToolConfig,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const id = args.id ? Number(args.id) : null;
  const fingerprint = args.fingerprint ? String(args.fingerprint) : null;

  if (!id && !fingerprint) {
    return { content: [{ type: "text", text: JSON.stringify({ error: "Provide id or fingerprint" }) }] };
  }

  const condition = id
    ? eq(ingestedAssets.id, id)
    : eq(ingestedAssets.fingerprint, fingerprint!);

  const rows = await db.select().from(ingestedAssets).where(condition).limit(1);
  if (!rows[0]) {
    return { content: [{ type: "text", text: JSON.stringify({ error: "Asset not found" }) }] };
  }

  const result = cfg.depth === "detail" ? detailShape(rows[0]) : summaryShape(rows[0]);
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}

export async function handleSearchAssetsDeep(
  args: Record<string, unknown>,
  cfg: ToolConfig,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const query = String(args.query ?? "").trim();
  const limit = Math.min(Number(args.limit ?? cfg.maxResults), cfg.maxResults!);

  const conditions = [eq(ingestedAssets.relevant, true)];

  if (query) {
    conditions.push(
      or(
        ilike(ingestedAssets.assetName, `%${query}%`),
        ilike(ingestedAssets.indication, `%${query}%`),
        ilike(ingestedAssets.target, `%${query}%`),
        ilike(ingestedAssets.biology, `%${query}%`),
        ilike(ingestedAssets.mechanismOfAction, `%${query}%`),
        ilike(ingestedAssets.summary, `%${query}%`),
      )!,
    );
  }
  if (args.institution) {
    conditions.push(ilike(ingestedAssets.institution, `%${String(args.institution)}%`));
  }
  if (args.modality) {
    conditions.push(ilike(ingestedAssets.modality, `%${String(args.modality)}%`));
  }
  if (args.stage) {
    conditions.push(ilike(ingestedAssets.developmentStage, `%${String(args.stage)}%`));
  }
  if (args.biology) {
    conditions.push(ilike(ingestedAssets.biology, `%${String(args.biology)}%`));
  }

  const rows = await db
    .select()
    .from(ingestedAssets)
    .where(and(...conditions))
    .limit(limit)
    .orderBy(sql`completeness_score DESC NULLS LAST`);

  const results = rows.map(detailShape);
  return {
    content: [{ type: "text", text: JSON.stringify({ count: results.length, assets: results }, null, 2) }],
  };
}
