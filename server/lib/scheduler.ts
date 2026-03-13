import { ALL_SCRAPERS } from "./scrapers/index";
import { runInstitutionSync, tryAcquireSyncLock, releaseSyncLock, isIngestionRunning, isSyncRunning } from "./ingestion";

export interface SchedulerStatus {
  state: "idle" | "running" | "paused";
  currentInstitution: string | null;
  queuePosition: number;
  queueTotal: number;
  completedThisCycle: number;
  failedThisCycle: number;
  cycleStartedAt: string | null;
  lastActivityAt: string | null;
}

let schedulerState: "idle" | "running" | "paused" = "idle";
let currentInstitution: string | null = null;
let queueIndex = 0;
let completedThisCycle = 0;
let failedThisCycle = 0;
let cycleStartedAt: Date | null = null;
let lastActivityAt: Date | null = null;
let schedulerTimer: ReturnType<typeof setTimeout> | null = null;

const DELAY_BETWEEN_SYNCS_MS = 5_000;

function getInstitutionQueue(): string[] {
  return ALL_SCRAPERS.map((s) => s.institution);
}

export function getSchedulerStatus(): SchedulerStatus {
  const queue = getInstitutionQueue();
  return {
    state: schedulerState,
    currentInstitution,
    queuePosition: queueIndex,
    queueTotal: queue.length,
    completedThisCycle,
    failedThisCycle,
    cycleStartedAt: cycleStartedAt?.toISOString() ?? null,
    lastActivityAt: lastActivityAt?.toISOString() ?? null,
  };
}

export function startScheduler(): { ok: boolean; message: string } {
  if (schedulerState === "running") {
    return { ok: false, message: "Scheduler is already running" };
  }
  if (isIngestionRunning()) {
    return { ok: false, message: "Full ingestion pipeline is running — wait for it to finish" };
  }

  schedulerState = "running";
  if (!cycleStartedAt || queueIndex >= getInstitutionQueue().length) {
    queueIndex = 0;
    completedThisCycle = 0;
    failedThisCycle = 0;
    cycleStartedAt = new Date();
  }
  console.log(`[scheduler] Started — resuming at position ${queueIndex}/${getInstitutionQueue().length}`);
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

function scheduleNext(): void {
  if (schedulerState !== "running") return;

  const queue = getInstitutionQueue();
  if (queueIndex >= queue.length) {
    console.log(`[scheduler] Cycle complete — ${completedThisCycle} succeeded, ${failedThisCycle} failed`);
    schedulerState = "idle";
    currentInstitution = null;
    return;
  }

  if (isSyncRunning() || isIngestionRunning()) {
    schedulerTimer = setTimeout(() => scheduleNext(), 10_000);
    return;
  }

  const institution = queue[queueIndex];
  currentInstitution = institution;

  runOne(institution).finally(() => {
    queueIndex++;
    currentInstitution = null;
    lastActivityAt = new Date();

    if (schedulerState === "running") {
      schedulerTimer = setTimeout(() => scheduleNext(), DELAY_BETWEEN_SYNCS_MS);
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
