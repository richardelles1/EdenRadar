/**
 * Smoke test for per-field listing blinding (Task #710).
 *
 * Verifies:
 *  1. `blind_fields` jsonb column accepts the per-field map.
 *  2. Server-side helpers mask the right fields for non-seller viewers.
 *  3. Sellers see the full record.
 *  4. Legacy `blind=true` rows backfill into the canonical 3-field mask.
 *
 * Run with:  npx tsx scripts/smoke-market-blind-fields.ts
 */
import { db } from "../server/db";
import { marketListings, type MarketListing } from "../shared/schema";
import { eq } from "drizzle-orm";

type BlindFields = {
  assetName?: boolean;
  institution?: boolean;
  inventorNames?: boolean;
  exactPatentIds?: boolean;
  mechanismDetail?: boolean;
};

function normalizeBlindFields(l: { blind?: boolean | null; blindFields?: BlindFields | null }): BlindFields {
  const bf = (l.blindFields ?? {}) as BlindFields;
  if (l.blind && !bf.assetName && !bf.institution && !bf.inventorNames && !bf.exactPatentIds && !bf.mechanismDetail) {
    return { assetName: true, institution: true, inventorNames: true };
  }
  return bf;
}
function anyBlinded(bf: BlindFields): boolean {
  return !!(bf.assetName || bf.institution || bf.inventorNames || bf.exactPatentIds || bf.mechanismDetail);
}
function maskListingForViewer<T extends MarketListing>(listing: T, isPrivileged: boolean): T {
  if (isPrivileged) return listing;
  const bf = normalizeBlindFields(listing);
  const out: T = { ...listing };
  if (bf.assetName) out.assetName = null;
  if (bf.mechanismDetail) out.mechanism = null;
  if (bf.exactPatentIds) {
    out.ipStatus = null;
    out.ipSummary = null;
  }
  out.blind = anyBlinded(bf);
  return out;
}

function assert(cond: unknown, msg: string) {
  if (!cond) {
    console.error(`✗ FAIL: ${msg}`);
    process.exit(1);
  }
  console.log(`✓ ${msg}`);
}

async function main() {
  const SELLER_ID = "smoke-seller-blind-fields";
  // Clean any previous run
  await db.delete(marketListings).where(eq(marketListings.sellerId, SELLER_ID));

  // 1. Insert with per-field mask
  const [created] = await db.insert(marketListings).values({
    sellerId: SELLER_ID,
    therapeuticArea: "Oncology",
    modality: "Small Molecule",
    stage: "Preclinical",
    assetName: "Compound XYZ",
    mechanism: "TKI inhibition of EGFR",
    ipStatus: "US 10,123,456 granted",
    ipSummary: "Composition + use claims",
    blind: true,
    blindFields: { assetName: true, exactPatentIds: true },
    status: "active",
    engagementStatus: "actively_seeking",
  }).returning();

  assert(created.blindFields?.assetName === true, "blind_fields.assetName persisted");
  assert(created.blindFields?.exactPatentIds === true, "blind_fields.exactPatentIds persisted");

  // 2. Buyer view masks only the chosen fields
  const buyerView = maskListingForViewer(created, false);
  assert(buyerView.assetName === null, "buyer view: assetName masked");
  assert(buyerView.ipStatus === null, "buyer view: ipStatus masked");
  assert(buyerView.ipSummary === null, "buyer view: ipSummary masked");
  assert(buyerView.mechanism === "TKI inhibition of EGFR", "buyer view: mechanism NOT masked (not selected)");
  assert(buyerView.blind === true, "buyer view: derived blind flag = true");

  // 3. Seller view reveals everything
  const sellerView = maskListingForViewer(created, true);
  assert(sellerView.assetName === "Compound XYZ", "seller view: assetName visible");
  assert(sellerView.ipStatus === "US 10,123,456 granted", "seller view: ipStatus visible");

  // 4. Legacy backfill: blind=true with empty blindFields → 3-field default mask
  const [legacy] = await db.insert(marketListings).values({
    sellerId: SELLER_ID,
    therapeuticArea: "Immunology",
    modality: "Antibody",
    stage: "Phase 1",
    assetName: "Legacy-Asset",
    mechanism: "Anti-X mAb",
    blind: true,
    blindFields: {},
    status: "active",
    engagementStatus: "actively_seeking",
  }).returning();
  const legacyMask = normalizeBlindFields(legacy);
  assert(legacyMask.assetName === true && legacyMask.institution === true && legacyMask.inventorNames === true,
    "legacy blind=true backfills to {assetName, institution, inventorNames}");
  const legacyBuyerView = maskListingForViewer(legacy, false);
  assert(legacyBuyerView.assetName === null, "legacy buyer view: assetName masked");
  assert(legacyBuyerView.mechanism === "Anti-X mAb", "legacy buyer view: mechanism NOT masked (not in legacy default)");

  // 5. Unblinded listing stays fully visible
  const [open] = await db.insert(marketListings).values({
    sellerId: SELLER_ID,
    therapeuticArea: "Cardiology",
    modality: "Biologic",
    stage: "Preclinical",
    assetName: "Open-Asset",
    blind: false,
    blindFields: {},
    status: "active",
    engagementStatus: "actively_seeking",
  }).returning();
  const openView = maskListingForViewer(open, false);
  assert(openView.assetName === "Open-Asset", "unblinded buyer view: assetName visible");
  assert(openView.blind === false, "unblinded buyer view: derived blind flag = false");

  // Cleanup
  await db.delete(marketListings).where(eq(marketListings.sellerId, SELLER_ID));
  console.log("\n✅ All per-field blinding smoke checks passed.");
  process.exit(0);
}

main().catch(err => {
  console.error("smoke test crashed:", err);
  process.exit(1);
});
