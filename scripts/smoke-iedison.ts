/**
 * iEdison scraper smoke test
 *
 * Run with:
 *   npx tsx scripts/smoke-iedison.ts
 *
 * Validates:
 *  1. getApiKey() / selectScrapeMode() -- key-present vs key-absent path selection
 *  2. computeFromDate() -- incremental date cursor derivation from last_seen_at
 *  3. mapJsonRecord() -- record field normalisation with full, minimal, empty inputs
 */

import assert from "node:assert/strict";
import { selectScrapeMode, computeFromDate, _internal } from "../server/lib/scrapers/iedison";

const { getApiKey, mapJsonRecord, BASE_URL } = _internal;

// ── 1. Mode selection based on IEDISON_API_KEY ────────────────────────────────

delete process.env.IEDISON_API_KEY;
assert.equal(getApiKey(), undefined, "getApiKey() returns undefined when env var absent");
assert.equal(selectScrapeMode(), "html", "No key → HTML path selected");

process.env.IEDISON_API_KEY = "test-key-abc";
assert.equal(getApiKey(), "test-key-abc", "getApiKey() returns value when env var set");
assert.equal(selectScrapeMode(), "authenticated", "Key present → authenticated JSON path selected");

delete process.env.IEDISON_API_KEY;

// ── 2. Incremental cursor computation ─────────────────────────────────────────

const now = new Date();
const hardCap = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000); // 12 months ago

// Case A: no prior ingestion -- should use hard cap
assert.equal(
  computeFromDate(null, hardCap, now).getTime(),
  hardCap.getTime(),
  "Null last_seen_at falls back to hard cap",
);
assert.equal(
  computeFromDate(undefined, hardCap, now).getTime(),
  hardCap.getTime(),
  "Undefined last_seen_at falls back to hard cap",
);

// Case B: recent ingestion inside the window -- should use it (advanced by 1 second)
const recent = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000); // 3 days ago
const cursor = computeFromDate(recent, hardCap, now);
assert.equal(cursor.getTime(), recent.getTime() + 1000, "Cursor is advanced by exactly 1 second");
assert.ok(cursor > hardCap, "Recent cursor is more recent than hard cap");

// Case C: last_seen_at older than hard cap -- hard cap wins
const ancient = new Date(now.getTime() - 2 * 365 * 24 * 60 * 60 * 1000); // 2 years ago
assert.equal(
  computeFromDate(ancient, hardCap, now).getTime(),
  hardCap.getTime(),
  "Ancient last_seen_at (older than hard cap) yields hard cap",
);

// Case D: invalid date string -- hard cap fallback
assert.equal(
  computeFromDate("not-a-date", hardCap, now).getTime(),
  hardCap.getTime(),
  "Invalid date string falls back to hard cap",
);

// Case E: string ISO timestamp (as returned by Drizzle/PostgreSQL)
const isoStr = recent.toISOString();
const fromIso = computeFromDate(isoStr, hardCap, now);
assert.equal(fromIso.getTime(), new Date(isoStr).getTime() + 1000, "ISO string input correctly parsed");

// ── 3. mapJsonRecord() field normalisation ────────────────────────────────────

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
assert.ok(full !== null, "Full record maps to a listing");
assert.ok(full!.title.includes("Therapeutic"), "Title from technologyTitle");
assert.equal(full!.institution, "Harvard Medical School", "Institution from assigneeInstitution");
assert.ok(full!.url.startsWith("https://"), "Relative detailUrl resolved to absolute");

const minimal = mapJsonRecord({ title: "CRISPR Gene Editing Method", description: "Desc" }, BASE_URL);
assert.ok(minimal !== null, "Fallback to `title` field");

const tooShort = mapJsonRecord({ technologyTitle: "hi" }, BASE_URL);
assert.equal(tooShort, null, "Title < 5 chars rejected");

const emptyRecord = mapJsonRecord({}, BASE_URL);
assert.equal(emptyRecord, null, "Empty record returns null");

const nonStringValues = mapJsonRecord({ technologyTitle: 12345, briefDescription: true }, BASE_URL);
assert.equal(nonStringValues, null, "Non-string field values handled safely");

// ── Results ───────────────────────────────────────────────────────────────────

console.log("✓ selectScrapeMode() -- no key -> html, key present -> authenticated");
console.log("✓ computeFromDate() -- null/undefined/ancient/invalid -> hard cap; recent -> +1s cursor; ISO string parsed");
console.log("✓ mapJsonRecord() -- full/minimal/too-short/empty/non-string handled");
console.log("\niEdison smoke tests PASSED");
