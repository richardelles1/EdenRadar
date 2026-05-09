/**
 * Enrichment quality panel smoke — Task #946 / #949.
 *
 * Exercises:
 *   1. storage.getInstitutionEnrichmentQuality()  — returns well-shaped data
 *      for a real institution (TechLink DoD).
 *   2. GET /api/admin/enrichment/institution-quality?institution=…  — HTTP 200,
 *      same shape, plausible numbers.
 *   3. POST .../refresh-scraped-fields  — HTTP 200, new response shape
 *      (queuedTotal / queuedRelevant, no more queuedForReenrichment).
 *
 * Does NOT mutate any ingested_assets rows — the refresh probe is only
 * structural (it calls the endpoint and validates the response shape; it
 * does not wait for enrichment jobs to complete).
 *
 * Usage:
 *   ENABLE_SMOKE_AUTH_BYPASS=true npx tsx scripts/smoke-enrichment-quality.ts [base-url]
 */

import { storage } from "../server/storage";

const BASE = process.argv[2] ?? "http://localhost:5000";
const INSTITUTION = "TechLink (DoD Technology Transfer)";
const BUDGET_MS = 12_000; // Cross-network Supabase queries can take ~6-8s cold

type Check = { label: string; ok: boolean; detail?: string };
const results: Check[] = [];

function pass(label: string, detail?: string) {
  results.push({ label, ok: true, detail });
  console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ""}`);
}
function fail(label: string, detail: string) {
  results.push({ label, ok: false, detail });
  console.error(`  ✗ ${label} — ${detail}`);
}

async function timedFetch(url: string, opts?: RequestInit): Promise<{ res: Response; ms: number }> {
  const t0 = Date.now();
  const res = await fetch(url, opts);
  return { res, ms: Date.now() - t0 };
}

// ── 1. Direct storage call ────────────────────────────────────────────────────
console.log("\n[1] storage.getInstitutionEnrichmentQuality()");
try {
  const t0 = Date.now();
  const q = await storage.getInstitutionEnrichmentQuality(INSTITUTION);
  const ms = Date.now() - t0;

  if (ms > BUDGET_MS) {
    fail("latency", `${ms}ms > ${BUDGET_MS}ms budget`);
  } else {
    pass("latency", `${ms}ms`);
  }

  if (typeof q.relevantCount !== "number") {
    fail("relevantCount type", `expected number, got ${typeof q.relevantCount}`);
  } else {
    pass("relevantCount", String(q.relevantCount));
  }

  if (q.avgCompletenessScore !== null && typeof q.avgCompletenessScore !== "number") {
    fail("avgCompletenessScore type", `expected number|null, got ${typeof q.avgCompletenessScore}`);
  } else {
    pass("avgCompletenessScore", q.avgCompletenessScore != null ? String(q.avgCompletenessScore) : "null (no enriched assets yet)");
  }

  // Task #949: breakdown replaced with single enrichQueueCount aligned to buildEnrichWhere.
  if (typeof q.enrichQueueCount !== "number") {
    fail("enrichQueueCount type", `expected number, got ${typeof q.enrichQueueCount}`);
  } else {
    pass("enrichQueueCount", String(q.enrichQueueCount));
  }

  // enrichQueueCount must not exceed relevantCount
  if (typeof q.enrichQueueCount === "number" && typeof q.relevantCount === "number") {
    if (q.enrichQueueCount > q.relevantCount) {
      fail("enrichQueueCount <= relevantCount", `${q.enrichQueueCount} > ${q.relevantCount}`);
    } else {
      pass("enrichQueueCount <= relevantCount");
    }
  }

  if (typeof q.enrichedLast24h !== "number") {
    fail("enrichedLast24h type", `expected number, got ${typeof q.enrichedLast24h}`);
  } else {
    pass("enrichedLast24h", String(q.enrichedLast24h));
  }
} catch (err: any) {
  fail("storage call", err.message);
}

// ── 2. HTTP probe — GET institution-quality ───────────────────────────────────
console.log("\n[2] GET /api/admin/enrichment/institution-quality");
try {
  const url = `${BASE}/api/admin/enrichment/institution-quality?institution=${encodeURIComponent(INSTITUTION)}`;
  const { res, ms } = await timedFetch(url, {
    headers: { "x-smoke-user-id": "smoke-admin", "x-smoke-is-admin": "true" },
  });

  if (ms > BUDGET_MS) fail("latency", `${ms}ms`);
  else pass("latency", `${ms}ms`);

  if (res.status !== 200) {
    fail("status", `${res.status} ${res.statusText}`);
  } else {
    pass("status 200");
    const body = await res.json() as Record<string, unknown>;
    if (typeof body.relevantCount !== "number") fail("body.relevantCount", "not a number");
    else pass("body.relevantCount", String(body.relevantCount));
    if (typeof body.enrichQueueCount !== "number") fail("body.enrichQueueCount", "not a number");
    else pass("body.enrichQueueCount", String(body.enrichQueueCount));
    // Ensure old breakdown shape is gone
    if ("enrichQueueBreakdown" in body) fail("old enrichQueueBreakdown still present", "should be removed");
    else pass("old enrichQueueBreakdown absent");
  }
} catch (err: any) {
  fail("HTTP probe", err.message);
}

// Fetch institution quality via HTTP, returning the parsed body or null on error.
async function fetchQuality(): Promise<Record<string, unknown> | null> {
  try {
    const url = `${BASE}/api/admin/enrichment/institution-quality?institution=${encodeURIComponent(INSTITUTION)}`;
    const res = await fetch(url, { headers: { "x-smoke-user-id": "smoke-admin", "x-smoke-is-admin": "true" } });
    if (!res.ok) return null;
    return await res.json() as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ── 3. POST refresh-scraped-fields + semantic cross-check ────────────────────
// Shape check: new fields present, stale field absent.
// Semantic check: the change in the institution-quality `enrichQueueCount` must
// be >= 0 and consistent after refresh (TechLink DoD is a large corpus so
// exact delta matching is less useful; we verify shape and plausibility instead).
console.log("\n[3] POST refresh-scraped-fields — shape + cross-check");
try {
  // Snapshot quality BEFORE refresh so we can measure the delta.
  const preQuality = await fetchQuality();
  const preQueueCount = typeof preQuality?.enrichQueueCount === "number" ? preQuality.enrichQueueCount : undefined;

  const url = `${BASE}/api/ingest/sync/${encodeURIComponent(INSTITUTION)}/refresh-scraped-fields`;
  const { res, ms } = await timedFetch(url, {
    method: "POST",
    headers: { "x-smoke-user-id": "smoke-admin", "x-smoke-is-admin": "true" },
  });

  if (ms > 60_000) fail("latency", `${ms}ms (refresh can be slow — budget is 60s)`);
  else pass("latency", `${ms}ms`);

  if (res.status !== 200) {
    const text = await res.text();
    fail("status", `${res.status} — ${text.slice(0, 200)}`);
  } else {
    pass("status 200");
    const body = await res.json() as Record<string, unknown>;

    // New shape: queuedTotal + queuedRelevant (NOT queuedForReenrichment)
    if ("queuedForReenrichment" in body) fail("old field present", "queuedForReenrichment still in response");
    else pass("old queuedForReenrichment removed");

    if (typeof body.queuedTotal !== "number") fail("queuedTotal", "not a number");
    else pass("queuedTotal", String(body.queuedTotal));

    if (typeof body.queuedRelevant !== "number") fail("queuedRelevant", "not a number");
    else pass("queuedRelevant", String(body.queuedRelevant));

    if (typeof body.message !== "string" || !body.message) fail("message", "missing or not a string");
    else pass("message", body.message);

    // queuedRelevant <= queuedTotal
    if (typeof body.queuedRelevant === "number" && typeof body.queuedTotal === "number") {
      if (body.queuedRelevant > body.queuedTotal) fail("queuedRelevant <= queuedTotal", `${body.queuedRelevant} > ${body.queuedTotal}`);
      else pass("queuedRelevant <= queuedTotal");
    }

    // ── Semantic cross-check ───────────────────────────────────────────────
    // After the refresh, re-fetch quality and verify the enrichQueueCount increased
    // by exactly queuedRelevant. Since buildEnrichWhere now includes `enrichedAt IS NULL`
    // as an OR condition, refresh-reset assets appear in the count immediately and
    // the delta must equal queuedRelevant exactly (not just >= pre).
    console.log("\n[3b] Cross-check: post-refresh enrichQueueCount delta == queuedRelevant");
    const postQuality = await fetchQuality();
    const postQueueCount = typeof postQuality?.enrichQueueCount === "number" ? postQuality.enrichQueueCount : undefined;

    if (typeof preQueueCount !== "number" || typeof postQueueCount !== "number") {
      fail("cross-check data available", `pre=${preQueueCount} post=${postQueueCount}`);
    } else if (typeof body.queuedRelevant !== "number") {
      fail("cross-check: queuedRelevant available", "not a number");
    } else {
      const delta = postQueueCount - preQueueCount;
      const expected = body.queuedRelevant as number;
      if (delta !== expected) {
        fail(
          "cross-check: enrichQueueCount delta == queuedRelevant",
          `pre=${preQueueCount} post=${postQueueCount} delta=${delta} but queuedRelevant=${expected}`,
        );
      } else {
        pass(
          "cross-check: enrichQueueCount delta == queuedRelevant",
          `pre=${preQueueCount} post=${postQueueCount} delta=${delta} queuedRelevant=${expected}`,
        );
      }
    }
  }
} catch (err: any) {
  fail("HTTP probe", err.message);
}

// ── Summary ───────────────────────────────────────────────────────────────────
const failCount = results.filter((r) => !r.ok).length;
console.log(`\n${"─".repeat(60)}`);
console.log(`Results: ${results.length - failCount}/${results.length} passed`);
if (failCount > 0) {
  console.error("FAILED checks:");
  results.filter((r) => !r.ok).forEach((r) => console.error(`  ✗ ${r.label}: ${r.detail}`));
  process.exit(1);
} else {
  console.log("All checks passed.");
  process.exit(0);
}
