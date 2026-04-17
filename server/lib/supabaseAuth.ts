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
