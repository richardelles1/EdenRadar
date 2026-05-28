import { describe, it, expect } from "vitest";
import {
  computeCompletenessScore,
  computeContentHash,
  normalizeLicensingStatus,
  normalizePatentStatus,
} from "./contentHash";

// ── computeCompletenessScore ──────────────────────────────────────────────────

describe("computeCompletenessScore", () => {
  it("returns 0 for a completely empty asset", () => {
    expect(computeCompletenessScore({})).toBe(0);
  });

  // Individual field awards
  it("awards 25 pts for indication", () => {
    expect(computeCompletenessScore({ indication: "NSCLC" })).toBe(25);
  });

  it("awards 20 pts for modality", () => {
    expect(computeCompletenessScore({ modality: "small molecule" })).toBe(20);
  });

  it("awards 20 pts for developmentStage when not 'unknown'", () => {
    expect(computeCompletenessScore({ developmentStage: "phase 2" })).toBe(20);
  });

  it("awards 15 pts for mechanismOfAction", () => {
    expect(computeCompletenessScore({ mechanismOfAction: "EGFR inhibition" })).toBe(15);
  });

  it("awards 5 pts for explicit ipType", () => {
    expect(computeCompletenessScore({ ipType: "patented" })).toBe(5);
  });

  it("awards 5 pts for patentStatus when not 'unknown'", () => {
    expect(computeCompletenessScore({ patentStatus: "patent pending" })).toBe(5);
  });

  it("awards 5 pts for TTO listing even without explicit IP fields", () => {
    expect(computeCompletenessScore({ sourceType: "tech_transfer" })).toBe(5);
  });

  // Summary tiers — boundary values AND one-below-boundary
  it("awards 15 pts for summary >= 300 chars", () => {
    expect(computeCompletenessScore({ summary: "a".repeat(300) })).toBe(15);
  });

  it("awards 10 pts for summary at exactly 299 chars (one below 300 tier)", () => {
    expect(computeCompletenessScore({ summary: "a".repeat(299) })).toBe(10);
  });

  it("awards 10 pts for summary >= 150 chars", () => {
    expect(computeCompletenessScore({ summary: "a".repeat(150) })).toBe(10);
  });

  it("awards 5 pts for summary at exactly 149 chars (one below 150 tier)", () => {
    expect(computeCompletenessScore({ summary: "a".repeat(149) })).toBe(5);
  });

  it("awards 5 pts for summary >= 50 chars", () => {
    expect(computeCompletenessScore({ summary: "a".repeat(50) })).toBe(5);
  });

  it("awards 0 pts for summary < 50 chars", () => {
    expect(computeCompletenessScore({ summary: "short" })).toBe(0);
  });

  // 'unknown' and empty string rejection
  it("does not award pts when developmentStage is 'unknown'", () => {
    expect(computeCompletenessScore({ developmentStage: "unknown" })).toBe(0);
  });

  it("does not award pts when indication is 'unknown'", () => {
    expect(computeCompletenessScore({ indication: "unknown" })).toBe(0);
  });

  it("does not award pts when modality is 'unknown'", () => {
    expect(computeCompletenessScore({ modality: "unknown" })).toBe(0);
  });

  it("does not award pts when mechanismOfAction is 'unknown'", () => {
    expect(computeCompletenessScore({ mechanismOfAction: "unknown" })).toBe(0);
  });

  it("does not award pts when patentStatus is 'unknown'", () => {
    expect(computeCompletenessScore({ patentStatus: "unknown" })).toBe(0);
  });

  it("does not award pts for strings shorter than 3 chars", () => {
    expect(computeCompletenessScore({ indication: "AB" })).toBe(0);
    expect(computeCompletenessScore({ modality: "AB" })).toBe(0);
  });

  it("does not award pts for empty string fields", () => {
    expect(computeCompletenessScore({ indication: "" })).toBe(0);
    expect(computeCompletenessScore({ developmentStage: "" })).toBe(0);
  });

  it("treats null and undefined field values identically (both score 0)", () => {
    expect(computeCompletenessScore({ indication: null })).toBe(0);
    expect(computeCompletenessScore({ indication: undefined })).toBe(0);
  });

  // Biology bonus
  it("awards 5 pt biology bonus on top of base score", () => {
    // indication (25) + biology bonus (5) = 30
    expect(computeCompletenessScore({ indication: "NSCLC", biology: "oncogenic signaling" })).toBe(30);
  });

  it("does not award biology bonus for 'unknown'", () => {
    expect(computeCompletenessScore({ indication: "NSCLC", biology: "unknown" })).toBe(25);
  });

  it("does not award biology bonus for 'other'", () => {
    expect(computeCompletenessScore({ indication: "NSCLC", biology: "other" })).toBe(25);
  });

  it("does not award biology bonus for 'not applicable'", () => {
    expect(computeCompletenessScore({ indication: "NSCLC", biology: "not applicable" })).toBe(25);
  });

  // Full-score and cap
  it("a fully-populated asset scores 100", () => {
    // 25 + 20 + 20 + 15 + 15 + 5 = 100
    const asset = {
      indication: "NSCLC",
      modality: "small molecule",
      developmentStage: "phase 2",
      summary: "a".repeat(300),
      mechanismOfAction: "EGFR inhibition",
      ipType: "patented",
    };
    expect(computeCompletenessScore(asset)).toBe(100);
  });

  it("biology bonus is capped so total never exceeds 100", () => {
    const asset = {
      indication: "NSCLC",
      modality: "small molecule",
      developmentStage: "phase 2",
      summary: "a".repeat(300),
      mechanismOfAction: "EGFR inhibition",
      ipType: "patented",
      biology: "oncogenic signaling",
    };
    expect(computeCompletenessScore(asset)).toBe(100);
  });

  it("always returns a number (never null), despite the declared return type", () => {
    // The function signature says `number | null` but the implementation
    // always returns Math.min(100, score). This test documents actual behavior.
    const result = computeCompletenessScore({});
    expect(typeof result).toBe("number");
  });

  // Non-scored fields
  it("ignores target, inventors, licensingReadiness, innovationClaim — all score 0", () => {
    expect(computeCompletenessScore({
      target: "EGFR",
      innovationClaim: "first-in-class",
      inventors: ["Dr Smith"],
      licensingReadiness: "available",
    })).toBe(0);
  });
});

// ── computeContentHash ────────────────────────────────────────────────────────

describe("computeContentHash", () => {
  it("returns a 32-char hex string", () => {
    expect(computeContentHash("Title", "Description")).toMatch(/^[0-9a-f]{32}$/);
  });

  it("is deterministic", () => {
    const a = computeContentHash("Title", "Desc", "Abstract");
    const b = computeContentHash("Title", "Desc", "Abstract");
    expect(a).toBe(b);
  });

  it("is case-insensitive across title, description, and abstract", () => {
    expect(computeContentHash("TITLE", "DESC", "ABSTRACT")).toBe(
      computeContentHash("title", "desc", "abstract")
    );
  });

  it("produces different hashes when title changes", () => {
    const base = computeContentHash("Title", "Desc");
    expect(computeContentHash("Title2", "Desc")).not.toBe(base);
  });

  it("produces different hashes when description changes", () => {
    const base = computeContentHash("Title", "Desc");
    expect(computeContentHash("Title", "Desc2")).not.toBe(base);
  });

  it("produces different hashes when abstract changes", () => {
    const base = computeContentHash("Title", "Desc", "Abstract");
    expect(computeContentHash("Title", "Desc", "Abstract2")).not.toBe(base);
  });

  it("treats missing abstract as empty string", () => {
    expect(computeContentHash("T", "D", undefined)).toBe(
      computeContentHash("T", "D", "")
    );
  });
});

// ── normalizeLicensingStatus ──────────────────────────────────────────────────

describe("normalizeLicensingStatus", () => {
  it("returns 'unknown' for empty string", () => {
    expect(normalizeLicensingStatus("")).toBe("unknown");
  });

  it("returns 'unknown' for undefined", () => {
    expect(normalizeLicensingStatus(undefined)).toBe("unknown");
  });

  it("normalizes 'available'", () => {
    expect(normalizeLicensingStatus("available")).toBe("available");
  });

  it("normalizes 'available for license'", () => {
    expect(normalizeLicensingStatus("Available for License")).toBe("available");
  });

  it("normalizes non-exclusive licensing", () => {
    expect(normalizeLicensingStatus("non-exclusively licensed")).toBe("non-exclusively licensed");
    expect(normalizeLicensingStatus("Non-Exclusive License")).toBe("non-exclusively licensed");
  });

  it("normalizes exclusive licensing", () => {
    expect(normalizeLicensingStatus("Exclusively Licensed")).toBe("exclusively licensed");
  });

  it("non-exclusive is checked before exclusive (order matters)", () => {
    // "non-exclusively" contains "exclusive" — must not fall through to exclusive branch
    expect(normalizeLicensingStatus("non-exclusively licensed")).toBe("non-exclusively licensed");
  });

  it("normalizes optioned", () => {
    expect(normalizeLicensingStatus("Under Option")).toBe("optioned");
  });

  it("normalizes startup formed", () => {
    expect(normalizeLicensingStatus("Startup formed")).toBe("startup formed");
    expect(normalizeLicensingStatus("spin-out company")).toBe("startup formed");
  });

  it("returns 'unknown' for unrecognized strings", () => {
    expect(normalizeLicensingStatus("pending review")).toBe("unknown");
  });
});

// ── normalizePatentStatus ─────────────────────────────────────────────────────

describe("normalizePatentStatus", () => {
  it("returns 'unknown' for empty string", () => {
    expect(normalizePatentStatus("")).toBe("unknown");
  });

  it("returns 'unknown' for undefined", () => {
    expect(normalizePatentStatus(undefined)).toBe("unknown");
  });

  it("normalizes 'granted' to 'patented'", () => {
    expect(normalizePatentStatus("Patent Granted")).toBe("patented");
  });

  it("normalizes exact string 'patented'", () => {
    expect(normalizePatentStatus("patented")).toBe("patented");
  });

  it("normalizes 'pending'", () => {
    expect(normalizePatentStatus("Patent Pending")).toBe("patent pending");
  });

  it("normalizes 'filed'", () => {
    expect(normalizePatentStatus("Patent Filed")).toBe("patent pending");
  });

  it("normalizes 'provisional'", () => {
    expect(normalizePatentStatus("Provisional Patent")).toBe("provisional");
  });

  it("normalizes 'copyright'", () => {
    expect(normalizePatentStatus("Copyright protected")).toBe("copyright");
  });

  it("normalizes 'trade secret'", () => {
    expect(normalizePatentStatus("Trade Secret")).toBe("trade secret");
  });

  it("returns 'unknown' for unrecognized strings", () => {
    expect(normalizePatentStatus("in review")).toBe("unknown");
  });
});
