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

export interface DeepEnrichBatchResult {
  results: Map<number, DeepEnrichResult>;
  succeeded: number;
  failed: number;
}

const FLUSH_SIZE = 50;
const MAX_RETRIES = 4;
const BASE_DELAY_MS = 1000;

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(fn: () => Promise<T>, assetId: number): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      lastErr = e;
      const status: number | undefined = e?.status ?? e?.response?.status;
      const isRetryable = status === 429 || (status != null && status >= 500);
      if (!isRetryable || attempt === MAX_RETRIES) break;

      let waitMs: number;
      if (status === 429) {
        const retryAfter = Number(e?.headers?.["retry-after"] ?? e?.response?.headers?.["retry-after"]);
        waitMs = isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 500;
      } else {
        waitMs = BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 300;
      }
      console.warn(`[deepEnrich] asset ${assetId} attempt ${attempt + 1} failed (${status}), retrying in ${Math.round(waitMs)}ms`);
      await sleep(waitMs);
    }
  }
  throw lastErr;
}

export async function deepEnrichBatch(
  assets: DeepEnrichAssetInput[],
  concurrency = 20,
  onFlush: (results: DeepEnrichResult[]) => Promise<number>,
  onProgress?: (processed: number, total: number, succeeded: number, failed: number) => void,
): Promise<DeepEnrichBatchResult> {
  const allResults = new Map<number, DeepEnrichResult>();
  let idx = 0;
  let processed = 0;
  let totalSucceeded = 0;
  let totalFailed = 0;
  const total = assets.length;
  const buffer: DeepEnrichResult[] = [];
  let flushLock = false;

  async function flushBuffer(force = false) {
    if (flushLock) return;
    if (!force && buffer.length < FLUSH_SIZE) return;
    if (buffer.length === 0) return;
    flushLock = true;
    const chunk = buffer.splice(0, buffer.length);
    try {
      const written = await onFlush(chunk);
      totalSucceeded += written;
    } catch (e) {
      console.error("[deepEnrich] flush error:", e);
    } finally {
      flushLock = false;
    }
  }

  async function worker() {
    while (true) {
      let asset: DeepEnrichAssetInput | undefined;
      if (idx >= assets.length) break;
      asset = assets[idx++];
      if (!asset) continue;

      let succeeded = false;
      try {
        const classification = await withRetry(
          () => classifyAsset(asset!.assetName, asset!.summary, asset!.abstract ?? undefined, "gpt-4o", true),
          asset.id,
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

        allResults.set(asset.id, result);
        buffer.push(result);
        succeeded = true;

        if (buffer.length >= FLUSH_SIZE && !flushLock) {
          await flushBuffer();
        }
      } catch (e) {
        console.error(`[deepEnrich] permanently failed for asset ${asset.id}:`, e);
      }

      if (!succeeded) totalFailed++;
      processed++;
      onProgress?.(processed, total, totalSucceeded, totalFailed);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, assets.length || 1) }, worker);
  await Promise.all(workers);
  await flushBuffer(true);

  return { results: allResults, succeeded: totalSucceeded, failed: totalFailed };
}
