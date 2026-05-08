import { classifyAsset, MIN_CONTENT_CHARS, MIN_THIN_CHARS, type AssetContext } from "./classifyAsset";
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
  completenessScore: number | null;
  assetClass?: string | null;
  deviceAttributes?: Record<string, unknown> | null;
}


export interface DeepEnrichAssetInput {
  id: number;
  assetName: string;
  summary: string;
  abstract: string | null;
  ctx?: AssetContext;
  /** source_type from ingested_assets — "tech_transfer" earns automatic IP credit */
  sourceType?: string | null;
}

export interface DeepEnrichBatchResult {
  results: Map<number, DeepEnrichResult>;
  succeeded: number;
  failed: number;
  skipped: number;
  inputTokens: number;
  outputTokens: number;
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
  onProgress?: (processed: number, total: number, succeeded: number, failed: number, skipped: number) => void,
  abortCheck?: () => boolean,
  onTokens?: (inputTokens: number, outputTokens: number) => void,
): Promise<DeepEnrichBatchResult> {
  const allResults = new Map<number, DeepEnrichResult>();
  let idx = 0;
  let processed = 0;
  let totalSucceeded = 0;
  let totalFailed = 0;
  let totalSkipped = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
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
      // Skip (leave enrichedAt=null, do NOT increment deepEnrichAttempts) so the
      // asset is retried once it gains more content from a future scrape.
      // Deduplicate before summing — when no description was scraped, summary falls
      // back to the title, so counting both would incorrectly inflate the length.
      const assetName = asset.assetName || "";
      const summary = asset.summary || "";
      const abstract = asset.abstract || "";
      const combinedLength =
        assetName.length +
        (summary !== assetName ? summary.length : 0) +
        (abstract && abstract !== assetName && abstract !== summary ? abstract.length : 0);
      if (combinedLength < MIN_THIN_CHARS) {
        console.log(
          `[deepEnrich] Skipping asset ${asset.id} ("${asset.assetName?.slice(0, 60)}") — text too short even for lite pass (${combinedLength} chars < ${MIN_THIN_CHARS}). Will retry next cycle.`,
        );
        totalSkipped++;
        processed++;
        onProgress?.(processed, total, totalSucceeded, totalFailed, totalSkipped);
        continue;
      }

      // Route thin-text assets (MIN_THIN_CHARS <= chars < MIN_CONTENT_CHARS) to gpt-4o-mini
      // for a lite classification pass: sets assetClass, developmentStage, modality, indication,
      // ipType, licensingReadiness. Avoids skipping 66%+ of the corpus entirely.
      const useLitePass = combinedLength < MIN_CONTENT_CHARS;
      const model: "gpt-4o" | "gpt-4o-mini" = useLitePass ? "gpt-4o-mini" : "gpt-4o";
      if (useLitePass) {
        console.log(
          `[deepEnrich] Lite pass (gpt-4o-mini) for asset ${asset.id} ("${asset.assetName?.slice(0, 60)}") — ${combinedLength} chars`,
        );
      }

      let succeeded = false;
      try {
        const classification = await withRetry(
          () => classifyAsset(asset!.assetName, asset!.summary, asset!.abstract ?? undefined, model, true, asset!.ctx),
          asset.id,
        );

        const completenessScore = computeCompletenessScore({
          assetClass: classification.assetClass,
          target: classification.target,
          modality: classification.modality,
          indication: classification.indication,
          developmentStage: classification.developmentStage,
          mechanismOfAction: classification.mechanismOfAction,
          innovationClaim: classification.innovationClaim,
          unmetNeed: classification.unmetNeed,
          comparableDrugs: classification.comparableDrugs,
          licensingReadiness: classification.licensingReadiness,
          deviceAttributes: classification.deviceAttributes,
          summary: asset.summary,
          abstract: asset.abstract,
          categories: asset.ctx?.categories ?? null,
          inventors: asset.ctx?.inventors ?? null,
          patentStatus: asset.ctx?.patentStatus ?? null,
          sourceType: asset.sourceType,
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

        // Use real token counts from the API response
        const inTok = classification.tokenUsage.inputTokens;
        const outTok = classification.tokenUsage.outputTokens;
        totalInputTokens += inTok;
        totalOutputTokens += outTok;
        onTokens?.(inTok, outTok);

        if (buffer.length >= FLUSH_SIZE && !flushLock) {
          await flushBuffer();
        }
      } catch (e) {
        console.error(`[deepEnrich] permanently failed for asset ${asset.id}:`, e);
      }

      if (!succeeded) totalFailed++;
      processed++;
      onProgress?.(processed, total, totalSucceeded, totalFailed, totalSkipped);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, assets.length || 1) }, worker);
  await Promise.all(workers);
  await flushBuffer(true);

  return { results: allResults, succeeded: totalSucceeded, failed: totalFailed, skipped: totalSkipped, inputTokens: totalInputTokens, outputTokens: totalOutputTokens };
}
