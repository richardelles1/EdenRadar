/**
 * EdenMarket cold-path SLA smoke (Task #714).
 *
 * Seeds a deterministic fixture (org with active EdenMarket access, seller
 * user, buyer user, listing, EOI, accepted deal, one document, one message)
 * directly via the storage layer, then exercises the same EdenMarket cold-path
 * HTTP routes the buyer + seller hit on every page-load:
 *
 *   GET /api/market/listings
 *   GET /api/market/listings/:id
 *   GET /api/market/listings/:id/intelligence
 *   GET /api/market/deals
 *   GET /api/market/deals/:id
 *
 * Authentication uses the loopback-only bypass added to verifyAnyAuth. The
 * server only honors x-smoke-user-id when ENABLE_SMOKE_AUTH_BYPASS=true,
 * NODE_ENV !== "production", and the request originates from a loopback
 * address — so this smoke can probe authenticated routes without standing up
 * a real Supabase user, and the bypass is unreachable from the public
 * internet by construction. After probing, the script tears the fixture down
 * so the smoke is idempotent and safe to re-run.
 *
 * SLA bar (per task #714 done criteria):
 *   - Each probe must complete in <= MARKET_BUDGET_MS (1500ms).
 *   - Each probe must return HTTP 200 — anonymous 401/403 is NOT acceptable.
 *   - Aggregate error rate must be 0%.
 *   - Every probe MUST execute (no skip-on-missing-fixture path).
 *
 * Usage:
 *   ENABLE_SMOKE_AUTH_BYPASS=true npx tsx scripts/smoke-market.ts [base-url]
 *
 * Exits non-zero on any miss so this can be wired into the deploy validation
 * pipeline.
 */

import { randomUUID } from "node:crypto";
import { storage } from "../server/storage";
import { db } from "../server/db";
import { organizations, industryProfiles } from "../shared/schema";
import type {
  Organization,
  MarketListing,
  MarketEoi,
  MarketDeal,
  InsertOrganization,
  InsertMarketListingFull,
  InsertMarketEoi,
  InsertMarketDeal,
  InsertMarketDealDocument,
  InsertMarketDealMessage,
} from "../shared/schema";
import { eq } from "drizzle-orm";

const BASE_URL = process.argv[2] ?? "http://localhost:5000";
const MARKET_BUDGET_MS = 1500;
const RUN_ID = randomUUID().slice(0, 8);
// Loopback-only bypass; server-side check enforces this in addition.
// We only verify here that the BASE_URL is loopback so we fail fast with a
// clear message instead of bouncing off 401s.
{
  let host = "";
  try { host = new URL(BASE_URL).hostname; } catch { /* fall through */ }
  const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  if (!loopbackHosts.has(host)) {
    console.error(`[smoke-market] BASE_URL must be loopback (got host="${host}"). The auth bypass is loopback-only.`);
    process.exit(2);
  }
}

interface ProbeResult {
  name: string;
  url: string;
  status: number;
  ms: number;
  ok: boolean;
  detail: string;
  error?: string;
}

async function probe(
  name: string,
  path: string,
  asUser: string,
  validate: (body: unknown) => string,
): Promise<ProbeResult> {
  const url = `${BASE_URL}${path}`;
  const start = Date.now();
  try {
    const res = await fetch(url, {
      headers: {
        "x-smoke-user-id": asUser,
        "accept": "application/json",
      },
    });
    const ms = Date.now() - start;
    const text = await res.text();
    let body: unknown;
    try { body = JSON.parse(text); } catch { body = text.slice(0, 200); }
    if (res.status !== 200) {
      return {
        name, url, status: res.status, ms, ok: false, detail: "",
        error: `BAD_STATUS(${res.status}, expected 200) · ${typeof body === "string" ? body : JSON.stringify(body).slice(0, 200)}`,
      };
    }
    const overBudget = ms > MARKET_BUDGET_MS;
    let detail = "";
    try { detail = validate(body); }
    catch (vErr) {
      return { name, url, status: res.status, ms, ok: false, detail: "", error: `VALIDATE_FAILED(${(vErr as Error).message})` };
    }
    return {
      name, url, status: res.status, ms, ok: !overBudget, detail,
      error: overBudget ? `OVER_BUDGET(${ms}ms > ${MARKET_BUDGET_MS}ms)` : undefined,
    };
  } catch (err) {
    return {
      name, url, status: 0, ms: Date.now() - start, ok: false, detail: "",
      error: `NETWORK(${err instanceof Error ? err.message : String(err)})`,
    };
  }
}

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
}

interface Fixture {
  org: Organization;
  sellerId: string;
  buyerId: string;
  listing: MarketListing;
  eoi: MarketEoi;
  deal: MarketDeal;
}

async function seedFixture(): Promise<Fixture> {
  const sellerId = `smoke-seller-${RUN_ID}`;
  const buyerId = `smoke-buyer-${RUN_ID}`;

  const orgInsert: InsertOrganization = {
    name: `Smoke Org ${RUN_ID}`,
    planTier: "growth",
    seatLimit: 5,
    edenMarketAccess: true,
    marketSellerVerifiedAt: new Date(),
  };
  const org = await storage.createOrganization(orgInsert);

  // getOrgForUser() resolves via industry_profiles.org_id, so the smoke
  // users need profile rows linking them to the seeded org for the gates
  // (hasMarketRead) to recognize them as paying members.
  await db.insert(industryProfiles).values([
    { userId: sellerId, userName: `Smoke Seller ${RUN_ID}`, companyName: `Smoke Org ${RUN_ID}`, orgId: org.id },
    { userId: buyerId, userName: `Smoke Buyer ${RUN_ID}`, companyName: `Smoke Buyer Co ${RUN_ID}`, orgId: org.id },
  ]);

  const listingInsert: InsertMarketListingFull = {
    sellerId,
    orgId: org.id,
    therapeuticArea: "oncology",
    modality: "small molecule",
    stage: "preclinical",
    blind: false,
    blindFields: {},
    engagementStatus: "actively_seeking",
    assetName: `Smoke Asset ${RUN_ID}`,
    mechanism: "smoke-mechanism",
    ipStatus: "filed",
    askingPrice: "TBD",
  };
  const listing = await storage.createMarketListing(listingInsert);
  // createMarketListing forces "pending"; admin-flip to "active" so the
  // listing appears in the buyer feed (mirrors admin approval).
  await storage.adminUpdateMarketListing(listing.id, { status: "active" });
  listing.status = "active";

  const eoiInsert: InsertMarketEoi & { buyerId: string } = {
    listingId: listing.id,
    buyerId,
    company: `Smoke Buyer Co ${RUN_ID}`,
    role: "BD",
    rationale: "Smoke fixture EOI for SLA harness",
  };
  const eoi = await storage.createMarketEoi(eoiInsert);

  const dealInsert: InsertMarketDeal = {
    listingId: listing.id,
    eoiId: eoi.id,
    sellerId,
    buyerId,
    status: "due_diligence",
    statusHistory: [{ status: "nda_pending", changedAt: new Date().toISOString(), changedBy: sellerId }],
  };
  const deal = await storage.createMarketDeal(dealInsert);

  const docInsert: InsertMarketDealDocument = {
    dealId: deal.id,
    uploaderId: sellerId,
    fileName: `smoke-${RUN_ID}.pdf`,
    fileUrl: `https://example.invalid/smoke-${RUN_ID}.pdf`,
    fileSize: 1024,
  };
  await storage.createMarketDealDocument(docInsert);

  const msgInsert: InsertMarketDealMessage = {
    dealId: deal.id,
    senderId: sellerId,
    body: "Smoke fixture message",
  };
  await storage.createMarketDealMessage(msgInsert);

  return { org, sellerId, buyerId, listing, eoi, deal };
}

async function teardownFixture(f: Fixture | null): Promise<void> {
  if (!f) return;
  // marketListings cascades EOIs → deals → documents/messages
  try { await storage.deleteMarketListing(f.listing.id, f.sellerId); }
  catch (e) { console.warn(`  teardown: deleteMarketListing failed: ${(e as Error).message}`); }
  try {
    await db.delete(industryProfiles).where(eq(industryProfiles.userId, f.sellerId));
    await db.delete(industryProfiles).where(eq(industryProfiles.userId, f.buyerId));
  } catch (e) { console.warn(`  teardown: delete industry profiles failed: ${(e as Error).message}`); }
  try { await db.delete(organizations).where(eq(organizations.id, f.org.id)); }
  catch (e) { console.warn(`  teardown: delete organization failed: ${(e as Error).message}`); }
}

(async () => {
  console.log(`\nEdenMarket SLA smoke test (run-id ${RUN_ID})`);
  console.log(`Target: ${BASE_URL} · Per-probe budget: ${MARKET_BUDGET_MS}ms · Required error rate: 0%\n`);

  let fixture: Fixture | null = null;
  const results: ProbeResult[] = [];
  try {
    process.stdout.write("  • seeding fixture ... ");
    const seedStart = Date.now();
    fixture = await seedFixture();
    console.log(`org=${fixture.org.id} listing=${fixture.listing.id} eoi=${fixture.eoi.id} deal=${fixture.deal.id} (${Date.now() - seedStart}ms)`);

    const fx = fixture;

    // 1. Buyer-facing browse query.
    results.push(await probe(
      "listings-feed",
      "/api/market/listings",
      fx.buyerId,
      (body) => {
        if (!Array.isArray(body)) throw new Error("response is not an array");
        const arr = body as Array<{ id?: number }>;
        if (!arr.some(l => l.id === fx.listing.id)) throw new Error(`seeded listing #${fx.listing.id} missing from feed`);
        return `${arr.length} listings (seeded present)`;
      },
    ));

    // 2. Listing detail (buyer view).
    results.push(await probe(
      "listing-detail",
      `/api/market/listings/${fx.listing.id}`,
      fx.buyerId,
      (body) => {
        const obj = body as { id?: number; eoiCount?: number; sellerVerified?: boolean };
        if (obj.id !== fx.listing.id) throw new Error(`expected listing id ${fx.listing.id}, got ${obj.id}`);
        if ((obj.eoiCount ?? 0) < 1) throw new Error(`expected eoiCount >= 1, got ${obj.eoiCount}`);
        return `id=${obj.id} eois=${obj.eoiCount} verified=${obj.sellerVerified}`;
      },
    ));

    // 3. Intelligence panel cold path.
    results.push(await probe(
      "listing-intelligence",
      `/api/market/listings/${fx.listing.id}/intelligence`,
      fx.buyerId,
      (body) => {
        const obj = body as Record<string, unknown>;
        const keys = Object.keys(obj);
        if (keys.length === 0) throw new Error("empty intelligence payload");
        return `keys=${keys.length}`;
      },
    ));

    // 4. Pipeline list (seller-side).
    results.push(await probe(
      "deals-list",
      "/api/market/deals",
      fx.sellerId,
      (body) => {
        if (!Array.isArray(body)) throw new Error("response is not an array");
        const arr = body as Array<{ id?: number }>;
        if (!arr.some(d => d.id === fx.deal.id)) throw new Error(`seeded deal #${fx.deal.id} missing from seller pipeline`);
        return `${arr.length} deals (seeded present)`;
      },
    ));

    // 5. Deal-room detail.
    results.push(await probe(
      "deal-detail",
      `/api/market/deals/${fx.deal.id}`,
      fx.sellerId,
      (body) => {
        const obj = body as { deal?: { id?: number; status?: string } };
        if (obj.deal?.id !== fx.deal.id) throw new Error(`expected deal id ${fx.deal.id}, got ${obj.deal?.id}`);
        return `id=${obj.deal.id} status=${obj.deal.status}`;
      },
    ));
  } finally {
    await teardownFixture(fixture);
  }

  console.log("\nResults:");
  console.log(pad("probe", 24) + pad("status", 8) + pad("ms", 8) + pad("result", 10) + "detail");
  console.log("-".repeat(96));
  for (const r of results) {
    console.log(
      pad(r.name, 24) +
      pad(String(r.status), 8) +
      pad(String(r.ms), 8) +
      pad(r.ok ? "OK" : "FAIL", 10) +
      (r.error ? `${r.error}${r.detail ? " · " + r.detail : ""}` : r.detail),
    );
  }

  const failed = results.filter(r => !r.ok).length;
  const avg = results.length === 0 ? 0 : Math.round(results.reduce((s, r) => s + r.ms, 0) / results.length);
  const errorRate = results.length === 0 ? 100 : (failed / results.length) * 100;
  console.log(
    `\nProbes: ${results.length} · Average latency: ${avg}ms · ` +
    `Error rate: ${errorRate.toFixed(1)}% (${failed}/${results.length}) · ` +
    `${failed === 0 ? "ALL PASS" : "FAIL"}\n`,
  );

  process.exit(failed === 0 ? 0 : 1);
})().catch(err => {
  console.error("\n[smoke-market] fatal:", err);
  process.exit(2);
});
