import { describe, it, expect } from "vitest";
import { didEnrichImprove } from "./didEnrichImprove";

const allUnknown = {
  target: "unknown",
  modality: "unknown",
  indication: "unknown",
  developmentStage: "unknown",
};

const allKnown = {
  target: "EGFR",
  modality: "antibody",
  indication: "NSCLC",
  developmentStage: "phase 2",
};

// ── target field ──────────────────────────────────────────────────────────────

describe("target improvement", () => {
  it("returns true when target fills from 'unknown'", () => {
    expect(didEnrichImprove(allUnknown, { target: "EGFR" })).toBe(true);
  });

  it("returns true when target fills from empty string", () => {
    const before = { ...allUnknown, target: "" };
    expect(didEnrichImprove(before, { target: "PD-L1" })).toBe(true);
  });

  it("returns false when target was already known", () => {
    expect(didEnrichImprove(allKnown, { target: "VEGF" })).toBe(false);
  });

  it("returns false when target fills but result is also 'unknown'", () => {
    expect(didEnrichImprove(allUnknown, { target: "unknown" })).toBe(false);
  });

  it("returns false when target after is empty string", () => {
    expect(didEnrichImprove(allUnknown, { target: "" })).toBe(false);
  });

  it("returns false when target after is null", () => {
    expect(didEnrichImprove(allUnknown, { target: null })).toBe(false);
  });
});

// ── modality field ────────────────────────────────────────────────────────────

describe("modality improvement", () => {
  it("returns true when modality fills from 'unknown'", () => {
    expect(didEnrichImprove(allUnknown, { modality: "small molecule" })).toBe(true);
  });

  it("returns true when modality fills from empty string", () => {
    const before = { ...allUnknown, modality: "" };
    expect(didEnrichImprove(before, { modality: "gene therapy" })).toBe(true);
  });

  it("returns false when modality was already known", () => {
    expect(didEnrichImprove(allKnown, { modality: "antibody" })).toBe(false);
  });
});

// ── indication field ──────────────────────────────────────────────────────────

describe("indication improvement", () => {
  it("returns true when indication fills from 'unknown'", () => {
    expect(didEnrichImprove(allUnknown, { indication: "Alzheimer's disease" })).toBe(true);
  });

  it("returns false when indication was already known", () => {
    expect(didEnrichImprove(allKnown, { indication: "lung cancer" })).toBe(false);
  });
});

// ── developmentStage field ────────────────────────────────────────────────────

describe("developmentStage improvement", () => {
  it("returns true when stage fills from exactly 'unknown'", () => {
    expect(didEnrichImprove(allUnknown, { developmentStage: "phase 2" })).toBe(true);
  });

  it("returns false when stage was empty string — only 'unknown' triggers improvement", () => {
    const before = { ...allUnknown, developmentStage: "" };
    expect(didEnrichImprove(before, { developmentStage: "phase 1" })).toBe(false);
  });

  it("returns false when stage was already a known value", () => {
    expect(didEnrichImprove(allKnown, { developmentStage: "phase 3" })).toBe(false);
  });

  it("returns false when stage result is also 'unknown'", () => {
    expect(didEnrichImprove(allUnknown, { developmentStage: "unknown" })).toBe(false);
  });
});

// ── multi-field and edge cases ────────────────────────────────────────────────

describe("multi-field and edge cases", () => {
  it("returns true when any one field improves even if others remain unknown", () => {
    expect(didEnrichImprove(allUnknown, { modality: "antibody" })).toBe(true);
  });

  it("returns true when any one field improves even if other after-values are null", () => {
    expect(didEnrichImprove(allUnknown, {
      target: "EGFR",
      modality: null,
      indication: null,
      developmentStage: null,
    })).toBe(true);
  });

  it("returns false when after object provides no fields", () => {
    expect(didEnrichImprove(allUnknown, {})).toBe(false);
  });

  it("returns false when all before-fields are known and none of the after-values improve them", () => {
    expect(didEnrichImprove(allKnown, {
      target: "VEGF",
      modality: "small molecule",
      indication: "breast cancer",
      developmentStage: "phase 1",
    })).toBe(false);
  });

  it("returns true for a partially known asset where one unknown field fills", () => {
    const partial = { target: "EGFR", modality: "unknown", indication: "unknown", developmentStage: "phase 2" };
    expect(didEnrichImprove(partial, { modality: "antibody" })).toBe(true);
  });

  it("a before-field being null coerces to falsy — treated as unknown for target/modality/indication", () => {
    const before = { target: null as unknown as string, modality: "unknown", indication: "unknown", developmentStage: "unknown" };
    expect(didEnrichImprove(before, { target: "PD-L1" })).toBe(true);
  });
});
