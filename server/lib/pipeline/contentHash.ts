import { createHash } from "crypto";
import type { AssetClass } from "./classifyAsset";

export function computeContentHash(title: string, description: string, abstract?: string): string {
  const normalized = [
    title.toLowerCase().trim(),
    (description || "").toLowerCase().trim(),
    (abstract || "").toLowerCase().trim(),
  ].join("|");

  return createHash("sha256").update(normalized).digest("hex").slice(0, 32);
}

export type CompletenessAsset = {
  assetClass?: AssetClass | string | null;
  // Drug/Biologic fields
  target?: string | null;
  modality?: string | null;
  indication?: string | null;
  developmentStage?: string | null;
  mechanismOfAction?: string | null;
  innovationClaim?: string | null;
  unmetNeed?: string | null;
  comparableDrugs?: string | null;
  licensingReadiness?: string | null;
  ipType?: string | null;
  // Device/Tool/Software attributes (stored in deviceAttributes JSONB)
  deviceAttributes?: Record<string, unknown> | null;
  // Common
  summary?: string | null;
  abstract?: string | null;
  categories?: string[] | null;
  inventors?: string[] | null;
  patentStatus?: string | null;
};

function hasValue(val: unknown): boolean {
  if (val == null) return false;
  if (typeof val === "string") return val.length >= 3 && val !== "unknown" && val !== "";
  if (Array.isArray(val)) return val.length > 0;
  return false;
}

function deviceAttr(attrs: Record<string, unknown> | null | undefined, key: string): unknown {
  return attrs?.[key] ?? null;
}

/**
 * Tiered summary quality score: awards 0, half, or full points based on text length.
 * A rich summary (≥150 chars) earns full credit; a thin one (≥50 chars) earns half.
 */
function summaryScore(summary: string | null | undefined, maxPts: number): number {
  const len = (summary ?? "").length;
  if (len >= 150) return maxPts;
  if (len >= 50) return Math.round(maxPts * 0.5);
  return 0;
}

/**
 * Returns a 0-100 completeness score for the asset.
 *
 * Formula changes (v2):
 *
 * Drug/Biologic — target demoted to a +10 bonus applied after the 100-pt base,
 * then clamped to 100. This stops penalising TTO assets that structurally cannot
 * provide molecular nomenclature but are otherwise well-described.
 *
 *   Base (100 pts max):
 *     indication=20, modality=15, developmentStage=15, summary=10, abstract=8,
 *     licensingReadiness=8, (patentStatus+ipType)=8, mechanismOfAction=8,
 *     inventors=4, comparableDrugs=4
 *   Bonus (+10): target — can push above 100, clamped to 100.
 *
 * Unclassified (null / "other" / "unknown" assetClass) — previously returned null,
 * leaving 6,457 assets permanently in the "Unscored" tier. Now returns a generic
 * description-quality score so these assets can be ranked and surfaced to buyers.
 *
 *   summaryLen≥300=50, ≥150=35, ≥50=20 + developmentStage=15, indication=15,
 *   modality=15, inventors=5 — clamped to 100.
 */
export function computeCompletenessScore(asset: CompletenessAsset): number | null {
  const cls = (asset.assetClass ?? "").toLowerCase();

  // ── Generic "description quality" fallback for unclassified assets ──────────
  if (!cls || cls === "other" || cls === "unknown") {
    let score = 0;
    const summaryLen = (asset.summary ?? "").length;
    if (summaryLen >= 300) score += 50;
    else if (summaryLen >= 150) score += 35;
    else if (summaryLen >= 50) score += 20;
    if (hasValue(asset.developmentStage) && asset.developmentStage !== "unknown") score += 15;
    if (hasValue(asset.indication)) score += 15;
    if (hasValue(asset.modality)) score += 15;
    if (hasValue(asset.inventors)) score += 5;
    return Math.min(100, score);
  }

  // ── Medical Device ─────────────────────────────────────────────────────────
  if (cls === "medical_device") {
    let score = 0;
    const da = asset.deviceAttributes ?? null;
    if (hasValue(deviceAttr(da, "primaryApplication"))) score += 20;
    if (hasValue(deviceAttr(da, "keyAdvantages"))) score += 15;
    if (hasValue(deviceAttr(da, "regulatoryPathway")) && deviceAttr(da, "regulatoryPathway") !== "unknown") score += 15;
    if (hasValue(asset.developmentStage) && asset.developmentStage !== "unknown") score += 10;
    if (hasValue(asset.innovationClaim)) score += 8;
    if (hasValue(asset.licensingReadiness) && asset.licensingReadiness !== "unknown") score += 8;
    score += summaryScore(asset.summary, 8);
    if (hasValue(asset.abstract)) score += 5;
    if (hasValue(asset.inventors)) score += 5;
    if (hasValue(asset.patentStatus) && asset.patentStatus !== "unknown") score += 6;
    return Math.min(100, score);
  }

  // ── Research Tool ──────────────────────────────────────────────────────────
  if (cls === "research_tool") {
    let score = 0;
    const da = asset.deviceAttributes ?? null;
    if (hasValue(deviceAttr(da, "applications"))) score += 20;
    if (hasValue(deviceAttr(da, "targetUsers"))) score += 15;
    if (hasValue(asset.innovationClaim)) score += 10;
    if (hasValue(asset.licensingReadiness) && asset.licensingReadiness !== "unknown") score += 10;
    if (hasValue(asset.developmentStage) && asset.developmentStage !== "unknown") score += 10;
    score += summaryScore(asset.summary, 10);
    if (hasValue(asset.abstract)) score += 8;
    if (hasValue(asset.inventors)) score += 5;
    if (hasValue(asset.patentStatus) && asset.patentStatus !== "unknown") score += 7;
    if (hasValue(asset.categories)) score += 5;
    return Math.min(100, score);
  }

  // ── Software ───────────────────────────────────────────────────────────────
  if (cls === "software") {
    let score = 0;
    const da = asset.deviceAttributes ?? null;
    if (hasValue(deviceAttr(da, "useCase"))) score += 20;
    if (hasValue(deviceAttr(da, "deploymentModel")) && deviceAttr(da, "deploymentModel") !== "unknown") score += 15;
    if (hasValue(asset.innovationClaim)) score += 10;
    if (hasValue(asset.licensingReadiness) && asset.licensingReadiness !== "unknown") score += 10;
    if (hasValue(asset.developmentStage) && asset.developmentStage !== "unknown") score += 10;
    score += summaryScore(asset.summary, 10);
    if (hasValue(asset.abstract)) score += 8;
    if (hasValue(asset.inventors)) score += 5;
    if (hasValue(asset.patentStatus) && asset.patentStatus !== "unknown") score += 7;
    if (hasValue(asset.categories)) score += 5;
    return Math.min(100, score);
  }

  // ── Drug/Biologic (and all other classified asset types) ───────────────────
  // Target is demoted to a bonus field (+10) applied after the 100-pt base.
  // This prevents well-described TTO assets from being permanently capped at 85.
  //
  // Base budget: indication=20, modality=15, developmentStage=15, summary=10,
  //   abstract=8, licensingReadiness=8, (patentStatus+ipType)=8,
  //   mechanismOfAction=8, inventors=4, comparableDrugs=4 → 100 pts
  // Bonus: target=+10 (clamped to 100 after)
  let score = 0;
  if (hasValue(asset.indication)) score += 20;
  if (hasValue(asset.modality)) score += 15;
  if (hasValue(asset.developmentStage) && asset.developmentStage !== "unknown") score += 15;
  score += summaryScore(asset.summary, 10);
  if (hasValue(asset.abstract)) score += 8;
  if (hasValue(asset.licensingReadiness) && asset.licensingReadiness !== "unknown") score += 8;
  // IP coverage: patentStatus and ipType are complementary signals worth 8 pts combined
  const hasPatent = hasValue(asset.patentStatus) && asset.patentStatus !== "unknown";
  const hasIpType = hasValue(asset.ipType);
  if (hasPatent && hasIpType) score += 8;
  else if (hasPatent || hasIpType) score += 5;
  if (hasValue(asset.mechanismOfAction)) score += 8;
  if (hasValue(asset.inventors)) score += 4;
  if (hasValue(asset.comparableDrugs)) score += 4;
  // Target bonus: pushes total above 100 then is clamped — rewards assets with
  // confirmed molecular targets without penalising the majority that don't have one.
  if (hasValue(asset.target)) score += 10;
  return Math.min(100, score);
}

export function normalizeLicensingStatus(raw: string | undefined): string {
  if (!raw) return "unknown";
  const lower = raw.toLowerCase().trim();
  if (lower.includes("available") || lower.includes("for license")) return "available";
  if (lower.includes("non-exclusive")) return "non-exclusively licensed";
  if (lower.includes("exclusive")) return "exclusively licensed";
  if (lower.includes("option")) return "optioned";
  if (lower.includes("startup") || lower.includes("spin")) return "startup formed";
  return "unknown";
}

export function normalizePatentStatus(raw: string | undefined): string {
  if (!raw) return "unknown";
  const lower = raw.toLowerCase().trim();
  if (lower.includes("granted") || lower === "patented") return "patented";
  if (lower.includes("pending") || lower.includes("filed")) return "patent pending";
  if (lower.includes("provisional")) return "provisional";
  if (lower.includes("copyright")) return "copyright";
  if (lower.includes("trade secret")) return "trade secret";
  return "unknown";
}
