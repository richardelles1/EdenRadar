import type { Express } from "express";
import { registerFillRoutes } from "./admin_enrichment_fills";
import { registerAssetRoutes } from "./admin_enrichment_assets";
import { registerDeepEnrichmentRoutes } from "./admin_enrichment_deep";

export function registerEnrichmentRoutes(app: Express): void {
  registerFillRoutes(app);
  registerAssetRoutes(app);
  registerDeepEnrichmentRoutes(app);
}
