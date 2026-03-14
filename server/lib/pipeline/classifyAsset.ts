import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  timeout: 10000,
  maxRetries: 1,
});

export interface AssetClassification {
  biotechRelevant: boolean;
  target: string;
  modality: string;
  indication: string;
  developmentStage: string;
  categories: string[];
  categoryConfidence: number;
  innovationClaim: string;
  mechanismOfAction: string;
  ipType: string;
  unmetNeed: string;
  comparableDrugs: string;
  licensingReadiness: string;
}

const STAGE_VALUES = new Set(["discovery", "preclinical", "phase 1", "phase 2", "phase 3", "approved", "unknown"]);
const MODALITY_VALUES = new Set([
  "small molecule", "antibody", "bispecific antibody", "car-t", "gene therapy", "gene editing",
  "mrna therapy", "cell therapy", "peptide", "sirna", "adc", "protac", "vaccine", "nanoparticle",
  "medical device", "diagnostic", "platform technology", "research tool", "unknown",
]);
const IP_TYPES = new Set(["patent pending", "patented", "provisional", "copyright", "trade secret", "none", "unknown"]);
const LICENSING_READINESS = new Set(["available", "exclusively licensed", "non-exclusively licensed", "optioned", "startup formed", "unknown"]);

function sanitize(val: string, allowed: Set<string>, fallback: string): string {
  const v = (val ?? "").toLowerCase().trim();
  return allowed.has(v) ? v : fallback;
}

export async function classifyAsset(
  title: string,
  description: string,
  abstract?: string
): Promise<AssetClassification> {
  const inputText = [
    `Title: ${title}`,
    description && description !== title ? `Description: ${description.slice(0, 2000)}` : "",
    abstract ? `Abstract: ${abstract.slice(0, 2000)}` : "",
  ].filter(Boolean).join("\n");

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 400,
      messages: [
        {
          role: "system",
          content: `You are a biotech licensing analyst classifying university TTO listings. Analyze the technology and return JSON only (no markdown).

Fields:
- biotechRelevant (bool): true if relevant to pharma/biotech/medtech licensing
- target (string): gene/protein/pathway/biomarker or "unknown"
- modality (string): one of: small molecule|antibody|bispecific antibody|car-t|gene therapy|gene editing|mrna therapy|cell therapy|peptide|sirna|adc|protac|vaccine|nanoparticle|medical device|diagnostic|platform technology|research tool|unknown
- indication (string): disease/condition or "unknown"
- developmentStage (string): one of: discovery|preclinical|phase 1|phase 2|phase 3|approved|unknown
- categories (string[]): therapy areas e.g. ["oncology","immunology"]
- categoryConfidence (number 0-1): confidence in category assignment
- innovationClaim (string): one-sentence claim of what's novel (or "")
- mechanismOfAction (string): brief MOA description (or "")
- ipType (string): one of: patent pending|patented|provisional|copyright|trade secret|none|unknown
- unmetNeed (string): clinical gap addressed (or "")
- comparableDrugs (string): existing treatments in space (or "")
- licensingReadiness (string): one of: available|exclusively licensed|non-exclusively licensed|optioned|startup formed|unknown`,
        },
        { role: "user", content: inputText },
      ],
    });

    const text = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(text.replace(/```json?|```/g, "").trim());

    return {
      biotechRelevant: parsed.biotechRelevant === true,
      target: (parsed.target ?? "unknown").toLowerCase().trim() || "unknown",
      modality: sanitize(parsed.modality, MODALITY_VALUES, "unknown"),
      indication: (parsed.indication ?? "unknown").toLowerCase().trim() || "unknown",
      developmentStage: sanitize(parsed.developmentStage, STAGE_VALUES, "unknown"),
      categories: Array.isArray(parsed.categories) ? parsed.categories.map((c: string) => c.toLowerCase().trim()) : [],
      categoryConfidence: typeof parsed.categoryConfidence === "number" ? Math.min(1, Math.max(0, parsed.categoryConfidence)) : 0,
      innovationClaim: (parsed.innovationClaim ?? "").trim(),
      mechanismOfAction: (parsed.mechanismOfAction ?? "").trim(),
      ipType: sanitize(parsed.ipType, IP_TYPES, "unknown"),
      unmetNeed: (parsed.unmetNeed ?? "").trim(),
      comparableDrugs: (parsed.comparableDrugs ?? "").trim(),
      licensingReadiness: sanitize(parsed.licensingReadiness, LICENSING_READINESS, "unknown"),
    };
  } catch {
    return {
      biotechRelevant: false,
      target: "unknown",
      modality: "unknown",
      indication: "unknown",
      developmentStage: "unknown",
      categories: [],
      categoryConfidence: 0,
      innovationClaim: "",
      mechanismOfAction: "",
      ipType: "unknown",
      unmetNeed: "",
      comparableDrugs: "",
      licensingReadiness: "unknown",
    };
  }
}

export async function classifyBatch(
  items: { id: number; title: string; description: string; abstract?: string }[],
  concurrency = 30,
  onEach?: (id: number, result: AssetClassification) => Promise<void>
): Promise<Map<number, AssetClassification>> {
  const results = new Map<number, AssetClassification>();
  let i = 0;

  async function worker() {
    while (i < items.length) {
      const item = items[i++];
      if (!item) continue;
      const classification = await classifyAsset(item.title, item.description, item.abstract);
      results.set(item.id, classification);
      if (onEach) {
        try { await onEach(item.id, classification); } catch {}
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, worker);
  await Promise.all(workers);
  return results;
}
