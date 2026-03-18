import OpenAI from "openai";
import type { RetrievedAsset } from "../../storage";
import { db } from "../../db";
import { ingestedAssets } from "../../../shared/schema";
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

// ── Aggregation query detection and execution ─────────────────────────────

const AGG_PATTERNS = [
  /how many\s+(?:assets?|technologies?|compounds?|programs?|drugs?)/i,
  /count\s+(?:of\s+)?(?:assets?|technologies?|compounds?)/i,
  /how much\s+(?:work|research)/i,
  /top\s+(?:\d+\s+)?institutions?/i,
  /which institutions?\s+(?:has|have|lead|are)/i,
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
    .where(sql`${ingestedAssets.relevant} = true AND lower(${ingestedAssets.institution}) LIKE ${institution.toLowerCase() + "%"}`)
    .orderBy(desc(ingestedAssets.firstSeenAt))
    .limit(8);
  return rows as AggResult;
}

// Detect which aggregation to run based on query keywords
async function resolveAggregationQuery(query: string): Promise<string | null> {
  const lower = query.toLowerCase();

  // Stage breakdown
  if (/stage|phases?\s+break/i.test(lower) && !/which|who|what assets/i.test(lower)) {
    const rows = await runCountByStage();
    if (!rows.length) return null;
    const lines = rows.map((r) => `  • ${r["stage"]}: ${r["count"]} assets`).join("\n");
    return `**Development stage breakdown** across all relevant assets:\n${lines}`;
  }

  // Modality breakdown
  if (/modali|small molecule|antibod|gene therapy|cell therapy/i.test(lower) && /breakdown|count|how many|split/i.test(lower)) {
    const rows = await runCountByModality();
    if (!rows.length) return null;
    const lines = rows.map((r) => `  • ${r["modality"]}: ${r["count"]} assets`).join("\n");
    return `**Modality breakdown** across the indexed portfolio:\n${lines}`;
  }

  // Newest by specific institution
  const instMatch = lower.match(/newest|latest|recent.*(?:from|at|out of)\s+([a-z\s]+?)(?:\s+tto|\s+university|\s+institute|\s+college|$)/i);
  if (instMatch?.[1]) {
    const inst = instMatch[1].trim();
    const rows = await runNewestByInstitution(inst);
    if (!rows.length) return null;
    const lines = rows.map((r) => `  • ${r["assetName"]} (${r["modality"]}, ${r["developmentStage"]}, ${r["indication"]})`).join("\n");
    return `**Most recent assets from ${inst.replace(/\b\w/g, (c) => c.toUpperCase())}** in the database:\n${lines}`;
  }

  // Top institutions in an area
  const areaMatch = lower.match(/(?:top\s+institutions?|who(?:'s|\s+is|\s+are)?\s+(?:most active|leading|doing the most)|which institutions?)\s+(?:in|for|working on)\s+(.+?)(?:\?|$)/i);
  if (areaMatch?.[1]) {
    const area = areaMatch[1].trim().replace(/\?$/, "");
    const rows = await runCountByInstitution(area);
    if (!rows.length) return null;
    const lines = rows.slice(0, 10).map((r) => `  • ${r["institution"]}: ${r["count"]} assets`).join("\n");
    return `**Top institutions** in ${area}:\n${lines}`;
  }

  // General institution count or "how many" per institution
  if (/how many.*(?:does|from|at)\s+([A-Za-z]+)(?:\s+tto|\s+university|\s+institute)?/i.test(query)) {
    const m = query.match(/how many.*(?:does|from|at)\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)/i);
    if (m?.[1]) {
      const rows = await runCountByInstitution(m[1].trim());
      const match = rows.find((r) => String(r["institution"]).toLowerCase().includes(m[1].toLowerCase()));
      if (match) return `**${match["institution"]}** has **${match["count"]} assets** in the database.`;
    }
  }

  // General how many (total or by area)
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
        `  Target: ${a.target} | Modality: ${a.modality}`,
        `  Indication: ${a.indication} | Stage: ${a.developmentStage}`,
        a.mechanismOfAction ? `  Mechanism: ${a.mechanismOfAction}` : null,
        a.innovationClaim ? `  Innovation: ${a.innovationClaim}` : null,
        a.unmetNeed ? `  Unmet need: ${a.unmetNeed}` : null,
        a.comparableDrugs ? `  Comparable drugs: ${a.comparableDrugs}` : null,
        a.licensingReadiness ? `  Licensing readiness: ${a.licensingReadiness}` : null,
        a.ipType ? `  IP type: ${a.ipType}` : null,
        a.summary ? `  Summary: ${a.summary.slice(0, 200)}` : null,
        a.sourceUrl ? `  URL: ${a.sourceUrl}` : null,
      ]
        .filter(Boolean)
        .join("\n");
      return lines;
    })
    .join("\n\n");
}

const BASE_SYSTEM_PROMPT = `You are EDEN — an AI intelligence embedded in EdenRadar, with access to 40,000+ live technology transfer assets from 220+ research universities and institutions worldwide.

You are a knowledgeable, warm colleague — brilliant at surfacing the right science, not a database printout. You speak naturally, with genuine personality and curiosity.

## Conversational turns
When someone greets you, asks something casual, or follows up conversationally, respond warmly and briefly (1–3 sentences max). Keep it human. No lists, no structure.

## Research queries — format rules
- Present a maximum of 3 assets per response, even if more were retrieved
- For each asset: **bold name** (Institution) — then ONE concise hook sentence capturing what makes it commercially interesting. No bullet-point field dumps.
- Lead with a short framing sentence (1–2 lines) that sets the scene — vary your approach each time
- Close with a natural invitation to go deeper — vary the phrasing each time, never repeat the same closing back-to-back
- If only one strong match exists, spotlight it alone with a slightly richer 2–3 sentence treatment
- Never fabricate data — only use what's in the provided context
- If retrieved assets don't fully address the question, say so honestly and briefly
- Do NOT include a Sources section — asset cards are shown separately
- Use markdown sparingly — bold asset names, nothing else unless complexity demands it

## Aggregation query results
When the message begins with QUERY RESULT:, you are given precise data from the database. Present it conversationally — do not repeat the raw table, weave it into natural language. Use it to answer the user's question accurately. Do not say you don't have the data.

## Opening styles — vary these, do not repeat the same style consecutively
- **Observational**: Lead with a landscape observation ("There's genuine momentum here…", "This space is moving fast…", "A few things stand out in this area…")
- **Highlight-first**: Open by naming the most compelling asset first, then mention the others
- **Contextual**: Frame why this indication or technology is timely, competitive, or under-explored
- **Direct**: Skip preamble and list the top findings cleanly with minimal framing
- **Reflective**: Briefly note what the data suggests about the broader state of this field
- **Enthusiastic**: Lead with genuine excitement about a standout finding ("This one is worth flagging…", "There's something genuinely interesting here…")
- **Narrative**: Briefly tell the story of why this science matters before naming the assets
- **Clarifying**: Ask a short, genuinely useful follow-up question before (or alongside) answering — only when the query is broad enough that narrowing it would help

## Closing invitations — rotate through these freely, never use the same one twice in a row
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

## Format example
✗ Weak (avoid):
1. **Asset Name** (Institution)
   - Modality: Small molecule
   - Stage: Preclinical
   - Innovation: The compound works by inhibiting...

✓ Strong (use):
**Asset Name** (Institution) — A first-in-class inhibitor targeting [mechanism] with preclinical proof-of-concept in [indication], currently available for exclusive licensing.`;

function buildSystemPrompt(userContext?: UserContext): string {
  if (!userContext) return BASE_SYSTEM_PROMPT;
  const contextBlock = buildUserContextBlock(userContext);
  if (!contextBlock) return BASE_SYSTEM_PROMPT;
  return `${BASE_SYSTEM_PROMPT}\n\n${contextBlock}`;
}

export async function* ragQuery(
  question: string,
  assets: RetrievedAsset[],
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }> = [],
  userContext?: UserContext
): AsyncGenerator<string> {
  const context = buildContext(assets);
  const systemPrompt = buildSystemPrompt(userContext);

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
    model: "gpt-4o-mini",
    messages,
    stream: true,
    temperature: 0.5,
    max_tokens: 600,
  });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) yield delta;
  }
}

export async function* directQuery(
  question: string,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }> = [],
  userContext?: UserContext
): AsyncGenerator<string> {
  const systemPrompt = buildSystemPrompt(userContext);

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
  userContext?: UserContext
): AsyncGenerator<string> {
  const systemPrompt = buildSystemPrompt(userContext);

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
