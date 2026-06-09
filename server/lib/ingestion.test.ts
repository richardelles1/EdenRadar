import { describe, it, expect, vi } from "vitest";

// Mock everything that has side effects at import time before any imports
vi.mock("../db", () => ({ db: {} }));
vi.mock("../scraperDb", () => ({ scraperDb: {} }));
vi.mock("@shared/schema", () => ({ syncStaging: {}, ingestedAssets: {} }));
vi.mock("./scrapers/index", () => ({ ALL_SCRAPERS: [], runAllScrapers: vi.fn(), getScraperTier: vi.fn() }));
vi.mock("./scrapers/enrichAsset", () => ({ enrichBatch: vi.fn() }));
vi.mock("./scrapers/utils", () => ({ stripDocketPrefix: vi.fn((t: string) => t) }));
vi.mock("./pipeline/relevancePreFilter", () => ({ preFilterBatch: vi.fn() }));
vi.mock("./pipeline/relevanceClassifier", () => ({ activePreFilterBatch: vi.fn() }));
vi.mock("./pipeline/classifyAsset", () => ({ classifyBatch: vi.fn() }));
vi.mock("./pipeline/contentHash", () => ({
  computeContentHash: vi.fn(),
  computeCompletenessScore: vi.fn(),
  normalizeLicensingStatus: vi.fn(),
  normalizePatentStatus: vi.fn(),
}));
vi.mock("../storage", () => ({ storage: {} }));
vi.mock("drizzle-orm", () => ({ eq: vi.fn(), and: vi.fn(), sql: vi.fn() }));

import { normalizeTitle, makeFingerprint, normalizeSourceUrl } from "./ingestion";

describe("normalizeTitle", () => {
  it("lowercases the title", () => {
    expect(normalizeTitle("CRISPR Gene Editing")).toBe("crispr gene editing");
  });

  it("strips leading articles (a, an, the)", () => {
    expect(normalizeTitle("A Novel Antibody")).toBe("novel antibody");
    expect(normalizeTitle("An Improved Scaffold")).toBe("improved scaffold");
    expect(normalizeTitle("The Cancer Vaccine")).toBe("cancer vaccine");
  });

  it("replaces punctuation with spaces and collapses runs", () => {
    expect(normalizeTitle("mRNA-Based Vaccine (Phase 2)")).toBe("mrna based vaccine phase 2");
  });

  it("collapses multiple spaces", () => {
    expect(normalizeTitle("gene   therapy   platform")).toBe("gene therapy platform");
  });

  it("trims leading and trailing whitespace", () => {
    expect(normalizeTitle("  KRAS Inhibitor  ")).toBe("kras inhibitor");
  });

  it("is stable — same input always produces same output", () => {
    const title = "Anti-PD-1 Checkpoint Inhibitor";
    expect(normalizeTitle(title)).toBe(normalizeTitle(title));
  });
});

describe("makeFingerprint", () => {
  it("returns title-based fingerprint independent of URL", () => {
    const fp1 = makeFingerprint("Novel CRISPR Approach", "UC Berkeley");
    const fp2 = makeFingerprint("Novel CRISPR Approach", "UC Berkeley");
    expect(fp1).toBe(fp2);
  });

  it("is case-insensitive on both title and institution", () => {
    const fp1 = makeFingerprint("Novel CRISPR Approach", "UC Berkeley");
    const fp2 = makeFingerprint("novel crispr approach", "uc berkeley");
    expect(fp1).toBe(fp2);
  });

  it("differs when institution differs", () => {
    const fp1 = makeFingerprint("Same Title", "UC Berkeley");
    const fp2 = makeFingerprint("Same Title", "UC San Diego");
    expect(fp1).not.toBe(fp2);
  });

  it("differs when title differs", () => {
    const fp1 = makeFingerprint("Drug A", "MIT");
    const fp2 = makeFingerprint("Drug B", "MIT");
    expect(fp1).not.toBe(fp2);
  });

  it("is NOT affected by URL — changing URL does not change fingerprint", () => {
    // This is the core invariant that confirms the UC URL format change was a
    // URL-dedup failure, not a fingerprint failure.
    const fp = makeFingerprint("NCD Tech Listing", "UC Berkeley");
    // Fingerprint contains no URL component
    expect(fp).not.toContain("http");
    expect(fp).not.toContain("NCD");
    expect(fp).toContain("uc berkeley");
  });

  it("trims whitespace from institution", () => {
    const fp1 = makeFingerprint("Title", "MIT");
    const fp2 = makeFingerprint("Title", "  MIT  ");
    expect(fp1).toBe(fp2);
  });
});

describe("normalizeSourceUrl", () => {
  it("strips query string from URL", () => {
    expect(normalizeSourceUrl("https://example.com/tech?id=123"))
      .toBe("https://example.com/tech");
  });

  it("returns null for null input", () => {
    expect(normalizeSourceUrl(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(normalizeSourceUrl(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(normalizeSourceUrl("")).toBeNull();
  });

  it("demonstrates why old UC format collapsed — NCDId query param is stripped", () => {
    // Old format: NCD/Detail?NCDId=123 → normalizes to NCD/Detail (loses the ID)
    // New format: NCD/123.html → stays as NCD/123.html (unique per asset)
    // This asymmetry caused URL dedup to fail when UC changed formats.
    const oldNormalized = normalizeSourceUrl("https://techtransfer.universityofcalifornia.edu/NCD/Detail?NCDId=123");
    const newNormalized = normalizeSourceUrl("https://techtransfer.universityofcalifornia.edu/NCD/123.html");
    expect(oldNormalized).not.toBe(newNormalized);
    expect(oldNormalized).toBe("https://techtransfer.universityofcalifornia.edu/NCD/Detail");
    expect(newNormalized).toBe("https://techtransfer.universityofcalifornia.edu/NCD/123.html");
  });

  it("preserves hash fragments (used by Temple-style listing pages)", () => {
    expect(normalizeSourceUrl("https://example.com/listing#asset-42"))
      .toBe("https://example.com/listing#asset-42");
  });
});
