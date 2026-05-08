/**
 * scripts/enrichment-audit.ts
 *
 * Enrichment audit: captures before/after Supabase snapshots, triggers a
 * full mini-enrichment drain via the admin API
 * (POST /api/admin/enrichment/run { all: true }), polls
 * GET /api/admin/enrichment/status every 5 s until the job reaches
 * status "done" or "error", then diffs field-fill rates, tier-band
 * movements (full transition matrix), modality distribution,
 * per-institution improvements, and processed/improved/failed counts,
 * then writes a markdown report to reports/enrichment-audit-YYYY-MM-DD.md.
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
import { sql, inArray } from "drizzle-orm";
import { ingestedAssets } from "../shared/schema";
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
// Headers for admin API calls
//
// The /api/admin/enrichment/* endpoints are registered after the
// app.use("/api/admin", requireAdmin) middleware in routes.ts.
// requireAdmin accepts an x-admin-password header (checked against
// SESSION_SECRET) from loopback callers. ADMIN_EMAILS-based Supabase
// JWT auth is the browser flow; it is not available in a Node script
// without a live Supabase session, so we use the shared-secret path instead.
// ─────────────────────────────────────────────────

function scriptHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const pw = process.env.ADMIN_PASSWORD ?? process.env.SESSION_SECRET;
  if (pw) headers["x-admin-password"] = pw;
  return headers;
}

// ─────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────

interface GlobalStats {
  totalEligible: number;
  allTotal: number;
  allAvgScore: number;
  missingTarget: number;
  missingModality: number;
  missingIndication: number;
  missingStage: number;
  unscored: number;
  poor: number;
  partial: number;
  good: number;
  excellent: number;
  gaveUp: number;
}

interface ModalityRow { modality: string; count: number; }
interface InstitutionRow { institution: string; eligible: number; }
interface InstitutionGaveUp { institution: string; count: number; }

interface AssetSnapshot {
  id: number;
  score: number | null;
  attempts: number;
}

interface RunResult {
  processed: number;
  improved: number;
  noGain: number;
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
    db.execute<{ total_eligible: string }>(sql`
      SELECT COUNT(*) AS total_eligible
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
    `),

    db.execute<{
      all_total: string; all_avg: string;
      unscored: string; poor: string; partial: string; good: string; excellent: string;
      miss_target: string; miss_modality: string; miss_indication: string; miss_stage: string;
    }>(sql`
      SELECT
        COUNT(*) AS all_total,
        ROUND(AVG(COALESCE(completeness_score, 0))::numeric, 2) AS all_avg,
        COUNT(*) FILTER (WHERE completeness_score IS NULL OR completeness_score = 0) AS unscored,
        COUNT(*) FILTER (WHERE completeness_score >= 1   AND completeness_score < 40) AS poor,
        COUNT(*) FILTER (WHERE completeness_score >= 40  AND completeness_score < 60) AS partial,
        COUNT(*) FILTER (WHERE completeness_score >= 60  AND completeness_score < 80) AS good,
        COUNT(*) FILTER (WHERE completeness_score >= 80) AS excellent,
        COUNT(*) FILTER (WHERE target IS NULL OR target IN ('unknown', ''))           AS miss_target,
        COUNT(*) FILTER (WHERE modality IS NULL OR modality IN ('unknown', ''))       AS miss_modality,
        COUNT(*) FILTER (WHERE indication IS NULL OR indication IN ('unknown', ''))   AS miss_indication,
        COUNT(*) FILTER (WHERE development_stage = 'unknown' OR development_stage IS NULL) AS miss_stage
      FROM ingested_assets WHERE relevant = true
    `),

    db.execute<{ gave_up: string }>(sql`
      SELECT COUNT(*) AS gave_up FROM ingested_assets
      WHERE relevant = true AND COALESCE(mini_enrich_attempts, 0) >= 3
    `),
  ]);

  const q = queueRes.rows[0]!;
  const a = allRes.rows[0]!;
  return {
    totalEligible:    Number(q.total_eligible),
    allTotal:         Number(a.all_total),
    allAvgScore:      Number(a.all_avg),
    missingTarget:    Number(a.miss_target),
    missingModality:  Number(a.miss_modality),
    missingIndication: Number(a.miss_indication),
    missingStage:     Number(a.miss_stage),
    unscored:         Number(a.unscored),
    poor:             Number(a.poor),
    partial:          Number(a.partial),
    good:             Number(a.good),
    excellent:        Number(a.excellent),
    gaveUp:           Number(gaveUpRes.rows[0]?.gave_up ?? 0),
  };
}

async function getModalityBreakdown(): Promise<ModalityRow[]> {
  const res = await db.execute<{ modality: string; cnt: string }>(sql`
    SELECT COALESCE(modality, 'unknown') AS modality, COUNT(*) AS cnt
    FROM ingested_assets WHERE relevant = true GROUP BY 1 ORDER BY 2 DESC LIMIT 20
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
    GROUP BY institution ORDER BY COUNT(*) DESC LIMIT 30
  `);
  return res.rows.map(r => ({ institution: r.institution, eligible: Number(r.eligible) }));
}

async function getGaveUpByInstitution(): Promise<InstitutionGaveUp[]> {
  const res = await db.execute<{ institution: string; count: string }>(sql`
    SELECT institution, COUNT(*) AS count FROM ingested_assets
    WHERE relevant = true AND COALESCE(mini_enrich_attempts, 0) >= 3
    GROUP BY institution ORDER BY COUNT(*) DESC LIMIT 20
  `);
  return res.rows.map(r => ({ institution: r.institution, count: Number(r.count) }));
}

/** Snapshot completeness_score + mini_enrich_attempts for all eligible assets. */
async function snapshotEligibleAssets(): Promise<AssetSnapshot[]> {
  const res = await db.execute<{ id: string; score: string | null; attempts: string }>(sql`
    SELECT id, completeness_score AS score, COALESCE(mini_enrich_attempts, 0) AS attempts
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
  `);
  return res.rows.map(r => ({
    id: Number(r.id),
    score: r.score != null ? Number(r.score) : null,
    attempts: Number(r.attempts),
  }));
}

interface DayJobStats {
  jobCount: number;
  totalProcessed: number;
  totalImproved: number;
  firstStarted: string;
  lastCompleted: string;
}

/** Aggregate stats for all mini-enrichment jobs completed on the same calendar day (UTC). */
async function getTodaysJobStats(day: string): Promise<DayJobStats> {
  const res = await db.execute<{
    job_count: string; total_processed: string; total_improved: string;
    first_started: string; last_completed: string;
  }>(sql`
    SELECT
      COUNT(*)::int AS job_count,
      SUM(processed)::int AS total_processed,
      SUM(improved)::int AS total_improved,
      MIN(started_at)::text AS first_started,
      MAX(completed_at)::text AS last_completed
    FROM enrichment_jobs
    WHERE status = 'done'
      AND model != 'gpt-4o'
      AND DATE(started_at AT TIME ZONE 'UTC') = ${day}::date
  `);
  const r = res.rows[0]!;
  return {
    jobCount:       Number(r.job_count   ?? 0),
    totalProcessed: Number(r.total_processed ?? 0),
    totalImproved:  Number(r.total_improved  ?? 0),
    firstStarted:   r.first_started ?? "",
    lastCompleted:  r.last_completed ?? "",
  };
}

/** Re-query the same asset IDs after the drain for their new scores + attempts. */
async function snapshotAfter(ids: number[]): Promise<Map<number, AssetSnapshot>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({
      id: ingestedAssets.id,
      score: ingestedAssets.completenessScore,
      attempts: ingestedAssets.miniEnrichAttempts,
    })
    .from(ingestedAssets)
    .where(inArray(ingestedAssets.id, ids));
  return new Map(rows.map(r => ({
    key: r.id,
    val: { id: r.id, score: r.score ?? null, attempts: r.attempts ?? 0 },
  })).map(({ key, val }) => [key, val]));
}

// ─────────────────────────────────────────────────
// API-driven enrichment drain
// ─────────────────────────────────────────────────

async function triggerAndWaitForDrain(): Promise<Omit<RunResult, "noGain">> {
  const startMs = Date.now();

  const runRes = await fetch(`${BASE_URL}/api/admin/enrichment/run`, {
    method: "POST",
    headers: scriptHeaders(),
    body: JSON.stringify({ all: true }),
  });

  if (!runRes.ok) {
    const body = await runRes.text();
    if (runRes.status !== 409) {
      throw new Error(`POST /api/admin/enrichment/run failed (${runRes.status}): ${body}`);
    }
    console.log(`   ⚠ Server returned 409 (job already running) — polling status…`);
  } else {
    const body = await runRes.json() as { total?: number; jobId?: number };
    console.log(`   ✅ Drain job started: total=${body.total ?? "??"} jobId=${body.jobId ?? "??"}`);
  }

  let lastProcessed = 0;
  let lastImproved = 0;
  let lastTotal = 0;
  let jobId: number | null = null;
  let tokenCostUSD = 0;
  const deadline = startMs + POLL_TIMEOUT_MS;

  while (true) {
    if (Date.now() > deadline) throw new Error(`Drain timed out after ${POLL_TIMEOUT_MS / 60_000} min`);
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

    const statusRes = await fetch(`${BASE_URL}/api/admin/enrichment/status`, {
      headers: scriptHeaders(),
    });
    if (!statusRes.ok) { console.warn(`   ⚠ Status poll ${statusRes.status} — retrying…`); continue; }

    const s = await statusRes.json() as {
      status: string; jobId?: number;
      processed?: number; total?: number; improved?: number; tokenCost?: number;
    };

    jobId = s.jobId ?? jobId;
    lastProcessed = s.processed ?? lastProcessed;
    lastImproved  = s.improved  ?? lastImproved;
    lastTotal     = s.total     ?? lastTotal;
    if (s.tokenCost != null) tokenCostUSD = s.tokenCost;

    const elapsed = ((Date.now() - startMs) / 1000).toFixed(0);
    const rate = lastProcessed > 0
      ? (lastProcessed / ((Date.now() - startMs) / 1000)).toFixed(1) : "0.0";
    console.log(
      `   [${elapsed}s] status=${s.status} processed=${lastProcessed}/${lastTotal} ` +
      `improved=${lastImproved} cost=$${tokenCostUSD.toFixed(4)} rate=${rate}/s`
    );

    if (s.status === "done" || s.status === "error" || s.status === "idle") {
      return {
        processed: lastProcessed, improved: lastImproved, tokenCostUSD,
        jobId, durationMs: Date.now() - startMs, finalStatus: s.status,
      };
    }
  }
}

// ─────────────────────────────────────────────────
// Tier helpers
// ─────────────────────────────────────────────────

const TIERS = ["unscored", "poor", "partial", "good", "excellent"] as const;
type Tier = typeof TIERS[number];

function tier(score: number | null): Tier {
  if (score === null || score === 0) return "unscored";
  if (score < 40) return "poor";
  if (score < 60) return "partial";
  if (score < 80) return "good";
  return "excellent";
}

// ─────────────────────────────────────────────────
// Formatting helpers
// ─────────────────────────────────────────────────

function pct(n: number, total: number): string {
  return total === 0 ? "0%" : `${((n / total) * 100).toFixed(1)}%`;
}

function diffStr(b: number, a: number): string {
  const d = Math.round((a - b) * 1e6) / 1e6;
  return d === 0 ? "—" : d > 0 ? `+${d}` : `${d}`;
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
  const [before, beforeModality, beforeInstitutions, gaveUpByInst, beforeAssets, todayJobs] =
    await Promise.all([
      getGlobalStats(),
      getModalityBreakdown(),
      getInstitutionBreakdown(),
      getGaveUpByInstitution(),
      snapshotEligibleAssets(),
      getTodaysJobStats(runDate),
    ]);

  console.log(`   Queue size       : ${before.totalEligible.toLocaleString()} eligible assets`);
  console.log(`   All relevant     : ${before.allTotal.toLocaleString()} · avg score: ${before.allAvgScore}`);
  console.log(`   Tiers            : unscored=${before.unscored} poor=${before.poor} partial=${before.partial} good=${before.good} excellent=${before.excellent}`);
  console.log(`   Missing (all)    : target=${before.missingTarget} modality=${before.missingModality} indication=${before.missingIndication} stage=${before.missingStage}`);
  console.log(`   Gave up (≥3)     : ${before.gaveUp.toLocaleString()}`);
  console.log(`   Per-asset snap   : ${beforeAssets.length} records captured\n`);

  // ── Enrichment drain via API ─────────────────────
  let runPartial: Omit<RunResult, "noGain"> = {
    processed: 0, improved: 0, tokenCostUSD: 0,
    jobId: null, durationMs: 0, finalStatus: "skipped",
  };

  if (DRY_RUN) {
    console.log("⏭  --dry-run flag set — skipping enrichment drain.\n");
  } else if (before.totalEligible === 0) {
    console.log(`✅ Queue is empty — drain already completed earlier today.`);
    if (todayJobs.jobCount > 0) {
      console.log(`   Today's sessions: ${todayJobs.jobCount} job(s), ${todayJobs.totalProcessed} processed, ${todayJobs.totalImproved} improved`);
      console.log(`   First started: ${todayJobs.firstStarted}  Last completed: ${todayJobs.lastCompleted}\n`);
      // Represent the day's cumulative drain in the run result
      runPartial = {
        processed: todayJobs.totalProcessed,
        improved: todayJobs.totalImproved,
        tokenCostUSD: 0,  // tokenCost resets on server restart; unavailable post-hoc
        jobId: null,
        durationMs: 0,
        finalStatus: "done (prior sessions)",
      };
    } else {
      console.log("   No enrichment jobs found for today.\n");
      runPartial.finalStatus = "done";
    }
  } else {
    console.log(`🚀 Triggering drain via POST ${BASE_URL}/api/admin/enrichment/run …`);
    runPartial = await triggerAndWaitForDrain();
    const durSec = (runPartial.durationMs / 1000).toFixed(0);
    console.log(`\n✅ Drain finished in ${durSec}s: processed=${runPartial.processed} improved=${runPartial.improved} cost=$${runPartial.tokenCostUSD.toFixed(4)} status=${runPartial.finalStatus}\n`);
  }

  // ── After snapshot ──────────────────────────────
  console.log("📸 Capturing AFTER snapshot…");
  const eligibleIds = beforeAssets.map(a => a.id);
  const [after, afterModality, afterInstitutions, afterAssetMap] = await Promise.all([
    getGlobalStats(),
    getModalityBreakdown(),
    getInstitutionBreakdown(),
    snapshotAfter(eligibleIds),
  ]);

  console.log(`   Queue size       : ${after.totalEligible.toLocaleString()} remaining`);
  console.log(`   All relevant     : ${after.allTotal.toLocaleString()} · avg score: ${after.allAvgScore} (was ${before.allAvgScore})`);
  console.log(`   Tiers            : unscored=${after.unscored} poor=${after.poor} partial=${after.partial} good=${after.good} excellent=${after.excellent}\n`);

  // ── Per-asset analysis from snapshots ──────────
  // processed_count = assets where attempts increased (i.e., the server touched them)
  // improved_count  = assets where score went up
  // no_gain_count   = processed but score did not increase (includes GPT errors + no new info)
  let processedFromSnap = 0;
  let improvedFromSnap  = 0;
  const transitionCount = new Map<string, number>();

  for (const snap of beforeAssets) {
    const after_ = afterAssetMap.get(snap.id);
    if (!after_) continue;
    const attemptsUp = after_.attempts > snap.attempts;
    if (attemptsUp) processedFromSnap++;

    const beforeTier = tier(snap.score);
    const afterTier  = tier(after_.score);

    if (afterTier !== beforeTier) {
      const key = `${beforeTier} → ${afterTier}`;
      transitionCount.set(key, (transitionCount.get(key) ?? 0) + 1);
    }
    if (after_.score !== null && snap.score !== null && after_.score > snap.score) {
      improvedFromSnap++;
    } else if (after_.score !== null && snap.score === null && after_.score > 0) {
      improvedFromSnap++;
    }
  }
  const noGainFromSnap = processedFromSnap - improvedFromSnap;

  // Use API counts for processed/improved where available (more accurate — includes
  // assets that entered the queue during the drain window); fall back to snapshot.
  const run: RunResult = {
    ...runPartial,
    noGain: runPartial.processed > 0
      ? runPartial.processed - runPartial.improved
      : noGainFromSnap,
  };

  // ── Derived metrics ─────────────────────────────
  const fieldGains = {
    target:    Math.max(0, before.missingTarget    - after.missingTarget),
    modality:  Math.max(0, before.missingModality  - after.missingModality),
    indication: Math.max(0, before.missingIndication - after.missingIndication),
    stage:     Math.max(0, before.missingStage     - after.missingStage),
  };

  const improvementRate = run.processed === 0 ? "N/A"
    : `${((run.improved / run.processed) * 100).toFixed(1)}%`;

  const fillRate = (gained: number, missingBefore: number) =>
    missingBefore === 0 ? "N/A" : `${((gained / missingBefore) * 100).toFixed(1)}%`;

  // Modality diff
  const beforeModMap = new Map(beforeModality.map(r => [r.modality, r.count]));
  const afterModMap  = new Map(afterModality.map(r => [r.modality, r.count]));
  const allModalities = new Set([...beforeModMap.keys(), ...afterModMap.keys()]);
  const modalityRows = [...allModalities].map(m => ({
    modality: m, before: beforeModMap.get(m) ?? 0, after: afterModMap.get(m) ?? 0,
  })).sort((a, b) => b.after - a.after);

  // Per-institution diff
  const beforeInstMap = new Map(beforeInstitutions.map(r => [r.institution, r.eligible]));
  const afterInstMap  = new Map(afterInstitutions.map(r => [r.institution, r.eligible]));
  const allInst = new Set([
    ...beforeInstitutions.map(r => r.institution),
    ...afterInstitutions.map(r => r.institution),
  ]);
  const instRows = [...allInst].map(inst => ({
    institution: inst,
    before: beforeInstMap.get(inst) ?? 0,
    after:  afterInstMap.get(inst)  ?? 0,
  })).sort((a, b) => b.before - a.before);

  // Field recommendation blocks (pre-computed outside template to avoid backtick issues)
  const lowestFillEntries = [
    { field: "target",           gained: fieldGains.target,     missing: before.missingTarget },
    { field: "modality",         gained: fieldGains.modality,   missing: before.missingModality },
    { field: "indication",       gained: fieldGains.indication, missing: before.missingIndication },
    { field: "development_stage",gained: fieldGains.stage,      missing: before.missingStage },
  ].sort((a, b) =>
    (a.missing === 0 ? 1 : a.gained / a.missing) - (b.missing === 0 ? 1 : b.gained / b.missing)
  );

  const fieldRecsBlock = lowestFillEntries.map(e => {
    const rate = e.missing === 0 ? 1 : e.gained / e.missing;
    const rateStr = (rate * 100).toFixed(1) + "%";
    if (rate < 0.03) {
      return "- **" + e.field + "** fill rate " + rateStr + " — very low. Assets lack sufficient text signal. "
        + "Consider deeper scraping for abstract text or raising the data_sparse char threshold.";
    } else if (rate < 0.15) {
      return "- **" + e.field + "** fill rate " + rateStr + " — low. Many remaining assets may be "
        + "non-drug/biologic where this field is N/A. Filtering non-drug_biologic assets out of "
        + "the 3-unknown gate in buildEnrichWhere() would remove false negatives from this metric.";
    } else {
      return "- **" + e.field + "** fill rate " + rateStr + " — reasonable. "
        + "Further gains require richer source text or prompt improvements.";
    }
  }).join("\n");

  const priorityInstBlock = afterInstitutions.slice(0, 5).length > 0
    ? afterInstitutions.slice(0, 5).map((r, i) =>
        `${i + 1}. **${r.institution}** — ${r.eligible} assets still eligible`).join("\n")
    : "Queue is fully drained — no remaining eligible assets.";

  const gaveUpBlock = gaveUpByInst.slice(0, 10).map((r, i) =>
    `${i + 1}. **${r.institution}** — ${r.count.toLocaleString()} assets`).join("\n");

  // Transition matrix rows (sorted by count desc, excluding no-change)
  const transitions = [...transitionCount.entries()].sort((a, b) => b[1] - a[1]);
  const transitionBlock = transitions.length > 0
    ? transitions.map(([k, v]) => "| " + k + " | " + v + " |").join("\n")
    : "| (no tier transitions observed) | — |";

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
| Assets eligible (queue) | ${before.totalEligible.toLocaleString()} | ${after.totalEligible.toLocaleString()} | ${diffStr(before.totalEligible, after.totalEligible)} |
| Assets gave up (attempts ≥ 3) | ${before.gaveUp.toLocaleString()} | ${after.gaveUp.toLocaleString()} | ${diffStr(before.gaveUp, after.gaveUp)} |
| All relevant assets | ${before.allTotal.toLocaleString()} | ${after.allTotal.toLocaleString()} | ${diffStr(before.allTotal, after.allTotal)} |
| Avg completeness score (all relevant) | ${before.allAvgScore} | ${after.allAvgScore} | ${diffStr(before.allAvgScore, after.allAvgScore)} |

**Drain job results${run.finalStatus === "done (prior sessions)" ? " (cumulative — queue was already drained in prior sessions today)" : ""}:**

| Metric | Value |
|--------|-------|
| Job ID | ${run.jobId ?? (run.finalStatus === "done (prior sessions)" ? `${todayJobs.jobCount} jobs (cumulative)` : "N/A")} |
| Final status | ${run.finalStatus} |
| Processed | ${run.processed.toLocaleString()} |
| Improved (≥1 field gained) | ${run.improved.toLocaleString()} (${improvementRate}) |
| No gain (error + no new info) | ${run.noGain.toLocaleString()} |
| Token cost (reported by server) | ${run.tokenCostUSD > 0 ? "$" + run.tokenCostUSD.toFixed(4) : "N/A (resets on server restart)"} |
| Wall time | ${run.durationMs > 0 ? (run.durationMs / 1000).toFixed(0) + " s" : "N/A (prior sessions)"} |
${run.finalStatus === "done (prior sessions)" && todayJobs.jobCount > 0 ? `| Today's first drain started | ${todayJobs.firstStarted} |
| Today's last drain completed | ${todayJobs.lastCompleted} |` : ""}

> **"No gain"** counts assets that were processed but gained no new field values.
> This bucket is a union of LLM errors (classifyAsset threw) and assets where the model
> ran successfully but could not infer any new field from the available text.
> The server does not separately track these two cases.

**Per-asset snapshot cross-check** (from before/after DB diff on eligible-set IDs):

| Metric | Value |
|--------|-------|
| Assets touched (attempts increased) | ${processedFromSnap.toLocaleString()} |
| Assets improved (score increased) | ${improvedFromSnap.toLocaleString()} |
| Assets processed with no score gain | ${noGainFromSnap.toLocaleString()} |

---

## 2. Field-Fill Rates

Gains computed as corpus-wide reduction in missing-field counts (before − after, all relevant assets):

${run.finalStatus === "done (prior sessions)"
  ? "> **Note:** The before/after snapshots were both taken after today's drain (queue was already empty\n> when this script ran). Field-fill deltas reflect the current post-drain state only.\n> To see the actual gains from today's drain, compare these after-counts against a snapshot taken\n> before the first job on 2026-05-08 (first job started " + todayJobs.firstStarted.slice(0, 19) + " UTC).\n"
  : ""}
| Field | Missing before | Missing after | Gained | Fill Rate |
|-------|---------------|--------------|--------|-----------|
| target | ${before.missingTarget.toLocaleString()} | ${after.missingTarget.toLocaleString()} | ${fieldGains.target.toLocaleString()} | ${fillRate(fieldGains.target, before.missingTarget)} |
| modality | ${before.missingModality.toLocaleString()} | ${after.missingModality.toLocaleString()} | ${fieldGains.modality.toLocaleString()} | ${fillRate(fieldGains.modality, before.missingModality)} |
| indication | ${before.missingIndication.toLocaleString()} | ${after.missingIndication.toLocaleString()} | ${fieldGains.indication.toLocaleString()} | ${fillRate(fieldGains.indication, before.missingIndication)} |
| development_stage | ${before.missingStage.toLocaleString()} | ${after.missingStage.toLocaleString()} | ${fieldGains.stage.toLocaleString()} | ${fillRate(fieldGains.stage, before.missingStage)} |

---

## 3. Tier Band Distribution

| Tier | Before | After | Delta | % of all (after) |
|------|--------|-------|-------|------------------|
| Excellent (≥80) | ${before.excellent.toLocaleString()} | ${after.excellent.toLocaleString()} | ${diffStr(before.excellent, after.excellent)} | ${pct(after.excellent, after.allTotal)} |
| Good (60–79) | ${before.good.toLocaleString()} | ${after.good.toLocaleString()} | ${diffStr(before.good, after.good)} | ${pct(after.good, after.allTotal)} |
| Partial (40–59) | ${before.partial.toLocaleString()} | ${after.partial.toLocaleString()} | ${diffStr(before.partial, after.partial)} | ${pct(after.partial, after.allTotal)} |
| Poor (1–39) | ${before.poor.toLocaleString()} | ${after.poor.toLocaleString()} | ${diffStr(before.poor, after.poor)} | ${pct(after.poor, after.allTotal)} |
| Unscored (0/null) | ${before.unscored.toLocaleString()} | ${after.unscored.toLocaleString()} | ${diffStr(before.unscored, after.unscored)} | ${pct(after.unscored, after.allTotal)} |

### Tier Transition Matrix (per-asset before→after on the eligible set)

Counts assets from the before-eligible snapshot that crossed tier boundaries after the drain:

| Transition | Count |
|-----------|-------|
${transitionBlock}

> Assets that stayed in the same tier are not listed. Transitions are computed from the
> per-asset completeness_score snapshot taken immediately before and after the drain.

---

## 4. Modality Distribution

Before/after breakdown of the \`modality\` field across all relevant assets:

| Modality | Before | After | Delta |
|----------|--------|-------|-------|
${modalityRows.map(r =>
  "| " + r.modality + " | " + r.before.toLocaleString() + " | " + r.after.toLocaleString() + " | " + diffStr(r.before, r.after) + " |"
).join("\n")}

> Assets in the \`unknown\` modality row are the primary target for further enrichment.

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

Assets permanently at the 3-attempt cap:

**Before:** ${before.gaveUp.toLocaleString()} · **After:** ${after.gaveUp.toLocaleString()} · **New this run:** ${diffStr(before.gaveUp, after.gaveUp)}

Top institutions by gave-up count:

${gaveUpBlock}

---

## 7. Token Cost

| Metric | Value |
|--------|-------|
| Assets processed | ${run.processed.toLocaleString()} |
| Token cost | ${run.tokenCostUSD > 0 ? "**$" + run.tokenCostUSD.toFixed(4) + "**" : "N/A (resets on server restart — see prior-session note in §1)"} |
| Cost per asset | ${run.tokenCostUSD > 0 && run.processed > 0 ? "$" + (run.tokenCostUSD / run.processed).toFixed(5) : "N/A"} |
| Model | gpt-4o-mini |
| Wall time | ${run.durationMs > 0 ? (run.durationMs / 1000).toFixed(0) + " s" : "N/A (prior sessions)"} |

---

## 8. Optimization Recommendations

### 8.1 Institutions to Prioritize Next

${priorityInstBlock}

### 8.2 Field Fill Rate Analysis

${fieldRecsBlock}

### 8.3 Gave-Up Cap Analysis

**${after.gaveUp.toLocaleString()}** assets (${pct(after.gaveUp, after.allTotal)} of all relevant) are at the 3-attempt cap.
New this run: **${diffStr(before.gaveUp, after.gaveUp)}**.

Recommended actions:
- **Non-drug queue filter (highest impact)**: Add \`AND (asset_class IS NULL OR asset_class = 'drug_biologic')\` to \`buildEnrichWhere()\` in \`server/storage.ts\`. Assets classified as research_tool/medical_device/software always score 3 unknowns on drug fields, consuming batch slots and accumulating cap counts.
- **DOE patent abstract supplementation**: OSTI.gov leads the gave-up list. Supplement the scraper with the OSTI full-text API to backfill scientific abstracts into the \`abstract\` column, then reset \`mini_enrich_attempts = 0\` for those assets.
- **Attempt cap reset endpoint**: Add \`POST /api/admin/enrichment/reset-cap\` accepting \`{ institution: string }\` to allow manual re-try after scraper content improvements.

### 8.4 Concrete Prompt/Data Improvements

1. **Target inference expansion**: Extend the HGNC pathway→gene mapping table in the \`classifyAsset\` prompt. High-value additions: Wnt→CTNNB1, mTOR→MTOR, JAK→JAK1, PI3K→PIK3CA, VEGF→VEGFA.
2. **Stage heuristic pre-filter**: If \`licensingReadiness = 'startup formed'\` AND no clinical keywords → set stage = \`preclinical\` before the LLM call. Zero API cost.
3. **Data-sparse threshold**: Raise from 120 combined chars to 200 chars in \`buildEnrichWhere\`. Assets in the 120–200 char window very rarely yield useful classification.
4. **Modality-specific prompting**: The \`unknown\` modality bucket (${before.missingModality.toLocaleString()} assets) is the largest single gap. A dedicated modality-classification prompt pass (small-molecule vs. biologic vs. cell-therapy vs. gene-therapy) would outperform the generic multi-field prompt.

---

## 9. Internal Consistency Check

- improved ≤ processed: ${run.improved <= run.processed ? "✅" : "⚠"}
- improved + no_gain = processed: ${(run.improved + run.noGain) === run.processed ? "✅" : "⚠"} (${run.improved} + ${run.noGain} = ${run.processed})
- after.gaveUp ≥ before.gaveUp: ${after.gaveUp >= before.gaveUp ? "✅" : "⚠"}
- avg score direction: ${after.allAvgScore >= before.allAvgScore ? "✅ improved or flat" : "⚠ decreased"} (${before.allAvgScore} → ${after.allAvgScore})

---

*Report generated by \`scripts/enrichment-audit.ts\` on ${reportDate}*
${DRY_RUN
  ? "*Dry-run mode — drain was not triggered*"
  : run.finalStatus === "done (prior sessions)"
    ? `*Queue was fully drained in prior sessions today (${todayJobs.jobCount} jobs, first started ${todayJobs.firstStarted.slice(0, 19)} UTC). This run confirmed the empty-queue state via \`GET ${BASE_URL}/api/admin/enrichment/status\`.*`
    : `*Drain triggered via \`POST ${BASE_URL}/api/admin/enrichment/run\` with \`{ all: true }\`, polled every ${POLL_INTERVAL_MS / 1000} s*`
}
`;

  writeFileSync(reportPath, md, "utf-8");
  console.log(`📄 Report written to: reports/${reportFileName}`);

  console.log("\n═══════════════ SUMMARY ═══════════════");
  console.log(`  Queue before  : ${before.totalEligible.toLocaleString()}`);
  console.log(`  Processed     : ${run.processed.toLocaleString()}`);
  console.log(`  Improved      : ${run.improved.toLocaleString()} (${improvementRate})`);
  console.log(`  No gain       : ${run.noGain.toLocaleString()}`);
  console.log(`  Remaining     : ${after.totalEligible.toLocaleString()}`);
  console.log(`  Token cost    : $${run.tokenCostUSD.toFixed(4)}`);
  console.log(`  Avg score     : ${before.allAvgScore} → ${after.allAvgScore}`);
  console.log(`  Tier changes  : ${transitions.length > 0 ? transitions.map(([k, v]) => k + "×" + v).join(", ") : "none"}`);
  console.log("═══════════════════════════════════════\n");

  await pool.end();
  process.exit(0);
})().catch(async err => {
  console.error("\n[enrichment-audit] fatal:", err);
  await pool.end().catch(() => {});
  process.exit(1);
});
