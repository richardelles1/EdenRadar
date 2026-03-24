import { ALL_SCRAPERS } from "./scrapers/index";
import { runInstitutionSync, tryAcquireSyncLock, releaseSyncLock, isIngestionRunning, isSyncRunning, getActiveSyncs } from "./ingestion";
import {
  saveSchedulerState,
  loadSchedulerState,
  loadAllScraperHealth,
  updateScraperHealth,
  type ScraperHealthRow,
} from "./scraperState";

const MAX_HTTP_BATCH = 5;

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
  cycleStartedAt: string | null;
  lastActivityAt: string | null;
  cycleCount: number;
  priorityQueue: string[];
  delayMs: number;
  avgSyncMs: number | null;
  estimatedRemainingMs: number | null;
  lastCycleCompletedAt: string | null;
}

let schedulerState: "idle" | "running" | "paused" = "idle";
let currentInstitutions: string[] = [];
let queueIndex = 0;
let completedThisCycle = 0;
let failedThisCycle = 0;
let skippedThisCycle = 0;
let cycleStartedAt: Date | null = null;
let lastActivityAt: Date | null = null;
let schedulerTimer: ReturnType<typeof setTimeout> | null = null;
let cycleCount = 0;
let priorityQueue: string[] = [];
let syncDurations: number[] = [];
let lastCycleCompletedAt: Date | null = null;
let delayBetweenSyncsMs = 5_000;

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
  const remaining = Math.max(0, queue.length - queueIndex) + priorityQueue.length;
  const avgMs = syncDurations.length > 0
    ? Math.round(syncDurations.reduce((a, b) => a + b, 0) / syncDurations.length)
    : null;
  const estimatedRemainingMs = avgMs && remaining > 0
    ? remaining * (avgMs + delayBetweenSyncsMs)
    : null;

  let nextInst: string | null = null;
  if (priorityQueue.length > 0) {
    nextInst = priorityQueue[0];
  } else if (queueIndex < queue.length) {
    nextInst = queue[queueIndex];
    if (currentInstitutions.includes(nextInst)) {
      nextInst = queue[queueIndex + currentInstitutions.length] ?? null;
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
    cycleStartedAt: cycleStartedAt?.toISOString() ?? null,
    lastActivityAt: lastActivityAt?.toISOString() ?? null,
    cycleCount,
    priorityQueue: [...priorityQueue],
    delayMs: delayBetweenSyncsMs,
    avgSyncMs: avgMs,
    estimatedRemainingMs,
    lastCycleCompletedAt: lastCycleCompletedAt?.toISOString() ?? null,
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
    cycleStartedAt = new Date();
    cycleCount++;
    console.log(`[scheduler] Started cycle #${cycleCount} — ${getInstitutionQueue().length} institutions`);
  }

  loadAllScraperHealth().then((h) => { scraperHealthCache = h; }).catch(() => {});
  scheduleNext();
  return { ok: true, message: "Scheduler started" };
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

  if (isIngestionRunning()) {
    schedulerTimer = setTimeout(() => scheduleNext(), 10_000);
    return;
  }

  if (priorityQueue.length > 0) {
    const institution = priorityQueue.shift()!;
    currentInstitutions = [institution];
    console.log(`[scheduler] Priority sync: ${institution}`);
    const batchStart = Date.now();
    runOne(institution).finally(() => {
      syncDurations.push(Date.now() - batchStart);
      if (syncDurations.length > 20) syncDurations.shift();
      currentInstitutions = [];
      lastActivityAt = new Date();
      persistState();
      if (schedulerState === "running") {
        schedulerTimer = setTimeout(() => scheduleNext(), delayBetweenSyncsMs);
      }
    });
    return;
  }

  const queue = getInstitutionQueue();

  if (queueIndex >= queue.length) {
    console.log(`[scheduler] Cycle #${cycleCount} complete — ${completedThisCycle} ok, ${failedThisCycle} failed, ${skippedThisCycle} skipped (backoff). Scheduler stopping — click Start for a new run.`);
    lastCycleCompletedAt = new Date();
    schedulerState = "idle";
    persistState();
    loadAllScraperHealth().then((h) => { scraperHealthCache = h; }).catch(() => {});
    return;
  }

  const batch: string[] = [];
  let batchType: "playwright" | "http" | "api" = "http";
  let i = queueIndex;

  while (i < queue.length) {
    const inst = queue[i];
    i++;

    if (isInBackoff(inst)) {
      skippedThisCycle++;
      continue;
    }

    const type = getScraperType(inst);

    if (type === "playwright") {
      if (batch.length === 0) {
        batch.push(inst);
        batchType = "playwright";
      }
      break;
    } else {
      batch.push(inst);
      batchType = type;
      if (batch.length >= MAX_HTTP_BATCH) break;
    }
  }

  // Do NOT advance queueIndex yet — keep it pointing to the start of this batch.
  // Only advance after the batch fully completes so a mid-batch crash resumes from
  // the beginning of the current batch rather than skipping unfinished institutions.
  const nextQueueIndex = i;

  if (batch.length === 0) {
    queueIndex = nextQueueIndex;
    if (queueIndex >= queue.length) {
      schedulerTimer = setTimeout(() => scheduleNext(), 500);
    } else {
      schedulerTimer = setTimeout(() => scheduleNext(), 500);
    }
    return;
  }

  currentInstitutions = [...batch];
  const batchStart = Date.now();

  if (batch.length === 1) {
    console.log(`[scheduler] Syncing ${batch[0]} [${batchType}] (${nextQueueIndex}/${queue.length})...`);
  } else {
    console.log(`[scheduler] Batch syncing ${batch.length} institutions [http]: ${batch.join(", ")} (${nextQueueIndex}/${queue.length})...`);
  }

  Promise.allSettled(batch.map((inst) => runOne(inst))).finally(() => {
    queueIndex = nextQueueIndex;  // advance only after all batch members settle
    const elapsed = Date.now() - batchStart;
    syncDurations.push(Math.round(elapsed / batch.length));
    if (syncDurations.length > 20) syncDurations.shift();
    currentInstitutions = [];
    lastActivityAt = new Date();
    persistState();
    if (schedulerState === "running") {
      schedulerTimer = setTimeout(() => scheduleNext(), delayBetweenSyncsMs);
    }
  });
}

async function runOne(institution: string): Promise<void> {
  const scraperType = getScraperType(institution);
  const acquired = tryAcquireSyncLock(institution, scraperType);
  if (!acquired) {
    // Lock contention (e.g. a manual sync is still running) — defer, not a failure.
    // Push to the front of priorityQueue so it retries at the next scheduleNext() call
    // rather than waiting for the next full cycle.
    console.log(`[scheduler] Lock unavailable for ${institution} — requeueing for retry`);
    if (!priorityQueue.includes(institution)) priorityQueue.unshift(institution);
    skippedThisCycle++;
    return;
  }

  try {
    await runInstitutionSync(institution);
    completedThisCycle++;
    console.log(`[scheduler] ${institution} complete`);
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
    failedThisCycle++;
    console.error(`[scheduler] ${institution} failed: ${err?.message}`);
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
    // Persist per-institution so progress survives a mid-batch restart
    persistState();
  }
}
