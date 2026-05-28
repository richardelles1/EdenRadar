import type { Express } from "express";
import { requireAdmin } from "../lib/supabaseAuth";
import { registerEnrichmentRoutes } from "./admin_enrichment";
import { registerIndexingRoutes } from "./admin_indexing";
import { registerAnalyticsRoutes } from "./admin_analytics";
import { registerUserRoutes } from "./admin_users";
import { registerConceptRoutes } from "./admin_concepts";
import { registerIndustryRoutes } from "./admin_industry";
import { registerImportRoutes } from "./admin_import";
import { registerImpersonationRoutes } from "./admin_impersonation";
import { registerRelevanceRoutes } from "./admin_relevance";
import { registerDispatchRoutes } from "./admin_dispatch";
import { registerPlatformRoutes } from "./admin_platform";
import { getAllJobStatuses } from "../lib/jobState";

export async function registerAdminRoutes(app: Express): Promise<void> {
  app.use("/api/admin", requireAdmin);
  registerEnrichmentRoutes(app);
  registerIndexingRoutes(app);
  registerAnalyticsRoutes(app);
  registerUserRoutes(app);
  registerConceptRoutes(app);
  registerIndustryRoutes(app);
  registerImportRoutes(app);
  await registerImpersonationRoutes(app);
  registerRelevanceRoutes(app);
  registerDispatchRoutes(app);
  registerPlatformRoutes(app);
  app.get("/api/admin/jobs", (_req, res) => {
    res.json(getAllJobStatuses());
  });
}
