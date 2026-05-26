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

// TTO base score: 3 dimensions, fit removed from the weighted sum.
// Fit is applied as a separate additive bonus (+0/+8/+15/+20) after the base
// score so it boosts thesis-aligned assets without ever penalising others.
// search_relevance carries the primary weight so query match drives ranking.
// When no query is present (filter-only browse), search_relevance returns
// hasData:false and its weight auto-redistributes to quality + availability.
export const TTO_WEIGHTS: Record<string, number> = {
  search_relevance: 0.80,  // query relevance — primary ranking driver
  record_quality:   0.12,  // data completeness — tiebreaker
  availability:     0.08,  // portal confirmation recency — tiebreaker
};

// ─── Confidence-aware ranking (Task #693) ─────────────────────────────────────
export const CONFIDENCE_FLOOR = 0.4;
export const LOW_CONFIDENCE_THRESHOLD = 0.5;
const isProdEnv = (process.env.NODE_ENV ?? "").toLowerCase() === "production";
const flagRaw = (process.env.EDEN_CONFIDENCE_AWARE_RANKING ?? "").toLowerCase();
// Require explicit opt-in; never default ON in non-prod (was !isProdEnv which
// caused all scores to be crushed to 4–7 in dev due to low category_confidence).
export const CONFIDENCE_AWARE_RANKING_ENABLED = flagRaw === "true";

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

// ─── Legacy scoreFit — used by the 6-dimension non-TTO model only ─────────────
// Kept for the /api/search path (papers, patents, clinical trials).
// TTO scoring uses computeFitBonus instead.
export function scoreFit(asset: Partial<ScoredAsset>, buyerProfile?: BuyerProfile): DimensionResult {
  if (!buyerProfile) {
    return { score: 50, hasData: false, basis: "No buyer profile — fit not scored" };
  }
  const hasCriteria =
    buyerProfile.therapeutic_areas.length > 0 ||
    buyerProfile.modalities.length > 0 ||
    buyerProfile.preferred_stages.length > 0 ||
    buyerProfile.indication_keywords.length > 0 ||
    buyerProfile.target_keywords.length > 0;
  if (!hasCriteria) {
    return { score: 50, hasData: false, basis: "No criteria set" };
  }
  let score = 0;
  let checks = 0;
  const matched: string[] = [];
  if (buyerProfile.therapeutic_areas.length > 0) {
    const text = `${asset.indication ?? ""} ${asset.target ?? ""} ${asset.matching_tags?.join(" ") ?? ""}`.toLowerCase();
    const hit = buyerProfile.therapeutic_areas.some((ta) => text.includes(ta.toLowerCase()));
    score += hit ? 40 : 0; checks++;
    if (hit) matched.push("therapeutic area");
  }
  if (buyerProfile.modalities.length > 0) {
    const hit = buyerProfile.modalities.some((m) => (asset.modality ?? "").toLowerCase().includes(m.toLowerCase()));
    score += hit ? 30 : 0; checks++;
    if (hit) matched.push("modality");
  }
  const kwAll = [...buyerProfile.indication_keywords, ...buyerProfile.target_keywords];
  if (kwAll.length > 0) {
    const text = `${asset.indication ?? ""} ${asset.target ?? ""} ${asset.matching_tags?.join(" ") ?? ""}`.toLowerCase();
    const hits = kwAll.filter((kw) => text.includes(kw.toLowerCase())).length;
    score += (hits / kwAll.length) * 30; checks++;
    if (hits > 0) matched.push(`${hits}/${kwAll.length} keywords`);
  }
  if (buyerProfile.preferred_stages.length > 0) {
    const hit = buyerProfile.preferred_stages.some((ps) => (asset.development_stage ?? "").toLowerCase().includes(ps.toLowerCase()));
    checks++;
    if (hit) { score += 20; matched.push("stage"); }
  }
  if (buyerProfile.excluded_stages.some((es) => (asset.development_stage ?? "").toLowerCase().includes(es.toLowerCase()))) {
    score -= 50;
  }
  const total = checks === 0 ? 50 : clamp(25 + score);
  return { score: total, hasData: true, basis: matched.length > 0 ? `Matches: ${matched.join(", ")}` : "No criteria matched" };
}

// ─── TTO fit bonus (boost-only, replaces scoreFit for TTO assets) ─────────────
// Returns an additive points bonus: 0 / +8 / +15 / +20.
// Never subtracts from the base score — a non-matching asset keeps its
// relevance-based score rather than being penalised for imperfect DB fields.
//
// Uses FULL-TEXT soft matching across name + indication + target + modality +
// summary + biology, not just the structured DB columns. A CAR-T asset whose
// modality column reads "biologic" still matches "cell therapy" if the summary
// or asset name contains "chimeric antigen receptor T-cell".
//
// Excluded stages are the ONE hard stop: they suppress the bonus but don't
// subtract — the base score is unchanged.
export type FitBonusAsset = {
  asset_name?: string;
  indication?: string;
  target?: string;
  modality?: string;
  summary?: string;
  biology?: string;
  matching_tags?: string[];
  development_stage?: string;
};

export function computeFitBonus(asset: FitBonusAsset, buyerProfile?: BuyerProfile): number {
  if (!buyerProfile) return 0;

  const hasCriteria =
    buyerProfile.therapeutic_areas.length > 0 ||
    buyerProfile.modalities.length > 0 ||
    (buyerProfile.preferred_stages?.length ?? 0) > 0 ||
    (buyerProfile.indication_keywords?.length ?? 0) > 0 ||
    (buyerProfile.target_keywords?.length ?? 0) > 0;

  if (!hasCriteria) return 0;

  // Excluded stages: suppress bonus (but don't penalise base score)
  const assetStage = (asset.development_stage ?? "").toLowerCase();
  if (buyerProfile.excluded_stages?.length > 0) {
    if (buyerProfile.excluded_stages.some((es) => assetStage.includes(es.toLowerCase()))) return 0;
  }

  // Full text — catches semantic meaning regardless of how ingestion structured the fields
  const fullText = [
    asset.asset_name,
    asset.indication,
    asset.target,
    asset.modality,
    asset.summary,
    asset.biology,
    ...(asset.matching_tags ?? []),
  ].filter(Boolean).join(" ").toLowerCase();

  let hits = 0;
  let checks = 0;

  if (buyerProfile.therapeutic_areas.length > 0) {
    checks++;
    if (buyerProfile.therapeutic_areas.some((ta) => fullText.includes(ta.toLowerCase()))) hits++;
  }

  if (buyerProfile.modalities.length > 0) {
    checks++;
    if (buyerProfile.modalities.some((m) => fullText.includes(m.toLowerCase()))) hits++;
  }

  const kwAll = [...(buyerProfile.indication_keywords ?? []), ...(buyerProfile.target_keywords ?? [])];
  if (kwAll.length > 0) {
    checks++;
    if (kwAll.some((kw) => fullText.includes(kw.toLowerCase()))) hits++;
  }

  if ((buyerProfile.preferred_stages?.length ?? 0) > 0) {
    checks++;
    if (buyerProfile.preferred_stages.some((ps) => assetStage.includes(ps.toLowerCase()))) hits++;
  }

  if (checks === 0) return 0;
  const ratio = hits / checks;
  if (ratio >= 0.75) return 20;  // strong match — most criteria confirmed
  if (ratio >= 0.50) return 15;  // good match
  if (ratio > 0)     return 8;   // partial match — at least one criterion confirmed
  return 0;
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

// ─── TTO-specific dimension: Search Relevance ─────────────────────────────────
// Score is an absolute field-match grade computed by fieldMatchScore() in
// routes.ts: 95 = term in asset name, 85 = indication/target, 75 = moa/modality,
// 65 = description, 55 = secondary fields, 40 = FTS/vector only.
// When no query is present (filter-only browse) the caller passes undefined and
// this returns hasData:false — its 80% weight is auto-redistributed to the
// remaining dimensions by computeTotal.
// basisOverride carries the field-specific label computed at the call site so
// the tooltip accurately names which field each query term matched.
export function scoreSearchRelevance(normalizedScore?: number, basisOverride?: string): DimensionResult {
  if (normalizedScore == null) {
    return { score: 50, hasData: false, basis: "No query — relevance not applicable" };
  }
  const s = Math.max(0, Math.min(100, Math.round(normalizedScore)));
  // Fall back to threshold-band labels only when no per-asset basis was provided
  // (e.g. callers outside the scout-search route).
  const basis = basisOverride ?? (
    s >= 90 ? "Query term found in asset name" :
    s >= 80 ? "Query term found in indication or target" :
    s >= 70 ? "Query term found in mechanism or modality" :
    s >= 60 ? "Query term found in description" :
    s >= 50 ? "Query term found in secondary fields" :
              `Semantic or full-text match (score: ${s}/100)`
  );
  return { score: s, hasData: true, basis };
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
      // ── TTO base score: relevance + quality + availability ──────────────
      // Fit is applied separately as an additive bonus after this block.
      // search_relevance has no normalized score in batch context (no per-query
      // RRF) — hasData:false causes its 80% weight to redistribute to quality
      // and availability, which is correct for non-search (admin/pipeline) use.
      const searchRelResult    = scoreSearchRelevance(undefined);
      const completenessResult = scoreCompleteness(asset);
      const availabilityResult = scoreAvailability(asset);

      const dimResults: Record<string, DimensionResult> = {
        search_relevance: searchRelResult,
        record_quality:   completenessResult,
        availability:     availabilityResult,
      };

      let baseTotal: number;
      ({ total: baseTotal, signal_coverage, scored_dimensions, dimension_basis } =
        computeTotal(dimResults, TTO_WEIGHTS));

      const fitBonus = computeFitBonus(asset, buyerProfile);
      rawTotal = clamp(baseTotal + fitBonus);

      score_breakdown_dims = {
        search_relevance: searchRelResult.score,
        record_quality:   completenessResult.score,
        availability:     availabilityResult.score,
        fit_bonus:        fitBonus,
        // Zero out legacy fields so the breakdown object is well-formed
        fit:          0,
        novelty:      0,
        freshness:    0,
        readiness:    0,
        licensability: 0,
        competition:  0,
      } as Partial<ScoreBreakdown>;
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
