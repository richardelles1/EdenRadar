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

function buildExtractionPrompt(signal: RawSignal, text: string): string {
  if (signal.source_type === "patent") {
    return `You are a biotech patent analyst. Extract structured drug asset information from the following patent record.

IMPORTANT PATENT EXTRACTION RULES:
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

Return ONLY valid JSON. If you cannot determine a field with reasonable confidence, use "unknown".

Source type: patent
Assignee/Owner: ${signal.institution_or_sponsor || signal.authors_or_owner}
Title: ${signal.title}
Abstract/Description: ${text.slice(0, 2000)}`;
  }

  if (signal.source_type === "tech_transfer") {
    return `You are a biotech licensing analyst. Extract structured drug asset information from the following university technology transfer listing.

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
- matching_tags: array of 3-5 relevant keyword tags

Source type: tech_transfer
Institution: ${signal.institution_or_sponsor}
Title: ${signal.title}
Description: ${text.slice(0, 2000)}`;
  }

  return `You are a biotech intelligence analyst. Extract structured drug asset information from the following ${signal.source_type} record.

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
- matching_tags: array of 3-5 relevant keyword tags

Source type: ${signal.source_type}
Institution/Sponsor: ${signal.institution_or_sponsor}
Owner/Author: ${signal.authors_or_owner}
Title: ${signal.title}
Text: ${text.slice(0, 2000)}`;
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

  const prompt = buildExtractionPrompt(signal, text);
  const { client, model } = selectModel(signal);

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
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
        const fallbackPrompt = buildExtractionPrompt(signal, text);
        const fallback = await clientMini.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: fallbackPrompt }],
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
          matching_tags: Array.isArray(fp.matching_tags) ? fp.matching_tags : [],
        };
      } catch {
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

  const prompt = `You are a biotech intelligence analyst. Extract structured drug asset information from the following ${signals.length} research signals.

Return ONLY a JSON object with a single key "items" whose value is an array of exactly ${signals.length} objects in the same order as the input.
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
- matching_tags: array of 3-5 keyword tags

Signals:
${signalLines}`;

  try {
    const response = await clientMini.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
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

  const prompt = `You are a biotech business development analyst writing for a pharma BD executive.

In 2-3 sentences, explain why this drug asset may matter commercially. Focus on: novelty of the target/mechanism, how early and reachable it appears, and what type of buyer might care. Be specific and direct.

Asset: ${asset.asset_name}
Target: ${asset.target}
Modality: ${asset.modality}
Indication: ${asset.indication}
Stage: ${asset.development_stage}
Owner: ${asset.owner_name} (${asset.owner_type})
Licensing: ${asset.licensing_status}
Summary: ${asset.summary}
${profileContext}

Respond with only the 2-3 sentence explanation. No headers.`;

  try {
    const response = await clientMini.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
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

  const prompt = `You are a senior biotech intelligence analyst writing a commercial opportunity report for a pharma business development team.

Write a professional intelligence brief — 3-4 substantive paragraphs — covering:
1. Why this search query (${query}) is commercially relevant now
2. What the top ranked assets represent as a portfolio of opportunities
3. What themes emerge across the assets (modalities, target areas, development patterns)
4. What actionable next steps a BD team should consider

Buyer profile: ${profileDesc || "general biotech buyer"}

Top assets found:
${assetSummaries}

Write in the voice of a premium commercial intelligence service. Use precise language. No bullet points. No headers. Just flowing professional analysis.`;

  try {
    const response = await clientFull.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
      max_tokens: 800,
    });
    return response.choices[0]?.message?.content?.trim() ?? "";
  } catch (err) {
    if (isFatalOpenAIError(err)) throw err;
    try {
      const fallback = await clientMini.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.4,
        max_tokens: 600,
      });
      return fallback.choices[0]?.message?.content?.trim() ?? "";
    } catch {
      return "";
    }
  }
}

export async function generateDossierNarrative(asset: ScoredAsset): Promise<string> {
  const signals = asset.signals
    .slice(0, 5)
    .map((s) => `- [${s.source_type}] ${s.title} (${s.date})`)
    .join("\n");

  const prompt = `You are a senior biotech deal analyst writing a confidential asset dossier for a pharma licensing team.

Write a detailed commercial opportunity brief for this drug asset. Structure it as:

**Executive Summary** (1 paragraph): What this asset is, why it's interesting, and what type of buyer should care.

**Commercial Rationale** (1-2 paragraphs): Mechanism novelty, competitive position, why this target/indication/modality combination matters now.

**Licensing Outlook** (1 paragraph): Likelihood of access (university origin, licensing status), typical deal structure for this type of asset, who would be the natural acquirer or licensor.

**Key Risks & Unknowns** (1 paragraph): What is uncertain — data gaps, competitive threats, regulatory challenges, ownership ambiguity.

**Suggested Next Step** (1-2 sentences): Concrete actionable recommendation for a BD team.

Asset:
Name: ${asset.asset_name}
Target: ${asset.target}
Modality: ${asset.modality}
Indication: ${asset.indication}
Stage: ${asset.development_stage}
Owner: ${asset.owner_name} (${asset.owner_type})
Institution: ${asset.institution}
Licensing Status: ${asset.licensing_status}
Patent Status: ${asset.patent_status}
Score: ${asset.score}/100
Summary: ${asset.summary}

Supporting Evidence:
${signals}

Write in precise, professional language suitable for a BD executive.`;

  try {
    const response = await clientFull.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 900,
    });
    return response.choices[0]?.message?.content?.trim() ?? "";
  } catch (err) {
    if (isFatalOpenAIError(err)) throw err;
    try {
      const fallback = await clientMini.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 700,
      });
      return fallback.choices[0]?.message?.content?.trim() ?? "";
    } catch {
      return "";
    }
  }
}
