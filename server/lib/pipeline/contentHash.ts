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
 * Returns a 0-100 completeness score for the asset, OR null when the asset
 * class is unknown/"other". Returning null avoids surfacing a misleading
 * Drug/Biologic-shaped score for assets the classifier could not place,
 * which previously inflated trust in low-confidence rows.
 */
export function computeCompletenessScore(asset: CompletenessAsset): number | null {
  const cls = (asset.assetClass ?? "").toLowerCase();

  // ── Unscored: classifier returned "other" or no class at all ───────────────
  // (Legacy rows without assetClass are treated the same so we stop guessing.)
  if (!cls || cls === "other" || cls === "unknown") {
    return null;
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
    if (hasValue(asset.licensingReadiness) && asset.licensingReadiness !== "unknown") score += 5;
    if (hasValue(asset.summary)) score += 5;
    if (hasValue(asset.abstract)) score += 5;
    if (hasValue(asset.categories)) score += 5;
    if (hasValue(asset.inventors)) score += 5;
    if (hasValue(asset.patentStatus) && asset.patentStatus !== "unknown") score += 7;
    return Math.min(100, score);
  }

  // ── Research Tool ──────────────────────────────────────────────────────────
  if (cls === "research_tool") {
    let score = 0;
    const da = asset.deviceAttributes ?? null;
    if (hasValue(deviceAttr(da, "applications"))) score += 20;
    if (hasValue(deviceAttr(da, "targetUsers"))) score += 15;
    if (hasValue(asset.innovationClaim)) score += 10;
    if (hasValue(asset.licensingReadiness) && asset.licensingReadiness !== "unknown") score += 8;
    if (hasValue(asset.developmentStage) && asset.developmentStage !== "unknown") score += 8;
    if (hasValue(asset.summary)) score += 7;
    if (hasValue(asset.abstract)) score += 7;
    if (hasValue(asset.categories)) score += 7;
    if (hasValue(asset.inventors)) score += 5;
    if (hasValue(asset.patentStatus) && asset.patentStatus !== "unknown") score += 8;
    return Math.min(100, score);
  }

  // ── Software ───────────────────────────────────────────────────────────────
  if (cls === "software") {
    let score = 0;
    const da = asset.deviceAttributes ?? null;
    if (hasValue(deviceAttr(da, "useCase"))) score += 20;
    if (hasValue(deviceAttr(da, "deploymentModel")) && deviceAttr(da, "deploymentModel") !== "unknown") score += 15;
    if (hasValue(asset.innovationClaim)) score += 10;
    if (hasValue(asset.licensingReadiness) && asset.licensingReadiness !== "unknown") score += 8;
    if (hasValue(asset.summary)) score += 7;
    if (hasValue(asset.abstract)) score += 7;
    if (hasValue(asset.categories)) score += 7;
    if (hasValue(asset.inventors)) score += 5;
    if (hasValue(asset.patentStatus) && asset.patentStatus !== "unknown") score += 8;
    if (hasValue(asset.developmentStage) && asset.developmentStage !== "unknown") score += 8;
    return Math.min(100, score);
  }

  // ── Drug/Biologic (default for null/unknown/other) ─────────────────────────
  // Backward-compatible formula so existing scored assets aren't disrupted
  let score = 0;
  if (hasValue(asset.target)) score += 15;
  if (hasValue(asset.modality)) score += 15;
  if (hasValue(asset.indication)) score += 15;
  if (hasValue(asset.developmentStage) && asset.developmentStage !== "unknown") score += 10;
  if (hasValue(asset.summary)) score += 5;
  if (hasValue(asset.abstract)) score += 5;
  if (hasValue(asset.mechanismOfAction)) score += 10;
  if (hasValue(asset.innovationClaim)) score += 5;
  if (hasValue(asset.unmetNeed)) score += 5;
  if (hasValue(asset.comparableDrugs)) score += 3;
  if (hasValue(asset.licensingReadiness) && asset.licensingReadiness !== "unknown") score += 2;
  if (hasValue(asset.categories)) score += 5;
  if (hasValue(asset.inventors)) score += 3;
  if (hasValue(asset.patentStatus) && asset.patentStatus !== "unknown") score += 2;
  return score;
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
