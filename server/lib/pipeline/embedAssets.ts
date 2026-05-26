import OpenAI from "openai";
import { db } from "../../db";
import { sql } from "drizzle-orm";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const EMBED_MODEL = "text-embedding-3-small";
const CONCURRENCY = 50;

export type AssetForEmbedding = {
  id: number;
  assetName: string;
  target: string;
  modality: string;
  indication: string;
  developmentStage: string;
  institution: string;
  summary: string;
  mechanismOfAction: string | null;
  innovationClaim: string | null;
  unmetNeed: string | null;
  comparableDrugs: string | null;
  biology?: string | null;
  categories?: string | null;
};

function buildEmbedText(asset: AssetForEmbedding): string {
  let categoryText: string | null = null;
  if (asset.categories) {
    try {
      const parsed = JSON.parse(asset.categories);
      categoryText = Array.isArray(parsed) && parsed.length ? `Categories: ${parsed.join(", ")}` : null;
    } catch { categoryText = null; }
  }

  return [
    asset.assetName,
    asset.target !== "unknown" ? `Target: ${asset.target}` : null,
    asset.modality !== "unknown" ? `Modality: ${asset.modality}` : null,
    asset.indication !== "unknown" ? `Indication: ${asset.indication}` : null,
    asset.developmentStage !== "unknown" ? `Stage: ${asset.developmentStage}` : null,
    `Institution: ${asset.institution}`,
    asset.biology && asset.biology !== "not applicable" ? `Biology: ${asset.biology}` : null,
    categoryText,
    asset.summary || null,
    asset.mechanismOfAction ? `Mechanism: ${asset.mechanismOfAction}` : null,
    asset.innovationClaim ? `Innovation claim: ${asset.innovationClaim}` : null,
    asset.unmetNeed ? `Unmet need: ${asset.unmetNeed}` : null,
    asset.comparableDrugs ? `Comparable drugs: ${asset.comparableDrugs}` : null,
  ]
    .filter(Boolean)
    .join(". ")
    .slice(0, 8000);
}

export async function embedAssets(
  assets: AssetForEmbedding[],
  onProgress?: (processed: number, total: number, succeeded: number, failed: number) => void
): Promise<{ succeeded: number; failed: number }> {
  let succeeded = 0;
  let failed = 0;
  let processed = 0;

  for (let i = 0; i < assets.length; i += CONCURRENCY) {
    const chunk = assets.slice(i, i + CONCURRENCY);

    await Promise.all(
      chunk.map(async (asset) => {
        try {
          const text = buildEmbedText(asset);
          const response = await client.embeddings.create({
            model: EMBED_MODEL,
            input: text,
          });
          const embedding = response.data[0].embedding;
          const vectorStr = `[${embedding.join(",")}]`;

          await db.execute(sql`
            UPDATE ingested_assets
            SET embedding = ${vectorStr}::vector
            WHERE id = ${asset.id}
          `);

          succeeded++;
        } catch (e) {
          console.error(`[embedAssets] Failed to embed asset ${asset.id}:`, e);
          failed++;
        }
        processed++;
        onProgress?.(processed, assets.length, succeeded, failed);
      })
    );
  }

  return { succeeded, failed };
}
