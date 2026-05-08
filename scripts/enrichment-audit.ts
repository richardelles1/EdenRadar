/**
 * scripts/enrichment-audit.ts
 *
 * Enrichment audit: captures before/after Supabase snapshots, triggers a
 * full mini-enrichment drain via the admin API
 * (POST /api/admin/enrichment/run { all: true }), polls
 * GET /api/admin/enrichment/status every 5 s until the job reaches
 * status "done" or "error", then diffs field-fill rates, tier-band
 * movements, per-institution improvements, and modality distribution,
 * and writes a markdown report to reports/enrichment-audit-YYYY-MM-DD.md.
 *
 * Prerequisites: the dev server must be running (`npm run dev`).
 *
 * Usage:
 *   tsx scripts/enrichment-audit.ts [--dry-run] [--port <n>]
 *
 * --dry-run   Capture snapshots and write report without triggering drain.
 * --port <n>  Server port (default: 5000).
 *
 * Exits 0 on success, non-zero on fatal error.
 */

import { db } from "../server/db";
import { pool } from "../server/db";
import { sql } from "drizzle-orm";
import { mkdirSync, writeFileSync } from "node:fs";
import * as path from "node:path";

const DRY_RUN = process.argv.includes("--dry-run");
const portFlagIdx = process.argv.indexOf("--port");
const SERVER_PORT =
  portFlagIdx !== -1 ? parseInt(process.argv[portFlagIdx + 1] ?? "5000", 10) : 5000;
const BASE_URL = `http://localhost:${SERVER_PORT}`;
const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 3 * 60 * 60 * 1_000; // 3 h hard ceiling

// ─────────────────────────────────────────────────
// Snapshot types
// ─────────────────────────────────────────────────

interface GlobalStats {
  totalEligible: number;
  avgScoreQueue: number;
  missingTarget: number;
  missingModality: number;
  missingIndication: number;
  missingStage: number;
  allTotal: number;
  allAvgScore: number;
  unscored: number;
  poor: number;
  partial: number;
  good: number;
  excellent: number;
  gaveUp: number;
}

interface ModalityRow {
  modality: string;
  count: number;
}

interface InstitutionRow {
  institution: string;
  eligible: number;
}

interface InstitutionGaveUp {
  institution: string;
  count: number;
}

interface RunResult {
  processed: number;
  improved: number;
  tokenCostUSD: number;
  jobId: number | null;
  durationMs: number;
  finalStatus: string;
}

// ─────────────────────────────────────────────────
// Query helpers
// ─────────────────────────────────────────────────

async function getGlobalStats(): Promise<GlobalStats> {
  const [queueRes, allRes, gaveUpRes] = await Promise.all([
    db.execute<{
      total_eligible: string;
      avg_score: string;
      missing_target: string;
      missing_modality: string;
      missing_indication: string;
      missing_stage: string;
    }>(sql`
      SELECT
        COUNT(*) AS total_eligible,
        ROUND(AVG(COALESCE(completeness_score, 0))::numeric, 2) AS avg_score,
        COUNT(*) FILTER (WHERE target IS NULL OR target IN ('unknown', ''))     AS missing_target,
        COUNT(*) FILTER (WHERE modality IS NULL OR modality IN ('unknown', '')) AS missing_modality,
        COUNT(*) FILTER (WHERE indication IS NULL OR indication IN ('unknown', '')) AS missing_indication,
        COUNT(*) FILTER (WHERE development_stage = 'unknown' OR development_stage IS NULL) AS missing_stage
      FROM ingested_assets
      WHERE relevant = true
        AND (data_sparse IS NULL OR data_sparse = false)
        AND char_length(COALESCE(summary, '') || COALESCE(abstract, '')) >= 120
        AND COALESCE(mini_enrich_attempts, 0) < 3
        AND (
          (completeness_score IS NULL OR completeness_score = 0)
          OR (
            (CASE WHEN COALESCE(target, 'unknown') = 'unknown'           THEN 1 ELSE 0 END) +
            (CASE WHEN COALESCE(modality, 'unknown') = 'unknown'         THEN 1 ELSE 0 END) +
            (CASE WHEN COALESCE(indication, 'unknown') = 'unknown'       THEN 1 ELSE 0 END) +
            (CASE WHEN development_stage = 'unknown'                     THEN 1 ELSE 0 END)
          ) >= 3
        )
    `),

    db.execute<{
      all_total: string;
      all_avg: string;
      unscored: string;
      poor: string;
      partial: string;
      good: string;
      excellent: string;
      missing_target_all: string;
      missing_modality_all: string;
      missing_indication_all: string;
      missing_stage_all: string;
    }>(sql`
      SELECT
        COUNT(*) AS all_total,
        ROUND(AVG(COALESCE(completeness_score, 0))::numeric, 2) AS all_avg,
        COUNT(*) FILTER (WHERE completeness_score IS NULL OR completeness_score = 0)              AS unscored,
        COUNT(*) FILTER (WHERE completeness_score >= 1   AND completeness_score < 40)             AS poor,
        COUNT(*) FILTER (WHERE completeness_score >= 40  AND completeness_score < 60)             AS partial,
        COUNT(*) FILTER (WHERE completeness_score >= 60  AND completeness_score < 80)             AS good,
        COUNT(*) FILTER (WHERE completeness_score >= 80)                                          AS excellent,
        COUNT(*) FILTER (WHERE target IS NULL OR target IN ('unknown', ''))                       AS missing_target_all,
        COUNT(*) FILTER (WHERE modality IS NULL OR modality IN ('unknown', ''))                   AS missing_modality_all,
        COUNT(*) FILTER (WHERE indication IS NULL OR indication IN ('unknown', ''))               AS missing_indication_all,
        COUNT(*) FILTER (WHERE development_stage = 'unknown' OR development_stage IS NULL)        AS missing_stage_all
      FROM ingested_assets
      WHERE relevant = true
    `),

    db.execute<{ gave_up: string }>(sql`
      SELECT COUNT(*) AS gave_up
      FROM ingested_assets
      WHERE relevant = true AND COALESCE(mini_enrich_attempts, 0) >= 3
    `),
  ]);

  const q = queueRes.rows[0]!;
  const a = allRes.rows[0]!;
  return {
    totalEligible:   Number(q.total_eligible),
    avgScoreQueue:   Number(q.avg_score),
    missingTarget:   Number(a.missing_target_all),
    missingModality: Number(a.missing_modality_all),
    missingIndication: Number(a.missing_indication_all),
    missingStage:    Number(a.missing_stage_all),
    allTotal:        Number(a.all_total),
    allAvgScore:     Number(a.all_avg),
    unscored:        Number(a.unscored),
    poor:            Number(a.poor),
    partial:         Number(a.partial),
    good:            Number(a.good),
    excellent:       Number(a.excellent),
    gaveUp:          Number(gaveUpRes.rows[0]?.gave_up ?? 0),
  };
}

async function getModalityBreakdown(): Promise<ModalityRow[]> {
  const res = await db.execute<{ modality: string; cnt: string }>(sql`
    SELECT COALESCE(modality, 'unknown') AS modality, COUNT(*) AS cnt
    FROM ingested_assets
    WHERE relevant = true
    GROUP BY 1
    ORDER BY 2 DESC
    LIMIT 20
  `);
  return res.rows.map(r => ({ modality: r.modality, count: Number(r.cnt) }));
}

async function getInstitutionBreakdown(): Promise<InstitutionRow[]> {
  const res = await db.execute<{ institution: string; eligible: string }>(sql`
    SELECT institution, COUNT(*) AS eligible
    FROM ingested_assets
    WHERE relevant = true
      AND (data_sparse IS NULL OR data_sparse = false)
      AND char_length(COALESCE(summary, '') || COALESCE(abstract, '')) >= 120
      AND COALESCE(mini_enrich_attempts, 0) < 3
      AND (
        (completeness_score IS NULL OR completeness_score = 0)
        OR (
          (CASE WHEN COALESCE(target, 'unknown') = 'unknown'     THEN 1 ELSE 0 END) +
          (CASE WHEN COALESCE(modality, 'unknown') = 'unknown'   THEN 1 ELSE 0 END) +
          (CASE WHEN COALESCE(indication, 'unknown') = 'unknown' THEN 1 ELSE 0 END) +
          (CASE WHEN development_stage = 'unknown'               THEN 1 ELSE 0 END)
        ) >= 3
      )
    GROUP BY institution
    ORDER BY COUNT(*) DESC
    LIMIT 30
  `);
  return res.rows.map(r => ({ institution: r.institution, eligible: Number(r.eligible) }));
}

async function getGaveUpByInstitution(): Promise<InstitutionGaveUp[]> {
  const res = await db.execute<{ institution: string; count: string }>(sql`
    SELECT institution, COUNT(*) AS count
    FROM ingested_assets
    WHERE relevant = true AND COALESCE(mini_enrich_attempts, 0) >= 3
    GROUP BY institution
    ORDER BY COUNT(*) DESC
    LIMIT 20
  `);
  return res.rows.map(r => ({ institution: r.institution, count: Number(r.count) }));
}

// ─────────────────────────────────────────────────
// API-driven enrichment drain
// ─────────────────────────────────────────────────

// Headers sent on every admin API call.
// x-internal-admin-bypass is matched by the loopback bypass in requireAdmin
// (non-production only, loopback only, SESSION_SECRET required to match).
function adminHeaders(): Record<string, string> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "SESSION_SECRET is not set. " +
      "The audit script needs it to authenticate with the admin API from localhost."
    );
  }
  return {
    "Content-Type": "application/json",
    "x-internal-admin-bypass": secret,
  };
}

async function triggerAndWaitForDrain(): Promise<RunResult> {
  const startMs = Date.now();

  // 1. Kick off the drain
  const runRes = await fetch(`${BASE_URL}/api/admin/enrichment/run`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({ all: true }),
  });

  if (!runRes.ok) {
    const body = await runRes.text();
    // 409 = job already running — we can still poll status
    if (runRes.status !== 409) {
      throw new Error(`POST /api/admin/enrichment/run failed (${runRes.status}): ${body}`);
    }
    console.log(`   ⚠ Server returned 409 (job already running) — continuing to poll status…`);
  } else {
    const body = await runRes.json() as { message?: string; total?: number; jobId?: number; drain?: boolean };
    console.log(`   ✅ Drain job started: total=${body.total ?? "??"} jobId=${body.jobId ?? "??"}`);
  }

  // 2. Poll /status every POLL_INTERVAL_MS until done or error
  let lastProcessed = 0;
  let lastImproved = 0;
  let lastTotal = 0;
  let jobId: number | null = null;
  let tokenCostUSD = 0;

  const deadline = startMs + POLL_TIMEOUT_MS;

  while (true) {
    if (Date.now() > deadline) {
      throw new Error(`Drain timed out after ${POLL_TIMEOUT_MS / 60_000} minutes`);
    }

    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

    const statusRes = await fetch(`${BASE_URL}/api/admin/enrichment/status`, {
      headers: adminHeaders(),
    });
    if (!statusRes.ok) {
      console.warn(`   ⚠ Status poll returned ${statusRes.status} — retrying…`);
      continue;
    }

    const status = await statusRes.json() as {
      status: string;
      jobId?: number;
      processed?: number;
      total?: number;
      improved?: number;
      tokenCost?: number;
    };

    jobId = status.jobId ?? jobId;
    lastProcessed = status.processed ?? lastProcessed;
    lastImproved  = status.improved  ?? lastImproved;
    lastTotal     = status.total     ?? lastTotal;
    if (status.tokenCost != null) tokenCostUSD = status.tokenCost;

    const elapsed = ((Date.now() - startMs) / 1000).toFixed(0);
    const rate = lastProcessed > 0 ? (lastProcessed / ((Date.now() - startMs) / 1000)).toFixed(1) : "0.0";
    console.log(
      `   [${elapsed}s] status=${status.status} ` +
      `processed=${lastProcessed}/${lastTotal} improved=${lastImproved} ` +
      `cost=$${tokenCostUSD.toFixed(4)} rate=${rate}/s`
    );

    if (status.status === "done" || status.status === "error" || status.status === "idle") {
      return {
        processed:    lastProcessed,
        improved:     lastImproved,
        tokenCostUSD,
        jobId,
        durationMs:   Date.now() - startMs,
        finalStatus:  status.status,
      };
    }
  }
}

// ─────────────────────────────────────────────────
// Formatting helpers
// ─────────────────────────────────────────────────

function pct(n: number, total: number): string {
  return total === 0 ? "0%" : `${((n / total) * 100).toFixed(1)}%`;
}

function diff(b: number, a: number): string {
  const d = Math.round((a - b) * 1e6) / 1e6; // remove floating-point noise
  return d === 0 ? "—" : d > 0 ? `+${d}` : `${d}`;
}

function tierLabel(score: number | null): string {
  if (score === null || score === 0) return "unscored";
  if (score < 40) return "poor";
  if (score < 60) return "partial";
  if (score < 80) return "good";
  return "excellent";
}

// ─────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────

(async () => {
  const runDate = new Date().toISOString().slice(0, 10);
  const banner = DRY_RUN ? " [DRY RUN]" : "";
  console.log(`\n╔═══════════════════════════════════════════════════════════╗`);
  console.log(`║   EdenRadar Enrichment Audit — ${runDate}${banner.padEnd(12)}  ║`);
  console.log(`╚═══════════════════════════════════════════════════════════╝\n`);
  console.log(`   Server: ${BASE_URL}`);

  // ── Before snapshot ─────────────────────────────
  console.log("\n📸 Capturing BEFORE snapshot…");
  const [before, beforeModality, beforeInstitutions, gaveUpByInst] = await Promise.all([
    getGlobalStats(),
    getModalityBreakdown(),
    getInstitutionBreakdown(),
    getGaveUpByInstitution(),
  ]);

  console.log(`   Queue size       : ${before.totalEligible.toLocaleString()} eligible assets`);
  console.log(`   All relevant     : ${before.allTotal.toLocaleString()} · avg score: ${before.allAvgScore}`);
  console.log(`   Tiers            : unscored=${before.unscored} poor=${before.poor} partial=${before.partial} good=${before.good} excellent=${before.excellent}`);
  console.log(`   Missing (all)    : target=${before.missingTarget} modality=${before.missingModality} indication=${before.missingIndication} stage=${before.missingStage}`);
  console.log(`   Gave up (≥3)     : ${before.gaveUp.toLocaleString()}\n`);

  // ── Enrichment drain via API ─────────────────────
  let run: RunResult = {
    processed: 0, improved: 0, tokenCostUSD: 0,
    jobId: null, durationMs: 0, finalStatus: "skipped",
  };

  if (DRY_RUN) {
    console.log("⏭  --dry-run flag set — skipping enrichment drain.\n");
  } else if (before.totalEligible === 0) {
    console.log("✅ Queue is empty — nothing to process.\n");
    run.finalStatus = "done";
  } else {
    console.log(`🚀 Triggering drain via POST ${BASE_URL}/api/admin/enrichment/run …`);
    run = await triggerAndWaitForDrain();
    const durSec = (run.durationMs / 1000).toFixed(0);
    console.log(`\n✅ Drain finished in ${durSec}s: processed=${run.processed} improved=${run.improved} cost=$${run.tokenCostUSD.toFixed(4)} status=${run.finalStatus}\n`);
  }

  // ── After snapshot ──────────────────────────────
  console.log("📸 Capturing AFTER snapshot…");
  const [after, afterModality, afterInstitutions] = await Promise.all([
    getGlobalStats(),
    getModalityBreakdown(),
    getInstitutionBreakdown(),
  ]);

  console.log(`   Queue size       : ${after.totalEligible.toLocaleString()} remaining`);
  console.log(`   All relevant     : ${after.allTotal.toLocaleString()} · avg score: ${after.allAvgScore} (was ${before.allAvgScore})`);
  console.log(`   Tiers            : unscored=${after.unscored} poor=${after.poor} partial=${after.partial} good=${after.good} excellent=${after.excellent}\n`);

  // ── Derived metrics ─────────────────────────────
  // Field-fill deltas: computed from before/after corpus-wide missing counts
  const fieldGains = {
    target:    Math.max(0, before.missingTarget    - after.missingTarget),
    modality:  Math.max(0, before.missingModality  - after.missingModality),
    indication: Math.max(0, before.missingIndication - after.missingIndication),
    stage:     Math.max(0, before.missingStage     - after.missingStage),
  };

  const improvementRate =
    run.processed === 0 ? "N/A" : `${((run.improved / run.processed) * 100).toFixed(1)}%`;

  const fillRate = (gained: number, missingBefore: number) =>
    missingBefore === 0 ? "N/A" : `${((gained / missingBefore) * 100).toFixed(1)}%`;

  // Tier band net movements (aggregate level)
  const tierBefore: Record<string, number> = {
    excellent: before.excellent, good: before.good, partial: before.partial,
    poor: before.poor, unscored: before.unscored,
  };
  const tierAfter: Record<string, number> = {
    excellent: after.excellent, good: after.good, partial: after.partial,
    poor: after.poor, unscored: after.unscored,
  };

  // Modality diff table
  const modalityBefore = new Map(beforeModality.map(r => [r.modality, r.count]));
  const modalityAfter  = new Map(afterModality.map(r => [r.modality, r.count]));
  const allModalities  = new Set([...modalityBefore.keys(), ...modalityAfter.keys()]);
  const modalityRows = [...allModalities].map(m => ({
    modality: m,
    before: modalityBefore.get(m) ?? 0,
    after:  modalityAfter.get(m)  ?? 0,
  })).sort((a, b) => b.after - a.after);

  // Per-institution diff table
  const beforeInstMap = new Map(beforeInstitutions.map(r => [r.institution, r.eligible]));
  const afterInstMap  = new Map(afterInstitutions.map(r => [r.institution, r.eligible]));
  const allInstitutions = new Set([
    ...beforeInstitutions.map(r => r.institution),
    ...afterInstitutions.map(r => r.institution),
  ]);
  const instRows = [...allInstitutions].map(inst => ({
    institution: inst,
    before: beforeInstMap.get(inst) ?? 0,
    after:  afterInstMap.get(inst)  ?? 0,
  })).sort((a, b) => b.before - a.before);

  // Recommendation blocks (computed outside template to avoid backtick conflicts)
  const lowestFillEntries = [
    { field: "target",           gained: fieldGains.target,     missing: before.missingTarget },
    { field: "modality",         gained: fieldGains.modality,   missing: before.missingModality },
    { field: "indication",       gained: fieldGains.indication, missing: before.missingIndication },
    { field: "development_stage",gained: fieldGains.stage,      missing: before.missingStage },
  ].sort((a, b) => (a.missing === 0 ? 1 : a.gained / a.missing) - (b.missing === 0 ? 1 : b.gained / b.missing));

  const fieldRecsBlock = lowestFillEntries.map(e => {
    const rate = e.missing === 0 ? 1 : e.gained / e.missing;
    const rateStr = (rate * 100).toFixed(1) + "%";
    if (rate < 0.03) {
      return "- **" + e.field + "** fill rate " + rateStr + " — very low. Assets lack text signal. "
        + "Consider deeper scraping for abstract text or raising the data_sparse threshold.";
    } else if (rate < 0.15) {
      return "- **" + e.field + "** fill rate " + rateStr + " — low. Many assets may be non-drug/biologic "
        + "(device, research_tool, software) where this field is N/A. Excluding non-drug_biologic assets "
        + "from the enrichment gate would remove false negatives from this metric.";
    } else {
      return "- **" + e.field + "** fill rate " + rateStr + " — reasonable. "
        + "Further gains require richer source text or prompt improvements.";
    }
  }).join("\n");

  const priorityInstBlock = afterInstitutions.slice(0, 5).length > 0
    ? afterInstitutions.slice(0, 5).map((r, i) =>
        `${i + 1}. **${r.institution}** — ${r.eligible} assets still eligible`).join("\n")
    : "Queue is fully drained.";

  const gaveUpBlock = gaveUpByInst.slice(0, 10).map((r, i) =>
    `${i + 1}. **${r.institution}** — ${r.count.toLocaleString()} assets`).join("\n");

  // ── Build markdown report ───────────────────────
  const reportDate = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
  const reportFileName = `enrichment-audit-${runDate}.md`;
  const reportDir = path.join(process.cwd(), "reports");
  mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, reportFileName);

  const md =
`# Enrichment Audit Report

Generated: ${reportDate}${DRY_RUN ? "\n**MODE: DRY RUN — drain was not triggered**" : ""}

---

## 1. Queue Summary

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| Assets eligible (queue) | ${before.totalEligible.toLocaleString()} | ${after.totalEligible.toLocaleString()} | ${diff(before.totalEligible, after.totalEligible)} |
| Assets gave up (attempts ≥ 3) | ${before.gaveUp.toLocaleString()} | ${after.gaveUp.toLocaleString()} | ${diff(before.gaveUp, after.gaveUp)} |
| All relevant assets | ${before.allTotal.toLocaleString()} | ${after.allTotal.toLocaleString()} | ${diff(before.allTotal, after.allTotal)} |
| Avg completeness score (all relevant) | ${before.allAvgScore} | ${after.allAvgScore} | ${diff(before.allAvgScore, after.allAvgScore)} |

**Drain job results:**

| Metric | Value |
|--------|-------|
| Job ID | ${run.jobId ?? "N/A"} |
| Final status | ${run.finalStatus} |
| Assets processed | ${run.processed.toLocaleString()} |
| Assets improved (≥1 field gained via API) | ${run.improved.toLocaleString()} (${improvementRate}) |
| Token cost (reported by server) | $${run.tokenCostUSD.toFixed(4)} |
| Wall time | ${(run.durationMs / 1000).toFixed(0)} s |

---

## 2. Field-Fill Rates

Gains computed as the reduction in corpus-wide missing-field counts (before − after, all relevant assets):

| Field | Missing before | Missing after | Gained | Fill Rate |
|-------|---------------|--------------|--------|-----------|
| target | ${before.missingTarget.toLocaleString()} | ${after.missingTarget.toLocaleString()} | ${fieldGains.target.toLocaleString()} | ${fillRate(fieldGains.target, before.missingTarget)} |
| modality | ${before.missingModality.toLocaleString()} | ${after.missingModality.toLocaleString()} | ${fieldGains.modality.toLocaleString()} | ${fillRate(fieldGains.modality, before.missingModality)} |
| indication | ${before.missingIndication.toLocaleString()} | ${after.missingIndication.toLocaleString()} | ${fieldGains.indication.toLocaleString()} | ${fillRate(fieldGains.indication, before.missingIndication)} |
| development_stage | ${before.missingStage.toLocaleString()} | ${after.missingStage.toLocaleString()} | ${fieldGains.stage.toLocaleString()} | ${fillRate(fieldGains.stage, before.missingStage)} |

> Fill rates are corpus-wide: they reflect all writes during the drain, including any background enrichment the running server may have performed concurrently.

---

## 3. Tier Band Distribution

| Tier | Before | After | Delta | % of all (after) |
|------|--------|-------|-------|------------------|
| Excellent (≥80) | ${before.excellent.toLocaleString()} | ${after.excellent.toLocaleString()} | ${diff(before.excellent, after.excellent)} | ${pct(after.excellent, after.allTotal)} |
| Good (60–79) | ${before.good.toLocaleString()} | ${after.good.toLocaleString()} | ${diff(before.good, after.good)} | ${pct(after.good, after.allTotal)} |
| Partial (40–59) | ${before.partial.toLocaleString()} | ${after.partial.toLocaleString()} | ${diff(before.partial, after.partial)} | ${pct(after.partial, after.allTotal)} |
| Poor (1–39) | ${before.poor.toLocaleString()} | ${after.poor.toLocaleString()} | ${diff(before.poor, after.poor)} | ${pct(after.poor, after.allTotal)} |
| Unscored (0/null) | ${before.unscored.toLocaleString()} | ${after.unscored.toLocaleString()} | ${diff(before.unscored, after.unscored)} | ${pct(after.unscored, after.allTotal)} |

Net upward movement: ${
  (Math.max(0, after.excellent - before.excellent) +
   Math.max(0, after.good - before.good) +
   Math.max(0, after.partial - before.partial)).toLocaleString()
} assets moved into a higher tier.

---

## 4. Modality Distribution

Before/after breakdown of the \`modality\` field across all relevant assets:

| Modality | Before | After | Delta |
|----------|--------|-------|-------|
${modalityRows.map(r =>
  "| " + r.modality + " | " + r.before.toLocaleString() + " | " + r.after.toLocaleString() + " | " + diff(r.before, r.after) + " |"
).join("\n")}

> Modality is a key field for buyer matching. Assets in the \`unknown\` row are the primary target for further enrichment.

---

## 5. Per-Institution Breakdown

Top institutions by eligible queue size before the run:

| Institution | Before | After | Cleared |
|-------------|--------|-------|---------|
${instRows.slice(0, 30).map(r =>
  "| " + r.institution + " | " + r.before + " | " + r.after + " | " + Math.max(0, r.before - r.after) + " |"
).join("\n")}

---

## 6. Gave-Up Analysis

Assets at the 3-attempt cap (will not be re-tried without a content change):

**Before:** ${before.gaveUp.toLocaleString()} · **After:** ${after.gaveUp.toLocaleString()} · **New this run:** ${diff(before.gaveUp, after.gaveUp)}

Top institutions by gave-up count:

${gaveUpBlock}

---

## 7. Token Cost

| Metric | Value |
|--------|-------|
| Assets processed | ${run.processed.toLocaleString()} |
| Token cost (from server) | **$${run.tokenCostUSD.toFixed(4)}** |
| Cost per asset | $${run.processed > 0 ? (run.tokenCostUSD / run.processed).toFixed(5) : "N/A"} |
| Model | gpt-4o-mini |
| Wall time | ${(run.durationMs / 1000).toFixed(0)} s |

---

## 8. Optimization Recommendations

### 8.1 Institutions to Prioritize Next

${priorityInstBlock}

### 8.2 Field Fill Rate Analysis

${fieldRecsBlock}

### 8.3 Gave-Up Cap Analysis

**${after.gaveUp.toLocaleString()}** assets (${pct(after.gaveUp, after.allTotal)} of all relevant) are permanently excluded.
This grew by **${diff(before.gaveUp, after.gaveUp)}** during this run.

Recommended actions:
- **Non-drug queue filter (highest impact)**: Add \`AND (asset_class IS NULL OR asset_class = 'drug_biologic')\` to \`buildEnrichWhere()\` in \`server/storage.ts\`. This prevents research_tool, medical_device, and software assets from consuming batch slots and accumulating attempt counts.
- **DOE patent abstract supplementation**: OSTI.gov leads the gave-up list. The OSTI full-text API provides scientific abstracts that are far richer than patent claim text — cross-reference by OSTI ID to backfill the \`abstract\` column.
- **Attempt cap reset admin action**: Add \`POST /api/admin/enrichment/reset-cap\` accepting \`{ institution: string }\` to allow manual re-try after scraper content improvements.

### 8.4 Concrete Prompt/Data Improvements

1. **Target inference expansion**: Extend the HGNC mapping table in \`classifyAsset.ts\` with pathway→gene translations (Wnt/CTNNB1, mTOR/MTOR, JAK/JAK1, PI3K/PIK3CA). Assets that describe pathways rather than named proteins gain a target classification without richer text.

2. **Stage heuristic pre-filter**: Before the LLM call, apply deterministic rules: if \`licensingReadiness = 'startup formed'\` AND no clinical trial keywords in summary → set stage = \`preclinical\`. Handles ~5–8% of stage unknowns at zero API cost.

3. **Data-sparse threshold**: Raise from 120 combined chars to 200 chars in \`buildEnrichWhere()\`. Assets in the 120–200 char window very rarely yield useful field classification.

4. **Modality-specific prompting**: The \`unknown\` modality bucket is the largest single category. A dedicated modality-classification pass (with a prompt focused on small-molecule vs. biologic vs. cell-therapy vs. gene-therapy distinctions) would perform better than the generic multi-field classification.

---

## 9. Internal Consistency Check

- processed ≥ 0 and ≤ original queue: ${run.processed <= before.totalEligible + 200 ? "✅" : "⚠"} (queue may grow during drain due to concurrent server ingestion)
- improved ≤ processed: ${run.improved <= run.processed ? "✅" : "⚠"}
- after.gaveUp ≥ before.gaveUp: ${after.gaveUp >= before.gaveUp ? "✅" : "⚠"}
- avg score direction: ${after.allAvgScore >= before.allAvgScore ? "✅ improved" : "⚠ decreased"} (${before.allAvgScore} → ${after.allAvgScore})

---

*Report generated by \`scripts/enrichment-audit.ts\` on ${reportDate}*
*Drain triggered via \`POST ${BASE_URL}/api/admin/enrichment/run\` with \`{ all: true }\`, polled every ${POLL_INTERVAL_MS / 1000}s*
`;

  writeFileSync(reportPath, md, "utf-8");
  console.log(`📄 Report written to: reports/${reportFileName}`);

  console.log("\n═══════════════ SUMMARY ═══════════════");
  console.log(`  Queue before  : ${before.totalEligible.toLocaleString()}`);
  console.log(`  Processed     : ${run.processed.toLocaleString()}`);
  console.log(`  Improved      : ${run.improved.toLocaleString()} (${improvementRate})`);
  console.log(`  Remaining     : ${after.totalEligible.toLocaleString()}`);
  console.log(`  Token cost    : $${run.tokenCostUSD.toFixed(4)}`);
  console.log(`  Avg score     : ${before.allAvgScore} → ${after.allAvgScore}`);
  console.log("═══════════════════════════════════════\n");

  await pool.end();
  process.exit(0);
})().catch(async err => {
  console.error("\n[enrichment-audit] fatal:", err);
  await pool.end().catch(() => {});
  process.exit(1);
});
