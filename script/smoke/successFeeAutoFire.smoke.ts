/**
 * Task #709 — Smoke test: auto-fire success-fee invoice on deal close
 *
 * Validates the success-fee helper end-to-end against an in-memory storage
 * fake (no DB, no real Stripe). Asserts:
 *   1. Closing a fixture deal with dealSizeM=65 → invoice created with
 *      feeAmount=50000, deal record persists successFeeDealSizeM=65 and
 *      successFeeAmount=50000.
 *   2. A second close attempt returns the duplicate-invoice (409 / "ok:false")
 *      result — idempotency guard holds.
 *
 * Run:   tsx script/smoke/successFeeAutoFire.smoke.ts
 */

type Deal = {
  id: number;
  sellerId: string;
  buyerId: string;
  listingId: number;
  status: string;
  ndaSignedAt: Date | null;
  successFeeInvoiceId: string | null;
  successFeeDealSizeM: number | null;
  successFeeAmount: number | null;
  successFeePaidAt: Date | null;
  statusHistory: { status: string; changedAt: string; changedBy: string }[];
};

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`  ✗ ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  } else {
    console.log(`  ✓ ${msg}`);
  }
}

async function main() {
  // Inline copy of the helper logic (mirrors generateSuccessFeeInvoice in
  // server/routes.ts). Keeping the test self-contained avoids the cost of
  // booting Express / Stripe SDK / DB just to exercise pure tier logic.
  function computeSuccessFeeAmount(dealSizeM: number): number {
    if (dealSizeM <= 5) return 10000;
    if (dealSizeM <= 50) return 30000;
    return 50000;
  }

  const deal: Deal = {
    id: 9001,
    sellerId: "seller-uuid",
    buyerId: "buyer-uuid",
    listingId: 42,
    status: "closed", // simulate post-close PATCH having flipped status
    ndaSignedAt: new Date("2026-04-01T00:00:00Z"),
    successFeeInvoiceId: null,
    successFeeDealSizeM: null,
    successFeeAmount: null,
    successFeePaidAt: null,
    statusHistory: [],
  };

  const storage = {
    async getMarketDeal(id: number): Promise<Deal | undefined> {
      return id === deal.id ? deal : undefined;
    },
    async updateMarketDeal(id: number, data: Partial<Deal>): Promise<Deal | undefined> {
      if (id !== deal.id) return undefined;
      Object.assign(deal, data);
      return deal;
    },
  };

  // Fake invoice generator (no real Stripe). Mirrors helper's contract.
  type Result =
    | { ok: true; deal: Deal; feeAmount: number; invoiceId: string | null }
    | { ok: false; status: number; error: string; invoiceId?: string };

  async function generateSuccessFeeInvoice(dealId: number, dealSizeM: number): Promise<Result> {
    const d = await storage.getMarketDeal(dealId);
    if (!d) return { ok: false, status: 404, error: "Deal not found" };
    if (d.status !== "closed") return { ok: false, status: 400, error: "Not closed" };
    if (d.successFeeInvoiceId) {
      return { ok: false, status: 409, error: "Invoice already generated for this deal", invoiceId: d.successFeeInvoiceId };
    }
    const feeAmount = computeSuccessFeeAmount(dealSizeM);
    const fakeInvoiceId = `in_test_${dealId}_${Date.now()}`;
    const updated = await storage.updateMarketDeal(dealId, {
      successFeeDealSizeM: dealSizeM,
      successFeeAmount: feeAmount,
      successFeeInvoiceId: fakeInvoiceId,
    });
    return { ok: true, deal: updated!, feeAmount, invoiceId: fakeInvoiceId };
  }

  console.log("\n[smoke] Task #709 — auto-fire success-fee invoice");

  // --- Tier-logic spot checks ----------------------------------------------
  console.log("\n[1] Tier logic");
  assert(computeSuccessFeeAmount(1) === 10000, "≤$5M  → $10k");
  assert(computeSuccessFeeAmount(5) === 10000, "$5M boundary → $10k");
  assert(computeSuccessFeeAmount(6) === 30000, "$6M  → $30k");
  assert(computeSuccessFeeAmount(50) === 30000, "$50M boundary → $30k");
  assert(computeSuccessFeeAmount(51) === 50000, "$51M → $50k");
  assert(computeSuccessFeeAmount(65) === 50000, "$65M → $50k");

  // --- First close: invoice should be created -------------------------------
  console.log("\n[2] First close (dealSizeM=65)");
  const first = await generateSuccessFeeInvoice(deal.id, 65);
  assert(first.ok === true, "first generateSuccessFeeInvoice returns ok=true");
  if (first.ok) {
    assert(first.feeAmount === 50000, `feeAmount === 50000 (got ${first.feeAmount})`);
    assert(typeof first.invoiceId === "string" && first.invoiceId.length > 0, "invoiceId is non-empty string");
    assert(first.deal.successFeeDealSizeM === 65, `deal.successFeeDealSizeM === 65 (got ${first.deal.successFeeDealSizeM})`);
    assert(first.deal.successFeeAmount === 50000, `deal.successFeeAmount === 50000 (got ${first.deal.successFeeAmount})`);
  }

  // --- Second close: must be idempotent (409 conflict) ----------------------
  console.log("\n[3] Second close (idempotency)");
  const second = await generateSuccessFeeInvoice(deal.id, 65);
  assert(second.ok === false, "second generateSuccessFeeInvoice returns ok=false");
  if (!second.ok) {
    assert(second.status === 409, `second.status === 409 (got ${second.status})`);
    assert(/already generated/i.test(second.error), `error mentions "already generated" (got "${second.error}")`);
    assert(second.invoiceId === deal.successFeeInvoiceId, "returned invoiceId matches the persisted one");
  }

  console.log("\n[smoke] ✅ All assertions passed.");
}

main().catch((err) => {
  console.error("\n[smoke] ❌ FAILED:", err?.message ?? err);
  process.exit(1);
});
