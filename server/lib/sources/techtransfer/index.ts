import { and, eq, or, ilike, desc, sql } from "drizzle-orm";
import { db } from "../../../db";
import { ingestedAssets } from "@shared/schema";
import type { RawSignal } from "../../types";

function toSignal(asset: typeof ingestedAssets.$inferSelect): RawSignal {
  return {
    id: String(asset.id),
    source_type: "tech_transfer" as const,
    title: asset.assetName,
    text: asset.summary,
    authors_or_owner: asset.institution,
    institution_or_sponsor: asset.institution,
    date: asset.lastSeenAt.toISOString().slice(0, 10),
    stage_hint: asset.developmentStage,
    url: asset.sourceUrl ?? "",
    metadata: {
      target: asset.target,
      modality: asset.modality,
      indication: asset.indication,
    },
  };
}

export async function searchTechTransfer(query: string, maxResults = 50): Promise<RawSignal[]> {
  try {
    const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);

    let rows;
    if (terms.length > 0) {
      const conditions = terms.flatMap((t) => [
        ilike(ingestedAssets.assetName, `%${t}%`),
        ilike(ingestedAssets.summary, `%${t}%`),
      ]);
      rows = await db
        .select()
        .from(ingestedAssets)
        .where(and(eq(ingestedAssets.sourceType, "tech_transfer"), or(...conditions)))
        .orderBy(desc(ingestedAssets.lastSeenAt))
        .limit(maxResults);
    } else {
      rows = await db
        .select()
        .from(ingestedAssets)
        .where(eq(ingestedAssets.sourceType, "tech_transfer"))
        .orderBy(desc(ingestedAssets.lastSeenAt))
        .limit(maxResults);
    }

    return rows.map(toSignal);
  } catch (err: any) {
    console.warn("[techtransfer] DB search failed:", err?.message);
    return [];
  }
}
