/**
 * Scraper weakness report — run with:  npx tsx scripts/scraper-weakness-report.ts
 * Reports active scrapers that are failing, blocked, returning 0 listings, or in backoff.
 */
import { pool } from "../server/db";

async function main() {
  const { rows } = await pool.query<{
    institution: string;
    consecutive_failures: number;
    last_failure_reason: string | null;
    last_failure_at: string | null;
    last_success_at: string | null;
    backoff_until: string | null;
    last_success_new_count: number | null;
    last_success_raw_count: number | null;
    in_backoff: boolean;
  }>(`
    SELECT
      institution,
      consecutive_failures,
      last_failure_reason,
      last_failure_at::text,
      last_success_at::text,
      backoff_until::text,
      last_success_new_count,
      last_success_raw_count,
      (backoff_until IS NOT NULL AND backoff_until > NOW()) AS in_backoff
    FROM scraper_health
    WHERE consecutive_failures >= 2
       OR (last_success_raw_count IS NOT NULL AND last_success_raw_count = 0)
       OR (backoff_until IS NOT NULL AND backoff_until > NOW())
    ORDER BY consecutive_failures DESC, last_failure_at DESC NULLS LAST
  `);

  // Also grab last session errorMessage for context
  const insts = rows.map((r) => `'${r.institution.replace(/'/g, "''")}'`).join(",");
  const sessionMap = new Map<string, string>();
  if (insts) {
    const { rows: sessions } = await pool.query<{ institution: string; error_message: string | null }>(`
      SELECT DISTINCT ON (institution) institution, error_message
      FROM sync_sessions
      WHERE institution IN (${insts})
      ORDER BY institution, completed_at DESC NULLS LAST
    `);
    for (const s of sessions) {
      if (s.error_message) sessionMap.set(s.institution, s.error_message);
    }
  }

  const now = new Date();

  // Classify health
  type Category = "failing" | "in_backoff" | "empty_response" | "degraded";
  const categorized: Record<Category, typeof rows> = {
    failing: [],
    in_backoff: [],
    empty_response: [],
    degraded: [],
  };

  for (const r of rows) {
    if (r.consecutive_failures >= 5) categorized.failing.push(r);
    else if (r.in_backoff) categorized.in_backoff.push(r);
    else if (r.last_success_raw_count === 0) categorized.empty_response.push(r);
    else categorized.degraded.push(r);
  }

  function daysAgo(ts: string | null): string {
    if (!ts) return "never";
    const d = Math.floor((now.getTime() - new Date(ts).getTime()) / 86_400_000);
    return d === 0 ? "today" : `${d}d ago`;
  }

  function shortErr(r: typeof rows[0]): string {
    const err = sessionMap.get(r.institution) ?? r.last_failure_reason ?? "";
    return err.slice(0, 80);
  }

  function printGroup(label: string, items: typeof rows) {
    if (!items.length) return;
    console.log(`\n${"═".repeat(70)}`);
    console.log(`  ${label} (${items.length})`);
    console.log("═".repeat(70));
    for (const r of items) {
      const backoffLine = r.in_backoff && r.backoff_until
        ? `  🔒 backoff until ${new Date(r.backoff_until).toUTCString()}`
        : "";
      console.log(
        `  ${r.institution.padEnd(40)} fails:${String(r.consecutive_failures).padStart(3)}  ` +
        `raw:${String(r.last_success_raw_count ?? "?").padStart(5)}  ` +
        `last ok: ${daysAgo(r.last_success_at)}`
      );
      if (backoffLine) console.log(backoffLine);
      const err = shortErr(r);
      if (err) console.log(`  └─ ${err}`);
    }
  }

  console.log("\nSCRAPER WEAKNESS REPORT — " + now.toUTCString());
  console.log(`Total problem scrapers: ${rows.length}`);

  printGroup("🔴 FAILING (5+ consecutive failures)", categorized.failing);
  printGroup("🟠 IN BACKOFF", categorized.in_backoff);
  printGroup("🟡 EMPTY RESPONSE (0 listings on last success)", categorized.empty_response);
  printGroup("🟡 DEGRADED (2–4 consecutive failures)", categorized.degraded);

  console.log("\n");
  await pool.end();
}

main().catch((e) => { console.error(e.message); process.exit(1); });
