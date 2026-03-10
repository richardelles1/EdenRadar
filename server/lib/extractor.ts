import OpenAI from "openai";
import type { RawPaper } from "./sources/index";
import type { Asset } from "@shared/schema";

if (!process.env.OPENAI_API_KEY) {
  console.warn("WARNING: OPENAI_API_KEY is not set. AI extraction will fail.");
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function isFatalOpenAIError(err: unknown): boolean {
  if (err instanceof OpenAI.AuthenticationError) return true;
  if (err instanceof OpenAI.PermissionDeniedError) return true;
  if (err instanceof OpenAI.RateLimitError) return true;
  if (err instanceof OpenAI.BadRequestError) return false;
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("401") ||
    msg.includes("403") ||
    msg.includes("Incorrect API key") ||
    msg.includes("invalid_api_key") ||
    msg.includes("quota") ||
    msg.includes("insufficient_quota")
  );
}

async function extractAssetFromPaper(paper: RawPaper): Promise<Asset | null> {
  if (!paper.abstract || paper.abstract === "No abstract available.") return null;

  const prompt = `Analyze the following biomedical research abstract and extract structured information describing a potential drug asset.

Return ONLY valid JSON with the following fields:
- asset_name: Name of the drug, compound, or therapy (string)
- target: Molecular or biological target (string)
- modality: Type of therapy (e.g., "small molecule", "antibody", "CAR-T", "gene therapy", "mRNA therapy", "peptide", "bispecific antibody")
- development_stage: Stage of development (e.g., "discovery", "preclinical", "phase 1", "phase 2", "phase 3", "approved")
- disease_indication: Disease or condition being treated (string)
- summary: 2-3 sentence summary of the key findings and significance (string)

If a field cannot be determined from the abstract, use "unknown".

Abstract:
${paper.abstract}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.2,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content);

    return {
      asset_name: parsed.asset_name ?? "unknown",
      target: parsed.target ?? "unknown",
      modality: parsed.modality ?? "unknown",
      development_stage: parsed.development_stage ?? "unknown",
      disease_indication: parsed.disease_indication ?? "unknown",
      summary: parsed.summary ?? "No summary available.",
      source_title: paper.title,
      source_journal: paper.journal,
      publication_year: paper.year,
      source_name: paper.sourceName,
      source_url: paper.url,
      pmid: paper.pmid,
    };
  } catch (err) {
    if (isFatalOpenAIError(err)) {
      throw err;
    }
    console.error("Extraction error for paper", paper.pmid, err);
    return null;
  }
}

async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let index = 0;

  async function runNext(): Promise<void> {
    const taskIndex = index++;
    if (taskIndex >= tasks.length) return;
    results[taskIndex] = await tasks[taskIndex]();
    await runNext();
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, runNext);
  await Promise.all(workers);
  return results;
}

export async function extractAssetsFromPapers(papers: RawPaper[]): Promise<Asset[]> {
  const tasks = papers.map((paper) => () => extractAssetFromPaper(paper));
  const results = await runWithConcurrency(tasks, 3);
  return results.filter((r): r is Asset => r !== null);
}
