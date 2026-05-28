import { describe, it, expect, vi } from "vitest";

vi.mock("../db", () => ({ db: {} }));
vi.mock("../storage", () => ({ storage: {} }));
vi.mock("@shared/schema", () => ({
  ingestedAssets: {}, userAlerts: {}, industryProfiles: {},
}));
vi.mock("../lib/supabaseAuth", () => ({ tryGetUserId: vi.fn() }));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(), and: vi.fn(), sql: vi.fn(), desc: vi.fn(), or: vi.fn(),
  ilike: vi.fn(), inArray: vi.fn(), gt: vi.fn(), count: vi.fn(),
}));

import { alertBodySchema, alertPreviewSchema } from "./alerts";

describe("alertBodySchema", () => {
  it("accepts a minimal valid body", () => {
    const result = alertBodySchema.safeParse({ name: "My alert" });
    expect(result.success).toBe(true);
  });

  it("accepts a fully-populated body", () => {
    const result = alertBodySchema.safeParse({
      name: "Full alert",
      query: "CRISPR",
      modalities: ["small_molecule", "biologic"],
      stages: ["preclinical"],
      institutions: ["MIT"],
      criteriaType: "custom",
      enabled: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a missing name", () => {
    const result = alertBodySchema.safeParse({ query: "test" });
    expect(result.success).toBe(false);
  });

  it("rejects an empty name", () => {
    const result = alertBodySchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a name longer than 200 chars", () => {
    const result = alertBodySchema.safeParse({ name: "a".repeat(201) });
    expect(result.success).toBe(false);
  });

  it("rejects a query longer than 500 chars", () => {
    const result = alertBodySchema.safeParse({ name: "ok", query: "q".repeat(501) });
    expect(result.success).toBe(false);
  });

  it("rejects modalities array with more than 20 items", () => {
    const result = alertBodySchema.safeParse({
      name: "ok",
      modalities: Array.from({ length: 21 }, (_, i) => `mod${i}`),
    });
    expect(result.success).toBe(false);
  });

  it("rejects institutions array with more than 100 items", () => {
    const result = alertBodySchema.safeParse({
      name: "ok",
      institutions: Array.from({ length: 101 }, (_, i) => `inst${i}`),
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid criteriaType", () => {
    const result = alertBodySchema.safeParse({ name: "ok", criteriaType: "unknown" });
    expect(result.success).toBe(false);
  });

  it("accepts null for optional array fields", () => {
    const result = alertBodySchema.safeParse({ name: "ok", modalities: null, stages: null });
    expect(result.success).toBe(true);
  });
});

describe("alertPreviewSchema", () => {
  it("accepts an empty object (all fields optional)", () => {
    expect(alertPreviewSchema.safeParse({}).success).toBe(true);
  });

  it("accepts valid filter fields", () => {
    expect(alertPreviewSchema.safeParse({
      query: "cancer",
      modalities: ["biologic"],
      stages: ["phase_1"],
      institutions: ["Stanford"],
    }).success).toBe(true);
  });

  it("rejects a query longer than 500 chars", () => {
    expect(alertPreviewSchema.safeParse({ query: "x".repeat(501) }).success).toBe(false);
  });

  it("rejects modalities with more than 20 items", () => {
    expect(alertPreviewSchema.safeParse({
      modalities: Array.from({ length: 21 }, (_, i) => `m${i}`),
    }).success).toBe(false);
  });

  it("rejects an institution string longer than 200 chars", () => {
    expect(alertPreviewSchema.safeParse({
      institutions: ["a".repeat(201)],
    }).success).toBe(false);
  });
});
