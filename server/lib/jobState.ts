/**
 * Canonical state container for long-running background jobs.
 *
 * Usage:
 *   const myJob = new Job<MySummary>();
 *   myJob.start(total);          // begins a run
 *   myJob.tick();                // increment processed counter
 *   myJob.requestStop();         // cooperative cancellation signal
 *   myJob.finish(summary);       // mark successful completion
 *   myJob.fail("reason");        // mark failed completion
 *   myJob.status();              // snapshot for API responses
 */

export interface JobStatus<TSummary = unknown> {
  running: boolean;
  shouldStop: boolean;
  processed: number;
  total: number;
  elapsedMs: number | null;
  lastSummary: TSummary | null;
  error: string | null;
}

export class Job<TSummary = unknown> {
  private _running = false;
  private _shouldStop = false;
  private _processed = 0;
  private _total = 0;
  private _startedAt: number | null = null;
  private _lastSummary: TSummary | null = null;
  private _error: string | null = null;

  get running(): boolean { return this._running; }
  get shouldStop(): boolean { return this._shouldStop; }
  get processed(): number { return this._processed; }
  get total(): number { return this._total; }

  start(total = 0): void {
    this._running = true;
    this._shouldStop = false;
    this._processed = 0;
    this._total = total;
    this._startedAt = Date.now();
    this._lastSummary = null;
    this._error = null;
  }

  /** Increment the processed counter, or set it to an explicit value. */
  tick(processed?: number): void {
    if (processed !== undefined) {
      this._processed = processed;
    } else {
      this._processed++;
    }
  }

  /** Signal cooperative stop — the job loop should check shouldStop and exit cleanly. */
  requestStop(): void {
    this._shouldStop = true;
  }

  finish(summary: TSummary): void {
    this._running = false;
    this._shouldStop = false;
    this._lastSummary = summary;
    this._error = null;
  }

  fail(error: string): void {
    this._running = false;
    this._shouldStop = false;
    this._error = error;
  }

  status(): JobStatus<TSummary> {
    return {
      running: this._running,
      shouldStop: this._shouldStop,
      processed: this._processed,
      total: this._total,
      elapsedMs: this._startedAt !== null ? Date.now() - this._startedAt : null,
      lastSummary: this._lastSummary,
      error: this._error,
    };
  }
}

/** Central registry — lets a single endpoint report all job states. */
const registry = new Map<string, Job<unknown>>();

export function registerJob<T>(name: string, job: Job<T>): void {
  registry.set(name, job as Job<unknown>);
}

export function getAllJobStatuses(): Record<string, JobStatus<unknown>> {
  const out: Record<string, JobStatus<unknown>> = {};
  for (const [name, job] of registry) {
    out[name] = job.status();
  }
  return out;
}
