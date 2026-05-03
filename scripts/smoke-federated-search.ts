/**
 * Smoke test for the federated /api/search endpoint.
 *
 * Runs a panel of representative queries against /api/search, captures total
 * latency, per-category result counts, and per-source latency from the
 * response's sourceDiagnostics block. Prints summary tables and exits non-zero
 * if any query misses the SLA.
 *
 * Usage:
 *   npx tsx scripts/smoke-federated-search.ts [base-url]
 *
 * Default base URL is http://localhost:5000.
 *
 * SLA bar (per task #705 done criteria):
 *   - Each cold run must complete in <= COLD_BUDGET_MS (12000ms).
 *   - At least MIN_CATEGORIES_WITH_RESULTS of {tech_transfer, paper, preprint,
 *     patent, clinical_trial} categories must contribute >= 1 result.
 *   - Aggregate error rate (queries that failed any check) must be 0.
 */

const BASE_URL = process.argv[2] ?? "http://localhost:5000";
const COLD_BUDGET_MS = 12000;
const MIN_CATEGORIES_WITH_RESULTS = 3;
// Categories that MUST contribute on every query (>=1 hit). These map to
// sources that should never silently zero out across our query panel:
// - paper: pubmed/openalex/europepmc — broad biomedical literature
// - tech_transfer: techtransfer DB — university licensing offices
// All test queries are biomedical, so these two must always fire.
const REQUIRED_CATEGORIES = ["paper", "tech_transfer"];
// Sources whose latency must be observed in sourceDiagnostics on every query —
// proves they were dispatched (not silently skipped) and lets us see real ms.
const REQUIRED_SOURCES_OBSERVED = ["pubmed", "openalex", "europepmc", "biorxiv", "medrxiv", "patents", "clinicaltrials", "techtransfer"];
// Cold-run heuristic: anything below this is suspected cache hit and ignored
// for SLA. Federated search has a 45-min TTL; bust by varying the query string
// or restart the server before running this script.
const COLD_FLOOR_MS = 1000;

const QUERIES = [
  "GLP-1 obesity",
  "CRISPR base editing",
  "antibody drug conjugate breast cancer",
  "mRNA vaccine cancer",
];

interface SourceDiag {
  source: string;
  ms: number;
  status: "ok" | "empty" | "timeout" | "error";
  count: number;
  error?: string;
}

interface SearchResponse {
  assets?: Array<{ source_types?: string[]; source_urls?: string[] }>;
  signalsFound?: number;
  assetsFound?: number;
  sourceDiagnostics?: SourceDiag[];
  error?: string;
}

interface RunResult {
  query: string;
  ms: number;
  status: number;
  signalsFound: number;
  assetsFound: number;
  byCategory: Record<string, number>;
  diagnostics: SourceDiag[];
  error?: string;
}

const CATEGORIES = ["tech_transfer", "paper", "preprint", "patent", "clinical_trial", "researcher"];

async function runOne(query: string): Promise<RunResult> {
  const start = Date.now();
  try {
    const res = await fetch(`${BASE_URL}/api/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, sources: [], maxPerSource: 10 }),
    });
    const ms = Date.now() - start;
    const text = await res.text();
    let body: SearchResponse = {};
    try { body = JSON.parse(text); } catch { /* keep empty */ }
    const byCategory: Record<string, number> = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
    for (const a of body.assets ?? []) {
      for (const t of a.source_types ?? []) {
        if (t in byCategory) byCategory[t]++;
      }
    }
    return {
      query,
      ms,
      status: res.status,
      signalsFound: body.signalsFound ?? 0,
      assetsFound: body.assetsFound ?? (body.assets?.length ?? 0),
      byCategory,
      diagnostics: body.sourceDiagnostics ?? [],
      error: res.ok ? undefined : (body.error ?? text.slice(0, 200)),
    };
  } catch (err) {
    return {
      query,
      ms: Date.now() - start,
      status: 0,
      signalsFound: 0,
      assetsFound: 0,
      byCategory: Object.fromEntries(CATEGORIES.map((c) => [c, 0])),
      diagnostics: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function pad(s: string, n: number): string {
  if (s.length >= n) return s.slice(0, n);
  return s + " ".repeat(n - s.length);
}

(async () => {
  console.log(`\nFederated /api/search smoke test against ${BASE_URL}`);
  console.log(`Cold budget: ${COLD_BUDGET_MS}ms · Min categories with results: ${MIN_CATEGORIES_WITH_RESULTS}`);
  console.log(`Queries: ${QUERIES.length}\n`);

  const results: RunResult[] = [];
  for (const q of QUERIES) {
    process.stdout.write(`  • "${q}" ... `);
    const r = await runOne(q);
    results.push(r);
    console.log(`${r.ms}ms · ${r.assetsFound} assets · ${r.error ? "ERROR: " + r.error : "ok"}`);
  }

  console.log("\nPer-query category contribution:");
  console.log(pad("query", 42) + pad("ms", 8) + pad("assets", 8) + pad("tto", 6) + pad("paper", 7) + pad("prep", 6) + pad("pat", 5) + pad("trial", 6));
  console.log("-".repeat(88));
  for (const r of results) {
    console.log(
      pad(r.query, 42) +
      pad(String(r.ms), 8) +
      pad(String(r.assetsFound), 8) +
      pad(String(r.byCategory.tech_transfer), 6) +
      pad(String(r.byCategory.paper), 7) +
      pad(String(r.byCategory.preprint), 6) +
      pad(String(r.byCategory.patent), 5) +
      pad(String(r.byCategory.clinical_trial), 6)
    );
  }

  // Aggregate per-source latency across all queries
  type Agg = { count: number; totalMs: number; ok: number; empty: number; timeout: number; error: number };
  const bySource = new Map<string, Agg>();
  for (const r of results) {
    for (const d of r.diagnostics) {
      const cur = bySource.get(d.source) ?? { count: 0, totalMs: 0, ok: 0, empty: 0, timeout: 0, error: 0 };
      cur.count++;
      cur.totalMs += d.ms;
      cur[d.status]++;
      bySource.set(d.source, cur);
    }
  }

  if (bySource.size > 0) {
    console.log("\nPer-source latency (avg ms across all queries) and outcome counts:");
    console.log(pad("source", 24) + pad("avg ms", 10) + pad("ok", 6) + pad("empty", 8) + pad("timeout", 10) + pad("error", 8));
    console.log("-".repeat(66));
    const rows = Array.from(bySource.entries())
      .map(([src, a]) => ({ src, avg: Math.round(a.totalMs / a.count), ...a }))
      .sort((a, b) => b.avg - a.avg);
    for (const row of rows) {
      console.log(
        pad(row.src, 24) +
        pad(String(row.avg), 10) +
        pad(String(row.ok), 6) +
        pad(String(row.empty), 8) +
        pad(String(row.timeout), 10) +
        pad(String(row.error), 8)
      );
    }
  } else {
    console.log("\n(no sourceDiagnostics returned by server — check /api/search response shape)");
  }

  let failed = 0;
  let suspectedCacheHits = 0;
  console.log("\nChecks:");
  for (const r of results) {
    const cacheSuspect = r.ms < COLD_FLOOR_MS;
    if (cacheSuspect) suspectedCacheHits++;
    const overBudget = !cacheSuspect && r.ms > COLD_BUDGET_MS;
    const catsWithHits = CATEGORIES.filter((c) => r.byCategory[c] > 0).length;
    const tooFewCats = catsWithHits < MIN_CATEGORIES_WITH_RESULTS;
    const missingRequired = REQUIRED_CATEGORIES.filter((c) => (r.byCategory[c] ?? 0) === 0);
    const observed = new Set(r.diagnostics.map((d) => d.source));
    const missingSources = cacheSuspect ? [] : REQUIRED_SOURCES_OBSERVED.filter((s) => !observed.has(s));
    const errored = !!r.error;
    const ok = !overBudget && !tooFewCats && !missingRequired.length && !missingSources.length && !errored;
    if (!ok) failed++;
    const flags: string[] = [];
    if (cacheSuspect) flags.push(`SUSPECTED_CACHE_HIT(${r.ms}ms < ${COLD_FLOOR_MS}ms — restart server for true cold)`);
    if (overBudget) flags.push(`OVER_BUDGET(${r.ms}ms > ${COLD_BUDGET_MS}ms)`);
    if (tooFewCats) flags.push(`TOO_FEW_CATEGORIES(${catsWithHits}/${MIN_CATEGORIES_WITH_RESULTS})`);
    if (missingRequired.length) flags.push(`MISSING_REQUIRED_CATEGORY(${missingRequired.join(",")})`);
    if (missingSources.length) flags.push(`SOURCE_NOT_DISPATCHED(${missingSources.join(",")})`);
    if (errored) flags.push(`ERROR(${r.error})`);
    console.log(`  ${ok ? "OK " : "FAIL"} · ${r.query} · ${flags.length ? flags.join(", ") : "all checks pass"}`);
  }
  if (suspectedCacheHits > 0) {
    console.log(`\n  WARN: ${suspectedCacheHits}/${results.length} queries appear to be cache hits (latency < ${COLD_FLOOR_MS}ms). Restart server before re-running for a true cold validation.`);
  }

  const avg = Math.round(results.reduce((s, r) => s + r.ms, 0) / results.length);
  const errorRate = results.length === 0 ? 0 : failed / results.length;
  console.log(`\nAverage latency: ${avg}ms · Error rate: ${(errorRate * 100).toFixed(1)}% (${failed}/${results.length}) · ${failed === 0 ? "ALL PASS" : "FAIL"}\n`);

  process.exit(failed === 0 ? 0 : 1);
})();
