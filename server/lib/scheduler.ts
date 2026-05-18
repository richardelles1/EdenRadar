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

let scraperHealthCache: Map<string, ScraperHealthRow> = new Map();

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
      console.warn(`[scheduler] WATCHDOG: ${institution} stuck for ${elapsedMin} min (limit ${maxMs / 60000} min) — force-evicting`);
      currentInstitutions = currentInstitutions.filter((i) => i !== institution);
      institutionDispatchedAt.delete(institution);
      releaseSyncLock(institution);
      failedThisCycle++;
      evicted = true;
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
    const tier = getScraperTier(s.institution);
    buckets[tier].push(s.institution);
  }
  // T4 (Playwright) runs as a separate auto-pass after each full T1-T3 cycle completes,
  // eliminating the exclusive-drain stalls that T4 causes mid-cycle.
  return [...buckets[1], ...buckets[2], ...buckets[3]];
}

/** Build a queue sorted by lastSuccessAt ASC — never-synced institutions (epoch 0) first,
 * then oldest-last-synced, up to the most recently synced.
 * Must be called AFTER the scraperHealthCache is freshly loaded. */
function buildStalenessFirstQueue(): string[] {
  return [...ALL_SCRAPERS]
    .sort((a, b) => {
      const aAt = scraperHealthCache.get(a.institution)?.lastSuccessAt?.getTime() ?? 0;
      const bAt = scraperHealthCache.get(b.institution)?.lastSuccessAt?.getTime() ?? 0;
      return aAt - bAt;
    })
    .map((s) => s.institution);
}

function getInstitutionQueue(): string[] {
  return tieredQueue.length > 0 ? tieredQueue : ALL_SCRAPERS.map((s) => s.institution);
}

function getScraperType(institution: string): "playwright" | "http" | "api" {
  const scraper = ALL_SCRAPERS.find((s) => s.institution === institution);
  const t = scraper?.scraperType ?? "http";
  return (t === "stub" ? "http" : t) as "playwright" | "http" | "api";
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
    stalenessFirst: stalenessFirstActive,
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

    // ── Concurrent limit for HTTP/API scrapers ────────────────────────────────
    if (liveCount >= getMaxHttpConcurrent()) break;

    // ── Staleness gate ────────────────────────────────────────────────────────
    if (isFresh(institution)) {
      queueIndex++;
      freshSkippedThisCycle++;
      continue;
    }

    // ── Backoff gate ──────────────────────────────────────────────────────────
    if (isInBackoff(institution)) {
      queueIndex++;
      skippedThisCycle++;
      continue;
    }

    // ── Dispatch ──────────────────────────────────────────────────────────────
    queueIndex++;
    const syncStart = Date.now();
    currentInstitutions = [...currentInstitutions, institution];
    institutionDispatchedAt.set(institution, syncStart);
    console.log(`[scheduler] [T${institutionTier}/${scraperType}] ${institution} (${queueIndex}/${queue.length})`);

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

    if (tierOnlyActive !== null || stalenessFirstActive) {
      // ── Tier-only / staleness-first: check if this is an auto T4 pass ─────
      const wasAutoT4 = tierOnlyActive === 4 && autoT4AfterCycle;
      autoT4AfterCycle = false;
      tierOnlyActive = null;
      stalenessFirstActive = false;

      if (wasAutoT4) {
        // Auto-T4 pass complete — start the next full T1-T3 cycle after a 2-min cooldown.
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
        // Keep schedulerState = "running" (cooldown period)
        schedulerTimer = setTimeout(() => {
          if (runGeneration !== capturedGenAfterT4) return;
          scheduleNext();
        }, 2 * 60 * 1000);
      } else {
        // Manual tier-only or staleness-first scan — go idle.
        schedulerState = "idle";
        persistState(true).catch(() => {});
      }
    } else {
      // ── Full T1-T3 cycle complete — trigger auto T4 pass, then next cycle ─
      const completedCycleNum = cycleCount;
      const capturedGenForT4 = runGeneration;
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

async function runOne(institution: string, gen: number): Promise<void> {
  const scraperType = getScraperType(institution);
  const acquired = tryAcquireSyncLock(institution, scraperType);
  if (!acquired) {
    console.log(`[scheduler] Lock unavailable for ${institution} — requeueing`);
    if (runGeneration === gen) {
      if (!priorityQueue.includes(institution)) priorityQueue.unshift(institution);
      skippedThisCycle++;
    }
    return;
  }

  // Inner helper — runs the sync once and returns the result or throws.
  const attemptSync = () => runInstitutionSync(institution);

  let result: Awaited<ReturnType<typeof runInstitutionSync>> | null = null;
  let finalErr: any = null;

  try {
    result = await attemptSync();
  } catch (firstErr: any) {
    const firstMsg = firstErr?.message ?? "";
    // Auto-retry once after a short pause. This handles transient failures:
    // server restart mid-sync, momentary network blip, or load-induced timeout.
    console.log(`[scheduler] ${institution} failed on first attempt (${firstMsg}) — retrying in 15s...`);
    await new Promise((r) => setTimeout(r, 15_000));
    // Only retry if we are still in the same scheduler generation.
    if (runGeneration === gen) {
      try {
        result = await attemptSync();
        console.log(`[scheduler] ${institution} retry succeeded`);
      } catch (retryErr: any) {
        finalErr = retryErr;
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
      } else {
        console.log(`[scheduler] ${institution} complete — ${result.rawCount} scraped, ${result.newCount} new, ${result.relevantCount} relevant`);
      }
    }
    await updateScraperHealth(institution, true, undefined, result.newCount, result.rawCount);
    // Determine if this is a full T1-T3 cycle run (vs tier-only or staleness-first).
    const isFullCycleRun = !tierOnlyActive && !stalenessFirstActive;
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
        console.log(`[scheduler] ${institution} skipped (DB connection blip, not a scraper fault): ${msg}`);
        if (!priorityQueue.includes(institution)) priorityQueue.push(institution);
      } else {
        failedThisCycle++;
        console.log(`[scheduler] ${institution} failed after retry: ${msg}`);
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
