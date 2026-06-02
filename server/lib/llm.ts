import OpenAI from "openai";
import type { RawSignal, ScoredAsset, BuyerProfile } from "./types";

if (!process.env.OPENAI_API_KEY) {
  console.warn("WARNING: OPENAI_API_KEY is not set. AI extraction will fail.");
}

const clientMini = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const clientFull = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export function isFatalOpenAIError(err: unknown): boolean {
  if (err instanceof OpenAI.AuthenticationError) return true;
  if (err instanceof OpenAI.PermissionDeniedError) return true;
  if (err instanceof OpenAI.RateLimitError) return true;
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

export function friendlyOpenAIError(err: unknown): string {
  if (isFatalOpenAIError(err)) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("401") || msg.includes("invalid_api_key") || msg.includes("Incorrect API key")) {
      return "OpenAI API key is invalid. Please check the OPENAI_API_KEY secret in your Replit settings.";
    }
    if (msg.includes("429") || msg.includes("quota") || msg.includes("insufficient_quota")) {
      return "OpenAI quota exceeded or rate limited. Please check your OpenAI account billing.";
    }
  }
  return "AI service error. Please try again.";
}

// ── System prompt constants (stable prefixes for OpenAI automatic prompt caching) ──

const EXTRACTION_PATENT_SYSTEM = `You are a biotech patent analyst. Extract structured drug asset information from patent records.

Return ONLY valid JSON with these fields:
- asset_name: Look in the patent TITLE for the compound class or drug name (e.g. "KRAS G12C inhibitors", "Anti-PD-1 antibody"). Do NOT use "method", "composition", "compound", or "formula" as the asset name. Extract the specific therapeutic agent class.
- target: The molecular or biological target (e.g. "KRAS G12C", "PD-1", "HER2"). Find it in the title or description.
- modality: The therapy type based on context clues in the description.
- indication: The disease or condition stated in the patent purpose.
- development_stage: For patents, typically "discovery" or "preclinical" unless clinical data is mentioned.
- owner_name: Use the ASSIGNEE name provided in the metadata/institution field — do not guess.
- owner_type: "company" if assignee is a pharma/biotech company; "university" if a university or research institution.
- licensing_status: "unknown" for most patents unless explicitly stated as available.
- patent_status: "patented" (it is a granted patent record).
- summary: 2-3 sentences describing mechanism, target, and intended disease indication.
- matching_tags: 3-5 relevant keyword tags.

Return ONLY valid JSON. If you cannot determine a field with reasonable confidence, use "unknown".`;

const EXTRACTION_TECH_TRANSFER_SYSTEM = `You are a biotech licensing analyst. Extract structured drug asset information from university technology transfer listings.

Return ONLY valid JSON with these fields:
- asset_name: The specific drug, compound, platform, or therapy name as described (string)
- target: The molecular or biological target (string)
- modality: therapy type — one of: "small molecule", "antibody", "CAR-T", "gene therapy", "mRNA therapy", "peptide", "bispecific antibody", "ADC", "cell therapy", "oncolytic virus", "RNA interference", "antisense oligonucleotide", "protein", "vaccine", "other" (string)
- indication: disease or condition being addressed (string)
- development_stage: one of: "discovery", "preclinical", "phase 1", "phase 2", "phase 3", "approved" (string)
- owner_name: the university or institution name (string)
- owner_type: "university"
- institution: the university or institution name (string)
- licensing_status: "available" (tech transfer listings are explicitly available for licensing)
- patent_status: use the metadata hint if available, otherwise "patent pending" (string)
- summary: 2-3 sentence summary of the mechanism and commercial significance (string)
- matching_tags: array of 3-5 relevant keyword tags`;

const EXTRACTION_GENERAL_SYSTEM = `You are a biotech intelligence analyst. Extract structured drug asset information from research records.

Return ONLY valid JSON with these fields:
- asset_name: specific drug, compound, therapy, or platform name (string; "unknown" if unclear)
- target: molecular or biological target (string)
- modality: therapy type — one of: "small molecule", "antibody", "CAR-T", "gene therapy", "mRNA therapy", "peptide", "bispecific antibody", "ADC", "cell therapy", "oncolytic virus", "RNA interference", "antisense oligonucleotide", "protein", "vaccine", "other" (string)
- indication: disease or condition (string)
- development_stage: one of: "discovery", "preclinical", "phase 1", "phase 2", "phase 3", "approved" (string)
- owner_name: name of the company, university, or individual owner/sponsor (string)
- owner_type: "university" | "company" | "unknown"
- institution: academic or research institution if applicable (string)
- licensing_status: e.g. "available", "licensed", "not available", "unknown" (string)
- patent_status: e.g. "patented", "patent pending", "not patented", "unknown" (string)
- summary: 2-3 sentence summary of mechanism and significance (string)
- matching_tags: array of 3-5 relevant keyword tags`;

const EXTRACTION_BATCH_SYSTEM = `You are a biotech intelligence analyst. Extract structured drug asset information from research signals.

Return ONLY a JSON object with a single key "items" whose value is an array of objects in the same order as the input.
Each object must have these fields:
- asset_name: specific drug, compound, therapy, or platform name (use the title as the name if no specific asset is named)
- target: molecular or biological target ("unknown" if not mentioned)
- modality: one of: "small molecule","antibody","CAR-T","gene therapy","mRNA therapy","peptide","bispecific antibody","ADC","cell therapy","oncolytic virus","RNA interference","antisense oligonucleotide","protein","vaccine","other","unknown"
- indication: disease or condition ("unknown" if not stated)
- development_stage: one of: "discovery","preclinical","phase 1","phase 2","phase 3","approved","unknown"
- owner_name: company, university, or sponsor name
- owner_type: "university" | "company" | "unknown"
- institution: academic or research institution if applicable
- licensing_status: "available" | "licensed" | "not available" | "unknown"
- patent_status: "patented" | "patent pending" | "not patented" | "unknown"
- summary: 1-2 sentence summary of mechanism and biotech significance
- matching_tags: array of 3-5 keyword tags`;

const WHY_IT_MATTERS_SYSTEM = `You are a biotech business development analyst writing for a pharma BD executive. In 2-3 sentences, explain why a drug asset may matter commercially. Focus on: novelty of the target/mechanism, how early and reachable it appears, and what type of buyer might care. Be specific and direct. Respond with only the 2-3 sentence explanation. No headers.`;

const REPORT_NARRATIVE_SYSTEM = `You are a senior biotech intelligence analyst writing commercial opportunity reports for pharma business development teams.

Write a professional intelligence brief — 3-4 substantive paragraphs — covering:
1. Why the search query is commercially relevant now
2. What the top ranked assets represent as a portfolio of opportunities
3. What themes emerge across the assets (modalities, target areas, development patterns)
4. What actionable next steps a BD team should consider

Write in the voice of a premium commercial intelligence service. Use precise language. No bullet points. No headers. Just flowing professional analysis.`;

const DOSSIER_SYSTEM = `You are a senior biotech licensing analyst writing a confidential deal brief for a pharma BD executive.

CRITICAL RULES — violating these makes the dossier worse, not better:

1. The reader already sees name, target, modality, indication, and stage on the page. Do NOT restate them in opening sentences.
2. Each section below has a DATA CONTRACT. If the input marks a field as [NOT IN DATABASE], you MUST use the exact phrase specified. Do not substitute your own knowledge, do not infer from the target name, do not say "appears to be first-in-class" unless the innovation claim field explicitly says so. Filling a data gap with training-set knowledge is a hallucination — it destroys trust.
3. Write only what the provided data supports. A shorter honest section is better than a longer fabricated one.

Write exactly five sections with these headers:

**Commercial Thesis**
Lead with commercial insight — why this asset matters to a buyer, grounded in the MECHANISM, INNOVATION CLAIM, and UNMET NEED fields provided. If MECHANISM is [NOT IN DATABASE], write the thesis from what is available. If all three enriched fields are [NOT IN DATABASE], base the thesis strictly on the summary text and stage, and state that enriched data is pending.

**Competitive Position**
If COMPETING PROGRAMS is provided: analyze this asset's position by name and stage — what the competition means for deal value, differentiation, and timing. If COMPARABLE DRUGS is provided, use it.
If both COMPETING PROGRAMS and COMPARABLE DRUGS are [NOT IN DATABASE], write exactly: "Competitive intelligence for this target/indication is not available in EdenRadar's current dataset. This reflects database coverage at time of generation, not a signal about market crowding or novelty — independent competitive research is required before drawing conclusions."

**Licensing & Deal Dynamics**
Use the LICENSING STATUS, IP TYPE, PATENT STATUS, and LICENSING READINESS fields to assess deal structure and acquirer profile. Be specific: distinguish between exclusive option, sponsored research agreement, and outright license based on stage and IP position. Name the likely acquirer type by therapeutic focus, not just "a pharma company."
If IP TYPE and PATENT STATUS are both unknown, note that IP position needs to be independently verified before deal structuring.

**Key Questions Before Proceeding**
Specific, asset-level questions the BD team must answer before proceeding — not generic risk disclaimers. Draw these from actual gaps: what's unknown in the provided data (unknown fields, [NOT IN DATABASE] markers, data-sparse flag). Each question should be answerable by a specific action (calling the TTO, reviewing the IND, requesting a data package).

**Next Action**
One sentence. Name the institution. Specify the action (request IND, review Phase 1 protocol, schedule introductory call with TTO licensing officer). Add timing context if the stage or conference calendar suggests urgency. Do not write "contact the TTO" as a complete sentence.

Tone: precise, opinionated, free of filler. Morgan Stanley healthcare equity note style — no "it is worth noting," no "as mentioned above," no "in conclusion."`;


// ── Message builders ──────────────────────────────────────────────────────────

function buildExtractionMessages(signal: RawSignal, text: string): { system: string; user: string } {
  if (signal.source_type === "patent") {
    return {
      system: EXTRACTION_PATENT_SYSTEM,
      user: `Source type: patent
Assignee/Owner: ${signal.institution_or_sponsor || signal.authors_or_owner}
Title: ${signal.title}
Abstract/Description: ${text.slice(0, 2000)}`,
    };
  }

  if (signal.source_type === "tech_transfer") {
    return {
      system: EXTRACTION_TECH_TRANSFER_SYSTEM,
      user: `Source type: tech_transfer
Institution: ${signal.institution_or_sponsor}
Title: ${signal.title}
Description: ${text.slice(0, 2000)}`,
    };
  }

  return {
    system: EXTRACTION_GENERAL_SYSTEM,
    user: `Source type: ${signal.source_type}
Institution/Sponsor: ${signal.institution_or_sponsor}
Owner/Author: ${signal.authors_or_owner}
Title: ${signal.title}
Text: ${text.slice(0, 2000)}`,
  };
}

function selectModel(signal: RawSignal): { client: OpenAI; model: string } {
  if (signal.source_type === "patent" || signal.source_type === "tech_transfer") {
    return { client: clientFull, model: "gpt-4o" };
  }
  return { client: clientMini, model: "gpt-4o-mini" };
}

export async function extractAssetFromSignal(
  signal: RawSignal
): Promise<Partial<ScoredAsset> | null> {
  const text = signal.text?.trim();
  if (!text || text === "No abstract available.") return null;

  const { system, user } = buildExtractionMessages(signal, text);
  const { client, model } = selectModel(signal);

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content);

    return {
      asset_name: parsed.asset_name ?? "unknown",
      target: parsed.target ?? "unknown",
      modality: parsed.modality ?? "unknown",
      indication: parsed.indication ?? "unknown",
      development_stage: parsed.development_stage ?? "unknown",
      owner_name: parsed.owner_name ?? signal.institution_or_sponsor ?? "unknown",
      owner_type: parsed.owner_type ?? "unknown",
      institution: parsed.institution ?? signal.institution_or_sponsor ?? "unknown",
      licensing_status: parsed.licensing_status ?? "unknown",
      patent_status: parsed.patent_status ?? "unknown",
      summary: parsed.summary ?? "",
      matching_tags: Array.isArray(parsed.matching_tags) ? parsed.matching_tags : [],
    };
  } catch (err) {
    if (isFatalOpenAIError(err)) throw err;
    if (model === "gpt-4o") {
      try {
        const fallback = await clientMini.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          response_format: { type: "json_object" },
          temperature: 0.1,
        });
        const fc = fallback.choices[0]?.message?.content;
        if (!fc) return null;
        const fp = JSON.parse(fc);
        return {
          asset_name: fp.asset_name ?? "unknown",
          target: fp.target ?? "unknown",
          modality: fp.modality ?? "unknown",
          indication: fp.indication ?? "unknown",
          development_stage: fp.development_stage ?? "unknown",
          owner_name: fp.owner_name ?? signal.institution_or_sponsor ?? "unknown",
          owner_type: fp.owner_type ?? "unknown",
          institution: fp.institution ?? signal.institution_or_sponsor ?? "unknown",
          licensing_status: fp.licensing_status ?? "unknown",
          patent_status: fp.patent_status ?? "unknown",
          summary: fp.summary ?? "",
          matching_tags: Array.isArray(fp.matching_tags) ? fp.matching_tags.map(String) : [],
        };
      } catch (fallbackErr: any) {
        console.warn("[llm] gpt-4o-mini fallback failed:", fallbackErr?.message);
        return null;
      }
    }
    console.error("extractAssetFromSignal error:", err);
    return null;
  }
}

export async function extractAssetsFromSignalBatch(
  signals: RawSignal[]
): Promise<(Partial<ScoredAsset> | null)[]> {
  if (signals.length === 0) return [];

  const signalLines = signals.map((s, i) => {
    const text = (s.text ?? "").slice(0, 1000).replace(/\n+/g, " ");
    const inst = s.institution_or_sponsor || s.authors_or_owner || "";
    return `[${i + 1}] SOURCE: ${s.source_type} | INSTITUTION: ${inst} | TITLE: ${s.title} | TEXT: ${text}`;
  }).join("\n\n");

  try {
    const response = await clientMini.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: EXTRACTION_BATCH_SYSTEM },
        { role: "user", content: `Extract from the following ${signals.length} signals:\n\n${signalLines}` },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return signals.map(() => null);

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return signals.map(() => null);
    }

    const obj = parsed as Record<string, unknown>;
    const arr: unknown[] = Array.isArray(obj?.items)
      ? obj.items as unknown[]
      : Array.isArray(obj?.results)
        ? obj.results as unknown[]
        : Array.isArray(obj?.signals)
          ? obj.signals as unknown[]
          : Array.isArray(parsed)
            ? parsed as unknown[]
            : [];

    if (arr.length !== signals.length) {
      return signals.map(() => null);
    }

    return arr.map((item: unknown) => {
      if (!item || typeof item !== "object") return null;
      const p = item as Record<string, unknown>;
      return {
        asset_name: String(p.asset_name ?? "unknown"),
        target: String(p.target ?? "unknown"),
        modality: String(p.modality ?? "unknown"),
        indication: String(p.indication ?? "unknown"),
        development_stage: String(p.development_stage ?? "unknown"),
        owner_name: String(p.owner_name ?? "unknown"),
        owner_type: (p.owner_type === "university" || p.owner_type === "company") ? p.owner_type : "unknown" as const,
        institution: String(p.institution ?? "unknown"),
        licensing_status: String(p.licensing_status ?? "unknown"),
        patent_status: String(p.patent_status ?? "unknown"),
        summary: String(p.summary ?? ""),
        matching_tags: Array.isArray(p.matching_tags) ? p.matching_tags.map(String) : [],
      } as Partial<ScoredAsset>;
    });
  } catch (err) {
    if (isFatalOpenAIError(err)) throw err;
    console.error("extractAssetsFromSignalBatch error:", err);
    return signals.map(() => null);
  }
}

export async function generateWhyItMatters(
  asset: ScoredAsset,
  buyerProfile?: BuyerProfile
): Promise<string> {
  const profileContext = buyerProfile
    ? `Buyer focus: ${[...buyerProfile.therapeutic_areas, ...buyerProfile.indication_keywords].join(", ") || "broad biotech"}.`
    : "";

  const userContent = `Asset: ${asset.asset_name}
Target: ${asset.target}
Modality: ${asset.modality}
Indication: ${asset.indication}
Stage: ${asset.development_stage}
Owner: ${asset.owner_name} (${asset.owner_type})
Licensing: ${asset.licensing_status}
Summary: ${asset.summary}
${profileContext}`.trim();

  try {
    const response = await clientMini.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: WHY_IT_MATTERS_SYSTEM },
        { role: "user", content: userContent },
      ],
      temperature: 0.3,
      max_tokens: 200,
    });
    return response.choices[0]?.message?.content?.trim() ?? "";
  } catch (err) {
    if (isFatalOpenAIError(err)) throw err;
    return "";
  }
}

export async function generateReportNarrative(
  assets: ScoredAsset[],
  query: string,
  buyerProfile: BuyerProfile
): Promise<string> {
  const assetSummaries = assets
    .slice(0, 8)
    .map(
      (a, i) =>
        `${i + 1}. ${a.asset_name} (${a.modality}, ${a.indication}, ${a.development_stage}) — ${a.owner_name} — Score: ${a.score}/100`
    )
    .join("\n");

  const profileDesc = [
    buyerProfile.therapeutic_areas.length
      ? `Therapeutic focus: ${buyerProfile.therapeutic_areas.join(", ")}`
      : null,
    buyerProfile.modalities.length
      ? `Preferred modalities: ${buyerProfile.modalities.join(", ")}`
      : null,
    buyerProfile.preferred_stages.length
      ? `Target stages: ${buyerProfile.preferred_stages.join(", ")}`
      : null,
    buyerProfile.owner_type_preference !== "any"
      ? `Prefers ${buyerProfile.owner_type_preference}-owned assets`
      : null,
  ]
    .filter(Boolean)
    .join(". ");

  const userContent = `Query: ${query}
Buyer profile: ${profileDesc || "general biotech buyer"}

Top assets found:
${assetSummaries}`;

  try {
    const response = await clientFull.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: REPORT_NARRATIVE_SYSTEM },
        { role: "user", content: userContent },
      ],
      temperature: 0.4,
      max_tokens: 800,
    });
    return response.choices[0]?.message?.content?.trim() ?? "";
  } catch (err) {
    if (isFatalOpenAIError(err)) throw err;
    try {
      const fallback = await clientMini.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: REPORT_NARRATIVE_SYSTEM },
          { role: "user", content: userContent },
        ],
        temperature: 0.4,
        max_tokens: 600,
      });
      return fallback.choices[0]?.message?.content?.trim() ?? "";
    } catch {
      return "";
    }
  }
}

export interface DossierContext {
  mechanismOfAction?: string | null;
  innovationClaim?: string | null;
  unmetNeed?: string | null;
  comparableDrugs?: string | null;
  abstract?: string | null;
  ipType?: string | null;
  licensingReadiness?: string | null;
  dataSparse?: boolean;
  competingAssets?: Array<{ assetName: string; developmentStage: string; institution: string; modality?: string | null }>;
}

const NOT_IN_DB = "[NOT IN DATABASE]";
function val(v: string | null | undefined, fallback = NOT_IN_DB): string {
  if (!v || v === "unknown" || v === "n/a" || v.trim() === "") return fallback;
  return v;
}

function buildDossierUserContent(asset: ScoredAsset, ctx?: DossierContext): string {
  const lines: string[] = [];

  // ── Core identity (always present) ────────────────────────────────────────
  lines.push(`Asset: ${asset.asset_name}`);
  lines.push(`Target: ${val(asset.target)} | Modality: ${val(asset.modality)} | Indication: ${val(asset.indication)} | Stage: ${val(asset.development_stage)}`);
  lines.push(`Institution: ${asset.institution} (${asset.owner_type})`);

  if (ctx?.dataSparse) {
    lines.push(`DATA QUALITY FLAG: This asset has a thin public description (<150 chars). Do not invent specifics not supported by the text below.`);
  }

  // ── Summary / description ──────────────────────────────────────────────────
  lines.push(`\nSummary: ${asset.summary || NOT_IN_DB}`);
  if (ctx?.abstract && ctx.abstract.length > 50) {
    lines.push(`Full description: ${ctx.abstract.slice(0, 800)}`);
  }

  // ── Enriched analytical fields — explicit availability markers ─────────────
  lines.push(`\nMECHANISM: ${val(ctx?.mechanismOfAction)}`);
  lines.push(`INNOVATION CLAIM: ${val(ctx?.innovationClaim)}`);
  lines.push(`UNMET NEED: ${ctx?.unmetNeed && ctx.unmetNeed.length > 20 ? ctx.unmetNeed.slice(0, 400) : NOT_IN_DB}`);
  lines.push(`COMPARABLE DRUGS: ${val(ctx?.comparableDrugs)}`);

  // ── IP and licensing ───────────────────────────────────────────────────────
  lines.push(`\nLICENSING STATUS: ${val(asset.licensing_status)}`);
  lines.push(`LICENSING READINESS: ${val(ctx?.licensingReadiness)}`);
  lines.push(`IP TYPE: ${val(ctx?.ipType)}`);
  lines.push(`PATENT STATUS: ${val(asset.patent_status)}`);

  // ── Competitive landscape — explicit when absent ───────────────────────────
  if (ctx?.competingAssets && ctx.competingAssets.length > 0) {
    lines.push(`\nCOMPETING PROGRAMS (${ctx.competingAssets.length} found in database, same target or indication):`);
    ctx.competingAssets.slice(0, 5).forEach((c) => {
      lines.push(`  - ${c.assetName} | ${c.modality ?? "unknown modality"} | ${c.developmentStage} | ${c.institution}`);
    });
  } else {
    lines.push(`\nCOMPETING PROGRAMS: ${NOT_IN_DB}`);
  }

  // ── Supporting signals ─────────────────────────────────────────────────────
  const signals = (asset.signals ?? []).slice(0, 5);
  if (signals.length > 0) {
    lines.push(`\nSupporting signals:`);
    signals.forEach((s) => lines.push(`  - [${s.source_type}] ${s.title} (${s.date})`));
  } else {
    lines.push(`\nSupporting signals: ${NOT_IN_DB}`);
  }

  return lines.join("\n");
}

export async function* streamDossierNarrative(asset: ScoredAsset, fullModel = false, ctx?: DossierContext): AsyncGenerator<string> {
  const model = fullModel ? "gpt-4o" : "gpt-4o-mini";
  const client = fullModel ? clientFull : clientMini;
  // Raised limits: 5 sections × ~200 tokens each = 1000 min; add headroom for opinionated prose
  const maxTokens = fullModel ? 1400 : 1000;

  const stream = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: DOSSIER_SYSTEM },
      { role: "user", content: buildDossierUserContent(asset, ctx) },
    ],
    temperature: 0.4,
    max_tokens: maxTokens,
    stream: true,
  });

  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content ?? "";
    if (text) yield text;
  }
}

export async function generateDossierNarrative(asset: ScoredAsset, ctx?: DossierContext): Promise<string> {
  try {
    const response = await clientMini.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: DOSSIER_SYSTEM },
        { role: "user", content: buildDossierUserContent(asset, ctx) },
      ],
      temperature: 0.4,
      max_tokens: 1000,
    });
    return response.choices[0]?.message?.content?.trim() ?? "";
  } catch (err) {
    if (isFatalOpenAIError(err)) throw err;
    return "";
  }
}
