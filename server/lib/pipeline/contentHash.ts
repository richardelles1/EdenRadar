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
  /**
   * source_type from ingested_assets (e.g. "tech_transfer", "paper", "patent").
   * TTO listings are published on "available technologies" portals, so their presence
   * on the portal IS proof of IP availability — we don't require an explicit ipType
   * or patentStatus field to award IP credit for tech_transfer assets.
   */
  sourceType?: string | null;
  /** biology bucket (e.g. "aberrant kinase signaling") — earns a +5 soft bonus */
  biology?: string | null;
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
 * Formula v4 — MOA-weighted, universal buyer-decision formula.
 * Scores exactly what a licensing manager needs to make a go/no-go call:
 *
 *   indication        = 25 pts  (what does it treat or do)
 *   modality          = 20 pts  (what type of asset)
 *   developmentStage  = 20 pts  (how ready is it)
 *   summary quality   = 15 pts  (≥300 chars=15, ≥150=10, ≥50=5)
 *   mechanismOfAction = 15 pts  (how it works — critical for EDEN matching;
 *                                raised from 12 so MOA-filled assets cross
 *                                the 80-pt "excellent" threshold more often)
 *   IP protection     =  5 pts  (ipType OR patentStatus, either earns full credit;
 *                                OR sourceType === 'tech_transfer' — TTO portal
 *                                listing IS proof of licensing availability;
 *                                reduced from 8: TTO assets earn this automatically
 *                                so it was a low-discrimination signal)
 *   biology (soft)    =  5 pts  (canonical biology bucket assigned — not part of the
 *                                100 pt base; acts as a tie-breaker bonus)
 *   ──────────────────────────
 *   Base max          = 100 pts  (clamped — biology bonus can push past 100 → capped)
 *
 * IP credit rationale: universities publish technologies on TTO portals specifically
 * because they are available for licensing. The listing IS the IP availability signal.
 * We no longer require an explicit ipType/patentStatus field for TTO assets.
 *
 * Removed from scoring: inventors, abstract, licensingReadiness, comparableDrugs,
 * target, innovationClaim, deviceAttributes. These live in the dossier or are
 * structurally unavailable from TTO pages and don't drive licensing decisions.
 */
export function computeCompletenessScore(asset: CompletenessAsset): number | null {
  let score = 0;

  // indication (25 pts) — primary question: what does it treat or do
  if (hasValue(asset.indication)) score += 25;

  // modality (20 pts) — what type of asset
  if (hasValue(asset.modality)) score += 20;

  // developmentStage (20 pts) — how ready is it
  if (hasValue(asset.developmentStage) && asset.developmentStage !== "unknown") score += 20;

  // summary quality (15 pts tiered) — enough context for a buyer to evaluate
  const summaryLen = (asset.summary ?? "").length;
  if (summaryLen >= 300) score += 15;
  else if (summaryLen >= 150) score += 10;
  else if (summaryLen >= 50) score += 5;

  // mechanismOfAction (15 pts) — how it works; critical for EDEN vector matching.
  // Raised from 12 → 15: assets with MOA populated now cross the 80-pt "excellent"
  // threshold when they also have indication + modality + stage (25+20+20+15 = 80).
  if (hasValue(asset.mechanismOfAction)) score += 15;

  // IP protection (5 pts) — explicit ipType OR patentStatus earns credit.
  // TTO portal listings (source_type = 'tech_transfer') also earn full credit:
  // universities list technologies on these portals specifically because they are
  // available for licensing — the listing IS the IP availability proof.
  // Reduced from 8 → 5: TTO assets earn this automatically (low discrimination).
  const hasExplicitIp = hasValue(asset.ipType) ||
    (hasValue(asset.patentStatus) && asset.patentStatus !== "unknown");
  const isTtoListing = asset.sourceType === "tech_transfer";
  if (hasExplicitIp || isTtoListing) score += 5;

  // biology soft bonus (5 pts) — canonical biology bucket raises signal quality;
  // excluded values: null / '' / 'unknown' / 'other'.
  const bio = (asset.biology ?? "").toLowerCase().trim();
  if (bio && bio !== "unknown" && bio !== "other") score += 5;

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
