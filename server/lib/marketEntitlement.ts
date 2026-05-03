// Task #752 — Per-user EdenMarket entitlement.
//
// EdenMarket access can now be granted per-user (not just per-org). The
// entitlement is stored in supabase user_metadata.marketEntitlement and is
// either set by an admin (source: "admin") or auto-synced from a Stripe
// subscription (source: "stripe"). The helpers in this module compose the
// per-user entitlement with the existing org-level access so a user with
// either grant route is treated identically by gates and middleware.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { getMarketAccessState, type MarketAccessState } from "./marketAccess";

export type MarketEntitlementSource = "admin" | "stripe";

export type MarketEntitlement = {
  active: boolean;
  source: MarketEntitlementSource | null;
  grantedAt: string | null;
};

export type EffectiveMarketAccess = {
  access: boolean;
  fullAccess: boolean;
  inGrace: boolean;
  marketAccessExpiresAt: Date | null;
  source: "admin" | "stripe" | "org" | null;
  entitlement: MarketEntitlement | null;
  orgState: MarketAccessState;
};

let cachedAdmin: SupabaseClient | null = null;
function getAdminClient(): SupabaseClient | null {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  if (!cachedAdmin) cachedAdmin = createClient(url, key);
  return cachedAdmin;
}

function normalizeEntitlement(raw: unknown): MarketEntitlement | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.active !== "boolean") return null;
  const source = r.source === "admin" || r.source === "stripe" ? r.source : null;
  return {
    active: r.active,
    source,
    grantedAt: typeof r.grantedAt === "string" ? r.grantedAt : null,
  };
}

export async function getUserMarketEntitlement(userId: string): Promise<MarketEntitlement | null> {
  const sb = getAdminClient();
  if (!sb) return null;
  try {
    const { data } = await sb.auth.admin.getUserById(userId);
    const meta = (data?.user?.user_metadata ?? {}) as Record<string, unknown>;
    return normalizeEntitlement(meta.marketEntitlement);
  } catch {
    return null;
  }
}

export async function setUserMarketEntitlement(
  userId: string,
  payload: { active: boolean; source: MarketEntitlementSource },
): Promise<MarketEntitlement | null> {
  const sb = getAdminClient();
  if (!sb) throw new Error("SUPABASE_SERVICE_ROLE_KEY not configured");
  const { data: existing, error: fetchErr } = await sb.auth.admin.getUserById(userId);
  if (fetchErr || !existing?.user) throw new Error("User not found");
  const ent: MarketEntitlement = {
    active: !!payload.active,
    source: payload.source,
    grantedAt: payload.active ? new Date().toISOString() : null,
  };
  const meta = { ...(existing.user.user_metadata ?? {}), marketEntitlement: ent };
  const { error } = await sb.auth.admin.updateUserById(userId, { user_metadata: meta });
  if (error) throw new Error(error.message);
  return ent;
}

export async function getEffectiveMarketAccess(userId: string): Promise<EffectiveMarketAccess> {
  const [entitlement, org] = await Promise.all([
    getUserMarketEntitlement(userId),
    storage.getOrgForUser(userId).catch(() => null),
  ]);
  const orgState = getMarketAccessState(org);

  // Task #752 — entitlement is the source of truth. Precedence rules:
  //   1. entitlement.source = "admin", active = true   → ALLOW (full).
  //   2. entitlement.source = "admin", active = false  → DENY (admin
  //      revoke is authoritative; bypasses any org subscription).
  //   3. entitlement.source = "stripe", active = true  → ALLOW (full).
  //   4. entitlement.source = "stripe", active = false → fall back to
  //      org state. This covers grace periods (read-only via org) and
  //      keeps cross-portal users on shared org subs working.
  //   5. entitlement = null (never set) → fall back to org state.
  if (entitlement?.active) {
    return {
      access: true,
      fullAccess: true,
      inGrace: false,
      marketAccessExpiresAt: null,
      source: entitlement.source ?? "admin",
      entitlement,
      orgState,
    };
  }
  if (entitlement && !entitlement.active && entitlement.source === "admin") {
    return {
      access: false,
      fullAccess: false,
      inGrace: false,
      marketAccessExpiresAt: null,
      source: null,
      entitlement,
      orgState,
    };
  }
  return {
    access: orgState.hasRead,
    fullAccess: orgState.hasFullAccess,
    inGrace: orgState.inGrace,
    marketAccessExpiresAt: orgState.expiresAt,
    source: orgState.hasRead ? "org" : null,
    entitlement,
    orgState,
  };
}

// Convenience wrapper used inline at hundreds of route handlers in place of
// `hasMarketRead(org)`. Returns true if the user has either a per-user
// entitlement OR org-level read access.
export async function userHasMarketRead(
  userId: string | undefined,
  org: Parameters<typeof getMarketAccessState>[0],
): Promise<boolean> {
  // Same precedence rules as getEffectiveMarketAccess: an explicit
  // admin revoke (entitlement.source=admin, active=false) is
  // authoritative and overrides any org-level access.
  if (userId) {
    const ent = await getUserMarketEntitlement(userId);
    if (ent?.active) return true;
    if (ent && !ent.active && ent.source === "admin") return false;
  }
  return getMarketAccessState(org).hasRead;
}

export async function userHasMarketFullAccess(
  userId: string | undefined,
  org: Parameters<typeof getMarketAccessState>[0],
): Promise<boolean> {
  if (userId) {
    const ent = await getUserMarketEntitlement(userId);
    if (ent?.active) return true;
    if (ent && !ent.active && ent.source === "admin") return false;
  }
  return getMarketAccessState(org).hasFullAccess;
}

// Best-effort sync: when an org's EdenMarket subscription activates or
// terminates, mirror the new state to each member's user_metadata so admin
// grants and Stripe-driven grants share a single source of truth on the
// client. Failures are logged but do not abort webhook processing.
export async function syncOrgMembersMarketEntitlement(
  orgId: number,
  active: boolean,
): Promise<void> {
  try {
    const members = await storage.getOrgMembers(orgId);
    await Promise.all(
      members.map(async (m) => {
        try {
          // Admin-sourced entitlements are sticky in BOTH directions —
          // an admin grant or revoke is the source of truth and Stripe
          // sync events must never silently overwrite it.
          //   - On stripe activation (active=true): skip users with an
          //     admin revoke so they remain denied.
          //   - On stripe cancellation (active=false): skip users with
          //     an admin grant so they keep access.
          // Only an admin via PATCH /api/admin/users/:id/market-access
          // can flip an admin-sourced record.
          const existing = await getUserMarketEntitlement(m.userId);
          if (existing?.source === "admin") return;
          await setUserMarketEntitlement(m.userId, { active, source: "stripe" });
        } catch (err: any) {
          console.warn(`[market-entitlement] failed to sync user ${m.userId}: ${err?.message}`);
        }
      }),
    );
  } catch (err: any) {
    console.warn(`[market-entitlement] syncOrgMembersMarketEntitlement(org=${orgId}, active=${active}) failed: ${err?.message}`);
  }
}

// Express middleware variants that consider entitlement in addition to org
// access. These supersede the org-only middleware in marketAccess.ts.
export async function requireMarketAccessUser(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.headers["x-user-id"] as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const eff = await getEffectiveMarketAccess(userId);
    if (eff.access) return next();
    return res.status(403).json({ error: "EdenMarket subscription required" });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Server error" });
  }
}

export async function requireFullMarketAccessUser(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.headers["x-user-id"] as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const eff = await getEffectiveMarketAccess(userId);
    if (eff.fullAccess) return next();
    if (eff.inGrace) {
      return res.status(403).json({
        error: "EdenMarket is read-only during your grace period — reactivate your subscription to make changes.",
        marketGrace: true,
        marketAccessExpiresAt: eff.marketAccessExpiresAt,
      });
    }
    return res.status(403).json({ error: "EdenMarket subscription required" });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Server error" });
  }
}
