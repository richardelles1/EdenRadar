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

export async function extractAssetFromSignal(
  signal: RawSignal
): Promise<Partial<ScoredAsset> | null> {
  const text = signal.text?.trim();
  if (!text || text === "No abstract available.") return null;

  const prompt = `You are a biotech intelligence analyst. Extract structured drug asset information from the following ${signal.source_type} record.

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

  try {
    const response = await clientMini.chat.completions.create({
      model: "gpt-4o-mini",
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
    console.error("extractAssetFromSignal error:", err);
    return null;
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
