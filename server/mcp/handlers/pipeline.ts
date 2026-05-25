/**
 * MCP handlers: list_pipelines, get_pipeline, save_to_pipeline, remove_from_pipeline
 *
 * All require professional+ tier and a userId from the API key.
 */

import { db } from "../../db";
import { pipelineLists, savedAssets, ingestedAssets } from "../../../shared/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import type { ToolConfig } from "../config";

export async function handleListPipelines(
  args: Record<string, unknown>,
  cfg: ToolConfig,
  userId: string,
  orgId?: number,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const limit = Math.min(Number(args.limit ?? cfg.maxResults), cfg.maxResults!);

  const condition = orgId
    ? eq(pipelineLists.orgId, orgId)
    : eq(pipelineLists.userId, userId);

  const lists = await db
    .select()
    .from(pipelineLists)
    .where(condition)
    .limit(limit)
    .orderBy(pipelineLists.updatedAt);

  if (lists.length === 0) {
    return { content: [{ type: "text", text: JSON.stringify({ count: 0, pipelines: [] }, null, 2) }] };
  }

  // Single query to count assets per list
  const listIds = lists.map((l) => l.id);
  const countRows = await db
    .select({
      pipelineListId: savedAssets.pipelineListId,
      assetCount: sql<number>`count(*)::int`,
    })
    .from(savedAssets)
    .where(inArray(savedAssets.pipelineListId, listIds))
    .groupBy(savedAssets.pipelineListId);

  const countByList = new Map(countRows.map((r) => [r.pipelineListId, r.assetCount]));

  const results = lists.map((list) => ({
    id: list.id,
    name: list.name,
    assetCount: countByList.get(list.id) ?? 0,
    createdAt: list.createdAt.toISOString(),
    updatedAt: list.updatedAt.toISOString(),
  }));

  return {
    content: [{ type: "text", text: JSON.stringify({ count: results.length, pipelines: results }, null, 2) }],
  };
}

export async function handleGetPipeline(
  args: Record<string, unknown>,
  cfg: ToolConfig,
  userId: string,
  orgId?: number,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const pipelineId = Number(args.pipelineId);
  if (!pipelineId) {
    return { content: [{ type: "text", text: JSON.stringify({ error: "Provide pipelineId" }) }] };
  }

  const [list] = await db.select().from(pipelineLists).where(eq(pipelineLists.id, pipelineId)).limit(1);
  if (!list) {
    return { content: [{ type: "text", text: JSON.stringify({ error: "Pipeline not found" }) }] };
  }

  // Ownership check
  const isOwner = orgId ? list.orgId === orgId : list.userId === userId;
  if (!isOwner) {
    return { content: [{ type: "text", text: JSON.stringify({ error: "Access denied" }) }] };
  }

  const limit = Math.min(Number(args.limit ?? cfg.maxResults), cfg.maxResults!);
  const assets = await db
    .select()
    .from(savedAssets)
    .where(eq(savedAssets.pipelineListId, pipelineId))
    .limit(limit);

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        pipeline: { id: list.id, name: list.name },
        assets: assets.map((a) => ({
          id: a.id,
          assetName: a.assetName,
          target: a.target,
          modality: a.modality,
          developmentStage: a.developmentStage,
          diseaseIndication: a.diseaseIndication,
          status: a.status ?? null,
          savedAt: a.savedAt.toISOString(),
        })),
      }, null, 2),
    }],
  };
}

export async function handleSaveToPipeline(
  args: Record<string, unknown>,
  _cfg: ToolConfig,
  userId: string,
  orgId?: number,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const pipelineId = Number(args.pipelineId);
  const assetId = Number(args.assetId);

  if (!pipelineId || !assetId) {
    return { content: [{ type: "text", text: JSON.stringify({ error: "Provide pipelineId and assetId" }) }] };
  }

  // Verify pipeline ownership
  const [list] = await db.select().from(pipelineLists).where(eq(pipelineLists.id, pipelineId)).limit(1);
  if (!list) return { content: [{ type: "text", text: JSON.stringify({ error: "Pipeline not found" }) }] };

  const isOwner = orgId ? list.orgId === orgId : list.userId === userId;
  if (!isOwner) return { content: [{ type: "text", text: JSON.stringify({ error: "Access denied" }) }] };

  // Load the asset
  const [asset] = await db.select().from(ingestedAssets).where(eq(ingestedAssets.id, assetId)).limit(1);
  if (!asset) return { content: [{ type: "text", text: JSON.stringify({ error: "Asset not found" }) }] };

  // Check not already saved
  const [existing] = await db
    .select()
    .from(savedAssets)
    .where(and(eq(savedAssets.pipelineListId, pipelineId), eq(savedAssets.ingestedAssetId, assetId)))
    .limit(1);

  if (existing) {
    return { content: [{ type: "text", text: JSON.stringify({ message: "Already in pipeline", savedAssetId: existing.id }) }] };
  }

  const [saved] = await db
    .insert(savedAssets)
    .values({
      userId,
      ingestedAssetId: assetId,
      pipelineListId: pipelineId,
      assetName: asset.assetName,
      target: asset.target ?? "unknown",
      modality: asset.modality ?? "unknown",
      developmentStage: asset.developmentStage,
      diseaseIndication: asset.indication ?? "unknown",
      summary: asset.summary.slice(0, 500),
      sourceTitle: asset.assetName,
      sourceJournal: asset.institution,
      publicationYear: String(asset.firstSeenAt?.getFullYear() ?? new Date().getFullYear()),
      sourceName: asset.sourceName ?? "eden_scout",
      sourceUrl: asset.sourceUrl ?? null,
    })
    .returning();

  return {
    content: [{ type: "text", text: JSON.stringify({ message: "Saved", savedAssetId: saved.id }) }],
  };
}

export async function handleRemoveFromPipeline(
  args: Record<string, unknown>,
  _cfg: ToolConfig,
  userId: string,
  orgId?: number,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const savedAssetId = Number(args.savedAssetId);
  if (!savedAssetId) {
    return { content: [{ type: "text", text: JSON.stringify({ error: "Provide savedAssetId" }) }] };
  }

  const [saved] = await db.select().from(savedAssets).where(eq(savedAssets.id, savedAssetId)).limit(1);
  if (!saved) return { content: [{ type: "text", text: JSON.stringify({ error: "Saved asset not found" }) }] };

  // Verify ownership via pipeline
  if (saved.pipelineListId) {
    const [list] = await db.select().from(pipelineLists).where(eq(pipelineLists.id, saved.pipelineListId)).limit(1);
    if (list) {
      const isOwner = orgId ? list.orgId === orgId : list.userId === userId;
      if (!isOwner) return { content: [{ type: "text", text: JSON.stringify({ error: "Access denied" }) }] };
    }
  } else if (saved.userId !== userId) {
    return { content: [{ type: "text", text: JSON.stringify({ error: "Access denied" }) }] };
  }

  await db.delete(savedAssets).where(eq(savedAssets.id, savedAssetId));
  return { content: [{ type: "text", text: JSON.stringify({ message: "Removed" }) }] };
}
