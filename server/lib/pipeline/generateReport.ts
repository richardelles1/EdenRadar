import type { ScoredAsset, BuyerProfile, ReportPayload } from "../types";
import { generateReportNarrative } from "../llm";

export async function generateReport(
  assets: ScoredAsset[],
  query: string,
  buyerProfile: BuyerProfile
): Promise<ReportPayload> {
  const top = assets.slice(0, 10);
  const narrative = await generateReportNarrative(top, query, buyerProfile);

  const profileParts = [
    buyerProfile.therapeutic_areas.length
      ? `Therapeutic focus: ${buyerProfile.therapeutic_areas.join(", ")}`
      : null,
    buyerProfile.modalities.length
      ? `Modalities: ${buyerProfile.modalities.join(", ")}`
      : null,
    buyerProfile.preferred_stages.length
      ? `Development stages: ${buyerProfile.preferred_stages.join(", ")}`
      : null,
    buyerProfile.owner_type_preference !== "any"
      ? `Owner type preference: ${buyerProfile.owner_type_preference}`
      : null,
    buyerProfile.indication_keywords.length
      ? `Indication keywords: ${buyerProfile.indication_keywords.join(", ")}`
      : null,
  ].filter(Boolean);

  const buyerProfileSummary =
    profileParts.length > 0
      ? profileParts.join(" | ")
      : "General biotech intelligence scan — no specific buyer thesis configured";

  const topAssetNames = top
    .slice(0, 3)
    .map((a) => a.asset_name)
    .join(", ");

  return {
    title: `HelixRadar Intelligence Report: ${query.slice(0, 60)}`,
    executive_summary: `This report covers the top ${top.length} ranked biotech opportunities identified across multiple data sources for the query "${query}". Leading assets include ${topAssetNames || "various candidates"} based on novelty, licensability, and stage readiness scores.`,
    buyer_profile_summary: buyerProfileSummary,
    top_assets: top,
    narrative,
    query,
    generated_at: new Date().toISOString(),
  };
}
