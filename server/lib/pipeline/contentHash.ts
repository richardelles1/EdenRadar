import { createHash } from "crypto";

export function computeContentHash(title: string, description: string, abstract?: string): string {
  const normalized = [
    title.toLowerCase().trim(),
    (description || "").toLowerCase().trim(),
    (abstract || "").toLowerCase().trim(),
  ].join("|");

  return createHash("sha256").update(normalized).digest("hex").slice(0, 32);
}

export type CompletenessAsset = {
  target?: string | null;
  modality?: string | null;
  indication?: string | null;
  developmentStage?: string | null;
  summary?: string | null;
  abstract?: string | null;
  categories?: string[] | null;
  innovationClaim?: string | null;
  mechanismOfAction?: string | null;
  unmetNeed?: string | null;
  comparableDrugs?: string | null;
  licensingReadiness?: string | null;
  inventors?: string[] | null;
  patentStatus?: string | null;
};

export function computeCompletenessScore(asset: CompletenessAsset): number {
  let score = 0;
  const checks: [keyof CompletenessAsset, number][] = [
    ["target", 15],
    ["modality", 15],
    ["indication", 15],
    ["developmentStage", 10],
    ["summary", 5],
    ["abstract", 5],
    ["mechanismOfAction", 10],
    ["innovationClaim", 5],
    ["unmetNeed", 5],
    ["comparableDrugs", 3],
    ["licensingReadiness", 2],
    ["categories", 5],
    ["inventors", 3],
    ["patentStatus", 2],
  ];

  for (const [field, weight] of checks) {
    const val = asset[field];
    if (val && val !== "unknown" && val !== "") {
      if (Array.isArray(val) && val.length === 0) continue;
      if (typeof val === "string" && val.length < 3) continue;
      score += weight;
    }
  }

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
