import OpenAI from "openai";
import type { RetrievedAsset } from "../../storage";
import { db } from "../../db";
import { ingestedAssets, therapyAreaTaxonomy, edenSessions } from "../../../shared/schema";
import { sql, desc, eq } from "drizzle-orm";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const EMBED_MODEL = "text-embedding-3-small";

export { type RetrievedAsset };

export type UserContext = {
  companyName?: string;
  companyType?: string;
  therapeuticAreas?: string[];
  dealStages?: string[];
  modalities?: string[];
};

// ── Structured filter types ───────────────────────────────────────────────

export type GeoKey = "us" | "eu" | "uk" | "asia";

export type QueryFilters = {
  modality?: string;
  geography?: GeoKey;
  stage?: string;
  indication?: string;
  institution?: string;
};

export type SessionFocusContext = {
  modality?: string;
  geography?: GeoKey;
  stage?: string;
  indication?: string;
  institution?: string;
};

// In-session engagement signals: tracks which modalities/indications the user
// has engaged with across turns (frequency-weighted, resets on explicit clear).
export type EngagementSignals = {
  modalities: Record<string, number>;   // canonical modality → frequency count
  indications: Record<string, number>;  // indication keyword → frequency count
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
  "cell therapy": "Cell Therapy",
  "car-t": "CAR-T",
  "car t": "CAR-T",
  "small molecule": "Small Molecule",
  "antibody": "Antibody",
  "monoclonal antibody": "Antibody",
  "mrna": "mRNA",
  "rna therapeutics": "RNA Therapeutics",
  "sirna": "siRNA",
  "antisense": "Antisense",
  "protac": "PROTAC",
  "adc": "ADC",
  "antibody-drug conjugate": "ADC",
  "bispecific": "Bispecific Antibody",
  "vaccine": "Vaccine",
  "peptide": "Peptide",
  "nanoparticle": "Nanoparticle",
  "protein therapy": "Protein/Biologics",
  "protein replacement": "Protein/Biologics",
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
  { pattern: /\bokford\b|\boxford\b/i, name: "oxford" },
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
export function detectAllInstitutionNames(query: string, portfolioInstitutions?: string[]): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  // Pass 1: pattern-based (each match recorded by canonical name)
  for (const { pattern, name } of INSTITUTION_PATTERNS) {
    if (pattern.test(query) && !seen.has(name)) {
      found.push(name);
      seen.add(name);
    }
  }
  // Pass 2: portfolio institution substring scan (respects length >= 4 guard)
  if (portfolioInstitutions?.length) {
    const lowerQuery = query.toLowerCase();
    for (const inst of portfolioInstitutions) {
      if (!inst || inst.length < 4) continue;
      const key = inst.toLowerCase();
      if (lowerQuery.includes(key) && !seen.has(key)) {
        found.push(inst);
        seen.add(key);
      }
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

export const GEO_INSTITUTION_REGEX: Record<GeoKey, string> = {
  us: "Stanford|MIT|Harvard|Yale|Princeton|Columbia|UCLA|UCSF|Duke|Cornell|Michigan|Washington University|Johns Hopkins|Vanderbilt|Emory|NYU|Northwestern|Penn State|UNC|Pittsburgh|Mayo|NIH|MD Anderson|Memorial Sloan|Carnegie Mellon|Georgia Tech|Purdue|Minnesota|Colorado|Florida|Illinois|USC|Rockefeller|Salk|Scripps|Caltech|UC Berkeley|UC San|WUSTL|Baylor|Tufts|Brown|Dartmouth|Georgetown|Cincinnati|Utah|Arizona|Nebraska|Virginia|UC Davis|UC Irvine|Case Western|Icahn|Sinai|Weill Cornell|Wake Forest|Texas A|Notre Dame|Rice University|Tulane|Oregon Health",
  uk: "Oxford|Cambridge|Imperial College|University College London|UCL|King.s College|Edinburgh|Manchester|Glasgow|Bristol|Wellcome|Sanger|Francis Crick|Babraham|Sheffield|Leeds|Newcastle|Liverpool|Exeter|Bath|Surrey|Dundee|Nottingham|Birmingham|Cardiff|Aberdeen|Queen Mary|Royal College|Barts|Guy.s|St Thomas",
  eu: "ETH Zurich|EPFL|Karolinska|LMU Munich|Technical University Munich|TU Munich|Heidelberg|Max Planck|Charité|KU Leuven|Ghent|Erasmus|University of Amsterdam|Utrecht|Leiden|Copenhagen|Aarhus|Stockholm|Uppsala|Paris|Sorbonne|Pasteur|CNRS|INSERM|Bologna|Milan|Rome|Padova|Madrid|Barcelona|Valencia|Vienna|Zurich|Basel|Bern|Lausanne|Maastricht|Lund|Gothenburg|Helsinki|Oslo|Bergen|Groningen|Bonn|Frankfurt|Hamburg|Berlin|Dresden|Leipzig|Freiburg|Tübingen",
  asia: "University of Tokyo|Kyoto|Osaka|Keio|RIKEN|Seoul National|KAIST|Tsinghua|Peking|Fudan|National University of Singapore|NUS|University of Hong Kong|Hong Kong|Chinese University|Yonsei|Monash|Melbourne|Sydney|Queensland|Auckland",
};

const STAGE_DETECT: Array<[RegExp, string]> = [
  [/\bpreclinical\b|pre-clinical\b/i, "preclinical"],
  [/\bphase\s*1\b|phase\s*i\b/i, "phase 1"],
  [/\bphase\s*2\b|phase\s*ii\b/i, "phase 2"],
  [/\bphase\s*3\b|phase\s*iii\b/i, "phase 3"],
  [/\bind-enabling\b|ind enabling\b/i, "IND-enabling"],
  [/\bdiscovery\b/i, "discovery"],
  [/\bclinical\b/i, "clinical"],
  [/\bapproved\b/i, "approved"],
];

const INDICATION_KEYWORDS = [
  "oncology", "cancer", "tumor", "tumour", "leukemia", "lymphoma", "glioblastoma",
  "neurology", "neurodegenerative", "alzheimer", "parkinson", "als", "huntington", "neurological",
  "rare disease", "orphan disease", "genetic disorder", "monogenic",
  "autoimmune", "inflammation", "inflammatory", "rheumatoid", "lupus", "crohn",
  "metabolic", "obesity", "diabetes", "mash", "nash", "fatty liver",
  "cardiovascular", "cardiac", "heart failure", "stroke", "atherosclerosis",
  "infectious disease", "hiv", "covid", "tuberculosis", "malaria", "antimicrobial",
  "respiratory", "asthma", "copd", "pulmonary",
  "ophthalmic", "ocular", "retinal", "macular",
  "dermatology", "skin", "fibrosis", "psoriasis",
  "musculoskeletal", "bone", "muscle dystrophy",
  "renal", "kidney", "liver disease",
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

  return filters;
}

export function hasMeaningfulFilters(filters: QueryFilters): boolean {
  return !!(filters.modality || filters.geography || filters.stage || filters.indication || filters.institution);
}

// ── Session focus management ──────────────────────────────────────────────

const PURE_RESET_PATTERNS = [
  /\b(?:start fresh|start over|reset|clear filters?|new search|forget that|remove filter|show everything|all assets?|no filter|broaden)\b/i,
  /\b(?:never ?mind|ignore (?:that|the filter))\b/i,
];

const PIVOT_PATTERNS = [
  /\b(?:actually|scratch that|let'?s try something different|instead let'?s)\b/i,
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
    || /\b(?:from|in|at|by)\s+(?:\w+\s+)?(?:institutions?|universities|europe|european|us|american|uk|british|asian)\b/i.test(message);
  if (!hasExplicitIntent && Object.keys(current).length > 0) return current; // keep existing focus for info queries
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
  const signals: EngagementSignals = { modalities: {}, indications: {} };

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
  if (!parts.length) return "";
  return `## Active session focus\n${parts.join(" | ")}\n\nWhen answering, naturally acknowledge the active filters. If the user asks a count question, use the filtered count, not the global total.`;
}

// ── Portfolio stats cache (10-minute TTL) ────────────────────────────────────

export type PortfolioStats = {
  total: number;
  byModality: { modality: string; count: number }[];
  byStage: { stage: string; count: number }[];
  byTherapyArea: { area: string; count: number }[];
  topInstitutions: { institution: string; count: number }[];
  lastFetched: number;
};

let _statsCache: PortfolioStats | null = null;
const STATS_TTL_MS = 10 * 60 * 1000;

export async function fetchPortfolioStats(): Promise<PortfolioStats> {
  if (_statsCache && Date.now() - _statsCache.lastFetched < STATS_TTL_MS) {
    return _statsCache;
  }

  const [totalRows, allTotalRows, modalityRows, stageRows, institutionRows, therapyAreaRows] = await Promise.all([
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

  _statsCache = {
    total,
    byModality,
    byStage,
    byTherapyArea,
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

  return `## Your portfolio — live numbers you know cold
Total relevant assets indexed: **${stats.total.toLocaleString()}**
By modality: ${modalityLines}
By development stage: ${stageLines}
Top 15 institutions by asset count: ${topInst}${therapyAreaLines ? `\nTop therapy areas: ${therapyAreaLines}` : ""}

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
const COMBINED_SEARCH_INTENT = /\b(?:do\s+you\s+have|find\s+me|show\s+me|any\s+(?:assets?|examples?|technologies?)|in\s+your\s+(?:portfolio|database|index))\b/i;

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
  /\bwhat\s+about\s+(?:the\s+)?(?:first|second|third|1st|2nd|3rd)\s+(?:one|asset)?\b/i,
  /\bgo\s+(?:deeper|further)\s+on\s+(?:that|this|it)\b/i,
  // Institution-qualified back-references (anaphora with institution name)
  /\bthe\s+one\s+from\s+\w/i,
  /\bthat\s+one\s+from\s+\w/i,
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

// Build a SQL AND-fragment from session filters (does NOT include `relevant = true`).
// Returns undefined when no filters are active (no extra WHERE clause needed).
function buildExtraSQL(filters: QueryFilters, geoRx?: string): ExtraSQL | undefined {
  const parts: ExtraSQL[] = [];
  if (geoRx) parts.push(sql`institution ~* ${geoRx}`);
  if (filters.modality) parts.push(sql`modality ILIKE ${`%${filters.modality}%`}`);
  if (filters.stage) parts.push(sql`development_stage ILIKE ${`%${filters.stage}%`}`);
  if (filters.indication) parts.push(sql`indication ILIKE ${`%${filters.indication}%`}`);
  if (filters.institution) parts.push(sql`institution ILIKE ${`%${filters.institution}%`}`);
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
    const result = await runCountForInstitution(instHint, isGeneric ? undefined : areaRaw, extra);
    if (result) {
      const label = isGeneric ? "" : `${areaRaw} `;
      return `**${result.name}** has **${result.count} ${label}assets** in the indexed portfolio${focusLabel ? " " + focusLabel.trim() : ""}.`;
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
  "target", "mechanism", "moa", "modality", "antibody", "therapeutic", "biologic",
  "gene", "protein", "receptor", "kinase", "inhibitor", "agonist", "antagonist",
  "drug", "compound", "molecule", "rna", "dna", "mrna", "sirna", "crispr",
  "oncology", "cancer", "tumor", "tumour", "indication", "disease", "preclinical",
  "clinical", "trial", "fda", "license", "licensing", "patent", "asset",
  "portfolio", "pipeline", "stage", "biotech", "biopharma", "pharma",
  "institution", "university", "research", "vaccine", "immunotherapy",
  "stem cell", "diagnostic", "assay", "platform", "tto", "tech transfer", "technology",
  "how many", "gpl", "glp", "cnc", "cns", "hiv", "covid", "autoimmune",
  "inflammation", "cardiac", "neuro", "stanford", "mit", "harvard", "columbia",
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
  return !BIOTECH_SIGNALS.some((kw) => {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    return new RegExp(`(?<![a-z])${escaped}(?![a-z])`, "i").test(lower);
  });
}

// ─────────────────────────────────────────────────────────────────────────
export async function embedQuery(query: string): Promise<number[]> {
  const response = await client.embeddings.create({
    model: EMBED_MODEL,
    input: query.slice(0, 8000),
  });
  return response.data[0].embedding;
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
        a.mechanismOfAction ? `  Mechanism: ${a.mechanismOfAction}` : null,
        a.innovationClaim ? `  Innovation: ${a.innovationClaim}` : null,
        `  Target: ${a.target} | Modality: ${a.modality}`,
        `  Indication: ${a.indication} | Stage: ${a.developmentStage}`,
        a.unmetNeed ? `  Unmet need: ${a.unmetNeed}` : null,
        a.comparableDrugs ? `  Comparable drugs: ${a.comparableDrugs}` : null,
        a.licensingReadiness ? `  Licensing readiness: ${a.licensingReadiness}` : null,
        a.ipType ? `  IP type: ${a.ipType}` : null,
        a.summary ? `  Summary: ${a.summary.slice(0, 500)}` : null,
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
// Only applied when assets.length > LIMIT so top-N selection is meaningful.
export function rerankAssets(
  assets: RetrievedAsset[],
  userContext?: UserContext,
  engagementSignals?: EngagementSignals
): RetrievedAsset[] {
  const LIMIT = 8;

  const preferredModalities = (userContext?.modalities ?? []).map((m) => m.toLowerCase());
  const preferredAreas = (userContext?.therapeuticAreas ?? []).map((a) => a.toLowerCase());

  const engagedModalities = Object.entries(engagementSignals?.modalities ?? {}).map(
    ([m, count]) => ({ key: m.toLowerCase(), count })
  );
  const engagedIndications = Object.entries(engagementSignals?.indications ?? {}).map(
    ([ind, count]) => ({ key: ind.toLowerCase(), count })
  );

  // Short-circuit: when candidates fit within the limit, ordering is irrelevant;
  // skip scoring to preserve existing top-N semantic-similarity ordering.
  if (assets.length <= LIMIT) return assets.slice(0, LIMIT);

  const hasProfileBoosts = preferredModalities.length > 0 || preferredAreas.length > 0;
  const hasEngagementBoosts = engagedModalities.length > 0 || engagedIndications.length > 0;

  if (!hasProfileBoosts && !hasEngagementBoosts) return assets.slice(0, LIMIT);

  const scored = assets.map((a) => {
    let boost = 0;

    // Tier 1: static user-profile boost
    if (a.modality && a.modality !== "unknown") {
      const m = a.modality.toLowerCase();
      if (preferredModalities.some((pm) => m.includes(pm) || pm.includes(m))) boost += 3;
    }
    if (a.indication && a.indication !== "unknown") {
      const ind = a.indication.toLowerCase();
      if (preferredAreas.some((pa) => ind.includes(pa) || pa.includes(ind))) boost += 2;
    }

    // Tier 2: adaptive in-session engagement boost (smaller, capped)
    if (a.modality && a.modality !== "unknown") {
      const m = a.modality.toLowerCase();
      const match = engagedModalities.find((em) => m.includes(em.key) || em.key.includes(m));
      if (match) boost += Math.min(2, match.count);
    }
    if (a.indication && a.indication !== "unknown") {
      const ind = a.indication.toLowerCase();
      const match = engagedIndications.find((ei) => ind.includes(ei.key) || ei.key.includes(ind));
      if (match) boost += Math.min(1, match.count);
    }

    return { asset: a, boost };
  });

  scored.sort((a, b) => b.boost - a.boost);
  return scored.slice(0, LIMIT).map((s) => s.asset);
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
- For research queries, present a maximum of 3 assets per response even if more were retrieved. Lead with the most commercially interesting one. Each asset gets one compelling hook sentence — not a field dump. Vary your opening style each response.
- For count or portfolio questions, use your live portfolio numbers (provided below) rather than counting from retrieved assets. If the exact breakdown isn't in your stats, say so honestly.
- You ask one smart follow-up when the query is genuinely ambiguous. Never several at once.
- Never fabricate data. If the retrieved context doesn't cover something, say so and offer to look from a different angle.
- Do NOT include a Sources section — asset cards are displayed separately in the interface.

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
  focusContext?: SessionFocusContext
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

  return parts.join("\n\n");
}

export async function* ragQuery(
  question: string,
  assets: RetrievedAsset[],
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }> = [],
  userContext?: UserContext,
  portfolioStats?: PortfolioStats,
  focusContext?: SessionFocusContext
): AsyncGenerator<string> {
  const context = buildContext(assets);
  const systemPrompt = buildSystemPrompt(userContext, portfolioStats, focusContext);

  const messages: Array<{ role: "user" | "assistant" | "system"; content: string }> = [
    { role: "system", content: systemPrompt },
    ...conversationHistory.slice(-6),
    {
      role: "user",
      content: assets.length > 0
        ? `Based on the following retrieved TTO assets, answer the question.\n\nRETRIEVED ASSETS:\n${context}\n\nQUESTION: ${question}`
        : question,
    },
  ];

  const stream = await client.chat.completions.create({
    model: "gpt-4o",
    messages,
    stream: true,
    temperature: 0.5,
    max_tokens: 900,
  });

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
  focusContext?: SessionFocusContext
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
    max_tokens: 280,
  });

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
  focusContext?: SessionFocusContext
): AsyncGenerator<string> {
  const systemPrompt = buildSystemPrompt(userContext, portfolioStats, focusContext);

  const messages: Array<{ role: "user" | "assistant" | "system"; content: string }> = [
    { role: "system", content: systemPrompt },
    ...conversationHistory.slice(-6),
    {
      role: "user",
      content: `QUERY RESULT:\n${queryResult}\n\nUSER QUESTION: ${question}\n\nPresent the above data conversationally in 2-4 sentences. Be specific with numbers. Offer a follow-up.`,
    },
  ];

  const stream = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
    stream: true,
    temperature: 0.4,
    max_tokens: 300,
  });

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
  focusContext?: SessionFocusContext
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

  const comparePrompt = `You are doing a head-to-head BD comparison of ${assets.length} TTO assets for a pharma/biotech business development professional. Write a structured but conversational assessment — like a knowledgeable colleague sharing their genuine take.

ASSETS TO COMPARE:
${assetBlock}

USER QUESTION: ${question}

Structure your comparison across these dimensions (use bold headers for each):
- **Mechanism / Modality** — how do the mechanisms and modalities differ, and what does that mean for development risk?
- **Development stage** — where are they relative to each other, and which is closer to de-risked?
- **IP position** — what does the IP picture look like for each?
- **Innovation claim** — which has the more differentiated scientific claim?
- **Unmet need and commercial fit** — which addresses a more commercially compelling gap?
- **Competitive context** — what does the landscape look like for each based on comparable drugs or prior art?
- **EDEN take** — your direct, honest professional view on which is more commercially interesting at this stage and why

Be specific using the data provided. Name real tradeoffs. Avoid false balance — if one is clearly stronger on a dimension, say so. Close with one genuinely useful follow-up question.`;

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
  });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) yield delta;
  }
}

// ── Concept / definitional query ──────────────────────────────────────────
export async function* conceptQuery(
  question: string,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }> = [],
  userContext?: UserContext,
  portfolioStats?: PortfolioStats,
  focusContext?: SessionFocusContext
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
    model: "gpt-4o-mini",
    messages,
    stream: true,
    temperature: 0.4,
    max_tokens: 400,
  });

  for await (const chunk of conceptStream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) yield delta;
  }
}
