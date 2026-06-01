import { ALL_SCRAPERS, getScraperTier } from "./scrapers/index";
import { runInstitutionSync, tryAcquireSyncLock, isIngestionRunning, getActiveSyncs, getMaxHttpConcurrent, setConcurrency, releaseSyncLock } from "./ingestion";
export { setConcurrency, getMaxHttpConcurrent };
import {
  saveSchedulerState,
  loadSchedulerState,
  loadAllScraperHealth,
  updateScraperHealth,
  ensureSchedulerStateSchema,
  stampScraperCycleComplete,
  type ScraperHealthRow,
} from "./scraperState";
import { storage } from "../storage";
import { checkAndSendAlerts } from "./alertMailer";
import { sendEmail, getAdminNotificationRecipients, FROM_DIGEST } from "../email";

/** Skip an institution only if it was synced within this window AND found 0 new assets. */
const FRESH_THRESHOLD_MS = 4 * 60 * 60 * 1000;  // 4 hours

export interface SchedulerStatus {
  state: "idle" | "running" | "paused";
  currentInstitution: string | null;
  currentInstitutions: string[];
  nextInstitution: string | null;
  queuePosition: number;
  queueTotal: number;
  completedThisCycle: number;
  failedThisCycle: number;
  skippedThisCycle: number;
  freshSkippedThisCycle: number;
  cycleStartedAt: string | null;
  lastActivityAt: string | null;
  cycleCount: number;
  priorityQueue: string[];
  delayMs: number;
  avgSyncMs: number | null;
  estimatedRemainingMs: number | null;
  lastCycleCompletedAt: string | null;
  concurrentSyncs: number;
  maxConcurrency: number;
  currentTier: 1 | 2 | 3 | 4 | null;
  /** Non-null when the scheduler is running a tier-only scan (not a full cycle). */
  tierOnly: number | null;
  /** True when the scheduler is running a staleness-first (oldest-synced-first) scan. */
  stalenessFirst: boolean;
  /** True when the scheduler is running a Daily Sweep (staleness-ordered, T3-complex sub-phase, completion report). */
  dailySweep: boolean;
  /** True when the Daily Sweep has entered the T3-complex sub-phase (concurrency=1, 3 retries). */
  dailySweepComplexPhase: boolean;
  /** True when the current cycle was started by the pg_cron auto-sweep trigger. */
  autoSweepActive: boolean;
  /** Queue position at which the scheduler resumed mid-cycle after a restart.
   * Null when this is a fresh cycle start. */
  resumedAtPosition: number | null;
}

let schedulerState: "idle" | "running" | "paused" = "idle";
let currentInstitutions: string[] = [];
let queueIndex = 0;
let completedThisCycle = 0;
let failedThisCycle = 0;
let skippedThisCycle = 0;
let freshSkippedThisCycle = 0;
let cycleStartedAt: Date | null = null;
let lastActivityAt: Date | null = null;
let schedulerTimer: ReturnType<typeof setTimeout> | null = null;
let cycleCount = 0;
let priorityQueue: string[] = [];
let syncDurations: number[] = [];
let lastCycleCompletedAt: Date | null = null;
let delayBetweenSyncsMs = 0;
/** Tier-sorted queue for the current cycle. Re-built at every cycle start.
 * Tier 1 (API/RSS) → Tier 2 (platform factory) → Tier 3 (bespoke HTML) → Tier 4 (Playwright). */
let tieredQueue: string[] = [];
/** Monotonically increasing. Incremented on every reset so in-flight batch
 * callbacks can detect they belong to a superseded cycle and no-op. */
let runGeneration = 0;
/** Set when the scheduler is running a tier-only scan. Null during full-cycle runs. */
let tierOnlyActive: number | null = null;
/** True when the scheduler is running a staleness-first (oldest-synced-first) scan. */
let stalenessFirstActive = false;
/** True when a T4 auto-pass was triggered by cycle completion (not a manual admin action).
 * Causes the cycle-complete handler to start the next T1-T3 cycle instead of going idle. */
let autoT4AfterCycle = false;
/** Queue position at which the scheduler resumed mid-cycle (set on resume, null on fresh start). */
let resumedAtPosition: number | null = null;
/** True when running a Daily Sweep — staleness-ordered, T3-complex sub-phase, completion report. */
let dailySweepActive = false;
/** True when the Daily Sweep has transitioned to the T3-complex sub-phase (concurrency=1, 3 retries). */
let dailySweepComplexPhase = false;
/** Concurrency cap override for the current sweep phase. Null = use getMaxHttpConcurrent(). */
let sweepConcurrencyOverride: number | null = null;

/** Institutions that run in the Daily Sweep's T3-complex phase: large catalogs,
 * slow detail-page fetching, or fragile ASP.NET pagination that warrants
 * sequential (concurrency=1) dispatch with 3 retries instead of 1. */
const COMPLEX_INSTITUTIONS = new Set<string>([
  "MIT",
  "Stanford University",
  "Harvard University",
  "UC Berkeley",
  "UC San Diego",
  "UC San Francisco",   // UCSF — createUCTechTransferScraper("SF", ...)
]);

/** Stats accumulated during a Daily Sweep for the completion report. */
interface SweepStats {
  startedAt: Date;
  emptyResponse: string[];   // institutions that returned rawCount=0 with prior DB data
  failed: string[];          // institutions that failed after all retries
  newAssets: number;         // total new assets found across the sweep
}

let scraperHealthCache: Map<string, ScraperHealthRow> = new Map();
let sweepStats: SweepStats | null = null;

interface AutoSweepStats {
  startedAt: Date;
  triggerLabel: string;
  newAssetsByInstitution: Map<string, number>;
  failed: string[];
}
let autoSweepStats: AutoSweepStats | null = null;
let autoSweepActive = false;

// Stamp complexity: "high" on scrapers in the COMPLEX_INSTITUTIONS set at module load.
// Uses the startup-stamp pattern (same as tier assignment in index.ts) to avoid
// mutating scraper definition files or adding build-time complexity.
for (const s of ALL_SCRAPERS) {
  if (COMPLEX_INSTITUTIONS.has(s.institution)) {
    s.complexity = "high";
  }
}

/** Timestamp of the last successful persistState DB write — used to throttle non-critical saves. */
let _lastPersistAt = 0;
const PERSIST_THROTTLE_MS = 5_000;

/** Tracks when each currently-running institution was dispatched (ms since epoch). */
const institutionDispatchedAt = new Map<string, number>();

/** Handle for the 90-second watchdog timer. */
let watchdogTimer: ReturnType<typeof setTimeout> | null = null;

/** Max wall-clock time per scraper type before the watchdog force-evicts (belt + suspenders).
 * http limit raised to 22 min to accommodate Stanford (scraperTimeoutMs = 20 min). */
const WATCHDOG_EVICT_MS: Record<string, number> = {
  playwright: 15 * 60 * 1000,
  api:        8 * 60 * 1000,
  http:      22 * 60 * 1000,
};

function startWatchdog() {
  if (watchdogTimer !== null) return;
  watchdogTimer = setTimeout(watchdogTick, 90_000);
}

function stopWatchdog() {
  if (watchdogTimer !== null) {
    clearTimeout(watchdogTimer);
    watchdogTimer = null;
  }
}

function watchdogTick() {
  watchdogTimer = null;
  if (schedulerState !== "running") return;
  const now = Date.now();
  let evicted = false;
  for (const institution of [...currentInstitutions]) {
    const dispatchedAt = institutionDispatchedAt.get(institution);
    if (!dispatchedAt) continue;
    const scraperType = getScraperType(institution);
    const maxMs = WATCHDOG_EVICT_MS[scraperType] ?? WATCHDOG_EVICT_MS.http;
    const elapsedMin = Math.round((now - dispatchedAt) / 60000);
    if (now - dispatchedAt > maxMs) {
      const reason = `watchdog eviction after ${elapsedMin}min (${scraperType} limit: ${maxMs / 60000}min)`;
      console.warn(`[scheduler] WATCHDOG: ${institution} stuck for ${elapsedMin} min (limit ${maxMs / 60000} min) — force-evicting`);
      currentInstitutions = currentInstitutions.filter((i) => i !== institution);
      institutionDispatchedAt.delete(institution);
      releaseSyncLock(institution);
      failedThisCycle++;
      evicted = true;
      // Update in-memory health cache so the UI reflects the eviction immediately.
      // Do NOT fire updateScraperHealth() here — runOne's async promise is still in
      // flight and will write the DB record when it settles. Writing from both paths
      // would double-increment consecutiveFailures.
      const current = scraperHealthCache.get(institution);
      const newFailures = (current?.consecutiveFailures ?? 0) + 1;
      scraperHealthCache.set(institution, {
        institution,
        consecutiveFailures: newFailures,
        lastFailureReason: reason,
        lastFailureAt: new Date(),
        lastSuccessAt: current?.lastSuccessAt ?? null,
        backoffUntil: newFailures >= 12 ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) :
                     newFailures >= 8  ? new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) :
                     newFailures >= 5  ? new Date(Date.now() + 24 * 60 * 60 * 1000) :
                     newFailures >= 3  ? new Date(Date.now() + 6 * 60 * 60 * 1000) :
                     (current?.backoffUntil ?? null),
        lastSuccessNewCount: current?.lastSuccessNewCount ?? null,
        lastSuccessRawCount: current?.lastSuccessRawCount ?? null,
        lastCompletedCycle: current?.lastCompletedCycle ?? null,
      });
    }
  }
  if (evicted) scheduleNext();
  watchdogTimer = setTimeout(watchdogTick, 90_000);
}

/** Returns the in-memory scraper health cache — no DB hit required. */
export function getScraperHealthCache(): Map<string, ScraperHealthRow> {
  return scraperHealthCache;
}

function buildTieredQueue(): string[] {
  const buckets: Record<1 | 2 | 3 | 4, string[]> = { 1: [], 2: [], 3: [], 4: [] };
  for (const s of ALL_SCRAPERS) {
    if (s.scraperType === "playwright" || s.scraperType === "manual" || s.scraperType === "stub") continue;
    const tier = getScraperTier(s.institution);
    buckets[tier].push(s.institution);
  }
  // T4 (Playwright) runs as a separate auto-pass after each full T1-T3 cycle completes,
  // eliminating the exclusive-drain stalls that T4 causes mid-cycle.
  return [...buckets[1], ...buckets[2], ...buckets[3]];
}

/** Build a queue sorted by lastSuccessAt ASC — never-synced institutions (epoch 0) first,
 * then oldest-last-synced, up to the most recently synced.
 * Playwright (T4) scrapers are excluded — they run as a dedicated auto-pass at cycle end
 * and must not appear at random positions mid-queue (they require exclusive drain).
 * Within identical timestamps (e.g., never-synced batch), tier ASC is used as a tiebreaker
 * so T1 API scrapers dispatch before T3 HTML scrapers, filling concurrent slots efficiently.
 * Must be called AFTER the scraperHealthCache is freshly loaded. */
function buildStalenessFirstQueue(): string[] {
  return [...ALL_SCRAPERS]
    .filter((s) => s.scraperType !== "playwright" && s.scraperType !== "manual" && s.scraperType !== "stub")
    .sort((a, b) => {
      const aAt = scraperHealthCache.get(a.institution)?.lastSuccessAt?.getTime() ?? 0;
      const bAt = scraperHealthCache.get(b.institution)?.lastSuccessAt?.getTime() ?? 0;
      if (aAt !== bAt) return aAt - bAt;
      return getScraperTier(a.institution) - getScraperTier(b.institution);
    })
    .map((s) => s.institution);
}

function getInstitutionQueue(): string[] {
  return tieredQueue.length > 0 ? tieredQueue : ALL_SCRAPERS.map((s) => s.institution);
}

function getScraperType(institution: string): "playwright" | "http" | "api" {
  const scraper = ALL_SCRAPERS.find((s) => s.institution === institution);
  const t = scraper?.scraperType ?? "http";
  return (t === "stub" || t === "manual" ? "http" : t) as "playwright" | "http" | "api";
}

function isInBackoff(institution: string): boolean {
  const health = scraperHealthCache.get(institution);
  if (!health?.backoffUntil) return false;
  return health.backoffUntil > new Date();
}

/** Returns true if the institution should be skipped:
 * 1. Already completed during the current full cycle (cycle-stamp gate) — always skip regardless
 *    of how many new assets it found; survives server restarts.
 * 2. Successfully synced within FRESH_THRESHOLD_MS with 0 new assets (freshness gate).
 * If rawCount was 0 the site may have been unreachable — never skip (conservative). */
function isFresh(institution: string): boolean {
  const health = scraperHealthCache.get(institution);
  if (!health?.lastSuccessAt) return false;
  // ── Cycle-stamp gate (full-cycle runs only) ─────────────────────────────────
  // Skip institutions already completed in the current cycle, regardless of new-asset count.
  // Only checked during full T1-T3 cycles (not tier-only or staleness-first scans).
  if (!tierOnlyActive && !stalenessFirstActive) {
    if (health.lastCompletedCycle !== null && health.lastCompletedCycle >= cycleCount) return true;
  }
  // ── Freshness gate ──────────────────────────────────────────────────────────
  const withinWindow = (Date.now() - health.lastSuccessAt.getTime()) < FRESH_THRESHOLD_MS;
  if (!withinWindow) return false;
  // lastSuccessNewCount === null means we don't know — don't skip (conservative)
  if (health.lastSuccessNewCount === null) return false;
  // Raw count of 0 means site returned nothing — could be blocked/unreachable, not truly fresh
  if (health.lastSuccessRawCount === 0) return false;
  return health.lastSuccessNewCount === 0;
}

/** Returns the lowest tier among all currently-running institutions (null if none running). */
function getMinRunningTier(): 1 | 2 | 3 | 4 | null {
  if (currentInstitutions.length === 0) return null;
  return currentInstitutions.reduce<1 | 2 | 3 | 4>(
    (min, inst) => {
      const t = getScraperTier(inst);
      return t < min ? t : min;
    },
    4
  );
}

/** Build the state snapshot to persist. */
function buildStateSnapshot() {
  return {
    queueIndex: Math.max(0, queueIndex - currentInstitutions.length),
    cycleCount,
    cycleStartedAt,
    completedThisCycle,
    failedThisCycle,
    lastCycleCompletedAt,
    schedulerRunning: schedulerState === "running",
    tierOnly: tierOnlyActive,
    // Both stalenessFirst and dailySweep rebuild from queueIndex=0 on restart (queue
    // order is in-memory only). The flag is persisted so the UI shows the correct mode
    // after restart and the cycle-complete handler fires the sweep report.
    stalenessFirst: stalenessFirstActive || dailySweepActive,
    autoSweepActive,
  };
}

/** Flush scheduler state to DB immediately, bypassing the 60-second throttle.
 * Returns a bare Promise from saveSchedulerState so callers (SIGTERM handler,
 * pause route) can detect DB write failures — unlike persistState which absorbs them. */
export function flushSchedulerState(): Promise<void> {
  _lastPersistAt = Date.now();
  return saveSchedulerState(buildStateSnapshot());
}

function persistState(immediate = false): Promise<void> {
  const now = Date.now();
  // Throttle routine per-institution saves to at most once per 60 seconds.
  // State-critical events (start, pause, cycle complete) always pass immediate=true.
  if (!immediate && now - _lastPersistAt < PERSIST_THROTTLE_MS) return Promise.resolve();
  _lastPersistAt = now;

  return saveSchedulerState(buildStateSnapshot());
}

export function getSchedulerStatus(): SchedulerStatus {
  const queue = getInstitutionQueue();
  const activeSyncs = getActiveSyncs();
  const remaining = Math.max(0, queue.length - queueIndex) + priorityQueue.length;
  const avgMs = syncDurations.length > 0
    ? Math.round(syncDurations.reduce((a, b) => a + b, 0) / syncDurations.length)
    : null;
  const slots = Math.min(getMaxHttpConcurrent(), Math.max(1, activeSyncs.length || 1));
  const estimatedRemainingMs = avgMs && remaining > 0
    ? Math.ceil(remaining / slots) * avgMs
    : null;

  let nextInst: string | null = null;
  if (priorityQueue.length > 0) {
    nextInst = priorityQueue[0];
  } else {
    for (let i = queueIndex; i < queue.length; i++) {
      const candidate = queue[i];
      if (!currentInstitutions.includes(candidate)) {
        nextInst = candidate;
        break;
      }
    }
  }

  const currentTier: 1 | 2 | 3 | 4 | null = getMinRunningTier();

  return {
    state: schedulerState,
    currentInstitution: currentInstitutions[0] ?? null,
    currentInstitutions: [...currentInstitutions],
    nextInstitution: nextInst,
    queuePosition: queueIndex,
    queueTotal: queue.length,
    completedThisCycle,
    failedThisCycle,
    skippedThisCycle,
    freshSkippedThisCycle,
    cycleStartedAt: cycleStartedAt?.toISOString() ?? null,
    lastActivityAt: lastActivityAt?.toISOString() ?? null,
    cycleCount,
    priorityQueue: [...priorityQueue],
    delayMs: delayBetweenSyncsMs,
    avgSyncMs: avgMs,
    estimatedRemainingMs,
    lastCycleCompletedAt: lastCycleCompletedAt?.toISOString() ?? null,
    concurrentSyncs: activeSyncs.length,
    maxConcurrency: getMaxHttpConcurrent(),
    currentTier,
    tierOnly: tierOnlyActive,
    stalenessFirst: stalenessFirstActive,
    dailySweep: dailySweepActive,
    dailySweepComplexPhase,
    autoSweepActive,
    resumedAtPosition,
  };
}

export function setDelay(ms: number): { ok: boolean; message: string } {
  if (ms < 0 || ms > 300_000) {
    return { ok: false, message: "Delay must be between 0ms and 300000ms" };
  }
  delayBetweenSyncsMs = ms;
  return { ok: true, message: `Delay set to ${ms}ms` };
}

export async function loadAndRestoreScheduler(): Promise<boolean> {
  try {
    // Ensure the scheduler_state table has the tier_only column (idempotent).
    await ensureSchedulerStateSchema();

    const cleaned = await storage.markRunningSessionsFailed();
    if (cleaned > 0) {
      console.log(`[scheduler] Cleaned up ${cleaned} interrupted session(s) from previous server instance`);
    }

    scraperHealthCache = await loadAllScraperHealth();
    console.log(`[scheduler] Loaded health data for ${scraperHealthCache.size} institutions`);

    const saved = await loadSchedulerState();
    if (!saved) {
      console.log("[scheduler] No saved state — scheduler will wait for manual Start");
      return false;
    }

    queueIndex = saved.queueIndex;
    cycleCount = saved.cycleCount;
    cycleStartedAt = saved.cycleStartedAt;
    completedThisCycle = saved.completedThisCycle;
    failedThisCycle = saved.failedThisCycle;
    lastCycleCompletedAt = saved.lastCycleCompletedAt;
    const wasRunning = saved.schedulerRunning;
    if (!wasRunning) {
      // Clean pause — preserve tier/staleness context so the admin can resume exactly where we left off.
      schedulerState = "paused";
      tierOnlyActive = saved.tierOnly ?? null;
      stalenessFirstActive = saved.stalenessFirst ?? false;
    } else {
      // Unclean shutdown (SIGTERM didn't complete its DB write). Drop any stale tier-only
      // or staleness-first context so that clicking "Start" begins a fresh full cycle rather
      // than silently resuming an abandoned scan the admin doesn't know about.
      //
      // IMPORTANT: only preserve queueIndex when the previous run was a full T1-T3 cycle.
      // If the crash happened during a tier-only or staleness-first scan, the saved queueIndex
      // belongs to that scan's queue — reusing it against the full-cycle queue would skip
      // the first N T1 institutions. Reset to 0 in that case.
      const crashedDuringFullCycle = saved.tierOnly === null && !saved.stalenessFirst;
      if (!crashedDuringFullCycle) {
        queueIndex = 0;
        console.log(
          `[scheduler] Unclean shutdown during ${saved.tierOnly != null ? `T${saved.tierOnly} scan` : "staleness-first scan"} — resetting position to 0 for safety (tier queue index can't map to full-cycle queue)`,
        );
      } else {
        // Full-cycle crash: keep queueIndex so cycle stamps can skip already-completed
        // institutions when the scheduler resumes at the saved position.
        console.log(
          `[scheduler] Unclean shutdown during full cycle — will resume at position ${saved.queueIndex}/${buildTieredQueue().length} on next Start (cycle stamps skip completed institutions)`,
        );
      }
      tierOnlyActive = null;
      stalenessFirstActive = false;
      autoT4AfterCycle = false;
    }
    // Rebuild the queue appropriate for the restored mode.
    if (tierOnlyActive !== null) {
      const tier = tierOnlyActive as 1 | 2 | 3 | 4;
      const buckets: Record<1 | 2 | 3 | 4, string[]> = { 1: [], 2: [], 3: [], 4: [] };
      for (const s of ALL_SCRAPERS) { const t = getScraperTier(s.institution); buckets[t].push(s.institution); }
      tieredQueue = buckets[tier];
      console.log(`[scheduler] Restored Tier-${tier} scan (clean pause): position ${queueIndex}/${tieredQueue.length}`);
    } else if (stalenessFirstActive) {
      // Server restart: the original in-memory queue order is gone and cannot be
      // recovered from DB. Rebuild from scratch (queueIndex=0) — this retries any
      // institutions that completed before the restart, but guarantees every
      // institution is visited in the correct staleness order with no skips.
      tieredQueue = buildStalenessFirstQueue();
      queueIndex = 0;
      console.log(`[scheduler] Restored staleness-first scan after restart — rebuilding from scratch: ${tieredQueue.length} institutions (original position lost)`);
      // If this was a cron-triggered auto-sweep, restore the flag so the completion
      // email still fires when this cycle ends, even after a server crash mid-run.
      if (saved.autoSweepActive) {
        autoSweepActive = true;
        autoSweepStats = {
          startedAt: saved.cycleStartedAt ?? new Date(),
          triggerLabel: "Scheduled (recovered)",
          newAssetsByInstitution: new Map(),
          failed: [],
        };
        console.log(`[scheduler] Restored autoSweepActive=true — completion email will fire when cycle ends`);
      }
    } else {
      tieredQueue = buildTieredQueue();
      console.log(`[scheduler] Restored state: cycle #${cycleCount}, position ${queueIndex}/${tieredQueue.length}, was ${wasRunning ? "running (unclean shutdown — mode context cleared)" : "paused"}`);
    }
    return wasRunning;
  } catch (err: any) {
    console.warn(`[scheduler] Failed to restore state: ${err?.message}`);
    return false;
  }
}

export function startScheduler(): { ok: boolean; message: string } {
  if (schedulerState === "running") {
    return { ok: false, message: "Scheduler is already running" };
  }
  if (isIngestionRunning()) {
    return { ok: false, message: "Full ingestion pipeline is running — wait for it to finish" };
  }
  schedulerState = "running";
  persistState(true).catch(() => {});

  if (cycleStartedAt && queueIndex < getInstitutionQueue().length) {
    // Resuming a paused or post-crash run. Rebuild the appropriate queue for the current mode.
    if (tierOnlyActive !== null) {
      const tier = tierOnlyActive as 1 | 2 | 3 | 4;
      const buckets: Record<1 | 2 | 3 | 4, string[]> = { 1: [], 2: [], 3: [], 4: [] };
      for (const s of ALL_SCRAPERS) { const t = getScraperTier(s.institution); buckets[t].push(s.institution); }
      tieredQueue = buckets[tier];
      resumedAtPosition = queueIndex;
      console.log(`[scheduler] Resumed Tier-${tier} scan at position ${queueIndex}/${tieredQueue.length} (cycle #${cycleCount})`);
    } else if (stalenessFirstActive) {
      // Do NOT rebuild the queue here — the in-memory tieredQueue still holds the
      // original sort order from when the scan started. Re-sorting would change
      // order (some lastSuccessAt values have updated mid-scan) and cause the
      // existing queueIndex to land at the wrong position.
      resumedAtPosition = queueIndex;
      console.log(`[scheduler] Resumed staleness-first scan at position ${queueIndex}/${tieredQueue.length} (cycle #${cycleCount})`);
    } else {
      resumedAtPosition = queueIndex;
      console.log(`[scheduler] Resumed cycle #${cycleCount} at position ${queueIndex}/${getInstitutionQueue().length} (cycle stamps will skip already-completed institutions)`);
    }
  } else {
    tieredQueue = buildTieredQueue();
    tierOnlyActive = null;
    stalenessFirstActive = false;
    autoT4AfterCycle = false;
    resumedAtPosition = null;
    queueIndex = 0;
    completedThisCycle = 0;
    failedThisCycle = 0;
    skippedThisCycle = 0;
    freshSkippedThisCycle = 0;
    cycleStartedAt = new Date();
    cycleCount++;
    console.log(`[scheduler] Started cycle #${cycleCount} — ${tieredQueue.length} institutions (T1→T2→T3, up to ${getMaxHttpConcurrent()} concurrent per tier; T4 auto-pass after cycle)`);
  }

  loadAllScraperHealth().then((h) => { scraperHealthCache = new Map(h); }).catch(() => {});
  startWatchdog();
  scheduleNext();
  return { ok: true, message: "Scheduler started" };
}

export function resetAndStartScheduler(): { ok: boolean; message: string } {
  if (isIngestionRunning()) {
    return { ok: false, message: "Full ingestion pipeline is running — wait for it to finish" };
  }
  runGeneration++;
  if (schedulerTimer) {
    clearTimeout(schedulerTimer);
    schedulerTimer = null;
  }
  tieredQueue = buildTieredQueue();
  tierOnlyActive = null;
  stalenessFirstActive = false;
  autoT4AfterCycle = false;
  resumedAtPosition = null;
  queueIndex = 0;
  completedThisCycle = 0;
  failedThisCycle = 0;
  skippedThisCycle = 0;
  freshSkippedThisCycle = 0;
  currentInstitutions = [];
  lastActivityAt = null;
  cycleStartedAt = new Date();
  cycleCount++;
  priorityQueue = [];
  institutionDispatchedAt.clear();
  schedulerState = "running";
  persistState(true).catch(() => {});
  console.log(`[scheduler] Reset (gen=${runGeneration}) — starting fresh cycle #${cycleCount} from position 0/${tieredQueue.length}`);
  loadAllScraperHealth().then((h) => { scraperHealthCache = new Map(h); }).catch(() => {});
  startWatchdog();
  scheduleNext();
  return { ok: true, message: `Started fresh cycle #${cycleCount}` };
}

export async function pauseScheduler(): Promise<{ ok: boolean; message: string }> {
  if (schedulerState !== "running") {
    return { ok: false, message: "Scheduler is not running" };
  }
  schedulerState = "paused";
  stopWatchdog();
  if (schedulerTimer) {
    clearTimeout(schedulerTimer);
    schedulerTimer = null;
  }
  // Await the DB write before returning so the HTTP route handler only sends 200
  // after schedulerRunning=false is durably committed to Supabase.
  // Uses flushSchedulerState() (bare saveSchedulerState Promise, no error swallow)
  // so the caller can detect and surface a DB failure.
  await flushSchedulerState();
  console.log(`[scheduler] Paused at position ${queueIndex}/${getInstitutionQueue().length}`);
  return { ok: true, message: "Scheduler paused" };
}

export function startTierOnly(tier: 1 | 2 | 3 | 4): { ok: boolean; message: string } {
  if (isIngestionRunning()) {
    return { ok: false, message: "Full ingestion pipeline is running — wait for it to finish" };
  }
  runGeneration++;
  if (schedulerTimer) {
    clearTimeout(schedulerTimer);
    schedulerTimer = null;
  }
  const buckets: Record<1 | 2 | 3 | 4, string[]> = { 1: [], 2: [], 3: [], 4: [] };
  for (const s of ALL_SCRAPERS) {
    if (s.scraperType === "manual" || s.scraperType === "stub") continue;
    const t = getScraperTier(s.institution);
    buckets[t].push(s.institution);
  }
  tieredQueue = buckets[tier];
  queueIndex = 0;
  completedThisCycle = 0;
  failedThisCycle = 0;
  skippedThisCycle = 0;
  freshSkippedThisCycle = 0;
  currentInstitutions = [];
  lastActivityAt = null;
  cycleStartedAt = new Date();
  cycleCount++;
  priorityQueue = [];
  institutionDispatchedAt.clear();
  schedulerState = "running";
  tierOnlyActive = tier;
  stalenessFirstActive = false;
  autoT4AfterCycle = false; // manual tier scan — never auto-continue after
  resumedAtPosition = null;
  persistState().catch(() => {});
  console.log(`[scheduler] Tier-${tier} only scan (gen=${runGeneration}) — ${tieredQueue.length} institutions`);
  loadAllScraperHealth().then((h) => { scraperHealthCache = new Map(h); }).catch(() => {});
  startWatchdog();
  scheduleNext();

  // Safety drain-poll: if syncs from the prior generation are still running,
  // scheduleNext() above may immediately stall (liveCount > 0 from old gen).
  // Old-gen runOne() finally blocks no-op on gen mismatch, so they won't
  // re-trigger scheduleNext for the new gen. Poll until they drain, then re-kick.
  const capturedGen = runGeneration;
  const priorActiveSyncs = getActiveSyncs().length;
  if (priorActiveSyncs > 0) {
    const pollForDrain = () => {
      if (runGeneration !== capturedGen) return; // superseded by another start
      if (getActiveSyncs().length === 0) {
        scheduleNext();
      } else {
        setTimeout(pollForDrain, 2_000);
      }
    };
    setTimeout(pollForDrain, 2_000);
  }

  return { ok: true, message: `Tier ${tier} scan started — ${tieredQueue.length} institutions` };
}

/** Start a staleness-first scan: sorts all institutions by lastSuccessAt ASC (oldest/never-synced
 * first) and runs through them in that order. One-shot — goes idle when complete. */
export async function startStalenessFirstScan(): Promise<{ ok: boolean; message: string }> {
  if (isIngestionRunning()) {
    return { ok: false, message: "Full ingestion pipeline is running — wait for it to finish" };
  }
  // Reload health data synchronously so the sort reflects the latest DB state.
  scraperHealthCache = await loadAllScraperHealth();

  runGeneration++;
  if (schedulerTimer) {
    clearTimeout(schedulerTimer);
    schedulerTimer = null;
  }
  tieredQueue = buildStalenessFirstQueue();
  queueIndex = 0;
  completedThisCycle = 0;
  failedThisCycle = 0;
  skippedThisCycle = 0;
  freshSkippedThisCycle = 0;
  currentInstitutions = [];
  lastActivityAt = null;
  cycleStartedAt = new Date();
  cycleCount++;
  priorityQueue = [];
  institutionDispatchedAt.clear();
  schedulerState = "running";
  tierOnlyActive = null;
  stalenessFirstActive = true;
  autoT4AfterCycle = false;
  resumedAtPosition = null;
  persistState().catch(() => {});
  console.log(`[scheduler] Staleness-first scan (gen=${runGeneration}) — ${tieredQueue.length} institutions, oldest-synced first`);
  startWatchdog();
  scheduleNext();

  // Safety drain-poll: if syncs from the prior generation are still running,
  // scheduleNext() above may immediately stall. Poll until they drain, then re-kick.
  const capturedGen = runGeneration;
  const priorActiveSyncs = getActiveSyncs().length;
  if (priorActiveSyncs > 0) {
    const pollForDrain = () => {
      if (runGeneration !== capturedGen) return;
      if (getActiveSyncs().length === 0) {
        scheduleNext();
      } else {
        setTimeout(pollForDrain, 2_000);
      }
    };
    setTimeout(pollForDrain, 2_000);
  }

  return { ok: true, message: `Staleness-first scan started — ${tieredQueue.length} institutions (oldest-synced first)` };
}

/** Start a Daily Sweep — the recommended mode for reliable daily operation.
 *
 * Phase ordering:
 *   1. All T1+T2+T3 institutions sorted staleness-first (oldest-synced first), Playwright excluded.
 *      Standard T3 institutions run at normal concurrency.
 *   2. When the last non-complex institution is dispatched, sweepConcurrencyOverride drops to 1
 *      and complex institutions (MIT, Stanford, Harvard, UC Berkeley, UC San Diego, UCSF) run
 *      sequentially with 3 retries each (dailySweepComplexPhase = true).
 *   3. T4 auto-pass fires 2 minutes after Phase 2 completes (existing auto-T4 logic).
 *   4. On full cycle completion, sendDailySweepReport() fires to the admin email list.
 *
 * On server restart mid-sweep, rebuilds from queueIndex=0 (staleness-first queue is in-memory only).
 */
export async function startDailySweep(): Promise<{ ok: boolean; message: string }> {
  if (isIngestionRunning()) {
    return { ok: false, message: "Full ingestion pipeline is running — wait for it to finish" };
  }
  // Reload health data so the staleness sort reflects the latest DB state.
  scraperHealthCache = await loadAllScraperHealth();

  runGeneration++;
  if (schedulerTimer) { clearTimeout(schedulerTimer); schedulerTimer = null; }

  // Build queue: staleness-ordered, T4 excluded, complex institutions placed LAST within their
  // staleness group so they naturally run after standard T3 (they also have the oldest timestamps,
  // but the explicit separation ensures the concurrency override is applied correctly).
  const standardQueue = buildStalenessFirstQueue().filter(
    (inst) => !COMPLEX_INSTITUTIONS.has(inst)
  );
  const complexQueue = buildStalenessFirstQueue().filter(
    (inst) => COMPLEX_INSTITUTIONS.has(inst)
  );
  tieredQueue = [...standardQueue, ...complexQueue];

  queueIndex = 0;
  completedThisCycle = 0;
  failedThisCycle = 0;
  skippedThisCycle = 0;
  freshSkippedThisCycle = 0;
  currentInstitutions = [];
  lastActivityAt = null;
  cycleStartedAt = new Date();
  cycleCount++;
  priorityQueue = [];
  institutionDispatchedAt.clear();
  schedulerState = "running";
  tierOnlyActive = null;
  stalenessFirstActive = false;
  dailySweepActive = true;
  dailySweepComplexPhase = false;
  sweepConcurrencyOverride = null;
  autoT4AfterCycle = false;
  resumedAtPosition = null;
  sweepStats = { startedAt: cycleStartedAt, emptyResponse: [], failed: [], newAssets: 0 };

  persistState().catch(() => {});
  console.log(
    `[scheduler] Daily Sweep started (gen=${runGeneration}) — ` +
    `${standardQueue.length} standard + ${complexQueue.length} complex institutions, oldest-synced first`
  );
  loadAllScraperHealth().then((h) => { scraperHealthCache = new Map(h); }).catch(() => {});
  startWatchdog();
  scheduleNext();

  const capturedGen = runGeneration;
  const priorActiveSyncs = getActiveSyncs().length;
  if (priorActiveSyncs > 0) {
    const pollForDrain = () => {
      if (runGeneration !== capturedGen) return;
      if (getActiveSyncs().length === 0) { scheduleNext(); } else { setTimeout(pollForDrain, 2_000); }
    };
    setTimeout(pollForDrain, 2_000);
  }

  return { ok: true, message: `Daily Sweep started — ${tieredQueue.length} institutions (${complexQueue.length} complex at end)` };
}

export function invalidateHealthCacheEntry(
  institution: string,
  successData?: { newCount?: number; rawCount?: number },
): void {
  const existing = scraperHealthCache.get(institution);
  if (existing) {
    scraperHealthCache.set(institution, {
      ...existing,
      consecutiveFailures: 0,
      backoffUntil: null,
      lastFailureReason: null,
      lastFailureAt: null,
      ...(successData !== undefined
        ? {
            lastSuccessAt: new Date(),
            lastSuccessNewCount: successData.newCount ?? null,
            lastSuccessRawCount: successData.rawCount ?? null,
          }
        : {}),
    });
  } else if (successData !== undefined) {
    scraperHealthCache.set(institution, {
      institution,
      consecutiveFailures: 0,
      backoffUntil: null,
      lastFailureReason: null,
      lastFailureAt: null,
      lastSuccessAt: new Date(),
      lastSuccessNewCount: successData.newCount ?? null,
      lastSuccessRawCount: successData.rawCount ?? null,
      lastCompletedCycle: null,
    });
  }
}

export function bumpToFront(institution: string): { ok: boolean; message: string } {
  const queue = getInstitutionQueue();
  if (!queue.includes(institution)) {
    return { ok: false, message: `Institution "${institution}" not found in scraper list` };
  }
  if (!priorityQueue.includes(institution)) {
    priorityQueue.push(institution);
  }
  return { ok: true, message: `${institution} added to priority queue` };
}

export function cancelCurrentSync(institution: string): void {
  if (!currentInstitutions.includes(institution)) return;
  currentInstitutions = currentInstitutions.filter((i) => i !== institution);
  scheduleNext();
}

function scheduleNext(): void {
  if (schedulerState !== "running") return;

  const gen = runGeneration;

  if (isIngestionRunning()) {
    schedulerTimer = setTimeout(() => scheduleNext(), 10_000);
    return;
  }

  // ── Priority queue: fill available slots from priority queue first ─────────
  while (priorityQueue.length > 0) {
    const institution = priorityQueue[0];

    // Skip institutions already running — drop silently rather than spin.
    if (currentInstitutions.includes(institution)) {
      priorityQueue.shift();
      continue;
    }

    const scraperType = getScraperType(institution);
    const institutionTier = getScraperTier(institution);
    const liveCount = getActiveSyncs().length;

    if (scraperType === "playwright" && liveCount > 0) break;
    if (scraperType !== "playwright" && liveCount >= getMaxHttpConcurrent()) break;

    // Respect tier boundary: don't dispatch a higher-tier priority item while
    // a lower-tier batch is still running.
    const minRunning = getMinRunningTier();
    if (minRunning !== null && institutionTier > minRunning) break;

    priorityQueue.shift();
    const syncStart = Date.now();
    currentInstitutions = scraperType === "playwright"
      ? [institution]
      : [...currentInstitutions, institution];
    institutionDispatchedAt.set(institution, syncStart);

    console.log(`[scheduler] [priority] [T${getScraperTier(institution)}/${scraperType}] ${institution}`);

    runOne(institution, gen).finally(() => {
      if (runGeneration !== gen) return;
      syncDurations.push(Date.now() - syncStart);
      if (syncDurations.length > 20) syncDurations.shift();
      currentInstitutions = currentInstitutions.filter((i) => i !== institution);
      institutionDispatchedAt.delete(institution);
      lastActivityAt = new Date();
      persistState().catch(() => {});
      scheduleNext();
    });

    if (scraperType === "playwright") return;
  }

  const queue = getInstitutionQueue();

  // ── Main queue: tier-bounded concurrent dispatch (T1→T2→T3→T4 strict order) ─
  while (queueIndex < queue.length) {
    const institution = queue[queueIndex];
    const scraperType = getScraperType(institution);
    const liveCount = getActiveSyncs().length;
    const institutionTier = getScraperTier(institution);

    // ── Playwright / Tier 4: exclusive — wait for all other syncs to finish ───
    if (scraperType === "playwright") {
      if (liveCount > 0) break;  // wait for all other tiers to drain

      queueIndex++;
      const syncStart = Date.now();
      currentInstitutions = [institution];
      institutionDispatchedAt.set(institution, syncStart);
      console.log(`[scheduler] [T4/playwright] ${institution} (${queueIndex}/${queue.length})`);

      runOne(institution, gen).finally(() => {
        if (runGeneration !== gen) return;
        syncDurations.push(Date.now() - syncStart);
        if (syncDurations.length > 20) syncDurations.shift();
        currentInstitutions = [];
        institutionDispatchedAt.delete(institution);
        lastActivityAt = new Date();
        persistState().catch(() => {});
        scheduleNext();
      });

      return;  // playwright runs exclusively; re-enter scheduleNext after it finishes
    }

    // ── Tier boundary enforcement ─────────────────────────────────────────────
    // Don't start a higher tier until ALL institutions of the current running tier
    // have completed. The minimum running tier is the "active batch tier".
    const minRunningTier = getMinRunningTier();
    if (minRunningTier !== null && institutionTier > minRunningTier) {
      // Running batch is a lower tier than what we want to dispatch next.
      // Wait for it to drain before advancing to the next tier.
      break;
    }

    // ── Daily Sweep: detect transition into T3-complex sub-phase ─────────────
    // When we reach a complex institution for the first time, all standard institutions
    // have been dispatched. Drop concurrency to 1 so complex scrapers run sequentially.
    if (dailySweepActive && !dailySweepComplexPhase && COMPLEX_INSTITUTIONS.has(institution)) {
      // Wait for all currently-running standard syncs to drain before starting complex phase.
      if (liveCount > 0) break;
      dailySweepComplexPhase = true;
      sweepConcurrencyOverride = 1;
      console.log(`[scheduler] Daily Sweep: entering T3-complex phase — ${COMPLEX_INSTITUTIONS.size} institutions, concurrency=1, 3 retries`);
    }

    // ── Concurrent limit for HTTP/API scrapers ────────────────────────────────
    const effectiveConcurrency = sweepConcurrencyOverride ?? getMaxHttpConcurrent();
    if (liveCount >= effectiveConcurrency) break;

    // ── Staleness gate (skipped during staleness-first scan — visit all) ──────
    if (!stalenessFirstActive && isFresh(institution)) {
      queueIndex++;
      freshSkippedThisCycle++;
      continue;
    }

    // ── Backoff gate (skipped during staleness-first scan — visit all) ────────
    if (!stalenessFirstActive && isInBackoff(institution)) {
      queueIndex++;
      skippedThisCycle++;
      continue;
    }

    // ── Dispatch ──────────────────────────────────────────────────────────────
    queueIndex++;
    const syncStart = Date.now();
    currentInstitutions = [...currentInstitutions, institution];
    institutionDispatchedAt.set(institution, syncStart);
    const complexLabel = dailySweepComplexPhase ? " [complex]" : "";
    console.log(`[scheduler] [T${institutionTier}/${scraperType}]${complexLabel} ${institution} (${queueIndex}/${queue.length})`);

    runOne(institution, gen).finally(() => {
      if (runGeneration !== gen) return;
      syncDurations.push(Date.now() - syncStart);
      if (syncDurations.length > 20) syncDurations.shift();
      currentInstitutions = currentInstitutions.filter((i) => i !== institution);
      institutionDispatchedAt.delete(institution);
      lastActivityAt = new Date();
      persistState().catch(() => {});
      scheduleNext();  // fill freed slot immediately; tier boundary re-evaluated
    });
    // Continue loop to fill remaining concurrent slots within the same tier
  }

  // ── Cycle completion check ─────────────────────────────────────────────────
  if (queueIndex >= queue.length && getActiveSyncs().length === 0 && priorityQueue.length === 0) {
    console.log(
      `[scheduler] Cycle #${cycleCount} complete — ${completedThisCycle} ok, ` +
      `${failedThisCycle} failed, ${freshSkippedThisCycle} fresh-skipped (last 4h, 0 new assets), ` +
      `${skippedThisCycle} backoff-skipped.`
    );
    lastCycleCompletedAt = new Date();
    currentInstitutions = [];
    loadAllScraperHealth().then((h) => { scraperHealthCache = new Map(h); }).catch(() => {});
    // Evaluate all user alert subscriptions once per cycle — avoids per-institution
    // race conditions on the lastAlertSentAt watermark.
    checkAndSendAlerts().catch((err: any) => {
      console.error(`[scheduler] Alert email error after cycle #${cycleCount}:`, err?.message);
    });

    if (tierOnlyActive !== null || stalenessFirstActive || dailySweepActive) {
      // ── Tier-only / staleness-first / daily-sweep: check if this is an auto T4 pass ─
      const wasAutoT4 = tierOnlyActive === 4 && autoT4AfterCycle;
      const wasDailySweep = dailySweepActive;
      autoT4AfterCycle = false;
      tierOnlyActive = null;
      stalenessFirstActive = false;
      dailySweepActive = false;
      dailySweepComplexPhase = false;
      sweepConcurrencyOverride = null;

      if (wasAutoT4 && wasDailySweep) {
        // Daily Sweep T4 auto-pass complete — fire completion report, then go idle.
        const capturedStats = sweepStats;
        sweepStats = null;
        schedulerState = "idle";
        persistState(true).catch(() => {});
        if (capturedStats) {
          sendDailySweepReport(capturedStats).catch((err: any) => {
            console.error(`[scheduler] Daily Sweep report email failed: ${err?.message}`);
          });
        }
      } else if (wasAutoT4) {
        // Regular auto-T4 pass complete — start the next full T1-T3 cycle after a 2-min cooldown.
        const capturedGenAfterT4 = runGeneration;
        tieredQueue = buildTieredQueue();
        queueIndex = 0;
        completedThisCycle = 0;
        failedThisCycle = 0;
        skippedThisCycle = 0;
        freshSkippedThisCycle = 0;
        cycleStartedAt = new Date();
        resumedAtPosition = null;
        cycleCount++;
        console.log(`[scheduler] T4 auto-pass complete — starting T1-T3 cycle #${cycleCount} in 2 min (${tieredQueue.length} institutions)`);
        persistState(true).catch(() => {});
        schedulerTimer = setTimeout(() => {
          if (runGeneration !== capturedGenAfterT4) return;
          scheduleNext();
        }, 2 * 60 * 1000);
      } else {
        // Manual tier-only, staleness-first, or daily-sweep phase 1 complete — go idle.
        schedulerState = "idle";
        persistState(true).catch(() => {});
        if (autoSweepActive && autoSweepStats) {
          const capturedAutoStats = autoSweepStats;
          autoSweepStats = null;
          autoSweepActive = false;
          sendAutoSweepReport(capturedAutoStats).catch((err: any) => {
            console.error(`[scheduler] Auto-sweep report email failed: ${err?.message}`);
          });
        }
      }
    } else {
      // ── Full T1-T3 cycle complete — trigger auto T4 pass, then next cycle ─
      const completedCycleNum = cycleCount;
      const capturedGenForT4 = runGeneration;
      const wasDailySweepForT4 = dailySweepActive; // carry through to T4 completion handler
      autoT4AfterCycle = true;
      resumedAtPosition = null;
      console.log(
        `[scheduler] T1-T3 cycle #${completedCycleNum} complete — ${completedThisCycle} ok, ` +
        `${failedThisCycle} failed, ${freshSkippedThisCycle} fresh/stamp-skipped, ` +
        `${skippedThisCycle} backoff-skipped — T4 auto-pass in 2 min`,
      );
      persistState(true).catch(() => {});
      schedulerTimer = setTimeout(() => {
        if (runGeneration !== capturedGenForT4) return; // scheduler was reset
        // ── Start T4 auto-pass (inline mirror of startTierOnly(4) with autoT4AfterCycle=true) ──
        runGeneration++;
        if (schedulerTimer) { clearTimeout(schedulerTimer); schedulerTimer = null; }
        const t4Buckets: Record<1 | 2 | 3 | 4, string[]> = { 1: [], 2: [], 3: [], 4: [] };
        for (const s of ALL_SCRAPERS) { const t = getScraperTier(s.institution); t4Buckets[t].push(s.institution); }
        tieredQueue = t4Buckets[4];
        queueIndex = 0;
        completedThisCycle = 0;
        failedThisCycle = 0;
        skippedThisCycle = 0;
        freshSkippedThisCycle = 0;
        currentInstitutions = [];
        lastActivityAt = null;
        cycleStartedAt = new Date();
        cycleCount++;
        priorityQueue = [];
        institutionDispatchedAt.clear();
        schedulerState = "running";
        tierOnlyActive = 4;
        stalenessFirstActive = false;
        dailySweepActive = wasDailySweepForT4; // preserve so completion handler fires report
        dailySweepComplexPhase = false;
        sweepConcurrencyOverride = null;
        autoT4AfterCycle = true; // set AFTER startTierOnly-equivalent so it isn't cleared
        resumedAtPosition = null;
        persistState().catch(() => {});
        loadAllScraperHealth().then((h) => { scraperHealthCache = new Map(h); }).catch(() => {});
        console.log(`[scheduler] Auto-T4 pass started (cycle #${cycleCount}) — ${tieredQueue.length} Playwright institutions`);
        startWatchdog();
        scheduleNext();
      }, 2 * 60 * 1000);
    }
  }
}

/** Run a one-shot T4 (Playwright) pass independently of the main T1-T3 cycle.
 * This is the same as `startTierOnly(4)` — exposed as a distinct export for clarity.
 * Called automatically after each full T1-T3 cycle, or manually from the admin panel. */
export function startT4Pass(): { ok: boolean; message: string } {
  return startTierOnly(4);
}

/** Returns true when the error comes from the database connection pool being exhausted,
 * the Supabase connection being dropped, or our own server restarting mid-sync —
 * NOT from the target website failing.
 * These are transient infrastructure blips and must NOT count as scraper failures or
 * increment consecutiveFailures, which would trigger multi-day backoff.
 * Exported so the manual sync route can apply the same guard. */
export function isTransientDbError(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes("connection failure") ||
    m.includes("connection timeout") ||
    m.includes("connectiontimeout") ||
    m.includes("connection may be broken") ||
    m.includes("connection terminated") ||
    m.includes("terminating connection") ||
    m.includes("econnreset") ||
    m.includes("econnrefused") ||
    m.includes("pool") ||
    m.includes("during authentication") ||
    m.includes("client checkout timed out") ||
    m.includes("server restarted during sync") ||
    m.includes("scraper failed: scraper failed: server restarted") ||
    m.includes("markrunningsessionsfailed") ||
    m.includes("too many clients") ||
    m.includes("remaining connection slots") ||
    m.includes("idle-in-transaction") ||
    m.includes("query_canceled") ||
    m.includes("statement timeout") ||
    m.includes("connection refused") ||
    m.includes("socket hang up") ||
    m.includes("network socket disconnected") ||
    m.includes("read econnreset") ||
    m.includes("write econnreset")
  );
}

async function sendDailySweepReport(stats: SweepStats): Promise<void> {
  const recipients = getAdminNotificationRecipients();
  if (recipients.length === 0) return;

  const durationMs = Date.now() - stats.startedAt.getTime();
  const durationHours = Math.floor(durationMs / 3_600_000);
  const durationMins = Math.floor((durationMs % 3_600_000) / 60_000);
  const durationLabel = durationHours > 0
    ? `${durationHours}h ${durationMins}m`
    : `${durationMins}m`;

  const totalAttempted = completedThisCycle + failedThisCycle;
  const subject = `EdenRadar Daily Sweep — ${completedThisCycle} synced, ${stats.emptyResponse.length} empty, ${stats.failed.length} failed`;

  const emptyRows = stats.emptyResponse.length > 0
    ? stats.emptyResponse.map((inst) => `<tr><td style="padding:4px 8px">⚠️</td><td style="padding:4px 8px">${inst}</td><td style="padding:4px 8px;color:#b45309">Empty response</td></tr>`).join("")
    : `<tr><td colspan="3" style="padding:4px 8px;color:#6b7280">None</td></tr>`;

  const failedRows = stats.failed.length > 0
    ? stats.failed.map((inst) => `<tr><td style="padding:4px 8px">✗</td><td style="padding:4px 8px">${inst}</td><td style="padding:4px 8px;color:#dc2626">Failed</td></tr>`).join("")
    : `<tr><td colspan="3" style="padding:4px 8px;color:#6b7280">None</td></tr>`;

  const html = `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto">
  <h2 style="color:#1d4ed8">EdenRadar Daily Sweep Complete</h2>
  <p style="color:#6b7280;font-size:14px">Completed in ${durationLabel} · ${new Date().toUTCString()}</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0;background:#f8fafc;border-radius:8px">
    <tr>
      <td style="padding:12px 16px;font-size:28px;font-weight:700;color:#16a34a">${completedThisCycle}</td>
      <td style="padding:12px 16px;font-size:28px;font-weight:700;color:#b45309">${stats.emptyResponse.length}</td>
      <td style="padding:12px 16px;font-size:28px;font-weight:700;color:#dc2626">${stats.failed.length}</td>
      <td style="padding:12px 16px;font-size:28px;font-weight:700;color:#7c3aed">${stats.newAssets.toLocaleString()}</td>
    </tr>
    <tr>
      <td style="padding:0 16px 12px;font-size:12px;color:#6b7280">Synced</td>
      <td style="padding:0 16px 12px;font-size:12px;color:#6b7280">Empty response</td>
      <td style="padding:0 16px 12px;font-size:12px;color:#6b7280">Failed</td>
      <td style="padding:0 16px 12px;font-size:12px;color:#6b7280">New assets</td>
    </tr>
  </table>
  <h3 style="margin-top:24px;color:#374151">Needs attention</h3>
  <table style="width:100%;border-collapse:collapse;font-size:14px">
    ${emptyRows}${failedRows}
  </table>
  <p style="margin-top:24px;font-size:12px;color:#9ca3af">
    Backoff-skipped: ${skippedThisCycle} · Fresh-skipped: ${freshSkippedThisCycle} · Total attempted: ${totalAttempted}
  </p>
</div>`;

  for (const recipient of recipients) {
    await sendEmail(recipient, subject, html, FROM_DIGEST).catch((err: any) => {
      console.error(`[scheduler] Sweep report email to ${recipient} failed: ${err?.message}`);
    });
  }
  console.log(`[scheduler] Daily Sweep report sent to ${recipients.length} admin(s)`);
}

async function sendAutoSweepReport(stats: AutoSweepStats): Promise<void> {
  const AUTO_SWEEP_EMAIL = process.env.AUTO_SWEEP_REPORT_EMAIL ?? "richardelles@gmail.com";
  const durationMs = Date.now() - stats.startedAt.getTime();
  const durationHours = Math.floor(durationMs / 3_600_000);
  const durationMins = Math.floor((durationMs % 3_600_000) / 60_000);
  const durationLabel = durationHours > 0 ? `${durationHours}h ${durationMins}m` : `${durationMins}m`;

  const totalNew = [...stats.newAssetsByInstitution.values()].reduce((a, b) => a + b, 0);
  const succeeded = completedThisCycle;
  const failed = stats.failed.length;

  const subject = `EdenRadar sweep done (${stats.triggerLabel}) — ${totalNew} new asset${totalNew !== 1 ? "s" : ""}, ${succeeded} synced, ${failed} failed`;

  const newRows = stats.newAssetsByInstitution.size > 0
    ? [...stats.newAssetsByInstitution.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([inst, count]) =>
          `<tr>
            <td style="padding:5px 12px;font-size:13px;color:#111827">${inst}</td>
            <td style="padding:5px 12px;font-size:13px;font-weight:700;color:#059669;text-align:right">+${count}</td>
          </tr>`
        ).join("")
    : `<tr><td colspan="2" style="padding:5px 12px;font-size:13px;color:#6b7280">No new assets this sweep</td></tr>`;

  const failedRows = stats.failed.length > 0
    ? stats.failed.map((inst) =>
        `<tr><td style="padding:4px 12px;font-size:13px;color:#dc2626">✗ ${inst}</td></tr>`
      ).join("")
    : `<tr><td style="padding:4px 12px;font-size:13px;color:#6b7280">None</td></tr>`;

  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;color:#111827">
  <div style="background:#f0fdf4;border:1px solid #a7f3d0;border-radius:10px;padding:20px 24px;margin-bottom:20px">
    <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#059669;text-transform:uppercase;letter-spacing:0.06em">EdenRadar Auto-Sweep</p>
    <h2 style="margin:0 0 4px;font-size:22px;font-weight:800;color:#111827">${stats.triggerLabel} scan complete</h2>
    <p style="margin:0;font-size:13px;color:#6b7280">Finished in ${durationLabel} &middot; ${new Date().toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric", hour:"2-digit", minute:"2-digit", timeZone:"America/Los_Angeles" })} PT</p>
  </div>

  <table style="width:100%;border-collapse:collapse;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:20px">
    <tr>
      <td style="padding:14px 16px;text-align:center">
        <div style="font-size:28px;font-weight:800;color:#059669">${succeeded}</div>
        <div style="font-size:11px;color:#6b7280;margin-top:2px">Synced</div>
      </td>
      <td style="padding:14px 16px;text-align:center;border-left:1px solid #e5e7eb">
        <div style="font-size:28px;font-weight:800;color:#dc2626">${failed}</div>
        <div style="font-size:11px;color:#6b7280;margin-top:2px">Failed</div>
      </td>
      <td style="padding:14px 16px;text-align:center;border-left:1px solid #e5e7eb">
        <div style="font-size:28px;font-weight:800;color:#7c3aed">${totalNew.toLocaleString()}</div>
        <div style="font-size:11px;color:#6b7280;margin-top:2px">New assets</div>
      </td>
    </tr>
  </table>

  ${totalNew > 0 ? `
  <h3 style="font-size:13px;font-weight:700;color:#374151;margin:0 0 8px">New assets by institution</h3>
  <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:20px">
    ${newRows}
  </table>` : ""}

  ${stats.failed.length > 0 ? `
  <h3 style="font-size:13px;font-weight:700;color:#374151;margin:0 0 8px">Failed institutions</h3>
  <table style="width:100%;border-collapse:collapse;border:1px solid #fee2e2;border-radius:8px;overflow:hidden;margin-bottom:20px">
    ${failedRows}
  </table>` : ""}

  <p style="font-size:11px;color:#9ca3af;margin:0">Skipped (fresh): ${freshSkippedThisCycle} &middot; Skipped (backoff): ${skippedThisCycle}</p>
</div>`;

  await sendEmail(AUTO_SWEEP_EMAIL, subject, html, FROM_DIGEST);
  console.log(`[scheduler] Auto-sweep report sent to ${AUTO_SWEEP_EMAIL} (${totalNew} new assets, ${succeeded} synced, ${failed} failed)`);
}

/** Starts a staleness-first scan and sends a completion report email when done. */
export async function startAutoSweep(triggerLabel: string): Promise<{ ok: boolean; message: string }> {
  const result = await startStalenessFirstScan();
  if (!result.ok) return result;
  autoSweepActive = true;
  autoSweepStats = {
    startedAt: cycleStartedAt ?? new Date(),
    triggerLabel,
    newAssetsByInstitution: new Map(),
    failed: [],
  };
  return result;
}

async function runOne(institution: string, gen: number): Promise<void> {
  const scraperType = getScraperType(institution);
  const acquired = tryAcquireSyncLock(institution, scraperType);
  if (!acquired) {
    // Another sync for this institution is already in flight — do NOT requeue to priority
    // (that creates a tight spin loop). The in-flight sync will complete normally and the
    // health cache will be updated. Simply count it as skipped and move on.
    console.log(`[scheduler] Lock unavailable for ${institution} — already running, skipping`);
    if (runGeneration === gen) {
      skippedThisCycle++;
    }
    return;
  }

  // Inner helper — runs the sync once and returns the result or throws.
  const attemptSync = () => runInstitutionSync(institution);

  let result: Awaited<ReturnType<typeof runInstitutionSync>> | null = null;
  let finalErr: any = null;

  // Complex institutions in a Daily Sweep get 3 total attempts (2 retries) instead of 1.
  const maxRetries = dailySweepComplexPhase && COMPLEX_INSTITUTIONS.has(institution) ? 2 : 1;
  let attemptsLeft = maxRetries;

  try {
    result = await attemptSync();
  } catch (firstErr: any) {
    const firstMsg = firstErr?.message ?? "";
    console.log(`[scheduler] ${institution} failed on attempt 1/${maxRetries + 1} (${firstMsg}) — retrying in 15s...`);
    await new Promise((r) => setTimeout(r, 15_000));
    if (runGeneration === gen) {
      while (attemptsLeft > 0 && result === null && finalErr === null) {
        attemptsLeft--;
        try {
          result = await attemptSync();
          console.log(`[scheduler] ${institution} retry succeeded (${maxRetries - attemptsLeft}/${maxRetries})`);
        } catch (retryErr: any) {
          if (attemptsLeft > 0) {
            console.log(`[scheduler] ${institution} retry failed — ${attemptsLeft} attempt(s) remaining`);
            await new Promise((r) => setTimeout(r, 30_000));
            if (runGeneration !== gen) return;
          } else {
            finalErr = retryErr;
          }
        }
      }
    } else {
      // Generation changed during the retry wait — abandon quietly.
      return;
    }
  }

  if (result !== null) {
    // ── Success path ────────────────────────────────────────────────────────
    if (runGeneration === gen) {
      completedThisCycle++;
      if (result.rawCount === 0) {
        console.warn(`[scheduler] WARNING: ${institution} returned 0 raw listings — site may be rate-limiting or unreachable (${result.newCount} new, ${result.relevantCount} relevant)`);
        // Accumulate into sweep stats for the completion report.
        // Only flag as suspicious if the institution has prior successful syncs —
        // an institution that has never synced before returning 0 is expected.
        if (sweepStats) {
          const hasPriorData = scraperHealthCache.get(institution)?.lastSuccessAt != null;
          if (hasPriorData) sweepStats.emptyResponse.push(institution);
        }
      } else {
        console.log(`[scheduler] ${institution} complete — ${result.rawCount} scraped, ${result.newCount} new, ${result.relevantCount} relevant`);
        if (sweepStats) sweepStats.newAssets += result.newCount;
        if (autoSweepActive && autoSweepStats && result.newCount > 0) {
          autoSweepStats.newAssetsByInstitution.set(institution, result.newCount);
        }
      }
    }
    await updateScraperHealth(institution, true, undefined, result.newCount, result.rawCount);
    // Determine if this is a full T1-T3 cycle run (vs tier-only or staleness-first or daily sweep).
    const isFullCycleRun = !tierOnlyActive && !stalenessFirstActive && !dailySweepActive;
    const newCompletedCycle = isFullCycleRun ? cycleCount : (scraperHealthCache.get(institution)?.lastCompletedCycle ?? null);
    scraperHealthCache.set(institution, {
      institution,
      consecutiveFailures: 0,
      lastFailureReason: null,
      lastFailureAt: null,
      lastSuccessAt: new Date(),
      backoffUntil: null,
      lastSuccessNewCount: result.newCount,
      lastSuccessRawCount: result.rawCount,
      lastCompletedCycle: newCompletedCycle,
    });
    // Persist the cycle stamp to DB so post-crash resumes skip this institution.
    // Fire-and-forget — a write failure is non-fatal (the freshness gate is the backup).
    if (isFullCycleRun) {
      stampScraperCycleComplete(institution, cycleCount).catch(() => {});
    }
  } else if (finalErr !== null) {
    // ── Failure path (both attempts failed) ─────────────────────────────────
    const msg = finalErr?.message ?? "";
    const transient = isTransientDbError(msg);

    if (runGeneration === gen) {
      if (transient) {
        console.log(`[scheduler] ${institution} skipped (DB connection blip, not a scraper fault): ${msg} — will retry in 60s`);
        // Delay before requeueing to avoid a spin loop if the DB stays down.
        const capturedGen = gen;
        setTimeout(() => {
          if (runGeneration !== capturedGen) return;
          if (!priorityQueue.includes(institution)) priorityQueue.push(institution);
          scheduleNext();
        }, 60_000);
      } else {
        failedThisCycle++;
        console.log(`[scheduler] ${institution} failed after ${maxRetries + 1} attempt(s): ${msg}`);
        if (sweepStats && !sweepStats.failed.includes(institution)) {
          sweepStats.failed.push(institution);
        }
        if (autoSweepActive && autoSweepStats && !autoSweepStats.failed.includes(institution)) {
          autoSweepStats.failed.push(institution);
        }
      }
    }

    if (!transient) {
      await updateScraperHealth(institution, false, msg);
      const current = scraperHealthCache.get(institution);
      const newFailures = (current?.consecutiveFailures ?? 0) + 1;
      scraperHealthCache.set(institution, {
        institution,
        consecutiveFailures: newFailures,
        lastFailureReason: msg || null,
        lastFailureAt: new Date(),
        lastSuccessAt: current?.lastSuccessAt ?? null,
        backoffUntil: newFailures >= 12 ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) :
                     newFailures >= 8  ? new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) :
                     newFailures >= 5  ? new Date(Date.now() + 24 * 60 * 60 * 1000) :
                     newFailures >= 3  ? new Date(Date.now() + 6 * 60 * 60 * 1000) :
                     (current?.backoffUntil ?? null),
        lastSuccessNewCount: current?.lastSuccessNewCount ?? null,
        lastSuccessRawCount: current?.lastSuccessRawCount ?? null,
        lastCompletedCycle: current?.lastCompletedCycle ?? null,
      });
    }
  }
  if (runGeneration === gen) {
    persistState().catch(() => {});
  }
}
