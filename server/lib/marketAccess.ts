// Task #714 — Shared EdenMarket access helpers and Express middleware.
//
// Two access tiers:
//   - hasMarketRead(org)        : edenMarketAccess flag is on (covers grace).
//   - hasMarketFullAccess(org)  : flag is on AND not in grace (writes only).
//
// During a 30-day grace period (after cancellation), `edenMarketAccess`
// stays true and `marketAccessExpiresAt` is set to (now + 30d). Once the
// expiry passes, both helpers return false — the lenient gate naturally
// rejects with 403 ("EdenMarket subscription required") and a follow-up
// reaper / next webhook can flip the flag off.

import type { Request, Response, NextFunction } from "express";
import { and, eq, lt } from "drizzle-orm";
import { organizations, appEvents, type Organization } from "@shared/schema";
import { db } from "../db";
import { storage } from "../storage";

export type MarketAccessState = {
  hasRead: boolean;
  hasFullAccess: boolean;
  inGrace: boolean;
  expired: boolean;
  expiresAt: Date | null;
};

export function getMarketAccessState(org: Pick<Organization, "edenMarketAccess" | "marketAccessExpiresAt"> | null | undefined): MarketAccessState {
  if (!org || !org.edenMarketAccess) {
    return { hasRead: false, hasFullAccess: false, inGrace: false, expired: false, expiresAt: null };
  }
  const expiresAt = org.marketAccessExpiresAt ? new Date(org.marketAccessExpiresAt) : null;
  if (!expiresAt) {
    return { hasRead: true, hasFullAccess: true, inGrace: false, expired: false, expiresAt: null };
  }
  const now = Date.now();
  if (expiresAt.getTime() <= now) {
    // Grace expired — treat as no access. The webhook + reaper jobs will
    // eventually clear the flag, but we don't want a stale `true` to grant
    // a free month of access if a job is delayed.
    return { hasRead: false, hasFullAccess: false, inGrace: false, expired: true, expiresAt };
  }
  return { hasRead: true, hasFullAccess: false, inGrace: true, expired: false, expiresAt };
}

export function hasMarketRead(org: Pick<Organization, "edenMarketAccess" | "marketAccessExpiresAt"> | null | undefined): boolean {
  return getMarketAccessState(org).hasRead;
}

export function hasMarketFullAccess(org: Pick<Organization, "edenMarketAccess" | "marketAccessExpiresAt"> | null | undefined): boolean {
  return getMarketAccessState(org).hasFullAccess;
}

// Reaper — finds orgs whose marketAccessExpiresAt has passed but whose
// edenMarketAccess flag is still true, flips the flag off, clears the
// timestamps, and writes one appEvents row per revocation. Returns the
// number of organizations revoked. Safe to call repeatedly: a no-op when
// no expired orgs are present.
export async function reapExpiredMarketAccess(reason: "startup" | "scheduled" = "scheduled"): Promise<number> {
  const now = new Date();
  // Atomic conditional update: re-evaluates `eden_market_access = true`
  // and `market_access_expires_at < now()` at write time, so a concurrent
  // reactivation (e.g. Stripe webhook clearing the grace timestamp) won't
  // be clobbered. RETURNING gives us only the rows actually revoked, which
  // we then audit in app_events.
  let revokedRows: { id: number; name: string; edenMarketStripeSubId: string | null }[] = [];
  try {
    revokedRows = await db
      .update(organizations)
      .set({
        edenMarketAccess: false,
        marketAccessExpiresAt: null,
        marketGraceEmailSentAt: null,
        updatedAt: now,
      })
      .where(and(eq(organizations.edenMarketAccess, true), lt(organizations.marketAccessExpiresAt, now)))
      .returning({
        id: organizations.id,
        name: organizations.name,
        edenMarketStripeSubId: organizations.edenMarketStripeSubId,
      });
  } catch (err: any) {
    console.warn(`[market-reaper] Update failed: ${err?.message}`);
    return 0;
  }

  if (revokedRows.length === 0) return 0;

  // RETURNING reflects post-update values, so marketAccessExpiresAt comes
  // back null. We log just the org id/name and the reason — the original
  // expiry timestamp is no longer available, which is acceptable for an
  // audit row (the timestamp had already lapsed).
  for (const org of revokedRows) {
    try {
      await db.insert(appEvents).values({
        event: "market_access_revoked",
        metadata: {
          orgId: org.id,
          orgName: org.name,
          reason,
          edenMarketStripeSubId: org.edenMarketStripeSubId ?? null,
          revokedAt: now.toISOString(),
        },
      });
      console.log(`[market-reaper] Revoked EdenMarket access for org #${org.id} (${org.name})`);
    } catch (err: any) {
      console.warn(`[market-reaper] Failed to log appEvent for org #${org.id}: ${err?.message}`);
    }
  }
  return revokedRows.length;
}

// Long-running interval handle so callers can stop the timer (tests, shutdown).
let reaperTimer: ReturnType<typeof setInterval> | null = null;

/** Start a 24-hour interval that calls reapExpiredMarketAccess(). Idempotent. */
export function startMarketAccessReaper(intervalMs: number = 24 * 60 * 60 * 1000): void {
  if (reaperTimer !== null) return;
  reaperTimer = setInterval(() => {
    reapExpiredMarketAccess("scheduled").catch((err: any) => {
      console.warn(`[market-reaper] Scheduled run failed: ${err?.message}`);
    });
  }, intervalMs);
  // Don't keep the event loop alive solely for the reaper.
  if (typeof reaperTimer.unref === "function") reaperTimer.unref();
}

export function stopMarketAccessReaper(): void {
  if (reaperTimer !== null) {
    clearInterval(reaperTimer);
    reaperTimer = null;
  }
}

// Express middleware — chained AFTER verifyAnyAuth so x-user-id is set.
// Lenient gate: allows reads during grace.
export async function requireMarketAccess(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.headers["x-user-id"] as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const org = await storage.getOrgForUser(userId);
    if (!hasMarketRead(org)) {
      return res.status(403).json({ error: "EdenMarket subscription required" });
    }
    next();
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Server error" });
  }
}

// Strict gate: rejects during grace with a 403 and a `graceExpired: false`
// hint so the client can show a "Reactivate to perform this action" CTA.
export async function requireFullMarketAccess(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.headers["x-user-id"] as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const org = await storage.getOrgForUser(userId);
    const state = getMarketAccessState(org);
    if (state.hasFullAccess) return next();
    if (state.inGrace) {
      return res.status(403).json({
        error: "EdenMarket is read-only during your grace period — reactivate your subscription to make changes.",
        marketGrace: true,
        marketAccessExpiresAt: state.expiresAt,
      });
    }
    return res.status(403).json({ error: "EdenMarket subscription required" });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Server error" });
  }
}
