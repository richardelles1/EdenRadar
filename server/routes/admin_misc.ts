import type { Express } from "express";
import { z } from "zod";
import { db } from "../db";
import { storage } from "../storage";
import { ingestedAssets } from "@shared/schema";
import { verifyAnyAuth, requireAdmin } from "../lib/supabaseAuth";
import { sendWelcomeEmail } from "../email";

export function registerMiscRoutes(app: Express): void {
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
  app.get("/api/admin/all-institutions", async (req, res) => {
    try {
      const institutions = await storage.getAllInstitutionNames();
      return res.json({ institutions });
    } catch (err: any) {
      console.error("[all-institutions] Error:", err);
      return res.status(500).json({ error: err.message ?? "Failed to load institutions" });
    }
  });

  app.get("/api/admin/platform-stats", async (req, res) => {
    try {
      const stats = await storage.getPlatformStats();
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch platform stats" });
    }
  });

  app.get("/api/admin/duplicate-candidates", async (req, res) => {
    try {
      const candidates = await storage.getDuplicateCandidates();
      res.json({ candidates, total: candidates.length });
    } catch (err: any) {
      console.error("[duplicate-candidates] Error:", err);
      res.status(500).json({ error: err.message ?? "Failed to load duplicate candidates" });
    }
  });

  app.post("/api/admin/duplicate-candidates/:id/dismiss", async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      await storage.dismissDuplicateCandidate(id);
      res.json({ ok: true });
    } catch (err: any) {
      console.error("[duplicate-candidates/dismiss] Error:", err);
      res.status(500).json({ error: err.message ?? "Failed to dismiss duplicate" });
    }
  });

  app.post("/api/admin/duplicate-candidates/dismiss-all", async (req, res) => {
    try {
      const institution = (req.body as any)?.institution as string | undefined;
      const count = await storage.dismissAllDuplicateCandidates(institution);
      res.json({ ok: true, dismissed: count });
    } catch (err: any) {
      console.error("[duplicate-candidates/dismiss-all] Error:", err);
      res.status(500).json({ error: err.message ?? "Failed to bulk-dismiss duplicates" });
    }
  });

  app.post("/api/admin/duplicate-detection/run", async (req, res) => {
    try {
      const result = await storage.runNearDuplicateDetection((msg) => console.log(`[dedup] ${msg}`));
      res.json(result);
    } catch (err: any) {
      console.error("[duplicate-detection/run] Error:", err);
      res.status(500).json({ error: err.message ?? "Failed to run duplicate detection" });
    }
  });

  app.get("/api/admin/assets/export-csv", async (req, res) => {
    try {

      function csvEscape(val: unknown): string {
        if (val === null || val === undefined) return "";
        let s = Array.isArray(val) ? JSON.stringify(val) : String(val);
        // Neutralize CSV formula injection: prefix dangerous leading chars with a tab
        if (s.length > 0 && (s[0] === "=" || s[0] === "+" || s[0] === "-" || s[0] === "@" || s[0] === "|" || s[0] === "%")) {
          s = "\t" + s;
        }
        if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\t")) {
          return '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
      }

      const HEADERS = ["id","assetName","institution","summary","abstract","target","modality","indication","developmentStage","categories","mechanismOfAction","innovationClaim","unmetNeed","comparableDrugs","licensingReadiness","ipType","completenessScore"];

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="enrichment-${new Date().toISOString().slice(0,10)}.csv"`);
      res.write(HEADERS.join(",") + "\n");

      // Stream rows in batches of 1000 to avoid loading full dataset into memory
      const BATCH = 1000;
      let offset = 0;
      while (true) {
        const batch = await db
          .select({
            id: ingestedAssets.id,
            assetName: ingestedAssets.assetName,
            institution: ingestedAssets.institution,
            summary: ingestedAssets.summary,
            abstract: ingestedAssets.abstract,
            target: ingestedAssets.target,
            modality: ingestedAssets.modality,
            indication: ingestedAssets.indication,
            developmentStage: ingestedAssets.developmentStage,
            categories: ingestedAssets.categories,
            mechanismOfAction: ingestedAssets.mechanismOfAction,
            innovationClaim: ingestedAssets.innovationClaim,
            unmetNeed: ingestedAssets.unmetNeed,
            comparableDrugs: ingestedAssets.comparableDrugs,
            licensingReadiness: ingestedAssets.licensingReadiness,
            ipType: ingestedAssets.ipType,
            completenessScore: ingestedAssets.completenessScore,
          })
          .from(ingestedAssets)
          .orderBy(ingestedAssets.id)
          .limit(BATCH)
          .offset(offset);

        for (const r of batch) {
          res.write([
            r.id, csvEscape(r.assetName), csvEscape(r.institution), csvEscape(r.summary),
            csvEscape(r.abstract), csvEscape(r.target), csvEscape(r.modality), csvEscape(r.indication),
            csvEscape(r.developmentStage), csvEscape(r.categories), csvEscape(r.mechanismOfAction),
            csvEscape(r.innovationClaim), csvEscape(r.unmetNeed), csvEscape(r.comparableDrugs),
            csvEscape(r.licensingReadiness), csvEscape(r.ipType), csvEscape(r.completenessScore),
          ].join(",") + "\n");
        }

        offset += batch.length;
        if (batch.length < BATCH) break;
      }

      res.end();
    } catch (err: any) {
      console.error("[export-csv] Error:", err);
      if (!res.headersSent) res.status(500).json({ error: err.message ?? "Export failed" });
      else res.end();
    }
  });

  app.post("/api/admin/assets/bulk-update", async (req, res) => {
    try {

      const rowSchema = z.object({
        id: z.number().int(),
        assetName: z.string().optional(),
        institution: z.string().optional(),
        summary: z.string().optional(),
        abstract: z.string().optional(),
        target: z.string().optional(),
        modality: z.string().optional(),
        indication: z.string().optional(),
        developmentStage: z.string().optional(),
        categories: z.array(z.string()).optional(),
        mechanismOfAction: z.string().optional(),
        innovationClaim: z.string().optional(),
        unmetNeed: z.string().optional(),
        comparableDrugs: z.string().optional(),
        licensingReadiness: z.string().optional(),
        ipType: z.string().optional(),
        completenessScore: z.number().optional(),
      });

      // Accept a raw JSON array of rows
      const body = req.body;
      if (!Array.isArray(body)) {
        return res.status(400).json({ error: "Request body must be a JSON array of row objects" });
      }
      if (body.length === 0 || body.length > 50000) {
        return res.status(400).json({ error: `Array must have 1-50000 rows (got ${body.length})` });
      }

      // Per-row validation — invalid rows are skipped, not batch-fatal
      const validRows: z.infer<typeof rowSchema>[] = [];
      const skippedDetails: Array<{ index: number; id?: number; reason: string }> = [];
      for (let idx = 0; idx < body.length; idx++) {
        const parsed = rowSchema.safeParse(body[idx]);
        if (!parsed.success) {
          skippedDetails.push({ index: idx, id: body[idx]?.id, reason: parsed.error.issues.map((i: z.ZodIssue) => i.message).join("; ") });
        } else {
          validRows.push(parsed.data);
        }
      }

      const result = validRows.length > 0
        ? await storage.bulkUpdateAssetsFromCsv(validRows)
        : { updated: 0, skipped: 0, notFoundIds: [] as number[] };

      // Merge unknown-ID skips into skippedDetails
      const notFoundDetails = result.notFoundIds.map((id) => ({
        index: -1 as number,
        id,
        reason: "ID not found in database",
      }));
      const allSkipped = [...skippedDetails, ...notFoundDetails];

      res.json({
        ok: true,
        updated: result.updated,
        skipped: result.skipped + skippedDetails.length,
        validationSkipped: skippedDetails.length,
        notFoundCount: result.notFoundIds.length,
        skippedDetails: allSkipped.slice(0, 100),
      });
    } catch (err: any) {
      console.error("[bulk-update] Error:", err);
      res.status(500).json({ error: err.message ?? "Bulk update failed" });
    }
  });

  const DEFAULT_INDUSTRY_PROFILE = {
    userName: "", companyName: "", companyType: "",
    therapeuticAreas: [], dealStages: [], modalities: [], onboardingDone: false,
  };

  app.get("/api/industry/profile", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const userRole = req.headers["x-user-role"] as string;
      if (!userId) return res.status(400).json({ error: "Missing user id" });
      if (userRole !== "industry") return res.status(403).json({ error: "Industry role required" });
      const profile = await storage.getIndustryProfileByUserId(userId);
      return res.json({ profile: profile ?? DEFAULT_INDUSTRY_PROFILE });
    } catch (err: any) {
      console.error("[industry/profile GET]", err);
      return res.status(500).json({ error: "Failed to load profile" });
    }
  });

  app.put("/api/industry/profile", verifyAnyAuth, async (req, res) => {
    try {
      const userId = req.headers["x-user-id"] as string;
      const userRole = req.headers["x-user-role"] as string;
      if (!userId) return res.status(400).json({ error: "Missing user id" });
      if (userRole !== "industry") return res.status(403).json({ error: "Industry role required" });
      const schema = z.object({
        userName: z.string().default(""),
        companyName: z.string().default(""),
        companyType: z.string().default(""),
        therapeuticAreas: z.array(z.string()).default([]),
        dealStages: z.array(z.string()).default([]),
        modalities: z.array(z.string()).default([]),
        onboardingDone: z.boolean().default(false),
        notificationPrefs: z.object({ matchAlerts: z.enum(["off", "daily", "frequent"]), weeklyRecap: z.boolean() }).nullable().default(null),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
      }
      const isNewProfile = !(await storage.getIndustryProfileByUserId(userId));
      const profile = await storage.upsertIndustryProfile(userId, parsed.data);
      if (isNewProfile && supabaseServiceRoleKey && supabaseUrl) {
        (async () => {
          try {
            const { createClient } = await import("@supabase/supabase-js");
            const adminSupabase = createClient(supabaseUrl, supabaseServiceRoleKey);
            const { data: authUser } = await adminSupabase.auth.admin.getUserById(userId);
            const email = authUser?.user?.email;
            if (email) {
              await sendWelcomeEmail(email, profile.userName ?? "");
            }
          } catch (emailErr) {
            console.error("[email] Welcome email failed:", emailErr);
          }
        })();
      }
      return res.json({ profile });
    } catch (err: any) {
      console.error("[industry/profile PUT]", err);
      return res.status(500).json({ error: "Failed to save profile" });
    }
  });

  app.get("/api/admin/industry-profiles", async (req, res) => {
    try {
      const profiles = await storage.getAllIndustryProfiles();
      return res.json({ profiles });
    } catch (err: any) {
      console.error("[admin/industry-profiles]", err);
      return res.status(500).json({ error: "Failed to load profiles" });
    }
  });

  app.post("/api/admin/alerts/dispatch", async (req, res) => {
    try {
      const { runAlertDispatch } = await import("../lib/alertDispatch.js");
      await runAlertDispatch();
      return res.json({ ok: true });
    } catch (err: any) {
      console.error("[admin/alerts/dispatch]", err);
      return res.status(500).json({ error: err.message ?? "Dispatch failed" });
    }
  });
  app.post("/api/admin/invites/purge-expired", requireAdmin, async (req, res) => {
    try {
      const removed = await storage.purgeExpiredPendingInvites(48);
      res.json({ ok: true, removed });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Purge failed" });
    }
  });
}