import { ALL_SCRAPERS } from "./scrapers/index";
import { runInstitutionSync, tryAcquireSyncLock, releaseSyncLock, isIngestionRunning, isSyncRunning } from "./ingestion";

export interface SchedulerStatus {
  state: "idle" | "running" | "paused";
  currentInstitution: string | null;
  nextInstitution: string | null;
  queuePosition: number;
  queueTotal: number;
  completedThisCycle: number;
  failedThisCycle: number;
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
let currentInstitution: string | null = null;
let queueIndex = 0;
let completedThisCycle = 0;
let failedThisCycle = 0;
let cycleStartedAt: Date | null = null;
let lastActivityAt: Date | null = null;
let schedulerTimer: ReturnType<typeof setTimeout> | null = null;
let cycleCount = 0;
let priorityQueue: string[] = [];
let syncDurations: number[] = [];
let syncStartedAt: number | null = null;
let lastCycleCompletedAt: Date | null = null;

let delayBetweenSyncsMs = 5_000;

function getInstitutionQueue(): string[] {
  return ALL_SCRAPERS.map((s) => s.institution);
}

export function getSchedulerStatus(): SchedulerStatus {
  const queue = getInstitutionQueue();
  const remaining = queue.length - queueIndex + priorityQueue.length;
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
    nextInst = currentInstitution ? (queue[queueIndex + 1] ?? queue[0]) : queue[queueIndex];
  }

  return {
    state: schedulerState,
    currentInstitution,
    nextInstitution: nextInst,
    queuePosition: queueIndex,
    queueTotal: queue.length,
    completedThisCycle,
    failedThisCycle,
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

export function startScheduler(): { ok: boolean; message: string } {
  if (schedulerState === "running") {
    return { ok: false, message: "Scheduler is already running" };
  }
  if (isIngestionRunning()) {
    return { ok: false, message: "Full ingestion pipeline is running — wait for it to finish" };
  }

  schedulerState = "running";
  if (schedulerState === "running" && cycleStartedAt && queueIndex < getInstitutionQueue().length) {
    console.log(`[scheduler] Resumed at position ${queueIndex}/${getInstitutionQueue().length} (cycle #${cycleCount})`);
  } else {
    queueIndex = 0;
    completedThisCycle = 0;
    failedThisCycle = 0;
    cycleStartedAt = new Date();
    cycleCount++;
    console.log(`[scheduler] Started cycle #${cycleCount} — ${getInstitutionQueue().length} institutions`);
  }
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
  console.log(`[scheduler] Paused at position ${queueIndex}/${getInstitutionQueue().length}`);
  return { ok: true, message: "Scheduler paused" };
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

  if (isSyncRunning() || isIngestionRunning()) {
    schedulerTimer = setTimeout(() => scheduleNext(), 10_000);
    return;
  }

  if (priorityQueue.length > 0) {
    const institution = priorityQueue.shift()!;
    currentInstitution = institution;
    syncStartedAt = Date.now();
    console.log(`[scheduler] Priority sync: ${institution}`);
    runOne(institution).finally(() => {
      if (syncStartedAt) {
        syncDurations.push(Date.now() - syncStartedAt);
        if (syncDurations.length > 20) syncDurations.shift();
        syncStartedAt = null;
      }
      currentInstitution = null;
      lastActivityAt = new Date();
      if (schedulerState === "running") {
        schedulerTimer = setTimeout(() => scheduleNext(), delayBetweenSyncsMs);
      }
    });
    return;
  }

  const queue = getInstitutionQueue();
  if (queueIndex >= queue.length) {
    console.log(`[scheduler] Cycle #${cycleCount} complete — ${completedThisCycle} succeeded, ${failedThisCycle} failed. Starting next cycle...`);
    lastCycleCompletedAt = new Date();
    queueIndex = 0;
    completedThisCycle = 0;
    failedThisCycle = 0;
    cycleStartedAt = new Date();
    cycleCount++;
  }

  const institution = queue[queueIndex];
  currentInstitution = institution;
  syncStartedAt = Date.now();

  runOne(institution).finally(() => {
    if (syncStartedAt) {
      syncDurations.push(Date.now() - syncStartedAt);
      if (syncDurations.length > 20) syncDurations.shift();
      syncStartedAt = null;
    }
    queueIndex++;
    currentInstitution = null;
    lastActivityAt = new Date();

    if (schedulerState === "running") {
      schedulerTimer = setTimeout(() => scheduleNext(), delayBetweenSyncsMs);
    }
  });
}

async function runOne(institution: string): Promise<void> {
  const acquired = tryAcquireSyncLock(institution);
  if (!acquired) {
    console.log(`[scheduler] Could not acquire lock for ${institution}, skipping`);
    failedThisCycle++;
    return;
  }

  try {
    console.log(`[scheduler] Syncing ${institution} (${queueIndex + 1}/${getInstitutionQueue().length})...`);
    await runInstitutionSync(institution);
    completedThisCycle++;
    console.log(`[scheduler] ${institution} complete`);
  } catch (err: any) {
    failedThisCycle++;
    console.error(`[scheduler] ${institution} failed: ${err?.message}`);
  }
}
