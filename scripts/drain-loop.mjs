/**
 * drain-loop.mjs — polls the production EDEN enrich endpoint and chains
 * cycles until the queue is fully drained. No dependencies beyond Node 18+.
 *
 * Usage: node scripts/drain-loop.mjs <token>
 */

const TOKEN = process.argv[2];
const BASE  = "https://helix-radar.replit.app";

if (!TOKEN) { console.error("Usage: node scripts/drain-loop.mjs <token>"); process.exit(1); }

const headers = { "Authorization": `Bearer ${TOKEN}`, "Content-Type": "application/json" };

const ts = () => new Date().toTimeString().slice(0, 8);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function getStatus() {
  const r = await fetch(`${BASE}/api/admin/eden/enrich/status`, { headers });
  return r.json();
}

async function triggerCycle() {
  const r = await fetch(`${BASE}/api/admin/eden/enrich`, { method: "POST", headers, body: "{}" });
  return r.json();
}

async function main() {
  let cycle = 1;
  let totalSucc = 0, totalFail = 0, totalSkip = 0;

  // Check if a cycle is already running
  const initial = await getStatus();
  if (initial.running) {
    console.log(`${ts()} Cycle already running (job ${initial.job?.id}) — joining in-progress run`);
  } else {
    // Carry forward cycle 1 results if present in lastSummary
    const s = initial.lastSummary || {};
    if (s.succeeded > 0 || s.skipped > 0) {
      totalSucc = s.succeeded || 0;
      totalFail = s.failed || 0;
      totalSkip = s.skipped || 0;
      console.log(`${ts()} Resuming after cycle 1: succ=${totalSucc} skip=${totalSkip} deferred=${s.deferred}`);
      if (!s.deferred || s.deferred === 0) {
        console.log(`\n✅ Queue already drained (deferred=0). Nothing to do.`);
        return;
      }
    }
    cycle++;
    const t = await triggerCycle();
    if (t.error) { console.error(`${ts()} Trigger failed:`, t); process.exit(1); }
    console.log(`${ts()} Cycle ${cycle} started — job ${t.jobId}, ${t.total} assets, ~${t.totalAvailable} total in queue (${t.deferred} deferred)`);
  }

  while (true) {
    await sleep(20_000);

    let s;
    try { s = await getStatus(); } catch(e) { console.warn(`${ts()} Status poll failed: ${e.message} — retrying`); continue; }

    if (s.running) {
      const pct = s.total > 0 ? Math.round(s.processed / s.total * 100) : 0;
      console.log(`${ts()} Cycle ${cycle} (job ${s.job?.id}) — ${s.processed}/${s.total} (${pct}%) | succ=${s.succeeded} fail=${s.failed} skip=${s.skipped}`);
      continue;
    }

    // Cycle done
    const ls = s.lastSummary || {};
    const cycleSucc = ls.succeeded ?? s.succeeded ?? 0;
    const cycleFail = ls.failed   ?? s.failed   ?? 0;
    const cycleSkip = ls.skipped  ?? s.skipped  ?? 0;
    const deferred  = ls.deferred ?? 0;
    const durSec    = ls.durationMs ? (ls.durationMs / 1000).toFixed(0) : '?';
    const movements = ls.bandMovements && Object.keys(ls.bandMovements).length
      ? JSON.stringify(ls.bandMovements) : 'none';

    totalSucc += cycleSucc;
    totalFail += cycleFail;
    totalSkip += cycleSkip;

    console.log(`${ts()} Cycle ${cycle} DONE (${durSec}s) | succ=${cycleSucc} fail=${cycleFail} skip=${cycleSkip} deferred=${deferred} | bands: ${movements}`);
    console.log(`          CUMULATIVE: enriched=${totalSucc} failed=${totalFail} skipped=${totalSkip}`);

    if (deferred === 0) {
      console.log(`\n✅ QUEUE FULLY DRAINED`);
      console.log(`   Total enriched : ${totalSucc}`);
      console.log(`   Total failed   : ${totalFail}`);
      console.log(`   Total skipped  : ${totalSkip}`);
      break;
    }

    // Trigger next cycle
    cycle++;
    let t;
    try { t = await triggerCycle(); } catch(e) { console.error(`${ts()} Trigger error:`, e); break; }
    if (t.error) {
      if (t.error.includes('already running')) {
        console.log(`${ts()} Cycle ${cycle} already running — will poll`);
      } else {
        console.error(`${ts()} Cycle ${cycle} trigger failed:`, t); break;
      }
    } else {
      console.log(`${ts()} Cycle ${cycle} started — job ${t.jobId}, ${t.total} assets, ~${t.totalAvailable} in queue`);
    }
  }
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
