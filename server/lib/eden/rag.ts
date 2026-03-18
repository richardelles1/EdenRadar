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

export async function embedQuery(query: string): Promise<number[]> {
  const response = await client.embeddings.create({
    model: EMBED_MODEL,
    input: query.slice(0, 8000),
  });
  return response.data[0].embedding;
}

export async function semanticSearch(queryEmbedding: number[], limit = 8): Promise<RetrievedAsset[]> {
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

  return (result.rows as any[]).map((r) => ({
    id: r.id,
    assetName: r.asset_name,
    target: r.target,
    modality: r.modality,
    indication: r.indication,
    developmentStage: r.development_stage,
    institution: r.institution,
    mechanismOfAction: r.mechanism_of_action ?? null,
    innovationClaim: r.innovation_claim ?? null,
    unmetNeed: r.unmet_need ?? null,
    comparableDrugs: r.comparable_drugs ?? null,
    completenessScore: r.completeness_score != null ? parseFloat(r.completeness_score) : null,
    licensingReadiness: r.licensing_readiness ?? null,
    sourceUrl: r.source_url ?? null,
    similarity: parseFloat(r.similarity),
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
- When citing assets, reference them by name and institution.
- If the retrieved assets don't fully answer the question, acknowledge the limitation.
- Never hallucinate data. Only use what's in the context.
- For licensing questions, focus on licensing readiness and IP type.
- Keep responses concise but substantive. Use markdown formatting where helpful.`;

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
    max_tokens: 1000,
  });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) yield delta;
  }
}
