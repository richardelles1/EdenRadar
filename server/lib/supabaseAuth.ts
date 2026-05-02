import { createClient } from "@supabase/supabase-js";
import type { Request, Response, NextFunction } from "express";

const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || "";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Try to extract a verified userId from the Bearer token without blocking the request.
 * Returns undefined if there is no token, or the token is invalid.
 */
export async function tryGetUserId(req: Request): Promise<string | undefined> {
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
  next: NextFunction
) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace("Bearer ", "");

  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  const role = data.user.user_metadata?.role;
  if (role !== "researcher") {
    return res.status(403).json({ error: "Researcher role required" });
  }

  req.headers["x-researcher-id"] = data.user.id;
  return next();
}

export async function verifyConceptAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace("Bearer ", "");

  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  const role = data.user.user_metadata?.role;
  if (role !== "concept") {
    return res.status(403).json({ error: "Concept role required" });
  }

  req.headers["x-concept-user-id"] = data.user.id;
  req.headers["x-concept-user-email"] = data.user.email || "";
  return next();
}

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "relles@edennx.com,wmohamed@edennx.com")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export function getAdminEmails(): string[] {
  return [...ADMIN_EMAILS];
}

/**
 * Resolve the Supabase user from the Bearer token and return their identity
 * iff their email is in the admin allowlist. Returns null otherwise. Use this
 * for routes that conditionally surface admin data without rejecting non-admins.
 */
export async function getAdminUser(req: Request): Promise<{ id: string; email: string } | null> {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return null;
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user?.email) return null;
    const email = data.user.email.toLowerCase();
    // Defense in depth: require BOTH email allowlist AND user_metadata.is_admin === true.
    if (!ADMIN_EMAILS.includes(email)) return null;
    if (data.user.user_metadata?.is_admin !== true) return null;
    return { id: data.user.id, email };
  } catch {
    return null;
  }
}

/**
 * Express middleware that requires an authenticated user whose email is in
 * the ADMIN_EMAILS allowlist. Replaces the legacy shared-password admin gate.
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
  next: NextFunction
) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace("Bearer ", "");

  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  req.headers["x-user-id"] = data.user.id;
  req.headers["x-user-role"] = data.user.user_metadata?.role || "";
  req.headers["x-user-email"] = data.user.email || "";
  return next();
}
