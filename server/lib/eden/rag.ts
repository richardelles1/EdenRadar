import OpenAI from "openai";
import type { RetrievedAsset } from "../../storage";
import { db } from "../../db";
import { ingestedAssets, therapyAreaTaxonomy, edenSessions } from "../../../shared/schema";
import { sql, desc, eq } from "drizzle-orm";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const EMBED_MODEL = "text-embedding-3-small";

// When a fine-tuned model is ready, set EDEN_FINETUNE_MODEL_ID to deploy it.
// The fine-tuned model replaces gpt-4o for all ragQuery calls.
// Leave unset to use the base gpt-4o.
export const EDEN_RAG_MODEL = process.env.EDEN_FINETUNE_MODEL_ID ?? "gpt-4o";

// ── Embedding cache (Promise-based to eliminate concurrent duplicate calls) ──
// Stores the in-flight or resolved Promise so two identical queries arriving
// before the first resolves share one API call instead of making two.
// Failures delete their own cache entry so the next caller retries cleanly.
const _embedCache = new Map<string, { promise: Promise<number[]>; ts: number }>();
const EMBED_CACHE_TTL = 5 * 60 * 1000;
const EMBED_CACHE_MAX = 200;

// ── Intent classification cache ──────────────────────────────────────────────
// classifyIntent is deterministic for same (message, hasPriorAssets, focus).
// Avoids a GPT-4o-mini round-trip for repeated or near-identical follow-ups.
const _intentCache = new Map<string, { result: IntentClassification; ts: number }>();
const INTENT_CACHE_TTL = 3 * 60 * 1000;
const INTENT_CACHE_MAX = 500;

export { type RetrievedAsset };

export type UserContext = {
  companyName?: string;
  companyType?: string;
  therapeuticAreas?: string[];
  dealStages?: string[];
  modalities?: string[];
  engagementBoosts?: {
    modalities?: Record<string, number>;
    indications?: Record<string, number>;
  };
};

// ── Structured filter types ───────────────────────────────────────────────

export type GeoKey = "us" | "eu" | "uk" | "asia";

export type RecencyWindow = "last7" | "last30" | "last90" | "last180" | "lastyear";

export type QueryFilters = {
  modality?: string;
  geography?: GeoKey;
  stage?: string;
  indication?: string;
  institution?: string;
  biology?: string;
  // Temporal filters — per-query only, never accumulated into SessionFocusContext.
  // "last7/30/90/180/lastyear" maps to first_seen_at >= NOW() - INTERVAL.
  // trending=true adds a completeness_score threshold and signals EDEN to add market context.
  recency?: RecencyWindow;
  trending?: boolean;
};

export type CrossSessionMemory = {
  topModalities: string[];
  topIndications: string[];
  topBiologies: string[];
  topInstitutions: string[];
  recentSummary?: string;
  sessionCount: number;
};

export type SessionFocusContext = {
  modality?: string;
  geography?: GeoKey;
  stage?: string;
  indication?: string;
  institution?: string;
  biology?: string;
  _summary?: string;
  _crossSessionMemory?: CrossSessionMemory;
  _lastDocType?: string;
};

export function buildCrossSessionMemory(
  sessions: Array<{ focusContext?: Record<string, unknown> | null }>
): CrossSessionMemory | null {
  if (!sessions.length) return null;
  const mc: Record<string, number> = {};
  const ic: Record<string, number> = {};
  const bc: Record<string, number> = {};
  const nc: Record<string, number> = {};
  let recentSummary: string | undefined;

  for (let i = 0; i < sessions.length; i++) {
    const fc = sessions[i].focusContext;
    if (!fc) continue;
    const w = sessions.length - i; // recency weight
    if (fc.modality) mc[fc.modality as string] = (mc[fc.modality as string] ?? 0) + w;
    if (fc.indication) ic[fc.indication as string] = (ic[fc.indication as string] ?? 0) + w;
    if (fc.biology) bc[fc.biology as string] = (bc[fc.biology as string] ?? 0) + w;
    if (fc.institution) nc[fc.institution as string] = (nc[fc.institution as string] ?? 0) + w;
    if (!recentSummary && fc._summary) recentSummary = fc._summary as string;
  }

  const topN = (counts: Record<string, number>, n = 3) =>
    Object.entries(counts).sort(([, a], [, b]) => b - a).slice(0, n).map(([k]) => k);

  const topModalities = topN(mc);
  const topIndications = topN(ic);
  const topBiologies = topN(bc);
  const topInstitutions = topN(nc);

  if (!topModalities.length && !topIndications.length && !recentSummary) return null;

  return { topModalities, topIndications, topBiologies, topInstitutions, recentSummary, sessionCount: sessions.length };
}

// In-session engagement signals: tracks which modalities/indications the user
// has engaged with across turns (frequency-weighted, resets on explicit clear).
export type EngagementSignals = {
  modalities: Record<string, number>;   // canonical modality → frequency count
  indications: Record<string, number>;  // indication keyword → frequency count
  biologies: Record<string, number>;    // biology mechanism → frequency count
};

// Minimal shape of a stored session message (matches edenSessions.messages jsonb)
type SessionMessage = {
  role: "user" | "assistant";
  content: string;
  assetIds?: number[];
  assets?: Array<{
    id: number;
    assetName: string;
    institution: string;
    indication: string;
    modality: string;
    developmentStage?: string;
    biology?: string;
  }>;
  ts: string;
};

// In-memory session focus store (ephemeral — fine for this use case)
const _sessionFocusMap = new Map<string, SessionFocusContext>();

// Per-session reset timestamps: engagement signals derived from history only
// count messages whose ts is AFTER the last reset for that session (ms epoch).
const _sessionResetMap = new Map<string, number>();

// ── Vocabulary tables ─────────────────────────────────────────────────────

const MODALITY_ALIASES: Record<string, string> = {
  "gene therapy": "Gene Therapy",
  "gene editing": "Gene Editing",
  "base editing": "Gene Editing",
  "prime editing": "Gene Editing",
  "cell therapy": "Cell Therapy",
  "car-t": "CAR-T",
  "car t": "CAR-T",
  "cart": "CAR-T",
  "small molecule": "Small Molecule",
  "antibody": "Antibody",
  "monoclonal antibody": "Antibody",
  "monoclonal": "Antibody",
  "mab": "Antibody",
  "naked antibody": "Antibody",
  "mrna": "mRNA",
  "rna therapeutics": "RNA Therapeutics",
  "rna therapy": "RNA Therapeutics",
  "lnp": "mRNA",
  "lipid nanoparticle": "mRNA",
  "sirna": "siRNA",
  "antisense": "Antisense",
  "aso": "Antisense",
  "oligonucleotide": "Antisense",
  "protac": "PROTAC",
  "adc": "ADC",
  "antibody-drug conjugate": "ADC",
  "antibody drug conjugate": "ADC",
  "bispecific": "Bispecific Antibody",
  "bispecific antibody": "Bispecific Antibody",
  "bi-specific": "Bispecific Antibody",
  "vaccine": "Vaccine",
  "peptide": "Peptide",
  "nanoparticle": "Nanoparticle",
  "protein therapy": "Protein/Biologics",
  "protein replacement": "Protein/Biologics",
  "biologic": "Protein/Biologics",
  "biologics": "Protein/Biologics",
  "viral vector": "Gene Therapy",
  "aav": "Gene Therapy",
  "lentiviral": "Gene Therapy",
};

// ── Institution patterns for two-pass detection ───────────────────────────
export const INSTITUTION_PATTERNS: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /\bstanford\b/i, name: "stanford" },
  { pattern: /\bmit\b|\bmassachusetts\s+institute\b/i, name: "mit" },
  { pattern: /\bharvard\b/i, name: "harvard" },
  { pattern: /\bcolumbia\b/i, name: "columbia" },
  { pattern: /\byale\b/i, name: "yale" },
  { pattern: /\bjohns\s+hop+kins\b/i, name: "johns hopkins" },
  { pattern: /\bduke\b/i, name: "duke" },
  { pattern: /\bucsf\b/i, name: "ucsf" },
  { pattern: /\bucla\b/i, name: "ucla" },
  { pattern: /\bcaltech\b|\bcalifornia\s+institute\s+of\s+tech/i, name: "caltech" },
  { pattern: /\bcornell\b/i, name: "cornell" },
  { pattern: /\bprinceton\b/i, name: "princeton" },
  { pattern: /\bupenn\b|\buniversity\s+of\s+pennsylvania\b/i, name: "university of pennsylvania" },
  { pattern: /\buniversity\s+of\s+michigan\b/i, name: "university of michigan" },
  { pattern: /\buniversity\s+of\s+toronto\b/i, name: "university of toronto" },
  { pattern: /\buniversity\s+of\s+oxford\b|\boxford\s+university\b/i, name: "university of oxford" },
  { pattern: /\buniversity\s+of\s+cambridge\b|\bcambridge\s+university\b/i, name: "university of cambridge" },
  { pattern: /\bwustl\b|\bwashington\s+university\b/i, name: "washington university" },
  { pattern: /\buc\s+san\s+diego\b|\bucsd\b/i, name: "uc san diego" },
  { pattern: /\buc\s+davis\b/i, name: "uc davis" },
  { pattern: /\buc\s+berkeley\b|\bberkeley\b/i, name: "uc berkeley" },
  { pattern: /\bpitt\b|\buniversity\s+of\s+pittsburgh\b/i, name: "university of pittsburgh" },
  { pattern: /\bemory\b/i, name: "emory" },
  { pattern: /\bvanderbi?lt\b/i, name: "vanderbilt" },
  { pattern: /\bgeorgetown\b/i, name: "georgetown" },
  { pattern: /\bnorthwestern\b/i, name: "northwestern" },
  { pattern: /\bnyu\b|\bnew\s+york\s+university\b/i, name: "new york university" },
  { pattern: /\bbaylor\b/i, name: "baylor" },
  { pattern: /\btufts\b/i, name: "tufts" },
  { pattern: /\bmayo\b/i, name: "mayo" },
  { pattern: /\bmd\s+anderson\b/i, name: "md anderson" },
  { pattern: /\bsloan\s+kettering\b|\bmskcc\b/i, name: "memorial sloan kettering" },
  { pattern: /\bsalk\b/i, name: "salk" },
  { pattern: /\bscripps\b/i, name: "scripps" },
  { pattern: /\bgeorgia\s+tech\b/i, name: "georgia tech" },
  { pattern: /\bpurdue\b/i, name: "purdue" },
  { pattern: /\bimperial\s+college\b/i, name: "imperial college" },
  { pattern: /\bkarolinska\b/i, name: "karolinska" },
  { pattern: /\beth\s+zurich\b/i, name: "eth zurich" },
  // Oxford: single canonical "oxford" so ILIKE '%oxford%' matches both "University of Oxford"
  // and shorter references. Removed the separate /\boxford\b/ entry that was producing
  // two different canonical names from the same institution.
  { pattern: /\boxford\b|\buniversity\s+of\s+oxford\b|\boxford\s+university\b/i, name: "oxford" },
  { pattern: /\bfred\s+hutch\b|\bfrederick\s+hutchinson\b/i, name: "fred hutch" },
  { pattern: /\bbroad\s+institute\b|\bthe\s+broad\b/i, name: "broad institute" },
  { pattern: /\bdana.?farber\b/i, name: "dana-farber" },
  { pattern: /\bbrigham\s+and\s+women\b|\bbwh\b/i, name: "brigham and women" },
  { pattern: /\bmass\s+general\b|\bmassachusetts\s+general\b|\bmgh\b/i, name: "massachusetts general" },
  { pattern: /\bweill\s+cornell\b/i, name: "weill cornell" },
  { pattern: /\bsinai\b|\bicahn\b/i, name: "mount sinai" },
  { pattern: /\bcase\s+western\b/i, name: "case western" },
  { pattern: /\bdartmouth\b/i, name: "dartmouth" },
  { pattern: /\bwake\s+forest\b/i, name: "wake forest" },
  { pattern: /\buniversity\s+of\s+british\s+columbia\b|\bubc\b/i, name: "university of british columbia" },
];

export function detectInstitutionName(query: string, portfolioInstitutions?: string[]): string | null {
  // Pass 1: pattern-based matching (fast, handles abbreviations like MIT, UCSF)
  for (const { pattern, name } of INSTITUTION_PATTERNS) {
    if (pattern.test(query)) return name;
  }
  // Pass 2: substring scan against live portfolio institution names
  if (portfolioInstitutions?.length) {
    const lowerQuery = query.toLowerCase();
    for (const inst of portfolioInstitutions) {
      if (!inst || inst.length < 4) continue;
      if (lowerQuery.includes(inst.toLowerCase())) return inst;
    }
  }
  return null;
}

// Like detectInstitutionName but returns ALL institutions mentioned in the query.
// Uses the same two-pass approach (alias patterns first, then portfolio substring scan)
// so abbreviations like MIT, UCSF, WUSTL are handled correctly.
// Dedup is unified: canonical names from pass 1 are also stored in the seen set
// under their lowercase key so pass 2 cannot re-add a portfolio variant of the
// same institution (e.g., "Washington University" already resolved from WUSTL pattern
// will block "washington university" substring match in pass 2).
export function detectAllInstitutionNames(query: string, portfolioInstitutions?: string[]): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  // Pass 1: pattern-based (each match recorded by canonical name; add both
  // the canonical string and its lowercase key to prevent pass-2 re-addition)
  for (const { pattern, name } of INSTITUTION_PATTERNS) {
    if (pattern.test(query) && !seen.has(name)) {
      found.push(name);
      seen.add(name);           // canonical, already lowercase in INSTITUTION_PATTERNS
    }
  }
  // Pass 2: portfolio institution substring scan (respects length >= 4 guard).
  // Before adding, attempt canonical normalization so that a portfolio name that
  // aliases to an already-seen canonical key is silently skipped.
  if (portfolioInstitutions?.length) {
    const lowerQuery = query.toLowerCase();
    for (const inst of portfolioInstitutions) {
      if (!inst || inst.length < 4) continue;
      const key = inst.toLowerCase();
      if (!lowerQuery.includes(key)) continue;
      // Check raw key first
      if (seen.has(key)) continue;
      // Normalize via alias patterns to catch e.g. "Washington University of Medicine"
      // already resolved by the WUSTL/WashU pattern in pass 1
      const canonical = detectInstitutionName(inst);
      if (canonical && seen.has(canonical)) continue;
      found.push(inst);
      seen.add(key);
      if (canonical) seen.add(canonical);
    }
  }
  return found;
}

const GEO_DETECT: Record<string, GeoKey> = {
  "american": "us",
  " us ": "us",
  "u.s.": "us",
  "united states": "us",
  "u.s.-based": "us",
  "us-based": "us",
  "domestic": "us",
  // US states and regions — all map to "us" so the US institution regex applies;
  // detectUSSubRegionRx() then narrows to the specific sub-region.
  "west coast": "us",
  "west-coast": "us",
  "east coast": "us",
  "east-coast": "us",
  "new england": "us",
  " california": "us",
  "california ": "us",
  "bay area": "us",
  "silicon valley": "us",
  "pacific northwest": "us",
  " boston ": "us",
  " seattle ": "us",
  " chicago ": "us",
  " texas ": "us",
  "new york": "us",
  " midwest ": "us",
  " southeast ": "us",
  " northeast ": "us",
  "european": "eu",
  " eu ": "eu",
  "europe ": "eu",
  "british": "uk",
  " uk ": "uk",
  "u.k.": "uk",
  "united kingdom": "uk",
  " england ": "uk",
  "asian": "asia",
  "japanese": "asia",
  "chinese": "asia",
  "korean": "asia",
};

// US sub-region patterns → specific institution regex strings.
// Used to override the broad GEO_INSTITUTION_REGEX["us"] with a geographically
// precise set when the user names a US state, coast, or city.
const US_SUBREGION_PATTERNS: Array<{ re: RegExp; rx: string }> = [
  {
    // California-specific: explicitly excludes PNW institutions (UW, Fred Hutch, Oregon Health)
    re: /\bcalifornia\b|\bbay\s+area\b|\bsilicon\s+valley\b|\bla\s+jolla\b|\blos\s+angeles\b|\bsan\s+francisco\b|\bsan\s+diego\b/i,
    rx: "UCLA|UCSF|Stanford|UC Berkeley|UC San Diego|UC Davis|UC Irvine|UC Santa Barbara|UC Santa Cruz|Caltech|Salk|Scripps|USC|Buck Institute|Gladstone|Lawrence Berkeley|UC Riverside|UC Merced|Cedars-Sinai|City of Hope",
  },
  {
    // Pacific Northwest: Seattle, Portland, Oregon — distinct from California
    re: /\bpacific\s+northwest\b|\bseattle\b|\bportland\b|\boregon\b|\bwashington\s+state\b/i,
    rx: "University of Washington|Fred Hutch|Oregon Health|Oregon State|Washington State",
  },
  {
    // Broad West Coast: California + PNW combined
    re: /\bwest\s*coast\b/i,
    rx: "UCLA|UCSF|Stanford|UC Berkeley|UC San Diego|UC Davis|UC Irvine|UC Santa Barbara|UC Santa Cruz|Caltech|Salk|Scripps|USC|Oregon Health|University of Washington|Fred Hutch|Buck Institute|Gladstone|Lawrence Berkeley|UC Riverside|UC Merced",
  },
  {
    re: /\beast\s*coast\b|\bnew\s+england\b|\bnortheast\b|\bboston\b/i,
    rx: "Harvard|MIT|Boston University|Tufts|Brown|Yale|Columbia|NYU|Cornell|Princeton|Penn|Weill Cornell|Rockefeller|Dana-Farber|Mass General|Brigham|Broad Institute|Cold Spring Harbor",
  },
  {
    re: /\bnew\s+york\b|\bnyc\b/i,
    rx: "Columbia|NYU|Weill Cornell|Rockefeller|Memorial Sloan|Icahn|Albert Einstein|Cold Spring Harbor",
  },
  {
    re: /\bmidwest\b|\bchicago\b|\bohio\b|\bminnesota\b|\bwisconsin\b/i,
    rx: "University of Michigan|Michigan State|Ohio State|Northwestern|University of Chicago|Minnesota|Wisconsin|Purdue|Indiana University|Washington University|Mayo Clinic|Cleveland Clinic",
  },
  {
    re: /\bsoutheast\b|\batlanta\b|\bflorida\b|\bcarolina\b/i,
    rx: "Duke|UNC|Vanderbilt|Emory|University of Florida|Georgia Tech|UAB|Wake Forest|MD Anderson",
  },
  {
    re: /\btexas\b|\bhouston\b|\bdallas\b|\baustin\b/i,
    rx: "MD Anderson|Texas A|UT Austin|Baylor|UT Southwestern|Rice University",
  },
];

/** Returns a specific institution regex if the text names a US sub-region; undefined otherwise. */
export function detectUSSubRegionRx(text: string): string | undefined {
  for (const { re, rx } of US_SUBREGION_PATTERNS) {
    if (re.test(text)) return rx;
  }
  return undefined;
}

export const GEO_INSTITUTION_REGEX: Record<GeoKey, string> = {
  us: "Stanford|MIT|Harvard|Yale|Princeton|Columbia|UCLA|UCSF|Duke|Cornell|Michigan|Washington University|Johns Hopkins|Vanderbilt|Emory|NYU|Northwestern|Penn State|UNC|Pittsburgh|Mayo|NIH|MD Anderson|Memorial Sloan|Carnegie Mellon|Georgia Tech|Purdue|Minnesota|Colorado|Florida|Illinois|USC|Rockefeller|Salk|Scripps|Caltech|UC Berkeley|UC San|WUSTL|Baylor|Tufts|Brown|Dartmouth|Georgetown|Cincinnati|Utah|Arizona|Nebraska|Virginia|UC Davis|UC Irvine|Case Western|Icahn|Sinai|Weill Cornell|Wake Forest|Texas A|Notre Dame|Rice University|Tulane|Oregon Health",
  uk: "Oxford|Cambridge|Imperial College|University College London|UCL|King.s College|Edinburgh|Manchester|Glasgow|Bristol|Wellcome|Sanger|Francis Crick|Babraham|Sheffield|Leeds|Newcastle|Liverpool|Exeter|Bath|Surrey|Dundee|Nottingham|Birmingham|Cardiff|Aberdeen|Queen Mary|Royal College|Barts|Guy.s|St Thomas",
  eu: "ETH Zurich|EPFL|Karolinska|LMU Munich|Technical University Munich|TU Munich|Heidelberg|Max Planck|Charité|KU Leuven|Ghent|Erasmus|University of Amsterdam|Utrecht|Leiden|Copenhagen|Aarhus|Stockholm|Uppsala|Paris|Sorbonne|Pasteur|CNRS|INSERM|Bologna|Milan|Rome|Padova|Madrid|Barcelona|Valencia|Vienna|Zurich|Basel|Bern|Lausanne|Maastricht|Lund|Gothenburg|Helsinki|Oslo|Bergen|Groningen|Bonn|Frankfurt|Hamburg|Berlin|Dresden|Leipzig|Freiburg|Tübingen",
  asia: "University of Tokyo|Kyoto|Osaka|Keio|RIKEN|Seoul National|KAIST|Tsinghua|Peking|Fudan|National University of Singapore|NUS|University of Hong Kong|Hong Kong|Chinese University|Yonsei|Monash|Melbourne|Sydney|Queensland|Auckland",
};

const STAGE_DETECT: Array<[RegExp, string]> = [
  [/\bpreclinical\b|pre-clinical\b|glp\s+tox\b|in\s+vivo\b|animal\s+model/i, "preclinical"],
  [/\bphase\s*1\b|phase\s*i\b|\bfih\b|first.in.human\b|dose.escalation\b/i, "phase 1"],
  [/\bphase\s*1\/?2\b|phase\s*i\/?ii\b/i, "phase 1"],
  [/\bphase\s*2\b|phase\s*ii\b/i, "phase 2"],
  [/\bphase\s*3\b|phase\s*iii\b|pivotal\s+trial\b|registration\s+trial\b/i, "phase 3"],
  [/\bind-enabling\b|ind enabling\b|\bind\s+ready\b|pre.ind\b/i, "IND-enabling"],
  [/\bdiscovery\b|lead\s+optimiz|hit.to.lead\b/i, "discovery"],
  [/\bclinical\b/i, "clinical"],
  [/\bapproved\b|fda\s+approved\b|ema\s+approved\b|marketed\b|commerciali[sz]ed\b|on\s+the\s+market\b/i, "approved"],
];

const INDICATION_KEYWORDS = [
  // Oncology — broad
  "oncology", "cancer", "tumor", "tumour", "solid tumor", "solid tumour",
  "hematologic", "hematological", "hematology",
  // Specific cancer types most commonly searched by BD teams
  "leukemia", "lymphoma", "myeloma", "glioblastoma", "glioma",
  "nsclc", "non-small cell lung", "non-small-cell lung",
  "pancreatic", "pancreas cancer",
  "breast cancer",
  "prostate cancer", "prostate",
  "colorectal", "colon cancer", "crc",
  "melanoma",
  "ovarian", "ovarian cancer",
  "bladder cancer", "bladder",
  "hepatocellular", "hcc",
  // Neuro / CNS
  "neurology", "neurodegenerative", "alzheimer", "parkinson", "als", "huntington", "neurological",
  "multiple sclerosis", "epilepsy", "seizure",
  // Rare / genetic
  "rare disease", "orphan disease", "genetic disorder", "monogenic",
  "sickle cell", "hemophilia", "haemophilia", "thalassemia",
  "cystic fibrosis", "spinal muscular atrophy", "sma",
  "pediatric", "paediatric",
  // Autoimmune / inflammatory
  "autoimmune", "inflammation", "inflammatory", "rheumatoid", "lupus", "crohn",
  "inflammatory bowel", "ibd", "ulcerative colitis", "colitis",
  "atopic dermatitis", "eczema",
  // Metabolic
  "metabolic", "obesity", "diabetes", "mash", "nash", "fatty liver",
  // Cardiovascular
  "cardiovascular", "cardiac", "heart failure", "stroke", "atherosclerosis",
  // Infectious
  "infectious disease", "hiv", "covid", "tuberculosis", "malaria", "antimicrobial",
  // Respiratory
  "respiratory", "asthma", "copd", "pulmonary",
  // Ophthalmology
  "ophthalmic", "ocular", "retinal", "macular",
  // Dermatology
  "dermatology", "skin", "fibrosis", "psoriasis",
  // Musculoskeletal
  "musculoskeletal", "bone", "muscle dystrophy",
  // Renal / hepatic
  "renal", "kidney", "liver disease",
  // Immunology
  "immunology", "immunotherapy", "checkpoint inhibitor",
];

// ── Detection helpers ─────────────────────────────────────────────────────

function detectModality(text: string): string | undefined {
  const lower = text.toLowerCase();
  for (const [alias, canonical] of Object.entries(MODALITY_ALIASES)) {
    if (lower.includes(alias)) return canonical;
  }
  return undefined;
}

function detectGeography(text: string): GeoKey | undefined {
  const padded = ` ${text.toLowerCase()} `;
  for (const [pattern, geo] of Object.entries(GEO_DETECT)) {
    if (padded.includes(pattern)) return geo;
  }
  return undefined;
}

function detectStage(text: string): string | undefined {
  for (const [rx, canonical] of STAGE_DETECT) {
    if (rx.test(text)) return canonical;
  }
  return undefined;
}

function detectIndication(text: string): string | undefined {
  const lower = text.toLowerCase();
  for (const kw of INDICATION_KEYWORDS) {
    if (lower.includes(kw)) return kw;
  }
  return undefined;
}

// Biology keyword detection — matches canonical taxonomy values from biologyFill.ts
const BIOLOGY_DETECT: Array<[RegExp, string]> = [
  [/\baberrant\s+kinase\s+signaling\b|kinase\s+signal/i, "aberrant kinase signaling"],
  [/\bcell\s+cycle\s+dysregulation\b|cell\s+cycle\s+(?:arrest|defect)/i, "cell cycle dysregulation"],
  [/\bepigenetic\s+dysregulation\b|epigenetic\s+(?:modifier|driver)/i, "epigenetic dysregulation"],
  [/\bdna\s+damage\s+response\s+deficiency\b|ddr\s+deficiency|parp\s+inhibit/i, "dna damage response deficiency"],
  [/\bimmune\s+evasion\b|checkpoint\s+(?:inhibitor|immunotherapy)/i, "immune evasion"],
  [/\bapoptosis\s+resistance\b|anti.apoptotic/i, "apoptosis resistance"],
  [/\boncogenic\s+transcription\b/i, "oncogenic transcription"],
  [/\bangiogenesis\b|tumor\s+vascular/i, "angiogenesis"],
  [/\btumor\s+microenvironment\b|\bTME\b/i, "tumor microenvironment"],
  [/\bprotein\s+aggregation\b|amyloid|tau\s+pathology|alpha.synuclein/i, "protein aggregation"],
  [/\bneuroinflammation\b|microglial\s+activation/i, "neuroinflammation"],
  [/\bsynaptic\s+dysfunction\b|neurotransmitter\s+(?:deficiency|dysregulation)/i, "synaptic dysfunction"],
  [/\bmitochondrial\s+dysfunction\b/i, "mitochondrial dysfunction"],
  [/\bmyelin\s+disruption\b|demyelination/i, "myelin disruption"],
  [/\bneuronal\s+excitotoxicity\b|excitotoxicity/i, "neuronal excitotoxicity"],
  [/\bautoimmune\s+dysregulation\b|autoimmune\s+disease/i, "autoimmune dysregulation"],
  [/\bcytokine\s+dysregulation\b|cytokine\s+storm/i, "cytokine dysregulation"],
  [/\bcomplement\s+dysregulation\b/i, "complement dysregulation"],
  [/\ballergic\s+dysregulation\b|IgE.mediated/i, "allergic dysregulation"],
  [/\bimmune\s+deficiency\b|immunodeficiency/i, "immune deficiency"],
  [/\binsulin\s+resistance\b|type\s+[12]\s+diabetes/i, "insulin resistance"],
  [/\blipid\s+metabolism\s+dysfunction\b|hypercholesterolemia/i, "lipid metabolism dysfunction"],
  [/\benzyme\s+deficiency\b|lysosomal\s+storage/i, "enzyme deficiency"],
  [/\bhormonal\s+dysregulation\b|androgen\s+receptor\s+signaling/i, "hormonal dysregulation"],
  [/\bgene\s+expression\s+deficiency\b|haploinsufficiency/i, "gene expression deficiency"],
  [/\bion\s+channel\s+dysfunction\b|channelopathy/i, "ion channel dysfunction"],
  [/\bstructural\s+protein\s+defect\b|dystrophin\s+deficiency/i, "structural protein defect"],
  [/\brna\s+splicing\s+defect\b|splicing\s+(?:factor\s+mutation|error)/i, "rna splicing defect"],
  [/\bpathogen\s+replication\b|viral\s+replication|antiviral/i, "pathogen replication"],
  [/\bantimicrobial\s+resistance\b|antibiotic\s+resistance|\bAMR\b/i, "antimicrobial resistance"],
  [/\bfibrosis\b|anti.?fibrotic|fibrotic\s+disease/i, "fibrosis"],
  [/\bischemia\b|oxidative\s+stress.*disease|reperfusion\s+injury/i, "ischemia and oxidative stress"],
];

function detectBiology(text: string): string | undefined {
  for (const [rx, canonical] of BIOLOGY_DETECT) {
    if (rx.test(text)) return canonical;
  }
  return undefined;
}

// ── Public filter API ─────────────────────────────────────────────────────

export function parseQueryFilters(query: string, sessionContext?: SessionFocusContext): QueryFilters {
  const filters: QueryFilters = {};

  const modality = detectModality(query);
  if (modality) filters.modality = modality;
  else if (sessionContext?.modality) filters.modality = sessionContext.modality;

  const geography = detectGeography(query);
  if (geography) filters.geography = geography;
  else if (sessionContext?.geography) filters.geography = sessionContext.geography;

  const stage = detectStage(query);
  if (stage) filters.stage = stage;
  else if (sessionContext?.stage) filters.stage = sessionContext.stage;

  const indication = detectIndication(query);
  if (indication) filters.indication = indication;
  else if (sessionContext?.indication) filters.indication = sessionContext.indication;

  if (sessionContext?.institution) filters.institution = sessionContext.institution;

  const biology = detectBiology(query);
  if (biology) filters.biology = biology;
  else if (sessionContext?.biology) filters.biology = sessionContext.biology;

  return filters;
}

export function hasMeaningfulFilters(filters: QueryFilters): boolean {
  return !!(filters.modality || filters.geography || filters.stage || filters.indication || filters.institution || filters.biology || filters.recency);
}

// ── Session focus management ──────────────────────────────────────────────

const PURE_RESET_PATTERNS = [
  /\b(?:start fresh|start over|reset|clear filters?|new search|forget that|remove filter|show everything|all assets?|no filter|broaden)\b/i,
  /\b(?:never ?mind|ignore (?:that|the filter))\b/i,
];

const PIVOT_PATTERNS = [
  /\b(?:actually|scratch that|let'?s try something different|instead let'?s)\b/i,
  /\b(?:shift gears?|change direction|new direction|let'?s move on|change topic|something else|different topic|different angle)\b/i,
];

function extractRawFilters(message: string, portfolioInstitutions?: string[]): SessionFocusContext {
  const filters: SessionFocusContext = {};
  const modality = detectModality(message);
  if (modality) filters.modality = modality;
  const geography = detectGeography(message);
  if (geography) filters.geography = geography;
  const stage = detectStage(message);
  if (stage) filters.stage = stage;
  const indication = detectIndication(message);
  if (indication) filters.indication = indication;
  const institution = detectInstitutionName(message, portfolioInstitutions);
  if (institution) filters.institution = institution;
  const biology = detectBiology(message);
  if (biology) filters.biology = biology;
  return filters;
}

function extractFocusUpdates(message: string, current: SessionFocusContext, portfolioInstitutions?: string[]): SessionFocusContext {
  // Pure reset — no new intent: "start fresh", "clear filters", "never mind"
  if (PURE_RESET_PATTERNS.some((r) => r.test(message))) {
    const newFilters = extractRawFilters(message, portfolioInstitutions);
    // If accompanied by new filters (e.g. "start fresh with gene therapy"), apply those
    return Object.keys(newFilters).length > 0 ? newFilters : {};
  }

  // Pivot — "actually, let's focus on X" → discard old context, apply only new filters
  if (PIVOT_PATTERNS.some((r) => r.test(message))) {
    const newFilters = extractRawFilters(message, portfolioInstitutions);
    // If pivot comes with meaningful new filters, replace context (not merge)
    if (Object.keys(newFilters).length > 0) return newFilters;
    // Bare pivot with no new content ("actually, never mind") → clear
    return {};
  }

  // Normal accumulation — only merge new filters when the user explicitly signals
  // a focus intent (e.g. "show me X from Y", "focus on Z", "find me X").
  // Pure informational queries ("what is gene therapy?") should not update focus.
  const newFilters = extractRawFilters(message, portfolioInstitutions);
  if (!Object.keys(newFilters).length) return current; // no new filter signals → preserve
  // Detect explicit search/filter intent; avoid accumulating on pure information queries
  const hasExplicitIntent = /\b(?:show me|find me|give me|focus on|filter (?:by|for|to)|narrow|restrict|limit to|only show|let'?s look at|let'?s explore|looking for|searching for|interested in)\b/i.test(message)
    || /\b(?:from|in|at|by)\s+(?:\w+\s+)?(?:institutions?|universities|europe|european|us|american|uk|british|asian)\b/i.test(message)
    // Narrowing / refinement language — "now just preclinical", "only phase 1", "the Boston ones"
    || /\b(?:just|only(?:\s+(?:the|show))?|now\s+(?:just|only|show\s+me?)|but\s+(?:only|just)|the\s+\w+(?:\s+\w+)?\s+ones?|specifically|in\s+particular)\b/i.test(message);
  // Additive filters (new dimensions not yet in focus) always stack — they refine, not override.
  // Only override-type changes (changing an existing focus field) need explicit intent.
  const isAdditive = Object.keys(newFilters).every((k) => !(k in current));
  if (!hasExplicitIntent && !isAdditive && Object.keys(current).length > 0) return current; // keep existing focus for info queries
  return { ...current, ...newFilters };
}

// ── In-session engagement signal management ───────────────────────────────
//
// Signals are derived fresh from stored session message history at each query.
// This means engagement is correctly inferred from back-references and follow-ups
// (which the DB already persists as assistant messages with assets arrays) and
// is consistent with server restarts since it reads from durable storage.
//
// Reset is handled by recording a per-session "reset timestamp" in memory. When
// deriving signals, messages with ts < resetAt are excluded, so new turns build
// a clean engagement baseline.

export function markEngagementReset(sessionId: string): void {
  _sessionResetMap.set(sessionId, Date.now());
}

// Back-reference patterns used to detect explicit follow-up turns during
// engagement derivation. Inline subset so this function doesn't depend on
// the full BACK_REF_PATTERNS constant defined later in the file.
const BACK_REF_RX =
  /\b(?:tell|give)\s+me\s+more\s+(?:about|on)|more\s+(?:details?|info)\s+(?:about|on)\s+(?:it|that|this)\b|\bthe\s+(?:first|second|third)\b|\b(?:number|#)\s*[123]\b|\bexpand\s+(?:on|into)\s+(?:that|this|it)\b/i;

// Derive engagement signals from stored session message history.
// Only scans assistant messages (which carry the `assets` field) after any
// active reset timestamp for this session, so "start fresh" commands work.
// Back-reference / follow-up turns (detected via the preceding user message)
// are weighted 2x — explicit user engagement is a stronger signal than
// assets merely shown in the first retrieval pass.
export function deriveEngagementSignals(
  sessionId: string,
  messages: SessionMessage[]
): EngagementSignals {
  const resetAt = _sessionResetMap.get(sessionId) ?? 0;
  const signals: EngagementSignals = { modalities: {}, indications: {}, biologies: {} };

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role !== "assistant") continue;
    if (!msg.assets?.length) continue;
    // Skip messages that predate the last explicit reset
    const msgTs = msg.ts ? new Date(msg.ts).getTime() : 0;
    if (resetAt > 0 && msgTs < resetAt) continue;

    // Find the most recent preceding user message to detect back-refs/follow-ups.
    const prevUser = messages.slice(0, i).reverse().find((m) => m.role === "user");
    // Explicit back-reference / follow-up → user actively engaged → weight 2x
    const weight = prevUser && BACK_REF_RX.test(prevUser.content) ? 2 : 1;

    for (const a of msg.assets) {
      if (a.modality && a.modality !== "unknown") {
        signals.modalities[a.modality] = (signals.modalities[a.modality] ?? 0) + weight;
      }
      if (a.indication && a.indication !== "unknown") {
        signals.indications[a.indication] = (signals.indications[a.indication] ?? 0) + weight;
      }
      if (a.biology && a.biology !== "unknown" && a.biology !== "other" && a.biology !== "not applicable") {
        signals.biologies[a.biology] = (signals.biologies[a.biology] ?? 0) + weight;
      }
    }
  }

  return signals;
}

// Export the reset pattern test so the route handler can detect resets even
// when session focus is already empty (which avoids the non-empty → empty guard
// in getOrUpdateSessionFocus).
export function isEngagementResetMessage(message: string): boolean {
  const PURE_RESET = [
    /\b(?:start fresh|start over|reset|clear filters?|new search|forget that|remove filter|show everything|all assets?|no filter|broaden)\b/i,
    /\b(?:never ?mind|ignore (?:that|the filter))\b/i,
  ];
  const PIVOT = [/\b(?:actually|scratch that|let'?s try something different|instead let'?s)\b/i];
  return PURE_RESET.some((r) => r.test(message)) || PIVOT.some((r) => r.test(message));
}

export function getOrUpdateSessionFocus(sessionId: string, message: string, portfolioInstitutions?: string[]): SessionFocusContext {
  const current = _sessionFocusMap.get(sessionId) ?? {};
  const updated = extractFocusUpdates(message, current, portfolioInstitutions);
  _sessionFocusMap.set(sessionId, updated);
  // When focus transitions from non-empty → empty (explicit reset), mark
  // the engagement reset timestamp so ranking returns to profile-only baseline.
  if (Object.keys(updated).length === 0 && Object.keys(current).length > 0) {
    markEngagementReset(sessionId);
  }
  return updated;
}

// ── Session focus DB persistence ──────────────────────────────────────────

export function seedSessionFocusFromDb(sessionId: string, dbFocus: Record<string, unknown> | null | undefined): void {
  if (!_sessionFocusMap.has(sessionId) && dbFocus && Object.keys(dbFocus).length > 0) {
    _sessionFocusMap.set(sessionId, dbFocus as SessionFocusContext);
  }
}

export async function persistSessionFocus(sessionId: string, focus: SessionFocusContext): Promise<void> {
  await db.update(edenSessions)
    .set({ focusContext: focus as Record<string, unknown>, updatedAt: new Date() })
    .where(eq(edenSessions.sessionId, sessionId));
}

export function buildFocusContextBlock(focus: SessionFocusContext): string {
  const parts: string[] = [];
  if (focus.geography) parts.push(`Geography: ${focus.geography.toUpperCase()} institutions`);
  if (focus.modality) parts.push(`Modality: ${focus.modality}`);
  if (focus.stage) parts.push(`Stage: ${focus.stage}`);
  if (focus.indication) parts.push(`Indication area: ${focus.indication}`);
  if (focus.institution) parts.push(`Institution: ${focus.institution}`);
  if (focus.biology) parts.push(`Biology mechanism: ${focus.biology}`);

  const sections: string[] = [];
  if (parts.length) {
    sections.push(`## Active session focus\n${parts.join(" | ")}\n\nWhen answering, naturally acknowledge the active filters. If the user asks a count question, use the filtered count, not the global total.`);
  }

  const mem = focus._crossSessionMemory;
  if (mem) {
    const histLines: string[] = ["## User history (prior sessions)"];
    if (mem.topModalities.length) histLines.push(`Previously explored modalities: ${mem.topModalities.join(", ")}`);
    if (mem.topIndications.length) histLines.push(`Previously explored indications: ${mem.topIndications.join(", ")}`);
    if (mem.topBiologies.length) histLines.push(`Previously explored mechanisms: ${mem.topBiologies.join(", ")}`);
    if (mem.topInstitutions.length) histLines.push(`Institutions of interest: ${mem.topInstitutions.join(", ")}`);
    if (mem.recentSummary) histLines.push(`Last session summary: ${mem.recentSummary.slice(0, 300)}`);
    histLines.push(`When relevant, acknowledge what the user has been tracking and make continuations feel natural. Do NOT recite history unprompted — use it to inform tone and proactive suggestions only.`);
    sections.push(histLines.join("\n"));
  }

  return sections.join("\n\n");
}

export function buildEngagementBlock(signals: EngagementSignals): string {
  const topModalities = Object.entries(signals.modalities)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([m]) => m);
  const topIndications = Object.entries(signals.indications)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([ind]) => ind);
  const topBiologies = Object.entries(signals.biologies)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([bio]) => bio);
  if (!topModalities.length && !topIndications.length && !topBiologies.length) return "";
  const lines = ["## Session engagement signals"];
  if (topModalities.length) lines.push(`Modalities this user has explored most: ${topModalities.join(", ")}`);
  if (topIndications.length) lines.push(`Indications this user has explored most: ${topIndications.join(", ")}`);
  if (topBiologies.length) lines.push(`Biology mechanisms this user has explored most: ${topBiologies.join(", ")}`);
  lines.push("Use these signals to make proactive suggestions — when answering, note related angles the user hasn't asked about yet. Reference the modality, indication, or biology naturally, not as a bullet list.");
  return lines.join("\n");
}

// ── Portfolio stats cache (10-minute TTL) ────────────────────────────────────

export type PortfolioStats = {
  total: number;
  byModality: { modality: string; count: number }[];
  byStage: { stage: string; count: number }[];
  byTherapyArea: { area: string; count: number }[];
  byBiology: { biology: string; count: number }[];
  topInstitutions: { institution: string; count: number }[];
  lastFetched: number;
};

let _statsCache: PortfolioStats | null = null;
const STATS_TTL_MS = 10 * 60 * 1000;

export async function fetchPortfolioStats(): Promise<PortfolioStats> {
  if (_statsCache && Date.now() - _statsCache.lastFetched < STATS_TTL_MS) {
    return _statsCache;
  }

  const [totalRows, allTotalRows, modalityRows, stageRows, institutionRows, therapyAreaRows, biologyRows] = await Promise.all([
    db.execute(sql`SELECT COUNT(*)::int AS total FROM ingested_assets WHERE relevant = true`),
    db.execute(sql`SELECT COUNT(*)::int AS total FROM ingested_assets`),
    db.execute(sql`
      SELECT modality, COUNT(*)::int AS count FROM ingested_assets
      WHERE relevant = true AND modality != 'unknown'
      GROUP BY modality ORDER BY count DESC LIMIT 15
    `),
    db.execute(sql`
      SELECT development_stage AS stage, COUNT(*)::int AS count FROM ingested_assets
      WHERE relevant = true AND development_stage != 'unknown'
      GROUP BY development_stage ORDER BY count DESC LIMIT 10
    `),
    db.execute(sql`
      SELECT institution, COUNT(*)::int AS count FROM ingested_assets
      WHERE relevant = true
      GROUP BY institution ORDER BY count DESC LIMIT 15
    `),
    db.select({ name: therapyAreaTaxonomy.name, assetCount: therapyAreaTaxonomy.assetCount })
      .from(therapyAreaTaxonomy)
      .where(sql`${therapyAreaTaxonomy.assetCount} > 0`)
      .orderBy(desc(therapyAreaTaxonomy.assetCount))
      .limit(15),
    db.execute(sql`
      SELECT biology, COUNT(*)::int AS count FROM ingested_assets
      WHERE relevant = true AND biology IS NOT NULL AND biology NOT IN ('', 'unknown', 'other')
      GROUP BY biology ORDER BY count DESC LIMIT 20
    `),
  ]);

  const relevantTotal = Number((totalRows.rows[0] as Record<string, unknown>)?.total ?? 0);
  const allTotal = Number((allTotalRows.rows[0] as Record<string, unknown>)?.total ?? 0);
  const total = relevantTotal > 0 ? relevantTotal : allTotal;
  const byModality = (modalityRows.rows as Record<string, unknown>[]).map((r) => ({
    modality: String(r.modality ?? ""),
    count: Number(r.count ?? 0),
  }));
  const byStage = (stageRows.rows as Record<string, unknown>[]).map((r) => ({
    stage: String(r.stage ?? ""),
    count: Number(r.count ?? 0),
  }));
  const topInstitutions = (institutionRows.rows as Record<string, unknown>[]).map((r) => ({
    institution: String(r.institution ?? ""),
    count: Number(r.count ?? 0),
  }));
  const byTherapyArea = therapyAreaRows.map((r) => ({
    area: r.name,
    count: r.assetCount,
  }));
  const byBiology = (biologyRows.rows as Record<string, unknown>[]).map((r) => ({
    biology: String(r.biology ?? ""),
    count: Number(r.count ?? 0),
  }));

  _statsCache = {
    total,
    byModality,
    byStage,
    byTherapyArea,
    byBiology,
    topInstitutions,
    lastFetched: Date.now(),
  };

  return _statsCache;
}

function buildPortfolioStatsBlock(stats: PortfolioStats): string {
  if (stats.total === 0) return "";

  const modalityLines = stats.byModality
    .map((m) => `${m.modality} (${m.count.toLocaleString()})`)
    .join(", ");

  const stageLines = stats.byStage
    .map((s) => `${s.stage}: ${s.count.toLocaleString()}`)
    .join(" | ");

  const topInst = stats.topInstitutions.slice(0, 15)
    .map((i) => `${i.institution} (${i.count})`)
    .join(", ");

  const therapyAreaLines = stats.byTherapyArea.length > 0
    ? stats.byTherapyArea.slice(0, 12).map((a) => `${a.area} (${a.count})`).join(", ")
    : "";

  const biologyLines = stats.byBiology.length > 0
    ? stats.byBiology.slice(0, 12).map((b) => `${b.biology} (${b.count.toLocaleString()})`).join(", ")
    : "";

  return `## Your portfolio — live numbers you know cold
Total relevant assets indexed: **${stats.total.toLocaleString()}**
By modality: ${modalityLines}
By development stage: ${stageLines}
Top 15 institutions by asset count: ${topInst}${therapyAreaLines ? `\nTop therapy areas: ${therapyAreaLines}` : ""}${biologyLines ? `\nBy biology mechanism: ${biologyLines}` : ""}

When asked "how many" questions, use these numbers. Do not count from retrieved assets — use your portfolio knowledge. If asked for a breakdown you don't have here, say so and offer to dig into the data.`;
}

// ── Aggregation query detection and execution ─────────────────────────────

const AGG_PATTERNS = [
  // Broad "how many" — catch any variant
  /how many/i,
  /count\s+(?:of\s+)?(?:assets?|technologies?|compounds?)/i,
  /how much\s+(?:work|research)/i,
  /top\s+(?:\d+\s+)?institutions?/i,
  /which institutions?\s+(?:has|have|lead|are)/i,
  /who(?:'s|\s+is|\s+are)?\s+(?:doing|most active|leading|working on)/i,
  /number\s+of\s+(?:assets?|technologies?)/i,
  /breakdown\s+(?:of|by)\s+(?:institution|modality|stage)/i,
  /(?:modality|stage)\s+breakdown/i,
  /most\s+(?:assets?|active)\s+(?:in|for)/i,
  /what(?:'s| is) the\s+(?:most|largest|biggest)\s+/i,
  /newest\s+assets?\s+from/i,
  /latest\s+(?:from|out of)/i,
  /list\s+all\s+(?:institutions?|universities)/i,
  /asset\s+count/i,
  /how\s+active\s+is/i,
  /portfolio\s+of\s+\w/i,
  // Conversational count phrasings
  /what'?s\s+the\s+total/i,
  /give\s+me\s+(?:a\s+)?count/i,
  /(?:total|overall)\s+count/i,
  /how\s+many\s+do\s+you\s+have/i,
  /how\s+many\s+are\s+there/i,
  /how\s+many\s+in\s+(?:the\s+)?(?:database|system|portfolio|index)/i,
  /(?:what|give me|show me)\s+(?:the\s+)?(?:total|count|number)/i,
  /how\s+large\s+is\s+(?:the\s+)?(?:database|portfolio|index)/i,
  /size\s+of\s+(?:the\s+)?(?:database|portfolio|index)/i,
];

export function isAggregationQuery(query: string): boolean {
  return AGG_PATTERNS.some((p) => p.test(query));
}

// ── Definitional / educational intent detection ───────────────────────────
const DEFINITIONAL_PATTERNS = [
  /^(?:what\s+(?:is|are)\s+(?:a\s+|an\s+)?)([\w\s,\-\/]+?)(?:\?|\s*$)/i,
  /^(?:can\s+you\s+)?(?:explain|define)\s+([\w\s,\-\/]+?)(?:\?|\s*$)/i,
  /^how\s+does?\s+([\w\s\-\/]+?)\s+work(?:\?|\s*$)/i,
  /^what'?s?\s+(?:a|an|the)?\s*([\w\s\-\/]+?)\s*\?$/i,
  /^(?:tell\s+me\s+)?what\s+(?:exactly\s+)?(?:is|are)\s+([\w\s,\-\/]+?)(?:\?|\s*$)/i,
];
const COMBINED_SEARCH_INTENT = /\b(?:do\s+you\s+have|find\s+me|show\s+me|any\s+(?:assets?|examples?|technologies?)|in\s+your\s+(?:portfolio|database|index)|assets?\s+(?:from|in|at|by|for)|technologies?\s+(?:from|in|at|by|for))\b/i;

export function isDefinitionalQuery(query: string): boolean {
  if (COMBINED_SEARCH_INTENT.test(query)) return false;
  return DEFINITIONAL_PATTERNS.some((p) => p.test(query.trim()));
}

// ── Back-reference detection ──────────────────────────────────────────────
const BACK_REF_PATTERNS = [
  // Ordinal back-refs — "the/that/this first asset/one/result/technology"
  /\b(?:the|that|this)\s+(?:first|1st)\s+(?:one|asset|result|technology|option|compound)\b/i,
  /\b(?:the|that|this)\s+(?:second|2nd)\s+(?:one|asset|result|technology|option|compound)\b/i,
  /\b(?:the|that|this)\s+(?:third|3rd)\s+(?:one|asset|result|technology|option|compound)\b/i,
  // "what was that first asset?", "what about that second one?" style
  /\bwhat\s+(?:was|is|about)\s+that\s+(?:first|second|third|1st|2nd|3rd)\s+(?:one|asset|result|technology)?\b/i,
  // Anaphoric expansion phrases require "it/that/this" (not a noun phrase) to avoid
  // misclassifying "give me more oncology assets" as a back-reference
  /\b(?:tell|give)\s+me\s+more\s+(?:about|on)\s+(?:it|that|this)\b/i,
  /\b(?:tell|give)\s+me\s+more\s+(?:about|on)\s+(?:number|#)?\s*[123]\b/i,
  /\bmore\s+(?:details?|info(?:rmation)?)\s+(?:about|on)\s+(?:it|that|this)\b/i,
  /\b(?:expand|dig)\s+(?:deeper|more)?\s*(?:on|into)\s+(?:that|this|it)\b/i,
  /\bpull\s+(?:a\s+)?(?:full\s+)?(?:profile|dossier)\s+(?:on|for)?\s*(?:it|that|this)\b/i,
  /\b(?:number|#)\s*[123]\b/i,
  /\bwhat\s+about\s+(?:the\s+)?(?:first|second|third|1st|2nd|3rd)\s+(?:one|asset|result|technology|tech|option|compound)\b/i,
  /\bgo\s+(?:deeper|further)\s+on\s+(?:that|this|it)\b/i,
  // Institution-qualified back-references (anaphora with institution name)
  /\bthe\s+one\s+from\s+\w/i,
  /\bthat\s+one\s+from\s+\w/i,
  // Comparative follow-up back-references — "the stronger one", "the winner", etc.
  // Covers post-comparison turns that reference a conclusion from the prior head-to-head.
  /\bthe\s+(?:stronger|weaker|better|worse|dominant|leading|preferred|winning|losing)\s+one\b/i,
  /\bthe\s+(?:winner|loser|front[-\s]?runner)\b/i,
  /\bthe\s+(?:better|preferred|recommended|stronger|leading)\s+(?:option|asset|candidate|compound|technology|choice)\b/i,
  /\bthe\s+one\s+(?:I\s+should|(?:you\s+)?recommend(?:ed)?|(?:that\s+)?(?:won|came\s+out\s+(?:ahead|on\s+top)))\b/i,
  /\bwhich(?:ever)?\s+(?:one\s+)?(?:won|came\s+out\s+(?:ahead|on\s+top)|(?:is|was)\s+better)\b/i,
  // "Show me that asset card / show me the card / show that technology" — user wants the card surfaced
  /\bshow\s+(?:me\s+)?(?:that|the|this)\s+(?:asset\s+)?card\b/i,
  /\bshow\s+me\s+(?:that|the)\s+(?:asset|technology|tech|compound|result)\b/i,
  /\bcan\s+(?:I|you)\s+(?:see|get|view|have)\s+(?:me\s+)?(?:that|the)\s+(?:asset\s+)?card\b/i,
  /\bshow\s+me\s+that\s+one\b/i,
  /\bshow\s+(?:that|the)\s+(?:asset|card|technology|tech|compound|result)\b/i,
  /\b(?:pull\s+up|bring\s+up)\s+(?:that|the)\s+(?:asset\s+)?card\b/i,
];

export function detectBackReference(query: string): boolean {
  return BACK_REF_PATTERNS.some((p) => p.test(query));
}

export function extractBackRefPosition(query: string): number | null {
  const lower = query.toLowerCase();
  if (/\bfirst\b|\b1st\b|\bnumber\s*1\b|\b#\s*1\b/.test(lower)) return 0;
  if (/\bsecond\b|\b2nd\b|\bnumber\s*2\b|\b#\s*2\b/.test(lower)) return 1;
  if (/\bthird\b|\b3rd\b|\bnumber\s*3\b|\b#\s*3\b/.test(lower)) return 2;
  return null;
}

export function extractBackRefInstitution(query: string, portfolioInstitutions?: string[]): string | null {
  return detectInstitutionName(query, portfolioInstitutions);
}

type AggResult = Record<string, unknown>[];
type ExtraSQL = ReturnType<typeof sql>;

const RECENCY_INTERVALS: Record<RecencyWindow, string> = {
  last7: "7 days",
  last30: "30 days",
  last90: "90 days",
  last180: "180 days",
  lastyear: "1 year",
};

// Build a SQL AND-fragment from session filters (does NOT include `relevant = true`).
// Returns undefined when no filters are active (no extra WHERE clause needed).
function buildExtraSQL(filters: QueryFilters, geoRx?: string): ExtraSQL | undefined {
  const parts: ExtraSQL[] = [];
  if (geoRx) parts.push(sql`institution ~* ${geoRx}`);
  if (filters.modality) parts.push(sql`modality ILIKE ${`%${filters.modality}%`}`);
  if (filters.stage) parts.push(sql`development_stage ILIKE ${`%${filters.stage}%`}`);
  if (filters.indication) parts.push(sql`indication ILIKE ${`%${filters.indication}%`}`);
  if (filters.institution) parts.push(sql`institution ILIKE ${`%${filters.institution}%`}`);
  if (filters.biology) parts.push(sql`biology ILIKE ${`%${filters.biology}%`}`);
  if (filters.recency) {
    const interval = RECENCY_INTERVALS[filters.recency];
    parts.push(sql`first_seen_at >= NOW() - INTERVAL ${interval}`);
  }
  // Trending: require well-documented assets so EDEN can give meaningful market context
  if (filters.trending) parts.push(sql`completeness_score >= 0.65`);
  if (!parts.length) return undefined;
  return parts.reduce((acc, cond) => sql`${acc} AND ${cond}`);
}

async function runCountByInstitution(area?: string, extra?: ExtraSQL): Promise<AggResult> {
  const baseWhere = area
    ? sql`${ingestedAssets.relevant} = true AND (lower(${ingestedAssets.indication}) LIKE ${"%" + area.toLowerCase() + "%"} OR lower(${ingestedAssets.categories}::text) LIKE ${"%" + area.toLowerCase() + "%"})`
    : sql`${ingestedAssets.relevant} = true`;
  const finalWhere = extra ? sql`${baseWhere} AND ${extra}` : baseWhere;
  const rows = await db
    .select({ institution: ingestedAssets.institution, count: sql<number>`count(*)::int` })
    .from(ingestedAssets)
    .where(finalWhere)
    .groupBy(ingestedAssets.institution)
    .orderBy(sql`count(*) DESC`)
    .limit(15);
  return rows as AggResult;
}

async function runCountByModality(extra?: ExtraSQL): Promise<AggResult> {
  const baseWhere = sql`${ingestedAssets.relevant} = true AND ${ingestedAssets.modality} != 'unknown'`;
  const finalWhere = extra ? sql`${baseWhere} AND ${extra}` : baseWhere;
  const rows = await db
    .select({ modality: ingestedAssets.modality, count: sql<number>`count(*)::int` })
    .from(ingestedAssets)
    .where(finalWhere)
    .groupBy(ingestedAssets.modality)
    .orderBy(sql`count(*) DESC`)
    .limit(15);
  return rows as AggResult;
}

async function runCountByStage(extra?: ExtraSQL): Promise<AggResult> {
  const baseWhere = sql`${ingestedAssets.relevant} = true AND ${ingestedAssets.developmentStage} != 'unknown'`;
  const finalWhere = extra ? sql`${baseWhere} AND ${extra}` : baseWhere;
  const rows = await db
    .select({ stage: ingestedAssets.developmentStage, count: sql<number>`count(*)::int` })
    .from(ingestedAssets)
    .where(finalWhere)
    .groupBy(ingestedAssets.developmentStage)
    .orderBy(sql`count(*) DESC`)
    .limit(12);
  return rows as AggResult;
}

async function runCountForInstitution(
  institution: string,
  area?: string,
  extra?: ExtraSQL
): Promise<{ name: string; count: number } | null> {
  const instPattern = "%" + institution.toLowerCase() + "%";
  const baseWhere =
    area && area.length > 2
      ? sql`${ingestedAssets.relevant} = true
          AND lower(${ingestedAssets.institution}) LIKE ${instPattern}
          AND (lower(${ingestedAssets.indication}) LIKE ${"%" + area.toLowerCase() + "%"}
            OR lower(${ingestedAssets.categories}::text) LIKE ${"%" + area.toLowerCase() + "%"})`
      : sql`${ingestedAssets.relevant} = true AND lower(${ingestedAssets.institution}) LIKE ${instPattern}`;
  const finalWhere = extra ? sql`${baseWhere} AND ${extra}` : baseWhere;
  const rows = await db
    .select({ institution: ingestedAssets.institution, count: sql<number>`count(*)::int` })
    .from(ingestedAssets)
    .where(finalWhere)
    .groupBy(ingestedAssets.institution)
    .orderBy(sql`count(*) DESC`)
    .limit(1);
  if (!rows.length || !(rows[0].count as number)) return null;
  return { name: String(rows[0].institution), count: rows[0].count as number };
}

async function runNewestByInstitution(institution: string, extra?: ExtraSQL): Promise<AggResult> {
  const baseWhere = sql`${ingestedAssets.relevant} = true AND lower(${ingestedAssets.institution}) LIKE ${"%" + institution.toLowerCase() + "%"}`;
  const finalWhere = extra ? sql`${baseWhere} AND ${extra}` : baseWhere;
  const rows = await db
    .select({
      assetName: ingestedAssets.assetName,
      indication: ingestedAssets.indication,
      modality: ingestedAssets.modality,
      developmentStage: ingestedAssets.developmentStage,
      firstSeenAt: ingestedAssets.firstSeenAt,
    })
    .from(ingestedAssets)
    .where(finalWhere)
    .orderBy(desc(ingestedAssets.firstSeenAt))
    .limit(8);
  return rows as AggResult;
}

async function runIndicationDistribution(): Promise<Array<{ category: string; count: number }>> {
  const result = await db.execute<{ category: string; count: number }>(sql`
    SELECT unnest(categories) AS category, COUNT(*)::int AS count
    FROM ingested_assets
    WHERE relevant = true
      AND categories IS NOT NULL
      AND array_length(categories, 1) > 0
    GROUP BY category
    ORDER BY count DESC
    LIMIT 25
  `);
  return result.rows.map((r) => ({ category: String(r.category), count: Number(r.count) }));
}

// resolveAggregationQuery accepts parsed session filters + geoRx so ALL SQL
// branches (stage breakdown, modality breakdown, institution counts, etc.) are
// constrained by accumulated session context — not global across the full portfolio.
async function resolveAggregationQuery(
  query: string,
  filters: QueryFilters = {},
  geoRx?: string
): Promise<string | null> {
  const lower = query.toLowerCase();
  const extra = buildExtraSQL(filters, geoRx);
  const focusLabel = extra ? " (filtered by active session focus)" : "";

  if (/stage|phases?\s+break/i.test(lower) && !/which|who|what assets/i.test(lower)) {
    const rows = await runCountByStage(extra);
    if (!rows.length) return null;
    const lines = rows.map((r) => `  • ${r["stage"]}: ${r["count"]} assets`).join("\n");
    return `**Development stage breakdown**${focusLabel}:\n${lines}`;
  }

  // Only trigger modality breakdown for EXPLICIT breakdown/split requests.
  // "how many gene therapy assets" is intentionally excluded here — it routes to
  // filteredCount() via parseQueryFilters() modality detection in the chat route.
  if (/modali|small molecule|antibod|gene therapy|cell therapy/i.test(lower) && /breakdown|split by|distribution of/i.test(lower)) {
    const rows = await runCountByModality(extra);
    if (!rows.length) return null;
    const lines = rows.map((r) => `  • ${r["modality"]}: ${r["count"]} assets`).join("\n");
    return `**Modality breakdown**${focusLabel}:\n${lines}`;
  }

  const instMatch = lower.match(/newest|latest|recent.*(?:from|at|out of)\s+([a-z\s]+?)(?:\s+tto|\s+university|\s+institute|\s+college|$)/i);
  if (instMatch?.[1]) {
    const inst = instMatch[1].trim();
    const rows = await runNewestByInstitution(inst, extra);
    if (!rows.length) return null;
    const lines = rows.map((r) => `  • ${r["assetName"]} (${r["modality"]}, ${r["developmentStage"]}, ${r["indication"]})`).join("\n");
    return `**Most recent assets from ${inst.replace(/\b\w/g, (c) => c.toUpperCase())}**${focusLabel}:\n${lines}`;
  }

  const areaMatch = lower.match(/(?:top\s+institutions?|who(?:'s|\s+is|\s+are)?\s+(?:most active|leading|doing the most(?:\s+work)?)|which institutions?)\s+(?:in|for|working on)\s+(.+?)(?:\?|$)/i);
  if (areaMatch?.[1]) {
    const area = areaMatch[1].trim().replace(/\?$/, "");
    const rows = await runCountByInstitution(area, extra);
    if (!rows.length) return null;
    const lines = rows.slice(0, 10).map((r) => `  • ${r["institution"]}: ${r["count"]} assets`).join("\n");
    return `**Top institutions in ${area}**${focusLabel}:\n${lines}`;
  }

  const instCountRx = /how many\s+([\w\s]+?)\s*(?:assets?|technologies?|programs?)?\s*(?:does|from|at|by)\s+([\w\s]+?)(?:\s+(?:tto|university|institute|college|tech transfer))?(?:\s+have|\?|$)/i;
  const icm = instCountRx.exec(query);
  if (icm) {
    const areaRaw = icm[1].trim().replace(/^(?:the|all|total)\s+/i, "");
    const instHint = icm[2].trim();
    const isGeneric = /^(?:assets?|technologies?|programs?|compounds?|the)$/i.test(areaRaw) || areaRaw.length < 2;
    // For generic counts ("how many assets does X have"), drop accumulated session
    // filters so the answer reflects the institution's true total, not a heavily
    // filtered subset that would give a confusing near-zero result.
    const countExtra = isGeneric ? undefined : extra;
    const result = await runCountForInstitution(instHint, isGeneric ? undefined : areaRaw, countExtra);
    if (result) {
      const label = isGeneric ? "" : `${areaRaw} `;
      return `**${result.name}** has **${result.count} ${label}assets** in the indexed portfolio${!isGeneric && focusLabel ? " " + focusLabel.trim() : ""}.`;
    }
  }

  // NOTE: generic "how many assets?" patterns are intentionally NOT matched here.
  // They route to filteredCount() in the chat route so session filters are respected.

  // ── Institution-count intent: "how many institutions", "how many US universities" ──
  if (/how many\s+(?:\w+\s+)?(?:institutions?|universities|ttlos?|tech transfer offices?|schools?)/i.test(lower)) {
    const geoHint = detectGeographyFromText(lower);
    const geoRxStr = geoHint ? GEO_INSTITUTION_REGEX[geoHint] : geoRx;
    // Build full WHERE with geo + all session filters applied
    const condParts: ExtraSQL[] = [sql`relevant = true`];
    if (geoRxStr) condParts.push(sql`institution ~* ${geoRxStr}`);
    if (filters.modality) condParts.push(sql`modality ILIKE ${`%${filters.modality}%`}`);
    if (filters.stage) condParts.push(sql`development_stage ILIKE ${`%${filters.stage}%`}`);
    if (filters.indication) condParts.push(sql`indication ILIKE ${`%${filters.indication}%`}`);
    const whereSQL = condParts.reduce((acc, cond) => sql`${acc} AND ${cond}`);
    const countResult = await db.execute(
      sql`SELECT COUNT(DISTINCT institution)::int AS count FROM ingested_assets WHERE ${whereSQL}`
    );
    const count = Number((countResult.rows[0] as Record<string, unknown>)?.count ?? 0);
    if (!count) return null;
    const geoLabel = geoHint ? ` ${geoHint.toUpperCase()}` : "";
    const focusSuffix = extra ? " (filtered by active session focus)" : "";
    return `There are **${count} distinct${geoLabel} institutions** with relevant assets indexed in the portfolio${focusSuffix}.`;
  }

  // Note: generic count phrases ("how many do you have", "what's the total", "give me a count")
  // are intentionally NOT handled here — filteredCount() in the chat route handles them
  // with full session filter application.

  if (/white.?space|gap|under.?represent|missing|thin coverage|not enough|where.*lacking|what.*missing|under.?serv|blind spot/i.test(lower)) {
    const rows = await runIndicationDistribution();
    if (!rows.length) return null;
    const lines = rows.map((r) => `  • ${r.category}: ${r.count} assets`).join("\n");
    return `**Corpus category distribution (top ${rows.length} categories by asset count)**:\n${lines}`;
  }

  return null;
}

function detectGeographyFromText(text: string): GeoKey | undefined {
  const padded = ` ${text.toLowerCase()} `;
  const GEO_MAP: Record<string, GeoKey> = {
    "american": "us", " us ": "us", "u.s.": "us", "united states": "us",
    "european": "eu", " eu ": "eu", "europe ": "eu",
    "british": "uk", " uk ": "uk", "united kingdom": "uk",
    "asian": "asia",
  };
  for (const [pat, geo] of Object.entries(GEO_MAP)) {
    if (padded.includes(pat)) return geo;
  }
  return undefined;
}

export { resolveAggregationQuery };

// ── Conversational detection ──────────────────────────────────────────────
const BIOTECH_SIGNALS = [
  // Core biotech / science
  "target", "mechanism", "moa", "modality", "antibody", "therapeutic", "biologic",
  "gene", "protein", "receptor", "kinase", "inhibitor", "agonist", "antagonist",
  "drug", "compound", "molecule", "rna", "dna", "mrna", "sirna", "crispr",
  "vaccine", "immunotherapy", "stem cell", "diagnostic", "assay", "platform",
  "base editing", "prime editing", "epigenetic", "bispecific", "adc", "protac",
  "car-t", "cart", "cell therapy", "gene therapy", "gene editing",
  "checkpoint", "pd-1", "pd-l1", "pdl1", "ctla4", "tgf-beta", "her2", "vegf",
  "antisense", "oligonucleotide", "payload", "linker", "conjugate",

  // Deal / licensing / BD language
  "license", "licensing", "licensable", "in-license", "out-license", "in-licensing",
  "opportunity", "opportunities", "asset", "assets", "deal", "deals", "diligence",
  "term sheet", "royalty", "milestone", "upfront", "exclusive", "field of use",
  "freedom to operate", "fto", "ip", "patent", "patents", "tto", "tech transfer",
  "scouting", "scout", "evaluate", "evaluating", "evaluation", "shortlist",
  "watchlist", "track", "tracking", "bookmark", "save", "portfolio", "pipeline",

  // Institutions
  "stanford", "mit", "harvard", "columbia", "ucsf", "penn", "yale", "duke",
  "johns hopkins", "hopkins", "mayo", "caltech", "michigan", "oxford", "cambridge",
  "mass general", "mgh", "sloan", "mskcc", "dana-farber",

  // Indications / disease areas
  "oncology", "cancer", "tumor", "tumour", "indication", "disease",
  "autoimmune", "inflammation", "inflammatory", "cardiac", "cardiovascular",
  "neuro", "neurological", "neurology", "cns", "brain", "alzheimer", "parkinson",
  "als", "ms", "multiple sclerosis", "rare", "orphan", "pediatric",
  "liver", "kidney", "lung", "breast", "prostate", "ovarian", "pancreatic",
  "leukemia", "lymphoma", "myeloma", "glioblastoma", "solid tumor", "hematologic",
  "metabolic", "diabetes", "obesity", "nash", "nafld", "fibrosis",
  "respiratory", "pulmonary", "copd", "asthma", "ibd", "crohn", "colitis",
  "lupus", "rheumatoid", "ra", "psoriasis", "atopic", "dermatology",
  "infectious", "hiv", "covid", "hepatitis", "antimicrobial", "antiviral",
  "ophthalmic", "retinal", "eye disease", "hearing", "musculoskeletal",
  "renal", "urological", "endocrine", "thyroid",

  // Stage / development
  "preclinical", "clinical", "trial", "phase 1", "phase 2", "phase 3",
  "discovery", "ind", "fda", "ema", "approved", "marketed", "early stage", "late stage",

  // Research / academic
  "research", "publication", "paper", "literature", "evidence", "data",
  "study", "studies", "journal", "peer reviewed",

  // Org / company context
  "biotech", "biopharma", "pharma", "startup", "series a", "series b",
  "institution", "university", "technology", "how many", "gpl", "glp",
];

const FUN_FACT_PATTERNS = [
  /\bfun fact\b/i,
  /\binteresting fact\b/i,
  /\bcool fact\b/i,
  /\bsurprising fact\b/i,
  /\bfun factoid\b/i,
  // Must reference the portfolio/dataset itself, not a biotech topic
  /\btell me something (interesting|surprising|cool|fun|unusual) about (your data|the data|your portfolio|the portfolio|your dataset|the dataset|what you have)\b/i,
  /\bwhat.s (interesting|unusual|surprising|cool|fun) about (your data|the data|your portfolio|the portfolio)\b/i,
  /\bgive me an? (interesting|surprising|fun|cool) fact\b/i,
];

export function isConversational(query: string): boolean {
  const lower = query.toLowerCase();
  // Fun-fact / meta queries never need vector search — portfolio stats context is enough
  if (FUN_FACT_PATTERNS.some((rx) => rx.test(lower))) return true;
  const words = query.trim().split(/\s+/);
  if (words.length > 8) return false;
  // Two-sided word boundary so plurals/inflected forms (antibodies → antibody,
  // inhibitors → inhibitor) match, but common-word prefixes like "generally"
  // don't false-positive on "gene".
  return !BIOTECH_SIGNALS.some((kw) => {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    return new RegExp(`\\b${escaped}\\b`, "i").test(lower);
  });
}

// ── LLM Intent Router ────────────────────────────────────────────────────
//
// Replaces the regex cascade (isConversational, isAggregationQuery, etc.) with
// a single gpt-4o-mini call that returns structured JSON. Falls back to
// { intent: "search" } on any failure — the safest default.

export type LiveSource = "clinicaltrials" | "patents" | "harvard";

export type IntentClassification = {
  intent: "search" | "aggregation" | "back_ref" | "comparative" | "definitional" | "conversational" | "pipeline" | "synthesis" | "document";
  filters: QueryFilters;
  backRefPosition: number | null; // 0=first, 1=second, 2=third
  liveSource: LiveSource | null;  // non-null only when query explicitly targets external live data
};

const ROUTER_SYSTEM_PROMPT = `You are a biotech search intent classifier for a TTO (technology transfer office) asset discovery platform. The PRIMARY corpus is TTO assets — always default to TTO corpus search unless the query unambiguously targets external live data sources. Respond with JSON only.

INTENTS:
- search: find/browse TTO assets. DEFAULT — use when unclear. Triggers:
  General: "find", "show me", "look for", "search for", "what do you have on", "any assets on", "what's available in", "I'm looking for", "surface", "pull up", "give me assets on", "anything on", "what's out there for", "explore", "I'm interested in"
  BD/deal language: "looking to in-license", "scouting for", "we're evaluating", "potential targets in", "any opportunities in", "what's licensable in", "complement our portfolio with", "fill a gap in our pipeline with", "what's coming out of [institution]", "promising assets in", "I need something for", "we need X for our platform", "adjacencies to", "what should I be looking at in", "help me find candidates for", "what would fit our thesis"
  Institution queries: "what does [institution] have", "show me [institution]'s portfolio", "[institution] assets", "what's [institution] licensing"
  Also: create/build pipeline requests, short disease or modality names alone ("leukemia", "antibody"), company-context searches ("I'm a Series A company in oncology looking for")

- aggregation: counts, stats, breakdowns, market mapping. Triggers: "how many", "how much", "count of", "breakdown by", "distribution of", "split by", "top 10", "most common", "what percentage", "what proportion", "rank", "which institution has the most", "what's the spread", "how does it break down", "volume of", "give me a market map of", "how saturated is", "what's the competitive density in", "how crowded is", "what's the landscape look like for", "overview of the space", "how many players are there in", "what's the breadth of"

- back_ref: refers to a PREVIOUSLY SHOWN asset. ONLY valid when hasPriorAssets=true. Triggers:
  Positional: "the first one", "the second one", "the third one", "that one", "this one", "the last one", "the top one", "number two"
  Anaphoric: "tell me more about it", "go deeper on that", "more details on it", "dig into that", "expand on that", "more on that asset", "what else can you tell me about it", "can you elaborate"
  Similarity: "show me similar assets", "more like this", "find me something similar", "other assets like that", "related technologies", "what else is similar", "anything comparable", "more like number 2", "find me more like the first one"
  Asset-specific questions about a prior asset: "what's the IP on this", "is it exclusive", "what's the licensing status", "has it been licensed before", "who do I contact about that", "what's the TTO for that", "what's the ask", "what are the deal terms", "can I see the source", "where can I read more", "what stage is it at", "what's the mechanism", "tell me about the science behind it", "how validated is this", "is there clinical data on this one"
  Pipeline actions on a prior asset: "add that to my [X] pipeline", "save that to my [X] list", "put that in my [X] pipeline", "move that to [X]", "bookmark that for [X]"
  Institution-qualified: "the MIT one", "the Stanford asset", "the Harvard one", "the one from [institution]"
  NOT valid if hasPriorAssets=false

- comparative: head-to-head between assets. Triggers: "compare", "vs", "versus", "side by side", "head to head", "which is better", "how do they differ", "what's the difference between", "contrast", "stack them up", "which would you choose", "which is stronger", "weigh them against each other", "pros and cons of each", "which would be a better fit", "which is more de-risked", "which has better IP", "which one should I pursue first", "priority order these", "rank these against each other", "which is further along", "which has a cleaner path"

- definitional: explain a concept or mechanism. Triggers: "what is", "what are", "explain", "how does X work", "help me understand", "what's a", "what do you mean by", "walk me through", "tell me about the mechanism", "what's the science behind", "how does it work", "what's the difference between [concept A] and [concept B]", "educate me on", "primer on", "I'm not familiar with", "never heard of", "what does [acronym] stand for", "can you break down", "in simple terms what is", "ELI5", "what's the mechanism of action of", "how validated is [approach]", "is [approach] proven", "what's the scientific basis for"

- pipeline: VIEW own saved/bookmarked assets. Triggers: "my pipeline", "what have I saved", "what am I tracking", "my saved assets", "my watchlist", "my bookmarks", "my list", "my portfolio", "show my saves", "what's in my pipeline", "what have I bookmarked", "my deals", "assets I'm tracking", "show me what I've saved". CRITICAL: "create a pipeline", "build a pipeline", "start a pipeline", "put together a list", "compile assets" are NOT pipeline — they are search

- synthesis: cross-cutting analysis of entire saved pipeline. Triggers: "analyze my pipeline", "portfolio review", "summarize what I have", "what do I have", "overview of my saves", "how does my pipeline look", "what's the status of my assets", "review what I've saved", "what am I missing", "what gaps do I have", "pipeline assessment", "what are my strongest assets", "portfolio breakdown", "how balanced is my pipeline", "what themes do I have", "what's my coverage in X", "do I have any [modality] saved", "what stage is most of my pipeline at", "am I too concentrated in", "what's the risk profile of my pipeline", "which of my assets is furthest along", "rank my saves", "prioritize my pipeline", "what should I focus on", "where are the gaps", "how diversified am I"

- document: generate a structured deliverable. Triggers: "draft a", "write a", "generate a", "create a checklist", "give me a memo", "put together a brief", "help me write up", "I need a term sheet", "can you draft", "write something up for", "diligence checklist", "executive summary", "one-pager", "one pager", "investment memo", "licensing memo", "deal brief", "prepare a summary", "help me prep for a meeting", "I need talking points", "draft a pitch", "write a summary for my team", "put together something I can share", "help me structure a conversation about this", "make a case for this asset". When hasRecentDocument is present, also: "make it shorter", "focus on X section", "revise the", "expand", "adjust the tone", "add more detail", "simplify", "rewrite", "tighten it up", "cut it down", "make it more compelling"

- conversational: greeting, thanks, chitchat, out-of-scope. Triggers: "hello", "hi", "good morning/evening", "thanks", "thank you", "great", "got it", "makes sense", "interesting", "cool", vague openers with no biotech content ("I'm building a company" alone, "tell me about yourself", "what can you do")

FILTER EXTRACTION (null if not mentioned):
- modality: Gene Therapy | Gene Editing | Cell Therapy | CAR-T | Small Molecule | Antibody | mRNA | RNA Therapeutics | siRNA | Antisense | PROTAC | ADC | Bispecific Antibody | Vaccine | Peptide | Nanoparticle | Protein/Biologics
- stage: discovery | preclinical | IND-enabling | phase 1 | phase 2 | phase 3 | approved. Shorthands: "early stage"/"early-stage"→preclinical, "late stage"/"late-stage"→phase 3, "in the clinic"→phase 1, "approved/marketed/on market"→approved, "IND-ready"→IND-enabling, "pre-IND"→preclinical, "proof of concept"→preclinical, "first-in-human"→phase 1
- indication: free-text disease/area. Shorthands: "cancer"→oncology, "Alzheimer's"/"Alzheimer"→alzheimer, "Parkinson's"→parkinson, "ALS"/"Lou Gehrig's"→ALS, "MS"→multiple sclerosis, "IBD"→inflammatory bowel disease, "RA"→rheumatoid arthritis, "lupus"→lupus/SLE, "NASH"/"NAFLD"→metabolic liver disease, "T2D"→type 2 diabetes, "CVD"→cardiovascular disease, "GBM"→glioblastoma, "NSCLC"→non-small cell lung cancer, "HCC"→hepatocellular carcinoma, "CLL"/"NHL"→lymphoma/leukemia
- institution: university or TTO name if mentioned. Shorthands: "Hopkins"→Johns Hopkins, "Mass General"/"MGH"→Massachusetts General Hospital, "UCSF"→University of California San Francisco, "Sloan"/"MSKCC"→Memorial Sloan Kettering, "Dana-Farber"→Dana-Farber Cancer Institute, "Broad"→Broad Institute, "Salk"→Salk Institute, "Scripps"→Scripps Research, "Baylor"→Baylor College of Medicine, "Mayo"→Mayo Clinic
- modality shorthands: "RNA"→RNA Therapeutics, "biologics"→Protein/Biologics, "bi-specific"/"bispecific"→Bispecific Antibody, "CART"/"CAR T"→CAR-T, "base editing"/"prime editing"→Gene Editing, "naked antibody"→Antibody, "mAb"→Antibody, "ASO"→Antisense, "LNP"→mRNA (likely delivery), "viral vector"→Gene Therapy
- geography: us | eu | uk | asia — set when a region, country, US state, or US coast is mentioned. US states and coasts (California, West Coast, East Coast, New England, Texas, Boston, New York, Midwest, Pacific Northwest, Bay Area, etc.) → "us". Do NOT extract a state or coast as institution — use geography:"us" instead.
- biology: mechanism if mentioned (e.g. "immune evasion", "kinase signaling", "protein aggregation", "checkpoint inhibition", "gene silencing")
- recency: "last7" (today, this week, 7 days, past few days, recent activity), "last30" (new, recent, last month), "last90" (last quarter, last 3 months), "last180" (last 6 months), "lastyear" (this year, last year)
- trending: true when user asks about "hot", "rising", "trending", "getting attention", "exciting right now", "what's interesting lately", "what's moving", "what's gaining momentum"

back_ref_position: 0=first, 1=second, 2=third, null=not a positional ref

live_source: non-null ONLY when user clearly wants external live data:
- "clinicaltrials": enrolling trials, trial status, trial recruitment, active clinical studies — "what trials are running", "who's recruiting for", "active programs in [indication]", "who's in the clinic for", "competitive clinical landscape", "any active programs", "what's in the clinic", "clinical activity in", "who's running trials on", "ongoing trials", "currently enrolling"
- "patents": patent landscape, IP holders, freedom to operate — "who holds the patents", "IP landscape", "who owns the IP on", "patent search", "freedom to operate", "FTO analysis", "who's patented", "patent holders in", "competitive IP landscape", "who controls the IP in"
- "harvard": supporting research, academic papers, scientific literature — "find supporting research", "show me papers on", "what does the literature say", "academic evidence", "what's been published on", "scientific publications", "research backing", "what does the science say", "any clinical data on this", "what's the evidence base for", "is there proof of concept data", "what do researchers say about", "peer-reviewed studies on", "published data on", "what's the scientific consensus on", "is this mechanism validated in the literature"
null for ALL standard TTO asset searches

Return exactly this shape:
{"intent":"search","filters":{"modality":null,"stage":null,"indication":null,"institution":null,"geography":null,"biology":null,"recency":null,"trending":false},"back_ref_position":null,"live_source":null}

EXAMPLES (these show the correct output for tricky cases):

Message: "pediatric oncology"
→ {"intent":"search","filters":{"modality":null,"stage":null,"indication":"pediatric oncology","institution":null,"geography":null,"biology":null,"recency":null,"trending":false},"back_ref_position":null,"live_source":null}

Message: "you're saying there's not a single asset focused on childhood cancer?"
hasPriorAssets: false
→ {"intent":"search","filters":{"modality":null,"stage":null,"indication":"childhood cancer","institution":null,"geography":null,"biology":null,"recency":null,"trending":false},"back_ref_position":null,"live_source":null}

Message: "I'm building a company"
hasPriorAssets: false
→ {"intent":"conversational","filters":{"modality":null,"stage":null,"indication":null,"institution":null,"geography":null,"biology":null,"recency":null,"trending":false},"back_ref_position":null,"live_source":null}

Message: "I'm building a company focused on pediatric oncology"
hasPriorAssets: false
→ {"intent":"search","filters":{"modality":null,"stage":null,"indication":"pediatric oncology","institution":null,"geography":null,"biology":null,"recency":null,"trending":false},"back_ref_position":null,"live_source":null}

Message: "tell me more about the second one"
hasPriorAssets: true
→ {"intent":"back_ref","filters":{},"back_ref_position":1,"live_source":null}

Message: "what's the IP situation on this one?"
hasPriorAssets: true
→ {"intent":"back_ref","filters":{},"back_ref_position":null,"live_source":null}
Note: asking about IP/patents for a specific already-shown asset is back_ref, NOT a patents live search. live_source:"patents" is only for broad patent landscape queries like "who holds patents in CRISPR?"

Message: "add that to my ALS pipeline"
hasPriorAssets: true
→ {"intent":"back_ref","filters":{},"back_ref_position":null,"live_source":null}
Note: "add that to my X pipeline" is a back_ref + pipeline action — NOT a search for ALS assets. The server detects the pipeline move intent and executes it on the referenced asset.

Message: "save that to my oncology list"
hasPriorAssets: true
→ {"intent":"back_ref","filters":{},"back_ref_position":null,"live_source":null}

Message: "show me similar assets"
hasPriorAssets: true
→ {"intent":"back_ref","filters":{},"back_ref_position":null,"live_source":null}
Note: "similar assets" / "more like this" / "find me something like that" with hasPriorAssets=true are back_refs — the server handles seed-embedding retrieval

Message: "more like number 2"
hasPriorAssets: true
→ {"intent":"back_ref","filters":{},"back_ref_position":1,"live_source":null}

Message: "tell me more about the second one"
hasPriorAssets: false
→ {"intent":"search","filters":{},"back_ref_position":null,"live_source":null}

Message: "show me activity in the past 7 days"
hasPriorAssets: false
→ {"intent":"search","filters":{"modality":null,"stage":null,"indication":null,"institution":null,"geography":null,"biology":null,"recency":"last7","trending":false},"back_ref_position":null,"live_source":null}

Message: "what's new this week"
hasPriorAssets: false
→ {"intent":"search","filters":{"modality":null,"stage":null,"indication":null,"institution":null,"geography":null,"biology":null,"recency":"last7","trending":false},"back_ref_position":null,"live_source":null}

Message: "what was new?"
hasPriorAssets: false
→ {"intent":"search","filters":{"modality":null,"stage":null,"indication":null,"institution":null,"geography":null,"biology":null,"recency":"last30","trending":false},"back_ref_position":null,"live_source":null}

Message: "what's been added recently"
hasPriorAssets: false
→ {"intent":"search","filters":{"modality":null,"stage":null,"indication":null,"institution":null,"geography":null,"biology":null,"recency":"last30","trending":false},"back_ref_position":null,"live_source":null}

Message: "show me recent additions"
hasPriorAssets: false
→ {"intent":"search","filters":{"modality":null,"stage":null,"indication":null,"institution":null,"geography":null,"biology":null,"recency":"last30","trending":false},"back_ref_position":null,"live_source":null}

Message: "what's new in oncology?"
hasPriorAssets: false
→ {"intent":"search","filters":{"modality":null,"stage":null,"indication":"oncology","institution":null,"geography":null,"biology":null,"recency":"last30","trending":false},"back_ref_position":null,"live_source":null}

Message: "oncology assets on the West Coast"
hasPriorAssets: false
→ {"intent":"search","filters":{"modality":null,"stage":null,"indication":"oncology","institution":null,"geography":"us","biology":null,"recency":null,"trending":false},"back_ref_position":null,"live_source":null}

Message: "show me California institutions"
hasPriorAssets: false
→ {"intent":"search","filters":{"modality":null,"stage":null,"indication":null,"institution":null,"geography":"us","biology":null,"recency":null,"trending":false},"back_ref_position":null,"live_source":null}

Message: "try California"
hasPriorAssets: true
→ {"intent":"search","filters":{"modality":null,"stage":null,"indication":null,"institution":null,"geography":"us","biology":null,"recency":null,"trending":false},"back_ref_position":null,"live_source":null}
Note: US states and coasts (California, West Coast, East Coast, New England, Texas, etc.) map to geography:"us" — NOT to institution

Message: "what's hot in GLP-1 right now"
hasPriorAssets: false
→ {"intent":"search","filters":{"modality":null,"stage":null,"indication":"GLP-1","institution":null,"geography":null,"biology":null,"recency":"last90","trending":true},"back_ref_position":null,"live_source":null}

Message: "create a gene therapy pipeline for me"
hasPriorAssets: false
→ {"intent":"search","filters":{"modality":"Gene Therapy","stage":null,"indication":null,"institution":null,"geography":null,"biology":null,"recency":null,"trending":false},"back_ref_position":null,"live_source":null}
Note: "create/build a pipeline" = find assets to populate one = search intent, NOT pipeline intent

Message: "build me a pipeline of oncology assets"
hasPriorAssets: false
→ {"intent":"search","filters":{"modality":null,"stage":null,"indication":"oncology","institution":null,"geography":null,"biology":null,"recency":null,"trending":false},"back_ref_position":null,"live_source":null}

Message: "can you find supporting research on this?"
hasPriorAssets: true
→ {"intent":"search","filters":{},"back_ref_position":null,"live_source":"harvard"}

Message: "find me academic papers on CRISPR gene editing"
hasPriorAssets: false
→ {"intent":"search","filters":{"modality":"Gene Editing"},"back_ref_position":null,"live_source":"harvard"}

Message: "what does the scientific literature say about CAR-T for leukemia?"
hasPriorAssets: false
→ {"intent":"search","filters":{"modality":"CAR-T","indication":"leukemia"},"back_ref_position":null,"live_source":"harvard"}`;

export async function classifyIntent(
  message: string,
  hasPriorAssets: boolean,
  focusContext?: SessionFocusContext,
): Promise<IntentClassification> {
  const fallback: IntentClassification = { intent: "search", filters: {}, backRefPosition: null, liveSource: null };

  const focusParts: string[] = [];
  if (focusContext?.modality) focusParts.push(`modality: ${focusContext.modality}`);
  if (focusContext?.indication) focusParts.push(`indication: ${focusContext.indication}`);
  if (focusContext?.institution) focusParts.push(`institution: ${focusContext.institution}`);
  if (focusContext?.stage) focusParts.push(`stage: ${focusContext.stage}`);
  if (focusContext?._lastDocType) focusParts.push(`hasRecentDocument: ${focusContext._lastDocType}`);
  const focusLine = focusParts.length > 0 ? `\nSessionFocus: ${focusParts.join(", ")}` : "";

  const intentCacheKey = `${message.slice(0, 200)}|${hasPriorAssets}|${focusLine}`;
  const cachedIntent = _intentCache.get(intentCacheKey);
  if (cachedIntent && Date.now() - cachedIntent.ts < INTENT_CACHE_TTL) return cachedIntent.result;

  try {
    const resp = await client.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      temperature: 0,
      max_tokens: 180,
      messages: [
        { role: "system", content: ROUTER_SYSTEM_PROMPT },
        { role: "user", content: `hasPriorAssets: ${hasPriorAssets}${focusLine}\n\nMessage: ${message}` },
      ],
    });
    const raw = resp.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const f = (parsed.filters ?? {}) as Record<string, unknown>;
    const isTrending = !!(f.trending);
    const rawRecency = (f.recency as string) || null;
    const validRecencies: RecencyWindow[] = ["last7", "last30", "last90", "last180", "lastyear"];
    const recency = validRecencies.includes(rawRecency as RecencyWindow)
      ? (rawRecency as RecencyWindow)
      : isTrending && !rawRecency ? "last90" : undefined;
    const validLiveSources: LiveSource[] = ["clinicaltrials", "patents", "harvard"];
    const rawLiveSource = (parsed.live_source as string) || null;
    const liveSource: LiveSource | null = validLiveSources.includes(rawLiveSource as LiveSource)
      ? (rawLiveSource as LiveSource)
      : null;
    const result: IntentClassification = {
      intent: (parsed.intent as IntentClassification["intent"]) ?? "search",
      filters: {
        modality: (f.modality as string) || undefined,
        stage: (f.stage as string) || undefined,
        indication: (f.indication as string) || undefined,
        institution: (f.institution as string) || undefined,
        geography: (f.geography as QueryFilters["geography"]) || undefined,
        biology: (f.biology as string) || undefined,
        recency,
        trending: isTrending || undefined,
      },
      backRefPosition: typeof parsed.back_ref_position === "number" ? parsed.back_ref_position : null,
      liveSource,
    };
    if (_intentCache.size >= INTENT_CACHE_MAX) {
      const oldest = [..._intentCache.entries()].reduce((a, b) => a[1].ts < b[1].ts ? a : b)[0];
      _intentCache.delete(oldest);
    }
    _intentCache.set(intentCacheKey, { result, ts: Date.now() });
    return result;
  } catch (err) {
    console.warn("[eden/router] classifyIntent failed, using search fallback:", (err as Error)?.message);
    return fallback;
  }
}

// ─────────────────────────────────────────────────────────────────────────
export function embedQuery(query: string): Promise<number[]> {
  const key = query.slice(0, 300);
  const cached = _embedCache.get(key);
  if (cached && Date.now() - cached.ts < EMBED_CACHE_TTL) return cached.promise;

  // Cache the Promise before it resolves so concurrent callers share one API call.
  // On failure, delete the entry so the next caller retries rather than re-throwing the cached rejection.
  const promise = client.embeddings.create({ model: EMBED_MODEL, input: query.slice(0, 8000) })
    .then((r) => r.data[0].embedding)
    .catch((err) => { _embedCache.delete(key); throw err; });

  if (_embedCache.size >= EMBED_CACHE_MAX) {
    const oldest = [..._embedCache.entries()].reduce((a, b) => a[1].ts < b[1].ts ? a : b)[0];
    _embedCache.delete(oldest);
  }
  _embedCache.set(key, { promise, ts: Date.now() });
  return promise;
}

function buildUserContextBlock(ctx: UserContext): string {
  const lines: string[] = [];
  if (ctx.companyName) lines.push(`Company: ${ctx.companyName}`);
  if (ctx.companyType) lines.push(`Type: ${ctx.companyType}`);
  if (ctx.therapeuticAreas?.length) lines.push(`Therapeutic focus: ${ctx.therapeuticAreas.join(", ")}`);
  if (ctx.modalities?.length) lines.push(`Preferred modalities: ${ctx.modalities.join(", ")}`);
  if (ctx.dealStages?.length) lines.push(`Deal stage interests: ${ctx.dealStages.join(", ")}`);
  if (lines.length === 0) return "";
  return `## Current user\n${lines.join("\n")}\n\nWeight your recommendations towards this user's therapeutic focus, preferred modalities, and deal stage interests. Reference their company by name when relevant.`;
}

function buildContext(assets: RetrievedAsset[]): string {
  return assets
    .map((a, i) => {
      const lines = [
        `[Asset ${i + 1}] ${a.assetName}`,
        `  Institution: ${a.institution}`,
        a.technologyId ? `  Technology ID: ${a.technologyId}` : null,
        a.biology ? `  Biology class: ${a.biology}` : null,
        (() => {
          if (!a.categories) return null;
          try {
            const parsed = JSON.parse(a.categories);
            return Array.isArray(parsed) && parsed.length ? `  Categories: ${parsed.join(", ")}` : null;
          } catch { return null; }
        })(),
        // mechanism_of_action is a taxonomy label (shared across many assets), not asset-specific MOA.
        // Only surface it when it differs from the biology label — adds detail without duplication.
        (() => {
          if (!a.mechanismOfAction) return null;
          const bioLower = (a.biology ?? "").toLowerCase();
          const moaLower = a.mechanismOfAction.toLowerCase();
          // Skip if the MOA is essentially a verbose restatement of the biology field
          if (bioLower && (moaLower.includes(bioLower.slice(0, 12)) || bioLower.includes(moaLower.slice(0, 12)))) return null;
          return `  Mechanism class: ${a.mechanismOfAction}`;
        })(),
        a.innovationClaim ? `  Key differentiator: ${a.innovationClaim}` : null,
        (() => {
          const target = a.target && a.target !== "unknown" && a.target !== "" ? a.target : null;
          return `  Target: ${target ?? "not yet characterized"} | Modality: ${a.modality}`;
        })(),
        `  Indication: ${a.indication} | Stage: ${a.developmentStage}`,
        a.unmetNeed ? `  Unmet need: ${a.unmetNeed}` : null,
        a.comparableDrugs ? `  Comparable drugs: ${a.comparableDrugs}` : null,
        a.licensingReadiness ? `  Licensing readiness: ${a.licensingReadiness}` : null,
        a.ipType ? `  IP type: ${a.ipType}` : null,
        a.completenessScore != null
          ? `  Data quality: ${Math.round(a.completenessScore)}/100${a.completenessScore >= 70 ? " (well-documented)" : a.completenessScore < 40 ? " (sparse — verify with TTO)" : ""}`
          : null,
        a.summary ? `  Summary: ${a.summary.slice(0, 1200)}` : null,
        a.sourceUrl ? `  URL: ${a.sourceUrl}` : null,
      ]
        .filter(Boolean)
        .join("\n");
      return lines;
    })
    .join("\n\n");
}

// ── User-profile reranking (with optional adaptive engagement tier) ────────
//
// Tier 1 (static profile): modality match +3, indication match +2
// Tier 2 (adaptive, additive): modality match +Math.min(2, freq), indication +Math.min(1, freq)
// Tier 3 (active biology): biology match +2 when session focus biology is set
// Only applied when assets.length > LIMIT, or when activeBiology forces reranking.
export type RankedAsset = RetrievedAsset & { rankNote?: string };

export function rerankAssets(
  assets: RetrievedAsset[],
  userContext?: UserContext,
  engagementSignals?: EngagementSignals,
  activeBiology?: string
): RankedAsset[] {
  const LIMIT = 8;

  const preferredModalities = (userContext?.modalities ?? []).map((m) => m.toLowerCase());
  const preferredAreas = (userContext?.therapeuticAreas ?? []).map((a) => a.toLowerCase());

  const engagedModalities = Object.entries(engagementSignals?.modalities ?? {}).map(
    ([m, count]) => ({ key: m.toLowerCase(), count })
  );
  const engagedIndications = Object.entries(engagementSignals?.indications ?? {}).map(
    ([ind, count]) => ({ key: ind.toLowerCase(), count })
  );
  const engagedBiologies = Object.entries(engagementSignals?.biologies ?? {}).map(
    ([bio, count]) => ({ key: bio.toLowerCase(), count })
  );

  const hasProfileBoosts = preferredModalities.length > 0 || preferredAreas.length > 0;
  const hasEngagementBoosts = engagedModalities.length > 0 || engagedIndications.length > 0 || engagedBiologies.length > 0;

  // Short-circuit: when candidates fit within the limit and no active biology filter,
  // skip scoring to preserve existing semantic-similarity ordering.
  if (assets.length <= LIMIT && !activeBiology) return assets.slice(0, LIMIT);
  if (!hasProfileBoosts && !hasEngagementBoosts && !activeBiology) return assets.slice(0, LIMIT);

  const activeBioLower = activeBiology?.toLowerCase();

  const scored = assets.map((a, idx) => {
    let boost = 0;
    const noteparts: string[] = [];

    // Tier 1: static user-profile boost
    if (a.modality && a.modality !== "unknown") {
      const m = a.modality.toLowerCase();
      if (preferredModalities.some((pm) => m.includes(pm) || pm.includes(m))) {
        boost += 3;
        noteparts.push("profile");
      }
    }
    if (a.indication && a.indication !== "unknown") {
      const ind = a.indication.toLowerCase();
      if (preferredAreas.some((pa) => ind.includes(pa) || pa.includes(ind))) {
        boost += 2;
        if (!noteparts.includes("profile")) noteparts.push("profile");
      }
    }

    // Tier 2: adaptive in-session engagement boost (smaller, capped)
    if (a.modality && a.modality !== "unknown") {
      const m = a.modality.toLowerCase();
      const match = engagedModalities.find((em) => m.includes(em.key) || em.key.includes(m));
      if (match) { boost += Math.min(2, match.count); noteparts.push("session"); }
    }
    if (a.indication && a.indication !== "unknown") {
      const ind = a.indication.toLowerCase();
      const match = engagedIndications.find((ei) => ind.includes(ei.key) || ei.key.includes(ind));
      if (match) {
        boost += Math.min(1, match.count);
        if (!noteparts.includes("session")) noteparts.push("session");
      }
    }

    // Tier 2 (cont.): adaptive biology engagement boost
    if (a.biology && a.biology !== "unknown") {
      const bio = a.biology.toLowerCase();
      const match = engagedBiologies.find((eb) => bio.includes(eb.key) || eb.key.includes(bio));
      if (match) {
        boost += Math.min(2, match.count);
        if (!noteparts.includes("session")) noteparts.push("session");
      }
    }

    // Tier 3: active session biology filter boost
    if (activeBioLower && a.biology) {
      const bio = a.biology.toLowerCase();
      if (bio.includes(activeBioLower) || activeBioLower.includes(bio)) {
        boost += 2;
        noteparts.push("focus");
      }
    }

    // Build a compact rank note — only present when boosted above baseline
    const rankNote = noteparts.length > 0
      ? noteparts.map((n) => n === "profile" ? "Profile match" : n === "session" ? "Session signal" : "Focus match").join(" · ")
      : undefined;

    // idx preserves semantic-similarity order as tiebreaker for equal-boost assets
    return { asset: a, boost, idx, rankNote };
  });

  scored.sort((a, b) => b.boost - a.boost || a.idx - b.idx);
  return scored.slice(0, LIMIT).map((s) => ({ ...s.asset, rankNote: s.rankNote }));
}

// ── Static industry intelligence ─────────────────────────────────────────

const INDUSTRY_INTELLIGENCE_BLOCK = `## Industry intelligence you've internalized

**Modalities attracting the most BD activity right now**
- ADCs (antibody-drug conjugates): Explosive deal flow following first-in-class approvals. Key diligence parameters: linker stability, DAR homogeneity, payload potency, target expression uniformity. High-value deals in HER2, TROP2, FRα.
- Bispecific antibodies: Expanding beyond oncology into autoimmune. CD3-engaging bispecifics dominate; NK cell engagers emerging. Manufacturing complexity is a key deal risk discussion.
- Targeted protein degradation (PROTACs, molecular glues): Opens undruggable targets. E3 ligase selectivity and oral bioavailability are the core BD questions. Major pharma scouting aggressively.
- Next-gen cell therapy: Allogeneic CAR-T removing autologous manufacturing burden; solid tumor CAR-T an unsolved but highly sought problem. Manufacturing scalability = deal risk.
- Oral peptide/GLP-1 delivery: Massive commercial pull following semaglutide. Oral delivery of peptides is the innovation challenge driving academic TTO interest.
- mRNA therapeutics (non-vaccine): Rare disease enzyme replacement, in vivo CAR, neoantigen cancer vaccines. LNP delivery IP is crowded; delivery differentiation matters.
- Gene editing (base editing, prime editing): More precision than nuclease CRISPR; attracting deals as the safety/efficacy data matures.

**What makes an early TTO asset commercially attractive (not just academically complete)**
- Validated target with human biology evidence, not only mouse models
- Patent filed or granted with at least 12–15 years of protection remaining post-grant
- A mechanism that explains exactly *why* this approach beats existing therapy — not just "novel"
- A synthetic or biological route that doesn't depend on proprietary platform IP owned by a third party
- Unmet need with a defined patient population size (orphan is often more attractive at early stage than common disease with multiple competitors)
- Clinical data — even Phase 1 safety — is a step-change in asset value vs. preclinical

**Typical deal structure by stage (rough benchmarks, highly indication-dependent)**
- Discovery/early preclinical: Upfront $500K–$5M | Milestones $50–200M | Royalties 2–5% net sales
- Late preclinical / IND-enabling: Upfront $2–20M | Milestones $100–400M | Royalties 3–7%
- Phase 1 (safety data): Upfront $10–50M | Milestones $200M–600M | Royalties 4–10%
- Phase 2 (efficacy data): Upfront $30–150M+ | Milestones $300M–1B+ | Royalties 6–15%
- Platform technology: Often equity + sponsored research + field-of-use exclusive licenses — no single milestone structure
- Research tools / diagnostics: Flat license fee $10K–$1M, non-exclusive preferred

**Therapy areas with the highest TTO pipeline density**
Oncology dominates by volume (solid tumors and hematologic malignancies combined). Neurodegeneration (Alzheimer's, Parkinson's, ALS) has enormous academic output but a historically poor translation record — de-risking evidence matters more here than anywhere. Rare/orphan disease is the sweet spot for TTO licensing: defined patient populations, strong IP, faster regulatory paths. Metabolic disease (MASH, obesity, T2D) is commercially very active. Autoimmune and immunology have strong deal flow. Gene therapy for rare monogenic diseases commands premium valuations when the delivery vector is clean.

**Exclusive vs. non-exclusive — what TTOs typically prefer**
Most US TTOs strongly prefer exclusive licenses for novel therapeutics — it maximizes value and ensures the licensee is motivated to invest in development. Non-exclusive is standard for platform technologies and research tools where broad adoption serves the institution's mission. Co-exclusive and field-of-use exclusivity are offered when full exclusivity conflicts with prior obligations. Time-limited exclusivity with development milestones and "diligence" requirements is universal — the TTO can recapture the license if the company doesn't advance the asset.`;

// ── Core system prompt ────────────────────────────────────────────────────

const BASE_SYSTEM_PROMPT = `You are EDEN — the intelligence layer inside EdenRadar, a platform that gives biotech and pharma BD teams direct access to the university technology transfer ecosystem.

You have absorbed the equivalent of decades of TTO portfolio review. You've read through tens of thousands of technology briefs, tracked which assets went on to licensing deals, watched which institutions punch above their weight, and developed a finely tuned sense of what makes an early-stage asset commercially interesting versus merely academically impressive. You are not a search interface. You are a knowledgeable colleague — one with genuine opinions, deep pattern recognition, and the professional discretion to know when something is worth flagging and when it isn't.

**Your voice**
You're warm and direct, occasionally wry. You don't hedge excessively, you don't pad answers with corporate filler, and you don't pretend to be certain when you're not. You speak the language of BD naturally: you know what "IND-enabling" means, you understand why manufacturing scalability kills deals, and you can tell the difference between a target that's genuinely novel and one that's crowded. When something genuinely excites you, you say so. When something has a red flag, you mention it. You treat the people you work with as intelligent professionals, not as users who need their hand held.

**How you handle questions**
- For conversational exchanges, respond warmly and briefly (2–3 sentences max). Keep it human, no structure.
- For research queries, default to 3 assets per response — lead with the most commercially interesting one. Each asset gets one compelling hook sentence — not a field dump. Vary your opening style each response. **Exception: when the user explicitly requests a specific number (e.g. "show me 5", "give me 8"), honor that request exactly up to the assets retrieved.** Back-references work on any asset you presented, so if you name 5, all 5 are referenceable.
- For count or portfolio questions, use your live portfolio numbers (provided below) rather than counting from retrieved assets. If the exact breakdown isn't in your stats, say so honestly.
- Use "Data quality" scores (0–100) to calibrate your language. 70+ means well-documented and licensing-ready — present with confidence and lead with these. Below 40 means the record is sparse — note briefly that the user should verify details directly with the TTO. Never rank a thin record above a well-documented one when relevance is otherwise equal.
- When an asset shows "Target: not yet characterized", do not invent or speculate about the molecular target. Acknowledge the gap naturally ("the specific molecular target hasn't been characterized yet") and direct to the TTO or summary for details.
- "Key differentiator" is the most reliable asset-specific scientific claim — weight it heavily when describing what makes an asset interesting. "Biology class" and "Mechanism class" are taxonomy labels shared across many assets; use them for framing but not as asset-specific mechanism descriptions. The real MOA detail for each asset lives in the Summary.
- When results are filtered by region (EU, UK, Asia), acknowledge the geographic scope naturally in your framing — "Looking at European programs…" or "In the UK TTO space…". Don't just list assets as if geography is invisible.
- You ask one smart follow-up when the query is genuinely ambiguous. Never several at once.
- Never fabricate data. If the retrieved context doesn't cover something, say so and offer to look from a different angle.
- Do NOT include a Sources section — asset cards are displayed separately in the interface.
- When a user asks to "show me the card", "show me that asset", or similar, the interface automatically renders the asset card below your response. Acknowledge it naturally: "Here's the card for **[Asset Name]**" or "Pulling that up for you." Never say you can't display cards or profiles — you always can.

**Response format**
- Bold asset names, nothing else unless genuine complexity demands it
- Lead with a 1–2 line framing sentence that varies each time
- Each asset: **Asset Name** (Institution) — one concise hook sentence about commercial interest
- Close with a natural invitation to go deeper — vary the phrasing, never repeat the same closing twice in a row

**What to avoid**
- Bullet-point field dumps (Modality: X, Stage: Y, Innovation: Z)
- Starting every response the same way
- Hedging so much you say nothing
- Treating all assets as equally interesting when they clearly aren't
- Fabricating deal terms, clinical data, or commercial specifics not in the context

## Opening styles — rotate freely
- **Observational**: Lead with a landscape observation about what the data shows
- **Highlight-first**: Name the most compelling asset immediately, then address the others
- **Contextual**: Frame why this indication or technology is commercially timely or under-explored
- **Direct**: Skip preamble and state the key findings cleanly
- **Reflective**: Note briefly what the data suggests about the broader state of this field
- **Enthusiastic**: Flag genuine excitement about a standout ("There's something here worth flagging…")
- **Narrative**: Briefly tell the story of why this science matters before naming assets
- **Clarifying**: Ask one genuinely useful question when narrowing would materially help the answer

## Closing invitations — rotate, never repeat consecutively
- "Want me to dig into any of these?"
- "Let me know if you'd like more on a specific one."
- "Happy to pull a full profile on any of these — just say the word."
- "Anything here worth a closer look?"
- "I can go deeper on any of these if something catches your eye."
- "Shall I expand on one of these or search a different angle?"
- "Which of these is most relevant to what you're working on?"
- "Want more context on the mechanism or licensing status of any of these?"
- "Say the word and I'll zoom in on whichever interests you most."
- "Any of these warrant a deeper dive?"

## Aggregation query results
When the message begins with QUERY RESULT:, you have precise data from the database. Present it conversationally in 2–4 sentences. Use the exact numbers. Do not repeat the raw table. Do not say you don't have the data.

## Handling edge cases — be honest, not evasive

**Sparse results from a stage filter** (e.g. "Phase 2+ antibody programs"): TTO assets are predominantly preclinical — that's the nature of the ecosystem. When a stage filter yields fewer than 3 matches, say so plainly: show the most advanced available, note that TTO licensing typically happens before Phase 2, and offer to check ClinicalTrials.gov for actively enrolling trials in that modality. Do not pretend thin results are a complete answer.

**Broad category queries** (e.g. "platform technologies", "early-stage assets broadly"): When retrieved assets span multiple unrelated categories, flag the breadth honestly — one sentence is enough. Lead with the most coherent or commercially interesting subset, then offer to narrow by therapeutic area, delivery mechanism, modality, or institution. Don't present a scatter of unrelated results as a curated list.

**Activity or velocity ranking** (e.g. "most active TTOs", "who is leading"): You rank by portfolio size and asset count — you do not have real-time deal velocity or licensing activity data. Be transparent in one brief clause ("going by portfolio size…" or "by asset count, the leaders are…") so the user knows what the ranking reflects. If they want deal activity, suggest checking individual TTO websites or BD databases directly.

## Format example
✗ Weak:
1. **Asset Name** (Institution)
   - Modality: Small molecule
   - Stage: Preclinical
   - Innovation: The compound works by inhibiting...

✓ Strong:
**Asset Name** (Institution) — A first-in-class PROTAC targeting [protein] with demonstrated degradation in primary patient samples, at a stage where the key next step is selectivity profiling before IND filing.`;

function buildSystemPrompt(
  userContext?: UserContext,
  portfolioStats?: PortfolioStats,
  focusContext?: SessionFocusContext,
  engagementSignals?: EngagementSignals
): string {
  const parts: string[] = [BASE_SYSTEM_PROMPT];

  if (portfolioStats && portfolioStats.total > 0) {
    parts.push(buildPortfolioStatsBlock(portfolioStats));
  }

  parts.push(INDUSTRY_INTELLIGENCE_BLOCK);

  if (userContext) {
    const contextBlock = buildUserContextBlock(userContext);
    if (contextBlock) parts.push(contextBlock);
  }

  if (focusContext) {
    const focusBlock = buildFocusContextBlock(focusContext);
    if (focusBlock) parts.push(focusBlock);
  }

  if (engagementSignals) {
    const engBlock = buildEngagementBlock(engagementSignals);
    if (engBlock) parts.push(engBlock);
  }

  return parts.join("\n\n");
}

export async function* ragQuery(
  question: string,
  assets: RetrievedAsset[],
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }> = [],
  userContext?: UserContext,
  portfolioStats?: PortfolioStats,
  focusContext?: SessionFocusContext,
  engagementSignals?: EngagementSignals,
  signal?: AbortSignal,
  model = EDEN_RAG_MODEL
): AsyncGenerator<string> {
  const context = buildContext(assets);
  const systemPrompt = buildSystemPrompt(userContext, portfolioStats, focusContext, engagementSignals);

  const messages: Array<{ role: "user" | "assistant" | "system"; content: string }> = [
    { role: "system", content: systemPrompt },
    ...conversationHistory.slice(-6),
    {
      role: "user",
      content: assets.length > 0
        ? `Based on the following retrieved TTO assets, answer the question.\n\nRETRIEVED ASSETS:\n${context}\n\nQUESTION: ${question}`
        : `NO EXACT MATCH: The vector search returned no assets for this specific query — the phrasing may be too narrow or use terminology the corpus doesn't index under.\n\nCRITICAL: Do NOT confirm that "nothing exists" in this area. The TTO corpus is large and indexes hundreds of institutions; a zero result means the query phrasing didn't match, not that the science doesn't exist. Do NOT invent or fabricate any specific asset names, institution names, or technology descriptions.\n\nInstead: (1) Acknowledge the search didn't surface an exact match, (2) Suggest 2-3 broader or adjacent terms the user should try — e.g. if they asked about "pediatric oncology" suggest trying "oncology", "leukemia", "neuroblastoma", or "childhood cancer"; (3) Note that TTO portfolios at major research institutions typically cover this space. End with a specific alternative search suggestion.\n\nQUESTION: ${question}`,
    },
  ];

  const stream = await client.chat.completions.create({
    model,
    messages,
    stream: true,
    temperature: 0.5,
    max_tokens: model === "gpt-4o-mini" ? 500 : 900,
  }, { signal });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) yield delta;
  }
}

export async function* directQuery(
  question: string,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }> = [],
  userContext?: UserContext,
  portfolioStats?: PortfolioStats,
  focusContext?: SessionFocusContext,
  signal?: AbortSignal
): AsyncGenerator<string> {
  const systemPrompt = buildSystemPrompt(userContext, portfolioStats, focusContext);

  const messages: Array<{ role: "user" | "assistant" | "system"; content: string }> = [
    { role: "system", content: systemPrompt },
    ...conversationHistory.slice(-6),
    { role: "user", content: question },
  ];

  const stream = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
    stream: true,
    temperature: 0.7,
    max_tokens: 450,
  }, { signal });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) yield delta;
  }
}

// ── Aggregation query with conversational formatting ──────────────────────
export async function* aggregationQuery(
  question: string,
  queryResult: string,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }> = [],
  userContext?: UserContext,
  portfolioStats?: PortfolioStats,
  focusContext?: SessionFocusContext,
  signal?: AbortSignal
): AsyncGenerator<string> {
  const systemPrompt = buildSystemPrompt(userContext, portfolioStats, focusContext);

  const messages: Array<{ role: "user" | "assistant" | "system"; content: string }> = [
    { role: "system", content: systemPrompt },
    ...conversationHistory.slice(-6),
    {
      role: "user",
      content: (() => {
        const isWhitespace = /white.?space|gap|under.?represent|missing|thin coverage|not enough|where.*lacking|what.*missing|under.?serv|blind spot/i.test(question);
        const instruction = isWhitespace
          ? "Cross-reference this data against your industry intelligence. Name 2–3 therapeutic areas or modalities that are thin in the corpus but commercially active right now — be specific and direct. This is a white space question, not a summary request. Offer a follow-up."
          : "Present the above data conversationally in 2-4 sentences. Be specific with numbers. Offer a follow-up.";
        return `QUERY RESULT:\n${queryResult}\n\nUSER QUESTION: ${question}\n\n${instruction}`;
      })(),
    },
  ];

  const stream = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
    stream: true,
    temperature: 0.4,
    max_tokens: 300,
  }, { signal });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) yield delta;
  }
}

// ── Comparative query detection ───────────────────────────────────────────
//
// Matches head-to-head comparison intent:
//   "compare X to Y", "X vs Y", "contrast these", "how do they differ"
//   "which of these is better", "differences between", "side by side"
//
// Deliberately broad — entity resolution in the route handler decides whether
// sufficient prior assets exist; if not, the route falls through to RAG.
export function isComparativeQuery(text: string): boolean {
  const COMPARATIVE_PATTERNS = [
    /\bcompare\b/i,
    /\bvs\.?\b|\bversus\b/i,
    /\bcontrast\b/i,
    /\bhow\s+do\s+(?:these|they|the\s+two)\s+(?:differ|compare|stack\s+up|differ\s+from\s+each\s+other)\b/i,
    /\bwhich\s+(?:of\s+(?:these|them|the\s+two)|would\s+you|is\s+(?:better|stronger|more\s+interesting|preferred|more\s+attractive))\b/i,
    /\bdifferences?\s+between\b/i,
    /\bhead[\s-]to[\s-]head\b/i,
    /\bside[\s-]by[\s-]side\b/i,
    /\bstack\s+(?:them|these|it)\s+up\b/i,
  ];
  return COMPARATIVE_PATTERNS.some((rx) => rx.test(text));
}

// ── Comparative / head-to-head query (streaming) ──────────────────────────
//
// Produces a structured BD comparison across MoA, stage, IP, innovation claim,
// unmet need, comparables, and EDEN's professional take.
// Expects 2–3 fully resolved RetrievedAsset objects.
export async function* compareQuery(
  question: string,
  assets: RetrievedAsset[],
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }> = [],
  userContext?: UserContext,
  portfolioStats?: PortfolioStats,
  focusContext?: SessionFocusContext,
  signal?: AbortSignal
): AsyncGenerator<string> {
  const systemPrompt = buildSystemPrompt(userContext, portfolioStats, focusContext);

  const assetBlock = assets
    .map((a, i) => {
      const lines = [
        `[Asset ${i + 1}] ${a.assetName} (${a.institution})`,
        a.mechanismOfAction ? `  MoA: ${a.mechanismOfAction}` : null,
        `  Target: ${a.target} | Modality: ${a.modality}`,
        `  Stage: ${a.developmentStage}`,
        a.ipType ? `  IP type: ${a.ipType}` : null,
        a.innovationClaim ? `  Innovation claim: ${a.innovationClaim}` : null,
        `  Indication: ${a.indication}`,
        a.unmetNeed ? `  Unmet need: ${a.unmetNeed}` : null,
        a.comparableDrugs ? `  Comparable drugs / competitive context: ${a.comparableDrugs}` : null,
        a.licensingReadiness ? `  Licensing readiness: ${a.licensingReadiness}` : null,
        a.summary ? `  Summary: ${a.summary.slice(0, 450)}` : null,
      ]
        .filter(Boolean)
        .join("\n");
      return lines;
    })
    .join("\n\n");

  const assetNames = assets.map((a, i) => `Asset ${i + 1}: ${a.assetName.slice(0, 40)}`);

  const comparePrompt = `You are doing a head-to-head BD comparison of ${assets.length} TTO assets for a pharma/biotech business development professional.

ASSETS TO COMPARE:
${assetBlock}

USER QUESTION: ${question}

RESPONSE FORMAT — two parts, in order:

**Part 1: Comparison table**
Output a markdown table with a row per dimension and a column per asset. Use exactly this structure:

| Dimension | ${assetNames.join(" | ")} |
|---|${assets.map(() => "---").join("|")}|
| Modality | ... |
| Stage | ... |
| IP type | ... |
| Target / MoA | ... |
| Indication | ... |
| Innovation claim | ... |
| Unmet need | ... |
| Competitive context | ... |

Keep each cell concise — one short phrase or sentence. Use "N/A" when data is unavailable. Do NOT add narrative inside the table cells.

**Part 2: EDEN take**
After the table, write 3–4 sentences of direct professional opinion: which asset is more commercially compelling at this stage and why. Name specific tradeoffs. Avoid false balance — if one is clearly stronger, say so. Close with one genuinely useful follow-up question.`;

  const messages: Array<{ role: "user" | "assistant" | "system"; content: string }> = [
    { role: "system", content: systemPrompt },
    ...conversationHistory.slice(-4),
    { role: "user", content: comparePrompt },
  ];

  const stream = await client.chat.completions.create({
    model: "gpt-4o",
    messages,
    stream: true,
    temperature: 0.5,
    max_tokens: 1200,
  }, { signal });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) yield delta;
  }
}

// ── Pipeline synthesis query ────────────────────────────────────────────────
// Cross-cutting analysis of a user's entire saved pipeline. Accepts SavedAsset-
// shaped objects (no embedding needed — uses stored summaries + metadata).
export type SynthesisSnapshot = {
  ts: string;
  totalCount: number;
  statusGroups: Record<string, number>;
};

export type PipelineSavedAsset = {
  assetName: string; modality: string; developmentStage: string;
  diseaseIndication: string; status?: string | null; summary?: string;
  pipelineListName?: string;
};

export async function* synthesisQuery(
  question: string,
  assets: PipelineSavedAsset[],
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }> = [],
  userContext?: UserContext,
  portfolioStats?: PortfolioStats,
  focusContext?: SessionFocusContext,
  priorSnapshot?: SynthesisSnapshot | null,
  signal?: AbortSignal
): AsyncGenerator<string> {
  const systemPrompt = buildSystemPrompt(userContext, portfolioStats, focusContext);

  const byStatus: Record<string, PipelineSavedAsset[]> = {};
  for (const a of assets) {
    const key = a.status ?? "unsorted";
    (byStatus[key] = byStatus[key] ?? []).push(a);
  }
  const statusOrder = ["in_discussion", "evaluating", "watching", "on_hold", "passed", "unsorted"];
  const statusLabel: Record<string, string> = {
    in_discussion: "In Discussion", evaluating: "Evaluating",
    watching: "Watching", on_hold: "On Hold", passed: "Passed", unsorted: "Unsorted",
  };

  let deltaBlock = "";
  if (priorSnapshot) {
    const daysSince = Math.round((Date.now() - new Date(priorSnapshot.ts).getTime()) / (1000 * 60 * 60 * 24));
    if (daysSince <= 60) {
      const delta = assets.length - priorSnapshot.totalCount;
      const changes: string[] = [];
      for (const [st, group] of Object.entries(byStatus)) {
        const prev = priorSnapshot.statusGroups[st] ?? 0;
        const diff = group.length - prev;
        if (diff !== 0) changes.push(`${statusLabel[st] ?? st}: ${diff > 0 ? `+${diff}` : diff}`);
      }
      deltaBlock = `\n\nDELTA SINCE LAST ANALYSIS (${daysSince} day${daysSince !== 1 ? "s" : ""} ago): total ${delta >= 0 ? `+${delta}` : delta} assets${changes.length ? `; ${changes.join("; ")}` : ""}`;
    }
  }

  const assetBlock = statusOrder
    .filter((s) => byStatus[s]?.length)
    .map((s) => {
      const label = statusLabel[s] ?? s;
      const items = byStatus[s].map((a) =>
        `  • ${a.assetName} | ${a.modality} | ${a.developmentStage} | ${a.diseaseIndication}${a.pipelineListName ? ` | List: ${a.pipelineListName}` : ""}${a.summary ? `\n    ${a.summary.slice(0, 200)}` : ""}`
      ).join("\n");
      return `${label} (${byStatus[s].length}):\n${items}`;
    })
    .join("\n\n");

  const synthesisPrompt = `You are reviewing the user's full saved pipeline for a BD intelligence briefing. These are all the assets they've bookmarked — not search results.

SAVED PIPELINE (${assets.length} assets total):
${assetBlock}${deltaBlock}

USER QUESTION: ${question}

Write a concise pipeline analysis covering:
1. **Portfolio composition** — modality and indication concentration, stage distribution
2. **Active deal opportunities** — what's in discussion or evaluation and why it stands out
3. **Gaps and risks** — notable concentration risks, underrepresented areas, or coverage gaps
4. **Recommended next actions** — 2–3 specific follow-up suggestions based on what you see

Be direct and specific. Name real patterns. This is a briefing, not a description — give opinions where the data supports them. Under 350 words.`;

  const messages: Array<{ role: "user" | "assistant" | "system"; content: string }> = [
    { role: "system", content: systemPrompt },
    ...conversationHistory.slice(-4),
    { role: "user", content: synthesisPrompt },
  ];

  const stream = await client.chat.completions.create({
    model: "gpt-4o",
    messages,
    stream: true,
    temperature: 0.4,
    max_tokens: 1400,
  }, { signal });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) yield delta;
  }
}

// ── Document generation query ────────────────────────────────────────────────
// Produces a structured deliverable (diligence checklist, memo, term sheet
// outline) for a specific asset. One gpt-4o call; higher token budget.
export type DocumentType = "checklist" | "memo" | "term_sheet" | "brief";

export async function* documentQuery(
  docType: DocumentType,
  asset: RetrievedAsset,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }> = [],
  userContext?: UserContext,
  portfolioStats?: PortfolioStats,
  focusContext?: SessionFocusContext,
  signal?: AbortSignal
): AsyncGenerator<string> {
  const systemPrompt = buildSystemPrompt(userContext, portfolioStats, focusContext);

  const assetBlock = [
    `Asset: ${asset.assetName} (${asset.institution})`,
    asset.modality ? `Modality: ${asset.modality}` : null,
    asset.developmentStage ? `Stage: ${asset.developmentStage}` : null,
    asset.indication ? `Indication: ${asset.indication}` : null,
    asset.target ? `Target: ${asset.target}` : null,
    asset.mechanismOfAction ? `MoA: ${asset.mechanismOfAction}` : null,
    asset.ipType ? `IP type: ${asset.ipType}` : null,
    asset.innovationClaim ? `Innovation claim: ${asset.innovationClaim}` : null,
    asset.unmetNeed ? `Unmet need: ${asset.unmetNeed}` : null,
    asset.comparableDrugs ? `Comparable drugs: ${asset.comparableDrugs}` : null,
    asset.licensingReadiness ? `Licensing readiness: ${asset.licensingReadiness}` : null,
    asset.summary ? `Summary: ${asset.summary.slice(0, 600)}` : null,
  ].filter(Boolean).join("\n");

  const docPrompts: Record<DocumentType, string> = {
    checklist: `Generate a diligence checklist for this TTO asset. Produce a markdown checklist with sections: IP & Patent Review | Scientific Validity | Clinical Translatability | Regulatory Path | Commercial Opportunity | Deal Structure Considerations. For each item, note what to look for specific to this asset's profile. Be concrete — a generic checklist is useless.`,
    memo: `Write a one-page investment/licensing memo for this TTO asset. Structure: Opportunity Overview | Scientific Rationale | Competitive Positioning | Risk Factors | Deal Thesis. Keep each section to 2–3 sentences. Write as a senior BD analyst would — direct opinion, not neutral description.`,
    term_sheet: `Draft a term sheet outline for licensing this TTO asset. Include: License type (exclusive/non-exclusive/field-of-use), Upfront fee range, Milestone structure (IND, Phase 1, Phase 2, approval), Royalty rate range, Diligence obligations, Sublicensing rights, IP ownership. Base ranges on the asset's stage and modality using standard TTO benchmarks.`,
    brief: `Write a 150-word executive brief for this asset suitable for a BD leadership team. Lead with the single most compelling thing about it. Include stage, modality, indication, what makes it differentiated, and why it's worth evaluating now. No bullet points — flowing prose.`,
  };

  const prompt = `ASSET DATA:\n${assetBlock}\n\nTASK: ${docPrompts[docType]}`;

  const messages: Array<{ role: "user" | "assistant" | "system"; content: string }> = [
    { role: "system", content: systemPrompt },
    ...conversationHistory.slice(-2),
    { role: "user", content: prompt },
  ];

  const stream = await client.chat.completions.create({
    model: "gpt-4o",
    messages,
    stream: true,
    temperature: 0.3,
    max_tokens: 1500,
  }, { signal });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) yield delta;
  }
}

// ── Session summarization (turn 8+) ──────────────────────────────────────
// Compresses older turns into a 200-token context note, keeping last 4 turns
// fresh. Called async after the assistant message is persisted.
export async function summarizeSession(
  messages: Array<{ role: "user" | "assistant"; content: string }>
): Promise<string> {
  const toSummarize = messages.slice(0, -4);
  if (toSummarize.length < 4) return "";
  const transcript = toSummarize
    .map((m) => `${m.role === "user" ? "User" : "EDEN"}: ${m.content.slice(0, 300)}`)
    .join("\n");
  try {
    const resp = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Summarize this biotech BD research conversation. Extract: assets discussed (names + institutions), therapy areas or modalities explored, any active filters the user set, key decisions made. Output 3-5 concise bullet points.",
        },
        { role: "user", content: transcript },
      ],
      temperature: 0.3,
      max_tokens: 200,
    });
    return resp.choices[0]?.message?.content ?? "";
  } catch {
    return "";
  }
}

// ── Concept / definitional query ──────────────────────────────────────────
export async function* conceptQuery(
  question: string,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }> = [],
  userContext?: UserContext,
  portfolioStats?: PortfolioStats,
  focusContext?: SessionFocusContext,
  signal?: AbortSignal
): AsyncGenerator<string> {
  const systemPrompt = buildSystemPrompt(userContext, portfolioStats, focusContext);

  const messages: Array<{ role: "user" | "assistant" | "system"; content: string }> = [
    { role: "system", content: systemPrompt },
    ...conversationHistory.slice(-6),
    {
      role: "user",
      content: `Please explain this concept clearly and concisely for a pharma/biotech BD professional (3-5 sentences). Tie it to TTO licensing context where relevant. Do not list specific assets from the portfolio. Question: ${question}`,
    },
  ];

  const conceptStream = await client.chat.completions.create({
    model: "gpt-4o",
    messages,
    stream: true,
    temperature: 0.4,
    max_tokens: 500,
  }, { signal });

  for await (const chunk of conceptStream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) yield delta;
  }
}
