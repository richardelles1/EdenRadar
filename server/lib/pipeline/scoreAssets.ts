import type { ScoredAsset, ScoreBreakdown, BuyerProfile } from "../types";
import { generateWhyItMatters, isFatalOpenAIError } from "../llm";

const LARGE_PHARMA_SPONSORS = [
  "pfizer", "novartis", "roche", "sanofi", "astrazeneca", "merck", "johnson & johnson",
  "j&j", "bristol-myers", "eli lilly", "abbvie", "gilead", "amgen", "biogen",
  "regeneron", "boehringer", "bayer", "gsk", "glaxosmithkline", "takeda",
];

const WEIGHTS: Record<string, number> = {
  freshness: 0.15,
  novelty: 0.20,
  readiness: 0.15,
  licensability: 0.25,
  fit: 0.15,
  competition: 0.10,
};

type DimensionResult = {
  score: number;
  hasData: boolean;
  basis: string;
};

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
      return Math.max(0, (new Date().getFullYear() - year) * 365);
    }
    return 999;
  }
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function scoreFreshness(asset: Partial<ScoredAsset>): DimensionResult {
  const days = daysSince(asset.latest_signal_date ?? "");
  if (days >= 999) {
    return { score: 50, hasData: false, basis: "No date recorded" };
  }
  let score: number;
  let basis: string;
  if (days <= 30) {
    score = 100;
    basis = `Indexed ${days} day${days === 1 ? "" : "s"} ago`;
  } else if (days <= 90) {
    score = 90;
    basis = `Indexed ${days} days ago`;
  } else if (days <= 180) {
    const months = Math.round(days / 30);
    score = 75;
    basis = `Last signal ~${months} months ago`;
  } else if (days <= 365) {
    const months = Math.round(days / 30);
    score = 55;
    basis = `Last signal ~${months} months ago`;
  } else if (days <= 730) {
    const months = Math.round(days / 30);
    score = 35;
    basis = `Last signal ~${months} months ago`;
  } else {
    const years = Math.round(days / 365);
    score = 15;
    basis = `Last signal ~${years} year${years === 1 ? "" : "s"} ago`;
  }
  return { score, hasData: true, basis };
}

function scoreNovelty(asset: Partial<ScoredAsset>): DimensionResult {
  const types = asset.source_types ?? [];
  const ownerKnown = asset.owner_type && asset.owner_type !== "unknown";
  const hasData = types.length > 0 || !!ownerKnown;

  if (!hasData) {
    return { score: 50, hasData: false, basis: "Source type not available" };
  }

  let score = 50;
  const signals: string[] = [];

  if (types.includes("preprint")) { score += 20; signals.push("preprint"); }
  if (types.includes("tech_transfer")) { score += 15; signals.push("TTO-disclosed"); }
  if (types.includes("patent")) { score += 10; signals.push("patent-backed"); }
  if (asset.owner_type === "university") { score += 15; signals.push("university-originated"); }

  const evidence = asset.evidence_count ?? 0;
  if (evidence > 0 && evidence <= 2) {
    score += 10;
    signals.push("limited prior coverage");
  } else if (evidence >= 5) {
    score -= 10;
    signals.push("well-studied asset");
  }

  const basis = signals.length > 0
    ? signals.map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(", ")
    : "Signal present, no strong novelty indicators";

  return { score: clamp(score), hasData: true, basis };
}

function scoreReadiness(asset: Partial<ScoredAsset>): DimensionResult {
  const stage = (asset.development_stage ?? "").toLowerCase().trim();
  if (!stage || stage === "unknown") {
    return { score: 50, hasData: false, basis: "Stage not reported" };
  }

  let score: number;
  let stageLabel: string;

  if (stage.includes("phase 3")) { score = 90; stageLabel = "Phase 3 clinical trial"; }
  else if (stage.includes("phase 2")) { score = 80; stageLabel = "Phase 2 clinical trial"; }
  else if (stage.includes("phase 1")) { score = 65; stageLabel = "Phase 1 clinical trial"; }
  else if (stage.includes("preclinical")) { score = 50; stageLabel = "Preclinical"; }
  else if (stage.includes("discovery")) { score = 30; stageLabel = "Discovery stage"; }
  else if (stage.includes("approved")) { score = 60; stageLabel = "Approved (relicensing)"; }
  else { score = 35; stageLabel = asset.development_stage ?? "Stage unclear"; }

  const types = asset.source_types ?? [];
  const extras: string[] = [];
  if (types.includes("patent") || asset.patent_status === "patented" || asset.patent_status === "patent pending") {
    score += 10;
    extras.push("patent protection");
  }
  if (types.includes("clinical_trial")) {
    score += 8;
    extras.push("registered trial");
  }

  const basis = extras.length > 0
    ? `${stageLabel} · ${extras.join(", ")}`
    : stageLabel;

  return { score: clamp(score), hasData: true, basis };
}

function scoreLicensability(asset: Partial<ScoredAsset>): DimensionResult {
  const ownerKnown = asset.owner_type && asset.owner_type !== "unknown";
  const types = asset.source_types ?? [];
  const ls = (asset.licensing_status ?? "").toLowerCase();
  const hasLicensingData = ls.length > 0 && ls !== "unknown";
  const hasData = !!(ownerKnown || types.includes("tech_transfer") || hasLicensingData);

  if (!hasData) {
    return { score: 50, hasData: false, basis: "No ownership or licensing data" };
  }

  let score = 30;
  const signals: string[] = [];

  if (asset.owner_type === "university") { score += 35; signals.push("University-owned"); }
  if (types.includes("tech_transfer")) { score += 25; signals.push("TTO-disclosed"); }
  if (ls.includes("available")) { score += 20; signals.push("license available"); }
  else if (ls.includes("licensed")) { score -= 10; signals.push("already licensed"); }
  if (asset.owner_type && asset.owner_type !== "company") { score += 5; }

  const basis = signals.length > 0
    ? signals.join(", ")
    : "Ownership known, licensing status unclear";

  return { score: clamp(score), hasData: true, basis };
}

function scoreFit(asset: Partial<ScoredAsset>, buyerProfile?: BuyerProfile): DimensionResult {
  if (!buyerProfile) {
    return { score: 50, hasData: false, basis: "No buyer profile configured" };
  }

  const hasCriteria =
    buyerProfile.therapeutic_areas.length > 0 ||
    buyerProfile.modalities.length > 0 ||
    buyerProfile.preferred_stages.length > 0 ||
    buyerProfile.owner_type_preference !== "any" ||
    buyerProfile.indication_keywords.length > 0 ||
    buyerProfile.target_keywords.length > 0;

  if (!hasCriteria) {
    return { score: 50, hasData: false, basis: "Buyer profile has no criteria set" };
  }

  let score = 0;
  let checks = 0;
  const matched: string[] = [];
  const missed: string[] = [];

  if (buyerProfile.therapeutic_areas.length > 0) {
    const assetText = `${asset.indication ?? ""} ${asset.matching_tags?.join(" ") ?? ""}`.toLowerCase();
    const hit = buyerProfile.therapeutic_areas.some((ta) => assetText.includes(ta.toLowerCase()));
    score += hit ? 30 : 0;
    checks++;
    if (hit) matched.push("therapeutic area");
    else missed.push("therapeutic area");
  }

  if (buyerProfile.modalities.length > 0) {
    const hit = buyerProfile.modalities.some((m) =>
      (asset.modality ?? "").toLowerCase().includes(m.toLowerCase())
    );
    score += hit ? 25 : 0;
    checks++;
    if (hit) matched.push("modality");
    else missed.push("modality");
  }

  if (buyerProfile.preferred_stages.length > 0) {
    const hit = buyerProfile.preferred_stages.some((ps) =>
      (asset.development_stage ?? "").toLowerCase().includes(ps.toLowerCase())
    );
    score += hit ? 20 : 0;
    checks++;
    if (hit) matched.push("stage");
    else missed.push("stage");
  }

  if (buyerProfile.owner_type_preference !== "any") {
    const hit = asset.owner_type === buyerProfile.owner_type_preference;
    score += hit ? 15 : -10;
    checks++;
    if (hit) matched.push("owner type");
  }

  const kwAll = [...buyerProfile.indication_keywords, ...buyerProfile.target_keywords];
  if (kwAll.length > 0) {
    const keywordText = `${asset.indication ?? ""} ${asset.target ?? ""} ${asset.matching_tags?.join(" ") ?? ""}`.toLowerCase();
    const hits = kwAll.filter((kw) => keywordText.includes(kw.toLowerCase())).length;
    score += (hits / kwAll.length) * 25;
    checks++;
    if (hits > 0) matched.push(`${hits}/${kwAll.length} keywords`);
  }

  if (
    buyerProfile.excluded_stages.some((es) =>
      (asset.development_stage ?? "").toLowerCase().includes(es.toLowerCase())
    )
  ) {
    score -= 50;
  }

  const total = checks === 0 ? 50 : clamp(50 + score);
  let basis: string;
  if (matched.length === 0) {
    basis = `No thesis criteria matched (${checks} checked)`;
  } else {
    basis = `Matches: ${matched.join(", ")}`;
    if (missed.length > 0) basis += ` · Misses: ${missed.join(", ")}`;
  }

  return { score: total, hasData: true, basis };
}

function scoreCompetition(asset: Partial<ScoredAsset>): DimensionResult {
  const ownerName = (asset.owner_name ?? "").toLowerCase();
  const stage = (asset.development_stage ?? "").toLowerCase();
  const types = asset.source_types ?? [];
  const ownerKnown = asset.owner_name && asset.owner_name !== "unknown";
  const stageKnown = stage && stage !== "unknown";
  const hasData = !!(ownerKnown || stageKnown);

  if (!hasData) {
    return { score: 50, hasData: false, basis: "No owner or stage data to assess competition" };
  }

  let score = 80;
  const signals: string[] = [];

  const isLargePharma = LARGE_PHARMA_SPONSORS.some((p) => ownerName.includes(p));
  if (isLargePharma) { score -= 25; signals.push("Large pharma-owned"); }
  if (types.includes("clinical_trial") && asset.owner_type === "company") { score -= 15; signals.push("company-sponsored trial"); }
  if (stage.includes("phase 3")) { score -= 10; signals.push("Phase 3 competitive field"); }
  if (stage.includes("approved")) { score -= 20; signals.push("Approved — crowded market"); }
  const evidence = asset.evidence_count ?? 0;
  if (evidence >= 5) { score -= 10; signals.push("high evidence density"); }

  const basis = signals.length > 0
    ? signals.join(", ")
    : asset.owner_type === "university"
      ? "University-originated, limited commercial pressure"
      : "Moderate competitive landscape";

  return { score: clamp(score), hasData: true, basis };
}

function computeTotal(
  results: Record<string, DimensionResult>
): { total: number; signal_coverage: number; scored_dimensions: string[]; dimension_basis: Record<string, string> } {
  const available = Object.entries(results).filter(([, r]) => r.hasData);
  const totalAvailableWeight = available.reduce((sum, [k]) => sum + (WEIGHTS[k] ?? 0), 0);

  const dimension_basis: Record<string, string> = {};
  for (const [k, r] of Object.entries(results)) {
    dimension_basis[k] = r.basis;
  }

  const scored_dimensions = available.map(([k]) => k);

  if (totalAvailableWeight === 0) {
    return {
      total: 50,
      signal_coverage: 0,
      scored_dimensions,
      dimension_basis,
    };
  }

  const weightedSum = available.reduce((sum, [k, r]) => {
    return sum + r.score * ((WEIGHTS[k] ?? 0) / totalAvailableWeight);
  }, 0);

  const signal_coverage = Math.round(totalAvailableWeight * 100);

  return { total: clamp(weightedSum), signal_coverage, scored_dimensions, dimension_basis };
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
    const freshnessResult = scoreFreshness(asset);
    const noveltyResult = scoreNovelty(asset);
    const readinessResult = scoreReadiness(asset);
    const licensabilityResult = scoreLicensability(asset);
    const fitResult = scoreFit(asset, buyerProfile);
    const competitionResult = scoreCompetition(asset);

    const results: Record<string, DimensionResult> = {
      freshness: freshnessResult,
      novelty: noveltyResult,
      readiness: readinessResult,
      licensability: licensabilityResult,
      fit: fitResult,
      competition: competitionResult,
    };

    const { total, signal_coverage, scored_dimensions, dimension_basis } = computeTotal(results);

    const confidence: "high" | "medium" | "low" =
      signal_coverage >= 75 ? "high" : signal_coverage >= 50 ? "medium" : "low";

    const score_breakdown: ScoreBreakdown = {
      freshness: freshnessResult.score,
      novelty: noveltyResult.score,
      readiness: readinessResult.score,
      licensability: licensabilityResult.score,
      fit: fitResult.score,
      competition: competitionResult.score,
      total,
      signal_coverage,
      scored_dimensions,
      dimension_basis,
    };

    return {
      id: asset.id ?? crypto.randomUUID().slice(0, 8),
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
      evidence_count: asset.evidence_count ?? 0,
      source_types: asset.source_types ?? [],
      source_urls: asset.source_urls ?? [],
      latest_signal_date: asset.latest_signal_date ?? "",
      score: total,
      score_breakdown,
      matching_tags: asset.matching_tags ?? [],
      confidence,
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
