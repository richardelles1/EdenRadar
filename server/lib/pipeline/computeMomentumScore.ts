export type MomentumInput = {
  stageChangedAt?: Date | string | null;
  lastContentChangeAt?: Date | string | null;
  firstSeenAt?: Date | string | null;
  citedByCount?: number | null;
};

function daysSince(d: Date | string | null | undefined): number {
  if (!d) return 9999;
  const date = d instanceof Date ? d : new Date(String(d));
  if (isNaN(date.getTime())) return 9999;
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Computes a 0–100 momentum score for an asset.
 *
 * Signals (in priority order):
 *   stage_change   0–40 pts  (clinical advancement is the strongest signal)
 *   content_update 0–20 pts  (recent portal activity)
 *   citations      0–20 pts  (scientific citation count as a proxy for traction)
 *   first_indexed  0–20 pts  (newly discovered assets are "in motion")
 *
 * "Rising" badge threshold: score >= 40 (at least one strong signal present).
 */
export function computeMomentumScore(input: MomentumInput): number {
  let score = 0;

  // Stage advancement — most impactful signal
  const stageDays = daysSince(input.stageChangedAt);
  if (stageDays <= 30)       score += 40;
  else if (stageDays <= 60)  score += 30;
  else if (stageDays <= 90)  score += 20;
  else if (stageDays <= 180) score += 10;

  // Content update — portal activity signal
  const contentDays = daysSince(input.lastContentChangeAt);
  if (contentDays <= 30)       score += 20;
  else if (contentDays <= 60)  score += 15;
  else if (contentDays <= 90)  score += 10;
  else if (contentDays <= 180) score += 5;

  // Citation count — scientific traction proxy
  const cites = input.citedByCount ?? 0;
  if (cites >= 50)      score += 20;
  else if (cites >= 20) score += 15;
  else if (cites >= 10) score += 10;
  else if (cites >= 5)  score += 5;

  // Newly indexed — new to the database
  const firstDays = daysSince(input.firstSeenAt);
  if (firstDays <= 14)       score += 20;
  else if (firstDays <= 30)  score += 15;
  else if (firstDays <= 60)  score += 10;
  else if (firstDays <= 90)  score += 5;

  return Math.min(100, score);
}

export const RISING_THRESHOLD = 40;
