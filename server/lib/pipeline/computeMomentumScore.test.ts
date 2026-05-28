import { describe, it, expect } from "vitest";
import { computeMomentumScore, RISING_THRESHOLD } from "./computeMomentumScore";

// Build a date that is exactly N days in the past (to the millisecond).
function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

describe("computeMomentumScore", () => {
  // ── all-null baseline ──────────────────────────────────────────────────────

  it("returns 0 for empty input", () => {
    expect(computeMomentumScore({})).toBe(0);
  });

  it("returns 0 when all fields are null", () => {
    expect(
      computeMomentumScore({
        stageChangedAt: null,
        lastContentChangeAt: null,
        firstSeenAt: null,
        citedByCount: null,
      })
    ).toBe(0);
  });

  // ── stageChangedAt ─────────────────────────────────────────────────────────

  it("awards 40 pts for stage change within 30 days", () => {
    expect(computeMomentumScore({ stageChangedAt: daysAgo(1) })).toBe(40);
    expect(computeMomentumScore({ stageChangedAt: daysAgo(30) })).toBe(40);
  });

  it("awards 30 pts for stage change 31–60 days ago", () => {
    expect(computeMomentumScore({ stageChangedAt: daysAgo(31) })).toBe(30);
    expect(computeMomentumScore({ stageChangedAt: daysAgo(60) })).toBe(30);
  });

  it("awards 20 pts for stage change 61–90 days ago", () => {
    expect(computeMomentumScore({ stageChangedAt: daysAgo(61) })).toBe(20);
    expect(computeMomentumScore({ stageChangedAt: daysAgo(90) })).toBe(20);
  });

  it("awards 10 pts for stage change 91–180 days ago", () => {
    expect(computeMomentumScore({ stageChangedAt: daysAgo(91) })).toBe(10);
    expect(computeMomentumScore({ stageChangedAt: daysAgo(180) })).toBe(10);
  });

  it("awards 0 pts for stage change older than 180 days", () => {
    expect(computeMomentumScore({ stageChangedAt: daysAgo(181) })).toBe(0);
  });

  // ── lastContentChangeAt ────────────────────────────────────────────────────

  it("awards 20 pts for content update within 30 days", () => {
    expect(computeMomentumScore({ lastContentChangeAt: daysAgo(1) })).toBe(20);
    expect(computeMomentumScore({ lastContentChangeAt: daysAgo(30) })).toBe(20);
  });

  it("awards 15 pts for content update 31–60 days ago", () => {
    expect(computeMomentumScore({ lastContentChangeAt: daysAgo(31) })).toBe(15);
    expect(computeMomentumScore({ lastContentChangeAt: daysAgo(60) })).toBe(15);
  });

  it("awards 10 pts for content update 61–90 days ago", () => {
    expect(computeMomentumScore({ lastContentChangeAt: daysAgo(61) })).toBe(10);
    expect(computeMomentumScore({ lastContentChangeAt: daysAgo(90) })).toBe(10);
  });

  it("awards 5 pts for content update 91–180 days ago", () => {
    expect(computeMomentumScore({ lastContentChangeAt: daysAgo(91) })).toBe(5);
    expect(computeMomentumScore({ lastContentChangeAt: daysAgo(180) })).toBe(5);
  });

  it("awards 0 pts for content update older than 180 days", () => {
    expect(computeMomentumScore({ lastContentChangeAt: daysAgo(181) })).toBe(0);
  });

  // ── citedByCount ───────────────────────────────────────────────────────────

  it("awards 20 pts for citedByCount >= 50", () => {
    expect(computeMomentumScore({ citedByCount: 50 })).toBe(20);
    expect(computeMomentumScore({ citedByCount: 200 })).toBe(20);
  });

  it("awards 15 pts for citedByCount 20–49", () => {
    expect(computeMomentumScore({ citedByCount: 20 })).toBe(15);
    expect(computeMomentumScore({ citedByCount: 49 })).toBe(15);
  });

  it("awards 10 pts for citedByCount 10–19", () => {
    expect(computeMomentumScore({ citedByCount: 10 })).toBe(10);
    expect(computeMomentumScore({ citedByCount: 19 })).toBe(10);
  });

  it("awards 5 pts for citedByCount 5–9", () => {
    expect(computeMomentumScore({ citedByCount: 5 })).toBe(5);
    expect(computeMomentumScore({ citedByCount: 9 })).toBe(5);
  });

  it("awards 0 pts for citedByCount < 5", () => {
    expect(computeMomentumScore({ citedByCount: 4 })).toBe(0);
    expect(computeMomentumScore({ citedByCount: 0 })).toBe(0);
  });

  // ── firstSeenAt ────────────────────────────────────────────────────────────

  it("awards 20 pts for firstSeenAt within 14 days", () => {
    expect(computeMomentumScore({ firstSeenAt: daysAgo(1) })).toBe(20);
    expect(computeMomentumScore({ firstSeenAt: daysAgo(14) })).toBe(20);
  });

  it("awards 15 pts for firstSeenAt 15–30 days ago", () => {
    expect(computeMomentumScore({ firstSeenAt: daysAgo(15) })).toBe(15);
    expect(computeMomentumScore({ firstSeenAt: daysAgo(30) })).toBe(15);
  });

  it("awards 10 pts for firstSeenAt 31–60 days ago", () => {
    expect(computeMomentumScore({ firstSeenAt: daysAgo(31) })).toBe(10);
    expect(computeMomentumScore({ firstSeenAt: daysAgo(60) })).toBe(10);
  });

  it("awards 5 pts for firstSeenAt 61–90 days ago", () => {
    expect(computeMomentumScore({ firstSeenAt: daysAgo(61) })).toBe(5);
    expect(computeMomentumScore({ firstSeenAt: daysAgo(90) })).toBe(5);
  });

  it("awards 0 pts for firstSeenAt older than 90 days", () => {
    expect(computeMomentumScore({ firstSeenAt: daysAgo(91) })).toBe(0);
  });

  // ── invalid dates ──────────────────────────────────────────────────────────

  it("treats invalid date strings as very old (0 pts)", () => {
    expect(computeMomentumScore({ stageChangedAt: "not-a-date" })).toBe(0);
    expect(computeMomentumScore({ firstSeenAt: "not-a-date" })).toBe(0);
  });

  // ── additive + cap ─────────────────────────────────────────────────────────

  it("adds scores from all four signals", () => {
    // stage <=30: 40, content <=30: 20, cites>=50: 20, firstSeen<=14: 20 → capped 100
    const score = computeMomentumScore({
      stageChangedAt: daysAgo(1),
      lastContentChangeAt: daysAgo(1),
      citedByCount: 50,
      firstSeenAt: daysAgo(1),
    });
    expect(score).toBe(100);
  });

  it("never exceeds 100", () => {
    const score = computeMomentumScore({
      stageChangedAt: daysAgo(1),
      lastContentChangeAt: daysAgo(1),
      citedByCount: 500,
      firstSeenAt: daysAgo(1),
    });
    expect(score).toBeLessThanOrEqual(100);
  });

  // ── RISING_THRESHOLD ───────────────────────────────────────────────────────

  it("RISING_THRESHOLD is 40", () => {
    expect(RISING_THRESHOLD).toBe(40);
  });

  it("a recent stage change alone clears the RISING_THRESHOLD", () => {
    const score = computeMomentumScore({ stageChangedAt: daysAgo(1) });
    expect(score).toBeGreaterThanOrEqual(RISING_THRESHOLD);
  });

  it("stale asset (all signals old) does not clear RISING_THRESHOLD", () => {
    const score = computeMomentumScore({
      stageChangedAt: daysAgo(365),
      lastContentChangeAt: daysAgo(365),
      citedByCount: 0,
      firstSeenAt: daysAgo(365),
    });
    expect(score).toBeLessThan(RISING_THRESHOLD);
  });
});
