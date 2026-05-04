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
  /**
   * Fields that already have a non-"unknown" value on the asset. Passed into the
   * prompt so the model knows what to keep vs. fill. Improves the
   * unknown→known hit rate and avoids re-guessing already-good fields.
   */
  currentValues?: {
    target?: string | null;
    modality?: string | null;
    indication?: string | null;
    developmentStage?: string | null;
  } | null;
  /**
   * Gap-fill mode: when set, the model is instructed to ONLY generate values for
   * these specific fields. All other output fields are returned as "unknown"/null.
   * Reduces token cost and prevents overwriting already-good fields.
   */
  fieldsToGenerate?: string[] | null;
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

export interface ClassifyResult extends AssetClassification {
  tokenUsage: { inputTokens: number; outputTokens: number };
}

export async function classifyAsset(
  title: string,
  description: string,
  abstract?: string,
  model: "gpt-4o-mini" | "gpt-4o" = "gpt-4o-mini",
  throwOnError = false,
  ctx?: AssetContext,
): Promise<ClassifyResult> {
  const contextLines: string[] = [];
  if (ctx?.categories?.length) contextLines.push(`Tags/Categories: ${ctx.categories.join(", ")}`);
  if (ctx?.patentStatus && ctx.patentStatus !== "unknown") contextLines.push(`Patent Status: ${ctx.patentStatus}`);
  if (ctx?.licensingStatus && ctx.licensingStatus !== "unknown") contextLines.push(`Licensing Status: ${ctx.licensingStatus}`);
  if (ctx?.inventors?.length) contextLines.push(`Inventors: ${ctx.inventors.join(", ")}`);
  if (ctx?.sourceUrl) contextLines.push(`Source URL: ${ctx.sourceUrl}`);

  // Render currently-known field values so the model focuses on filling the
  // unknowns rather than re-deriving everything from scratch every pass.
  const cv = ctx?.currentValues;
  const knownLines: string[] = [];
  const unknownFields: string[] = [];
  if (cv) {
    const isKnown = (v: string | null | undefined) => v != null && v !== "" && v.toLowerCase() !== "unknown";
    if (isKnown(cv.target)) knownLines.push(`- target: ${cv.target}`); else unknownFields.push("target");
    if (isKnown(cv.modality)) knownLines.push(`- modality: ${cv.modality}`); else unknownFields.push("modality");
    if (isKnown(cv.indication)) knownLines.push(`- indication: ${cv.indication}`); else unknownFields.push("indication");
    if (isKnown(cv.developmentStage)) knownLines.push(`- developmentStage: ${cv.developmentStage}`); else unknownFields.push("developmentStage");
  }
  const knownBlock = knownLines.length
    ? `\nAlready-known fields (keep these values unless the source text clearly contradicts them):\n${knownLines.join("\n")}`
    : "";
  const focusBlock = unknownFields.length
    ? `\nFocus on filling these currently-unknown fields if the source supports it: ${unknownFields.join(", ")}.`
    : "";
  // Gap-fill mode: strict prompt instruction to limit output to target fields
  const gapFillFields = ctx?.fieldsToGenerate?.length ? ctx.fieldsToGenerate : null;
  const gapFillBlock = gapFillFields
    ? `\nGAP-FILL MODE: Only generate values for these fields: ${gapFillFields.join(", ")}. For ALL other output fields return "unknown" or null — do NOT attempt to derive them.`
    : "";

  const inputText = [
    `Title: ${title}`,
    description && description !== title ? `Description: ${description.slice(0, 2000)}` : "",
    abstract ? `Abstract: ${abstract.slice(0, 2000)}` : "",
    ...contextLines,
    knownBlock,
    focusBlock,
    gapFillBlock,
  ].filter(Boolean).join("\n");

  const fallback: ClassifyResult = {
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
    tokenUsage: { inputTokens: 0, outputTokens: 0 },
  };

  // Gap-fill JSON schema: structurally restrict the API response to only the requested fields.
  // Each field is a nullable string; all are required (strictMode compatible).
  const gapFillSchema = gapFillFields
    ? {
        type: "json_schema" as const,
        json_schema: {
          name: "gap_fill_output",
          strict: true,
          schema: {
            type: "object" as const,
            properties: Object.fromEntries(
              gapFillFields.map((f) => [f, { type: ["string", "null"] }]),
            ),
            required: gapFillFields,
            additionalProperties: false,
          },
        },
      }
    : { type: "json_object" as const };

  try {
    const response = await openai.chat.completions.create({
      model,
      temperature: 0,
      // Gap-fill: much shorter response (only 1-4 short string fields) so reduce max_tokens.
      // Full pass: full drug_biologic JSON with categories[], deviceAttributes etc.
      max_tokens: gapFillFields ? 300 : 1000,
      response_format: gapFillSchema,
      messages: [
        { role: "system", content: gapFillFields ? `You are a biotech analyst. Return a JSON object with exactly these fields: ${gapFillFields.join(", ")}. Each field should contain the requested information about the technology, or null if not determinable from the text.` : SYSTEM_PROMPT },
        { role: "user", content: inputText },
      ],
    });

    const text = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(text.replace(/```json?|```/g, "").trim());

    // In gap-fill mode the response schema only contains the target fields — `assetClass` is
    // absent from the parsed JSON. Since run-band pre-filters to asset_class='drug_biologic',
    // force isDrug=true so drug-specific fields are extracted correctly.
    const assetClass: AssetClass = gapFillFields
      ? "drug_biologic"
      : ASSET_CLASSES.has(parsed.assetClass) ? parsed.assetClass : "other";
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

    // Gap-fill strict output contract: null out any drug field NOT in the target list,
    // so non-target fields can never overwrite existing DB values downstream.
    // This is applied structurally after parsing — model prompt alone is not a sufficient guard.
    const gapFillSet = gapFillFields ? new Set(gapFillFields) : null;
    const gapNull = <T>(field: string, val: T): T | null =>
      gapFillSet && !gapFillSet.has(field) ? null : val;

    return {
      biotechRelevant: parsed.biotechRelevant === true,
      assetClass,
      target,
      modality: isDrug ? sanitize(parsed.modality ?? "", MODALITY_VALUES, "unknown") : null,
      indication,
      mechanismOfAction: gapNull("mechanismOfAction", isDrug ? nullIfUnknown(parsed.mechanismOfAction) : null),
      comparableDrugs: gapNull("comparableDrugs", isDrug ? nullIfUnknown(parsed.comparableDrugs) : null),
      unmetNeed: gapNull("unmetNeed", isDrug ? nullIfUnknown(parsed.unmetNeed) : null),
      deviceAttributes,
      developmentStage: sanitize(parsed.developmentStage ?? "", STAGE_VALUES, "unknown"),
      categories: Array.isArray(parsed.categories) ? parsed.categories.map((c: string) => c.toLowerCase().trim()) : [],
      categoryConfidence: typeof parsed.categoryConfidence === "number" ? Math.min(1, Math.max(0, parsed.categoryConfidence)) : 0,
      innovationClaim: gapNull("innovationClaim", (parsed.innovationClaim ?? "").trim()) ?? "",
      ipType: sanitize(parsed.ipType ?? "", IP_TYPES, "unknown"),
      licensingReadiness: sanitize(parsed.licensingReadiness ?? "", LICENSING_READINESS, "unknown"),
      tokenUsage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
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
