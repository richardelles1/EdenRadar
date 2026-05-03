// Task #738 — Weekly Recap assembler + Monday scheduler.
//
// Computes a per-org weekly snapshot of: new ingested assets, team/saving
// activity, top searches, market signals, EdenMarket new listings, "worth
// a look" highlights, and week-over-week deltas. Written to weekly_recaps
// (see shared/schema.ts). The same assembler powers both the live preview
// of the in-progress week and the Monday job that freezes the prior week.

import { and, desc, eq, gte, lt, inArray, sql } from "drizzle-orm";
import {
  ingestedAssets,
  teamActivities,
  savedAssets,
  searchHistory,
  marketListings,
  userAlerts,
  orgMembers,
  organizations,
  weeklyRecaps,
  type WeeklyRecap,
} from "@shared/schema";
import { db } from "../db";
import { storage } from "../storage";

// ── Week boundary helpers (UTC, Monday 00:00) ──────────────────────────────

export function startOfWeek(d: Date = new Date()): Date {
  // Monday-based week. getUTCDay(): Sun=0, Mon=1 … Sat=6.
  const day = d.getUTCDay();
  const offset = day === 0 ? 6 : day - 1;
  const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  out.setUTCDate(out.getUTCDate() - offset);
  return out;
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}

export function endOfWeek(weekStart: Date): Date {
  return addDays(weekStart, 7);
}

export function previousWeekStart(weekStart: Date): Date {
  return addDays(weekStart, -7);
}

export function formatWeekLabel(weekStart: Date): string {
  const end = addDays(weekStart, 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return `Week of ${fmt(weekStart)} – ${fmt(end)}`;
}

// ── Recap payload ──────────────────────────────────────────────────────────

export type RecapHighlight = {
  id: number;
  assetName: string;
  institution: string | null;
  modality: string | null;
  indication: string | null;
  reason?: string;
};

export type RecapActivityEntry = {
  action: string;
  actorName: string;
  userId: string;
  assetId: number | null;
  assetName: string;
  at: string;
};

export type RecapSearchEntry = {
  query: string;
  count: number;
};

export type RecapMarketSignal = {
  alertName: string;
  matchCount: number;
  topAssets: RecapHighlight[];
};

export type WeeklyRecapPayload = {
  weekStart: string;       // ISO
  weekEnd: string;         // ISO (exclusive)
  weekLabel: string;
  isSolo: boolean;
  memberCount: number;
  summary: string;
  counts: {
    newAssets: number;
    saves: number;
    statusChanges: number;
    marketListings: number;
  };
  deltas?: {
    newAssets: number;
    saves: number;
    statusChanges: number;
    marketListings: number;
  };
  newAssets?: {
    total: number;
    byModality: Array<{ modality: string; count: number }>;
    top: RecapHighlight[];
  };
  activity?: {
    label: "Team activity" | "Your activity";
    entries: RecapActivityEntry[];
  };
  topSearches?: RecapSearchEntry[];
  marketSignals?: RecapMarketSignal[];
  edenMarket?: {
    count: number;
  };
  worthALook?: RecapHighlight[];
};

// ── Assembler ──────────────────────────────────────────────────────────────

export async function assembleRecap(
  orgId: number,
  weekStart: Date,
): Promise<WeeklyRecapPayload> {
  const weekEnd = endOfWeek(weekStart);

  const memberRows = await db
    .select({ userId: orgMembers.userId })
    .from(orgMembers)
    .where(eq(orgMembers.orgId, orgId));
  const memberCount = memberRows.length;
  const isSolo = memberCount <= 1;
  const memberUserIds = memberRows.map((m) => m.userId);

  // 1. New ingested assets this week
  const newAssetRows = await db
    .select({
      id: ingestedAssets.id,
      assetName: ingestedAssets.assetName,
      institution: ingestedAssets.institution,
      modality: ingestedAssets.modality,
      indication: ingestedAssets.indication,
      firstSeenAt: ingestedAssets.firstSeenAt,
      completenessScore: ingestedAssets.completenessScore,
      sourceName: ingestedAssets.sourceName,
    })
    .from(ingestedAssets)
    .where(and(gte(ingestedAssets.firstSeenAt, weekStart), lt(ingestedAssets.firstSeenAt, weekEnd)))
    .orderBy(desc(ingestedAssets.firstSeenAt))
    .limit(500);

  const modalityCounts = new Map<string, number>();
  for (const a of newAssetRows) {
    const m = (a.modality || "unknown").toLowerCase();
    modalityCounts.set(m, (modalityCounts.get(m) ?? 0) + 1);
  }
  const byModality = Array.from(modalityCounts.entries())
    .map(([modality, count]) => ({ modality, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const topNewAssets: RecapHighlight[] = newAssetRows.slice(0, 5).map((a) => ({
    id: a.id,
    assetName: a.assetName,
    institution: a.institution ?? null,
    modality: a.modality ?? null,
    indication: a.indication ?? null,
  }));

  // 2. Team activity (org-scoped)
  const activityRows = await db
    .select()
    .from(teamActivities)
    .where(and(
      eq(teamActivities.orgId, orgId),
      gte(teamActivities.createdAt, weekStart),
      lt(teamActivities.createdAt, weekEnd),
    ))
    .orderBy(desc(teamActivities.createdAt))
    .limit(50);

  const saves = activityRows.filter((a) => a.action === "saved_asset").length;
  const statusChanges = activityRows.filter((a) => a.action === "moved_asset").length;

  const activityEntries: RecapActivityEntry[] = activityRows.slice(0, 12).map((a) => ({
    action: a.action,
    actorName: a.actorName,
    userId: a.userId,
    assetId: a.assetId,
    assetName: a.assetName,
    at: a.createdAt.toISOString(),
  }));

  // 3. Top searches (org members in window)
  let topSearches: RecapSearchEntry[] = [];
  if (memberUserIds.length > 0) {
    const searchRows = await db
      .select({ query: searchHistory.query })
      .from(searchHistory)
      .where(and(
        inArray(searchHistory.userId, memberUserIds),
        gte(searchHistory.createdAt, weekStart),
        lt(searchHistory.createdAt, weekEnd),
      ))
      .limit(500);
    const tally = new Map<string, number>();
    for (const r of searchRows) {
      const q = (r.query ?? "").trim();
      if (!q) continue;
      const k = q.toLowerCase();
      tally.set(k, (tally.get(k) ?? 0) + 1);
    }
    topSearches = Array.from(tally.entries())
      .map(([query, count]) => ({ query, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }

  // 4. Saved filters (user_alerts) — used for market signals + worth-a-look ranking
  let alertRows: Array<{
    id: number;
    name: string | null;
    modalities: string[] | null;
    stages: string[] | null;
    institutions: string[] | null;
    query: string | null;
  }> = [];
  if (memberUserIds.length > 0) {
    alertRows = await db
      .select({
        id: userAlerts.id,
        name: userAlerts.name,
        modalities: userAlerts.modalities,
        stages: userAlerts.stages,
        institutions: userAlerts.institutions,
        query: userAlerts.query,
      })
      .from(userAlerts)
      .where(and(inArray(userAlerts.userId, memberUserIds), eq(userAlerts.enabled, true)))
      .limit(50);
  }

  function matchesAlert(asset: typeof newAssetRows[number], alert: typeof alertRows[number]): boolean {
    if (alert.modalities && alert.modalities.length > 0) {
      const m = (asset.modality || "").toLowerCase();
      if (!alert.modalities.some((x) => x.toLowerCase() === m)) return false;
    }
    if (alert.institutions && alert.institutions.length > 0) {
      const inst = (asset.institution || "").toLowerCase();
      if (!alert.institutions.some((x) => x.toLowerCase() === inst)) return false;
    }
    if (alert.query && alert.query.trim()) {
      const q = alert.query.toLowerCase();
      const hay = `${asset.assetName} ${asset.indication ?? ""} ${asset.modality ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }

  // 5. Market signals — per saved alert, list top matching new assets
  const marketSignals: RecapMarketSignal[] = [];
  for (const alert of alertRows) {
    const matches = newAssetRows.filter((a) => matchesAlert(a, alert));
    if (matches.length === 0) continue;
    marketSignals.push({
      alertName: alert.name?.trim() || "Unnamed alert",
      matchCount: matches.length,
      topAssets: matches.slice(0, 3).map((a) => ({
        id: a.id,
        assetName: a.assetName,
        institution: a.institution ?? null,
        modality: a.modality ?? null,
        indication: a.indication ?? null,
      })),
    });
  }

  // 6. EdenMarket new listings (org-agnostic — count platform-wide new listings)
  const marketRows = await db
    .select({ id: marketListings.id })
    .from(marketListings)
    .where(and(
      eq(marketListings.status, "active"),
      gte(marketListings.createdAt, weekStart),
      lt(marketListings.createdAt, weekEnd),
    ));
  const marketListingsCount = marketRows.length;

  // 7. Worth a look — score new assets by alert matches + completeness, top 3
  const scored = newAssetRows.map((a) => {
    let score = a.completenessScore ?? 0;
    let matched = 0;
    for (const alert of alertRows) {
      if (matchesAlert(a, alert)) matched++;
    }
    score += matched * 50;
    return { asset: a, score, matched };
  });
  scored.sort((x, y) => y.score - x.score);
  const worthALook: RecapHighlight[] = scored
    .filter((s) => s.matched > 0 || (s.asset.completenessScore ?? 0) >= 70)
    .slice(0, 3)
    .map((s) => ({
      id: s.asset.id,
      assetName: s.asset.assetName,
      institution: s.asset.institution ?? null,
      modality: s.asset.modality ?? null,
      indication: s.asset.indication ?? null,
      reason: s.matched > 0
        ? `Matches ${s.matched} of your saved filter${s.matched === 1 ? "" : "s"}`
        : "High-completeness new arrival",
    }));

  // 8. Week-over-week deltas (vs prior recap if exists)
  const prevStart = previousWeekStart(weekStart);
  const [prevRecap] = await db
    .select()
    .from(weeklyRecaps)
    .where(and(eq(weeklyRecaps.orgId, orgId), eq(weeklyRecaps.weekStartDate, prevStart)))
    .limit(1);

  let deltas: WeeklyRecapPayload["deltas"] | undefined;
  if (prevRecap) {
    const prev = (prevRecap.payload as unknown as WeeklyRecapPayload).counts ?? {
      newAssets: 0, saves: 0, statusChanges: 0, marketListings: 0,
    };
    deltas = {
      newAssets: newAssetRows.length - (prev.newAssets ?? 0),
      saves: saves - (prev.saves ?? 0),
      statusChanges: statusChanges - (prev.statusChanges ?? 0),
      marketListings: marketListingsCount - (prev.marketListings ?? 0),
    };
  }

  // 9. Summary headline (template-based, solo vs team aware)
  const summary = buildSummary({
    isSolo,
    newAssetsCount: newAssetRows.length,
    saves,
    statusChanges,
  });

  const payload: WeeklyRecapPayload = {
    weekStart: weekStart.toISOString(),
    weekEnd: weekEnd.toISOString(),
    weekLabel: formatWeekLabel(weekStart),
    isSolo,
    memberCount,
    summary,
    counts: {
      newAssets: newAssetRows.length,
      saves,
      statusChanges,
      marketListings: marketListingsCount,
    },
    ...(deltas ? { deltas } : {}),
    ...(newAssetRows.length > 0
      ? { newAssets: { total: newAssetRows.length, byModality, top: topNewAssets } }
      : {}),
    ...(activityEntries.length > 0
      ? {
          activity: {
            label: isSolo ? "Your activity" : "Team activity",
            entries: activityEntries,
          },
        }
      : {}),
    ...(topSearches.length > 0 ? { topSearches } : {}),
    ...(marketSignals.length > 0 ? { marketSignals } : {}),
    ...(marketListingsCount > 0 ? { edenMarket: { count: marketListingsCount } } : {}),
    ...(worthALook.length > 0 ? { worthALook } : {}),
  };

  return payload;
}

function buildSummary(p: {
  isSolo: boolean;
  newAssetsCount: number;
  saves: number;
  statusChanges: number;
}): string {
  const parts: string[] = [];
  parts.push(`${p.newAssetsCount} new TTO listing${p.newAssetsCount === 1 ? "" : "s"}`);
  if (p.isSolo) {
    if (p.saves > 0) parts.push(`you saved ${p.saves}`);
    if (p.statusChanges > 0) parts.push(`moved ${p.statusChanges} to a new stage`);
  } else {
    if (p.saves > 0) parts.push(`${p.saves} saved`);
    if (p.statusChanges > 0) parts.push(`${p.statusChanges} moved to a new stage`);
  }
  if (parts.length === 1 && p.newAssetsCount === 0) {
    return p.isSolo
      ? "A quiet week — no new arrivals matched your radar."
      : "A quiet week — no new arrivals to share.";
  }
  return parts.join(", ") + ".";
}

// ── Persistence helpers ────────────────────────────────────────────────────

export async function getStoredRecap(orgId: number, weekStart: Date): Promise<WeeklyRecap | null> {
  const [row] = await db
    .select()
    .from(weeklyRecaps)
    .where(and(eq(weeklyRecaps.orgId, orgId), eq(weeklyRecaps.weekStartDate, weekStart)))
    .limit(1);
  return row ?? null;
}

export async function upsertRecap(
  orgId: number,
  weekStart: Date,
  payload: WeeklyRecapPayload,
  frozen: boolean,
): Promise<WeeklyRecap> {
  const existing = await getStoredRecap(orgId, weekStart);
  if (existing) {
    const [updated] = await db
      .update(weeklyRecaps)
      .set({ payload: payload as unknown as Record<string, unknown>, frozen, generatedAt: new Date() })
      .where(eq(weeklyRecaps.id, existing.id))
      .returning();
    return updated;
  }
  const [inserted] = await db
    .insert(weeklyRecaps)
    .values({ orgId, weekStartDate: weekStart, payload: payload as unknown as Record<string, unknown>, frozen })
    .returning();
  return inserted;
}

export async function listRecaps(orgId: number, limit = 12): Promise<Array<{
  weekStartDate: Date;
  weekLabel: string;
  frozen: boolean;
  generatedAt: Date;
}>> {
  const rows = await db
    .select({
      weekStartDate: weeklyRecaps.weekStartDate,
      payload: weeklyRecaps.payload,
      frozen: weeklyRecaps.frozen,
      generatedAt: weeklyRecaps.generatedAt,
    })
    .from(weeklyRecaps)
    .where(eq(weeklyRecaps.orgId, orgId))
    .orderBy(desc(weeklyRecaps.weekStartDate))
    .limit(limit);
  return rows.map((r) => ({
    weekStartDate: r.weekStartDate,
    weekLabel:
      ((r.payload as unknown as WeeklyRecapPayload)?.weekLabel as string) ||
      formatWeekLabel(r.weekStartDate),
    frozen: r.frozen,
    generatedAt: r.generatedAt,
  }));
}

// ── Monday job: assemble + freeze the prior week for every org ─────────────

export async function runWeeklyRecapJob(opts: { force?: boolean } = {}): Promise<{ orgsProcessed: number; created: number }> {
  const thisWeek = startOfWeek(new Date());
  const targetWeek = previousWeekStart(thisWeek);

  const orgs = await db.select({ id: organizations.id }).from(organizations);
  let created = 0;
  for (const org of orgs) {
    try {
      const existing = await getStoredRecap(org.id, targetWeek);
      if (existing && existing.frozen && !opts.force) continue;
      const payload = await assembleRecap(org.id, targetWeek);
      await upsertRecap(org.id, targetWeek, payload, true);
      created++;
    } catch (err: any) {
      console.warn(`[weekly-recap] Org #${org.id} assembly failed: ${err?.message}`);
    }
  }
  return { orgsProcessed: orgs.length, created };
}

// Backfill: ensure every org has a recap for the most recently completed week.
export async function backfillLatestRecaps(): Promise<{ orgsProcessed: number; created: number }> {
  return runWeeklyRecapJob({ force: false });
}

// ── Scheduler — checks hourly, runs the job once on Mondays (UTC) ──────────

let recapTimer: ReturnType<typeof setInterval> | null = null;
let lastRanWeekKey: string | null = null;

function isMondayUTC(d: Date): boolean {
  return d.getUTCDay() === 1;
}

export function startWeeklyRecapScheduler(intervalMs: number = 60 * 60 * 1000): void {
  if (recapTimer !== null) return;
  const tick = async () => {
    const now = new Date();
    if (!isMondayUTC(now)) return;
    const weekKey = startOfWeek(now).toISOString();
    if (lastRanWeekKey === weekKey) return;
    try {
      const result = await runWeeklyRecapJob();
      lastRanWeekKey = weekKey;
      console.log(`[weekly-recap] Monday job: processed ${result.orgsProcessed} orgs, wrote ${result.created} recaps`);
    } catch (err: any) {
      console.warn(`[weekly-recap] Scheduled run failed: ${err?.message}`);
    }
  };
  recapTimer = setInterval(tick, intervalMs);
  if (typeof recapTimer.unref === "function") recapTimer.unref();
  // Fire once on startup as well — harmless if not Monday or already done.
  tick().catch(() => {});
}

export function stopWeeklyRecapScheduler(): void {
  if (recapTimer !== null) {
    clearInterval(recapTimer);
    recapTimer = null;
  }
}

// Resolve the org for the current request user, returning null if none.
export async function resolveRequestOrgId(userId: string | undefined): Promise<number | null> {
  if (!userId) return null;
  const org = await storage.getOrgForUser(userId);
  return org?.id ?? null;
}
