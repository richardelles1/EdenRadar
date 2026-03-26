import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 30000,
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

export interface AssetContext {
  categories?: string[] | null;
  patentStatus?: string | null;
  licensingStatus?: string | null;
  inventors?: string[] | null;
  sourceUrl?: string | null;
}

export async function classifyAsset(
  title: string,
  description: string,
  abstract?: string,
  model: "gpt-4o-mini" | "gpt-4o" = "gpt-4o-mini",
  throwOnError = false,
  ctx?: AssetContext,
): Promise<AssetClassification> {
  const contextLines: string[] = [];
  if (ctx?.categories?.length) contextLines.push(`Tags/Categories: ${ctx.categories.join(", ")}`);
  if (ctx?.patentStatus && ctx.patentStatus !== "unknown") contextLines.push(`Patent Status: ${ctx.patentStatus}`);
  if (ctx?.licensingStatus && ctx.licensingStatus !== "unknown") contextLines.push(`Licensing Status: ${ctx.licensingStatus}`);
  if (ctx?.inventors?.length) contextLines.push(`Inventors: ${ctx.inventors.join(", ")}`);
  if (ctx?.sourceUrl) contextLines.push(`Source URL: ${ctx.sourceUrl}`);

  const inputText = [
    `Title: ${title}`,
    description && description !== title ? `Description: ${description.slice(0, 2000)}` : "",
    abstract ? `Abstract: ${abstract.slice(0, 2000)}` : "",
    ...contextLines,
  ].filter(Boolean).join("\n");

  try {
    const response = await openai.chat.completions.create({
      model,
      temperature: 0,
      max_tokens: 400,
      response_format: { type: "json_object" },
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
  } catch (e) {
    if (throwOnError) throw e;
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

export const MIN_CONTENT_CHARS = 120;

export async function classifyBatch(
  items: { id: number; title: string; description: string; abstract?: string; ctx?: AssetContext }[],
  concurrency = 30,
  onEach?: (id: number, result: AssetClassification) => Promise<void>
): Promise<Map<number, AssetClassification>> {
  const results = new Map<number, AssetClassification>();
  let i = 0;

  async function worker() {
    while (i < items.length) {
      const item = items[i++];
      if (!item) continue;

      // No thin-content gate here — classification runs on all assets regardless of
      // content length. The AI can legitimately judge a short asset as non-relevant.
      // The 120-char quality gate is applied only in deepEnrichBatch, where rich text
      // is needed for meaningful field extraction. Gating classification would permanently
      // block assets from being selected for enrichment if biotechRelevant stays false.
      const classification = await classifyAsset(item.title, item.description, item.abstract, "gpt-4o-mini", false, item.ctx);
      results.set(item.id, classification);
      if (onEach) {
        try { await onEach(item.id, classification); } catch {}
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length || 1) }, worker);
  await Promise.all(workers);
  return results;
}
