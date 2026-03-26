import { db } from "../../db";
import { ingestedAssets } from "@shared/schema";
import { eq } from "drizzle-orm";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SIMILARITY_THRESHOLD = 0.92;
const EMBED_CONCURRENCY = 20;

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
}

async function embedTexts(texts: string[]): Promise<number[][]> {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: texts,
  });
  return response.data.map((d) => d.embedding);
}

export async function runNearDuplicateDetection(onProgress?: (msg: string) => void): Promise<{
  embedded: number;
  flagged: number;
  pairs: Array<{ idA: number; idB: number; similarity: number }>;
}> {
  onProgress?.("Loading assets for dedup embedding...");

  const rows = await db
    .select({
      id: ingestedAssets.id,
      assetName: ingestedAssets.assetName,
      indication: ingestedAssets.indication,
      target: ingestedAssets.target,
      dedupeEmbedding: ingestedAssets.dedupeEmbedding,
      duplicateFlag: ingestedAssets.duplicateFlag,
    })
    .from(ingestedAssets)
    .where(eq(ingestedAssets.duplicateFlag, false))
    .limit(5000);

  // Separate assets that need embedding from already-embedded ones
  const toEmbed = rows.filter((r) => !r.dedupeEmbedding || r.dedupeEmbedding.length === 0);
  onProgress?.(`Embedding ${toEmbed.length} assets (${rows.length - toEmbed.length} already embedded)...`);

  // Track embeddings in a dedicated map — never mutate Drizzle row objects
  const embeddingMap = new Map<number, number[]>();

  // Seed map from already-embedded rows
  for (const row of rows) {
    if (row.dedupeEmbedding && row.dedupeEmbedding.length > 0) {
      embeddingMap.set(row.id, row.dedupeEmbedding);
    }
  }

  // Embed in parallel batches and persist to DB
  let embeddedCount = 0;
  for (let i = 0; i < toEmbed.length; i += EMBED_CONCURRENCY) {
    const chunk = toEmbed.slice(i, i + EMBED_CONCURRENCY);
    const inputs = chunk.map((r) =>
      [r.assetName, r.indication ?? "", r.target ?? ""].filter(Boolean).join(" | ")
    );
    try {
      const embeddings = await embedTexts(inputs);
      for (let j = 0; j < chunk.length; j++) {
        const item = chunk[j];
        const emb = embeddings[j];
        if (!item || !emb) continue;
        await db
          .update(ingestedAssets)
          .set({ dedupeEmbedding: emb })
          .where(eq(ingestedAssets.id, item.id));
        embeddingMap.set(item.id, emb);
        embeddedCount++;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[nearDuplicateDetection] Embedding chunk failed: ${msg}`);
    }
  }

  onProgress?.(`Embedded ${embeddedCount} assets. Running similarity comparison...`);

  // Group by indication to limit comparison scope
  const indicationGroups = new Map<string, number[]>();
  for (const row of rows) {
    if (!embeddingMap.has(row.id)) continue;
    const key = (row.indication ?? "unknown").toLowerCase().trim();
    if (!indicationGroups.has(key)) indicationGroups.set(key, []);
    indicationGroups.get(key)!.push(row.id);
  }

  const flaggedPairs: Array<{ idA: number; idB: number; similarity: number }> = [];
  const flaggedIds = new Set<number>();

  for (const [, groupIds] of indicationGroups) {
    if (groupIds.length < 2) continue;
    for (let i = 0; i < groupIds.length; i++) {
      for (let j = i + 1; j < groupIds.length; j++) {
        const idA = groupIds[i];
        const idB = groupIds[j];
        if (idA === undefined || idB === undefined) continue;
        const embA = embeddingMap.get(idA);
        const embB = embeddingMap.get(idB);
        if (!embA || !embB) continue;
        const sim = cosineSimilarity(embA, embB);
        if (sim >= SIMILARITY_THRESHOLD) {
          flaggedPairs.push({ idA, idB, similarity: sim });
          // Flag the higher ID (newer) as duplicate of the lower ID (older)
          const dupeId = Math.max(idA, idB);
          const canonId = Math.min(idA, idB);
          if (!flaggedIds.has(dupeId)) {
            flaggedIds.add(dupeId);
            await db
              .update(ingestedAssets)
              .set({ duplicateFlag: true, duplicateOfId: canonId, dedupeSimilarity: sim })
              .where(eq(ingestedAssets.id, dupeId));
          }
        }
      }
    }
  }

  onProgress?.(`Near-duplicate detection complete. ${flaggedPairs.length} pairs found, ${flaggedIds.size} assets flagged.`);

  return {
    embedded: embeddedCount,
    flagged: flaggedIds.size,
    pairs: flaggedPairs,
  };
}
