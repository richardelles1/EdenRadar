/**
 * MCP Auth — resolves an incoming request's API key to an AccessTier.
 *
 * Free tier: no key, rate-limited by IP (20 req/hr, in-memory).
 * All other tiers: look up eden_ key in api_keys table, read .tier field.
 */

import crypto from "crypto";
import type { IncomingMessage } from "node:http";
import { db } from "../db";
import { apiKeys, apiUsageLogs } from "../../shared/schema";
import { eq } from "drizzle-orm";
import type { AccessTier } from "./config";
import { FREE_RATE_LIMIT_PER_HOUR } from "./config";

// In-memory IP rate limit store.  key = ip, value = { count, windowStart }
// Resets on server restart — acceptable for free-tier abuse prevention.
const ipWindows = new Map<string, { count: number; windowStart: number }>();

function hourWindowStart(): number {
  return Math.floor(Date.now() / 3_600_000) * 3_600_000;
}

export function checkFreeRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = hourWindowStart();
  const existing = ipWindows.get(ip);

  if (!existing || existing.windowStart < now) {
    ipWindows.set(ip, { count: 1, windowStart: now });
    return { allowed: true, remaining: FREE_RATE_LIMIT_PER_HOUR - 1 };
  }

  existing.count += 1;
  const remaining = Math.max(0, FREE_RATE_LIMIT_PER_HOUR - existing.count);
  return { allowed: existing.count <= FREE_RATE_LIMIT_PER_HOUR, remaining };
}

export interface ResolvedAuth {
  tier: AccessTier;
  userId?: string;
  orgId?: number;
  keyId?: number;
  keyPrefix?: string;
}

function hashKey(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function extractRawKey(req: IncomingMessage): string | null {
  const auth = (req.headers["authorization"] as string | undefined) ?? "";
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim() || null;
  const xApiKey = (req.headers["x-api-key"] as string | undefined) ?? "";
  return xApiKey.trim() || null;
}

export async function resolveAuth(req: IncomingMessage): Promise<ResolvedAuth> {
  const raw = extractRawKey(req);
  if (!raw) return { tier: "free" };

  const hash = hashKey(raw);

  let rows: (typeof apiKeys.$inferSelect)[];
  try {
    rows = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, hash)).limit(1);
  } catch {
    return { tier: "free" };
  }

  const key = rows[0];
  if (!key || key.status !== "active") return { tier: "free" };
  if (key.expiresAt && new Date(key.expiresAt) < new Date()) return { tier: "free" };

  // api_keys.tier is "starter" | "professional" | "enterprise" — maps 1:1 to AccessTier
  const tier = key.tier as AccessTier;

  // Fire-and-forget lastUsedAt update
  db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, key.id)).catch(() => {});

  return {
    tier,
    userId: key.userId,
    orgId: key.orgId ?? undefined,
    keyId: key.id,
    keyPrefix: key.keyPrefix,
  };
}

export function logMcpUsage(
  auth: ResolvedAuth,
  endpoint: string,
  statusCode: number,
  responseTimeMs: number,
  ipAddress: string | null,
): void {
  db.insert(apiUsageLogs).values({
    keyId: auth.keyId ?? null,
    keyPrefix: auth.keyPrefix ?? null,
    userId: auth.userId ?? null,
    orgId: auth.orgId ?? null,
    orgName: null,
    endpoint,
    method: "POST",
    statusCode,
    responseTimeMs,
    ipAddress,
    userAgent: "mcp-client",
  }).catch(() => {});
}
