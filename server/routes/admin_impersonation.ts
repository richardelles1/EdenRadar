import type { Express } from "express";
import { insertAdminEvent } from "../storage";

export async function registerImpersonationRoutes(app: Express): Promise<void> {
  // ── Admin "Act as user" impersonation (Task #736) ─────────────────────────
  // Lives under /api/admin/* so requireAdmin gates everything. The startSession/
  // endSession routes use the verified admin id from x-admin-id; downstream
  // identity swap happens in the auth middleware via x-impersonation-token.
  {
    const imp = await import("../lib/impersonation");
    const { z } = await import("zod");

    app.post("/api/admin/impersonation/start", async (req, res) => {
      try {
        const adminId = String(req.headers["x-admin-id"] ?? "");
        const adminEmail = String(req.headers["x-admin-email"] ?? "");
        if (!adminId) return res.status(401).json({ error: "Admin auth required" });
        const schema = z.object({
          targetUserId: z.string().min(1),
          readOnly: z.boolean().default(true),
        });
        const body = schema.parse(req.body);
        const result = await imp.startSession({
          adminId,
          adminEmail,
          targetUserId: body.targetUserId,
          readOnly: body.readOnly,
        });
        if ("error" in result) return res.status(result.status).json({ error: result.error });
        await insertAdminEvent({
          adminUserId: adminId, adminEmail,
          action: "impersonation_start",
          targetUserId: result.session.targetUserId,
          targetEmail: result.session.targetEmail,
          payload: { readOnly: result.session.readOnly, sessionId: result.session.id },
        });
        res.json({
          token: result.token,
          session: {
            id: result.session.id,
            targetUserId: result.session.targetUserId,
            targetEmail: result.session.targetEmail,
            targetRole: result.session.targetRole,
            readOnly: result.session.readOnly,
            startedAt: result.session.startedAt,
          },
        });
      } catch (err: any) {
        if (err?.name === "ZodError") return res.status(400).json({ error: "Invalid input" });
        res.status(500).json({ error: err?.message ?? "Failed to start impersonation" });
      }
    });

    app.post("/api/admin/impersonation/end", async (req, res) => {
      try {
        const adminId = String(req.headers["x-admin-id"] ?? "");
        const schema = z.object({ sessionId: z.number().int().positive() });
        const { sessionId } = schema.parse(req.body);
        const ok = await imp.endSession(sessionId, adminId);
        if (!ok) {
          // Either the session belongs to a different admin, is already
          // ended, or doesn't exist. Surface as 404 so the client mutation
          // is treated as a failure (avoids silently clearing the local
          // token when nothing was actually ended).
          return res.status(404).json({ error: "Session not found or not yours to end", ended: false });
        }
        res.json({ ended: true });
      } catch (err: any) {
        if (err?.name === "ZodError") return res.status(400).json({ error: "Invalid input" });
        res.status(500).json({ error: err?.message ?? "Failed to end impersonation" });
      }
    });

    // List impersonation sessions. Default is scoped to the calling admin so
    // one admin's active session can never block or be ended by another. Pass
    // ?scope=all to include other admins (useful for organization-wide audit).
    app.get("/api/admin/impersonation/sessions", async (req, res) => {
      try {
        const adminId = String(req.headers["x-admin-id"] ?? "");
        const scope = String(req.query.scope ?? "mine");
        const sessions = scope === "all"
          ? await imp.listRecentSessions(100)
          : await imp.listSessionsForAdmin(adminId, 100);
        res.json({ sessions });
      } catch (err: any) {
        res.status(500).json({ error: err?.message ?? "Failed to list sessions" });
      }
    });

    app.get("/api/admin/impersonation/sessions/:id/events", async (req, res) => {
      try {
        const sessionId = Number(req.params.id);
        if (!Number.isFinite(sessionId)) return res.status(400).json({ error: "Invalid id" });
        // Scope: an admin can only read the events for their own sessions.
        const adminId = String(req.headers["x-admin-id"] ?? "");
        const ownerId = await imp.getSessionAdminId(sessionId);
        if (!ownerId) return res.status(404).json({ error: "Session not found" });
        if (ownerId !== adminId) return res.status(403).json({ error: "Not your session" });
        const events = await imp.listSessionEvents(sessionId, 200);
        res.json({ events });
      } catch (err: any) {
        res.status(500).json({ error: err?.message ?? "Failed to list events" });
      }
    });
  }

  // Read the current impersonation session (if any) for the calling admin.
  // Mounted on /api so it can be read without an admin token swap, but it
  // requires a valid bearer that matches the session's admin_id.
  app.get("/api/me/impersonation", async (req, res) => {
    try {
      const token = req.headers["x-impersonation-token"];
      if (typeof token !== "string" || !token) return res.json({ active: null });
      const bearer = req.headers.authorization?.replace("Bearer ", "");
      if (!bearer) return res.json({ active: null });
      const { createClient } = await import("@supabase/supabase-js");
      const sb = createClient(process.env.VITE_SUPABASE_URL || "", process.env.VITE_SUPABASE_ANON_KEY || "");
      const { data, error } = await sb.auth.getUser(bearer);
      if (error || !data.user) return res.json({ active: null });
      const imp = await import("../lib/impersonation");
      const session = await imp.loadActiveSessionByToken(token, data.user.id);
      if (!session) return res.json({ active: null });
      res.json({
        active: {
          id: session.id,
          targetUserId: session.targetUserId,
          targetEmail: session.targetEmail,
          targetRole: session.targetRole,
          readOnly: session.readOnly,
          startedAt: session.startedAt,
          actionCount: session.actionCount,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Failed to load impersonation state" });
    }
  });

}