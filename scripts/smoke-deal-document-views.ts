/**
 * Deal Room document view tracking smoke test
 *
 * Run with:
 *   npx tsx scripts/smoke-deal-document-views.ts
 *
 * Walks the full happy path of task #712:
 *   1. create a fixture deal (NDA already signed by both parties)
 *   2. seller uploads a document
 *   3. buyer "opens" the document (records a view row, mirroring the
 *      track-view endpoint)
 *   4. seller fetches the documents list — assert
 *      lastViewedByCounterparty.viewerId === buyerId
 *   5. seller's own subsequent open is NOT surfaced as a counterparty view
 *
 * Cleans up its fixture rows afterwards even on failure.
 */

import assert from "node:assert/strict";
import { db } from "../server/db";
import { storage } from "../server/storage";
import {
  marketListings,
  marketEois,
  marketDeals,
  marketDealDocuments,
  marketDealDocumentViews,
} from "@shared/schema";
import { eq } from "drizzle-orm";

const SELLER_ID = `smoke-seller-${Date.now()}`;
const BUYER_ID = `smoke-buyer-${Date.now()}`;

let listingId: number | null = null;
let eoiId: number | null = null;
let dealId: number | null = null;
let docId: number | null = null;

async function cleanup() {
  try {
    if (docId != null) await db.delete(marketDealDocumentViews).where(eq(marketDealDocumentViews.documentId, docId));
    if (docId != null) await db.delete(marketDealDocuments).where(eq(marketDealDocuments.id, docId));
    if (dealId != null) await db.delete(marketDeals).where(eq(marketDeals.id, dealId));
    if (eoiId != null) await db.delete(marketEois).where(eq(marketEois.id, eoiId));
    if (listingId != null) await db.delete(marketListings).where(eq(marketListings.id, listingId));
  } catch (e) {
    console.warn("[smoke-deal-views] cleanup warning:", e);
  }
}

async function main() {
  // 1. Fixture deal — NDA already executed by both parties.
  const [listing] = await db.insert(marketListings).values({
    sellerId: SELLER_ID,
    therapeuticArea: "Oncology",
    modality: "Small Molecule",
    stage: "Preclinical",
    engagementStatus: "actively_seeking",
    status: "active",
  }).returning();
  listingId = listing.id;

  const [eoi] = await db.insert(marketEois).values({
    listingId,
    buyerId: BUYER_ID,
    company: "Smoke Buyer Co",
    role: "BD",
    rationale: "smoke test",
  }).returning();
  eoiId = eoi.id;

  const now = new Date();
  const [deal] = await db.insert(marketDeals).values({
    listingId,
    eoiId,
    sellerId: SELLER_ID,
    buyerId: BUYER_ID,
    status: "nda_signed",
    sellerSignedAt: now,
    sellerSignedName: "Seller Smoke",
    buyerSignedAt: now,
    buyerSignedName: "Buyer Smoke",
    ndaSignedAt: now,
  }).returning();
  dealId = deal.id;

  // 2. Seller uploads a document.
  const doc = await storage.createMarketDealDocument({
    dealId,
    uploaderId: SELLER_ID,
    fileName: "diligence-smoke.pdf",
    fileUrl: `deal-${dealId}/smoke.pdf`,
    fileSize: 1234,
  });
  docId = doc.id;

  // 3. Buyer opens the document — mirrors POST track-view.
  await storage.recordMarketDealDocumentView({ documentId: docId, viewerId: BUYER_ID });

  // 4. Seller refetches → should see buyer as last counterparty viewer.
  const sellerView = await fetchEnriched(dealId, SELLER_ID);
  const sellerDoc = sellerView.find((d) => d.id === docId)!;
  assert.ok(sellerDoc, "seller sees the document");
  assert.ok(sellerDoc.lastViewedByCounterparty, "seller sees a counterparty view recorded");
  assert.equal(
    sellerDoc.lastViewedByCounterparty!.viewerId,
    BUYER_ID,
    "lastViewedByCounterparty.viewerId === buyerId",
  );
  assert.equal(sellerDoc.viewCountByCounterparty, 1, "seller sees viewCountByCounterparty === 1");
  assert.equal(sellerDoc.ownViewCount, 0, "seller has not opened the doc themselves yet");

  // 5. Seller opens their own doc — must NOT appear as counterparty view.
  await storage.recordMarketDealDocumentView({ documentId: docId, viewerId: SELLER_ID });
  const sellerView2 = await fetchEnriched(dealId, SELLER_ID);
  const sellerDoc2 = sellerView2.find((d) => d.id === docId)!;
  assert.equal(
    sellerDoc2.viewCountByCounterparty,
    1,
    "seller's own open does not bump counterparty count",
  );
  assert.equal(sellerDoc2.ownViewCount, 1, "seller's own open is reflected in ownViewCount");

  // 6. From the buyer's perspective, the seller open IS a counterparty view.
  const buyerView = await fetchEnriched(dealId, BUYER_ID);
  const buyerDoc = buyerView.find((d) => d.id === docId)!;
  assert.equal(
    buyerDoc.lastViewedByCounterparty?.viewerId,
    SELLER_ID,
    "buyer sees seller as last counterparty viewer",
  );
  assert.equal(buyerDoc.viewCountByCounterparty, 1, "buyer sees 1 seller view");
  assert.equal(buyerDoc.ownViewCount, 1, "buyer's own prior open is reflected in ownViewCount");

  console.log("[smoke-deal-views] OK — view tracking visible to counterparty in both directions");
}

// Mirrors the enrichment performed by GET /api/market/deals/:id/documents.
async function fetchEnriched(dealIdArg: number, viewerId: string) {
  const docs = await storage.getMarketDealDocuments(dealIdArg);
  const allViews = await storage.getMarketDealDocumentViews(docs.map((d) => d.id));
  return docs.map((d) => {
    const docViews = allViews.filter((v) => v.documentId === d.id);
    const counterparty = docViews
      .filter((v) => v.viewerId !== viewerId)
      .sort((a, b) => +new Date(b.viewedAt) - +new Date(a.viewedAt));
    const own = docViews.filter((v) => v.viewerId === viewerId);
    const last = counterparty[0] ?? null;
    return {
      ...d,
      lastViewedByCounterparty: last ? { viewerId: last.viewerId, viewedAt: last.viewedAt } : null,
      viewCountByCounterparty: counterparty.length,
      ownViewCount: own.length,
    };
  });
}

main()
  .catch((err) => {
    console.error("[smoke-deal-views] FAIL", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup();
    process.exit(process.exitCode ?? 0);
  });
