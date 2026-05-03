import { createClient } from "@supabase/supabase-js";
import type { Request, Response, NextFunction } from "express";
import { getImpersonationContext } from "./impersonation";

const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || "";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "relles@edennx.com,wmohamed@edennx.com")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export function getAdminEmails(): string[] {
  return [...ADMIN_EMAILS];
}

/**
 * Try to extract a verified userId from the Bearer token. If the request has
 * a verified impersonation context (set by impersonationContext middleware
 * via a server-internal symbol — NOT a client header), the target user id is
 * returned without re-verifying the bearer.
 */
export async function tryGetUserId(req: Request): Promise<string | undefined> {
  const imp = getImpersonationContext(req);
  if (imp) return imp.targetUserId;
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return undefined;
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return undefined;
    return data.user.id;
  } catch {
    return undefined;
  }
}

export async function verifyResearcherAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const imp = getImpersonationContext(req);
  if (imp) {
    if (imp.targetRole !== "researcher") {
      return res.status(403).json({ error: "Researcher role required" });
    }
    // Identity headers were already populated by impersonationContext.
    return next();
  }
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Authentication required" });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return res.status(401).json({ error: "Invalid or expired token" });
  if (data.user.user_metadata?.role !== "researcher") {
    return res.status(403).json({ error: "Researcher role required" });
  }
  req.headers["x-researcher-id"] = data.user.id;
  req.headers["x-user-id"] = data.user.id;
  req.headers["x-user-email"] = data.user.email || "";
  req.headers["x-user-role"] = "researcher";
  return next();
}

export async function verifyConceptAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const imp = getImpersonationContext(req);
  if (imp) {
    if (imp.targetRole !== "concept") {
      return res.status(403).json({ error: "Concept role required" });
    }
    return next();
  }
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Authentication required" });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return res.status(401).json({ error: "Invalid or expired token" });
  if (data.user.user_metadata?.role !== "concept") {
    return res.status(403).json({ error: "Concept role required" });
  }
  req.headers["x-concept-user-id"] = data.user.id;
  req.headers["x-concept-user-email"] = data.user.email || "";
  req.headers["x-user-id"] = data.user.id;
  req.headers["x-user-email"] = data.user.email || "";
  req.headers["x-user-role"] = "concept";
  return next();
}

/**
 * Resolve the Supabase user from the Bearer token and return their identity
 * iff their email is in the admin allowlist.
 */
export async function getAdminUser(req: Request): Promise<{ id: string; email: string } | null> {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return null;
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user?.email) return null;
    const email = data.user.email.toLowerCase();
    if (!ADMIN_EMAILS.includes(email)) return null;
    if (data.user.user_metadata?.is_admin !== true) return null;
    return { id: data.user.id, email };
  } catch {
    return null;
  }
}

/**
 * Express middleware that requires an admin user. Admin routes intentionally
 * never honor x-impersonation-token (impersonationContext skips /api/admin/*).
 */
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const u = await getAdminUser(req);
  if (!u) {
    return res.status(401).json({ error: "Admin authentication required" });
  }
  req.headers["x-admin-id"] = u.id;
  req.headers["x-admin-email"] = u.email;
  req.headers["x-user-id"] = u.id;
  return next();
}

export async function verifyAnyAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  // Smoke-test bypass (Task #714) — defense-in-depth, no committed secret.
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.ENABLE_SMOKE_AUTH_BYPASS === "true"
  ) {
    const remote = req.socket?.remoteAddress ?? "";
    const isLoopback =
      remote === "127.0.0.1" ||
      remote === "::1" ||
      remote === "::ffff:127.0.0.1";
    if (isLoopback) {
      const smokeUserId = req.headers["x-smoke-user-id"];
      if (typeof smokeUserId === "string" && smokeUserId.length > 0) {
        req.headers["x-user-id"] = smokeUserId;
        req.headers["x-user-role"] = "smoke";
        req.headers["x-user-email"] = `${smokeUserId}@smoke.invalid`;
        return next();
      }
    }
  }

  // Trusted impersonation context (server-internal symbol) — headers already set.
  if (getImpersonationContext(req)) return next();

  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Authentication required" });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return res.status(401).json({ error: "Invalid or expired token" });
  req.headers["x-user-id"] = data.user.id;
  req.headers["x-user-role"] = data.user.user_metadata?.role || "";
  req.headers["x-user-email"] = data.user.email || "";
  return next();
}
