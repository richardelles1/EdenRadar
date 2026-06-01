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

The reader already sees the asset name, target, modality, indication, and development stage on the page. Do NOT open with "XYZ is a [modality] targeting [target] for [indication]" — that wastes the first sentence. Start with commercial insight, not a data recap.

Write four sections with exactly these markdown headers:

**Commercial Thesis**
Why this asset is commercially interesting — what makes the mechanism or approach non-obvious, what market gap it fills, and whether this is a first-mover, fast-follower, or late entrant. If the innovation claim or unmet need data is provided, use it directly rather than inferring. If data is thin, say so honestly — do not pad with generic biotech boilerplate.

**Competitive Position**
How this asset sits relative to the programs listed in the competitive landscape. Reference them by name and stage if provided. Explain what this asset's differentiation means for deal value — don't just say "the field is competitive." If no competitive data is available, state that explicitly.

**Licensing & Deal Dynamics**
Realistic access assessment. Distinguish between deal structures (sponsored research, exclusive option, exclusive license, co-development) based on the asset's stage, institution type, and IP position. Identify the most likely acquirer profile by company type and therapeutic focus — not just "a pharma company." If licensing_readiness or patent status is provided, use it.

**Key Questions Before Proceeding**
Specific gaps the BD team must resolve — not generic "clinical trials carry risk." Name the missing data points, the IP ambiguities, the regulatory pathway questions, or the competitive threats that would change the thesis. If the asset is data-sparse, flag that as the primary uncertainty.

**Next Action**
One specific, concrete action sentence. Name the institution, the contact method, and the reason for urgency if applicable. Not "contact the TTO" — something like "Request the IND filing and Phase 1 enrollment data from [institution]'s OTC before the next ASCO abstract deadline."

Tone: precise, opinionated, free of filler. Write like a Morgan Stanley healthcare equity note — no "it is worth noting," no "as mentioned above," no "in conclusion."`;


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

function buildDossierUserContent(asset: ScoredAsset, ctx?: DossierContext): string {
  const lines: string[] = [];

  // Core identity
  lines.push(`Asset: ${asset.asset_name}`);
  lines.push(`Target: ${asset.target} | Modality: ${asset.modality} | Indication: ${asset.indication} | Stage: ${asset.development_stage}`);
  lines.push(`Institution: ${asset.institution} (${asset.owner_type})`);
  lines.push(`Licensing status: ${asset.licensing_status}${ctx?.licensingReadiness ? ` / readiness: ${ctx.licensingReadiness}` : ""}`);
  lines.push(`IP: patent_status=${asset.patent_status}${ctx?.ipType ? ` / ip_type=${ctx.ipType}` : ""}`);

  if (ctx?.dataSparse) {
    lines.push(`DATA NOTE: This asset has a thin public description (< 150 chars). Calibrate confidence accordingly — do not invent specifics.`);
  }

  // Enrich with deep fields when available
  if (asset.summary) lines.push(`\nSummary: ${asset.summary}`);
  if (ctx?.abstract && ctx.abstract.length > 50) lines.push(`\nFull description: ${ctx.abstract.slice(0, 800)}`);
  if (ctx?.mechanismOfAction && ctx.mechanismOfAction !== "unknown") lines.push(`\nMechanism of action: ${ctx.mechanismOfAction}`);
  if (ctx?.innovationClaim && ctx.innovationClaim !== "unknown") lines.push(`\nStated innovation: ${ctx.innovationClaim}`);
  if (ctx?.unmetNeed && ctx.unmetNeed.length > 20) lines.push(`\nUnmet need (from source): ${ctx.unmetNeed.slice(0, 400)}`);
  if (ctx?.comparableDrugs && ctx.comparableDrugs !== "unknown") lines.push(`\nComparable drugs identified: ${ctx.comparableDrugs}`);

  // Competitive landscape
  if (ctx?.competingAssets && ctx.competingAssets.length > 0) {
    lines.push(`\nKnown competing programs (same target or indication, different institutions):`);
    ctx.competingAssets.slice(0, 5).forEach((c) => {
      lines.push(`  - ${c.assetName} | ${c.modality ?? "unknown modality"} | ${c.developmentStage} | ${c.institution}`);
    });
  } else {
    lines.push(`\nNo competing programs identified in database for this target/indication.`);
  }

  // Supporting signals
  const signals = (asset.signals ?? []).slice(0, 5);
  if (signals.length > 0) {
    lines.push(`\nSupporting signals (${signals.length}):`);
    signals.forEach((s) => lines.push(`  - [${s.source_type}] ${s.title} (${s.date})`));
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
