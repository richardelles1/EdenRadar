import OpenAI from "openai";
import { MIN_CONTENT_CHARS } from "../pipeline/classifyAsset";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 8000,
  maxRetries: 0,
});

export interface AssetEnrichment {
  target: string;
  modality: string;
  indication: string;
  developmentStage: string;
  biotechRelevant: boolean;
}

export interface EnrichAssetContext {
  categories?: string[] | null;
  patentStatus?: string | null;
  licensingStatus?: string | null;
  inventors?: string[] | null;
  sourceUrl?: string | null;
}

const STAGE_VALUES = new Set(["discovery", "preclinical", "phase 1", "phase 2", "phase 3", "approved", "unknown"]);
const MODALITY_VALUES = new Set([
  "small molecule", "antibody", "bispecific antibody", "car-t", "gene therapy", "gene editing",
  "mrna therapy", "cell therapy", "peptide", "sirna", "adc", "protac", "vaccine", "nanoparticle",
  "medical device", "diagnostic", "platform technology", "research tool", "unknown",
]);

function sanitize(val: string, allowed: Set<string>, fallback: string): string {
  const v = (val ?? "").toLowerCase().trim();
  return allowed.has(v) ? v : fallback;
}

function buildContextLines(ctx?: EnrichAssetContext): string[] {
  if (!ctx) return [];
  const lines: string[] = [];
  if (ctx.categories?.length) lines.push(`Tags/Categories: ${ctx.categories.join(", ")}`);
  if (ctx.patentStatus && ctx.patentStatus !== "unknown") lines.push(`Patent Status: ${ctx.patentStatus}`);
  if (ctx.licensingStatus && ctx.licensingStatus !== "unknown") lines.push(`Licensing Status: ${ctx.licensingStatus}`);
  if (ctx.inventors?.length) lines.push(`Inventors: ${ctx.inventors.join(", ")}`);
  if (ctx.sourceUrl) lines.push(`Source URL: ${ctx.sourceUrl}`);
  return lines;
}

export async function enrichAssetTitle(
  assetName: string,
  summary?: string,
  ctx?: EnrichAssetContext,
): Promise<AssetEnrichment> {
  try {
    const contextLines = buildContextLines(ctx);
    const inputParts = [
      summary && summary !== assetName && summary.length > 30
        ? `Title: ${assetName}\nDescription: ${summary.slice(0, 2000)}`
        : `Title: ${assetName}`,
      ...contextLines,
    ];
    const inputText = inputParts.join("\n");

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 200,
      messages: [
        {
          role: "system",
          content: `Extract biomedical fields from a university TTO technology listing. Reply with JSON only, no markdown.
Fields: target (gene/protein/pathway/anatomical target/biomarker, or "unknown"), modality (one of: small molecule|antibody|bispecific antibody|car-t|gene therapy|gene editing|mrna therapy|cell therapy|peptide|sirna|adc|protac|vaccine|nanoparticle|medical device|diagnostic|platform technology|research tool|unknown), indication (disease/condition, or "unknown"), developmentStage (one of: discovery|preclinical|phase 1|phase 2|phase 3|approved|unknown), biotechRelevant (true if applicable to pharma/biotech/medtech licensing — drugs, therapeutics, diagnostics, medical devices, biologics, biological research tools; false for pure software, civil/mechanical engineering, construction, agricultural equipment, optics hardware, consumer products, food science without therapeutic application).`,
        },
        {
          role: "user",
          content: inputText,
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

export async function reEnrichAsset(
  assetName: string,
  summary: string,
  currentFields: { target: string; modality: string; indication: string; developmentStage: string },
  ctx?: EnrichAssetContext,
): Promise<AssetEnrichment> {
  const unknownFields: string[] = [];
  if (currentFields.target === "unknown") unknownFields.push("target");
  if (currentFields.modality === "unknown") unknownFields.push("modality");
  if (currentFields.indication === "unknown") unknownFields.push("indication");
  if (currentFields.developmentStage === "unknown") unknownFields.push("developmentStage");

  if (unknownFields.length === 0) {
    return {
      target: currentFields.target,
      modality: sanitize(currentFields.modality, MODALITY_VALUES, currentFields.modality),
      indication: currentFields.indication,
      developmentStage: sanitize(currentFields.developmentStage, STAGE_VALUES, currentFields.developmentStage),
      biotechRelevant: true,
    };
  }

  try {
    const contextLines = buildContextLines(ctx);
    const userContent = [
      `Title: ${assetName}`,
      `Summary: ${(summary || "").slice(0, 1500)}`,
      ...contextLines,
    ].join("\n");

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 200,
      messages: [
        {
          role: "system",
          content: `You are a biomedical analyst re-enriching a university TTO technology listing. Some fields are currently "unknown" and need to be filled in using context from the title and summary.

Reply with JSON only, no markdown.

Fields to determine: ${unknownFields.join(", ")}
- target: gene/protein/pathway/mechanism/anatomical target/biomarker, or "unknown" if truly impossible
- modality: one of: small molecule|antibody|bispecific antibody|car-t|gene therapy|gene editing|mrna therapy|cell therapy|peptide|sirna|adc|protac|vaccine|nanoparticle|medical device|diagnostic|platform technology|research tool|unknown
- indication: disease/condition, or "unknown" if truly impossible
- developmentStage: one of: discovery|preclinical|phase 1|phase 2|phase 3|approved|unknown
- biotechRelevant: true if applicable to pharma/biotech/medtech licensing — drugs, therapeutics, diagnostics, medical devices, biologics, biological research tools; false for pure software, civil/mechanical engineering, construction, agricultural equipment, optics hardware, consumer products, food science without therapeutic application

Current known fields: ${JSON.stringify(Object.fromEntries(Object.entries(currentFields).filter(([, v]) => v !== "unknown")))}`,
        },
        {
          role: "user",
          content: userContent,
        },
      ],
    });

    const text = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(text.replace(/```json?|```/g, "").trim());

    return {
      target: unknownFields.includes("target")
        ? ((parsed.target ?? "unknown").toLowerCase().trim() || "unknown")
        : currentFields.target,
      modality: unknownFields.includes("modality")
        ? sanitize(parsed.modality, MODALITY_VALUES, "unknown")
        : sanitize(currentFields.modality, MODALITY_VALUES, currentFields.modality),
      indication: unknownFields.includes("indication")
        ? ((parsed.indication ?? "unknown").toLowerCase().trim() || "unknown")
        : currentFields.indication,
      developmentStage: unknownFields.includes("developmentStage")
        ? sanitize(parsed.developmentStage, STAGE_VALUES, "unknown")
        : sanitize(currentFields.developmentStage, STAGE_VALUES, currentFields.developmentStage),
      biotechRelevant: parsed.biotechRelevant !== false,
    };
  } catch {
    return {
      target: currentFields.target,
      modality: currentFields.modality,
      indication: currentFields.indication,
      developmentStage: currentFields.developmentStage,
      biotechRelevant: true,
    };
  }
}

export async function enrichBatch(
  items: { id: number; assetName: string; summary?: string; ctx?: EnrichAssetContext }[],
  concurrency = 50,
  onEach?: (id: number, result: AssetEnrichment) => Promise<void>
): Promise<Map<number, AssetEnrichment>> {
  const results = new Map<number, AssetEnrichment>();
  let i = 0;

  async function worker() {
    while (i < items.length) {
      const item = items[i++];
      if (!item) continue;
      const combinedLength = (item.assetName || "").length + (item.summary || "").length;
      if (combinedLength < MIN_CONTENT_CHARS) {
        console.log(`[enrichBatch] Skipping asset ${item.id} — combined text too short (${combinedLength} chars)`);
        continue;
      }
      const enrichment = await enrichAssetTitle(item.assetName, item.summary, item.ctx);
      results.set(item.id, enrichment);
      if (onEach) {
        try { await onEach(item.id, enrichment); } catch {}
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length || 1) }, worker);
  await Promise.all(workers);
  return results;
}
