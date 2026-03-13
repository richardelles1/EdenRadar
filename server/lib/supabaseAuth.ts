import { createClient } from "@supabase/supabase-js";
import type { Request, Response, NextFunction } from "express";

const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || "";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

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
