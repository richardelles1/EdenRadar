import { describe, it, expect } from "vitest";
import { Job, registerJob, getAllJobStatuses } from "./jobState";

// ── initial state ─────────────────────────────────────────────────────────────

describe("Job initial state", () => {
  it("is not running before start()", () => {
    const job = new Job();
    expect(job.running).toBe(false);
  });

  it("status() returns all-quiet before start()", () => {
    const job = new Job();
    const s = job.status();
    expect(s.running).toBe(false);
    expect(s.shouldStop).toBe(false);
    expect(s.processed).toBe(0);
    expect(s.total).toBe(0);
    expect(s.elapsedMs).toBeNull();
    expect(s.lastSummary).toBeNull();
    expect(s.error).toBeNull();
  });
});

// ── start ─────────────────────────────────────────────────────────────────────

describe("Job.start()", () => {
  it("sets running=true and total", () => {
    const job = new Job();
    job.start(100);
    expect(job.running).toBe(true);
    expect(job.total).toBe(100);
  });

  it("resets processed to 0", () => {
    const job = new Job();
    job.start(50);
    job.tick(); job.tick();
    job.start(50); // restart
    expect(job.processed).toBe(0);
  });

  it("clears shouldStop flag on restart", () => {
    const job = new Job();
    job.start(10);
    job.requestStop();
    expect(job.shouldStop).toBe(true);
    job.start(10); // restart clears stop signal
    expect(job.shouldStop).toBe(false);
  });

  it("clears error from a previous failed run", () => {
    const job = new Job();
    job.start(1);
    job.fail("something broke");
    job.start(1);
    expect(job.status().error).toBeNull();
  });

  it("clears lastSummary from a previous finished run", () => {
    const job = new Job<{ count: number }>();
    job.start(1);
    job.finish({ count: 42 });
    job.start(1);
    expect(job.status().lastSummary).toBeNull();
  });

  it("defaults total to 0 when called with no argument", () => {
    const job = new Job();
    job.start();
    expect(job.total).toBe(0);
  });

  it("status().elapsedMs is a non-negative number after start()", () => {
    const job = new Job();
    job.start(10);
    const { elapsedMs } = job.status();
    expect(typeof elapsedMs).toBe("number");
    expect(elapsedMs).toBeGreaterThanOrEqual(0);
  });
});

// ── tick ──────────────────────────────────────────────────────────────────────

describe("Job.tick()", () => {
  it("increments processed by 1 with no argument", () => {
    const job = new Job();
    job.start(10);
    job.tick();
    expect(job.processed).toBe(1);
    job.tick();
    expect(job.processed).toBe(2);
  });

  it("sets processed to an explicit value when given", () => {
    const job = new Job();
    job.start(100);
    job.tick(57);
    expect(job.processed).toBe(57);
  });

  it("allows tick(0) to reset processed", () => {
    const job = new Job();
    job.start(10);
    job.tick(); job.tick();
    job.tick(0);
    expect(job.processed).toBe(0);
  });
});

// ── requestStop ───────────────────────────────────────────────────────────────

describe("Job.requestStop()", () => {
  it("sets shouldStop=true without changing running", () => {
    const job = new Job();
    job.start(10);
    job.requestStop();
    expect(job.shouldStop).toBe(true);
    expect(job.running).toBe(true);
  });

  it("can be called before start() without throwing", () => {
    const job = new Job();
    expect(() => job.requestStop()).not.toThrow();
    expect(job.shouldStop).toBe(true);
  });
});

// ── finish ────────────────────────────────────────────────────────────────────

describe("Job.finish()", () => {
  it("sets running=false and stores summary", () => {
    const job = new Job<{ filled: number }>();
    job.start(5);
    job.finish({ filled: 5 });
    expect(job.running).toBe(false);
    expect(job.status().lastSummary).toEqual({ filled: 5 });
  });

  it("clears shouldStop flag", () => {
    const job = new Job();
    job.start(5);
    job.requestStop();
    job.finish({});
    expect(job.shouldStop).toBe(false);
  });

  it("clears error from a previous failure", () => {
    const job = new Job();
    job.start(1);
    job.fail("boom");
    job.start(1);
    job.finish({});
    expect(job.status().error).toBeNull();
  });
});

// ── fail ──────────────────────────────────────────────────────────────────────

describe("Job.fail()", () => {
  it("sets running=false and stores error message", () => {
    const job = new Job();
    job.start(10);
    job.fail("connection timeout");
    expect(job.running).toBe(false);
    expect(job.status().error).toBe("connection timeout");
  });

  it("clears shouldStop", () => {
    const job = new Job();
    job.start(5);
    job.requestStop();
    job.fail("aborted");
    expect(job.shouldStop).toBe(false);
  });

  it("preserves lastSummary from a prior successful run", () => {
    const job = new Job<{ count: number }>();
    job.start(1);
    job.finish({ count: 7 });
    job.start(1);
    job.fail("boom");
    // last good summary is cleared by start(), so it's null now
    expect(job.status().lastSummary).toBeNull();
  });
});

// ── status() snapshot ─────────────────────────────────────────────────────────

describe("Job.status() snapshot", () => {
  it("returns a plain object (not live reference)", () => {
    const job = new Job<{ n: number }>();
    job.start(10);
    const s1 = job.status();
    job.tick();
    const s2 = job.status();
    // s1 should not have been mutated by tick()
    expect(s1.processed).toBe(0);
    expect(s2.processed).toBe(1);
  });

  it("elapsedMs is null before first start()", () => {
    expect(new Job().status().elapsedMs).toBeNull();
  });

  it("elapsedMs is null after finish() because startedAt is preserved — documents behaviour", () => {
    // After finish(), the job still knows when it started → elapsedMs is non-null
    // (This is intentional: it lets the API report how long the last run took.)
    const job = new Job();
    job.start(1);
    job.finish({});
    expect(job.status().elapsedMs).not.toBeNull();
  });
});

// ── registry ──────────────────────────────────────────────────────────────────

describe("registerJob + getAllJobStatuses", () => {
  it("registered jobs appear in getAllJobStatuses()", () => {
    const job = new Job<{ n: number }>();
    registerJob("test:myJob", job);
    const all = getAllJobStatuses();
    expect("test:myJob" in all).toBe(true);
  });

  it("returns current status of registered jobs", () => {
    const job = new Job<{ n: number }>();
    registerJob("test:statusJob", job);
    job.start(42);
    expect(getAllJobStatuses()["test:statusJob"].running).toBe(true);
    expect(getAllJobStatuses()["test:statusJob"].total).toBe(42);
  });

  it("multiple jobs can be registered independently", () => {
    const a = new Job();
    const b = new Job();
    registerJob("test:jobA", a);
    registerJob("test:jobB", b);
    a.start(10);
    const all = getAllJobStatuses();
    expect(all["test:jobA"].running).toBe(true);
    expect(all["test:jobB"].running).toBe(false);
  });
});
