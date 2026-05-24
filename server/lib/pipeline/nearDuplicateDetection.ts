import { db } from "../../db";
import { ingestedAssets } from "@shared/schema";
import { eq, gt, and, isNull } from "drizzle-orm";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SIMILARITY_THRESHOLD = 0.92;
const CROSS_INST_THRESHOLD = 0.95;
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

  // Paginate through the full eligible corpus in stable ID order (no row cap).
  const PAGE_SIZE = 1000;
  type DedupeRow = {
    id: number;
    assetName: string;
    institution: string;
    indication: string | null;
    target: string | null;
    dedupeEmbedding: number[] | null;
    duplicateFlag: boolean | null;
    completenessScore: number | null;
    duplicateOfId: number | null;
    canonicalAssetId: number | null;
  };
  const rows: DedupeRow[] = [];
  let lastId = 0;
  while (true) {
    const page = await db
      .select({
        id: ingestedAssets.id,
        assetName: ingestedAssets.assetName,
        institution: ingestedAssets.institution,
        indication: ingestedAssets.indication,
        target: ingestedAssets.target,
        dedupeEmbedding: ingestedAssets.dedupeEmbedding,
        duplicateFlag: ingestedAssets.duplicateFlag,
        completenessScore: ingestedAssets.completenessScore,
        duplicateOfId: ingestedAssets.duplicateOfId,
        canonicalAssetId: ingestedAssets.canonicalAssetId,
      })
      .from(ingestedAssets)
      .where(and(eq(ingestedAssets.duplicateFlag, false), gt(ingestedAssets.id, lastId)))
      .orderBy(ingestedAssets.id)
      .limit(PAGE_SIZE);
    if (page.length === 0) break;
    rows.push(...page);
    lastId = page[page.length - 1]!.id;
    if (page.length < PAGE_SIZE) break;
  }

  // Separate assets that need embedding from already-embedded ones
  const toEmbed = rows.filter((r) => !r.dedupeEmbedding || r.dedupeEmbedding.length === 0);
  onProgress?.(`Loaded ${rows.length} assets. Embedding ${toEmbed.length} (${rows.length - toEmbed.length} already embedded)...`);

  const embeddingMap = new Map<number, number[]>();
  const scoreMap = new Map<number, number>();
  const suppressedPairs = new Set<string>();
  for (const row of rows) {
    if (row.dedupeEmbedding && row.dedupeEmbedding.length > 0) {
      embeddingMap.set(row.id, row.dedupeEmbedding);
    }
    scoreMap.set(row.id, row.completenessScore ?? 0);
    if (row.duplicateOfId != null) {
      suppressedPairs.add(`${row.id}:${row.duplicateOfId}`);
      suppressedPairs.add(`${row.duplicateOfId}:${row.id}`);
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

  onProgress?.(`Embedded ${embeddedCount} assets. Running same-institution similarity comparison...`);

  // ── Pass 1: Same-institution dedup (original logic) ──────────────────────
  // Group by institution + indication to restrict comparisons to within one school.
  const sameInstGroups = new Map<string, number[]>();
  for (const row of rows) {
    if (!embeddingMap.has(row.id)) continue;
    const inst = row.institution.toLowerCase().trim();
    const ind = (row.indication ?? "unknown").toLowerCase().trim();
    const key = `${inst}||${ind}`;
    if (!sameInstGroups.has(key)) sameInstGroups.set(key, []);
    sameInstGroups.get(key)!.push(row.id);
  }

  const flaggedPairs: Array<{ idA: number; idB: number; similarity: number }> = [];
  const flaggedIds = new Set<number>();

  for (const [, groupIds] of sameInstGroups) {
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
          const scoreA = scoreMap.get(idA) ?? 0;
          const scoreB = scoreMap.get(idB) ?? 0;
          const canonId = scoreA >= scoreB ? idA : idB;
          const dupeId = scoreA >= scoreB ? idB : idA;
          const pairKey = `${dupeId}:${canonId}`;
          if (!flaggedIds.has(dupeId) && !suppressedPairs.has(pairKey)) {
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

  onProgress?.(`Same-institution pass: ${flaggedPairs.length} pairs. Running cross-institution embedding pass...`);

  // ── Pass 2: Cross-institution canonical dedup ─────────────────────────────
  // Only consider canonical assets (no same-inst duplicate flag, no existing
  // cross-inst canonicalAssetId). Group by indication only — omit institution
  // from the key so comparisons cross institutional boundaries.
  // Use a higher threshold (0.95) to avoid false positives across schools.
  const crossInstGroups = new Map<string, Array<{ id: number; institution: string }>>();
  for (const row of rows) {
    if (!embeddingMap.has(row.id)) continue;
    if (row.canonicalAssetId != null) continue; // already linked
    const ind = (row.indication ?? "unknown").toLowerCase().trim();
    if (!crossInstGroups.has(ind)) crossInstGroups.set(ind, []);
    crossInstGroups.get(ind)!.push({ id: row.id, institution: row.institution });
  }

  let crossInstLinked = 0;

  for (const [, groupEntries] of crossInstGroups) {
    if (groupEntries.length < 2) continue;

    // Only compare pairs from different institutions
    for (let i = 0; i < groupEntries.length; i++) {
      for (let j = i + 1; j < groupEntries.length; j++) {
        const entA = groupEntries[i];
        const entB = groupEntries[j];
        if (!entA || !entB) continue;
        // Skip same-institution pairs — handled by Pass 1
        if (entA.institution.toLowerCase().trim() === entB.institution.toLowerCase().trim()) continue;

        const embA = embeddingMap.get(entA.id);
        const embB = embeddingMap.get(entB.id);
        if (!embA || !embB) continue;

        const sim = cosineSimilarity(embA, embB);
        if (sim >= CROSS_INST_THRESHOLD) {
          // Canonical = higher completeness score; tie-break by lower ID (older = canonical)
          const scoreA = scoreMap.get(entA.id) ?? 0;
          const scoreB = scoreMap.get(entB.id) ?? 0;
          const canonId = scoreA >= scoreB ? entA.id : entB.id;
          const dupeId  = scoreA >= scoreB ? entB.id : entA.id;

          // Only link the dupe if it isn't already canonical_asset_id-linked
          const dupeRow = rows.find((r) => r.id === dupeId);
          if (dupeRow?.canonicalAssetId == null) {
            await db
              .update(ingestedAssets)
              .set({ canonicalAssetId: canonId })
              .where(eq(ingestedAssets.id, dupeId));
            // Update in-memory to prevent re-linking in subsequent iterations
            const dupeEntry = groupEntries.find((e) => e?.id === dupeId);
            if (dupeEntry) {
              const r = rows.find((row) => row.id === dupeId);
              if (r) r.canonicalAssetId = canonId;
            }
            crossInstLinked++;
            flaggedPairs.push({ idA: canonId, idB: dupeId, similarity: sim });
          }
        }
      }
    }
  }

  onProgress?.(`Near-duplicate detection complete. ${flaggedIds.size} same-inst assets flagged, ${crossInstLinked} cross-inst assets linked to canonicals.`);

  return {
    embedded: embeddedCount,
    flagged: flaggedIds.size + crossInstLinked,
    pairs: flaggedPairs,
  };
}
