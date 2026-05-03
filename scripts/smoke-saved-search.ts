/**
 * Smoke test for Task #713 — Saved-search availability alerts.
 *
 * Verifies:
 *   1. Pure matcher unit checks (true/false cases including blinding).
 *   2. End-to-end against `fanOutSavedSearchesForListing` — the same helper
 *      the admin PATCH /api/admin/market/listings/:id route invokes on first
 *      activation. Seeds two saved searches for one buyer + a matching listing
 *      and asserts exactly one notification row + one "newly notified" return
 *      entry (so the email path runs once, not twice).
 *
 * Run: tsx scripts/smoke-saved-search.ts
 *
 * Cleans up the rows it creates on success.
 */
import { db } from "../server/db";
import { eq, and } from "drizzle-orm";
import {
  marketListings,
  marketSavedSearches,
  marketAvailabilityNotifications,
  type MarketListing,
  type MarketSavedSearch,
  type MarketSavedSearchFilters,
} from "../shared/schema";
import { listingMatchesSavedSearch, fanOutSavedSearchesForListing } from "../server/lib/marketSavedSearchMatcher";

const TEST_USER = `smoke-saved-search-${Date.now()}`;
const TEST_SELLER = `smoke-saved-search-seller-${Date.now()}`;

function fixtureListing(overrides: Partial<MarketListing> = {}): MarketListing {
  const now = new Date();
  const base: MarketListing = {
    id: 0,
    sellerId: TEST_SELLER,
    orgId: null,
    ingestedAssetId: null,
    assetName: "MOLE-1234",
    blind: false,
    blindFields: {},
    therapeuticArea: "Oncology",
    modality: "Small Molecule",
    stage: "Preclinical",
    milestoneHistory: null,
    mechanism: "KRAS G12C inhibitor",
    ipStatus: null,
    ipSummary: null,
    askingPrice: null,
    priceRangeMin: 10,
    priceRangeMax: 30,
    engagementStatus: "actively_seeking",
    aiSummary: "Novel oncology candidate",
    status: "active",
    adminNote: null,
    createdAt: now,
    updatedAt: now,
  };
  return { ...base, ...overrides };
}

function fixtureSearch(filters: MarketSavedSearchFilters, keyword: string | null = null): MarketSavedSearch {
  return {
    id: 0,
    userId: TEST_USER,
    name: "fixture",
    keyword,
    filters,
    createdAt: new Date(),
  };
}


async function unitChecks() {
  const baseListing = fixtureListing();
  if (!listingMatchesSavedSearch(baseListing, fixtureSearch({ therapeuticArea: "Oncology", modality: "Small Molecule" }))) {
    throw new Error("FAIL: matcher should return true on filter match");
  }
  if (listingMatchesSavedSearch(baseListing, fixtureSearch({ therapeuticArea: "Cardiology" }))) {
    throw new Error("FAIL: matcher should return false on TA mismatch");
  }
  // Blinding: keyword that only matches assetName must be skipped when assetName is blinded
  const blindListing = fixtureListing({ blind: true, blindFields: { assetName: true }, mechanism: null, aiSummary: null });
  if (listingMatchesSavedSearch(blindListing, fixtureSearch({}, "MOLE-1234"))) {
    throw new Error("FAIL: matcher must not see through blinded assetName");
  }
  // Price ceiling: listing.priceRangeMin must be ≤ search max
  if (listingMatchesSavedSearch(baseListing, fixtureSearch({ priceRangeMaxM: 5 }))) {
    throw new Error("FAIL: matcher should reject when listing.priceRangeMin exceeds search max");
  }
  // Price floor: listing.priceRangeMax must be ≥ search min
  if (listingMatchesSavedSearch(baseListing, fixtureSearch({ priceRangeMinM: 100 }))) {
    throw new Error("FAIL: matcher should reject when listing.priceRangeMax is below search min");
  }
  if (!listingMatchesSavedSearch(baseListing, fixtureSearch({ priceRangeMinM: 5, priceRangeMaxM: 50 }))) {
    throw new Error("FAIL: matcher should accept when listing range overlaps search range");
  }
  console.log("✓ Matcher unit checks passed (true/false/blinding/price-min/price-max)");
}

async function e2e() {
  if (!process.env.DATABASE_URL) {
    console.log("DATABASE_URL not set — skipping DB e2e");
    return;
  }

  // Seed two saved searches for the same buyer (to verify per-buyer dedupe)
  const [s1] = await db.insert(marketSavedSearches).values({
    userId: TEST_USER,
    name: "Smoke Oncology SM",
    keyword: null,
    filters: { therapeuticArea: "Oncology", modality: "Small Molecule" },
  }).returning();
  await db.insert(marketSavedSearches).values({
    userId: TEST_USER,
    name: "Smoke Oncology any",
    keyword: "oncology",
    filters: { therapeuticArea: "Oncology" },
  });
  console.log(`✓ Seeded saved searches (${s1.id} + 1 more) for user ${TEST_USER}`);

  // Insert a draft listing then flip to active (mirrors what the admin
  // PATCH route does on first activation)
  const [draft] = await db.insert(marketListings).values({
    sellerId: TEST_SELLER,
    assetName: "Smoke MOLE-9999",
    therapeuticArea: "Oncology",
    modality: "Small Molecule",
    stage: "Preclinical",
    engagementStatus: "actively_seeking",
    status: "draft",
  }).returning();
  const [listing] = await db.update(marketListings)
    .set({ status: "active" })
    .where(eq(marketListings.id, draft.id))
    .returning();
  console.log(`✓ Activated listing id=${listing.id}`);

  // Invoke the exact same helper the admin PATCH route calls.
  const newlyNotified = await fanOutSavedSearchesForListing(listing);
  if (newlyNotified.length !== 1 || newlyNotified[0].userId !== TEST_USER) {
    throw new Error(`FAIL: expected 1 newly-notified buyer (${TEST_USER}), got ${JSON.stringify(newlyNotified)}`);
  }
  console.log("✓ fanOutSavedSearchesForListing reported exactly 1 newly-notified buyer");

  const notifs = await db.select().from(marketAvailabilityNotifications)
    .where(and(eq(marketAvailabilityNotifications.userId, TEST_USER), eq(marketAvailabilityNotifications.listingId, listing.id)));
  if (notifs.length !== 1) {
    throw new Error(`FAIL: expected exactly 1 notification for ${TEST_USER}, got ${notifs.length}`);
  }
  console.log("✓ Exactly 1 notification row inserted (dedupe across two matching saved searches)");

  // Run the helper again — the unique idx must dedupe and report 0 new notifications.
  const second = await fanOutSavedSearchesForListing(listing);
  if (second.length !== 0) {
    throw new Error(`FAIL: re-running fan-out should report 0 new buyers, got ${second.length}`);
  }
  const notifs2 = await db.select().from(marketAvailabilityNotifications)
    .where(and(eq(marketAvailabilityNotifications.userId, TEST_USER), eq(marketAvailabilityNotifications.listingId, listing.id)));
  if (notifs2.length !== 1) {
    throw new Error(`FAIL: re-running fan-out must not duplicate notifications; have ${notifs2.length}`);
  }
  console.log("✓ Re-running fan-out is a no-op (unique idx dedupes against EdenScout-link path too)");

  // Cleanup
  await db.delete(marketAvailabilityNotifications).where(eq(marketAvailabilityNotifications.userId, TEST_USER));
  await db.delete(marketSavedSearches).where(eq(marketSavedSearches.userId, TEST_USER));
  await db.delete(marketListings).where(eq(marketListings.id, listing.id));
  console.log("✓ Cleanup complete");
}

async function main() {
  await unitChecks();
  await e2e();
  console.log("\nALL CHECKS PASSED");
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
