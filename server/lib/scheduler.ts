import { ALL_SCRAPERS, getScraperTier } from "./scrapers/index";
import { runInstitutionSync, tryAcquireSyncLock, isIngestionRunning, getActiveSyncs, getMaxHttpConcurrent, setConcurrency } from "./ingestion";
export { setConcurrency, getMaxHttpConcurrent };
import {
  saveSchedulerState,
  loadSchedulerState,
  loadAllScraperHealth,
  updateScraperHealth,
  type ScraperHealthRow,
} from "./scraperState";
import { storage } from "../storage";

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

let scraperHealthCache: Map<string, ScraperHealthRow> = new Map();

/** Timestamp of the last successful persistState DB write — used to throttle non-critical saves. */
let _lastPersistAt = 0;
const PERSIST_THROTTLE_MS = 60_000;

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
  return [...buckets[1], ...buckets[2], ...buckets[3], ...buckets[4]];
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
 * - Successfully synced within FRESH_THRESHOLD_MS, AND
 * - The last sync found 0 new assets.
 * Persisted in DB so this survives restarts. */
function isFresh(institution: string): boolean {
  const health = scraperHealthCache.get(institution);
  if (!health?.lastSuccessAt) return false;
  const withinWindow = (Date.now() - health.lastSuccessAt.getTime()) < FRESH_THRESHOLD_MS;
  if (!withinWindow) return false;
  // lastSuccessNewCount === null means we don't know — don't skip (conservative)
  if (health.lastSuccessNewCount === null) return false;
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
  };
}

/** Flush scheduler state to DB immediately, bypassing the 60-second throttle.
 * Returns a bare Promise from saveSchedulerState so callers (SIGTERM handler,
 * pause route) can detect DB write failures — unlike persistState which absorbs them. */
export function flushSchedulerState(): Promise<void> {
  _lastPersistAt = Date.now();
  return saveSchedulerState(buildStateSnapshot());
}

function persistState(immediate = false): void {
  const now = Date.now();
  // Throttle routine per-institution saves to at most once per 60 seconds.
  // State-critical events (start, cycle complete) always pass immediate=true.
  if (!immediate && now - _lastPersistAt < PERSIST_THROTTLE_MS) return;
  _lastPersistAt = now;

  // Fire-and-forget; errors are logged by saveSchedulerState but not propagated
  // so transient DB issues never crash the scheduler loop.
  saveSchedulerState(buildStateSnapshot()).catch(() => {});
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
      schedulerState = "paused";
    }
    tieredQueue = buildTieredQueue();
    console.log(`[scheduler] Restored state: cycle #${cycleCount}, position ${queueIndex}/${tieredQueue.length}, was ${wasRunning ? "running" : "paused"}`);
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
  persistState(true);

  if (cycleStartedAt && queueIndex < getInstitutionQueue().length) {
    console.log(`[scheduler] Resumed at position ${queueIndex}/${getInstitutionQueue().length} (cycle #${cycleCount})`);
  } else {
    tieredQueue = buildTieredQueue();
    queueIndex = 0;
    completedThisCycle = 0;
    failedThisCycle = 0;
    skippedThisCycle = 0;
    freshSkippedThisCycle = 0;
    cycleStartedAt = new Date();
    cycleCount++;
    console.log(`[scheduler] Started cycle #${cycleCount} — ${tieredQueue.length} institutions (T1→T2→T3→T4 order, up to ${getMaxHttpConcurrent()} concurrent per tier)`);
  }

  loadAllScraperHealth().then((h) => { scraperHealthCache = new Map(h); }).catch(() => {});
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
  schedulerState = "running";
  persistState(true);
  console.log(`[scheduler] Reset (gen=${runGeneration}) — starting fresh cycle #${cycleCount} from position 0/${tieredQueue.length}`);
  loadAllScraperHealth().then((h) => { scraperHealthCache = new Map(h); }).catch(() => {});
  scheduleNext();
  return { ok: true, message: `Started fresh cycle #${cycleCount}` };
}

export async function pauseScheduler(): Promise<{ ok: boolean; message: string }> {
  if (schedulerState !== "running") {
    return { ok: false, message: "Scheduler is not running" };
  }
  schedulerState = "paused";
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
  schedulerState = "running";
  persistState();
  console.log(`[scheduler] Tier-${tier} only scan (gen=${runGeneration}) — ${tieredQueue.length} institutions`);
  loadAllScraperHealth().then((h) => { scraperHealthCache = new Map(h); }).catch(() => {});
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

export function invalidateHealthCacheEntry(institution: string): void {
  const entry = scraperHealthCache.get(institution);
  if (entry) {
    scraperHealthCache.set(institution, {
      ...entry,
      consecutiveFailures: 0,
      backoffUntil: null,
      lastFailureReason: null,
      lastFailureAt: null,
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

    console.log(`[scheduler] [priority] [T${getScraperTier(institution)}/${scraperType}] ${institution}`);

    runOne(institution, gen).finally(() => {
      if (runGeneration !== gen) return;
      syncDurations.push(Date.now() - syncStart);
      if (syncDurations.length > 20) syncDurations.shift();
      currentInstitutions = currentInstitutions.filter((i) => i !== institution);
      lastActivityAt = new Date();
      persistState();
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
      console.log(`[scheduler] [T4/playwright] ${institution} (${queueIndex}/${queue.length})`);

      runOne(institution, gen).finally(() => {
        if (runGeneration !== gen) return;
        syncDurations.push(Date.now() - syncStart);
        if (syncDurations.length > 20) syncDurations.shift();
        currentInstitutions = [];
        lastActivityAt = new Date();
        persistState();
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
    console.log(`[scheduler] [T${institutionTier}/${scraperType}] ${institution} (${queueIndex}/${queue.length})`);

    runOne(institution, gen).finally(() => {
      if (runGeneration !== gen) return;
      syncDurations.push(Date.now() - syncStart);
      if (syncDurations.length > 20) syncDurations.shift();
      currentInstitutions = currentInstitutions.filter((i) => i !== institution);
      lastActivityAt = new Date();
      persistState();
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
    schedulerState = "idle";
    persistState(true);
    currentInstitutions = [];
    loadAllScraperHealth().then((h) => { scraperHealthCache = new Map(h); }).catch(() => {});
  }
}

/** Returns true when the error comes from the database connection pool being exhausted,
 * the Supabase connection being dropped, or our own server restarting mid-sync —
 * NOT from the target website failing.
 * These are transient infrastructure blips and must NOT count as scraper failures or
 * increment consecutiveFailures, which would trigger multi-day backoff. */
function isTransientDbError(msg: string): boolean {
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
    m.includes("markrunningsessionsfailed")
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
    await updateScraperHealth(institution, true, undefined, result.newCount);
    scraperHealthCache.set(institution, {
      institution,
      consecutiveFailures: 0,
      lastFailureReason: null,
      lastFailureAt: null,
      lastSuccessAt: new Date(),
      backoffUntil: null,
      lastSuccessNewCount: result.newCount,
    });
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
      });
    }
  }
  if (runGeneration === gen) {
    persistState();
  }
}
