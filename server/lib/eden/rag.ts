import OpenAI from "openai";
import type { RetrievedAsset } from "../../storage";
import { db } from "../../db";
import { ingestedAssets, therapyAreaTaxonomy } from "../../../shared/schema";
import { sql, desc } from "drizzle-orm";

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

// In-memory session focus store (ephemeral — fine for this use case)
const _sessionFocusMap = new Map<string, SessionFocusContext>();

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

const RESET_PATTERNS = [
  /\b(?:start fresh|start over|reset|clear filters?|new search|forget(?: that)?|remove filter|broaden|show everything|all assets?|no filter)\b/i,
  /\b(?:scratch that|never ?mind|actually let'?s|let'?s try something different)\b/i,
];

function shouldResetFocus(message: string): boolean {
  return RESET_PATTERNS.some((r) => r.test(message));
}

function extractFocusUpdates(message: string, current: SessionFocusContext): SessionFocusContext {
  if (shouldResetFocus(message)) return {};

  const updated = { ...current };

  const modality = detectModality(message);
  if (modality) updated.modality = modality;

  const geography = detectGeography(message);
  if (geography) updated.geography = geography;

  const stage = detectStage(message);
  if (stage) updated.stage = stage;

  const indication = detectIndication(message);
  if (indication) updated.indication = indication;

  const instMatch = message.match(
    /(?:from|at|by)\s+([\w\s]+?(?:university|institute|college|hospital|MIT|Stanford|Harvard|Yale|Columbia|Duke|Cornell|Johns Hopkins)[\w\s]*)/i
  );
  if (instMatch?.[1]) {
    updated.institution = instMatch[1].trim();
  }

  return updated;
}

export function getOrUpdateSessionFocus(sessionId: string, message: string): SessionFocusContext {
  const current = _sessionFocusMap.get(sessionId) ?? {};
  const updated = extractFocusUpdates(message, current);
  _sessionFocusMap.set(sessionId, updated);
  return updated;
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

  const [totalRows, modalityRows, stageRows, institutionRows, therapyAreaRows] = await Promise.all([
    db.execute(sql`SELECT COUNT(*)::int AS total FROM ingested_assets WHERE relevant = true`),
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

  const total = Number((totalRows.rows[0] as Record<string, unknown>)?.total ?? 0);
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

type AggResult = Record<string, unknown>[];

async function runCountByInstitution(area?: string): Promise<AggResult> {
  const rows = await db
    .select({ institution: ingestedAssets.institution, count: sql<number>`count(*)::int` })
    .from(ingestedAssets)
    .where(
      area
        ? sql`${ingestedAssets.relevant} = true AND (lower(${ingestedAssets.indication}) LIKE ${"%" + area.toLowerCase() + "%"} OR lower(${ingestedAssets.categories}::text) LIKE ${"%" + area.toLowerCase() + "%"})`
        : sql`${ingestedAssets.relevant} = true`
    )
    .groupBy(ingestedAssets.institution)
    .orderBy(sql`count(*) DESC`)
    .limit(15);
  return rows as AggResult;
}

async function runCountByModality(): Promise<AggResult> {
  const rows = await db
    .select({ modality: ingestedAssets.modality, count: sql<number>`count(*)::int` })
    .from(ingestedAssets)
    .where(sql`${ingestedAssets.relevant} = true AND ${ingestedAssets.modality} != 'unknown'`)
    .groupBy(ingestedAssets.modality)
    .orderBy(sql`count(*) DESC`)
    .limit(15);
  return rows as AggResult;
}

async function runCountByStage(): Promise<AggResult> {
  const rows = await db
    .select({ stage: ingestedAssets.developmentStage, count: sql<number>`count(*)::int` })
    .from(ingestedAssets)
    .where(sql`${ingestedAssets.relevant} = true AND ${ingestedAssets.developmentStage} != 'unknown'`)
    .groupBy(ingestedAssets.developmentStage)
    .orderBy(sql`count(*) DESC`)
    .limit(12);
  return rows as AggResult;
}

async function runCountForInstitution(
  institution: string,
  area?: string
): Promise<{ name: string; count: number } | null> {
  const instPattern = "%" + institution.toLowerCase() + "%";
  const rows = await db
    .select({ institution: ingestedAssets.institution, count: sql<number>`count(*)::int` })
    .from(ingestedAssets)
    .where(
      area && area.length > 2
        ? sql`${ingestedAssets.relevant} = true
            AND lower(${ingestedAssets.institution}) LIKE ${instPattern}
            AND (lower(${ingestedAssets.indication}) LIKE ${"%" + area.toLowerCase() + "%"}
              OR lower(${ingestedAssets.categories}::text) LIKE ${"%" + area.toLowerCase() + "%"})`
        : sql`${ingestedAssets.relevant} = true AND lower(${ingestedAssets.institution}) LIKE ${instPattern}`
    )
    .groupBy(ingestedAssets.institution)
    .orderBy(sql`count(*) DESC`)
    .limit(1);
  if (!rows.length || !(rows[0].count as number)) return null;
  return { name: String(rows[0].institution), count: rows[0].count as number };
}

async function runNewestByInstitution(institution: string): Promise<AggResult> {
  const rows = await db
    .select({
      assetName: ingestedAssets.assetName,
      indication: ingestedAssets.indication,
      modality: ingestedAssets.modality,
      developmentStage: ingestedAssets.developmentStage,
      firstSeenAt: ingestedAssets.firstSeenAt,
    })
    .from(ingestedAssets)
    .where(sql`${ingestedAssets.relevant} = true AND lower(${ingestedAssets.institution}) LIKE ${"%" + institution.toLowerCase() + "%"}`)
    .orderBy(desc(ingestedAssets.firstSeenAt))
    .limit(8);
  return rows as AggResult;
}

async function resolveAggregationQuery(query: string): Promise<string | null> {
  const lower = query.toLowerCase();

  if (/stage|phases?\s+break/i.test(lower) && !/which|who|what assets/i.test(lower)) {
    const rows = await runCountByStage();
    if (!rows.length) return null;
    const lines = rows.map((r) => `  • ${r["stage"]}: ${r["count"]} assets`).join("\n");
    return `**Development stage breakdown** across all relevant assets:\n${lines}`;
  }

  if (/modali|small molecule|antibod|gene therapy|cell therapy/i.test(lower) && /breakdown|count|how many|split/i.test(lower)) {
    const rows = await runCountByModality();
    if (!rows.length) return null;
    const lines = rows.map((r) => `  • ${r["modality"]}: ${r["count"]} assets`).join("\n");
    return `**Modality breakdown** across the indexed portfolio:\n${lines}`;
  }

  const instMatch = lower.match(/newest|latest|recent.*(?:from|at|out of)\s+([a-z\s]+?)(?:\s+tto|\s+university|\s+institute|\s+college|$)/i);
  if (instMatch?.[1]) {
    const inst = instMatch[1].trim();
    const rows = await runNewestByInstitution(inst);
    if (!rows.length) return null;
    const lines = rows.map((r) => `  • ${r["assetName"]} (${r["modality"]}, ${r["developmentStage"]}, ${r["indication"]})`).join("\n");
    return `**Most recent assets from ${inst.replace(/\b\w/g, (c) => c.toUpperCase())}** in the database:\n${lines}`;
  }

  const areaMatch = lower.match(/(?:top\s+institutions?|who(?:'s|\s+is|\s+are)?\s+(?:most active|leading|doing the most(?:\s+work)?)|which institutions?)\s+(?:in|for|working on)\s+(.+?)(?:\?|$)/i);
  if (areaMatch?.[1]) {
    const area = areaMatch[1].trim().replace(/\?$/, "");
    const rows = await runCountByInstitution(area);
    if (!rows.length) return null;
    const lines = rows.slice(0, 10).map((r) => `  • ${r["institution"]}: ${r["count"]} assets`).join("\n");
    return `**Top institutions** in ${area}:\n${lines}`;
  }

  const instCountRx = /how many\s+([\w\s]+?)\s*(?:assets?|technologies?|programs?)?\s*(?:does|from|at|by)\s+([\w\s]+?)(?:\s+(?:tto|university|institute|college|tech transfer))?(?:\s+have|\?|$)/i;
  const icm = instCountRx.exec(query);
  if (icm) {
    const areaRaw = icm[1].trim().replace(/^(?:the|all|total)\s+/i, "");
    const instHint = icm[2].trim();
    const isGeneric = /^(?:assets?|technologies?|programs?|compounds?|the)$/i.test(areaRaw) || areaRaw.length < 2;
    const result = await runCountForInstitution(instHint, isGeneric ? undefined : areaRaw);
    if (result) {
      const label = isGeneric ? "" : `${areaRaw} `;
      return `**${result.name}** has **${result.count} ${label}assets** in the indexed portfolio.`;
    }
  }

  if (/how many\s+(?:assets?|technologies?)/i.test(lower)) {
    const areaHint = lower.match(/(?:in|for|related to|on)\s+([a-z\s]+?)(?:\s+are|\s+exist|\?|$)/i)?.[1]?.trim();
    const rows = await runCountByInstitution(areaHint || undefined);
    if (!rows.length) return null;
    const total = rows.reduce((s, r) => s + (r["count"] as number), 0);
    if (areaHint) {
      const top3 = rows.slice(0, 3).map((r) => `${r["institution"]} (${r["count"]})`).join(", ");
      return `There are **${total} assets** related to "${areaHint}" across the indexed portfolio. Top institutions: ${top3}.`;
    }
    const top5 = rows.slice(0, 5).map((r) => `${r["institution"]} (${r["count"]})`).join(", ");
    return `There are **${total} relevant assets** in total. The most active institutions: ${top5}.`;
  }

  return null;
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

export function isConversational(query: string): boolean {
  const words = query.trim().split(/\s+/);
  if (words.length > 8) return false;
  const lower = query.toLowerCase();
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
