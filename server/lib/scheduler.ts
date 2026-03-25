import { ALL_SCRAPERS } from "./scrapers/index";
import { runInstitutionSync, tryAcquireSyncLock, isIngestionRunning, getActiveSyncs } from "./ingestion";
import {
  saveSchedulerState,
  loadSchedulerState,
  loadAllScraperHealth,
  updateScraperHealth,
  type ScraperHealthRow,
} from "./scraperState";
import { storage } from "../storage";

const MAX_HTTP_CONCURRENT = 5;
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
let delayBetweenSyncsMs = 5_000;
/** Monotonically increasing. Incremented on every reset so in-flight batch
 * callbacks can detect they belong to a superseded cycle and no-op. */
let runGeneration = 0;

let scraperHealthCache: Map<string, ScraperHealthRow> = new Map();

function getInstitutionQueue(): string[] {
  return ALL_SCRAPERS.map((s) => s.institution);
}

// Playwright scraper audit (all 11 confirmed via chromium.launch grep across all scraper files):
// cwru.ts, gatech.ts, Leeds, Fred Hutchinson, Moffitt, UniQuest (Queensland), NUS Enterprise,
// TechLink (DoD), Ghent University (researchportal.be), UCL Business, Cancer Research Horizons.
// Leeds has 2 internal chromium.launch calls (licensor + TechPublisher) but is one scraper object.
// All above carry scraperType: "playwright" → 720s timeout; everything else defaults to "http" (90s) or "api" (3m).
function getScraperType(institution: string): "playwright" | "http" | "api" {
  const scraper = ALL_SCRAPERS.find((s) => s.institution === institution);
  return scraper?.scraperType ?? "http";
}

function isInBackoff(institution: string): boolean {
  const health = scraperHealthCache.get(institution);
  if (!health?.backoffUntil) return false;
  return health.backoffUntil > new Date();
}

function isFresh(institution: string): boolean {
  const health = scraperHealthCache.get(institution);
  if (!health?.lastSuccessAt) return false;
  return (Date.now() - health.lastSuccessAt.getTime()) < FRESH_THRESHOLD_MS;
}

function persistState(): void {
  saveSchedulerState({
    queueIndex,
    cycleCount,
    cycleStartedAt,
    completedThisCycle,
    failedThisCycle,
    lastCycleCompletedAt,
    schedulerRunning: schedulerState === "running",
  }).catch(() => {});
}

export function getSchedulerStatus(): SchedulerStatus {
  const queue = getInstitutionQueue();
  const activeSyncs = getActiveSyncs();
  const remaining = Math.max(0, queue.length - queueIndex) + priorityQueue.length;
  const avgMs = syncDurations.length > 0
    ? Math.round(syncDurations.reduce((a, b) => a + b, 0) / syncDurations.length)
    : null;
  // ETA: concurrent mode means we can drain MAX_HTTP_CONCURRENT entries per avg-sync-time window
  const effectiveConcurrency = Math.min(MAX_HTTP_CONCURRENT, Math.max(1, activeSyncs.length || 1));
  const estimatedRemainingMs = avgMs && remaining > 0
    ? Math.ceil(remaining / effectiveConcurrency) * (avgMs + delayBetweenSyncsMs)
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
  };
}

export function setDelay(ms: number): { ok: boolean; message: string } {
  if (ms < 1000 || ms > 300_000) {
    return { ok: false, message: "Delay must be between 1000ms and 300000ms" };
  }
  delayBetweenSyncsMs = ms;
  return { ok: true, message: `Delay set to ${ms}ms` };
}

/** Restores scheduler state from DB. Returns true if the scheduler was running when the server last shut down (so the caller can decide to auto-resume). */
export async function loadAndRestoreScheduler(): Promise<boolean> {
  try {
    // Clean up any sessions left in "running" state by a previous server instance
    // that was killed mid-sync. These would otherwise appear as "Stale" in the
    // health dashboard indefinitely.
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
    // Restore in-memory state: if it was paused when last saved, mark it paused
    // so the UI shows "Paused" (and the Resume button) rather than "Idle"
    if (!wasRunning) {
      schedulerState = "paused";
    }
    console.log(`[scheduler] Restored state: cycle #${cycleCount}, position ${queueIndex}/${getInstitutionQueue().length}, was ${wasRunning ? "running" : "paused"}`);
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
  // Eagerly persist the running state so a crash immediately after Start still
  // restores correctly on next boot instead of reverting to paused.
  schedulerState = "running";
  persistState();

  if (cycleStartedAt && queueIndex < getInstitutionQueue().length) {
    console.log(`[scheduler] Resumed at position ${queueIndex}/${getInstitutionQueue().length} (cycle #${cycleCount})`);
  } else {
    queueIndex = 0;
    completedThisCycle = 0;
    failedThisCycle = 0;
    skippedThisCycle = 0;
    freshSkippedThisCycle = 0;
    cycleStartedAt = new Date();
    cycleCount++;
    console.log(`[scheduler] Started cycle #${cycleCount} — ${getInstitutionQueue().length} institutions, up to ${MAX_HTTP_CONCURRENT} concurrent`);
  }

  loadAllScraperHealth().then((h) => { scraperHealthCache = h; }).catch(() => {});
  scheduleNext();
  return { ok: true, message: "Scheduler started" };
}

export function resetAndStartScheduler(): { ok: boolean; message: string } {
  if (isIngestionRunning()) {
    return { ok: false, message: "Full ingestion pipeline is running — wait for it to finish" };
  }
  // Bump generation first so any in-flight batch callbacks become no-ops
  runGeneration++;
  // Stop any pending timer
  if (schedulerTimer) {
    clearTimeout(schedulerTimer);
    schedulerTimer = null;
  }
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
  console.log(`[scheduler] Reset (gen=${runGeneration}) — starting fresh cycle #${cycleCount} from position 0/${getInstitutionQueue().length}`);
  loadAllScraperHealth().then((h) => { scraperHealthCache = h; }).catch(() => {});
  scheduleNext();
  return { ok: true, message: `Started fresh cycle #${cycleCount}` };
}

export function pauseScheduler(): { ok: boolean; message: string } {
  if (schedulerState !== "running") {
    return { ok: false, message: "Scheduler is not running" };
  }
  schedulerState = "paused";
  if (schedulerTimer) {
    clearTimeout(schedulerTimer);
    schedulerTimer = null;
  }
  persistState();
  console.log(`[scheduler] Paused at position ${queueIndex}/${getInstitutionQueue().length}`);
  return { ok: true, message: "Scheduler paused" };
}

/** Immediately removes an institution's backoff from the in-memory cache so scheduling decisions take effect without waiting for a cycle rollover. */
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
    const liveCount = getActiveSyncs().length;

    // Playwright from priority queue: only when no other syncs are active
    if (scraperType === "playwright" && liveCount > 0) break;

    // HTTP concurrent limit
    if (scraperType !== "playwright" && liveCount >= MAX_HTTP_CONCURRENT) break;

    priorityQueue.shift();
    const syncStart = Date.now();
    currentInstitutions = scraperType === "playwright"
      ? [institution]
      : [...currentInstitutions, institution];

    console.log(`[scheduler] [priority] [${scraperType}] ${institution}`);

    runOne(institution, gen).finally(() => {
      if (runGeneration !== gen) return;
      syncDurations.push(Date.now() - syncStart);
      if (syncDurations.length > 20) syncDurations.shift();
      currentInstitutions = currentInstitutions.filter((i) => i !== institution);
      lastActivityAt = new Date();
      persistState();
      scheduleNext();
    });

    // Playwright must be exclusive — stop dispatching more
    if (scraperType === "playwright") return;
  }

  const queue = getInstitutionQueue();

  // ── Main queue: fill concurrent slots ─────────────────────────────────────
  while (queueIndex < queue.length) {
    const institution = queue[queueIndex];
    const scraperType = getScraperType(institution);
    const liveCount = getActiveSyncs().length;

    if (scraperType === "playwright") {
      // Playwright: only run when no other syncs active
      if (liveCount > 0) break;

      queueIndex++;
      const syncStart = Date.now();
      currentInstitutions = [institution];
      console.log(`[scheduler] [playwright] ${institution} (${queueIndex}/${queue.length})`);

      runOne(institution, gen).finally(() => {
        if (runGeneration !== gen) return;
        syncDurations.push(Date.now() - syncStart);
        if (syncDurations.length > 20) syncDurations.shift();
        currentInstitutions = [];
        lastActivityAt = new Date();
        persistState();
        scheduleNext();
      });

      // Playwright exclusive — stop dispatching more until this one finishes
      return;
    }

    // HTTP/API: check concurrent limit
    if (liveCount >= MAX_HTTP_CONCURRENT) break;

    // Staleness gate: skip if successfully synced within FRESH_THRESHOLD_MS
    if (isFresh(institution)) {
      queueIndex++;
      freshSkippedThisCycle++;
      continue;
    }

    // Backoff gate: skip if institution is in exponential backoff
    if (isInBackoff(institution)) {
      queueIndex++;
      skippedThisCycle++;
      continue;
    }

    // Dispatch this institution
    queueIndex++;
    const syncStart = Date.now();
    currentInstitutions = [...currentInstitutions, institution];
    console.log(`[scheduler] [${scraperType}] ${institution} (${queueIndex}/${queue.length})`);

    runOne(institution, gen).finally(() => {
      if (runGeneration !== gen) return;
      syncDurations.push(Date.now() - syncStart);
      if (syncDurations.length > 20) syncDurations.shift();
      currentInstitutions = currentInstitutions.filter((i) => i !== institution);
      lastActivityAt = new Date();
      persistState();
      // Each completion fills freed slot immediately — no fixed delay between HTTP syncs
      scheduleNext();
    });

    // Continue the loop to fill remaining concurrent slots
  }

  // ── Cycle completion check ─────────────────────────────────────────────────
  // Queue is exhausted AND all in-flight syncs have completed
  if (queueIndex >= queue.length && getActiveSyncs().length === 0 && priorityQueue.length === 0) {
    console.log(
      `[scheduler] Cycle #${cycleCount} complete — ${completedThisCycle} ok, ` +
      `${failedThisCycle} failed, ${freshSkippedThisCycle} fresh-skipped, ${skippedThisCycle} backoff-skipped.`
    );
    lastCycleCompletedAt = new Date();
    schedulerState = "idle";
    persistState();
    currentInstitutions = [];
    loadAllScraperHealth().then((h) => { scraperHealthCache = h; }).catch(() => {});
  }
}

async function runOne(institution: string, gen: number): Promise<void> {
  const scraperType = getScraperType(institution);
  const acquired = tryAcquireSyncLock(institution, scraperType);
  if (!acquired) {
    // Lock contention (e.g. a manual sync is still running) — defer, not a failure.
    // Push to the front of priorityQueue so it retries at the next scheduleNext() call
    // rather than waiting for the next full cycle.
    console.log(`[scheduler] Lock unavailable for ${institution} — requeueing for retry`);
    if (runGeneration === gen) {
      if (!priorityQueue.includes(institution)) priorityQueue.unshift(institution);
      skippedThisCycle++;
    }
    return;
  }

  try {
    await runInstitutionSync(institution);
    if (runGeneration === gen) {
      completedThisCycle++;
      console.log(`[scheduler] ${institution} complete`);
    }
    await updateScraperHealth(institution, true);
    scraperHealthCache.set(institution, {
      institution,
      consecutiveFailures: 0,
      lastFailureReason: null,
      lastFailureAt: null,
      lastSuccessAt: new Date(),
      backoffUntil: null,
    });
  } catch (err: any) {
    if (runGeneration === gen) {
      failedThisCycle++;
      console.log(`[scheduler] ${institution} failed: ${err?.message}`);
    }
    await updateScraperHealth(institution, false, err?.message);
    const current = scraperHealthCache.get(institution);
    const newFailures = (current?.consecutiveFailures ?? 0) + 1;
    scraperHealthCache.set(institution, {
      institution,
      consecutiveFailures: newFailures,
      lastFailureReason: err?.message ?? null,
      lastFailureAt: new Date(),
      lastSuccessAt: current?.lastSuccessAt ?? null,
      backoffUntil: newFailures >= 5 ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) : (current?.backoffUntil ?? null),
    });
  } finally {
    // Always persist scraper health (health DB writes are safe regardless of gen)
    // but only persist scheduler position if still in the same cycle
    if (runGeneration === gen) {
      persistState();
    }
  }
}
