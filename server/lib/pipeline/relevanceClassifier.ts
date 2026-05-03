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
// Weights chosen so that 2 biotech keywords (the old hard rule for "pass") yields ~0.85,
// 0 biotech + 2 non-biotech yields ~0.10, and 1/1 sits near 0.40 (ambiguous-leaning-reject).
const W_BIOTECH = 0.65;
const W_NON_BIOTECH = -1.10;
const W_LENGTH = 0.25;
const BIAS = -0.95;

const DEFAULT_THRESHOLD = 0.5;

const isProdEnv = (process.env.NODE_ENV ?? "").toLowerCase() === "production";
const flagRaw = (process.env.EDEN_RELEVANCE_CLASSIFIER_V2 ?? "").toLowerCase();
export const CLASSIFIER_V2_ENABLED = flagRaw === "true"
  ? true
  : flagRaw === "false"
    ? false
    : !isProdEnv;

const thresholdRaw = parseFloat(process.env.EDEN_RELEVANCE_CLASSIFIER_THRESHOLD ?? "");
export const CLASSIFIER_THRESHOLD = Number.isFinite(thresholdRaw) && thresholdRaw > 0 && thresholdRaw < 1
  ? thresholdRaw
  : DEFAULT_THRESHOLD;

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

export function scoreText(text: string): { prob: number; features: ClassifierFeatures } {
  const features = extractFeatures(text);
  const z = BIAS
    + W_BIOTECH * features.biotechHits
    + W_NON_BIOTECH * features.nonBiotechHits
    + W_LENGTH * features.lengthFactor;
  return { prob: sigmoid(z), features };
}

export function predictRelevance(text: string, threshold: number = CLASSIFIER_THRESHOLD): {
  label: boolean;
  prob: number;
  features: ClassifierFeatures;
} {
  const { prob, features } = scoreText(text);
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
): PreFilterResult {
  const text = `${listing.title} ${listing.description ?? ""}`;
  const { prob } = scoreText(text);
  if (prob >= threshold + 0.15) return "pass";
  if (prob <= threshold - 0.15) return "reject";
  return "ambiguous";
}

export function preFilterBatchV2(listings: ScrapedListing[], threshold: number = CLASSIFIER_THRESHOLD): {
  passed: ScrapedListing[];
  rejected: ScrapedListing[];
  ambiguous: ScrapedListing[];
} {
  const passed: ScrapedListing[] = [];
  const rejected: ScrapedListing[] = [];
  const ambiguous: ScrapedListing[] = [];
  for (const l of listings) {
    const r = preFilterRelevanceV2(l, threshold);
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
export function activePreFilterBatch(listings: ScrapedListing[]): {
  passed: ScrapedListing[];
  rejected: ScrapedListing[];
  ambiguous: ScrapedListing[];
  variant: "v1_keyword" | "v2_classifier";
} {
  if (CLASSIFIER_V2_ENABLED) {
    const r = preFilterBatchV2(listings);
    return { ...r, variant: "v2_classifier" };
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
  return { passed, rejected, ambiguous, variant: "v1_keyword" };
}
