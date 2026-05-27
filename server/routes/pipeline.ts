import type { Express } from "express";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { SAVED_ASSET_STATUSES } from "@shared/schema";
import { verifyAnyAuth, tryGetUserId } from "../lib/supabaseAuth";
import {
  requireNotViewer, canAccessSavedAsset, resolveAuthorName,
  logTeamActivity, logAppEvent, canMutatePipeline,
} from "../lib/routeHelpers";
import { registerClient, unregisterClient, broadcastToOrg } from "../lib/orgBroadcast";
import { friendlyOpenAIError } from "../lib/llm";

const saveAssetBodySchema = z.object({
  ingested_asset_id: z.number().int().optional(),
  pipeline_list_id: z.number().int().optional().nullable(),
  parent_saved_asset_id: z.number().int().optional().nullable(),
  asset_name: z.string(),
  target: z.string(),
  modality: z.string(),
  development_stage: z.string(),
  disease_indication: z.string(),
  summary: z.string(),
  source_title: z.string(),
  source_journal: z.string(),
  publication_year: z.string(),
  source_name: z.string().default("pubmed"),
  source_url: z.string().optional(),
  pmid: z.string().optional(),
});

const STATUS_LABELS: Record<string, string> = {
  watching: "Watching",
  evaluating: "Evaluating",
  in_discussion: "In Discussion",
  on_hold: "On Hold",
  passed: "Passed",
};

export function registerPipelineRoutes(app: Express): void {
  // ── Pipeline-lists summary (used by Pipeline page header stats) ──────────
  app.get("/api/pipeline-lists/summary", async (req, res) => {
    try {
      const userId = await tryGetUserId(req);
      if (!userId) return res.status(401).json({ error: "Authentication required" });

      const userOrg = await storage.getOrgForUser(userId);
      const orgId = userOrg?.id ?? null;

      const listsQuery = orgId
        ? sql`
          SELECT pl.id, pl.name, COUNT(sa.id)::int AS asset_count
          FROM pipeline_lists pl
          LEFT JOIN saved_assets sa ON sa.pipeline_list_id = pl.id
          WHERE pl.user_id = ${userId} OR pl.org_id = ${orgId}
          GROUP BY pl.id, pl.name
          ORDER BY pl.created_at DESC
        `
        : sql`
          SELECT pl.id, pl.name, COUNT(sa.id)::int AS asset_count
          FROM pipeline_lists pl
          LEFT JOIN saved_assets sa ON sa.pipeline_list_id = pl.id
          WHERE pl.user_id = ${userId}
          GROUP BY pl.id, pl.name
          ORDER BY pl.created_at DESC
        `;

      const [lists, totalSavedResult, institutionCountResult, typeCountsResult] = await Promise.all([
        db.execute(listsQuery),
        db.execute(sql`SELECT COUNT(*)::int AS n FROM saved_assets WHERE user_id = ${userId}`),
        db.execute(sql`
          SELECT COUNT(DISTINCT COALESCE(ia.institution, sa.source_journal))::int AS n
          FROM saved_assets sa
          LEFT JOIN ingested_assets ia ON ia.id = sa.ingested_asset_id
          WHERE sa.user_id = ${userId}
            AND COALESCE(ia.institution, sa.source_journal) IS NOT NULL
            AND COALESCE(ia.institution, sa.source_journal) != ''
            AND COALESCE(ia.institution, sa.source_journal) != 'unknown'
        `),
        db.execute(sql`
          SELECT
            SUM(CASE WHEN ia.source_type = 'patent' THEN 1 ELSE 0 END)::int AS patents,
            SUM(CASE WHEN ia.source_type IN ('paper','preprint') THEN 1 ELSE 0 END)::int AS research_studies,
            SUM(CASE WHEN ia.source_type = 'clinical_trial' THEN 1 ELSE 0 END)::int AS clinical_trials
          FROM saved_assets sa
          JOIN ingested_assets ia ON ia.id = sa.ingested_asset_id
          WHERE sa.user_id = ${userId}
        `),
      ]);

      const pipelineSummaryLists = (lists.rows as Record<string, unknown>[]).map((r) => ({
        id: Number(r.id),
        name: String(r.name ?? ""),
        assetCount: Number(r.asset_count ?? 0),
      }));
      const totalPipelines = pipelineSummaryLists.length;
      const totalSavedAssets = Number((totalSavedResult.rows[0] as Record<string, unknown>)?.n ?? 0);
      const institutionCount = Number((institutionCountResult.rows[0] as Record<string, unknown>)?.n ?? 0);
      const tcRow = (typeCountsResult.rows[0] as Record<string, unknown> | undefined) ?? {};
      const typeCounts = {
        patents: Number(tcRow.patents ?? 0),
        researchStudies: Number(tcRow.research_studies ?? 0),
        clinicalTrials: Number(tcRow.clinical_trials ?? 0),
      };
      return res.json({ lists: pipelineSummaryLists, totalPipelines, totalSavedAssets, institutionCount, typeCounts });
    } catch (err: any) {
      console.error("[pipeline-lists/summary] Error:", err);
      return res.status(500).json({ error: err.message ?? "Failed to load pipeline summary" });
    }
  });

  // ── Pipeline brief (LLM-generated BD brief for a pipeline list) ──────────
  app.post("/api/pipeline-lists/:id/brief", async (req, res) => {
    try {
      const userId = await tryGetUserId(req);
      if (!userId) return res.status(401).json({ error: "Authentication required" });

      const listId = parseInt(req.params.id, 10);
      if (isNaN(listId)) return res.status(400).json({ error: "Invalid pipeline list ID" });

      const userOrg = await storage.getOrgForUser(userId);
      const orgId = userOrg?.id ?? null;

      const [listResult, assetsResult] = await Promise.all([
        orgId
          ? db.execute(sql`SELECT name FROM pipeline_lists WHERE id = ${listId} AND (user_id = ${userId} OR org_id = ${orgId}) LIMIT 1`)
          : db.execute(sql`SELECT name FROM pipeline_lists WHERE id = ${listId} AND user_id = ${userId} LIMIT 1`),
        db.execute(sql`
          SELECT sa.id, sa.asset_name, sa.target, sa.modality, sa.development_stage,
                 sa.disease_indication, sa.summary, sa.source_name, sa.source_title,
                 sa.source_journal, sa.publication_year, sa.status, sa.parent_saved_asset_id,
                 COALESCE(ia.institution, '') AS institution
          FROM saved_assets sa
          LEFT JOIN ingested_assets ia ON ia.id = sa.ingested_asset_id
          WHERE sa.pipeline_list_id = ${listId}
          ORDER BY sa.parent_saved_asset_id NULLS FIRST, sa.id ASC
          LIMIT 100
        `),
      ]);

      const listRow = listResult.rows[0] as Record<string, unknown> | undefined;
      if (!listRow) return res.status(404).json({ error: "Pipeline list not found" });
      const pipelineName = String(listRow.name ?? "Pipeline");

      const allRows = assetsResult.rows as Record<string, unknown>[];
      const safePipelineName = pipelineName.replace(/[^\w\s\-.,()&]/g, "").slice(0, 120);
      if (allRows.length === 0) {
        return res.json({
          pipelineName: safePipelineName, assetCount: 0, generatedAt: new Date().toISOString(),
          assets: [], standaloneSignals: [],
          strategicThesis: `No assets in the "${safePipelineName}" pipeline yet.`,
          bdStatusOverview: "", strategicAssessment: "",
          brief: `No assets in the "${safePipelineName}" pipeline yet.`,
        });
      }

      const NON_TTO = ["patent", "clinical_trial", "pubmed", "biorxiv", "medrxiv", "literature", "arxiv", "preprint", "paper"];
      const isNonTto = (src: string) => NON_TTO.some(n => src.toLowerCase().includes(n));
      const srcLabel = (src: string): string => {
        const s = src.toLowerCase();
        if (s.includes("patent")) return "Patent";
        if (s.includes("clinical_trial")) return "Clinical Trial";
        if (s.includes("pubmed") || s.includes("paper") || s.includes("literature")) return "Paper";
        if (s.includes("biorxiv") || s.includes("medrxiv") || s.includes("preprint") || s.includes("arxiv")) return "Preprint";
        return "Signal";
      };

      const ttoRows = allRows.filter(r => !isNonTto(String(r.source_name ?? "")));
      const signalRows = allRows.filter(r => isNonTto(String(r.source_name ?? "")));

      const signalsByParent: Record<number, typeof signalRows> = {};
      const standaloneSignalRows: typeof signalRows = [];
      for (const s of signalRows) {
        const pid = s.parent_saved_asset_id as number | null;
        if (pid) { (signalsByParent[pid] ??= []).push(s); } else { standaloneSignalRows.push(s); }
      }

      const structuredAssets = ttoRows.map(r => ({
        id: Number(r.id),
        name: String(r.asset_name ?? "Unknown"),
        target: String(r.target ?? "—"),
        modality: String(r.modality ?? "—"),
        stage: String(r.development_stage ?? "—"),
        indication: String(r.disease_indication ?? "—"),
        status: r.status ? (STATUS_LABELS[String(r.status)] ?? String(r.status)) : null,
        institution: (String(r.institution ?? "").trim() || String(r.source_journal ?? "")).trim() || "—",
        summary: String(r.summary ?? "").trim(),
        insight: null as string | null,
        signals: (signalsByParent[Number(r.id)] ?? []).map(s => ({
          type: srcLabel(String(s.source_name ?? "")),
          title: String(s.source_title ?? s.asset_name ?? "—").trim(),
          year: String(s.publication_year ?? "—"),
          summary: String(s.summary ?? "").slice(0, 200).trim(),
        })),
      }));

      const standaloneSignals = standaloneSignalRows.map(s => ({
        type: srcLabel(String(s.source_name ?? "")),
        title: String(s.source_title ?? s.asset_name ?? "—").trim(),
        year: String(s.publication_year ?? "—"),
      }));

      const assetContext = structuredAssets.map((a, i) => {
        const sigText = a.signals.length > 0
          ? `Supporting evidence (${a.signals.length}):\n` + a.signals.map(s => `    [${s.type}] "${s.title}" (${s.year})${s.summary ? " — " + s.summary : ""}`).join("\n")
          : "No supporting signals linked.";
        return [
          `Asset ${i + 1}: ${a.name}`,
          `  Target: ${a.target} | Modality: ${a.modality} | Stage: ${a.stage}`,
          `  Disease: ${a.indication} | Institution: ${a.institution}`,
          `  BD Status: ${a.status ?? "not set"}`,
          a.summary ? `  Context: ${a.summary.slice(0, 300)}` : "",
          `  ${sigText}`,
        ].filter(Boolean).join("\n");
      }).join("\n\n");

      const standaloneCtx = standaloneSignals.length > 0
        ? `\nUNLINKED SIGNALS (${standaloneSignals.length}):\n` + standaloneSignals.map(s => `- [${s.type}] "${s.title}" (${s.year})`).join("\n")
        : "";

      const prompt = `You are a biotech intelligence analyst writing a pipeline brief for a BD/licensing team.
Pipeline: "${safePipelineName}"

PIPELINE ASSETS:
${assetContext}${standaloneCtx}

Write a brief with EXACTLY these four sections. Plain text only — no markdown, no bullet symbols. Separate sections with a blank line. Use the exact section labels.

STRATEGIC THESIS
2-3 sentences identifying the core therapeutic focus, target classes, and scientific positioning of this pipeline.

BD STATUS OVERVIEW
1-2 sentences summarising where assets stand operationally. Name specific assets by status where set. If no statuses are set, note that.

ASSET INSIGHTS
One analytical sentence per asset. Format each line as:
[Asset Name] — [one sentence drawing on target, modality, stage, and evidence]

STRATEGIC ASSESSMENT
2-3 sentences on pipeline strengths, evidence gaps, and where the BD team should focus next.`;

      const { default: OpenAI } = await import("openai");
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1200,
        temperature: 0.3,
      });
      const llmText = completion.choices[0]?.message?.content ?? "";

      function extractSection(text: string, label: string): string {
        const re = new RegExp(`${label}\\s*\\n([\\s\\S]*?)(?=\\n[A-Z][A-Z &]+\\n|$)`, "i");
        const m = text.match(re);
        return m ? m[1].trim() : "";
      }

      const strategicThesis = extractSection(llmText, "STRATEGIC THESIS");
      const bdStatusOverview = extractSection(llmText, "BD STATUS OVERVIEW");
      const assetInsightsRaw = extractSection(llmText, "ASSET INSIGHTS");
      const strategicAssessment = extractSection(llmText, "STRATEGIC ASSESSMENT");

      const insightMap: Record<string, string> = {};
      for (const line of assetInsightsRaw.split("\n")) {
        const m = line.match(/^(.+?)\s*[—–-]{1,2}\s*(.+)$/);
        if (m) insightMap[m[1].trim()] = m[2].trim();
      }
      const assetsWithInsights = structuredAssets.map(a => ({ ...a, insight: insightMap[a.name] ?? null }));

      const brief = [
        `${pipelineName.toUpperCase()} — PIPELINE BRIEF`,
        "",
        "STRATEGIC THESIS",
        strategicThesis,
        "",
        "BD STATUS OVERVIEW",
        bdStatusOverview,
        "",
        "ASSET ROSTER",
        ...assetsWithInsights.map((a, i) => [
          `${i + 1}. ${a.name}`,
          `   ${a.stage} · ${a.modality}${a.status ? " · " + a.status : ""}`,
          `   Target: ${a.target} | ${a.indication} | ${a.institution}`,
          a.insight ? `   ${a.insight}` : "",
          a.signals.length > 0
            ? "   Supporting Evidence:\n" + a.signals.map(s => `   [${s.type}] "${s.title}" (${s.year})`).join("\n")
            : "   No supporting signals.",
          "",
        ].filter((l): l is string => l !== "").join("\n")),
        standaloneSignals.length > 0
          ? "UNLINKED SIGNALS\n" + standaloneSignals.map(s => `[${s.type}] "${s.title}" (${s.year})`).join("\n")
          : "",
        "",
        "STRATEGIC ASSESSMENT",
        strategicAssessment,
      ].filter(s => s !== "").join("\n");

      logAppEvent("pipeline_brief_generated", { listId, assetCount: ttoRows.length });
      return res.json({
        pipelineName,
        assetCount: ttoRows.length,
        generatedAt: new Date().toISOString(),
        assets: assetsWithInsights,
        standaloneSignals,
        strategicThesis,
        bdStatusOverview,
        strategicAssessment,
        brief,
      });
    } catch (err: any) {
      console.error("[pipeline-lists/brief] Error:", err);
      return res.status(500).json({ error: friendlyOpenAIError(err) });
    }
  });

  // ── Saved assets ─────────────────────────────────────────────────────────
  app.get("/api/saved-assets", async (req, res) => {
    try {
      const scope = req.query.scope as string | undefined;
      const userId = await tryGetUserId(req);

      if (scope === "team") {
        if (!userId) return res.status(401).json({ error: "Authentication required" });
        const userOrg = await storage.getOrgForUser(userId);
        if (!userOrg || userOrg.planTier === "individual") {
          return res.status(403).json({ error: "Team scope requires a team plan" });
        }
        const memberId = req.query.memberId as string | undefined;
        const result = await storage.getSavedAssetsForTeam(userOrg.id, memberId || undefined);
        const teamIds = result.assets.map((a) => a.id);
        const teamNoteMeta = await storage.getAssetNoteMeta(teamIds);
        return res.json({
          assets: result.assets.map((a) => ({
            ...a,
            noteCount: teamNoteMeta[a.id]?.count ?? 0,
            lastNoteAt: teamNoteMeta[a.id]?.lastNoteAt ?? null,
          })),
          members: result.members,
        });
      }

      if (!userId) return res.json({ assets: [] });

      const rawPl = req.query.pipelineListId;
      let pipelineListId: number | null | undefined = undefined;
      if (rawPl === "null") pipelineListId = null;
      else if (rawPl !== undefined) {
        const parsed = parseInt(rawPl as string, 10);
        if (!isNaN(parsed)) pipelineListId = parsed;
      }
      const assets = await storage.getSavedAssets(pipelineListId, userId);
      const assetIds = assets.map((a) => a.id);
      const noteMeta = await storage.getAssetNoteMeta(assetIds);

      const ingestedIds = assets
        .map((a) => a.ingestedAssetId)
        .filter((id): id is number => id !== null);
      const fingerprintMap: Record<number, string> = {};
      if (ingestedIds.length > 0) {
        try {
          const fpRows = await db.execute(
            sql`SELECT id, fingerprint FROM ingested_assets WHERE id = ANY(${ingestedIds}::int[]) AND fingerprint IS NOT NULL`
          );
          for (const row of fpRows.rows as { id: number; fingerprint: string }[]) {
            fingerprintMap[row.id] = row.fingerprint;
          }
        } catch (fpErr) {
          console.error("[saved-assets] Fingerprint batch resolution failed — dossier links will be broken:", fpErr);
        }
      }

      res.json({
        assets: assets.map((a) => ({
          ...a,
          fingerprint: a.ingestedAssetId ? (fingerprintMap[a.ingestedAssetId] ?? null) : null,
          noteCount: noteMeta[a.id]?.count ?? 0,
          lastNoteAt: noteMeta[a.id]?.lastNoteAt ?? null,
        })),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch saved assets" });
    }
  });

  app.post("/api/saved-assets", async (req, res) => {
    try {
      if (!(await requireNotViewer(req, res))) return;
      const body = saveAssetBodySchema.parse(req.body);
      const userId = await tryGetUserId(req);
      const asset = await storage.createSavedAsset({
        ingestedAssetId: body.ingested_asset_id ?? null,
        pipelineListId: body.pipeline_list_id ?? null,
        parentSavedAssetId: body.parent_saved_asset_id ?? null,
        assetName: body.asset_name,
        target: body.target,
        modality: body.modality,
        developmentStage: body.development_stage,
        diseaseIndication: body.disease_indication,
        summary: body.summary,
        sourceTitle: body.source_title,
        sourceJournal: body.source_journal,
        publicationYear: body.publication_year,
        sourceName: body.source_name,
        sourceUrl: body.source_url,
        pmid: body.pmid,
      }, userId);
      logTeamActivity(userId ?? null, "saved_asset", asset.ingestedAssetId ?? null, null, asset.assetName).catch(() => {});
      if (userId && asset.ingestedAssetId) {
        storage.recordFeedback(userId, asset.ingestedAssetId, "save", "saved_assets").catch(() => {});
      }
      res.status(201).json({ asset });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to save asset" });
    }
  });

  // SSE endpoint for real-time org-level saved-asset updates
  app.get("/api/saved-assets/events", async (req, res) => {
    const token = (req.headers.authorization?.replace("Bearer ", "") || req.query.token) as string | undefined;
    let userId: string | undefined;
    if (token) {
      try {
        const { createClient } = await import("@supabase/supabase-js");
        const adminSupabase = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { autoRefreshToken: false, persistSession: false } }
        );
        const { data } = await adminSupabase.auth.getUser(token);
        userId = data.user?.id;
      } catch {}
    }
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const userOrg = await storage.getOrgForUser(userId);
    if (!userOrg) return res.status(403).json({ error: "No organisation found" });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    res.write("event: connected\ndata: {}\n\n");

    registerClient(userOrg.id, res);
    req.on("close", () => unregisterClient(userOrg.id, res));
  });

  app.patch("/api/saved-assets/:id/pipeline", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
      const { pipeline_list_id } = z.object({ pipeline_list_id: z.number().int().nullable() }).parse(req.body);
      const userId = await tryGetUserId(req);
      const existing = await storage.getSavedAsset(id);
      if (!existing) return res.status(404).json({ error: "Asset not found" });
      if (!await canAccessSavedAsset(existing, userId ?? null)) return res.status(403).json({ error: "Access denied" });
      const asset = await storage.updateSavedAssetPipeline(id, pipeline_list_id);
      if (!asset) return res.status(404).json({ error: "Asset not found" });
      res.json({ asset });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to update pipeline" });
    }
  });

  app.patch("/api/saved-assets/:id/status", async (req, res) => {
    try {
      if (!(await requireNotViewer(req, res))) return;
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
      const { status } = z.object({
        status: z.enum(SAVED_ASSET_STATUSES).nullable(),
      }).parse(req.body);
      const userId = await tryGetUserId(req);

      const before = await storage.getSavedAsset(id);
      if (!before) return res.status(404).json({ error: "Asset not found" });
      if (!await canAccessSavedAsset(before, userId ?? null)) return res.status(403).json({ error: "Access denied" });

      const asset = await storage.updateSavedAssetStatus(id, status);
      if (!asset) return res.status(404).json({ error: "Asset not found" });

      const prevLabel = before.status ?? null;
      const nextLabel = status ?? null;
      if (prevLabel !== nextLabel) {
        const displayName = await resolveAuthorName(userId ?? null);
        const content = nextLabel
          ? `Status changed to ${STATUS_LABELS[nextLabel] ?? nextLabel} by ${displayName}.`
          : `Status cleared by ${displayName}.`;
        await storage.createAssetNote({
          savedAssetId: id,
          userId: userId ?? null,
          authorName: displayName,
          content,
          isSystemEvent: true,
        }).catch((e) => console.error(`[system-event-note] Failed for asset ${id}:`, e));
        logTeamActivity(userId ?? null, "moved_asset", before.ingestedAssetId ?? null, null, before.assetName, {
          fromStage: prevLabel,
          toStage: nextLabel,
        }).catch(() => {});
      }

      const statusOrg = await storage.getOrgForUser(userId ?? "").catch(() => null);
      if (statusOrg) broadcastToOrg(statusOrg.id, "status_changed", { savedAssetId: id }).catch(() => {});
      res.json({ asset });
    } catch (err: any) {
      res.status(400).json({ error: err.message ?? "Failed to update status" });
    }
  });

  app.patch("/api/saved-assets/:id/parent", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
      const { parent_saved_asset_id } = z.object({
        parent_saved_asset_id: z.number().int().positive().nullable(),
      }).parse(req.body);
      const userId = await tryGetUserId(req);
      const before = await storage.getSavedAsset(id);
      if (!before) return res.status(404).json({ error: "Asset not found" });
      if (!await canAccessSavedAsset(before, userId ?? null)) return res.status(403).json({ error: "Access denied" });
      if (parent_saved_asset_id === id) return res.status(400).json({ error: "Asset cannot be its own parent" });
      if (parent_saved_asset_id !== null) {
        let cursor: number | null = parent_saved_asset_id;
        const visited = new Set<number>();
        while (cursor !== null) {
          if (cursor === id) return res.status(400).json({ error: "Circular parent reference detected" });
          if (visited.has(cursor)) break;
          visited.add(cursor);
          const node = await storage.getSavedAsset(cursor);
          cursor = node?.parentSavedAssetId ?? null;
        }
      }
      const asset = await storage.updateSavedAssetParent(id, parent_saved_asset_id);
      if (!asset) return res.status(404).json({ error: "Asset not found" });
      res.json({ asset });
    } catch (err: any) {
      res.status(400).json({ error: err.message ?? "Failed to update parent" });
    }
  });

  app.get("/api/saved-assets/:id/notes", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
      const userId = await tryGetUserId(req);
      const asset = await storage.getSavedAsset(id);
      if (!asset) return res.status(404).json({ error: "Asset not found" });
      if (!await canAccessSavedAsset(asset, userId ?? null)) return res.status(403).json({ error: "Access denied" });
      const limitRaw = parseInt(req.query.limit as string || "50", 10);
      const offsetRaw = parseInt(req.query.offset as string || "0", 10);
      const limit = Math.min(isNaN(limitRaw) ? 50 : limitRaw, 200);
      const offset = isNaN(offsetRaw) || offsetRaw < 0 ? 0 : offsetRaw;
      const notes = await storage.getAssetNotes(id, limit, offset);
      res.json({ notes, limit, offset });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch notes" });
    }
  });

  app.post("/api/saved-assets/:id/notes", async (req, res) => {
    try {
      if (!(await requireNotViewer(req, res))) return;
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
      const { content } = z.object({ content: z.string().min(1).max(2000) }).parse(req.body);
      const userId = await tryGetUserId(req);
      const asset = await storage.getSavedAsset(id);
      if (!asset) return res.status(404).json({ error: "Asset not found" });
      if (!await canAccessSavedAsset(asset, userId ?? null)) return res.status(403).json({ error: "Access denied" });
      const resolvedAuthor = await resolveAuthorName(userId ?? null);
      const note = await storage.createAssetNote({
        savedAssetId: id,
        userId: userId ?? null,
        authorName: resolvedAuthor,
        content,
        isSystemEvent: false,
      });
      logTeamActivity(userId ?? null, "added_note", asset.ingestedAssetId ?? null, null, asset.assetName).catch(() => {});
      const noteOrg = await storage.getOrgForUser(userId ?? "").catch(() => null);
      if (noteOrg) broadcastToOrg(noteOrg.id, "note_added", { savedAssetId: id }).catch(() => {});
      res.status(201).json({ note });
    } catch (err: any) {
      res.status(400).json({ error: err.message ?? "Failed to create note" });
    }
  });

  app.patch("/api/saved-assets/:id/notes/:noteId", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const noteId = parseInt(req.params.noteId);
      if (isNaN(id) || isNaN(noteId)) return res.status(400).json({ error: "Invalid ID" });
      const { content } = z.object({ content: z.string().min(1).max(2000) }).parse(req.body);
      const userId = await tryGetUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const updated = await storage.updateAssetNote(noteId, content, userId);
      if (!updated) return res.status(404).json({ error: "Note not found or not owned by you" });
      const noteOrg = await storage.getOrgForUser(userId).catch(() => null);
      if (noteOrg) broadcastToOrg(noteOrg.id, "note_updated", { savedAssetId: id }).catch(() => {});
      res.json({ note: updated });
    } catch (err: any) {
      res.status(400).json({ error: err.message ?? "Failed to update note" });
    }
  });

  app.delete("/api/saved-assets/:id/notes/:noteId", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const noteId = parseInt(req.params.noteId);
      if (isNaN(id) || isNaN(noteId)) return res.status(400).json({ error: "Invalid ID" });
      const userId = await tryGetUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const deleted = await storage.deleteAssetNote(noteId, userId);
      if (!deleted) return res.status(404).json({ error: "Note not found or not owned by you" });
      const noteOrg = await storage.getOrgForUser(userId).catch(() => null);
      if (noteOrg) broadcastToOrg(noteOrg.id, "note_deleted", { savedAssetId: id }).catch(() => {});
      res.status(204).end();
    } catch (err: any) {
      res.status(400).json({ error: err.message ?? "Failed to delete note" });
    }
  });

  app.delete("/api/saved-assets/:id", async (req, res) => {
    try {
      if (!(await requireNotViewer(req, res))) return;
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
      const userId = await tryGetUserId(req);
      const assetBefore = await storage.getSavedAsset(id);
      if (!assetBefore) return res.status(404).json({ error: "Asset not found" });
      if (!await canAccessSavedAsset(assetBefore, userId ?? null)) return res.status(403).json({ error: "Access denied" });
      await storage.deleteSavedAsset(id);
      logTeamActivity(userId ?? null, "removed_asset", assetBefore.ingestedAssetId ?? null, null, assetBefore.assetName).catch(() => {});
      if (userId && assetBefore.ingestedAssetId) {
        storage.recordFeedback(userId, assetBefore.ingestedAssetId, "dismiss", "unsave").catch(() => {});
      }
      res.status(204).send();
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to delete asset" });
    }
  });

  // ── Team / Recent Activity Feed ─────────────────────────────────────────
  app.get("/api/team/activity", verifyAnyAuth, async (req, res) => {
    try {
      const userId = await tryGetUserId(req);
      if (!userId) return res.status(401).json({ error: "Authentication required" });
      const org = await storage.getOrgForUser(userId);
      let activities;
      let memberCount = 1;
      if (org) {
        activities = await storage.getTeamActivities(org.id, 20);
        memberCount = await storage.getOrgMemberCount(org.id).catch(() => 1);
      } else {
        activities = await storage.getUserActivities(userId, 20);
      }
      res.json({ activities, memberCount });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch team activity" });
    }
  });

  // ── Pipeline list CRUD ───────────────────────────────────────────────────
  app.get("/api/pipelines", async (req, res) => {
    try {
      const userId = await tryGetUserId(req);
      const userOrg = userId ? await storage.getOrgForUser(userId) : null;
      const orgId = userOrg?.id;
      const [lists, countsResult] = await Promise.all([
        storage.getPipelineLists(userId, orgId),
        userId
          ? db.execute(sql`
              SELECT pipeline_list_id, COUNT(*)::int AS cnt
              FROM saved_assets
              WHERE user_id = ${userId}
              GROUP BY pipeline_list_id
            `)
          : Promise.resolve({ rows: [] as unknown[] }),
      ]);
      const counts: Record<number, number> = {};
      let uncategorised = 0;
      for (const row of countsResult.rows as { pipeline_list_id: number | null; cnt: number }[]) {
        if (row.pipeline_list_id == null) uncategorised += row.cnt;
        else counts[row.pipeline_list_id] = row.cnt;
      }
      res.json({ pipelines: lists.map((l) => ({ ...l, assetCount: counts[l.id] ?? 0 })), uncategorisedCount: uncategorised });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch pipelines" });
    }
  });

  app.post("/api/pipelines", async (req, res) => {
    try {
      if (!(await requireNotViewer(req, res))) return;
      const { name, shared } = z.object({ name: z.string().min(1).max(100), shared: z.boolean().optional() }).parse(req.body);
      const userId = await tryGetUserId(req);
      let orgId: number | undefined;
      if (shared && userId) {
        const userOrg = await storage.getOrgForUser(userId);
        if (userOrg && userOrg.planTier !== "individual") orgId = userOrg.id;
      }
      const list = await storage.createPipelineList({ name, ...(orgId ? { orgId } : {}) }, userId);
      res.status(201).json({ pipeline: { ...list, assetCount: 0 } });
    } catch (err: any) {
      if (err?.name === "ZodError") return res.status(400).json({ error: err.message ?? "Invalid pipeline name" });
      res.status(500).json({ error: err.message ?? "Failed to create pipeline" });
    }
  });

  app.patch("/api/pipelines/:id", async (req, res) => {
    try {
      if (!(await requireNotViewer(req, res))) return;
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
      const { name } = z.object({ name: z.string().min(1).max(100) }).parse(req.body);
      const userId = await tryGetUserId(req);
      const existing = await storage.getPipelineList(id);
      if (!existing) return res.status(404).json({ error: "Pipeline not found" });
      if (!await canMutatePipeline(existing, userId ?? null)) return res.status(403).json({ error: "Access denied" });
      const list = await storage.updatePipelineList(id, name);
      if (!list) return res.status(404).json({ error: "Pipeline not found" });
      res.json({ pipeline: list });
    } catch (err: any) {
      if (err?.name === "ZodError") return res.status(400).json({ error: err.message ?? "Invalid pipeline name" });
      res.status(500).json({ error: err.message ?? "Failed to update pipeline" });
    }
  });

  app.delete("/api/pipelines/:id", async (req, res) => {
    try {
      if (!(await requireNotViewer(req, res))) return;
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
      const userId = await tryGetUserId(req);
      const existing = await storage.getPipelineList(id);
      if (!existing) return res.status(404).json({ error: "Pipeline not found" });
      if (!await canMutatePipeline(existing, userId ?? null)) return res.status(403).json({ error: "Access denied" });
      await storage.deletePipelineList(id);
      res.status(204).send();
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to delete pipeline" });
    }
  });

  app.post("/api/pipelines/:id/assets", async (req, res) => {
    try {
      const pipelineId = parseInt(req.params.id);
      if (isNaN(pipelineId)) return res.status(400).json({ error: "Invalid pipeline ID" });
      const pipeline = await storage.getPipelineList(pipelineId);
      if (!pipeline) return res.status(404).json({ error: "Pipeline not found" });
      const body = saveAssetBodySchema.parse({ ...req.body, pipeline_list_id: pipelineId });
      const userId = await tryGetUserId(req);
      const asset = await storage.createSavedAsset({
        ingestedAssetId: body.ingested_asset_id ?? null,
        pipelineListId: pipelineId,
        assetName: body.asset_name,
        target: body.target,
        modality: body.modality,
        developmentStage: body.development_stage,
        diseaseIndication: body.disease_indication,
        summary: body.summary,
        sourceTitle: body.source_title,
        sourceJournal: body.source_journal,
        publicationYear: body.publication_year,
        sourceName: body.source_name,
        sourceUrl: body.source_url ?? null,
        pmid: body.pmid ?? null,
      }, userId);
      res.status(201).json({ asset });
    } catch (err: any) {
      res.status(400).json({ error: err.message ?? "Failed to add asset to pipeline" });
    }
  });
}
