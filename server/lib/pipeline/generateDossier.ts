import type { ScoredAsset, DossierPayload } from "../types";
import { generateDossierNarrative } from "../llm";

export async function generateDossier(asset: ScoredAsset): Promise<DossierPayload> {
  const narrative = await generateDossierNarrative(asset);
  return {
    asset,
    narrative,
    generated_at: new Date().toISOString(),
  };
}
