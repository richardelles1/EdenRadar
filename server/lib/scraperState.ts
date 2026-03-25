import { db } from "../db";
import { sql } from "drizzle-orm";

export interface SchedulerStateRow {
  queueIndex: number;
  cycleCount: number;
  cycleStartedAt: Date | null;
  completedThisCycle: number;
  failedThisCycle: number;
  lastCycleCompletedAt: Date | null;
  schedulerRunning: boolean;
}

export interface ScraperHealthRow {
  institution: string;
  consecutiveFailures: number;
  lastFailureReason: string | null;
  lastFailureAt: Date | null;
  lastSuccessAt: Date | null;
  backoffUntil: Date | null;
  /** Number of new assets found in the most recent successful sync.
   * Used by the staleness gate: skip re-sync if lastSuccessAt < 4h AND lastSuccessNewCount === 0. */
  lastSuccessNewCount: number | null;
}

const BACKOFF_FAILURE_THRESHOLD = 5;
const BACKOFF_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export async function saveSchedulerState(state: SchedulerStateRow): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO scheduler_state (id, queue_index, cycle_count, cycle_started_at, completed_this_cycle, failed_this_cycle, last_cycle_completed_at, scheduler_running, updated_at)
      VALUES (1, ${state.queueIndex}, ${state.cycleCount}, ${state.cycleStartedAt}, ${state.completedThisCycle}, ${state.failedThisCycle}, ${state.lastCycleCompletedAt}, ${state.schedulerRunning}, NOW())
      ON CONFLICT (id) DO UPDATE SET
        queue_index = EXCLUDED.queue_index,
        cycle_count = EXCLUDED.cycle_count,
        cycle_started_at = EXCLUDED.cycle_started_at,
        completed_this_cycle = EXCLUDED.completed_this_cycle,
        failed_this_cycle = EXCLUDED.failed_this_cycle,
        last_cycle_completed_at = EXCLUDED.last_cycle_completed_at,
        scheduler_running = EXCLUDED.scheduler_running,
        updated_at = NOW()
    `);
  } catch (err: any) {
    console.warn(`[scraperState] saveSchedulerState failed: ${err?.message}`);
  }
}

export async function loadSchedulerState(): Promise<SchedulerStateRow | null> {
  try {
    const result = await db.execute(sql`SELECT * FROM scheduler_state WHERE id = 1`);
    const row = (result.rows as any[])[0];
    if (!row) return null;
    return {
      queueIndex: Number(row.queue_index ?? 0),
      cycleCount: Number(row.cycle_count ?? 0),
      cycleStartedAt: row.cycle_started_at ? new Date(row.cycle_started_at) : null,
      completedThisCycle: Number(row.completed_this_cycle ?? 0),
      failedThisCycle: Number(row.failed_this_cycle ?? 0),
      lastCycleCompletedAt: row.last_cycle_completed_at ? new Date(row.last_cycle_completed_at) : null,
      schedulerRunning: row.scheduler_running === true || row.scheduler_running === 't' || row.scheduler_running === 'true',
    };
  } catch (err: any) {
    console.warn(`[scraperState] loadSchedulerState failed: ${err?.message}`);
    return null;
  }
}

export async function loadAllScraperHealth(): Promise<Map<string, ScraperHealthRow>> {
  const map = new Map<string, ScraperHealthRow>();
  try {
    const result = await db.execute(sql`SELECT * FROM scraper_health`);
    for (const row of result.rows as any[]) {
      map.set(row.institution, {
        institution: row.institution,
        consecutiveFailures: Number(row.consecutive_failures ?? 0),
        lastFailureReason: row.last_failure_reason ?? null,
        lastFailureAt: row.last_failure_at ? new Date(row.last_failure_at) : null,
        lastSuccessAt: row.last_success_at ? new Date(row.last_success_at) : null,
        backoffUntil: row.backoff_until ? new Date(row.backoff_until) : null,
        lastSuccessNewCount: row.last_success_new_count != null ? Number(row.last_success_new_count) : null,
      });
    }
  } catch (err: any) {
    console.warn(`[scraperState] loadAllScraperHealth failed: ${err?.message}`);
  }
  return map;
}

/** Record a successful sync, persisting both the success timestamp and new-asset count. */
export async function recordScraperSuccess(institution: string, newCount: number): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO scraper_health (institution, consecutive_failures, last_failure_reason, last_failure_at, last_success_at, backoff_until, last_success_new_count, updated_at)
      VALUES (${institution}, 0, NULL, NULL, NOW(), NULL, ${newCount}, NOW())
      ON CONFLICT (institution) DO UPDATE SET
        consecutive_failures = 0,
        last_failure_reason = NULL,
        last_failure_at = NULL,
        last_success_at = NOW(),
        backoff_until = NULL,
        last_success_new_count = ${newCount},
        updated_at = NOW()
    `);
  } catch (err: any) {
    console.warn(`[scraperState] recordScraperSuccess failed for ${institution}: ${err?.message}`);
  }
}

export async function updateScraperHealth(institution: string, success: boolean, failureReason?: string, newCount?: number): Promise<void> {
  try {
    if (success) {
      await db.execute(sql`
        INSERT INTO scraper_health (institution, consecutive_failures, last_failure_reason, last_failure_at, last_success_at, backoff_until, last_success_new_count, updated_at)
        VALUES (${institution}, 0, NULL, NULL, NOW(), NULL, ${newCount ?? null}, NOW())
        ON CONFLICT (institution) DO UPDATE SET
          consecutive_failures = 0,
          last_failure_reason = NULL,
          last_failure_at = NULL,
          last_success_at = NOW(),
          backoff_until = NULL,
          last_success_new_count = ${newCount ?? null},
          updated_at = NOW()
      `);
    } else {
      await db.execute(sql`
        INSERT INTO scraper_health (institution, consecutive_failures, last_failure_reason, last_failure_at, last_success_at, backoff_until, updated_at)
        VALUES (
          ${institution},
          1,
          ${failureReason ?? null},
          NOW(),
          NULL,
          CASE WHEN 1 >= ${BACKOFF_FAILURE_THRESHOLD} THEN NOW() + INTERVAL '7 days' ELSE NULL END,
          NOW()
        )
        ON CONFLICT (institution) DO UPDATE SET
          consecutive_failures = scraper_health.consecutive_failures + 1,
          last_failure_reason = ${failureReason ?? null},
          last_failure_at = NOW(),
          backoff_until = CASE
            WHEN scraper_health.consecutive_failures + 1 >= ${BACKOFF_FAILURE_THRESHOLD}
            THEN NOW() + INTERVAL '7 days'
            ELSE scraper_health.backoff_until
          END,
          updated_at = NOW()
      `);
    }
  } catch (err: any) {
    console.warn(`[scraperState] updateScraperHealth failed for ${institution}: ${err?.message}`);
  }
}

export async function clearScraperBackoff(institution: string): Promise<void> {
  try {
    await db.execute(sql`
      UPDATE scraper_health
      SET consecutive_failures = 0, backoff_until = NULL, last_failure_reason = NULL, updated_at = NOW()
      WHERE institution = ${institution}
    `);
  } catch (err: any) {
    console.warn(`[scraperState] clearScraperBackoff failed for ${institution}: ${err?.message}`);
  }
}

export async function getAllScraperHealth(): Promise<ScraperHealthRow[]> {
  try {
    const result = await db.execute(sql`
      SELECT * FROM scraper_health ORDER BY consecutive_failures DESC, institution ASC
    `);
    return (result.rows as any[]).map((row) => ({
      institution: row.institution,
      consecutiveFailures: Number(row.consecutive_failures ?? 0),
      lastFailureReason: row.last_failure_reason ?? null,
      lastFailureAt: row.last_failure_at ? new Date(row.last_failure_at) : null,
      lastSuccessAt: row.last_success_at ? new Date(row.last_success_at) : null,
      backoffUntil: row.backoff_until ? new Date(row.backoff_until) : null,
      lastSuccessNewCount: row.last_success_new_count != null ? Number(row.last_success_new_count) : null,
    }));
  } catch (err: any) {
    console.warn(`[scraperState] getAllScraperHealth failed: ${err?.message}`);
    return [];
  }
}
