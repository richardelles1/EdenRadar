import type { Request, Response } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { appEvents } from "@shared/schema";
import { tryGetUserId } from "./supabaseAuth";

export async function resolveAuthorName(userId: string | null): Promise<string> {
  if (!userId) return "Team Member";
  try {
    const profile = await storage.getIndustryProfileByUserId(userId);
    if (profile?.userName?.trim()) return profile.userName.trim();
  } catch { /* fall through */ }
  return "Team Member";
}

export async function logTeamActivity(
  userId: string | null,
  action: string,
  assetId: number | null,
  assetFingerprint: string | null,
  assetName: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  if (!userId) return;
  try {
    const org = await storage.getOrgForUser(userId);
    const member = org ? await storage.getOrgMemberByUserId(org.id, userId) : undefined;
    const actorName =
      (member?.memberName?.trim() || null) ?? (await resolveAuthorName(userId));
    let fp = assetFingerprint;
    if (!fp && assetId != null) {
      try {
        const rows = await db.execute(sql`SELECT fingerprint FROM ingested_assets WHERE id = ${assetId} LIMIT 1`);
        const row = rows.rows[0] as { fingerprint?: string } | undefined;
        fp = row?.fingerprint ?? null;
      } catch { /* ignore */ }
    }
    await storage.createTeamActivity({
      orgId: org?.id ?? null,
      userId,
      actorName,
      action,
      assetId: assetId ?? null,
      assetFingerprint: fp ?? null,
      assetName,
      metadata: metadata ?? null,
    });
  } catch (e) {
    console.error("[team-activity] Failed to log:", e);
  }
}

export function logAppEvent(event: string, metadata?: Record<string, unknown>): void {
  db.insert(appEvents).values({ event, metadata: metadata ?? null }).catch((e) => {
    console.error("[app-events] Failed to log:", e);
  });
}

export async function canMutatePipeline(
  pipeline: { userId: string | null; orgId: number | null },
  requestUserId: string | null
): Promise<boolean> {
  if (!requestUserId) return false;
  // Null-owner pipelines: grant access only if requester shares the same org
  if (pipeline.userId === null) {
    if (!pipeline.orgId) return false;
    const requesterOrg = await storage.getOrgForUser(requestUserId);
    return !!requesterOrg && requesterOrg.id === pipeline.orgId;
  }
  if (pipeline.userId === requestUserId) return true;
  if (pipeline.orgId) {
    const requesterOrg = await storage.getOrgForUser(requestUserId);
    if (requesterOrg && requesterOrg.id === pipeline.orgId) return true;
  }
  return false;
}

export async function canAccessSavedAsset(
  asset: { userId: string | null },
  requestUserId: string | null
): Promise<boolean> {
  if (!requestUserId) return false;
  // Legacy rows with no owner are visible to all authenticated industry users (backward compat).
  if (asset.userId === null) return true;
  if (asset.userId === requestUserId) return true;
  if (asset.userId) {
    const [assetOwnerOrg, requesterOrg] = await Promise.all([
      storage.getOrgForUser(asset.userId),
      storage.getOrgForUser(requestUserId),
    ]);
    if (assetOwnerOrg && requesterOrg && assetOwnerOrg.id === requesterOrg.id) return true;
  }
  return false;
}

export async function requireOrgOwner(
  req: Request,
  res: Response
): Promise<{ org: any; userId: string } | null> {
  const userId = req.headers["x-user-id"] as string;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return null; }
  const org = await storage.getOrgForUser(userId);
  if (!org) { res.status(404).json({ error: "No organization found for this user" }); return null; }
  const member = await storage.getOrgMemberByUserId(org.id, userId);
  if (!member || member.role !== "owner") {
    res.status(403).json({ error: "Only the org owner can perform this action" });
    return null;
  }
  return { org, userId };
}

export async function requireOrgAdminOrOwner(
  req: Request,
  res: Response
): Promise<{ org: any; userId: string } | null> {
  const userId = req.headers["x-user-id"] as string;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return null; }
  const org = await storage.getOrgForUser(userId);
  if (!org) { res.status(404).json({ error: "No organization found for this user" }); return null; }
  const member = await storage.getOrgMemberByUserId(org.id, userId);
  if (!member || (member.role !== "owner" && member.role !== "admin")) {
    res.status(403).json({ error: "Only org owners and admins can invite team members" });
    return null;
  }
  return { org, userId };
}

// Returns false and sends 403 if the calling user is a viewer (read-only org role).
// Uses the verified JWT identity (tryGetUserId) — not the client-supplied x-user-id header —
// so a viewer cannot spoof a non-viewer identity to bypass this guard.
export async function requireNotViewer(req: Request, res: Response): Promise<boolean> {
  const userId = await tryGetUserId(req);
  if (!userId) return true; // unauthenticated — let downstream handle
  const org = await storage.getOrgForUser(userId);
  if (!org) return true; // solo user, no viewer concept
  const member = await storage.getOrgMemberByUserId(org.id, userId);
  if (member?.role === "viewer") {
    res.status(403).json({ error: "Viewers have read-only access" });
    return false;
  }
  return true;
}
