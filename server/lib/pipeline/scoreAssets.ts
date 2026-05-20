import type { ScoredAsset, ScoreBreakdown, BuyerProfile } from "../types";
import { generateWhyItMatters, isFatalOpenAIError } from "../llm";

const LARGE_PHARMA_SPONSORS = [
  "pfizer", "novartis", "roche", "sanofi", "astrazeneca", "merck", "johnson & johnson",
  "j&j", "bristol-myers", "eli lilly", "abbvie", "gilead", "amgen", "biogen",
  "regeneron", "boehringer", "bayer", "gsk", "glaxosmithkline", "takeda",
];

// ─── Weight models ────────────────────────────────────────────────────────────

// Legacy 6-dimension model: used for non-TTO mixed-corpus assets (papers,
// patents, clinical trials). These dimensions produce real differentiation for
// heterogeneous corpora where source type, stage and IP status vary widely.
const WEIGHTS: Record<string, number> = {
  freshness: 0.15,
  novelty: 0.20,
  readiness: 0.15,
  licensability: 0.25,
  fit: 0.15,
  competition: 0.10,
};

// TTO 3-dimension model (Task #980): used for tech_transfer assets in Scout.
// Licensability/Novelty/Competition are near-constants for TTO corpus (~95/90/80)
// so they produce zero differentiation. Fit is the reason a buyer opens Scout.
export const TTO_WEIGHTS: Record<string, number> = {
  fit: 0.75,
  record_quality: 0.15,
  availability: 0.10,
};

// ─── Confidence-aware ranking (Task #693) ─────────────────────────────────────
export const CONFIDENCE_FLOOR = 0.4;
export const LOW_CONFIDENCE_THRESHOLD = 0.5;
const isProdEnv = (process.env.NODE_ENV ?? "").toLowerCase() === "production";
const flagRaw = (process.env.EDEN_CONFIDENCE_AWARE_RANKING ?? "").toLowerCase();
export const CONFIDENCE_AWARE_RANKING_ENABLED = flagRaw === "true"
  ? true
  : flagRaw === "false"
    ? false
    : !isProdEnv;

/** Stable re-order: keep score order, but push assets with confidence_factor
 *  below `LOW_CONFIDENCE_THRESHOLD` out of the top 5 whenever 5+ higher-
 *  confidence alternatives exist. No-op if flag disabled. */
export function applyTopKConfidenceGate<
  T extends { score_breakdown?: { confidence_factor?: number } },
>(sortedByScore: T[], k = 5): T[] {
  if (!CONFIDENCE_AWARE_RANKING_ENABLED || sortedByScore.length <= k) return sortedByScore;
  const isLow = (a: T) => (a.score_breakdown?.confidence_factor ?? 1) < LOW_CONFIDENCE_THRESHOLD;
  const highCount = sortedByScore.reduce((n, a) => n + (isLow(a) ? 0 : 1), 0);
  if (highCount < k) return sortedByScore;
  const high: T[] = [];
  const low: T[] = [];
  for (const a of sortedByScore) (isLow(a) ? low : high).push(a);
  return [...high, ...low];
}

export type DimensionResult = {
  score: number;
  hasData: boolean;
  basis: string;
};

export function clamp(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

function daysSince(dateStr: string | null | undefined): number {
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

export function scoreFreshness(asset: Partial<ScoredAsset>): DimensionResult {
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

export function scoreNovelty(asset: Partial<ScoredAsset>): DimensionResult {
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

export function scoreReadiness(asset: Partial<ScoredAsset>): DimensionResult {
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
  else if (stage === "early stage") { score = 30; stageLabel = "Early stage (pre-clinical)"; }
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

export function scoreLicensability(asset: Partial<ScoredAsset>): DimensionResult {
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

// ─── scoreFit (TTO-aware, Task #980) ─────────────────────────────────────────
// Sub-criteria rebalance vs old model:
//   - Removed: owner_type_preference (always "university" for TTO — wasted slot)
//   - Therapeutic area: 40 pts (was 30)
//   - Modality: 30 pts (was 25)
//   - Keywords: 30 pts (was 25)
//   - Stage: +20 bonus if buyer specified stages AND asset matches
//             (not a miss-penalty — early-stage TTO assets are valid targets)
//   - excluded_stages: -50 hard penalty (unchanged)
// Scoring baseline 25 when criteria are set (vs 50 neutral for no profile).
export function scoreFit(asset: Partial<ScoredAsset>, buyerProfile?: BuyerProfile): DimensionResult {
  if (!buyerProfile) {
    // No profile = unknown fit, not bad fit.  Return neutral (50) with hasData:true
    // so this dimension is counted in signal_coverage.  Without this, signal_coverage
    // collapses from 100% to 25% (only record_quality+availability) and the
    // CONFIDENCE_AWARE multiplier cascades all scores down to 4–7.
    return { score: 50, hasData: true, basis: "No buyer profile — all assets treated equally" };
  }

  const hasCriteria =
    buyerProfile.therapeutic_areas.length > 0 ||
    buyerProfile.modalities.length > 0 ||
    buyerProfile.preferred_stages.length > 0 ||
    buyerProfile.indication_keywords.length > 0 ||
    buyerProfile.target_keywords.length > 0;

  if (!hasCriteria) {
    return { score: 50, hasData: true, basis: "Buyer profile has no criteria set — all assets treated equally" };
  }

  let score = 0;
  let checks = 0;
  const matched: string[] = [];
  const missed: string[] = [];

  if (buyerProfile.therapeutic_areas.length > 0) {
    const assetText = `${asset.indication ?? ""} ${asset.matching_tags?.join(" ") ?? ""}`.toLowerCase();
    const hit = buyerProfile.therapeutic_areas.some((ta) => assetText.includes(ta.toLowerCase()));
    score += hit ? 40 : 0;
    checks++;
    if (hit) matched.push("therapeutic area");
    else missed.push("therapeutic area");
  }

  if (buyerProfile.modalities.length > 0) {
    const hit = buyerProfile.modalities.some((m) =>
      (asset.modality ?? "").toLowerCase().includes(m.toLowerCase())
    );
    score += hit ? 30 : 0;
    checks++;
    if (hit) matched.push("modality");
    else missed.push("modality");
  }

  const kwAll = [...buyerProfile.indication_keywords, ...buyerProfile.target_keywords];
  if (kwAll.length > 0) {
    const keywordText = `${asset.indication ?? ""} ${asset.target ?? ""} ${asset.matching_tags?.join(" ") ?? ""}`.toLowerCase();
    const hits = kwAll.filter((kw) => keywordText.includes(kw.toLowerCase())).length;
    score += (hits / kwAll.length) * 30;
    checks++;
    if (hits > 0) matched.push(`${hits}/${kwAll.length} keywords`);
    else missed.push("keywords");
  }

  // Stage: bonus boost when buyer specified stages and asset matches.
  // No penalty when stage doesn't match — early-stage assets are valid TTO targets.
  if (buyerProfile.preferred_stages.length > 0) {
    const hit = buyerProfile.preferred_stages.some((ps) =>
      (asset.development_stage ?? "").toLowerCase().includes(ps.toLowerCase())
    );
    checks++;
    if (hit) {
      score += 20;
      matched.push("stage");
    }
    // Deliberate: no `else missed.push("stage")` — stage mismatch is not a miss in TTO context
  }

  // Excluded stages: hard penalty (buyer explicitly does not want these)
  if (
    buyerProfile.excluded_stages.some((es) =>
      (asset.development_stage ?? "").toLowerCase().includes(es.toLowerCase())
    )
  ) {
    score -= 50;
  }

  // Scoring baseline: 25 when criteria are set but nothing matches.
  // (Old model used 50, which felt neutral when the asset actually doesn't fit.)
  const total = checks === 0 ? 50 : clamp(25 + score);
  let basis: string;
  if (matched.length === 0) {
    basis = `No thesis criteria matched (${checks} checked)`;
  } else {
    basis = `Matches: ${matched.join(", ")}`;
    if (missed.length > 0) basis += ` · Misses: ${missed.join(", ")}`;
  }

  return { score: total, hasData: true, basis };
}

export function scoreCompetition(asset: Partial<ScoredAsset>): DimensionResult {
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

// ─── TTO-specific dimension: Record Completeness (Task #980) ─────────────────
// Maps the pipeline-computed completeness_score (0–100) directly to this
// dimension. Completeness is a data hygiene signal: thin records are demoted
// modestly, not hidden — the buyer can still review them.
export function scoreCompleteness(asset: Partial<ScoredAsset>): DimensionResult {
  const raw = asset.completeness_score;
  if (raw == null || isNaN(Number(raw))) {
    return { score: 55, hasData: false, basis: "Completeness score not yet computed" };
  }
  const cs = Math.max(0, Math.min(100, Number(raw)));
  let basis: string;
  if (cs >= 80) basis = `Record completeness: ${cs}/100 (complete)`;
  else if (cs >= 60) basis = `Record completeness: ${cs}/100 (good)`;
  else if (cs >= 40) basis = `Record completeness: ${cs}/100 (partial)`;
  else basis = `Record completeness: ${cs}/100 (thin record)`;
  return { score: cs, hasData: true, basis };
}

// ─── TTO-specific dimension: Availability Confirmation (Task #980) ────────────
// Uses last_seen_at (confirmed crawled on TTO portal) for TTO/factory-scraped
// assets, and latest_signal_date for publication sources. An asset not seen on
// its TTO portal in >6 months is quietly demoted — not hidden.
export function scoreAvailability(asset: Partial<ScoredAsset>): DimensionResult {
  // Prefer last_seen_at (confirms portal availability) over latest_signal_date
  const dateStr = asset.last_seen_at || asset.latest_signal_date;
  const days = daysSince(dateStr);

  if (days >= 999) {
    // hasData: true so the 10% weight is applied and the demotion takes effect.
    // An asset with no confirmation date IS scored (as stale/uncertain) rather
    // than exempted — consistent with the spec's "absent → 35" rule.
    return { score: 35, hasData: true, basis: "No portal confirmation date — availability uncertain" };
  }

  let score: number;
  let basis: string;

  if (days <= 30) {
    score = 90;
    basis = `Confirmed on TTO portal ${days} day${days === 1 ? "" : "s"} ago`;
  } else if (days <= 90) {
    score = 80;
    basis = `Confirmed on TTO portal ${days} days ago`;
  } else if (days <= 180) {
    const months = Math.round(days / 30);
    score = 65;
    basis = `Last confirmed ~${months} months ago`;
  } else if (days <= 365) {
    const months = Math.round(days / 30);
    score = 45;
    basis = `Last confirmed ~${months} months ago — may have moved`;
  } else {
    const months = Math.round(days / 30);
    score = 35;
    basis = `Not confirmed in ~${months} months — availability uncertain`;
  }

  return { score, hasData: true, basis };
}

// ─── computeTotal ─────────────────────────────────────────────────────────────
// Accepts an optional `weights` override so the TTO model can supply
// TTO_WEIGHTS without changing the function signature for existing callers.
export function computeTotal(
  results: Record<string, DimensionResult>,
  weights?: Record<string, number>,
): { total: number; signal_coverage: number; scored_dimensions: string[]; dimension_basis: Record<string, string> } {
  const w = weights ?? WEIGHTS;
  const available = Object.entries(results).filter(([, r]) => r.hasData);
  const totalAvailableWeight = available.reduce((sum, [k]) => sum + (w[k] ?? 0), 0);

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
    return sum + r.score * ((w[k] ?? 0) / totalAvailableWeight);
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

// ─── Per-user feedback offset (Task #694) ────────────────────────────────────
export const USER_OFFSET_CAP = 10;

export type UserClassOffsets = Record<string, number>;

const isProdEnvOffset = (process.env.NODE_ENV ?? "").toLowerCase() === "production";
const offsetFlagRaw = (process.env.EDEN_USER_FEEDBACK_OFFSET ?? "").toLowerCase();
export const USER_FEEDBACK_OFFSET_ENABLED = offsetFlagRaw === "true"
  ? true
  : offsetFlagRaw === "false"
    ? false
    : !isProdEnvOffset;

function applyUserOffset(total: number, assetClass: string | null | undefined, offsets: UserClassOffsets | undefined): number {
  if (!offsets || !USER_FEEDBACK_OFFSET_ENABLED) return total;
  const key = assetClass || "unknown";
  const raw = offsets[key];
  if (!raw) return total;
  const capped = Math.max(-USER_OFFSET_CAP, Math.min(USER_OFFSET_CAP, raw));
  return clamp(total + capped);
}

// ─── Detect TTO context ───────────────────────────────────────────────────────
// An asset is in TTO context when ALL of its source types are tech_transfer.
// Mixed assets (e.g. a TTO + patent signal merged cluster) use the legacy model.
function isTTOAsset(asset: Partial<ScoredAsset>): boolean {
  const types = asset.source_types ?? [];
  return types.length > 0 && types.every((t) => t === "tech_transfer");
}

export async function scoreAssets(
  normalized: Partial<ScoredAsset>[],
  buyerProfile?: BuyerProfile,
  userClassOffsets?: UserClassOffsets,
): Promise<ScoredAsset[]> {
  const scored: ScoredAsset[] = normalized.map((asset) => {
    const tto = isTTOAsset(asset);

    let rawTotal: number;
    let signal_coverage: number;
    let scored_dimensions: string[];
    let dimension_basis: Record<string, string>;
    let score_breakdown_dims: Partial<ScoreBreakdown>;

    if (tto) {
      // ── TTO 3-dimension model ───────────────────────────────────────────
      const fitResult       = scoreFit(asset, buyerProfile);
      const completenessResult = scoreCompleteness(asset);
      const availabilityResult = scoreAvailability(asset);

      const dimResults: Record<string, DimensionResult> = {
        fit:          fitResult,
        record_quality: completenessResult,
        availability: availabilityResult,
      };

      ({ total: rawTotal, signal_coverage, scored_dimensions, dimension_basis } =
        computeTotal(dimResults, TTO_WEIGHTS));

      score_breakdown_dims = {
        fit:            fitResult.score,
        record_quality: completenessResult.score,
        availability:   availabilityResult.score,
        // Zero out legacy fields so the breakdown object is well-formed
        novelty:      0,
        freshness:    0,
        readiness:    0,
        licensability: 0,
        competition:  0,
      };
    } else {
      // ── Legacy 6-dimension model (non-TTO: papers, patents, trials) ─────
      const freshnessResult    = scoreFreshness(asset);
      const noveltyResult      = scoreNovelty(asset);
      const readinessResult    = scoreReadiness(asset);
      const licensabilityResult = scoreLicensability(asset);
      const fitResult          = scoreFit(asset, buyerProfile);
      const competitionResult  = scoreCompetition(asset);

      const dimResults: Record<string, DimensionResult> = {
        freshness:    freshnessResult,
        novelty:      noveltyResult,
        readiness:    readinessResult,
        licensability: licensabilityResult,
        fit:          fitResult,
        competition:  competitionResult,
      };

      ({ total: rawTotal, signal_coverage, scored_dimensions, dimension_basis } =
        computeTotal(dimResults));

      score_breakdown_dims = {
        freshness:    freshnessResult.score,
        novelty:      noveltyResult.score,
        readiness:    readinessResult.score,
        licensability: licensabilityResult.score,
        fit:          fitResult.score,
        competition:  competitionResult.score,
      };
    }

    // ── Confidence-aware ranking ─────────────────────────────────────────
    const categoryConfidence = typeof asset.category_confidence === "number"
      ? Math.max(0, Math.min(1, asset.category_confidence))
      : undefined;
    const coverageNorm = signal_coverage / 100;
    const confidenceFactor = categoryConfidence !== undefined
      ? Math.min(categoryConfidence, coverageNorm)
      : coverageNorm;

    const totalAfterConfidence = CONFIDENCE_AWARE_RANKING_ENABLED
      ? clamp(rawTotal * (CONFIDENCE_FLOOR + (1 - CONFIDENCE_FLOOR) * confidenceFactor))
      : rawTotal;
    const total = applyUserOffset(totalAfterConfidence, asset.asset_class, userClassOffsets);

    const confidence: "high" | "medium" | "low" =
      confidenceFactor >= 0.75 ? "high" : confidenceFactor >= 0.5 ? "medium" : "low";

    const score_breakdown: ScoreBreakdown = {
      ...score_breakdown_dims,
      total,
      signal_coverage,
      scored_dimensions,
      dimension_basis,
      confidence_factor: Math.round(confidenceFactor * 100) / 100,
      ...(categoryConfidence !== undefined ? { category_confidence: categoryConfidence } : {}),
    } as ScoreBreakdown;

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
      ...(categoryConfidence !== undefined ? { category_confidence: categoryConfidence } : {}),
      asset_class: asset.asset_class ?? null,
      signals: asset.signals ?? [],
      completeness_score: asset.completeness_score,
      last_seen_at: asset.last_seen_at,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  const ranked = applyTopKConfidenceGate(scored, 5);

  const top10 = ranked.slice(0, 10);
  const tasks = top10.map((asset) => async () => {
    try {
      asset.why_it_matters = await generateWhyItMatters(asset, buyerProfile);
    } catch (err) {
      if (isFatalOpenAIError(err)) throw err;
    }
  });

  await runWithConcurrency(tasks, 3);

  return ranked;
}
