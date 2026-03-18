import { classifyAsset } from "./classifyAsset";

export interface DeepEnrichResult {
  id: number;
  target: string;
  modality: string;
  indication: string;
  developmentStage: string;
  biotechRelevant: boolean;
  categories: string[];
  categoryConfidence: number;
  innovationClaim: string;
  mechanismOfAction: string;
  ipType: string;
  unmetNeed: string;
  comparableDrugs: string;
  licensingReadiness: string;
  completenessScore: number;
}

export function computeCompletenessScore(fields: {
  target: string;
  modality: string;
  indication: string;
  developmentStage: string;
  mechanismOfAction: string;
  innovationClaim: string;
  unmetNeed: string;
  comparableDrugs: string;
  licensingReadiness: string;
}): number {
  let score = 0;
  if (fields.target && fields.target !== "unknown") score += 15;
  if (fields.modality && fields.modality !== "unknown") score += 15;
  if (fields.indication && fields.indication !== "unknown") score += 15;
  if (fields.developmentStage && fields.developmentStage !== "unknown") score += 10;
  if (fields.mechanismOfAction && fields.mechanismOfAction.length > 5) score += 15;
  if (fields.innovationClaim && fields.innovationClaim.length > 5) score += 10;
  if (fields.unmetNeed && fields.unmetNeed.length > 5) score += 10;
  if (fields.comparableDrugs && fields.comparableDrugs.length > 2) score += 5;
  if (fields.licensingReadiness && fields.licensingReadiness !== "unknown") score += 5;
  return score;
}

export interface DeepEnrichAssetInput {
  id: number;
  assetName: string;
  summary: string;
  abstract: string | null;
}

export async function deepEnrichBatch(
  assets: DeepEnrichAssetInput[],
  concurrency = 20,
  onEach?: (id: number, result: DeepEnrichResult) => Promise<void>,
  onProgress?: (processed: number, total: number) => void,
): Promise<Map<number, DeepEnrichResult>> {
  const results = new Map<number, DeepEnrichResult>();
  let idx = 0;
  let processed = 0;
  const total = assets.length;

  async function worker() {
    while (idx < assets.length) {
      const asset = assets[idx++];
      if (!asset) continue;

      try {
        const classification = await classifyAsset(
          asset.assetName,
          asset.summary,
          asset.abstract ?? undefined,
          "gpt-4o",
        );

        const completenessScore = computeCompletenessScore({
          target: classification.target,
          modality: classification.modality,
          indication: classification.indication,
          developmentStage: classification.developmentStage,
          mechanismOfAction: classification.mechanismOfAction,
          innovationClaim: classification.innovationClaim,
          unmetNeed: classification.unmetNeed,
          comparableDrugs: classification.comparableDrugs,
          licensingReadiness: classification.licensingReadiness,
        });

        const result: DeepEnrichResult = {
          id: asset.id,
          target: classification.target,
          modality: classification.modality,
          indication: classification.indication,
          developmentStage: classification.developmentStage,
          biotechRelevant: classification.biotechRelevant,
          categories: classification.categories,
          categoryConfidence: classification.categoryConfidence,
          innovationClaim: classification.innovationClaim,
          mechanismOfAction: classification.mechanismOfAction,
          ipType: classification.ipType,
          unmetNeed: classification.unmetNeed,
          comparableDrugs: classification.comparableDrugs,
          licensingReadiness: classification.licensingReadiness,
          completenessScore,
        };

        results.set(asset.id, result);
        if (onEach) {
          try { await onEach(asset.id, result); } catch {}
        }
      } catch (e) {
        console.error(`[deepEnrich] failed for asset ${asset.id}:`, e);
      }

      processed++;
      onProgress?.(processed, total);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, assets.length || 1) }, worker);
  await Promise.all(workers);
  return results;
}
