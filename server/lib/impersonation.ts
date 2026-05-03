import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { createClient } from "@supabase/supabase-js";
import { getAdminEmails } from "./supabaseAuth";

// HMAC secret derived from SUPABASE_SERVICE_ROLE_KEY so no new secret is needed.
// If the service-role key is rotated, all in-flight impersonation tokens become
// invalid (acceptable — admins can simply start a new session).
function hmacSecret(): string {
  const seed = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return crypto.createHash("sha256").update("eden-impersonation:" + seed).digest("hex");
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", hmacSecret()).update(payload).digest("hex");
}

function timingSafeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export function mintImpersonationToken(sessionId: number, adminId: string): string {
  const nonce = crypto.randomBytes(8).toString("hex");
  const payload = `${sessionId}.${nonce}.${adminId}`;
  const sig = sign(payload);
  return `${sessionId}.${nonce}.${sig}`;
}

function parseToken(token: string): { sessionId: number; nonce: string; sig: string } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const sessionId = Number(parts[0]);
  if (!Number.isFinite(sessionId) || sessionId <= 0) return null;
  return { sessionId, nonce: parts[1], sig: parts[2] };
}

export interface ActiveSession {
  id: number;
  adminId: string;
  adminEmail: string;
  targetUserId: string;
  targetEmail: string;
  targetRole: string | null;
  readOnly: boolean;
  startedAt: Date;
  actionCount: number;
}

interface SessionRowRaw {
  id: number;
  admin_id: string;
  admin_email: string;
  target_user_id: string;
  target_email: string;
  target_role: string | null;
  read_only: boolean;
  started_at: string | Date;
  action_count: number | string;
  ended_at: string | Date | null;
}

export async function loadActiveSessionByToken(
  token: string,
  expectedAdminId: string,
): Promise<ActiveSession | null> {
  const parsed = parseToken(token);
  if (!parsed) return null;
  const expectedSig = sign(`${parsed.sessionId}.${parsed.nonce}.${expectedAdminId}`);
  if (!timingSafeEqual(expectedSig, parsed.sig)) return null;
  const result = await db.execute(sql`
    SELECT id, admin_id, admin_email, target_user_id, target_email, target_role,
           read_only, started_at, action_count, ended_at
    FROM impersonation_sessions
    WHERE id = ${parsed.sessionId}
    LIMIT 1
  `);
  const row = (result.rows ?? [])[0] as unknown as SessionRowRaw | undefined;
  if (!row) return null;
  if (row.ended_at) return null;
  if (row.admin_id !== expectedAdminId) return null;
  return {
    id: row.id,
    adminId: row.admin_id,
    adminEmail: row.admin_email,
    targetUserId: row.target_user_id,
    targetEmail: row.target_email,
    targetRole: row.target_role ?? null,
    readOnly: row.read_only === true,
    startedAt: new Date(row.started_at),
    actionCount: Number(row.action_count ?? 0),
  };
}

function isAdminPath(req: Request): boolean {
  const p = req.path || req.url || "";
  return p.startsWith("/api/admin");
}

// Server-internal symbol used to mark a request as having a verified
// impersonation context. Symbols cannot be set by clients via headers, so
// downstream auth helpers can safely trust this marker (and ignore the
// header equivalents which a client could spoof).
export const IMPERSONATION_MARKER = Symbol.for("eden.impersonation.session");

export interface ImpersonationContext {
  sessionId: number;
  adminId: string;
  adminEmail: string;
  targetUserId: string;
  targetEmail: string;
  targetRole: string | null;
  readOnly: boolean;
  /**
   * True for /api/admin/* requests — the marker exists for audit purposes
   * (every API request during impersonation is logged) but identity headers
   * were NOT swapped. Admin routes always run in admin context.
   */
  adminScope: boolean;
}

type ImpersonationRequest = Request & { [IMPERSONATION_MARKER]?: ImpersonationContext };

export function getImpersonationContext(req: Request): ImpersonationContext | null {
  return (req as ImpersonationRequest)[IMPERSONATION_MARKER] ?? null;
}

// Spoofable identity headers that clients could try to set themselves to
// bypass auth. We unconditionally strip them on entry to /api/* so they can
// only be populated by trusted server-side middleware (auth helpers,
// impersonationContext, requireAdmin).
const SPOOFABLE_IDENTITY_HEADERS = [
  "x-user-id",
  "x-user-email",
  "x-user-role",
  "x-researcher-id",
  "x-concept-user-id",
  "x-concept-user-email",
  "x-real-admin-id",
  "x-real-admin-email",
  "x-impersonation-session-id",
  "x-admin-id",
  "x-admin-email",
];

/**
 * Pre-route sanitization: strip any client-supplied identity headers from
 * /api/* requests. After this middleware, those headers can only be set by
 * trusted server-side auth code. (x-impersonation-token is the legitimate
 * auth header and is preserved.)
 */
export function stripSpoofableHeaders(req: Request, _res: Response, next: NextFunction) {
  const path = req.path || req.url || "";
  if (!path.startsWith("/api/")) return next();
  for (const h of SPOOFABLE_IDENTITY_HEADERS) {
    if (req.headers[h] !== undefined) delete req.headers[h];
  }
  return next();
}

async function recordBlocked(sessionId: number, req: Request) {
  try {
    await db.execute(sql`
      INSERT INTO impersonation_audit_events (session_id, method, route, status_code, blocked)
      VALUES (${sessionId}, ${req.method}, ${req.originalUrl || req.url}, 403, true)
    `);
    await db.execute(sql`
      UPDATE impersonation_sessions
      SET action_count = action_count + 1, last_activity_at = CURRENT_TIMESTAMP
      WHERE id = ${sessionId}
    `);
  } catch {
    // Audit failure must not crash the request.
  }
}

// Lightweight in-process cache so we don't re-verify the same Supabase bearer
// on every request during an impersonation session. Keyed by bearer token,
// holding the resolved admin id+email for a short TTL.
const adminVerifyCache = new Map<string, { id: string; email: string; expires: number }>();
const ADMIN_VERIFY_TTL_MS = 30_000;

let _supabasePublic: ReturnType<typeof createClient> | null = null;
function supabasePublic() {
  if (_supabasePublic) return _supabasePublic;
  const url = process.env.VITE_SUPABASE_URL || "";
  const key = process.env.VITE_SUPABASE_ANON_KEY || "";
  _supabasePublic = createClient(url, key);
  return _supabasePublic;
}

async function verifyBearerAdmin(bearer: string): Promise<{ id: string; email: string } | null> {
  const cached = adminVerifyCache.get(bearer);
  if (cached && cached.expires > Date.now()) {
    return { id: cached.id, email: cached.email };
  }
  try {
    const { data } = await supabasePublic().auth.getUser(bearer);
    const email = data?.user?.email?.toLowerCase();
    if (!email || !data.user) return null;
    if (!getAdminEmails().includes(email)) return null;
    const result = { id: data.user.id, email };
    adminVerifyCache.set(bearer, { ...result, expires: Date.now() + ADMIN_VERIFY_TTL_MS });
    return result;
  } catch {
    return null;
  }
}

/**
 * Global pre-route middleware (Task #736).
 *
 * For every /api/* request that carries a valid x-impersonation-token bound
 * to an admin bearer token:
 *   - Sets x-impersonation-session-id so the audit middleware records EVERY
 *     impersonated request (including unauthenticated/identity-less paths).
 *   - Swaps x-user-id / x-user-email / x-user-role (and x-researcher-id /
 *     x-concept-user-* when applicable) to the target user so all downstream
 *     handlers — auth-gated or not — see the impersonated identity.
 *   - Rejects non-GET requests on read-only sessions with 403 + audit row.
 *
 * /api/admin/* paths are intentionally exempt: admins must remain in admin
 * context to manage their own session.
 */
export async function impersonationContext(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const impToken = req.headers["x-impersonation-token"];
  if (typeof impToken !== "string" || !impToken) return next();
  const path = req.path || req.url || "";
  if (!path.startsWith("/api/")) return next();
  const bearer = req.headers.authorization?.replace("Bearer ", "");
  if (!bearer) return next();

  const admin = await verifyBearerAdmin(bearer);
  if (!admin) return next();

  const session = await loadActiveSessionByToken(impToken, admin.id);
  if (!session) return next();

  const adminScope = isAdminPath(req);

  // Identity-swap and read-only enforcement only apply to non-admin routes.
  // Admin routes always run in admin context (so the admin can manage their
  // own session, e.g. POST /api/admin/impersonation/end). For audit purposes
  // the marker is still set below so EVERY /api/* request during the session
  // is logged.
  if (!adminScope) {
    if (
      session.readOnly &&
      req.method !== "GET" &&
      req.method !== "HEAD" &&
      req.method !== "OPTIONS"
    ) {
      await recordBlocked(session.id, req);
      return res.status(403).json({
        error: "Impersonation session is read-only — write actions are blocked.",
        readOnly: true,
      });
    }
    req.headers["x-user-id"] = session.targetUserId;
    req.headers["x-user-email"] = session.targetEmail;
    req.headers["x-user-role"] = session.targetRole ?? "";
    req.headers["x-real-admin-id"] = session.adminId;
    req.headers["x-real-admin-email"] = session.adminEmail;
    req.headers["x-impersonation-session-id"] = String(session.id);
    if (session.targetRole === "researcher") {
      req.headers["x-researcher-id"] = session.targetUserId;
    }
    if (session.targetRole === "concept") {
      req.headers["x-concept-user-id"] = session.targetUserId;
      req.headers["x-concept-user-email"] = session.targetEmail;
    }
  }

  // Trusted server-internal marker (not a header) so downstream code can
  // distinguish a legitimately impersonated request from a spoofed one. The
  // audit middleware reads sessionId from this marker on res.finish.
  const ctx: ImpersonationContext = {
    sessionId: session.id,
    adminId: session.adminId,
    adminEmail: session.adminEmail,
    targetUserId: session.targetUserId,
    targetEmail: session.targetEmail,
    targetRole: session.targetRole,
    readOnly: session.readOnly,
    adminScope,
  };
  (req as ImpersonationRequest)[IMPERSONATION_MARKER] = ctx;

  return next();
}

/**
 * Per-request audit logger: increments action_count and inserts one row per
 * impersonated request once the response is finished. Mounted globally; no-op
 * for requests without an active impersonation header.
 */
export function impersonationAuditMiddleware(
  req: Request,
  res: Response,
  next: (err?: any) => void,
) {
  res.on("finish", () => {
    // Read from the trusted server-internal marker, NOT a client-controlled
    // header (which an attacker could spoof to forge audit rows).
    const ctx = (req as ImpersonationRequest)[IMPERSONATION_MARKER];
    if (!ctx) return;
    const sessionId = ctx.sessionId;
    Promise.all([
      db.execute(sql`
        INSERT INTO impersonation_audit_events (session_id, method, route, status_code, blocked)
        VALUES (${sessionId}, ${req.method}, ${req.originalUrl || req.url}, ${res.statusCode}, false)
      `),
      db.execute(sql`
        UPDATE impersonation_sessions
        SET action_count = action_count + 1, last_activity_at = CURRENT_TIMESTAMP
        WHERE id = ${sessionId} AND ended_at IS NULL
      `),
    ]).catch((err) => {
      console.warn("[impersonation] audit write failed:", err?.message);
    });
  });
  next();
}

// ── Service-role helpers ─────────────────────────────────────────────────────
function adminClient() {
  const url = process.env.VITE_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function lookupTargetUser(
  targetUserId: string,
): Promise<{ id: string; email: string; role: string | null } | null> {
  const c = adminClient();
  if (!c) return null;
  const { data, error } = await c.auth.admin.getUserById(targetUserId);
  if (error || !data?.user?.email) return null;
  return {
    id: data.user.id,
    email: data.user.email,
    role: (data.user.user_metadata?.role as string | undefined) ?? null,
  };
}

export async function startSession(params: {
  adminId: string;
  adminEmail: string;
  targetUserId: string;
  readOnly: boolean;
}): Promise<{ session: ActiveSession; token: string } | { error: string; status: number }> {
  const target = await lookupTargetUser(params.targetUserId);
  if (!target) return { error: "Target user not found", status: 404 };
  const adminEmails = getAdminEmails();
  if (adminEmails.includes(target.email.toLowerCase())) {
    return { error: "Cannot impersonate another admin", status: 403 };
  }
  if (target.id === params.adminId) {
    return { error: "Cannot impersonate yourself", status: 400 };
  }
  await db.execute(sql`
    UPDATE impersonation_sessions
    SET ended_at = CURRENT_TIMESTAMP, ended_reason = 'superseded'
    WHERE admin_id = ${params.adminId} AND ended_at IS NULL
  `);
  const inserted = await db.execute(sql`
    INSERT INTO impersonation_sessions
      (admin_id, admin_email, target_user_id, target_email, target_role, read_only)
    VALUES
      (${params.adminId}, ${params.adminEmail}, ${target.id}, ${target.email},
       ${target.role}, ${params.readOnly})
    RETURNING id, started_at, action_count
  `);
  const row = (inserted.rows ?? [])[0] as unknown as
    | { id: number; started_at: string | Date; action_count: number | string }
    | undefined;
  if (!row) return { error: "Failed to insert impersonation session", status: 500 };
  const session: ActiveSession = {
    id: row.id,
    adminId: params.adminId,
    adminEmail: params.adminEmail,
    targetUserId: target.id,
    targetEmail: target.email,
    targetRole: target.role,
    readOnly: params.readOnly,
    startedAt: new Date(row.started_at),
    actionCount: Number(row.action_count ?? 0),
  };
  const token = mintImpersonationToken(session.id, params.adminId);
  return { session, token };
}

export async function endSession(sessionId: number, adminId: string): Promise<boolean> {
  const result = await db.execute(sql`
    UPDATE impersonation_sessions
    SET ended_at = CURRENT_TIMESTAMP, ended_reason = 'manual'
    WHERE id = ${sessionId} AND admin_id = ${adminId} AND ended_at IS NULL
    RETURNING id
  `);
  return (result.rows ?? []).length > 0;
}

export async function listRecentSessions(limit = 50): Promise<any[]> {
  const result = await db.execute(sql`
    SELECT id, admin_id, admin_email, target_user_id, target_email, target_role,
           read_only, started_at, ended_at, ended_reason, action_count, last_activity_at
    FROM impersonation_sessions
    ORDER BY started_at DESC
    LIMIT ${limit}
  `);
  return (result.rows ?? []) as any[];
}

export async function listSessionsForAdmin(adminId: string, limit = 50): Promise<any[]> {
  const result = await db.execute(sql`
    SELECT id, admin_id, admin_email, target_user_id, target_email, target_role,
           read_only, started_at, ended_at, ended_reason, action_count, last_activity_at
    FROM impersonation_sessions
    WHERE admin_id = ${adminId}
    ORDER BY started_at DESC
    LIMIT ${limit}
  `);
  return (result.rows ?? []) as any[];
}

export async function getSessionAdminId(sessionId: number): Promise<string | null> {
  const r = await db.execute(sql`
    SELECT admin_id FROM impersonation_sessions WHERE id = ${sessionId} LIMIT 1
  `);
  const row = (r.rows ?? [])[0] as unknown as { admin_id: string } | undefined;
  return row?.admin_id ?? null;
}

export async function listSessionEvents(sessionId: number, limit = 200): Promise<any[]> {
  const result = await db.execute(sql`
    SELECT id, method, route, status_code, blocked, created_at
    FROM impersonation_audit_events
    WHERE session_id = ${sessionId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `);
  return (result.rows ?? []) as any[];
}
