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
  modality?: string | null;
  indication?: string | null;
  developmentStage?: string | null;
  mechanismOfAction?: string | null;
  ipType?: string | null;
  patentStatus?: string | null;
  summary?: string | null;
  // Retained for backwards-compat with callers that still pass these — not scored
  target?: string | null;
  innovationClaim?: string | null;
  unmetNeed?: string | null;
  comparableDrugs?: string | null;
  licensingReadiness?: string | null;
  deviceAttributes?: Record<string, unknown> | null;
  abstract?: string | null;
  categories?: string[] | null;
  inventors?: string[] | null;
};

function hasValue(val: unknown): boolean {
  if (val == null) return false;
  if (typeof val === "string") return val.length >= 3 && val !== "unknown" && val !== "";
  if (Array.isArray(val)) return val.length > 0;
  return false;
}

/**
 * Returns a 0-100 completeness score for the asset.
 *
 * Formula v4 — asset-class-aware. Drug/biologic assets use drug-specific
 * field weights; non-drug assets (medical_device, research_tool, software)
 * use a profile that doesn't penalise them for structurally-absent drug fields.
 *
 * Drug/biologic (default):
 *   indication        = 25 pts  (what disease does it treat)
 *   modality          = 20 pts  (what type of drug/biologic)
 *   developmentStage  = 20 pts  (how ready is it)
 *   summary quality   = 15 pts  (≥300=15, ≥150=10, ≥50=5)
 *   mechanismOfAction = 12 pts  (how it works)
 *   IP protection     =  8 pts  (ipType OR patentStatus)
 *   Total             = 100 pts
 *
 * Medical device:
 *   developmentStage  = 20 pts  (how ready is it)
 *   indication        = 20 pts  (intended use / clinical application)
 *   modality          = 15 pts  (device category / type)
 *   summary quality   = 15 pts  (≥300=15, ≥150=10, ≥50=5)
 *   mechanismOfAction = 12 pts  (how it works)
 *   IP protection     =  8 pts
 *   deviceAttributes  = 10 pts  (structured device specs)
 *   Total             = 100 pts
 *
 * Research tool / software:
 *   summary quality   = 30 pts  (≥300=30, ≥150=20, ≥50=10)
 *   mechanismOfAction = 25 pts  (how it works — core buyer signal)
 *   innovationClaim   = 20 pts  (what's novel)
 *   IP protection     = 15 pts
 *   developmentStage  = 10 pts  (commercial-readiness)
 *   Total             = 100 pts
 */
export function computeCompletenessScore(asset: CompletenessAsset): number | null {
  const cls = (asset.assetClass ?? "").toLowerCase();
  const hasIp = hasValue(asset.ipType) ||
    (hasValue(asset.patentStatus) && asset.patentStatus !== "unknown");

  // ── Research tool / software ──────────────────────────────────────────────
  if (cls === "research_tool" || cls === "software") {
    let score = 0;
    const summaryLen = (asset.summary ?? "").length;
    if (summaryLen >= 300) score += 30;
    else if (summaryLen >= 150) score += 20;
    else if (summaryLen >= 50) score += 10;
    if (hasValue(asset.mechanismOfAction)) score += 25;
    if (hasValue(asset.innovationClaim))   score += 20;
    if (hasIp)                             score += 15;
    if (hasValue(asset.developmentStage) && asset.developmentStage !== "unknown") score += 10;
    return Math.min(100, score);
  }

  // ── Medical device ────────────────────────────────────────────────────────
  if (cls === "medical_device") {
    let score = 0;
    if (hasValue(asset.developmentStage) && asset.developmentStage !== "unknown") score += 20;
    if (hasValue(asset.indication))        score += 20;
    if (hasValue(asset.modality))          score += 15;
    const summaryLen = (asset.summary ?? "").length;
    if (summaryLen >= 300) score += 15;
    else if (summaryLen >= 150) score += 10;
    else if (summaryLen >= 50) score += 5;
    if (hasValue(asset.mechanismOfAction)) score += 12;
    if (hasIp)                             score += 8;
    if (asset.deviceAttributes && Object.keys(asset.deviceAttributes).length > 0) score += 10;
    return Math.min(100, score);
  }

  // ── Drug / biologic (default — includes unclassified assets) ─────────────
  let score = 0;
  if (hasValue(asset.indication))        score += 25;
  if (hasValue(asset.modality))          score += 20;
  if (hasValue(asset.developmentStage) && asset.developmentStage !== "unknown") score += 20;
  const summaryLen = (asset.summary ?? "").length;
  if (summaryLen >= 300) score += 15;
  else if (summaryLen >= 150) score += 10;
  else if (summaryLen >= 50) score += 5;
  if (hasValue(asset.mechanismOfAction)) score += 12;
  if (hasIp)                             score += 8;
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
