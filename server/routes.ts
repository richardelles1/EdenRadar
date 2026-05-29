import type { Express } from "express";
import { createServer, type Server } from "http";
import mcpRouter from "./mcp/index";
import { dataSources, getSourceHealthEntries } from "./lib/sources/index";
import { requireAdmin } from "./lib/supabaseAuth";

import { registerAdminRoutes } from "./routes/admin";
import { registerSearchRoutes } from "./routes/search";
import { registerIngestRoutes } from "./routes/ingest";
import { registerEdenRoutes } from "./routes/eden";
import { registerResearchRoutes } from "./routes/research";
import { registerAuthRoutes } from "./routes/auth";
import { registerAlertsRoutes } from "./routes/alerts";
import { registerBillingRoutes } from "./routes/billing";
import { registerMarketRoutes } from "./routes/market";
import { registerPipelineRoutes } from "./routes/pipeline";
import { registerInstitutionRoutes } from "./routes/institutions";
import { registerMiscRoutes } from "./routes/misc";
import { registerContactRoutes } from "./routes/contacts";
import { sendDemoRequestEmail } from "./email";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Impersonation middleware — must run before all routes
  {
    const {
      stripSpoofableHeaders,
      impersonationContext,
      impersonationAuditMiddleware,
    } = await import("./lib/impersonation");
    app.use(stripSpoofableHeaders);
    app.use(impersonationContext);
    app.use(impersonationAuditMiddleware);
  }

  app.use("/mcp", mcpRouter);

  // Domain route modules
  await registerAdminRoutes(app);
  registerSearchRoutes(app);
  registerIngestRoutes(app);
  registerEdenRoutes(app);
  registerResearchRoutes(app);
  registerAuthRoutes(app);
  registerAlertsRoutes(app);
  registerBillingRoutes(app);
  registerMarketRoutes(app);
  registerPipelineRoutes(app);
  registerInstitutionRoutes(app);
  registerMiscRoutes(app);
  registerContactRoutes(app);

  // Waitlist
  app.post("/api/waitlist", async (req, res) => {
    const { email, name, role } = req.body as { email?: string; name?: string; role?: string };
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Valid email required" });
    }
    const VALID_ROLES = ["industry", "researcher", "concept"];
    const safeRole = VALID_ROLES.includes(role ?? "") ? role : null;
    const sbUrl = process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!sbUrl || !serviceKey) return res.status(500).json({ error: "Server misconfigured" });
    const { createClient } = await import("@supabase/supabase-js");
    const admin = createClient(sbUrl, serviceKey);
    const { error } = await admin.from("waitlist").insert({
      email: email.toLowerCase().trim(),
      name: name?.trim() || null,
      role: safeRole,
    });
    if (error && error.code === "23505") return res.json({ ok: true });
    if (error) {
      console.error("[waitlist] insert error:", error.message);
      return res.status(500).json({ error: "Could not save. Please try again." });
    }
    return res.json({ ok: true });
  });

  app.post("/api/demo-request", async (req, res) => {
    const { email, firstName, lastName, company, role, teamSize, intent } = req.body as {
      email?: string;
      firstName?: string;
      lastName?: string;
      company?: string;
      role?: string;
      teamSize?: string;
      intent?: string;
    };
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.status(400).json({ error: "Valid email required" });
    if (!firstName?.trim() || !lastName?.trim() || !company?.trim() || !role)
      return res.status(400).json({ error: "Missing required fields" });
    try {
      await sendDemoRequestEmail({
        email: email.toLowerCase().trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        company: company.trim(),
        role,
        teamSize: teamSize ?? "",
        intent: intent?.trim() ?? "",
      });
    } catch (err) {
      console.error("[demo-request] email failed:", err);
    }
    return res.json({ ok: true });
  });

  // Sources
  app.get("/api/sources", (_req, res) => {
    const sources = Object.values(dataSources).map((s) => ({
      id: s.id,
      label: s.label,
      description: s.description,
    }));
    res.json({ sources });
  });

  app.get("/api/sources/health", requireAdmin, (_req, res) => {
    res.json({ entries: getSourceHealthEntries() });
  });

  return httpServer;
}
