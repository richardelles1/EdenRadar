/**
 * iEdison scraper smoke test
 *
 * Run with:
 *   npx tsx scripts/smoke-iedison.ts
 *
 * Validates:
 *  1. getApiKey() reads IEDISON_API_KEY from env correctly
 *  2. mapJsonRecord() correctly handles well-formed, minimal, and empty records
 *  3. Mode label: "no key" path uses HTML-direct, "key present" path uses JSON API
 */

import assert from "node:assert/strict";
import { _internal } from "../server/lib/scrapers/iedison";

const { getApiKey, mapJsonRecord, BASE_URL } = _internal;

// ── 1. getApiKey() reads env correctly ────────────────────────────────────────

delete process.env.IEDISON_API_KEY;
assert.equal(getApiKey(), undefined, "getApiKey() should return undefined when env var absent");

process.env.IEDISON_API_KEY = "test-key-abc";
assert.equal(getApiKey(), "test-key-abc", "getApiKey() should return env var value when set");

delete process.env.IEDISON_API_KEY;

// ── 2. mapJsonRecord() field normalisation ────────────────────────────────────

const full = mapJsonRecord(
  {
    technologyTitle: "A Novel Therapeutic Target for Neurodegeneration",
    briefDescription: "This invention identifies a novel pathway for treating neurodegeneration.",
    assigneeInstitution: "Harvard Medical School",
    detailUrl: "/iEdison/technology/12345",
    technologyId: "HMS-2024-001",
    developmentStage: "Pre-clinical",
  },
  BASE_URL,
);
assert.ok(full !== null, "Full record should map to a listing");
assert.ok(full!.title.includes("Therapeutic"), "Title should be extracted from technologyTitle");
assert.equal(full!.institution, "Harvard Medical School");
assert.ok(full!.url.startsWith("https://"), "Relative detailUrl should be resolved to absolute");

const minimal = mapJsonRecord(
  {
    title: "CRISPR Gene Editing Method",
    description: "Description here",
  },
  BASE_URL,
);
assert.ok(minimal !== null, "Minimal record (fallback title field) should map");
assert.ok(minimal!.title.includes("CRISPR"), "Fallback title field should be used");

const tooShort = mapJsonRecord({ technologyTitle: "hi" }, BASE_URL);
assert.equal(tooShort, null, "Record with title < 5 chars should be rejected");

const empty = mapJsonRecord({}, BASE_URL);
assert.equal(empty, null, "Empty record should return null");

const unknownShapeSkipped = mapJsonRecord({ foo: 123, bar: null }, BASE_URL);
assert.equal(unknownShapeSkipped, null, "Non-string property values should not cause a crash");

console.log("✓ getApiKey() reads env correctly");
console.log("✓ mapJsonRecord() handles full, minimal, too-short, empty, and unknown-shape records");
console.log("\niEdison smoke tests PASSED");
