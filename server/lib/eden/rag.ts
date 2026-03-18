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

const SYSTEM_PROMPT = `You are EDEN, an expert AI biotech analyst embedded in EdenRadar — a platform with 40,000+ live technology transfer assets from 220+ universities and research institutions.

Your job is to answer questions about the TTO asset corpus using semantically retrieved context. You are speaking with pharma BD professionals.

Guidelines:
- Be precise and analytically rigorous.
- When citing assets in your response, reference them by name and institution using the format **Asset Name** (Institution).
- If the retrieved assets don't fully answer the question, acknowledge the limitation.
- Never hallucinate data. Only use what's in the context.
- For licensing questions, focus on licensing readiness and IP type.
- Keep responses concise but substantive. Use markdown formatting where helpful.
- Do NOT include a Sources section in your response body — sources are appended automatically.`;

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
