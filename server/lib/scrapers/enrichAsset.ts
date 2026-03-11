import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export interface AssetEnrichment {
  target: string;
  modality: string;
  indication: string;
  developmentStage: string;
  biotechRelevant: boolean;
}

const STAGE_VALUES = new Set(["discovery", "preclinical", "phase 1", "phase 2", "phase 3", "approved", "unknown"]);
const MODALITY_VALUES = new Set([
  "small molecule", "antibody", "bispecific antibody", "car-t", "gene therapy", "gene editing",
  "mrna therapy", "cell therapy", "peptide", "sirna", "adc", "protac", "vaccine", "nanoparticle", "unknown",
]);

function sanitize(val: string, allowed: Set<string>, fallback: string): string {
  const v = (val ?? "").toLowerCase().trim();
  return allowed.has(v) ? v : fallback;
}

export async function enrichAssetTitle(assetName: string): Promise<AssetEnrichment> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 100,
      messages: [
        {
          role: "system",
          content: `Extract biomedical fields from a university TTO technology listing title. Reply with JSON only, no markdown.
Fields: target (gene/protein/pathway, or "unknown"), modality (one of: small molecule|antibody|bispecific antibody|car-t|gene therapy|gene editing|mrna therapy|cell therapy|peptide|sirna|adc|protac|vaccine|nanoparticle|unknown), indication (disease/condition, or "unknown"), developmentStage (one of: discovery|preclinical|phase 1|phase 2|phase 3|approved|unknown), biotechRelevant (true if applicable to pharma/biotech/medtech licensing — drugs, therapeutics, diagnostics, medical devices, biologics, biological research tools; false for pure software, civil/mechanical engineering, construction, agricultural equipment, optics hardware, consumer products, food science without therapeutic application).`,
        },
        {
          role: "user",
          content: assetName,
        },
      ],
    });

    const text = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(text.replace(/```json?|```/g, "").trim());

    return {
      target: (parsed.target ?? "unknown").toLowerCase().trim() || "unknown",
      modality: sanitize(parsed.modality, MODALITY_VALUES, "unknown"),
      indication: (parsed.indication ?? "unknown").toLowerCase().trim() || "unknown",
      developmentStage: sanitize(parsed.developmentStage, STAGE_VALUES, "unknown"),
      biotechRelevant: parsed.biotechRelevant === true,
    };
  } catch {
    return { target: "unknown", modality: "unknown", indication: "unknown", developmentStage: "unknown", biotechRelevant: false };
  }
}

export async function enrichBatch(
  items: { id: number; assetName: string }[],
  concurrency = 5
): Promise<Map<number, AssetEnrichment>> {
  const results = new Map<number, AssetEnrichment>();
  let i = 0;

  async function worker() {
    while (i < items.length) {
      const item = items[i++];
      if (!item) continue;
      const enrichment = await enrichAssetTitle(item.assetName);
      results.set(item.id, enrichment);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, worker);
  await Promise.all(workers);
  return results;
}
