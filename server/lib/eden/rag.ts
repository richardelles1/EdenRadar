import OpenAI from "openai";
import type { RetrievedAsset } from "../../storage";

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

export async function embedQuery(query: string): Promise<number[]> {
  const response = await client.embeddings.create({
    model: EMBED_MODEL,
    input: query.slice(0, 8000),
  });
  return response.data[0].embedding;
}

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
