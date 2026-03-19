import type { RawSignal, ScoredAsset } from "../types";
import { extractAssetFromSignal, isFatalOpenAIError } from "../llm";


async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let index = 0;
  async function runNext(): Promise<void> {
    const taskIndex = index++;
    if (taskIndex >= tasks.length) return;
    results[taskIndex] = await tasks[taskIndex]();
    await runNext();
  }
  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, runNext);
  await Promise.all(workers);
  return results;
}

function sourceTypeToOwnerType(sourceType: string, metadata: Record<string, unknown>): "university" | "company" | "unknown" {
  if (metadata?.owner_type === "university") return "university";
  if (metadata?.owner_type === "company") return "company";
  if (sourceType === "tech_transfer") return "university";
  if (sourceType === "patent") return "unknown";
  return "unknown";
}

function inferConfidence(extracted: Partial<ScoredAsset>, signal: RawSignal): "high" | "medium" | "low" {
  const knownCount = [
    extracted.asset_name !== "unknown" && extracted.asset_name,
    extracted.target !== "unknown" && extracted.target,
    extracted.indication !== "unknown" && extracted.indication,
    extracted.modality !== "unknown" && extracted.modality,
    extracted.development_stage !== "unknown" && extracted.development_stage,
  ].filter(Boolean).length;
  if (knownCount >= 4) return "high";
  if (knownCount >= 2) return "medium";
  return "low";
}

function applyStructuredOverrides(
  asset: Partial<ScoredAsset>,
  signal: RawSignal
): Partial<ScoredAsset> {
  if (signal.source_type !== "clinical_trial") return asset;

  const conditions = signal.metadata?.conditions as string[] | undefined;
  const ownerType = signal.metadata?.owner_type as string | undefined;
  const interventionOtherName = signal.metadata?.intervention_other_name as string | undefined;

  return {
    ...asset,
    indication:
      conditions && conditions.length > 0
        ? conditions.slice(0, 3).join(", ")
        : asset.indication ?? "unknown",
    development_stage: signal.stage_hint && signal.stage_hint !== "unknown"
      ? signal.stage_hint
      : asset.development_stage ?? "unknown",
    owner_name: signal.institution_or_sponsor || asset.owner_name || "unknown",
    owner_type:
      ownerType === "university" || ownerType === "company"
        ? (ownerType as "university" | "company")
        : asset.owner_type ?? "unknown",
    institution: signal.institution_or_sponsor || asset.institution || "unknown",
    asset_name:
      interventionOtherName && interventionOtherName !== "unknown"
        ? interventionOtherName
        : asset.asset_name ?? "unknown",
    licensing_status: "unknown",
  };
}

export async function normalizeSignals(signals: RawSignal[]): Promise<Partial<ScoredAsset>[]> {
  const tasks = signals.map((signal) => async (): Promise<Partial<ScoredAsset>> => {
    try {
      const extracted = await extractAssetFromSignal(signal);
      if (!extracted) {
        const fallback: Partial<ScoredAsset> = {
          id: crypto.randomUUID().slice(0,8),
          asset_name: signal.title.slice(0, 80) || "unknown",
          indication: "unknown",
          modality: "unknown",
          target: "unknown",
          development_stage: signal.stage_hint || "unknown",
          owner_name: signal.institution_or_sponsor || signal.authors_or_owner || "unknown",
          owner_type: sourceTypeToOwnerType(signal.source_type, signal.metadata),
          institution: signal.institution_or_sponsor || "unknown",
          licensing_status: (signal.metadata?.licensing_status as string) || "unknown",
          patent_status: (signal.metadata?.patent_status as string) || "unknown",
          summary: signal.text?.slice(0, 200) || "",
          why_it_matters: "",
          source_types: [signal.source_type],
          source_urls: [signal.url],
          latest_signal_date: signal.date,
          matching_tags: [],
          evidence_count: 1,
          confidence: "low",
          contact_office: signal.source_type === "tech_transfer" ? (signal.metadata?.contact_office as string | undefined) : undefined,
          signals: [signal],
        };
        return applyStructuredOverrides(fallback, signal);
      }

      const merged: Partial<ScoredAsset> = {
        id: crypto.randomUUID().slice(0,8),
        asset_name: extracted.asset_name ?? "unknown",
        target: extracted.target ?? "unknown",
        modality: extracted.modality ?? "unknown",
        indication: extracted.indication ?? "unknown",
        development_stage: extracted.development_stage ?? signal.stage_hint ?? "unknown",
        owner_name: extracted.owner_name ?? signal.institution_or_sponsor ?? signal.authors_or_owner ?? "unknown",
        owner_type: extracted.owner_type ?? sourceTypeToOwnerType(signal.source_type, signal.metadata),
        institution: extracted.institution ?? signal.institution_or_sponsor ?? "unknown",
        licensing_status: extracted.licensing_status ?? (signal.metadata?.licensing_status as string) ?? "unknown",
        patent_status: extracted.patent_status ?? (signal.metadata?.patent_status as string) ?? "unknown",
        summary: extracted.summary ?? signal.text?.slice(0, 300) ?? "",
        why_it_matters: "",
        source_types: [signal.source_type],
        source_urls: [signal.url],
        latest_signal_date: signal.date,
        matching_tags: extracted.matching_tags ?? [],
        evidence_count: 1,
        confidence: inferConfidence(extracted, signal),
        contact_office: signal.source_type === "tech_transfer" ? (signal.metadata?.contact_office as string | undefined) : undefined,
        signals: [signal],
      };

      return applyStructuredOverrides(merged, signal);
    } catch (err) {
      if (isFatalOpenAIError(err)) throw err;
      const errFallback: Partial<ScoredAsset> = {
        id: crypto.randomUUID().slice(0,8),
        asset_name: signal.title.slice(0, 80) || "unknown",
        indication: "unknown",
        modality: "unknown",
        target: "unknown",
        development_stage: signal.stage_hint || "unknown",
        owner_name: signal.institution_or_sponsor || "unknown",
        owner_type: "unknown",
        institution: signal.institution_or_sponsor || "unknown",
        licensing_status: "unknown",
        patent_status: "unknown",
        summary: "",
        why_it_matters: "",
        source_types: [signal.source_type],
        source_urls: [signal.url],
        latest_signal_date: signal.date,
        matching_tags: [],
        evidence_count: 1,
        confidence: "low",
        signals: [signal],
      };
      return applyStructuredOverrides(errFallback, signal);
    }
  });

  return runWithConcurrency(tasks, 10);
}
