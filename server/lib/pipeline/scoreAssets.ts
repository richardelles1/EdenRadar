import type { ScoredAsset, ScoreBreakdown, BuyerProfile } from "../types";
import { generateWhyItMatters, isFatalOpenAIError } from "../llm";


const LARGE_PHARMA_SPONSORS = [
  "pfizer", "novartis", "roche", "sanofi", "astrazeneca", "merck", "johnson & johnson",
  "j&j", "bristol-myers", "eli lilly", "abbvie", "gilead", "amgen", "biogen",
  "regeneron", "boehringer", "bayer", "gsk", "glaxosmithkline", "takeda",
];

function clamp(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

function daysSince(dateStr: string): number {
  if (!dateStr) return 999;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    const yearMatch = dateStr.match(/^(\d{4})/);
    if (yearMatch) {
      const year = parseInt(yearMatch[1]);
      const approxDays = (new Date().getFullYear() - year) * 365;
      return Math.max(0, approxDays);
    }
    return 999;
  }
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function scoreFreshness(asset: Partial<ScoredAsset>): number {
  const days = daysSince(asset.latest_signal_date ?? "");
  if (days <= 30) return 100;
  if (days <= 90) return 90;
  if (days <= 180) return 75;
  if (days <= 365) return 55;
  if (days <= 730) return 35;
  return 15;
}

function scoreNovelty(asset: Partial<ScoredAsset>): number {
  let score = 50;
  const types = asset.source_types ?? [];
  if (types.includes("preprint")) score += 20;
  if (types.includes("tech_transfer")) score += 15;
  if (types.includes("patent")) score += 10;
  if (asset.owner_type === "university") score += 15;
  const evidence = asset.evidence_count ?? 1;
  if (evidence <= 2) score += 10;
  else if (evidence >= 5) score -= 10;
  return clamp(score);
}

function stageToReadiness(stage: string | undefined): number {
  const s = (stage ?? "").toLowerCase();
  if (s.includes("phase 3")) return 90;
  if (s.includes("phase 2")) return 80;
  if (s.includes("phase 1")) return 65;
  if (s.includes("preclinical")) return 50;
  if (s.includes("discovery")) return 30;
  if (s.includes("approved")) return 60;
  return 35;
}

function scoreReadiness(asset: Partial<ScoredAsset>): number {
  let score = stageToReadiness(asset.development_stage);
  const types = asset.source_types ?? [];
  if (types.includes("patent") || asset.patent_status === "patented" || asset.patent_status === "patent pending") score += 10;
  if (types.includes("clinical_trial")) score += 8;
  return clamp(score);
}

function scoreLicensability(asset: Partial<ScoredAsset>): number {
  let score = 30;
  if (asset.owner_type === "university") score += 35;
  const types = asset.source_types ?? [];
  if (types.includes("tech_transfer")) score += 25;
  const ls = (asset.licensing_status ?? "").toLowerCase();
  if (ls.includes("available")) score += 20;
  else if (ls.includes("licensed")) score -= 10;
  if (asset.owner_type !== "company") score += 5;
  return clamp(score);
}

function scoreFit(asset: Partial<ScoredAsset>, buyerProfile?: BuyerProfile): number {
  if (!buyerProfile) return 50;

  let score = 0;
  let checks = 0;

  if (buyerProfile.therapeutic_areas.length > 0) {
    const assetText = `${asset.indication ?? ""} ${asset.matching_tags?.join(" ") ?? ""}`.toLowerCase();
    const match = buyerProfile.therapeutic_areas.some((ta) =>
      assetText.includes(ta.toLowerCase())
    );
    score += match ? 30 : 0;
    checks++;
  }

  if (buyerProfile.modalities.length > 0) {
    const match = buyerProfile.modalities.some((m) =>
      (asset.modality ?? "").toLowerCase().includes(m.toLowerCase())
    );
    score += match ? 25 : 0;
    checks++;
  }

  if (buyerProfile.preferred_stages.length > 0) {
    const match = buyerProfile.preferred_stages.some((ps) =>
      (asset.development_stage ?? "").toLowerCase().includes(ps.toLowerCase())
    );
    score += match ? 20 : 0;
    checks++;
  }

  if (buyerProfile.owner_type_preference !== "any") {
    const match = asset.owner_type === buyerProfile.owner_type_preference;
    score += match ? 15 : -10;
    checks++;
  }

  const keywordText = `${asset.indication ?? ""} ${asset.target ?? ""} ${asset.matching_tags?.join(" ") ?? ""}`.toLowerCase();
  const kwAll = [...buyerProfile.indication_keywords, ...buyerProfile.target_keywords];
  if (kwAll.length > 0) {
    const matches = kwAll.filter((kw) => keywordText.includes(kw.toLowerCase())).length;
    score += (matches / kwAll.length) * 25;
    checks++;
  }

  if (
    buyerProfile.excluded_stages.some((es) =>
      (asset.development_stage ?? "").toLowerCase().includes(es.toLowerCase())
    )
  ) {
    score -= 50;
  }

  return checks === 0 ? 50 : clamp(50 + score);
}

function scoreCompetition(asset: Partial<ScoredAsset>): number {
  let score = 80;
  const types = asset.source_types ?? [];
  const sponsorName = (asset.owner_name ?? "").toLowerCase();
  const isLargePharma = LARGE_PHARMA_SPONSORS.some((p) => sponsorName.includes(p));
  if (isLargePharma) score -= 25;
  if (types.includes("clinical_trial") && asset.owner_type === "company") score -= 15;
  const stage = (asset.development_stage ?? "").toLowerCase();
  if (stage.includes("phase 3")) score -= 10;
  if (stage.includes("approved")) score -= 20;
  const evidence = asset.evidence_count ?? 1;
  if (evidence >= 5) score -= 10;
  return clamp(score);
}

function computeTotal(breakdown: Omit<ScoreBreakdown, "total">): number {
  return clamp(
    breakdown.freshness * 0.15 +
    breakdown.novelty * 0.20 +
    breakdown.readiness * 0.15 +
    breakdown.licensability * 0.25 +
    breakdown.fit * 0.15 +
    breakdown.competition * 0.10
  );
}

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

export async function scoreAssets(
  normalized: Partial<ScoredAsset>[],
  buyerProfile?: BuyerProfile
): Promise<ScoredAsset[]> {
  const scored: ScoredAsset[] = normalized.map((asset) => {
    const freshness = scoreFreshness(asset);
    const novelty = scoreNovelty(asset);
    const readiness = scoreReadiness(asset);
    const licensability = scoreLicensability(asset);
    const fit = scoreFit(asset, buyerProfile);
    const competition = scoreCompetition(asset);
    const total = computeTotal({ freshness, novelty, readiness, licensability, fit, competition });

    return {
      id: asset.id ?? crypto.randomUUID().slice(0,8),
      asset_name: asset.asset_name ?? "unknown",
      target: asset.target ?? "unknown",
      modality: asset.modality ?? "unknown",
      indication: asset.indication ?? "unknown",
      development_stage: asset.development_stage ?? "unknown",
      owner_name: asset.owner_name ?? "unknown",
      owner_type: asset.owner_type ?? "unknown",
      institution: asset.institution ?? "unknown",
      patent_status: asset.patent_status ?? "unknown",
      licensing_status: asset.licensing_status ?? "unknown",
      summary: asset.summary ?? "",
      why_it_matters: "",
      evidence_count: asset.evidence_count ?? 1,
      source_types: asset.source_types ?? [],
      source_urls: asset.source_urls ?? [],
      latest_signal_date: asset.latest_signal_date ?? "",
      score: total,
      score_breakdown: { freshness, novelty, readiness, licensability, fit, competition, total },
      matching_tags: asset.matching_tags ?? [],
      confidence: asset.confidence ?? "low",
      signals: asset.signals ?? [],
    };
  });

  scored.sort((a, b) => b.score - a.score);

  const top10 = scored.slice(0, 10);
  const tasks = top10.map((asset) => async () => {
    try {
      asset.why_it_matters = await generateWhyItMatters(asset, buyerProfile);
    } catch (err) {
      if (isFatalOpenAIError(err)) throw err;
    }
  });

  await runWithConcurrency(tasks, 3);

  return scored;
}
