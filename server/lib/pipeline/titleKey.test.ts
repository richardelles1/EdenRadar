import { describe, it, expect } from "vitest";
import { computeTitleKey } from "./titleKey";

describe("computeTitleKey", () => {
  it("returns empty string for empty input", () => {
    expect(computeTitleKey("")).toBe("");
  });

  it("returns empty string for whitespace-only input", () => {
    expect(computeTitleKey("   ")).toBe("");
  });

  it("lowercases everything", () => {
    expect(computeTitleKey("EGFR")).toBe("egfr");
  });

  it("strips non-alphanumeric characters", () => {
    expect(computeTitleKey("Niemann-Pick")).toBe("niemann pick");
  });

  it("removes stop words", () => {
    expect(computeTitleKey("A Novel Therapy for Cancer")).toBe("cancer therapy");
  });

  it("removes single-character tokens", () => {
    expect(computeTitleKey("Vitamin A Therapy")).toBe("therapy vitamin");
  });

  it("sorts tokens alphabetically", () => {
    expect(computeTitleKey("Zinc Therapy Alpha")).toBe("alpha therapy zinc");
  });

  it("matches the docstring example", () => {
    expect(computeTitleKey("Enzyme Replacement Therapy in Niemann-Pick Disease")).toBe(
      "disease enzyme niemann pick replacement therapy"
    );
  });

  it("produces the same key regardless of word order", () => {
    const a = computeTitleKey("Gene Therapy EGFR Targeting");
    const b = computeTitleKey("EGFR Targeting Gene Therapy");
    expect(a).toBe(b);
  });

  it("produces different keys for genuinely different titles", () => {
    const a = computeTitleKey("EGFR inhibitor for lung cancer");
    const b = computeTitleKey("KRAS inhibitor for pancreatic cancer");
    expect(a).not.toBe(b);
  });

  it("treats punctuation-separated tokens as separate words", () => {
    const key = computeTitleKey("IL-6 receptor blockade");
    expect(key).toContain("blockade");
    expect(key).toContain("receptor");
    // "il" has length 2 so it stays; "6" has length 1 so it goes
    expect(key).toContain("il");
    expect(key).not.toContain("6");
  });

  it("collapses extra whitespace", () => {
    expect(computeTitleKey("gene   therapy")).toBe("gene therapy");
  });

  it("ignores all listed stop words", () => {
    const stopWords = [
      "a", "an", "the", "for", "in", "of", "and", "or", "to", "with",
      "by", "from", "on", "at", "as", "is", "its", "are", "was", "were",
      "be", "been", "have", "has", "do", "does", "via", "new", "novel",
      "using", "based", "type", "study", "role", "effect", "effects",
      "clinical",
    ];
    for (const word of stopWords) {
      expect(computeTitleKey(word)).toBe("");
    }
  });
});
