/**
 * Smoke test for the federated /api/search endpoint.
 *
 * Runs 4 representative queries across all default sources, captures
 * per-category latency and result counts, prints a summary table, and
 * exits non-zero if the speed/reliability bar is missed.
 *
 * Usage:
 *   npx tsx scripts/smoke-federated-search.ts [base-url]
 *
 * Default base URL is http://localhost:5000.
 *
 * Bar:
 *   - Each cold run must complete in <= COLD_BUDGET_MS (default 12000).
 *   - At least 3 of {tech_transfer, paper, preprint, patent, clinical_trial}
 *     categories must contribute >= 1 result on each query.
 */

const BASE_URL = process.argv[2] ?? "http://localhost:5000";
const COLD_BUDGET_MS = 13000;
const MIN_CATEGORIES_WITH_RESULTS = 3;

const QUERIES = [
  "GLP-1 obesity",
  "CRISPR base editing",
  "antibody drug conjugate breast cancer",
  "mRNA vaccine cancer",
];

interface SearchResponse {
  assets?: Array<{ source_types?: string[]; source_urls?: string[] }>;
  signalsFound?: number;
  assetsFound?: number;
  error?: string;
}

interface RunResult {
  query: string;
  ms: number;
  status: number;
  signalsFound: number;
  assetsFound: number;
  byCategory: Record<string, number>;
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

  console.log("\nResults:");
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

  let failed = 0;
  console.log("\nChecks:");
  for (const r of results) {
    const overBudget = r.ms > COLD_BUDGET_MS;
    const catsWithHits = CATEGORIES.filter((c) => r.byCategory[c] > 0).length;
    const tooFewCats = catsWithHits < MIN_CATEGORIES_WITH_RESULTS;
    const errored = !!r.error;
    const ok = !overBudget && !tooFewCats && !errored;
    if (!ok) failed++;
    const flags: string[] = [];
    if (overBudget) flags.push(`OVER_BUDGET(${r.ms}ms > ${COLD_BUDGET_MS}ms)`);
    if (tooFewCats) flags.push(`TOO_FEW_CATEGORIES(${catsWithHits}/${MIN_CATEGORIES_WITH_RESULTS})`);
    if (errored) flags.push(`ERROR(${r.error})`);
    console.log(`  ${ok ? "OK " : "FAIL"} · ${r.query} · ${flags.length ? flags.join(", ") : "all checks pass"}`);
  }

  const avg = Math.round(results.reduce((s, r) => s + r.ms, 0) / results.length);
  console.log(`\nAverage: ${avg}ms · ${failed === 0 ? "ALL PASS" : `${failed}/${results.length} FAILED`}\n`);

  process.exit(failed === 0 ? 0 : 1);
})();
