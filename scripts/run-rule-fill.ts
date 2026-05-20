/**
 * Standalone rule-based fill script.
 *
 * Runs runRuleBasedFill() as a detached child process so it is immune to
 * server restarts, Replit checkpoint deploys, and port conflicts.
 *
 * Progress is written to /tmp/rule-fill-progress.json every 500 rows so the
 * Admin UI can poll it via the status endpoint.
 *
 * Usage (direct):
 *   tsx scripts/run-rule-fill.ts
 *
 * The fill is resumable — assets already filled are skipped by the WHERE
 * clause, so re-running is safe and continues from where it left off.
 */

import * as fs from "fs";
import { pool } from "../server/db";
import { runRuleBasedFill } from "../server/lib/pipeline/ruleBasedFill";

const PROGRESS_FILE = "/tmp/rule-fill-progress.json";
const LOG_EVERY = 500;
let lastLogged = 0;

function writeProgress(data: object) {
  try {
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data), "utf8");
  } catch { /* non-fatal */ }
}

function progress(processed: number, total: number, filled: number) {
  writeProgress({ status: "running", pid: process.pid, processed, total, filled });
  if (processed === total || processed - lastLogged >= LOG_EVERY) {
    const pct = total > 0 ? Math.round((processed / total) * 100) : 0;
    console.log(
      `[rule-fill] ${processed.toLocaleString()}/${total.toLocaleString()} (${pct}%) — ${filled.toLocaleString()} fields written`,
    );
    lastLogged = processed;
  }
}

async function main() {
  writeProgress({ status: "running", pid: process.pid, processed: 0, total: 0, filled: 0 });
  console.log("[rule-fill] Starting — writing progress to", PROGRESS_FILE);
  console.log("[rule-fill] Resumable: already-filled assets are skipped automatically.");

  const summary = await runRuleBasedFill(progress);

  writeProgress({ status: "done", pid: process.pid, result: summary });

  console.log("");
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║           Rule-Based Fill Complete           ║");
  console.log("╠══════════════════════════════════════════════╣");
  console.log(`║  Assets processed:   ${String(summary.processed.toLocaleString()).padEnd(22)}║`);
  console.log(`║  Assets filled:      ${String(summary.filled.toLocaleString()).padEnd(22)}║`);
  console.log(`║  Total field writes: ${String(summary.fieldsWritten.toLocaleString()).padEnd(22)}║`);
  console.log(`║  Sparse-tagged:      ${String(summary.dataSparseTagged.toLocaleString()).padEnd(22)}║`);
  console.log("╠══════════════════════════════════════════════╣");
  for (const [field, count] of Object.entries(summary.byField).sort((a, b) => b[1] - a[1])) {
    const line = `  ${field}: ${count.toLocaleString()}`;
    console.log(`║  ${line.padEnd(44)}║`);
  }
  console.log("╚══════════════════════════════════════════════╝");
}

main()
  .catch((err) => {
    console.error("[rule-fill] Fatal:", err);
    writeProgress({ status: "failed", pid: process.pid, error: String(err?.message ?? err) });
    process.exit(1);
  })
  .finally(() => pool.end());
