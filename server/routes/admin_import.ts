import crypto from "crypto";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import type { Express } from "express";
import { z } from "zod";
import { db, pool } from "../db";
import { eq, ne, and, sql, desc, or, ilike, inArray, gte, gt, count as drizzleCount, isNull } from "drizzle-orm";
import { storage, type EnrichFilter, insertAdminEvent, getAdminEvents, setIndustryProfileStatus, getPlanEntitlements, getOrgEntitlementOverrides, upsertOrgEntitlementOverride, deleteOrgEntitlementOverride, upgradeIndividualToOrg, assignUserToOrg } from "../storage";
import { insertDiscoveryCardSchema, insertConceptCardSchema, conceptCards, conceptInterests, researchNeeds, researchProjects, userAlerts, type UserAlert, type IngestedAsset, ingestedAssets, pipelineLists, savedAssets, insertManualInstitutionSchema, SAVED_ASSET_STATUSES, sharedLinks, industryProfiles, appEvents, marketEois, marketListings, marketDeals, marketDealTermSheets, marketDealObservers, marketDealFeedback, dealComparables, marketAvailabilityNotifications, marketSavedSearches, insertMarketSavedSearchSchema, scoutSavedSearches, insertScoutSavedSearchSchema, institutionMetadata, emailUnsubscribes, apiKeys, apiUsageLogs, apiKeyAuditLog, API_TIER_CONFIG, apiRateLimitWindows, edenQueries } from "@shared/schema";
import { slugifyInstitutionName } from "../lib/institutionSeed";
import { resolveAuthorName, logTeamActivity, logAppEvent } from "../lib/routeHelpers";
import { computeCompletenessScore, computeContentHash } from "../lib/pipeline/contentHash";
import { fetchHtml, extractText } from "../lib/scrapers/utils";
import { DESCRIPTION_SELECTORS } from "../lib/scrapers/detailFetcher";
import { makeFingerprint } from "../lib/ingestion";
import { classifyBatch, classifyAsset } from "../lib/pipeline/classifyAsset";
import OpenAI from "openai";
import Stripe from "stripe";
import multer from "multer";
import mammoth from "mammoth";
import { dataSources, getSourceHealthEntries } from "../lib/sources/index";
import { normalizeSignals } from "../lib/pipeline/normalizeSignals";
import { scoreAssets, scoreFreshness, scoreNovelty, scoreReadiness, scoreLicensability, scoreCompetition, scoreCompleteness, scoreAvailability, computeTotal, TTO_WEIGHTS } from "../lib/pipeline/scoreAssets";
import { deepEnrichBatch } from "../lib/pipeline/deepEnrichBatch";
import { embedAssets } from "../lib/pipeline/embedAssets";
import { embedQuery, ragQuery, fetchPortfolioStats, parseQueryFilters, hasMeaningfulFilters, getOrUpdateSessionFocus, detectInstitutionName, rerankAssets, persistSessionFocus, seedSessionFocusFromDb, classifyIntent, type UserContext, type SessionFocusContext } from "../lib/eden/rag";
import { verifyAnyAuth, verifyConceptAuth, tryGetUserId, requireAdmin, getAdminUser, getAdminEmails } from "../lib/supabaseAuth";
import { hasMarketRead, getMarketAccessState } from "../lib/marketAccess";
import { getEffectiveMarketAccess, getUserMarketEntitlement, setUserMarketEntitlement, syncOrgMembersMarketEntitlement, userHasMarketRead } from "../lib/marketEntitlement";
import { broadcastToOrg, broadcastToUsers, registerUserClient, unregisterUserClient } from "../lib/orgBroadcast";
import { ALL_SCRAPERS, getScraperTier } from "../lib/scrapers/index";
import { getSchedulerStatus, startScheduler, pauseScheduler, resetAndStartScheduler, bumpToFront, setDelay, invalidateHealthCacheEntry, startTierOnly, startStalenessFirstScan, startDailySweep, setConcurrency, getMaxHttpConcurrent, getScraperHealthCache, cancelCurrentSync, isTransientDbError } from "../lib/scheduler";
import { getAllScraperHealth, clearScraperBackoff, updateScraperHealth } from "../lib/scraperState";
import { runIngestionPipeline, isIngestionRunning, getEnrichingCount, getScrapingProgress, getUpsertProgress, isSyncRunning, getSyncRunningFor, getActiveSyncs, runInstitutionSync, tryAcquireSyncLock, releaseSyncLock, runScrapedFieldRefresh } from "../lib/ingestion";
import { isFatalOpenAIError, friendlyOpenAIError } from "../lib/llm";
import { ALL_PORTAL_ROLES } from "@shared/portals";
import { sendWelcomeEmail, sendTeamInviteEmail, sendAccountDeletionEmail, sendSubscriptionWelcomeEmail, sendPaymentFailedEmail, sendRenewalConfirmationEmail, sendMarketMutualInterestEmail, sendMarketNdaSignedEmail, sendDealRoomMessageEmail, sendDealRoomDocumentEmail, sendMarketGraceNoticeEmail, sendMarketEoiDeclinedEmail, sendMarketObserverInviteEmail, sendMarketFeedbackRequestEmail, APP_URL, sendEmail, sendMarketAdHocEmail, sendAdminNotificationEmail, verifyUnsubscribeToken, verifyUnsubscribeTokenForEmail, unsubscribeUrlForEmail, FROM_DIGEST } from "../email";
import { captureException as sentryCaptureException } from "../lib/sentry";
import { cacheGet, cacheSet } from "../lib/responseCache";
import { requireApiKey } from "../lib/apiKeyAuth";
import { createStripe } from "./billing";

export function registerImportRoutes(app: Express): void {
  app.get("/api/admin/institutions", async (req, res) => {
    try {
      const manual = await storage.getManualInstitutions();
      const scraperNames = ALL_SCRAPERS.map((s) => s.institution);
      const manualNames = manual.map((m) => m.name);
      const merged = Array.from(new Set([...scraperNames, ...manualNames])).sort((a, b) => a.localeCompare(b));
      return res.json({ institutions: merged, manual: manual.map((m) => ({ name: m.name, ttoUrl: m.ttoUrl })) });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/institutions", async (req, res) => {
    try {
      const parsed = insertManualInstitutionSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
      const row = await storage.createManualInstitution(parsed.data);
      return res.json({ institution: row });
    } catch (err: any) {
      if (err.message?.includes("unique") || err.message?.includes("duplicate")) {
        return res.status(409).json({ error: "Institution already exists" });
      }
      return res.status(500).json({ error: err.message });
    }
  });

  // â”€â”€ Manual Import â€” Parse (multipart form-data, returns asset array) â”€â”€â”€â”€â”€â”€
  const manualImportUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024, files: 15 },
  });

  app.post(
    "/api/admin/manual-import/parse",
    manualImportUpload.fields([
      { name: "images", maxCount: 10 },
      { name: "documents", maxCount: 5 },
    ]),
    async (req: any, res) => {

    const institution: string = (req.body?.institution ?? "").trim();
    if (!institution) return res.status(400).json({ error: "institution is required" });

    const rawText: string = (req.body?.rawText ?? "").trim();
    const filesMap: Record<string, Express.Multer.File[]> = (req.files as any) ?? {};
    const imageFiles: Express.Multer.File[] = filesMap["images"] ?? [];
    const docFiles: Express.Multer.File[] = filesMap["documents"] ?? [];

    if (!rawText && imageFiles.length === 0 && docFiles.length === 0) {
      return res.status(400).json({ error: "Provide rawText, at least one image, or at least one document" });
    }

    const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
    for (const file of imageFiles) {
      if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
        return res.status(400).json({ error: `Image type not supported: ${file.mimetype}. Use PNG, JPG, or WebP.` });
      }
    }

    const ALLOWED_DOC_TYPES = new Set([
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]);
    for (const file of docFiles) {
      if (!ALLOWED_DOC_TYPES.has(file.mimetype)) {
        return res.status(400).json({ error: `Document type not supported: ${file.mimetype}. Use PDF or DOCX.` });
      }
    }

    // Extract text from uploaded documents (no AI cost â€” lazy dynamic import for CJS/ESM compat)
    const docTexts: string[] = [];
    if (docFiles.length > 0) {
      // Dynamic import is safe: esbuild transforms it to require() in CJS bundle; tsx uses native import()
      const pdfParseMod = await import("pdf-parse");
      const pdfParseFn: (buf: Buffer) => Promise<{ text: string }> =
        (pdfParseMod as any).default ?? pdfParseMod;

      for (const file of docFiles) {
        try {
          if (file.mimetype === "application/pdf") {
            const parsed = await pdfParseFn(file.buffer);
            if (parsed.text?.trim()) docTexts.push(parsed.text.trim());
          } else {
            const result = await mammoth.extractRawText({ buffer: file.buffer });
            if (result.value?.trim()) docTexts.push(result.value.trim());
          }
        } catch (e: any) {
          console.warn(`[manual-import/parse] Could not extract text from ${file.originalname}: ${e?.message}`);
        }
      }
    }

    const combinedText = [rawText, ...docTexts].filter(Boolean).join("\n\n---\n\n");

    // Guard: if documents were uploaded but yielded no extractable text (e.g. scanned/image PDFs)
    if (docFiles.length > 0 && docTexts.length === 0 && !rawText && imageFiles.length === 0) {
      return res.status(400).json({ error: "No text could be extracted from the uploaded documents. The files may be scanned/image-only PDFs. Try copying the text manually and using Paste Text mode instead." });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Layout-aware prompt: describes the standard two-column TTO listing page structure
    // so the model hunts each field in its expected zone rather than guessing.
    const buildParsePrompt = (inst: string) =>
      `You are a biotech technology transfer analyst extracting a single licensable asset from a TTO (Technology Transfer Office) listing page for institution: ${inst}.

TTO listing pages typically follow this two-column layout:
- LEFT SIDEBAR: technology ID / IDF number / case number (look for labels like "IDF #:", "Case #:", "Tech ID:"), inventor names (under "Meet the Inventors" or "Inventors"), contact person name and email (under "Contact For More Info"), school or department name.
- MAIN CONTENT AREA: the technology title (large heading at top), then labelled sections such as "Unmet Need", "Value Proposition" (used by Duke and some others as an equivalent to "Unmet Need"), "Technology", "Other Applications", "Advantages" (bullet list), "Background", "Description".

Extract exactly one asset from this page. Return ONLY valid JSON with a single key "assets" containing a one-item array. The item must have these fields:
- name: the technology title from the main heading (string)
- description: 2-3 sentence summary combining the Technology, Unmet Need, and/or Value Proposition sections (string, "" if not visible)
- abstract: the full verbatim text from all main content sections concatenated (string, "" if not visible)
- sourceUrl: the page URL if visible in a browser address bar or breadcrumb (string, "" if not)
- inventors: array of inventor full names from the sidebar (string[], [] if none listed)
- technologyId: the technology ID, IDF number, or case number from the sidebar â€” look for "IDF #:", "T-" prefixed codes, "Case #:" (string, "" if not visible)
- contactEmail: the contact email address from the sidebar (string, "" if not visible)
- patentStatus: one of "patented", "patent pending", "provisional", "unknown" â€” infer from any patent application links or text mentioning PCT/provisional
- target: molecular or biological target if determinable, e.g. "AAV capsid", "PD-1" ("unknown" if not stated)
- modality: one of "small molecule", "antibody", "gene therapy", "cell therapy", "peptide", "vaccine", "nanoparticle", "medical device", "diagnostic", "platform technology", "research tool", "unknown"
- indication: disease or condition being targeted ("unknown" if not stated)
- developmentStage: one of "discovery", "preclinical", "phase 1", "phase 2", "phase 3", "approved", "unknown"
- categories: array of 2-4 therapeutic area tags e.g. ["oncology", "gene therapy"] ([] if not determinable)
- innovationClaim: 1-sentence key innovation from the Advantages or Technology section ("unknown" if not clear)
- mechanismOfAction: brief mechanism description ("unknown" if not stated)`;

    // Normalise a raw AI response into a typed asset array
    function normaliseAssets(raw: any[]): any[] {
      return raw.slice(0, 200).map((a: any) => ({
        name: String(a.name || "Unknown Asset"),
        description: String(a.description || ""),
        sourceUrl: String(a.sourceUrl || ""),
        inventors: Array.isArray(a.inventors) ? a.inventors.map(String) : [],
        patentStatus: String(a.patentStatus || "unknown"),
        technologyId: String(a.technologyId || ""),
        contactEmail: String(a.contactEmail || ""),
        target: String(a.target || "unknown"),
        modality: String(a.modality || "unknown"),
        indication: String(a.indication || "unknown"),
        developmentStage: String(a.developmentStage || "unknown"),
        abstract: String(a.abstract || ""),
        categories: Array.isArray(a.categories) ? a.categories.map(String) : [],
        innovationClaim: String(a.innovationClaim || "unknown"),
        mechanismOfAction: String(a.mechanismOfAction || "unknown"),
      }));
    }

    try {
      let assets: any[] = [];
      const failedImages: string[] = [];

      if (imageFiles.length > 0) {
        // â”€â”€ Image mode: gpt-4o, one API call per image â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        // Processing images individually eliminates cross-page content bleed and
        // gives each screenshot its own full context window.
        const prompt = buildParsePrompt(institution);
        for (const file of imageFiles) {
          const b64 = file.buffer.toString("base64");
          const parts: any[] = [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:${file.mimetype};base64,${b64}`, detail: "high" as const } },
          ];
          // If supplementary text was also uploaded, append it as context
          if (combinedText) {
            parts.push({ type: "text", text: `\n\n---\nSupplementary text (may relate to the same page):\n${combinedText.slice(0, 8000)}` });
          }
          try {
            const response = await openai.chat.completions.create({
              model: "gpt-4o",
              messages: [{ role: "user", content: parts }],
              response_format: { type: "json_object" },
              temperature: 0.1,
              max_tokens: 2048,
            });
            const aiContent = response.choices[0]?.message?.content ?? "";
            let parsedJson: any;
            try { parsedJson = JSON.parse(aiContent); } catch {
              failedImages.push(file.originalname);
              continue;
            }
            const rawAssets: any[] = Array.isArray(parsedJson?.assets) ? parsedJson.assets
              : Array.isArray(parsedJson) ? parsedJson : [];
            const normalised = normaliseAssets(rawAssets);
            if (normalised.length === 0) {
              failedImages.push(file.originalname);
            } else {
              assets.push(...normalised);
            }
          } catch (imgErr: any) {
            console.warn(`[manual-import/parse] gpt-4o call failed for image ${file.originalname}: ${imgErr?.message}`);
            failedImages.push(file.originalname);
          }
        }
        // If every image call failed or returned empty JSON, surface a real error
        if (assets.length === 0) {
          return res.status(500).json({ error: "No assets could be extracted from the uploaded images. The image quality may be too low, or the AI vision call failed â€” check server logs for details." });
        }
      } else if (combinedText) {
        // â”€â”€ Text-only mode: gpt-4o-mini, single call â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        // No vision needed â€” keep the cheaper model and a multi-asset prompt.
        const textPrompt = `You are a biotech technology transfer analyst. Extract every distinct licensable asset from the provided TTO (Technology Transfer Office) content for institution: ${institution}.

Return ONLY valid JSON with a single key "assets" containing an array (up to 200 items). Each item must have these fields:
- name: the technology/asset name as listed (string)
- description: 2-3 sentence summary of the technology (string, "" if not determinable)
- sourceUrl: URL of this specific listing if visible (string, "" if not)
- inventors: array of inventor names if listed (string[], [] if none stated)
- patentStatus: one of "patented", "patent pending", "provisional", "unknown"
- technologyId: technology ID or case number if visible (string, "" if not)
- contactEmail: contact email if listed (string, "" if not)
- target: molecular or biological target if determinable ("unknown" if not stated)
- modality: one of "small molecule", "antibody", "gene therapy", "cell therapy", "peptide", "vaccine", "nanoparticle", "medical device", "diagnostic", "platform technology", "research tool", "unknown"
- indication: disease or condition being targeted ("unknown" if not stated)
- developmentStage: one of "discovery", "preclinical", "phase 1", "phase 2", "phase 3", "approved", "unknown"
- abstract: full description text from listing if visible (string, "" if not)
- categories: array of 2-4 therapeutic area tags ([] if not determinable)
- innovationClaim: 1-sentence key innovation ("unknown" if not clear)
- mechanismOfAction: brief MoA description ("unknown" if not stated)

If multiple assets appear, return each as a separate array item.`;

        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: [
            { type: "text", text: textPrompt },
            { type: "text", text: `\n\n---\nContent:\n${combinedText.slice(0, 16000)}` },
          ] }],
          response_format: { type: "json_object" },
          temperature: 0.1,
          max_tokens: 4096,
        });
        const aiContent = response.choices[0]?.message?.content ?? "";
        let parsedJson: any;
        try { parsedJson = JSON.parse(aiContent); } catch { return res.status(500).json({ error: "AI returned invalid JSON" }); }
        const rawAssets: any[] = Array.isArray(parsedJson?.assets) ? parsedJson.assets
          : Array.isArray(parsedJson) ? parsedJson : [];
        assets = normaliseAssets(rawAssets);
      }

      return res.json({ assets, institution, failedImages });
    } catch (err: any) {
      console.error("[manual-import/parse] Error:", err);
      return res.status(500).json({ error: err.message ?? "Parse failed" });
    }
  });

  // â”€â”€ Manual Import â€” Batch Commit to Indexing Queue â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  app.post("/api/admin/manual-import/commit", async (req, res) => {

    const assetSchema = z.object({
      name: z.string().min(1),
      description: z.string().default(""),
      abstract: z.string().default(""),
      sourceUrl: z.string().default(""),
      inventors: z.array(z.string()).default([]),
      patentStatus: z.string().default("unknown"),
      technologyId: z.string().default(""),
      contactEmail: z.string().default(""),
      target: z.string().default("unknown"),
      modality: z.string().default("unknown"),
      indication: z.string().default("unknown"),
      developmentStage: z.string().default("unknown"),
    });

    const bodySchema = z.object({
      institution: z.string().min(1),
      assets: z.array(assetSchema).min(1).max(200),
    });

    const bodyParsed = bodySchema.safeParse(req.body);
    if (!bodyParsed.success) return res.status(400).json({ error: "Invalid request body" });
    const { institution, assets } = bodyParsed.data;

    try {
      const run = await storage.createIngestionRun();

      const listings = assets.map((a) => ({
        fingerprint: makeFingerprint(a.name, institution),
        assetName: a.name,
        institution,
        target: a.target && a.target !== "unknown" ? a.target : "unknown",
        modality: a.modality && a.modality !== "unknown" ? a.modality : "unknown",
        indication: a.indication && a.indication !== "unknown" ? a.indication : "unknown",
        developmentStage: a.developmentStage && a.developmentStage !== "unknown" ? a.developmentStage : "unknown",
        summary: a.description || a.name,
        abstract: a.abstract || null,
        sourceType: "tech_transfer" as const,
        sourceName: "manual",
        sourceUrl: a.sourceUrl || null,
        technologyId: a.technologyId || null,
        patentStatus: a.patentStatus !== "unknown" ? a.patentStatus : null,
        inventors: a.inventors.length > 0 ? a.inventors : null,
        contactEmail: a.contactEmail || null,
        relevant: true,
        runId: run.id,
      }));

      const { newAssets, totalProcessed } = await storage.bulkUpsertIngestedAssets(listings);
      const imported = newAssets.length;
      const skipped = totalProcessed - imported;

      await storage.updateIngestionRun(run.id, { status: "completed", totalFound: totalProcessed, newCount: imported });

      if (newAssets.length > 0) {
        const listingMap = new Map(listings.map((l) => [l.fingerprint, l]));
        const classifyInputs = newAssets.map((a) => ({
          id: a.id,
          title: a.assetName,
          description: listingMap.get(makeFingerprint(a.assetName, institution))?.summary ?? a.assetName,
          abstract: undefined as string | undefined,
        }));

        // Re-classify to fill any remaining unknown fields; preserve values already set from parse step
        const newAssetById = new Map(newAssets.map((a) => [a.id, a]));
        classifyBatch(classifyInputs, 5, async (id, classification) => {
          try {
            const stored = newAssetById.get(id);
            const listing = listingMap.get(makeFingerprint(stored?.assetName ?? "", institution));
            // Prefer parse-extracted values; only use classifier result when parse had "unknown"
            const finalTarget = (listing?.target && listing.target !== "unknown") ? listing.target : (classification.target ?? "unknown");
            const finalModality = (listing?.modality && listing.modality !== "unknown") ? listing.modality : (classification.modality ?? "unknown");
            const finalIndication = (listing?.indication && listing.indication !== "unknown") ? listing.indication : (classification.indication ?? "unknown");
            const finalStage = (listing?.developmentStage && listing.developmentStage !== "unknown") ? listing.developmentStage : classification.developmentStage;
            const score = computeCompletenessScore({
              assetClass: classification.assetClass,
              deviceAttributes: classification.deviceAttributes,
              target: finalTarget,
              modality: finalModality,
              indication: finalIndication,
              developmentStage: finalStage,
              categories: classification.categories,
              innovationClaim: classification.innovationClaim,
              mechanismOfAction: classification.mechanismOfAction,
              summary: listing?.summary ?? null,
              abstract: listing?.abstract ?? null,
              inventors: listing?.inventors ?? null,
              patentStatus: listing?.patentStatus ?? null,
            });
            await db
              .update(ingestedAssets)
              .set({
                target: finalTarget,
                modality: finalModality,
                indication: finalIndication,
                developmentStage: finalStage,
                ...(classification.categories ? { categories: classification.categories } : {}),
                ...(classification.categoryConfidence !== undefined ? { categoryConfidence: classification.categoryConfidence } : {}),
                ...(classification.innovationClaim ? { innovationClaim: classification.innovationClaim } : {}),
                ...(classification.mechanismOfAction ? { mechanismOfAction: classification.mechanismOfAction } : {}),
                completenessScore: score,
              })
              .where(eq(ingestedAssets.id, id));
          } catch (e: any) {
            console.error(`[manual-import/commit] classify error id=${id}: ${e?.message}`);
          }
        }).catch((e: any) => console.error("[manual-import/commit] classifyBatch error:", e?.message));
      }

      return res.json({ imported, skipped });
    } catch (err: any) {
      console.error("[manual-import/commit] Error:", err);
      return res.status(500).json({ error: err.message ?? "Commit failed" });
    }
  });

}