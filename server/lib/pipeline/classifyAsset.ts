import OpenAI, { toFile } from "openai";
import { sanitizeToVocab } from "./vocab";

let _openai: OpenAI | undefined;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 30000, maxRetries: 1 });
  }
  return _openai;
}

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

export const STAGE_VALUES = new Set(["discovery", "preclinical", "phase 1", "phase 2", "phase 3", "approved", "unknown"]);
export const MODALITY_VALUES = new Set([
  "small molecule", "antibody", "bispecific antibody", "car-t", "gene therapy", "gene editing",
  "mrna therapy", "cell therapy", "peptide", "sirna", "adc", "protac", "vaccine", "nanoparticle",
  "diagnostic", "platform technology", "unknown",
]);
export const IP_TYPES = new Set(["patent pending", "patented", "provisional", "copyright", "trade secret", "none", "unknown"]);
export const LICENSING_READINESS = new Set(["available", "exclusively licensed", "non-exclusively licensed", "optioned", "startup formed", "unknown"]);
const ASSET_CLASSES: Set<AssetClass> = new Set(["drug_biologic", "medical_device", "research_tool", "software", "other"]);

export function sanitize(val: string, allowed: Set<string>, fallback: string): string {
  const v = (val ?? "").toLowerCase().trim();
  return allowed.has(v) ? v : fallback;
}

export function nullIfUnknown(val: unknown): string | null {
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
- "drug_biologic": small molecules, antibodies, biologics, cell/gene therapy, vaccines, RNA therapeutics intended to TREAT or PREVENT disease in humans or animals — NOT diagnostics
- "medical_device": hardware devices, instruments, implants, wearables, surgical tools, diagnostic devices, prosthetics, imaging agents, biomarker assays, biosensors, lateral flow tests, and any technology whose PRIMARY purpose is to DETECT or MEASURE disease rather than treat it
- "research_tool": reagents, assay kits, cell lines, animal models, antibodies used only as research reagents, lab protocols, wet-lab methods
- "software": standalone software platforms, algorithms, AI/ML tools, data pipelines, bioinformatics tools (not wet-lab research tools)
- "other": materials, chemical processes, agriculture, food science without therapeutic use, environmental, unrelated

STEP 2 — Fill fields. Return null (NOT "unknown") for fields that don't apply to the assetClass.

Common fields (ALL types):
- biotechRelevant (bool): true if relevant to pharma/biotech/medtech licensing
- assetClass: one of the 5 classes above
- developmentStage: discovery|preclinical|phase 1|phase 2|phase 3|approved|unknown
  Infer from context clues — do NOT default to unknown when signals exist:
  "randomized trial", "clinical study", "enrolled patients", "dose escalation" → phase 1 or phase 2
  "phase 1/2", "first-in-human", "FIH study" → phase 1
  "IND-enabling", "GLP toxicology", "animal model efficacy", "in vivo proof of concept", "preclinical models" → preclinical
  "hit identified", "lead optimization", "proof of concept", "early-stage discovery" → discovery
  "FDA approved", "EMA approved", "CE marked", "510(k) cleared", "commercialized" → approved
  "spinout formed", "licensed to company" does NOT imply approved — check clinical signals separately
- ipType: patent pending|patented|provisional|copyright|trade secret|none|unknown
- licensingReadiness: available|exclusively licensed|non-exclusively licensed|optioned|startup formed|unknown
- categories (string[]): therapy/technology areas e.g. ["oncology","immunology"]
- categoryConfidence (number 0-1)
- innovationClaim (string): one-sentence novel claim, or ""

Drug/Biologic ONLY — return null for all other types:
- target: the primary molecular target. Use the standard clinical name (e.g. "PD-1", "PD-L1", "HER2", "EGFR", "KRAS", "VEGF", "amyloid beta", "androgen receptor", "BCR-ABL"). Use HGNC gene symbol only when no widely recognized clinical name exists. Infer from contextual language: "mutant RAS signaling" → "KRAS", "PD-L1 checkpoint" → "PD-L1", "HER2-positive" → "HER2", "amyloid precursor protein" → "amyloid beta". Return null ONLY when no molecular target is identifiable from the text.
- modality: small molecule|antibody|bispecific antibody|car-t|gene therapy|gene editing|mrna therapy|cell therapy|peptide|sirna|adc|protac|vaccine|nanoparticle|diagnostic|platform technology|unknown — or null
- indication: MeSH disease name, or null. Prefer the most specific applicable term: "non-small cell lung cancer" not "lung cancer" or "cancer"; "glioblastoma" not "brain cancer"; "chronic lymphocytic leukemia" not "leukemia". Only use a broad term ("cancer", "neurological disorder") when the text genuinely does not specify the disease subtype.
- mechanismOfAction: brief MOA description, or null
- comparableDrugs: the current standard of care OR the closest approved/late-stage competitor in the same disease area — even if the mechanism differs. Examples: for a new glaucoma drug → "latanoprost, timolol"; for a malaria vaccine → "RTS,S/AS01 (Mosquirix), R21/Matrix-M"; for a Friedreich's ataxia compound → "omaveloxolone (Skyclarys)". Write the disease-area competitive landscape, not just same-mechanism drugs. Return null ONLY when the indication is unclear or genuinely no treatments exist.
- unmetNeed: specific clinical gap this addresses vs current standard of care, or null

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

function buildGapFillSystemPrompt(fields: string[]): string {
  const lines = [
    `You are a biotech licensing analyst. Return a JSON object with exactly these fields: ${fields.join(", ")}. Provide the best available value for each field based on the text, or null if genuinely not determinable.`,
  ];
  if (fields.includes("target")) {
    lines.push(`target: the primary molecular target using the standard clinical name (e.g. "PD-1", "PD-L1", "HER2", "EGFR", "KRAS", "VEGF", "androgen receptor", "BCR-ABL"). Use HGNC gene symbol only when no widely recognized clinical name exists. Infer from contextual language — "mutant RAS" → "KRAS", "PD-L1 checkpoint" → "PD-L1", "HER2-positive" → "HER2". Return null only if no molecular target is identifiable.`);
  }
  if (fields.includes("modality")) {
    lines.push(`modality: MUST be one of exactly: small molecule | antibody | bispecific antibody | car-t | gene therapy | gene editing | mrna therapy | cell therapy | peptide | sirna | adc | protac | vaccine | nanoparticle | diagnostic | platform technology | unknown`);
  }
  if (fields.includes("indication")) {
    lines.push(`indication: the primary disease indication using a MeSH disease name. Prefer the most specific applicable term: "non-small cell lung cancer" not "lung cancer" or "cancer"; "glioblastoma" not "brain cancer"; "chronic lymphocytic leukemia" not "leukemia". Only use a broad term when the text genuinely does not specify the disease subtype. Return null only if no disease is mentioned.`);
  }
  if (fields.includes("developmentStage")) {
    lines.push(`developmentStage: MUST be one of exactly: discovery | preclinical | phase 1 | phase 2 | phase 3 | approved | unknown. Infer from context — "animal model efficacy", "in vivo proof of concept" → preclinical; "dose escalation", "enrolled patients" → phase 1 or phase 2; "IND-enabling" → preclinical; "FDA approved" → approved.`);
  }
  return lines.join("\n");
}

// ── Shared helpers (used by both classifyAsset and the Batch API path) ───────

function buildClassifyInputText(
  title: string,
  description: string,
  abstract: string | undefined,
  ctx: AssetContext | undefined,
): string {
  const contextLines: string[] = [];
  if (ctx?.categories?.length) contextLines.push(`Tags/Categories: ${ctx.categories.join(", ")}`);
  if (ctx?.patentStatus && ctx.patentStatus !== "unknown") contextLines.push(`Patent Status: ${ctx.patentStatus}`);
  if (ctx?.licensingStatus && ctx.licensingStatus !== "unknown") contextLines.push(`Licensing Status: ${ctx.licensingStatus}`);
  if (ctx?.inventors?.length) contextLines.push(`Inventors: ${ctx.inventors.join(", ")}`);
  if (ctx?.sourceUrl) contextLines.push(`Source URL: ${ctx.sourceUrl}`);

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
  const gapFillFields = ctx?.fieldsToGenerate?.length ? ctx.fieldsToGenerate : null;
  const gapFillBlock = gapFillFields
    ? `\nGAP-FILL MODE: Only generate values for these fields: ${gapFillFields.join(", ")}. For ALL other output fields return "unknown" or null — do NOT attempt to derive them.`
    : "";

  return [
    `Title: ${title}`,
    description && description !== title ? `Description: ${description.slice(0, 2000)}` : "",
    abstract ? `Abstract: ${abstract.slice(0, 2000)}` : "",
    ...contextLines,
    knownBlock,
    focusBlock,
    gapFillBlock,
  ].filter(Boolean).join("\n");
}

function parseClassifyResponse(
  text: string,
  usage: { prompt_tokens?: number; completion_tokens?: number } | undefined,
  gapFillFields: string[] | null,
): ClassifyResult {
  const parsed = JSON.parse(text.replace(/```json?|```/g, "").trim());

  const assetClass: AssetClass = gapFillFields
    ? "drug_biologic"
    : ASSET_CLASSES.has(parsed.assetClass) ? parsed.assetClass : "other";
  const isDrug = assetClass === "drug_biologic";

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

  const rawIndication = isDrug ? nullIfUnknown(parsed.indication) : null;
  const rawTarget = isDrug ? nullIfUnknown(parsed.target) : null;
  const indication = !isDrug ? null : (rawIndication ? sanitizeToVocab(rawIndication, "indication") : "unknown");
  const target = !isDrug ? null : (rawTarget ? sanitizeToVocab(rawTarget, "target") : "unknown");

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
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
    },
  };
}

const CLASSIFY_FALLBACK: ClassifyResult = {
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

export async function classifyAsset(
  title: string,
  description: string,
  abstract?: string,
  model: "gpt-4o-mini" | "gpt-4o" = "gpt-4o-mini",
  throwOnError = false,
  ctx?: AssetContext,
): Promise<ClassifyResult> {
  const gapFillFields = ctx?.fieldsToGenerate?.length ? ctx.fieldsToGenerate : null;

  // Gap-fill JSON schema: structurally restrict the API response to only the requested fields.
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
    const response = await getOpenAI().chat.completions.create({
      model,
      temperature: 0,
      // Gap-fill: up to 8 short string fields — 500 tokens is sufficient.
      // Full pass: full drug_biologic JSON with categories[], deviceAttributes etc. — needs 1000.
      max_tokens: gapFillFields ? 500 : 1000,
      response_format: gapFillSchema,
      messages: [
        { role: "system", content: gapFillFields ? buildGapFillSystemPrompt(gapFillFields) : SYSTEM_PROMPT },
        { role: "user", content: buildClassifyInputText(title, description, abstract, ctx) },
      ],
    });

    const text = response.choices[0]?.message?.content ?? "{}";
    return parseClassifyResponse(text, response.usage, gapFillFields);
  } catch (e) {
    if (throwOnError) throw e;
    return CLASSIFY_FALLBACK;
  }
}

// ── OpenAI Batch API support ──────────────────────────────────────────────────

export interface BatchClassifyItem {
  id: number;
  title: string;
  description: string;
  abstract?: string;
  model: "gpt-4o" | "gpt-4o-mini";
  ctx?: AssetContext;
}

function buildBatchRequest(item: BatchClassifyItem): object {
  const gapFillFields = item.ctx?.fieldsToGenerate?.length ? item.ctx.fieldsToGenerate : null;
  const responseFormat = gapFillFields
    ? {
        type: "json_schema",
        json_schema: {
          name: "gap_fill_output",
          strict: true,
          schema: {
            type: "object",
            properties: Object.fromEntries(gapFillFields.map((f) => [f, { type: ["string", "null"] }])),
            required: gapFillFields,
            additionalProperties: false,
          },
        },
      }
    : { type: "json_object" };

  return {
    custom_id: String(item.id),
    method: "POST",
    url: "/v1/chat/completions",
    body: {
      model: item.model,
      temperature: 0,
      max_tokens: gapFillFields ? 500 : 1000,
      response_format: responseFormat,
      messages: [
        { role: "system", content: gapFillFields ? buildGapFillSystemPrompt(gapFillFields) : SYSTEM_PROMPT },
        { role: "user", content: buildClassifyInputText(item.title, item.description, item.abstract, item.ctx) },
      ],
    },
  };
}

/** Submits a batch of classify requests to the OpenAI Batch API. Returns the batch ID. */
export async function submitClassifyBatch(items: BatchClassifyItem[]): Promise<string> {
  const client = getOpenAI();
  const jsonl = items.map((item) => JSON.stringify(buildBatchRequest(item))).join("\n");

  const uploadedFile = await client.files.create({
    file: await toFile(Buffer.from(jsonl, "utf-8"), "classify_batch.jsonl", { type: "application/jsonl" }),
    purpose: "batch",
  });

  const batch = await client.batches.create({
    input_file_id: uploadedFile.id,
    endpoint: "/v1/chat/completions",
    completion_window: "24h",
  });

  console.log(`[classifyBatch] Submitted ${items.length} items → batch ${batch.id}`);
  return batch.id;
}

export interface ClassifyBatchStatus {
  status: string;
  completed: number;
  total: number;
  outputFileId?: string;
}

/** Polls the OpenAI Batch API for current status. */
export async function getClassifyBatchStatus(batchId: string): Promise<ClassifyBatchStatus> {
  const client = getOpenAI();
  const batch = await client.batches.retrieve(batchId);
  return {
    status: batch.status,
    completed: batch.request_counts?.completed ?? 0,
    total: batch.request_counts?.total ?? 0,
    outputFileId: batch.output_file_id ?? undefined,
  };
}

/** Downloads and parses the output JSONL from a completed batch. */
export async function processClassifyBatchOutput(outputFileId: string): Promise<Map<number, ClassifyResult>> {
  const client = getOpenAI();
  const file = await client.files.content(outputFileId);
  const text = await file.text();
  const lines = text.split("\n").filter(Boolean);

  const results = new Map<number, ClassifyResult>();
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      const id = Number(entry.custom_id);
      if (entry.error || !entry.response?.body?.choices?.[0]?.message?.content) continue;
      const content = entry.response.body.choices[0].message.content as string;
      const usage = entry.response.body.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;
      results.set(id, parseClassifyResponse(content, usage, null));
    } catch {
      // Skip malformed lines
    }
  }
  return results;
}

export const MIN_CONTENT_CHARS = 120;
export const MIN_THIN_CHARS = 40;

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
