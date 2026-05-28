import { describe, it, expect } from "vitest";
import {
  sanitize,
  nullIfUnknown,
  STAGE_VALUES,
  MODALITY_VALUES,
  IP_TYPES,
  LICENSING_READINESS,
} from "./classifyAsset";

// ── sanitize ──────────────────────────────────────────────────────────────────

describe("sanitize", () => {
  const allowed = new Set(["small molecule", "antibody", "unknown"]);

  it("returns a valid value unchanged", () => {
    expect(sanitize("small molecule", allowed, "unknown")).toBe("small molecule");
  });

  it("normalizes to lowercase", () => {
    expect(sanitize("Small Molecule", allowed, "unknown")).toBe("small molecule");
  });

  it("trims whitespace before checking", () => {
    expect(sanitize("  antibody  ", allowed, "unknown")).toBe("antibody");
  });

  it("returns fallback for a value not in the set", () => {
    expect(sanitize("bispecific", allowed, "unknown")).toBe("unknown");
  });

  it("returns fallback for empty string", () => {
    expect(sanitize("", allowed, "unknown")).toBe("unknown");
  });

  it("handles null-like input without throwing (coerced via ??)", () => {
    // TypeScript won't allow null here, but the runtime guard handles it
    expect(sanitize(undefined as unknown as string, allowed, "unknown")).toBe("unknown");
  });

  it("uses whatever fallback is supplied", () => {
    expect(sanitize("nope", allowed, "other")).toBe("other");
  });

  // Verify the exported enum sets are complete and self-consistent

  it("STAGE_VALUES contains all expected stages", () => {
    for (const v of ["discovery", "preclinical", "phase 1", "phase 2", "phase 3", "approved", "unknown"]) {
      expect(STAGE_VALUES.has(v)).toBe(true);
    }
  });

  it("MODALITY_VALUES contains common modalities", () => {
    for (const v of ["small molecule", "antibody", "gene therapy", "car-t", "mrna therapy", "unknown"]) {
      expect(MODALITY_VALUES.has(v)).toBe(true);
    }
  });

  it("IP_TYPES contains expected values", () => {
    for (const v of ["patent pending", "patented", "provisional", "copyright", "trade secret", "none", "unknown"]) {
      expect(IP_TYPES.has(v)).toBe(true);
    }
  });

  it("LICENSING_READINESS contains expected values", () => {
    for (const v of ["available", "exclusively licensed", "non-exclusively licensed", "optioned", "startup formed", "unknown"]) {
      expect(LICENSING_READINESS.has(v)).toBe(true);
    }
  });
});

// ── nullIfUnknown ─────────────────────────────────────────────────────────────

describe("nullIfUnknown", () => {
  it("returns null for null", () => {
    expect(nullIfUnknown(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(nullIfUnknown(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(nullIfUnknown("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(nullIfUnknown("   ")).toBeNull();
  });

  it("returns null for 'unknown' (exact, lowercase)", () => {
    expect(nullIfUnknown("unknown")).toBeNull();
  });

  it("returns null for 'unknown' regardless of case", () => {
    expect(nullIfUnknown("Unknown")).toBeNull();
    expect(nullIfUnknown("UNKNOWN")).toBeNull();
  });

  it("returns null for 'unknown' with surrounding whitespace", () => {
    expect(nullIfUnknown("  unknown  ")).toBeNull();
  });

  it("returns null for 0 (falsy number)", () => {
    expect(nullIfUnknown(0)).toBeNull();
  });

  it("returns null for false", () => {
    expect(nullIfUnknown(false)).toBeNull();
  });

  it("returns the trimmed string for a valid value", () => {
    expect(nullIfUnknown("EGFR")).toBe("EGFR");
  });

  it("trims whitespace from valid values", () => {
    expect(nullIfUnknown("  PD-L1  ")).toBe("PD-L1");
  });

  it("converts non-string truthy values to their string representation", () => {
    expect(nullIfUnknown(42)).toBe("42");
  });

  it("does not treat 'none' as unknown — only 'unknown' is special-cased", () => {
    expect(nullIfUnknown("none")).toBe("none");
  });
});
