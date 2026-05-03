import type { ScrapedListing } from "../scrapers/types";
import { preFilterRelevance, type PreFilterResult } from "./relevancePreFilter";

const NON_BIOTECH_KEYWORDS = [
  "solar panel", "wind turbine", "concrete", "asphalt", "road surface",
  "building material", "textile", "fabric", "leather", "apparel",
  "furniture", "automotive exhaust", "combustion engine", "diesel",
  "petroleum", "oil drilling", "mining equipment", "excavation",
  "architectural design", "interior decoration", "landscaping",
  "video game", "social media", "cryptocurrency", "blockchain",
  "real estate", "property management", "consumer electronics",
  "smartphone case", "kitchen appliance", "household cleaning",
  "pet food", "cosmetic fragrance", "hair styling",
];

const BIOTECH_KEYWORDS = [
  "antibod", "inhibitor", "receptor", "kinase", "enzyme", "protein",
  "gene", "crispr", "rna", "dna", "mrna", "sirna", "antisense",
  "peptide", "vaccine", "immuno", "oncolog", "cancer", "tumor", "tumour",
  "therapeutic", "pharma", "drug", "compound", "molecule",
  "biomarker", "assay", "diagnostic", "imaging", "cell therapy",
  "stem cell", "regenerat", "tissue", "organ", "implant",
  "nanoparticle", "liposom", "delivery", "formulation",
  "pathogen", "viral", "bacteri", "fungal", "infect",
  "inflammat", "autoimmun", "neurodegenerat", "cardiovascular",
  "metaboli", "diabetes", "obesity", "fibrosis", "renal",
  "ophthalm", "retina", "dermatol", "wound heal",
  "surgical", "prosthe", "catheter", "stent", "medical device",
  "biologic", "biosimil", "monoclonal", "bispecific",
  "protac", "degrader", "agonist", "antagonist", "modulator",
  "clinical trial", "preclinical", "in vivo", "in vitro",
  "patient", "treatment", "therapy", "disease", "disorder",
  "syndrome", "condition", "symptom", "diagnosis",
];

// Calibrated logistic over keyword features + length signal.
// score = sigmoid( w_b * biotechHits + w_n * nonBiotechHits + w_l * lengthFactor + b )
// These are the FALLBACK ("baked-in") weights. They were hand-picked in
// Task #694 so that 2 biotech keywords (the old hard rule for "pass") yields
// ~0.85, 0 biotech + 2 non-biotech yields ~0.10, and 1/1 sits near 0.40
// (ambiguous-leaning-reject). Task #699 adds an offline trainer that fits
// these from the relevance_holdout train split and persists the fitted
// vector via storage.setTunedClassifierWeights — getActiveWeights() reads
// the persisted weights when present, otherwise returns this default.
export type ClassifierWeights = {
  wBiotech: number;
  wNonBiotech: number;
  wLength: number;
  bias: number;
};

export const DEFAULT_WEIGHTS: ClassifierWeights = {
  wBiotech: 0.65,
  wNonBiotech: -1.10,
  wLength: 0.25,
  bias: -0.95,
};

// Bump whenever fallback weights/keywords/feature extraction change so
// downstream caches (e.g. the admin /relevance/eval per-row probability
// cache) miss and rescore. Format: yyyymmdd-shortDescriptor. Tuned weights
// from setTunedClassifierWeights generate their own per-vector signature
// that gets folded into the eval cache key separately.
export const CLASSIFIER_VERSION = "20260503-v2-w065-wn110-wl025-b095";

const DEFAULT_THRESHOLD = 0.5;

const isProdEnv = (process.env.NODE_ENV ?? "").toLowerCase() === "production";
const flagRaw = (process.env.EDEN_RELEVANCE_CLASSIFIER_V2 ?? "").toLowerCase();
export const CLASSIFIER_V2_ENABLED = flagRaw === "true"
  ? true
  : flagRaw === "false"
    ? false
    : !isProdEnv;

const thresholdRaw = parseFloat(process.env.EDEN_RELEVANCE_CLASSIFIER_THRESHOLD ?? "");
const ENV_THRESHOLD = Number.isFinite(thresholdRaw) && thresholdRaw > 0 && thresholdRaw < 1
  ? thresholdRaw
  : null;
export const CLASSIFIER_THRESHOLD = ENV_THRESHOLD ?? DEFAULT_THRESHOLD;

// Tuned threshold: persisted by POST /api/admin/relevance/threshold/tune
// after evaluating the holdout. Cached for 5 min so the hot path doesn't
// hit the DB. Env var takes precedence (for explicit ops overrides).
const THRESHOLD_CACHE_MS = 5 * 60 * 1000;
let cachedTunedThreshold: { value: number | null; expiresAt: number } = { value: null, expiresAt: 0 };

export function invalidateThresholdCache(): void {
  cachedTunedThreshold = { value: null, expiresAt: 0 };
}

export async function getActiveThreshold(): Promise<number> {
  if (ENV_THRESHOLD != null) return ENV_THRESHOLD;
  const now = Date.now();
  if (now < cachedTunedThreshold.expiresAt) {
    return cachedTunedThreshold.value ?? DEFAULT_THRESHOLD;
  }
  try {
    const { storage } = await import("../../storage");
    const tuned = await storage.getTunedClassifierThreshold();
    cachedTunedThreshold = { value: tuned?.threshold ?? null, expiresAt: now + THRESHOLD_CACHE_MS };
    return tuned?.threshold ?? DEFAULT_THRESHOLD;
  } catch {
    cachedTunedThreshold = { value: null, expiresAt: now + THRESHOLD_CACHE_MS };
    return DEFAULT_THRESHOLD;
  }
}

// Tuned weights: persisted by POST /api/admin/relevance/weights/tune (and the
// scripts/train-relevance-classifier.ts CLI). Same caching pattern as the
// threshold above. invalidateWeightsCache() makes a tune take effect on the
// next pre-filter call without a server restart.
const WEIGHTS_CACHE_MS = 5 * 60 * 1000;
let cachedTunedWeights: { value: ClassifierWeights | null; expiresAt: number } = { value: null, expiresAt: 0 };

export function invalidateWeightsCache(): void {
  cachedTunedWeights = { value: null, expiresAt: 0 };
}

export async function getActiveWeights(): Promise<ClassifierWeights> {
  const now = Date.now();
  if (now < cachedTunedWeights.expiresAt) {
    return cachedTunedWeights.value ?? DEFAULT_WEIGHTS;
  }
  try {
    const { storage } = await import("../../storage");
    const tuned = await storage.getTunedClassifierWeights();
    cachedTunedWeights = { value: tuned?.weights ?? null, expiresAt: now + WEIGHTS_CACHE_MS };
    return tuned?.weights ?? DEFAULT_WEIGHTS;
  } catch {
    cachedTunedWeights = { value: null, expiresAt: now + WEIGHTS_CACHE_MS };
    return DEFAULT_WEIGHTS;
  }
}

// Stable signature for an active-weights vector — used to invalidate the
// admin /relevance/eval per-row score cache when tuned weights change.
export function weightsSignature(w: ClassifierWeights): string {
  return `wb${w.wBiotech.toFixed(4)}-wn${w.wNonBiotech.toFixed(4)}-wl${w.wLength.toFixed(4)}-b${w.bias.toFixed(4)}`;
}

function sigmoid(z: number): number {
  if (z >= 0) {
    const e = Math.exp(-z);
    return 1 / (1 + e);
  }
  const e = Math.exp(z);
  return e / (1 + e);
}

export type ClassifierFeatures = {
  biotechHits: number;
  nonBiotechHits: number;
  lengthFactor: number;
};

export function extractFeatures(text: string): ClassifierFeatures {
  const t = text.toLowerCase();
  let biotechHits = 0;
  for (const kw of BIOTECH_KEYWORDS) if (t.includes(kw)) biotechHits++;
  let nonBiotechHits = 0;
  for (const kw of NON_BIOTECH_KEYWORDS) if (t.includes(kw)) nonBiotechHits++;
  // Saturating length factor: 0 if empty, ~0.5 at 200 chars, ~1 at 800+ chars.
  const lengthFactor = Math.min(1, Math.log10(Math.max(1, t.length)) / 3);
  return { biotechHits, nonBiotechHits, lengthFactor };
}

export function scoreText(
  text: string,
  weights: ClassifierWeights = DEFAULT_WEIGHTS,
): { prob: number; features: ClassifierFeatures } {
  const features = extractFeatures(text);
  const z = weights.bias
    + weights.wBiotech * features.biotechHits
    + weights.wNonBiotech * features.nonBiotechHits
    + weights.wLength * features.lengthFactor;
  return { prob: sigmoid(z), features };
}

export function predictRelevance(
  text: string,
  threshold: number = CLASSIFIER_THRESHOLD,
  weights: ClassifierWeights = DEFAULT_WEIGHTS,
): {
  label: boolean;
  prob: number;
  features: ClassifierFeatures;
} {
  const { prob, features } = scoreText(text, weights);
  return { label: prob >= threshold, prob, features };
}

/**
 * Drop-in replacement for `preFilterRelevance` that returns the same
 * pass / reject / ambiguous trichotomy. We carve a low-confidence band
 * around the threshold (±0.15) and route those into the existing review
 * queue instead of auto-rejecting.
 */
export function preFilterRelevanceV2(
  listing: ScrapedListing,
  threshold: number = CLASSIFIER_THRESHOLD,
  weights: ClassifierWeights = DEFAULT_WEIGHTS,
): PreFilterResult {
  const text = `${listing.title} ${listing.description ?? ""}`;
  const { prob } = scoreText(text, weights);
  if (prob >= threshold + 0.15) return "pass";
  if (prob <= threshold - 0.15) return "reject";
  return "ambiguous";
}

export function preFilterBatchV2(
  listings: ScrapedListing[],
  threshold: number = CLASSIFIER_THRESHOLD,
  weights: ClassifierWeights = DEFAULT_WEIGHTS,
): {
  passed: ScrapedListing[];
  rejected: ScrapedListing[];
  ambiguous: ScrapedListing[];
} {
  const passed: ScrapedListing[] = [];
  const rejected: ScrapedListing[] = [];
  const ambiguous: ScrapedListing[] = [];
  for (const l of listings) {
    const r = preFilterRelevanceV2(l, threshold, weights);
    if (r === "pass") passed.push(l);
    else if (r === "reject") rejected.push(l);
    else ambiguous.push(l);
  }
  return { passed, rejected, ambiguous };
}

/**
 * Active pre-filter chosen by the EDEN_RELEVANCE_CLASSIFIER_V2 flag.
 * Falls back to the legacy keyword rule when the flag is off so we
 * keep the existing behaviour intact in production until rollout.
 */
export async function activePreFilterBatch(listings: ScrapedListing[]): Promise<{
  passed: ScrapedListing[];
  rejected: ScrapedListing[];
  ambiguous: ScrapedListing[];
  variant: "v1_keyword" | "v2_classifier";
  threshold: number;
}> {
  if (CLASSIFIER_V2_ENABLED) {
    // Resolve the live threshold (env > tuned-from-DB > default) AND the
    // tuned weight vector. Both are cached for 5 minutes; a tune call
    // (threshold/tune or weights/tune) calls the corresponding invalidate
    // function so the next pre-filter picks up the new value immediately.
    const [threshold, weights] = await Promise.all([
      getActiveThreshold(),
      getActiveWeights(),
    ]);
    const r = preFilterBatchV2(listings, threshold, weights);
    return { ...r, variant: "v2_classifier", threshold };
  }
  const passed: ScrapedListing[] = [];
  const rejected: ScrapedListing[] = [];
  const ambiguous: ScrapedListing[] = [];
  for (const l of listings) {
    const r = preFilterRelevance(l);
    if (r === "pass") passed.push(l);
    else if (r === "reject") rejected.push(l);
    else ambiguous.push(l);
  }
  return { passed, rejected, ambiguous, variant: "v1_keyword", threshold: 0 };
}
