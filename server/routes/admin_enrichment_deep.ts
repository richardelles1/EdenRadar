import type { Express } from "express";
import { registerEdenRoutes } from "./admin_enrichment_eden";
import { registerBandRoutes } from "./admin_enrichment_band";

export function registerDeepEnrichmentRoutes(app: Express): void {
  registerEdenRoutes(app);
  registerBandRoutes(app);
}
