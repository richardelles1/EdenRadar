import { describe, it, expect, vi } from "vitest";

// computeFieldMatch and toText are pure functions. The module has many side-effect
// imports (db, OpenAI, storage) — mock them so loading the module doesn't throw.
vi.mock("../db", () => ({ db: {} }));
vi.mock("../storage", () => ({ storage: {} }));
vi.mock("@shared/schema", () => ({
  ingestedAssets: {}, marketListings: {}, scoutSavedSearches: {},
  insertScoutSavedSearchSchema: { parse: (v: unknown) => v },
}));
vi.mock("../lib/supabaseAuth", () => ({
  verifyAnyAuth: vi.fn(), tryGetUserId: vi.fn(), requireAdmin: vi.fn(), getAdminEmails: vi.fn(),
}));
vi.mock("../lib/sources/index", () => ({
  dataSources: {}, collectAllSignals: vi.fn(), collectAllSignalsWithDiag: vi.fn(),
  ALL_SOURCE_KEYS: [], withHardTimeout: vi.fn(), getSourceHealthEntries: vi.fn(),
}));
vi.mock("../lib/sources/patents", () => ({ searchPatents: vi.fn() }));
vi.mock("../lib/sources/clinicaltrials", () => ({ searchClinicalTrials: vi.fn() }));
vi.mock("../lib/pipeline/normalizeSignals", () => ({ normalizeSignals: vi.fn() }));
vi.mock("../lib/pipeline/clusterAssets", () => ({ clusterAssets: vi.fn() }));
vi.mock("../lib/pipeline/scoreAssets", () => ({
  scoreAssets: vi.fn(), computeFitBonus: vi.fn(), computeTotal: vi.fn(),
  TTO_WEIGHTS: {}, scoreSearchRelevance: vi.fn(), scoreCompleteness: vi.fn(),
  scoreAvailability: vi.fn(), CONFIDENCE_AWARE_RANKING_ENABLED: false, CONFIDENCE_FLOOR: 0,
}));
vi.mock("../lib/pipeline/generateReport", () => ({ generateReport: vi.fn() }));
vi.mock("../lib/pipeline/generateDossier", () => ({ generateDossier: vi.fn() }));
vi.mock("../lib/llm", () => ({
  isFatalOpenAIError: vi.fn(), streamDossierNarrative: vi.fn(), friendlyOpenAIError: vi.fn(),
}));
vi.mock("../lib/eden/rag", () => ({
  fetchPortfolioStats: vi.fn(), parseQueryFilters: vi.fn(), hasMeaningfulFilters: vi.fn(),
}));
vi.mock("../lib/responseCache", () => ({ cacheGet: vi.fn(() => null), cacheSet: vi.fn() }));
vi.mock("../lib/sentry", () => ({ captureException: vi.fn() }));
vi.mock("../lib/routeHelpers", () => ({ logAppEvent: vi.fn() }));
vi.mock("../lib/marketEntitlement", () => ({ userHasMarketRead: vi.fn() }));

import { toText, computeFieldMatch } from "./search";

// ── toText ────────────────────────────────────────────────────────────────────

describe("toText", () => {
  it("returns empty string for null", () => {
    expect(toText(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(toText(undefined)).toBe("");
  });

  it("returns empty string for empty string", () => {
    expect(toText("")).toBe("");
  });

  it("passes through a plain string unchanged (no underscores, not JSON)", () => {
    expect(toText("small molecule")).toBe("small molecule");
  });

  it("replaces underscores with spaces", () => {
    expect(toText("gene_therapy")).toBe("gene therapy");
    expect(toText("non_small_cell_lung_cancer")).toBe("non small cell lung cancer");
  });

  it("parses a JSONB-serialised string array and joins with spaces", () => {
    expect(toText('["gene_therapy","oncology"]')).toBe("gene therapy oncology");
  });

  it("replaces underscores inside JSONB array values", () => {
    expect(toText('["non_small_cell_lung_cancer","immunotherapy"]')).toBe(
      "non small cell lung cancer immunotherapy"
    );
  });

  it("handles a JSONB array with a single element", () => {
    expect(toText('["oncology"]')).toBe("oncology");
  });

  it("returns the raw string if JSON parsing fails", () => {
    // Malformed JSON — falls through to the plain string path
    expect(toText('[invalid json')).toBe("[invalid json");
  });

  it("handles a plain JSON array of plain words (no underscores)", () => {
    expect(toText('["oncology","immunology"]')).toBe("oncology immunology");
  });
});

// ── computeFieldMatch ─────────────────────────────────────────────────────────

type Asset = Parameters<typeof computeFieldMatch>[1];

function asset(overrides: Partial<Asset> = {}): Asset {
  return {
    assetName: null,
    indication: null,
    target: null,
    modality: null,
    mechanismOfAction: null,
    innovationClaim: null,
    summary: null,
    biology: null,
    categories: null,
    ...overrides,
  } as Asset;
}

describe("computeFieldMatch", () => {
  // ── null / trivial query handling ─────────────────────────────────────────

  it("returns null when every query token is under 3 characters", () => {
    expect(computeFieldMatch("IL NK", asset({ assetName: "IL-6 NK cell" }))).toBeNull();
  });

  it("returns null for an empty query", () => {
    expect(computeFieldMatch("", asset())).toBeNull();
  });

  it("returns a result for a valid query even with no matching asset", () => {
    const result = computeFieldMatch("EGFR", asset());
    expect(result).not.toBeNull();
    expect(result!.score).toBe(40); // FTS/vector tier: no structured match
  });

  // ── tier scoring ──────────────────────────────────────────────────────────

  it("scores 95 for a match in assetName (highest tier)", () => {
    const result = computeFieldMatch("osimertinib", asset({ assetName: "Osimertinib EGFR inhibitor" }));
    expect(result!.score).toBe(95);
    expect(result!.basis).toContain("asset name");
  });

  it("scores 85 for a match in indication or target", () => {
    const result = computeFieldMatch("glioblastoma", asset({ indication: "glioblastoma" }));
    expect(result!.score).toBe(85);
    expect(result!.basis).toContain("indication or target");
  });

  it("scores 85 for a match in target", () => {
    const result = computeFieldMatch("EGFR", asset({ target: "EGFR tyrosine kinase" }));
    expect(result!.score).toBe(85);
  });

  it("scores 75 for a match in modality or mechanismOfAction", () => {
    const result = computeFieldMatch("antibody", asset({ modality: "antibody" }));
    expect(result!.score).toBe(75);
    expect(result!.basis).toContain("mechanism or modality");
  });

  it("scores 65 for a match in summary or innovationClaim", () => {
    const result = computeFieldMatch("checkpoint", asset({ summary: "checkpoint blockade therapy" }));
    expect(result!.score).toBe(65);
    expect(result!.basis).toContain("description");
  });

  it("scores 55 for a match in biology or categories", () => {
    const result = computeFieldMatch("oncology", asset({ categories: '["oncology","immunology"]' }));
    expect(result!.score).toBe(55);
    expect(result!.basis).toContain("secondary fields");
  });

  it("scores 40 (FTS tier) when no structured field matches", () => {
    const result = computeFieldMatch("zebrafish", asset({ summary: "unrelated description" }));
    expect(result!.score).toBe(40);
    expect(result!.basis).toContain("Semantic or full-text match");
  });

  // ── multi-term queries ────────────────────────────────────────────────────

  it("averages scores across multiple terms", () => {
    // "EGFR" hits target (85), "zebrafish" hits nothing (40) → avg = 62 → rounds to 62
    const result = computeFieldMatch("EGFR zebrafish", asset({ target: "EGFR" }));
    expect(result!.score).toBe(63); // (85 + 40) / 2 = 62.5 → rounds to 63
  });

  it("uses the best-tier label when multiple terms match at different tiers", () => {
    // "EGFR" in target (85), "antibody" in modality (75) → best label = "indication or target"
    const result = computeFieldMatch("EGFR antibody", asset({ target: "EGFR", modality: "antibody" }));
    expect(result!.basis).toContain("indication or target");
  });

  it("matches case-insensitively", () => {
    const lower = computeFieldMatch("egfr", asset({ assetName: "EGFR Inhibitor" }));
    const upper = computeFieldMatch("EGFR", asset({ assetName: "EGFR Inhibitor" }));
    expect(lower!.score).toBe(upper!.score);
    expect(lower!.score).toBe(95);
  });

  it("ignores query tokens shorter than 3 characters", () => {
    // "NK" (2 chars) is filtered out; "cell" (4 chars) remains and matches summary
    const result = computeFieldMatch("NK cell therapy", asset({ summary: "NK cell immunotherapy" }));
    // "cell" and "therapy" match in summary at tier 65
    expect(result!.score).toBe(65);
  });

  it("caps score at 100", () => {
    const result = computeFieldMatch("EGFR", asset({ assetName: "EGFR" }));
    expect(result!.score).toBeLessThanOrEqual(100);
  });

  // ── JSONB categories handling (documented footgun) ────────────────────────

  it("matches terms inside JSONB-serialised categories array", () => {
    // categories arrives from DB as raw JSON string — toText must unwrap it
    const result = computeFieldMatch("oncology", asset({ categories: '["oncology","immunotherapy"]' }));
    expect(result!.score).toBe(55);
  });

  it("matches terms inside underscore-keyed categories", () => {
    // "gene_therapy" in DB → toText converts to "gene therapy" → "gene" matches
    const result = computeFieldMatch("gene", asset({ categories: '["gene_therapy"]' }));
    expect(result!.score).toBe(55);
  });

  // ── basis text ────────────────────────────────────────────────────────────

  it("notes partial match when some terms are unstructured", () => {
    // "EGFR" matches target (structured); "unicorn" matches nothing (unstructured)
    const result = computeFieldMatch("EGFR unicorn", asset({ target: "EGFR" }));
    expect(result!.basis).toContain("partial structured match");
  });

  it("does not say partial match when all terms are structured", () => {
    const result = computeFieldMatch("EGFR", asset({ target: "EGFR" }));
    expect(result!.basis).not.toContain("partial");
  });
});
