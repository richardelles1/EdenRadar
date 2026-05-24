import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import { db } from "../db";
import { apiKeys, apiUsageLogs, apiRateLimitWindows } from "../../shared/schema";
import { eq, sql } from "drizzle-orm";
import type { ApiKey } from "../../shared/schema";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      apiKey?: ApiKey;
    }
  }
}

function hashKey(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function todayUTC(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function logUsage(
  keyId: number | null,
  keyPrefix: string | null,
  userId: string | null,
  orgId: number | null,
  orgName: string | null,
  endpoint: string,
  method: string,
  statusCode: number,
  responseTimeMs: number,
  ipAddress: string | null,
  userAgent: string | null,
): void {
  db.insert(apiUsageLogs).values({
    keyId,
    keyPrefix,
    userId,
    orgId,
    orgName,
    endpoint,
    method,
    statusCode,
    responseTimeMs,
    ipAddress,
    userAgent,
  }).catch(() => {});
}

export function requireApiKey(requiredScope?: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    const ip =
      (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ??
      req.socket.remoteAddress ??
      null;
    const ua = (req.headers["user-agent"] as string | undefined) ?? null;
    const endpoint = req.path;
    const method = req.method;

    // Accept Authorization: Bearer <key> or X-Api-Key: <key>
    const authHeader = (req.headers.authorization as string | undefined) ?? "";
    const raw = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : ((req.headers["x-api-key"] as string | undefined) ?? "").trim();

    if (!raw) {
      res.status(401).json({ error: "API key required", code: "missing_key" });
      logUsage(null, null, null, null, null, endpoint, method, 401, Date.now() - start, ip, ua);
      return;
    }

    const hash = hashKey(raw);

    let key: ApiKey | undefined;
    try {
      const rows = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, hash)).limit(1);
      key = rows[0];
    } catch {
      res.status(500).json({ error: "Internal error", code: "db_error" });
      return;
    }

    if (!key) {
      res.status(401).json({ error: "Invalid API key", code: "invalid_key" });
      logUsage(null, raw.slice(0, 8), null, null, null, endpoint, method, 401, Date.now() - start, ip, ua);
      return;
    }

    if (key.status !== "active") {
      const code = key.status === "suspended" ? "key_suspended" : "key_revoked";
      res.status(401).json({ error: `API key is ${key.status}`, code });
      logUsage(key.id, key.keyPrefix, key.userId, key.orgId ?? null, key.orgName ?? null, endpoint, method, 401, Date.now() - start, ip, ua);
      return;
    }

    if (key.expiresAt && new Date(key.expiresAt) < new Date()) {
      res.status(401).json({ error: "API key has expired", code: "key_expired" });
      logUsage(key.id, key.keyPrefix, key.userId, key.orgId ?? null, key.orgName ?? null, endpoint, method, 401, Date.now() - start, ip, ua);
      return;
    }

    if (requiredScope) {
      const scopes = (key.scopes as string[]) ?? [];
      if (!scopes.includes(requiredScope)) {
        res.status(403).json({ error: `Scope required: ${requiredScope}`, code: "insufficient_scope" });
        logUsage(key.id, key.keyPrefix, key.userId, key.orgId ?? null, key.orgName ?? null, endpoint, method, 403, Date.now() - start, ip, ua);
        return;
      }
    }

    // Daily rate limit — atomic upsert resets the window when it rolls over midnight UTC
    const effectiveLimit = key.limitOverride ?? key.dailyLimit;
    const todayStart = todayUTC();

    try {
      const result = await db.execute(sql`
        INSERT INTO api_rate_limit_windows (key_id, window_start, call_count, updated_at)
        VALUES (${key.id}, ${todayStart.toISOString()}::timestamptz, 1, NOW())
        ON CONFLICT (key_id) DO UPDATE
          SET call_count   = CASE
                               WHEN api_rate_limit_windows.window_start < ${todayStart.toISOString()}::timestamptz
                               THEN 1
                               ELSE api_rate_limit_windows.call_count + 1
                             END,
              window_start = CASE
                               WHEN api_rate_limit_windows.window_start < ${todayStart.toISOString()}::timestamptz
                               THEN ${todayStart.toISOString()}::timestamptz
                               ELSE api_rate_limit_windows.window_start
                             END,
              updated_at   = NOW()
        RETURNING call_count
      `);

      const callCount = (result.rows[0] as { call_count: number }).call_count;

      res.setHeader("X-RateLimit-Limit", String(effectiveLimit));
      res.setHeader("X-RateLimit-Remaining", String(Math.max(0, effectiveLimit - callCount)));

      if (callCount > effectiveLimit) {
        res.setHeader("Retry-After", "86400");
        res.status(429).json({ error: "Daily rate limit exceeded", code: "rate_limit_exceeded", limit: effectiveLimit });
        logUsage(key.id, key.keyPrefix, key.userId, key.orgId ?? null, key.orgName ?? null, endpoint, method, 429, Date.now() - start, ip, ua);
        return;
      }
    } catch (err) {
      // Fail open — a rate-limit DB hiccup should not block legitimate requests
      console.error("[apiKeyAuth] Rate limit check failed:", err);
    }

    // Update last_used_at async — don't await, never blocks the request
    db.update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.id, key.id))
      .catch(() => {});

    req.apiKey = key;

    // Log after the response is flushed so we capture the real status code
    res.on("finish", () => {
      logUsage(
        key!.id, key!.keyPrefix, key!.userId, key!.orgId ?? null, key!.orgName ?? null,
        endpoint, method, res.statusCode, Date.now() - start, ip, ua,
      );
    });

    next();
  };
}
