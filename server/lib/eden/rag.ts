import OpenAI from "openai";
import type { RetrievedAsset } from "../../storage";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const EMBED_MODEL = "text-embedding-3-small";

export { type RetrievedAsset };

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
        a.completenessScore != null ? `  Completeness: ${a.completenessScore}/100` : null,
        a.sourceUrl ? `  URL: ${a.sourceUrl}` : null,
      ]
        .filter(Boolean)
        .join("\n");
      return lines;
    })
    .join("\n\n");
}

const SYSTEM_PROMPT = `You are EDEN — an AI intelligence embedded in EdenRadar, with access to 40,000+ live technology transfer assets from 220+ research universities and institutions worldwide.

You're a knowledgeable, warm colleague who genuinely enjoys helping people discover remarkable science. You speak naturally and thoughtfully — not like a database.

When someone greets you or asks a casual question, respond warmly and briefly, then invite them to explore. Keep it human and short.

For research queries, be precise and analytically rigorous:
- Cite assets by name and institution: **Asset Name** (Institution)
- Focus on what makes each asset commercially interesting: mechanism, stage, innovation, licensing status
- If retrieved assets don't fully address the question, say so clearly — don't stretch
- Never fabricate data — only use what's in the provided context
- Use markdown formatting for structured responses
- Do NOT include a Sources section — citations are shown automatically`;

export async function* ragQuery(
  question: string,
  assets: RetrievedAsset[],
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }> = []
): AsyncGenerator<string> {
  const context = buildContext(assets);

  const messages: Array<{ role: "user" | "assistant" | "system"; content: string }> = [
    { role: "system", content: SYSTEM_PROMPT },
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
    temperature: 0.3,
    max_tokens: 1200,
  });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) yield delta;
  }
}

export async function* directQuery(
  question: string,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }> = []
): AsyncGenerator<string> {
  const messages: Array<{ role: "user" | "assistant" | "system"; content: string }> = [
    { role: "system", content: SYSTEM_PROMPT },
    ...conversationHistory.slice(-6),
    { role: "user", content: question },
  ];

  const stream = await client.chat.completions.create({
    model: "gpt-4o",
    messages,
    stream: true,
    temperature: 0.7,
    max_tokens: 350,
  });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) yield delta;
  }
}
