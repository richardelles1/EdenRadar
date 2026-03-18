import OpenAI from "openai";
import { db } from "../../db";
import { sql } from "drizzle-orm";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const EMBED_MODEL = "text-embedding-3-small";

export type RetrievedAsset = {
  id: number;
  assetName: string;
  target: string;
  modality: string;
  indication: string;
  developmentStage: string;
  institution: string;
  mechanismOfAction: string | null;
  innovationClaim: string | null;
  unmetNeed: string | null;
  comparableDrugs: string | null;
  completenessScore: number | null;
  licensingReadiness: string | null;
  sourceUrl: string | null;
  similarity: number;
};

type EmbeddingRow = {
  id: unknown;
  asset_name: unknown;
  target: unknown;
  modality: unknown;
  indication: unknown;
  development_stage: unknown;
  institution: unknown;
  mechanism_of_action: unknown;
  innovation_claim: unknown;
  unmet_need: unknown;
  comparable_drugs: unknown;
  completeness_score: unknown;
  licensing_readiness: unknown;
  source_url: unknown;
  similarity: unknown;
};

function toStr(v: unknown): string { return typeof v === "string" ? v : String(v ?? ""); }
function toStrNull(v: unknown): string | null { return typeof v === "string" && v ? v : null; }
function toNumNull(v: unknown): number | null { return v != null ? parseFloat(String(v)) : null; }

export async function embedQuery(query: string): Promise<number[]> {
  const response = await client.embeddings.create({
    model: EMBED_MODEL,
    input: query.slice(0, 8000),
  });
  return response.data[0].embedding;
}

export async function semanticSearch(queryEmbedding: number[], limit = 15): Promise<RetrievedAsset[]> {
  const vectorStr = `[${queryEmbedding.join(",")}]`;
  const result = await db.execute(sql`
    SELECT
      id, asset_name, target, modality, indication, development_stage, institution,
      mechanism_of_action, innovation_claim, unmet_need, comparable_drugs,
      completeness_score, licensing_readiness, source_url,
      1 - (embedding <=> ${vectorStr}::vector) AS similarity
    FROM ingested_assets
    WHERE embedding IS NOT NULL AND relevant = true
    ORDER BY embedding <=> ${vectorStr}::vector
    LIMIT ${limit}
  `);

  return (result.rows as EmbeddingRow[]).map((r) => ({
    id: Number(r.id),
    assetName: toStr(r.asset_name),
    target: toStr(r.target),
    modality: toStr(r.modality),
    indication: toStr(r.indication),
    developmentStage: toStr(r.development_stage),
    institution: toStr(r.institution),
    mechanismOfAction: toStrNull(r.mechanism_of_action),
    innovationClaim: toStrNull(r.innovation_claim),
    unmetNeed: toStrNull(r.unmet_need),
    comparableDrugs: toStrNull(r.comparable_drugs),
    completenessScore: toNumNull(r.completeness_score),
    licensingReadiness: toStrNull(r.licensing_readiness),
    sourceUrl: toStrNull(r.source_url),
    similarity: parseFloat(String(r.similarity ?? 0)),
  }));
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
        a.completenessScore != null ? `  Completeness: ${a.completenessScore}/100` : null,
        a.sourceUrl ? `  URL: ${a.sourceUrl}` : null,
      ]
        .filter(Boolean)
        .join("\n");
      return lines;
    })
    .join("\n\n");
}

const SYSTEM_PROMPT = `You are EDEN, an expert AI biotech analyst embedded in EdenRadar — a platform with 40,000+ live technology transfer assets from 220+ universities and research institutions.

Your job is to answer questions about the TTO asset corpus using semantically retrieved context. You are speaking with pharma BD professionals.

Guidelines:
- Be precise and analytically rigorous.
- When citing assets in your response, reference them by name and institution using the format **Asset Name** (Institution).
- If the retrieved assets don't fully answer the question, acknowledge the limitation.
- Never hallucinate data. Only use what's in the context.
- For licensing questions, focus on licensing readiness and IP type.
- Keep responses concise but substantive. Use markdown formatting where helpful.
- At the end of your response, you MUST include a "## Sources" section listing each asset you cited with its name, institution, and URL (if available).`;

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
      content: `Based on the following retrieved TTO assets, answer the question.\n\nRETRIEVED ASSETS:\n${context}\n\nQUESTION: ${question}`,
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
