import crypto from "crypto";
import type { Express } from "express";
import multer from "multer";
import { z } from "zod";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { storage } from "../storage";
import {
  insertDiscoveryCardSchema,
  insertResearchProjectSchema,
  insertSavedReferenceSchema,
  insertSavedGrantSchema,
  ingestedAssets,
  type InsertResearchProject,
} from "@shared/schema";
import { verifyResearcherAuth } from "../lib/supabaseAuth";
import { friendlyOpenAIError } from "../lib/llm";

const uploadMiddleware = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

export function registerResearchRoutes(app: Express): void {  // Research projects (scoped to authenticated researcher)
  app.use("/api/research", verifyResearcherAuth);

  app.get("/api/research/projects", async (req, res) => {
    const researcherId = req.headers["x-researcher-id"] as string;
    if (!researcherId) return res.status(400).json({ error: "Missing x-researcher-id header" });
    try {
      const projects = await storage.getResearchProjects(researcherId);
      res.json({ projects });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/research/projects", async (req, res) => {
    const researcherId = req.headers["x-researcher-id"] as string;
    if (!researcherId) return res.status(400).json({ error: "Missing x-researcher-id header" });
    const body = { ...req.body, researcherId };
    if (body.targetCompletion === "") body.targetCompletion = null;
    if (body.status && !["planning", "active", "on_hold", "completed"].includes(body.status)) {
      return res.status(400).json({ error: "Invalid status value" });
    }
    if (body.targetCompletion && isNaN(Date.parse(body.targetCompletion))) {
      return res.status(400).json({ error: "Invalid targetCompletion date" });
    }
    const parsed = insertResearchProjectSchema.safeParse(body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    try {
      // New projects start as "draft" â€” they only enter the admin queue after the
      // researcher explicitly toggles "Publish to industry" in Â§11.
      const project = await storage.createResearchProject({ ...parsed.data, adminStatus: "draft" });
      res.json({ project });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/research/projects/:id", async (req, res) => {
    const researcherId = req.headers["x-researcher-id"] as string;
    if (!researcherId) return res.status(400).json({ error: "Missing x-researcher-id header" });
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    try {
      const project = await storage.getResearchProject(id, researcherId);
      if (!project) return res.status(404).json({ error: "Project not found" });
      res.json({ project });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/research/projects/:id", async (req, res) => {
    const researcherId = req.headers["x-researcher-id"] as string;
    if (!researcherId) return res.status(400).json({ error: "Missing x-researcher-id header" });
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const patchSchema = z.object({
      title: z.string().min(1).optional(),
      description: z.string().nullable().optional(),
      researchArea: z.string().nullable().optional(),
      hypothesis: z.string().nullable().optional(),
      status: z.enum(["planning", "active", "on_hold", "completed"]).optional(),
      objectives: z.string().nullable().optional(),
      methodology: z.string().nullable().optional(),
      targetCompletion: z.string().nullable().optional().refine(
        (val) => val === undefined || val === null || !isNaN(Date.parse(val)),
        { message: "Invalid date format" }
      ),
      researchDomain: z.string().nullable().optional(),
      keywords: z.array(z.string()).nullable().optional(),
      primaryResearchQuestion: z.string().nullable().optional(),
      scientificRationale: z.string().nullable().optional(),
      keyPapers: z.array(z.object({
        paper_title: z.string(), authors: z.string(), journal: z.string(),
        year: z.string(), paper_link: z.string(), notes: z.string(),
      })).nullable().optional(),
      conflictingEvidence: z.string().nullable().optional(),
      literatureGap: z.string().nullable().optional(),
      experimentalDesign: z.string().nullable().optional(),
      keyTechnologies: z.array(z.string()).nullable().optional(),
      datasetsUsed: z.array(z.object({
        dataset_name: z.string(), dataset_source: z.string(),
        dataset_link: z.string(), notes: z.string(),
      })).nullable().optional(),
      preliminaryData: z.string().nullable().optional(),
      supportingEvidenceLinks: z.array(z.object({ url: z.string(), label: z.string() })).nullable().optional(),
      confidenceLevel: z.string().nullable().optional(),
      potentialApplications: z.string().nullable().optional(),
      industryRelevance: z.string().nullable().optional(),
      patentStatus: z.string().nullable().optional(),
      startupPotential: z.string().nullable().optional(),
      projectContributors: z.array(z.object({
        name: z.string(), institution: z.string(), role: z.string(), email: z.string(),
      })).nullable().optional(),
      openForCollaboration: z.boolean().nullable().optional(),
      collaborationType: z.array(z.string()).nullable().optional(),
      fundingStatus: z.string().nullable().optional(),
      fundingSources: z.array(z.string()).nullable().optional(),
      estimatedBudget: z.number().int().nullable().optional(),
      technicalRisk: z.string().nullable().optional(),
      regulatoryRisk: z.string().nullable().optional(),
      keyScientificUnknowns: z.string().nullable().optional(),
      nextExperiments: z.array(z.object({ label: z.string(), done: z.boolean() })).nullable().optional(),
      expectedTimeline: z.string().nullable().optional(),
      successCriteria: z.string().nullable().optional(),
      discoveryTitle: z.string().nullable().optional(),
      discoverySummary: z.string().nullable().optional(),
      technologyType: z.string().nullable().optional(),
      developmentStage: z.string().nullable().optional(),
      projectSeeking: z.array(z.string()).nullable().optional(),
      publishToIndustry: z.boolean().nullable().optional(),
      potentialPartners: z.array(z.object({
        name: z.string(), website: z.string(), status: z.string(),
        outreachDate: z.string(), contactName: z.string(),
      })).nullable().optional(),
      section4Files: z.array(z.string()).nullable().optional(),
      section5Files: z.array(z.string()).nullable().optional(),
      section8Files: z.array(z.string()).nullable().optional(),
      generalFiles: z.array(z.string()).nullable().optional(),
      hypotheses: z.array(z.object({
        id: z.string(),
        statement: z.string(),
        independentVars: z.string(),
        dependentVars: z.string(),
        expectedOutcome: z.string(),
        nullHypothesis: z.string(),
        evidenceNotes: z.string(),
        status: z.string(),
        confidence: z.string(),
      })).nullable().optional(),
      fishbone: z.object({
        effect: z.string(),
        branches: z.record(z.array(z.string())),
      }).nullable().optional(),
      milestones: z.array(z.object({
        id: z.string(),
        label: z.string(),
        targetDate: z.string(),
        completed: z.boolean(),
      })).nullable().optional(),
      pico: z.object({
        population: z.string(),
        intervention: z.string(),
        comparison: z.string(),
        outcome: z.string(),
      }).nullable().optional(),
      protocolChecklist: z.record(z.boolean()).nullable().optional(),
      eligibilityCriteria: z.object({
        inclusion: z.array(z.string()),
        exclusion: z.array(z.string()),
        studyDesigns: z.array(z.string()),
        populationCriteria: z.string(),
        mechanismTags: z.array(z.string()).optional().default([]),
      }).nullable().optional(),
      searchStrategy: z.object({
        databases: z.array(z.string()),
        searchStrings: z.array(z.object({
          database: z.string(), query: z.string(), date: z.string(), count: z.number(),
        })),
        dateFrom: z.string(),
        dateTo: z.string(),
        filters: z.array(z.string()),
        notes: z.string(),
      }).nullable().optional(),
      screeningPapers: z.array(z.object({
        id: z.string(),
        title: z.string(),
        authors: z.string(),
        year: z.string(),
        abstract: z.string(),
        url: z.string(),
        source: z.string(),
        doi: z.string().optional().default(""),
        aiScore: z.number().nullable().optional(),
        abstractDecision: z.enum(["include", "exclude", "maybe"]).nullable(),
        abstractRationale: z.string(),
        fullTextDecision: z.enum(["include", "exclude"]).nullable(),
        fullTextRationale: z.string(),
        fullTextUrl: z.string(),
        reviewer2AbstractDecision: z.enum(["include", "exclude", "maybe"]).nullable().optional(),
        reviewer2AbstractRationale: z.string().optional().default(""),
        reviewer2FullTextDecision: z.enum(["include", "exclude"]).nullable().optional(),
        reviewer2FullTextRationale: z.string().optional().default(""),
      })).nullable().optional(),
      extractionFields: z.array(z.object({
        id: z.string(),
        name: z.string(),
        type: z.enum(["text", "number", "select"]),
        options: z.array(z.string()).optional(),
      })).nullable().optional(),
      extractedData: z.array(z.object({
        paperId: z.string(),
        data: z.record(z.string()),
      })).nullable().optional(),
      riskOfBias: z.array(z.object({
        paperId: z.string(),
        title: z.string(),
        domains: z.array(z.object({
          name: z.string(), rating: z.string(), rationale: z.string(),
        })),
      })).nullable().optional(),
      robTool: z.string().nullable().optional(),
      evidenceSynthesisText: z.object({
        narrative: z.string(),
        heterogeneity: z.string(),
        strengthOfEvidence: z.string(),
        certaintyGrade: z.string(),
      }).nullable().optional(),
      researchResults: z.object({
        mainFindings: z.string(),
        conclusions: z.string(),
        limitations: z.string(),
        implications: z.string(),
      }).nullable().optional(),
      disseminationPlan: z.object({
        targetJournals: z.array(z.string()),
        conferenceTargets: z.array(z.string()),
        preprintStrategy: z.string(),
        timelineToSubmit: z.string(),
        openAccessPlan: z.string(),
        dataSharePlan: z.string(),
      }).nullable().optional(),
      prosperoId: z.string().nullable().optional(),
      protocolVersion: z.string().nullable().optional(),
      protocolLockedAt: z.string().nullable().optional(),
      protocolDeviations: z.array(z.object({
        id: z.string(), date: z.string(), nature: z.string(),
        impact: z.enum(["minor", "major"]), rationale: z.string(), createdAt: z.string(),
      })).nullable().optional(),
    });
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const validated = parsed.data;
    const updates: Partial<InsertResearchProject> = {};
    const textFields = [
      "title","description","researchArea","hypothesis","status","objectives","methodology",
      "targetCompletion","researchDomain","primaryResearchQuestion","scientificRationale",
      "conflictingEvidence","literatureGap","experimentalDesign","preliminaryData",
      "confidenceLevel","potentialApplications","industryRelevance","patentStatus",
      "startupPotential","fundingStatus","technicalRisk","regulatoryRisk",
      "keyScientificUnknowns","expectedTimeline","successCriteria","discoveryTitle",
      "discoverySummary","technologyType","developmentStage",
      "prosperoId","protocolVersion","robTool",
    ] as const;
    for (const f of textFields) {
      if (validated[f] !== undefined) (updates as any)[f] = validated[f];
    }
    const jsonFields = [
      "keywords","keyPapers","keyTechnologies","datasetsUsed","supportingEvidenceLinks",
      "projectContributors","collaborationType","fundingSources","nextExperiments","projectSeeking",
      "potentialPartners","section4Files","section5Files","section8Files","generalFiles",
      "hypotheses","fishbone","milestones","pico","protocolChecklist",
    ] as const;
    for (const f of jsonFields) {
      if (validated[f] !== undefined) (updates as any)[f] = validated[f];
    }
    // Deep workflow JSONB fields (migration 0013 + 0014)
    const deepJsonFields = [
      "eligibilityCriteria","searchStrategy","screeningPapers",
      "extractionFields","extractedData","riskOfBias",
      "evidenceSynthesisText","researchResults","disseminationPlan",
      "protocolDeviations",
    ] as const;
    for (const f of deepJsonFields) {
      if ((validated as any)[f] !== undefined) (updates as any)[f] = (validated as any)[f];
    }
    if ((validated as any).protocolLockedAt !== undefined) {
      const v = (validated as any).protocolLockedAt;
      (updates as any).protocolLockedAt = v ? new Date(v) : null;
    }
    if (validated.openForCollaboration !== undefined) updates.openForCollaboration = validated.openForCollaboration;
    let unpublishRequested = false;
    if (validated.publishToIndustry !== undefined) {
      updates.publishToIndustry = validated.publishToIndustry;
      // When the researcher requests publishing, queue it for admin review.
      // When they unpublish, reset to draft so it disappears from the admin queue.
      if (validated.publishToIndustry === true) {
        (updates as any).adminStatus = "pending";
        // Clear any previous rejection note when resubmitting.
        (updates as any).adminNote = null;
      } else if (validated.publishToIndustry === false) {
        (updates as any).adminStatus = "draft";
        unpublishRequested = true;
      }
    }
    if (validated.estimatedBudget !== undefined) updates.estimatedBudget = validated.estimatedBudget;
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: "No valid fields to update" });
    try {
      const project = await storage.updateResearchProject(id, researcherId, updates);
      if (!project) return res.status(404).json({ error: "Project not found" });
      // Researcher unpublish must also hide the bridged Scout/Institutions row.
      if (unpublishRequested) {
        await db.update(ingestedAssets)
          .set({ relevant: false })
          .where(eq(ingestedAssets.fingerprint, `researcher-project-${id}`));
      }
      res.json({ project });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/research/projects/:id/notes", async (req, res) => {
    const researcherId = req.headers["x-researcher-id"] as string;
    if (!researcherId) return res.status(400).json({ error: "Missing x-researcher-id header" });
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const { content } = z.object({ content: z.string().min(1).max(10000) }).parse(req.body);
    try {
      const project = await storage.getResearchProject(id, researcherId);
      if (!project) return res.status(404).json({ error: "Project not found" });
      const existing = project.description ?? "";
      const separator = existing ? "\n\n---\n\n" : "";
      const updated = existing + separator + content;
      await storage.updateResearchProject(id, researcherId, { description: updated });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/research/projects/:id", async (req, res) => {
    const researcherId = req.headers["x-researcher-id"] as string;
    if (!researcherId) return res.status(400).json({ error: "Missing x-researcher-id header" });
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    try {
      await storage.deleteResearchProject(id, researcherId);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // File uploads for research projects\n
  app.post("/api/research/projects/:id/files", uploadMiddleware.single("file"), async (req, res) => {
    const researcherId = req.headers["x-researcher-id"] as string;
    if (!researcherId) return res.status(400).json({ error: "Missing x-researcher-id header" });
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const section = (req.query.section as string) || "general";
    const allowedSections = ["section4", "section5", "section8", "general"];
    if (!allowedSections.includes(section)) return res.status(400).json({ error: "Invalid section" });
    const file = req.file;
    if (!file) return res.status(400).json({ error: "No file provided" });

    try {
      const project = await storage.getResearchProject(id, researcherId);
      if (!project) return res.status(404).json({ error: "Project not found" });

      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const sbUrl = process.env.VITE_SUPABASE_URL;
      if (!serviceKey || !sbUrl) return res.status(500).json({ error: "Storage not configured" });

      const { createClient } = await import("@supabase/supabase-js");
      const adminClient = createClient(sbUrl, serviceKey);

      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = `research-projects/${id}/${section}/${Date.now()}-${safeName}`;

      const { error: uploadError } = await adminClient.storage
        .from("research-projects")
        .upload(filePath, file.buffer, {
          contentType: file.mimetype,
          upsert: false,
        });

      if (uploadError) {
        if (uploadError.message?.includes("Bucket not found")) {
          await adminClient.storage.createBucket("research-projects", { public: false });
          const { error: retryError } = await adminClient.storage
            .from("research-projects")
            .upload(filePath, file.buffer, {
              contentType: file.mimetype,
              upsert: false,
            });
          if (retryError) return res.status(500).json({ error: retryError.message });
        } else {
          return res.status(500).json({ error: uploadError.message });
        }
      }

      const { data: signedData, error: signedError } = await adminClient.storage
        .from("research-projects")
        .createSignedUrl(filePath, 60 * 60 * 24 * 365 * 10);

      if (signedError || !signedData?.signedUrl) {
        const { data: publicData } = adminClient.storage
          .from("research-projects")
          .getPublicUrl(filePath);
        return res.json({ url: publicData.publicUrl });
      }

      res.json({ url: signedData.signedUrl });
    } catch (err: any) {
      console.error("[file-upload] Error:", err);
      res.status(500).json({ error: "Upload failed" });
    }
  });

  // Discovery cards
  app.get("/api/research/discoveries", async (req, res) => {
    const researcherId = req.headers["x-researcher-id"] as string;
    if (!researcherId) return res.status(400).json({ error: "Missing x-researcher-id header" });
    try {
      const cards = await storage.getDiscoveryCards(researcherId);
      res.json({ cards });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/research/discoveries", async (req, res) => {
    const researcherId = req.headers["x-researcher-id"] as string;
    if (!researcherId) return res.status(400).json({ error: "Missing x-researcher-id header" });
    const parsed = insertDiscoveryCardSchema.safeParse({ ...req.body, researcherId, published: false });
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    try {
      const card = await storage.createDiscoveryCard(parsed.data);
      res.json({ card });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/research/discoveries/:id/publish", async (req, res) => {
    const researcherId = req.headers["x-researcher-id"] as string;
    if (!researcherId) return res.status(400).json({ error: "Missing x-researcher-id header" });
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    try {
      const card = await storage.publishDiscoveryCard(id, researcherId);
      if (!card) return res.status(404).json({ error: "Card not found" });
      res.json({ card });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/research/discoveries/:id", async (req, res) => {
    const researcherId = req.headers["x-researcher-id"] as string;
    if (!researcherId) return res.status(400).json({ error: "Missing x-researcher-id header" });
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    // Allowlist prevents mass-assignment of server-controlled fields
    // (adminStatus, researcherId, published, archived, adminNote).
    const discoveryPatchSchema = z.object({
      title: z.string().min(1).max(200).optional(),
      summary: z.string().optional(),
      researchArea: z.string().optional(),
      technologyType: z.string().optional(),
      institution: z.string().optional(),
      lab: z.string().optional().nullable(),
      developmentStage: z.string().optional(),
      ipStatus: z.string().optional(),
      seeking: z.string().optional(),
      contactEmail: z.string().email().optional(),
      publicationLink: z.string().optional().nullable(),
      patentLink: z.string().optional().nullable(),
      attachmentUrls: z.array(z.string()).optional(),
    });
    const parsed = discoveryPatchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    try {
      const card = await storage.updateDiscoveryCard(id, researcherId, parsed.data);
      if (!card) return res.status(404).json({ error: "Card not found" });
      res.json({ card });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/research/discoveries/:id/archive", async (req, res) => {
    const researcherId = req.headers["x-researcher-id"] as string;
    if (!researcherId) return res.status(400).json({ error: "Missing x-researcher-id header" });
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    try {
      const card = await storage.updateDiscoveryCard(id, researcherId, { archived: !((await storage.getDiscoveryCards(researcherId)).find(c => c.id === id)?.archived) });
      if (!card) return res.status(404).json({ error: "Card not found" });
      res.json({ card });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  const ALLOWED_DISCOVERY_MIMES = new Set([
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "image/png", "image/jpeg", "image/jpg",
  ]);
  const ALLOWED_DISCOVERY_EXTS = new Set([".pdf", ".doc", ".docx", ".pptx", ".xlsx", ".png", ".jpg", ".jpeg"]);

  app.post("/api/research/discoveries/:id/files", uploadMiddleware.single("file"), async (req, res) => {
    const researcherId = req.headers["x-researcher-id"] as string;
    if (!researcherId) return res.status(400).json({ error: "Missing x-researcher-id header" });
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const file = req.file;
    if (!file) return res.status(400).json({ error: "No file provided" });

    const ext = "." + file.originalname.split(".").pop()?.toLowerCase();
    if (!ALLOWED_DISCOVERY_MIMES.has(file.mimetype) && !ALLOWED_DISCOVERY_EXTS.has(ext)) {
      return res.status(400).json({ error: "File type not allowed. Accepted: PDF, DOCX, PPTX, XLSX, PNG, JPG" });
    }
    if (file.size > 10 * 1024 * 1024) {
      return res.status(400).json({ error: "File too large. Maximum 10 MB" });
    }

    try {
      const cards = await storage.getDiscoveryCards(researcherId);
      const card = cards.find(c => c.id === id);
      if (!card) return res.status(404).json({ error: "Card not found" });

      const existing = card.attachmentUrls ?? [];
      if (existing.length >= 3) return res.status(400).json({ error: "Maximum 3 attachments per discovery" });

      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const sbUrl = process.env.VITE_SUPABASE_URL;
      if (!serviceKey || !sbUrl) return res.status(500).json({ error: "Storage not configured" });

      const { createClient } = await import("@supabase/supabase-js");
      const adminClient = createClient(sbUrl, serviceKey);

      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = `discoveries/${id}/${Date.now()}-${safeName}`;

      const { error: uploadError } = await adminClient.storage
        .from("research-discoveries")
        .upload(filePath, file.buffer, { contentType: file.mimetype, upsert: false });

      if (uploadError) {
        if (uploadError.message?.includes("Bucket not found")) {
          await adminClient.storage.createBucket("research-discoveries", { public: false });
          const { error: retryError } = await adminClient.storage
            .from("research-discoveries")
            .upload(filePath, file.buffer, { contentType: file.mimetype, upsert: false });
          if (retryError) return res.status(500).json({ error: retryError.message });
        } else {
          return res.status(500).json({ error: uploadError.message });
        }
      }

      const { data: signedData } = await adminClient.storage
        .from("research-discoveries")
        .createSignedUrl(filePath, 315360000);

      const signedUrl = signedData?.signedUrl;
      if (!signedUrl) return res.status(500).json({ error: "Failed to generate signed URL" });

      const updatedUrls = [...existing, signedUrl];
      const updated = await storage.updateDiscoveryCard(id, researcherId, { attachmentUrls: updatedUrls });
      res.json({ card: updated, url: signedUrl });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/research/profile/photo", uploadMiddleware.single("photo"), async (req, res) => {
    const researcherId = req.headers["x-researcher-id"] as string;
    if (!researcherId) return res.status(400).json({ error: "Missing x-researcher-id header" });
    const file = req.file;
    if (!file) return res.status(400).json({ error: "No file provided" });

    const allowedMimes = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);
    if (!allowedMimes.has(file.mimetype)) {
      return res.status(400).json({ error: "Only PNG, JPG, and WebP images are allowed" });
    }
    if (file.size > 5 * 1024 * 1024) {
      return res.status(400).json({ error: "Photo must be under 5 MB" });
    }

    try {
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const sbUrl = process.env.VITE_SUPABASE_URL;
      if (!serviceKey || !sbUrl) return res.status(500).json({ error: "Storage not configured" });

      const { createClient } = await import("@supabase/supabase-js");
      const adminClient = createClient(sbUrl, serviceKey);

      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = `profiles/${researcherId}/${Date.now()}-${safeName}`;

      const { error: uploadError } = await adminClient.storage
        .from("researcher-profiles")
        .upload(filePath, file.buffer, { contentType: file.mimetype, upsert: false });

      if (uploadError) {
        if (uploadError.message?.includes("Bucket not found")) {
          await adminClient.storage.createBucket("researcher-profiles", { public: false });
          const { error: retryError } = await adminClient.storage
            .from("researcher-profiles")
            .upload(filePath, file.buffer, { contentType: file.mimetype, upsert: false });
          if (retryError) return res.status(500).json({ error: retryError.message });
        } else {
          return res.status(500).json({ error: uploadError.message });
        }
      }

      const { data: signedData } = await adminClient.storage
        .from("researcher-profiles")
        .createSignedUrl(filePath, 315360000);

      res.json({ url: signedData?.signedUrl ?? "" });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Saved references
  app.get("/api/research/references", async (req, res) => {
    const researcherId = req.headers["x-researcher-id"] as string;
    if (!researcherId) return res.status(400).json({ error: "Missing x-researcher-id header" });
    let projectId: number | undefined;
    if (req.query.projectId) {
      projectId = parseInt(req.query.projectId as string);
      if (isNaN(projectId)) return res.status(400).json({ error: "Invalid projectId" });
    }
    try {
      const refs = await storage.getSavedReferences(researcherId, projectId);
      res.json({ references: refs });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/research/references", async (req, res) => {
    const researcherId = req.headers["x-researcher-id"] as string;
    if (!researcherId) return res.status(400).json({ error: "Missing x-researcher-id header" });
    const parsed = insertSavedReferenceSchema.safeParse({ ...req.body, userId: researcherId });
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    try {
      if (parsed.data.projectId) {
        const project = await storage.getResearchProject(parsed.data.projectId, researcherId);
        if (!project) return res.status(403).json({ error: "Project not found or not owned by you" });
      }
      const ref = await storage.createSavedReference(parsed.data);
      res.json({ reference: ref });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/research/references/:id", async (req, res) => {
    const researcherId = req.headers["x-researcher-id"] as string;
    if (!researcherId) return res.status(400).json({ error: "Missing x-researcher-id header" });
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    try {
      await storage.deleteSavedReference(id, researcherId);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  const synthesizeBodySchema = z.object({
    signals: z.array(z.object({
      title: z.string(),
      text: z.string(),
      url: z.string(),
      date: z.string().optional(),
      source_type: z.string().optional(),
    })).min(1).max(10),
    query: z.string().min(1).max(500),
  });

  app.post("/api/research/synthesize", async (req, res) => {
    const parsed = synthesizeBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten().fieldErrors });
    }
    try {
      const { signals, query } = parsed.data;

      const signalBlock = signals
        .map((s, i) => `[${i + 1}] "${s.title}" (${s.source_type ?? "unknown"}, ${s.date ?? "n/a"})\n${s.text.slice(0, 600)}`)
        .join("\n\n");

      const prompt = `You are a biotech research synthesis analyst. A researcher searched for "${query}" and found the results below. Synthesize them into a structured analysis.

Results:
${signalBlock}

Return ONLY valid JSON with these four fields:
- "consensus": 2-3 sentences summarizing what the field currently knows based on these results.
- "open_questions": Array of 3-5 strings, each a key open question or gap in the evidence.
- "strongest_signals": Array of up to 3 objects, each with "index" (1-based number from the results list), "title" (the paper/result title), and "reason" (1 sentence explaining why this result is most informative).
- "suggested_next_search": A single string with one follow-up search query the researcher should try next to deepen understanding.

Be specific and evidence-grounded. Do not speculate beyond what the results show.`;

      const { default: OpenAI } = await import("openai");
      const aiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const response = await aiClient.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.2,
        max_tokens: 1000,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) return res.status(500).json({ error: "No response from AI" });

      const raw = JSON.parse(content);
      const synthesisResponseSchema = z.object({
        consensus: z.string().default(""),
        open_questions: z.array(z.string()).default([]),
        strongest_signals: z.array(z.object({
          index: z.number(),
          title: z.string(),
          reason: z.string(),
        })).default([]),
        suggested_next_search: z.string().default(""),
      });
      const validated = synthesisResponseSchema.parse(raw);
      return res.json(validated);
    } catch (err: any) {
      console.error("Synthesis error:", err);
      return res.status(500).json({ error: friendlyOpenAIError(err) });
    }
  });

  // Evidence extraction from saved references
  app.post("/api/research/library/extract-evidence", async (req, res) => {
    const researcherId = req.headers["x-researcher-id"] as string;
    if (!researcherId) return res.status(400).json({ error: "Missing x-researcher-id header" });

    const { referenceIds } = req.body as { referenceIds?: number[] };
    if (!Array.isArray(referenceIds) || referenceIds.length < 2) {
      return res.status(400).json({ error: "Select at least 2 references" });
    }
    if (referenceIds.length > 20) {
      return res.status(400).json({ error: "Maximum 20 references at a time" });
    }

    try {
      const allRefs = await storage.getSavedReferences(researcherId);
      const selected = allRefs.filter((r) => referenceIds.includes(r.id));
      if (selected.length === 0) return res.status(404).json({ error: "No matching references found" });

      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const rows: Array<{
        referenceId: number;
        title: string;
        studyType: string;
        sampleSize: string;
        population: string;
        interventionTarget: string;
        outcome: string;
        keyFindings: string;
        evidenceStrength: string;
      }> = [];

      const CONCURRENCY = 5;
      let idx = 0;
      const queue = [...selected];

      const worker = async () => {
        while (idx < queue.length) {
          const ref = queue[idx++];
          if (!ref) continue;
          const hasAbstract = !!ref.notes?.trim();
          if (!ref.title?.trim()) {
            rows.push({
              referenceId: ref.id,
              title: ref.title || "(untitled)",
              studyType: "N/A",
              sampleSize: "N/A",
              population: "N/A",
              interventionTarget: "N/A",
              outcome: "N/A",
              keyFindings: "N/A",
              evidenceStrength: "N/A",
            });
            continue;
          }

          try {
            const response = await openai.chat.completions.create({
              model: "gpt-4o-mini",
              messages: [{
                role: "user",
                content: `You are a biomedical evidence extraction assistant. Extract structured evidence fields from the following reference.

Title: ${ref.title}
Source type: ${ref.sourceType}
Date: ${ref.date || "unknown"}
Institution: ${ref.institution || "unknown"}
${hasAbstract ? `Abstract/Notes: ${ref.notes}` : "Abstract: Not available â€” extract what you can from the title and metadata only. Use \"N/A\" for fields that cannot be determined without an abstract."}

Return ONLY valid JSON with these fields:
- studyType: the type of study (e.g., "RCT", "cohort study", "case report", "review", "in vitro", "animal model", "clinical trial", "computational", "N/A")
- sampleSize: number of subjects/samples or "N/A"
- population: the study population or subject group (e.g., "NSCLC patients", "healthy volunteers", "mouse model", "N/A")
- interventionTarget: the drug/compound/therapy/target being studied (string)
- outcome: primary outcome or endpoint measured (string or "N/A")
- keyFindings: 1-2 sentence summary of main results (string)
- evidenceStrength: one of "High", "Moderate", "Low", "Insufficient" based on study design and data quality

If a field cannot be determined, use "N/A".`
              }],
              response_format: { type: "json_object" },
              temperature: 0.1,
            });

            const content = response.choices[0]?.message?.content;
            if (content) {
              const parsed = JSON.parse(content);
              rows.push({
                referenceId: ref.id,
                title: ref.title,
                studyType: parsed.studyType ?? "N/A",
                sampleSize: parsed.sampleSize ?? "N/A",
                population: parsed.population ?? "N/A",
                interventionTarget: parsed.interventionTarget ?? "N/A",
                outcome: parsed.outcome ?? "N/A",
                keyFindings: parsed.keyFindings ?? "N/A",
                evidenceStrength: parsed.evidenceStrength ?? "N/A",
              });
            } else {
              rows.push({
                referenceId: ref.id, title: ref.title,
                studyType: "N/A", sampleSize: "N/A", population: "N/A",
                interventionTarget: "N/A", outcome: "N/A", keyFindings: "N/A", evidenceStrength: "N/A",
              });
            }
          } catch (err) {
            console.error(`[evidence] Failed to extract for ref ${ref.id}:`, err);
            rows.push({
              referenceId: ref.id, title: ref.title,
              studyType: "Error", sampleSize: "N/A", population: "N/A",
              interventionTarget: "N/A", outcome: "N/A", keyFindings: "Extraction failed", evidenceStrength: "N/A",
            });
          }
        }
      }

      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));

      const sorted = referenceIds.map((id) => rows.find((r) => r.referenceId === id)).filter(Boolean);

      res.json({ rows: sorted });
    } catch (err: any) {
      console.error("[evidence] extraction error:", err);
      res.status(500).json({ error: "Evidence extraction failed" });
    }
  });

  // Save evidence table to project
  app.post("/api/research/projects/:id/evidence-table", async (req, res) => {
    const researcherId = req.headers["x-researcher-id"] as string;
    if (!researcherId) return res.status(400).json({ error: "Missing x-researcher-id header" });
    const projectId = parseInt(req.params.id);
    if (isNaN(projectId)) return res.status(400).json({ error: "Invalid project id" });

    const evidenceRowSchema = z.object({
      referenceId: z.number(),
      title: z.string(),
      studyType: z.string(),
      sampleSize: z.string(),
      population: z.string(),
      interventionTarget: z.string(),
      outcome: z.string(),
      keyFindings: z.string(),
      evidenceStrength: z.string(),
    });
    const bodyParsed = z.object({ rows: z.array(evidenceRowSchema).min(1) }).safeParse(req.body);
    if (!bodyParsed.success) {
      return res.status(400).json({ error: "Invalid evidence table data", details: bodyParsed.error.flatten() });
    }
    const { rows } = bodyParsed.data;

    try {
      const project = await storage.getResearchProject(projectId, researcherId);
      if (!project) return res.status(404).json({ error: "Project not found" });

      type EvidenceTable = NonNullable<typeof project.evidenceTables>[number];
      const existing: EvidenceTable[] = [...(project.evidenceTables ?? [])];
      const newTable: EvidenceTable = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        rows,
      };
      existing.push(newTable);

      await storage.updateResearchProject(projectId, researcherId, { evidenceTables: existing });
      res.json({ ok: true, tableId: newTable.id });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to save evidence table" });
    }
  });

  // Saved grants
  app.get("/api/research/grants", async (req, res) => {
    const researcherId = req.headers["x-researcher-id"] as string;
    if (!researcherId) return res.status(400).json({ error: "Missing x-researcher-id header" });
    try {
      const grants = await storage.getSavedGrants(researcherId);
      res.json({ grants });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/research/grants", async (req, res) => {
    const researcherId = req.headers["x-researcher-id"] as string;
    if (!researcherId) return res.status(400).json({ error: "Missing x-researcher-id header" });
    const parsed = insertSavedGrantSchema.safeParse({ ...req.body, userId: researcherId });
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    try {
      if (parsed.data.projectId) {
        const project = await storage.getResearchProject(parsed.data.projectId, researcherId);
        if (!project) return res.status(403).json({ error: "Project not found or not owned by you" });
      }
      const grant = await storage.createSavedGrant(parsed.data);
      res.json({ grant });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/research/grants/:id", async (req, res) => {
    const researcherId = req.headers["x-researcher-id"] as string;
    if (!researcherId) return res.status(400).json({ error: "Missing x-researcher-id header" });
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    // Allowlist prevents mass-assignment of userId or other server-controlled fields.
    const grantPatchSchema = z.object({
      title: z.string().min(1).optional(),
      url: z.string().optional().nullable(),
      agencyName: z.string().optional(),
      deadline: z.string().optional().nullable(),
      amount: z.string().optional().nullable(),
      notes: z.string().optional().nullable(),
      status: z.string().optional(),
      projectId: z.number().optional().nullable(),
    });
    const parsed = grantPatchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    try {
      const grant = await storage.updateSavedGrant(id, researcherId, parsed.data);
      res.json({ grant });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/research/grants/:id", async (req, res) => {
    const researcherId = req.headers["x-researcher-id"] as string;
    if (!researcherId) return res.status(400).json({ error: "Missing x-researcher-id header" });
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    try {
      await storage.deleteSavedGrant(id, researcherId);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });}