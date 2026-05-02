import { classifyAsset, MIN_CONTENT_CHARS, type AssetContext } from "./classifyAsset";
import { computeCompletenessScore } from "./contentHash";

export interface DeepEnrichResult {
  id: number;
  target: string | null;
  modality: string | null;
  indication: string | null;
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
  assetClass?: string | null;
  deviceAttributes?: Record<string, unknown> | null;
}


export interface DeepEnrichAssetInput {
  id: number;
  assetName: string;
  summary: string;
  abstract: string | null;
  ctx?: AssetContext;
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
  abortCheck?: () => boolean,
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
      if (abortCheck?.()) break;
      let asset: DeepEnrichAssetInput | undefined;
      if (idx >= assets.length) break;
      asset = assets[idx++];
      if (!asset) continue;

      // Quality gate: combined text must be >= MIN_CONTENT_CHARS.
      // Skip (leave enrichedAt=null) so the asset is retried once it gains more content.
      // Deduplicate before summing — when no description was scraped, summary falls back
      // to the title, so counting both would incorrectly inflate the length.
      const assetName = asset.assetName || "";
      const summary = asset.summary || "";
      const abstract = asset.abstract || "";
      const combinedLength =
        assetName.length +
        (summary !== assetName ? summary.length : 0) +
        (abstract && abstract !== assetName && abstract !== summary ? abstract.length : 0);
      if (combinedLength < MIN_CONTENT_CHARS) {
        console.log(
          `[deepEnrich] Skipping asset ${asset.id} ("${asset.assetName?.slice(0, 60)}") — combined text too short (${combinedLength} chars < ${MIN_CONTENT_CHARS}). Will retry next cycle.`,
        );
        processed++;
        onProgress?.(processed, total, totalSucceeded, totalFailed);
        continue;
      }

      let succeeded = false;
      try {
        const classification = await withRetry(
          () => classifyAsset(asset!.assetName, asset!.summary, asset!.abstract ?? undefined, "gpt-4o", true, asset!.ctx),
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
          summary: asset.summary,
          abstract: asset.abstract,
          categories: asset.ctx?.categories ?? null,
          inventors: asset.ctx?.inventors ?? null,
          patentStatus: asset.ctx?.patentStatus ?? null,
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
          innovationClaim: classification.innovationClaim ?? "",
          mechanismOfAction: classification.mechanismOfAction ?? "",
          ipType: classification.ipType,
          unmetNeed: classification.unmetNeed ?? "",
          comparableDrugs: classification.comparableDrugs ?? "",
          licensingReadiness: classification.licensingReadiness,
          completenessScore,
          assetClass: classification.assetClass,
          deviceAttributes: classification.deviceAttributes,
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
