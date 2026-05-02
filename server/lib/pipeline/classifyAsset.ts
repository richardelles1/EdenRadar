import OpenAI from "openai";
import { sanitizeToVocab } from "./vocab";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 30000,
  maxRetries: 1,
});

export type AssetClass = "drug_biologic" | "medical_device" | "research_tool" | "software" | "other";

export interface AssetClassification {
  biotechRelevant: boolean;
  assetClass: AssetClass;
  // Drug/Biologic fields (null for other asset classes)
  target: string | null;
  modality: string | null;
  indication: string | null;
  mechanismOfAction: string | null;
  comparableDrugs: string | null;
  unmetNeed: string | null;
  // Device/Tool/Software-specific attributes stored as JSONB
  deviceAttributes: Record<string, unknown> | null;
  // Common fields
  developmentStage: string;
  categories: string[];
  categoryConfidence: number;
  innovationClaim: string;
  ipType: string;
  licensingReadiness: string;
}

const STAGE_VALUES = new Set(["discovery", "preclinical", "phase 1", "phase 2", "phase 3", "approved", "unknown"]);
const MODALITY_VALUES = new Set([
  "small molecule", "antibody", "bispecific antibody", "car-t", "gene therapy", "gene editing",
  "mrna therapy", "cell therapy", "peptide", "sirna", "adc", "protac", "vaccine", "nanoparticle",
  "diagnostic", "platform technology", "unknown",
]);
const IP_TYPES = new Set(["patent pending", "patented", "provisional", "copyright", "trade secret", "none", "unknown"]);
const LICENSING_READINESS = new Set(["available", "exclusively licensed", "non-exclusively licensed", "optioned", "startup formed", "unknown"]);
const ASSET_CLASSES: Set<AssetClass> = new Set(["drug_biologic", "medical_device", "research_tool", "software", "other"]);

function sanitize(val: string, allowed: Set<string>, fallback: string): string {
  const v = (val ?? "").toLowerCase().trim();
  return allowed.has(v) ? v : fallback;
}

function nullIfUnknown(val: unknown): string | null {
  if (!val || String(val).toLowerCase().trim() === "unknown" || String(val).trim() === "") return null;
  return String(val).trim();
}

export interface AssetContext {
  categories?: string[] | null;
  patentStatus?: string | null;
  licensingStatus?: string | null;
  inventors?: string[] | null;
  sourceUrl?: string | null;
}

const SYSTEM_PROMPT = `You are a biotech licensing analyst classifying university TTO listings. Analyze the technology and return JSON only (no markdown).

STEP 1 — Determine assetClass:
- "drug_biologic": small molecules, antibodies, biologics, cell/gene therapy, vaccines, RNA therapeutics intended to treat, prevent, or diagnose disease in humans or animals
- "medical_device": hardware devices, instruments, implants, wearables, surgical tools, diagnostic devices, prosthetics
- "research_tool": reagents, assay kits, cell lines, animal models, antibodies used only as research reagents, lab protocols, wet-lab methods
- "software": standalone software platforms, algorithms, AI/ML tools, data pipelines, bioinformatics tools (not wet-lab research tools)
- "other": materials, chemical processes, agriculture, food science without therapeutic use, environmental, unrelated

STEP 2 — Fill fields. Return null (NOT "unknown") for fields that don't apply to the assetClass.

Common fields (ALL types):
- biotechRelevant (bool): true if relevant to pharma/biotech/medtech licensing
- assetClass: one of the 5 classes above
- developmentStage: discovery|preclinical|phase 1|phase 2|phase 3|approved|unknown
- ipType: patent pending|patented|provisional|copyright|trade secret|none|unknown
- licensingReadiness: available|exclusively licensed|non-exclusively licensed|optioned|startup formed|unknown
- categories (string[]): therapy/technology areas e.g. ["oncology","immunology"]
- categoryConfidence (number 0-1)
- innovationClaim (string): one-sentence novel claim, or ""

Drug/Biologic ONLY — return null for all other types:
- target: HGNC gene symbol or standard protein name (e.g. "KRAS", "PD-1", "IL-6"), or null
- modality: small molecule|antibody|bispecific antibody|car-t|gene therapy|gene editing|mrna therapy|cell therapy|peptide|sirna|adc|protac|vaccine|nanoparticle|diagnostic|platform technology|unknown — or null
- indication: MeSH disease name (e.g. "non-small cell lung cancer", "type 2 diabetes mellitus"), or null
- mechanismOfAction: brief MOA description, or null
- comparableDrugs: existing treatments in space, or null
- unmetNeed: clinical gap addressed, or null

Medical Device ONLY — return null for other types:
- deviceAttributes.primaryApplication (string): main clinical use/procedure
- deviceAttributes.keyAdvantages (string[]): 2-4 specific advantages
- deviceAttributes.regulatoryPathway: 510k|pma|de_novo|ide|exempt|unknown

Research Tool ONLY — return null for other types:
- deviceAttributes.applications (string[]): research applications
- deviceAttributes.targetUsers (string): intended users

Software ONLY — return null for other types:
- deviceAttributes.useCase (string): primary application
- deviceAttributes.deploymentModel: cloud|on-premise|both|unknown`;

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

  const fallback: AssetClassification = {
    biotechRelevant: false,
    assetClass: "other",
    target: null,
    modality: null,
    indication: null,
    mechanismOfAction: null,
    comparableDrugs: null,
    unmetNeed: null,
    deviceAttributes: null,
    developmentStage: "unknown",
    categories: [],
    categoryConfidence: 0,
    innovationClaim: "",
    ipType: "unknown",
    licensingReadiness: "unknown",
  };

  try {
    const response = await openai.chat.completions.create({
      model,
      temperature: 0,
      max_tokens: 500,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: inputText },
      ],
    });

    const text = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(text.replace(/```json?|```/g, "").trim());

    const assetClass: AssetClass = ASSET_CLASSES.has(parsed.assetClass) ? parsed.assetClass : "other";
    const isDrug = assetClass === "drug_biologic";

    // Parse device attributes for non-drug classes
    let deviceAttributes: Record<string, unknown> | null = null;
    if (assetClass === "medical_device" && parsed.deviceAttributes) {
      const da = parsed.deviceAttributes;
      deviceAttributes = {
        primaryApplication: nullIfUnknown(da.primaryApplication),
        keyAdvantages: Array.isArray(da.keyAdvantages) ? da.keyAdvantages : null,
        regulatoryPathway: da.regulatoryPathway ?? "unknown",
      };
    } else if (assetClass === "research_tool" && parsed.deviceAttributes) {
      const da = parsed.deviceAttributes;
      deviceAttributes = {
        applications: Array.isArray(da.applications) ? da.applications : null,
        targetUsers: nullIfUnknown(da.targetUsers),
      };
    } else if (assetClass === "software" && parsed.deviceAttributes) {
      const da = parsed.deviceAttributes;
      deviceAttributes = {
        useCase: nullIfUnknown(da.useCase),
        deploymentModel: da.deploymentModel ?? "unknown",
      };
    }

    // Normalize indication and target through vocab.
    // Semantics: null = non-applicable for this asset class; "unknown" = applicable but unresolved.
    const rawIndication = isDrug ? nullIfUnknown(parsed.indication) : null;
    const rawTarget = isDrug ? nullIfUnknown(parsed.target) : null;
    // Drug assets: if AI couldn't determine the value, keep "unknown" (not null).
    // null is reserved for non-drug classes where the concept doesn't apply.
    const indication = !isDrug ? null : (rawIndication ? sanitizeToVocab(rawIndication, "indication") : "unknown");
    const target = !isDrug ? null : (rawTarget ? sanitizeToVocab(rawTarget, "target") : "unknown");

    return {
      biotechRelevant: parsed.biotechRelevant === true,
      assetClass,
      target,
      modality: isDrug ? sanitize(parsed.modality ?? "", MODALITY_VALUES, "unknown") : null,
      indication,
      mechanismOfAction: isDrug ? nullIfUnknown(parsed.mechanismOfAction) : null,
      comparableDrugs: isDrug ? nullIfUnknown(parsed.comparableDrugs) : null,
      unmetNeed: isDrug ? nullIfUnknown(parsed.unmetNeed) : null,
      deviceAttributes,
      developmentStage: sanitize(parsed.developmentStage ?? "", STAGE_VALUES, "unknown"),
      categories: Array.isArray(parsed.categories) ? parsed.categories.map((c: string) => c.toLowerCase().trim()) : [],
      categoryConfidence: typeof parsed.categoryConfidence === "number" ? Math.min(1, Math.max(0, parsed.categoryConfidence)) : 0,
      innovationClaim: (parsed.innovationClaim ?? "").trim(),
      ipType: sanitize(parsed.ipType ?? "", IP_TYPES, "unknown"),
      licensingReadiness: sanitize(parsed.licensingReadiness ?? "", LICENSING_READINESS, "unknown"),
    };
  } catch (e) {
    if (throwOnError) throw e;
    return fallback;
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
