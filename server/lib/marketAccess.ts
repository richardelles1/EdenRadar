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
import type { Organization } from "@shared/schema";
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
