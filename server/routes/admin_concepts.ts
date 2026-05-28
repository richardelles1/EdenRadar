import crypto from "crypto";
import type { Express } from "express";
import { z } from "zod";
import { db } from "../db";
import { eq, and, sql, desc } from "drizzle-orm";
import { insertConceptCardSchema, conceptCards, conceptInterests, researchNeeds, researchProjects, ingestedAssets } from "@shared/schema";
import { logAppEvent } from "../lib/routeHelpers";
import { verifyAnyAuth, verifyConceptAuth, tryGetUserId } from "../lib/supabaseAuth";
import { cacheGet, cacheSet } from "../lib/responseCache";

export function registerConceptRoutes(app: Express): void {
  function stripPrivateFields(c: Record<string, any>) {
    const { submitterEmail, ...rest } = c;
    return rest;
  }

  app.get("/api/discovery/concepts", async (req, res) => {
    try {
      const page = Math.max(1, parseInt(String(req.query.page ?? "1")));
      const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? "20"))));
      const offset = (page - 1) * limit;
      const results = await db
        .select()
        .from(conceptCards)
        .where(eq(conceptCards.status, "active"))
        .orderBy(desc(conceptCards.createdAt))
        .limit(limit)
        .offset(offset);
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(conceptCards)
        .where(eq(conceptCards.status, "active"));
      res.json({ concepts: results.map(stripPrivateFields), page, limit, total: count, totalPages: Math.ceil(count / limit) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/discovery/my-concepts", verifyConceptAuth, async (req, res) => {
    try {
      const userId = req.headers["x-concept-user-id"] as string;
      const results = await db
        .select()
        .from(conceptCards)
        .where(eq(conceptCards.userId, userId))
        .orderBy(desc(conceptCards.createdAt));
      res.json({ concepts: results.map(stripPrivateFields) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/discovery/concepts/:id", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      const [concept] = await db
        .select()
        .from(conceptCards)
        .where(and(eq(conceptCards.id, id), eq(conceptCards.status, "active")));
      if (!concept) return res.status(404).json({ error: "Concept not found" });
      res.json({ concept: stripPrivateFields(concept) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/discovery/concepts", verifyConceptAuth, async (req, res) => {
    try {
      const conceptUserId = req.headers["x-concept-user-id"] as string;
      if (!conceptUserId) {
        console.error("[concept POST] x-concept-user-id header is empty â€” auth middleware may have failed");
        return res.status(401).json({ error: "User identification failed" });
      }
      const parsed = insertConceptCardSchema.parse({
        ...req.body,
        userId: conceptUserId,
      });

      let aiScore: number | null = null;
      let aiRationale: string | null = null;

      try {
        const openai = new (await import("openai")).default({ apiKey: process.env.OPENAI_API_KEY });
        const aiRes = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          temperature: 0.3,
          messages: [
            {
              role: "system",
              content: `You are a biotech concept evaluator. Score the scientific credibility of a pre-research concept on a 0-100 scale. Consider: scientific plausibility, clarity of problem statement, feasibility of proposed approach, and relevance to biotech/pharma. Return JSON: {"score": number, "rationale": "one sentence"}.`,
            },
            {
              role: "user",
              content: `Title: ${parsed.title}\nOne-liner: ${parsed.oneLiner}\nHypothesis: ${parsed.hypothesis ?? "N/A"}\nProblem: ${parsed.problem}\nApproach: ${parsed.proposedApproach}\nTherapy Area: ${parsed.therapeuticArea}\nModality: ${parsed.modality}\nRequired Expertise: ${parsed.requiredExpertise ?? "N/A"}`,
            },
          ],
          response_format: { type: "json_object" },
        });
        const json = JSON.parse(aiRes.choices[0]?.message?.content || "{}");
        aiScore = typeof json.score === "number" ? Math.min(100, Math.max(0, json.score)) : null;
        aiRationale = json.rationale || null;
      } catch (aiErr) {
        console.error("AI credibility scoring failed:", aiErr);
      }

      const conceptEmail = (req.headers["x-concept-user-email"] as string) || (req.body.submitterEmail as string) || null;
      const attachedFileSchema = z.array(z.object({
        name: z.string().max(255),
        url: z.string().url().refine((u) => u.startsWith("https://"), { message: "URL must use HTTPS" }),
        size: z.number().int().min(0).max(10 * 1024 * 1024),
      })).max(5).default([]);
      const attachedFiles = attachedFileSchema.parse(req.body.attachedFiles ?? []);
      const contentHash = crypto
        .createHash("sha256")
        .update(JSON.stringify({ ...parsed, ts: Date.now() }))
        .digest("hex")
        .substring(0, 16);
      const [concept] = await db
        .insert(conceptCards)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .values({
          ...(parsed as any),
          submitterEmail: conceptEmail,
          credibilityScore: aiScore,
          credibilityRationale: aiRationale,
          attachedFiles,
          contentHash,
          publishedAt: new Date(),
        })
        .returning();

      logAppEvent("concept_submitted", { therapeuticArea: parsed.therapeuticArea, modality: parsed.modality });
      res.json({ concept: stripPrivateFields(concept) });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete("/api/discovery/concepts/:id", verifyConceptAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      const conceptUserId = req.headers["x-concept-user-id"] as string;
      const [concept] = await db.select().from(conceptCards).where(eq(conceptCards.id, id));
      if (!concept) return res.status(404).json({ error: "Concept not found" });
      if (concept.userId !== conceptUserId) return res.status(403).json({ error: "Not your concept" });

      await db.delete(conceptInterests).where(eq(conceptInterests.conceptId, id));
      await db.delete(conceptCards).where(eq(conceptCards.id, id));

      const files = concept.attachedFiles as { name: string; url: string; size: number }[] | null;
      if (files && files.length > 0) {
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const supabaseUrl = process.env.VITE_SUPABASE_URL;
        if (serviceRoleKey && supabaseUrl) {
          try {
            const { createClient } = await import("@supabase/supabase-js");
            const adminClient = createClient(supabaseUrl, serviceRoleKey);
            const paths = files.map((f) => {
              const url = new URL(f.url);
              const match = url.pathname.match(/\/object\/public\/concept-files\/(.+)/);
              return match ? match[1] : null;
            }).filter((p): p is string => !!p);
            if (paths.length > 0) {
              const { error } = await adminClient.storage.from("concept-files").remove(paths);
              if (error) console.error(`[concept DELETE] Storage cleanup error:`, error);
              else console.log(`[concept DELETE] Cleaned up ${paths.length} file(s) from storage`);
            }
          } catch (storageErr) {
            console.error(`[concept DELETE] Storage cleanup failed:`, storageErr);
          }
        } else {
          console.log(`[concept DELETE] Concept ${id} had ${files.length} attached file(s). Storage cleanup skipped (no SUPABASE_SERVICE_ROLE_KEY).`);
        }
      }

      res.status(204).end();
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/discovery/concepts/:id/interest", verifyAnyAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      const type = (req.body?.type as string) || "collaborating";
      if (!["collaborating", "funding", "advising"].includes(type)) {
        return res.status(400).json({ error: "Invalid interest type" });
      }

      const [concept] = await db.select({ id: conceptCards.id, userId: conceptCards.userId }).from(conceptCards).where(eq(conceptCards.id, id));
      if (!concept) return res.status(404).json({ error: "Concept not found" });

      const userId = req.headers["x-user-id"] as string;
      if (concept.userId === userId) {
        return res.status(400).json({ error: "Cannot express interest in your own concept" });
      }
      const userEmail = req.headers["x-user-email"] as string || null;
      const userName = (req.body?.userName as string) || null;

      const existing = await db
        .select()
        .from(conceptInterests)
        .where(and(
          eq(conceptInterests.conceptId, id),
          eq(conceptInterests.userId, userId),
          eq(conceptInterests.type, type)
        ))
        .limit(1);

      let toggled: "on" | "off";
      if (existing.length > 0) {
        await db.delete(conceptInterests).where(eq(conceptInterests.id, existing[0].id));
        toggled = "off";
      } else {
        await db.insert(conceptInterests).values({
          conceptId: id,
          userId,
          userEmail,
          userName,
          type,
        }).onConflictDoNothing();
        toggled = "on";
      }

      const [collabCount] = await db.select({ count: sql<number>`count(*)::int` }).from(conceptInterests).where(and(eq(conceptInterests.conceptId, id), eq(conceptInterests.type, "collaborating")));
      const [fundCount] = await db.select({ count: sql<number>`count(*)::int` }).from(conceptInterests).where(and(eq(conceptInterests.conceptId, id), eq(conceptInterests.type, "funding")));
      const [adviseCount] = await db.select({ count: sql<number>`count(*)::int` }).from(conceptInterests).where(and(eq(conceptInterests.conceptId, id), eq(conceptInterests.type, "advising")));

      const [updated] = await db
        .update(conceptCards)
        .set({
          interestCollaborating: collabCount.count,
          interestFunding: fundCount.count,
          interestAdvising: adviseCount.count,
        })
        .where(eq(conceptCards.id, id))
        .returning();

      const action = toggled === "on" ? "added" : "removed";
      const responsePayload: Record<string, any> = {
        concept: stripPrivateFields(updated),
        action,
        toggled,
      };
      if (toggled === "on") {
        responsePayload.submitterEmail = updated.submitterEmail || null;
      }
      res.json(responsePayload);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/discovery/concepts/:id/my-interest", verifyAnyAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      const userId = req.headers["x-user-id"] as string;
      const rows = await db
        .select({ type: conceptInterests.type })
        .from(conceptInterests)
        .where(and(eq(conceptInterests.conceptId, id), eq(conceptInterests.userId, userId)));
      const typeSet = new Set(rows.map(r => r.type));
      res.json({
        collaborating: typeSet.has("collaborating"),
        funding: typeSet.has("funding"),
        advising: typeSet.has("advising"),
        types: rows.map(r => r.type),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/discovery/concepts/:id/interests", verifyConceptAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      const conceptUserId = req.headers["x-concept-user-id"] as string;
      const [concept] = await db.select().from(conceptCards).where(eq(conceptCards.id, id));
      if (!concept) return res.status(404).json({ error: "Concept not found" });
      if (concept.userId !== conceptUserId) return res.status(403).json({ error: "Not your concept" });
      const rows = await db
        .select()
        .from(conceptInterests)
        .where(eq(conceptInterests.conceptId, id))
        .orderBy(desc(conceptInterests.createdAt));
      const grouped: Record<string, typeof rows> = { collaborating: [], funding: [], advising: [] };
      for (const row of rows) {
        if (!grouped[row.type]) grouped[row.type] = [];
        grouped[row.type].push(row);
      }
      res.json({ interests: rows, byType: grouped, total: rows.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/discovery/concepts/:id/contact", verifyAnyAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      const userId = req.headers["x-user-id"] as string;

      const activeInterests = await db
        .select({ id: conceptInterests.id })
        .from(conceptInterests)
        .where(and(eq(conceptInterests.conceptId, id), eq(conceptInterests.userId, userId)))
        .limit(1);

      if (activeInterests.length === 0) {
        return res.status(403).json({ error: "Express interest first to view contact details" });
      }

      const [concept] = await db.select().from(conceptCards).where(eq(conceptCards.id, id));
      if (!concept) return res.status(404).json({ error: "Concept not found" });

      res.json({
        submitterName: concept.submitterName,
        submitterAffiliation: concept.submitterAffiliation,
        submitterEmail: concept.submitterEmail,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/discovery/concepts/:id/landscape", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

      const landscapeCacheKey = `concept-landscape:${id}`;
      const cachedLandscape = cacheGet<object>(landscapeCacheKey);
      if (cachedLandscape) return res.json(cachedLandscape);

      const [concept] = await db.select().from(conceptCards).where(eq(conceptCards.id, id));
      if (!concept) return res.status(404).json({ error: "Not found" });
      const therapyArea = concept.therapeuticArea?.toLowerCase() ?? "";
      const conceptModality = concept.modality?.toLowerCase() ?? "";
      const titleTerms = (concept.title ?? "").split(/\s+/).filter(w => w.length > 5).slice(0, 4).join(" ");
      if (!therapyArea) {
        return res.json({ assets: [], literature: [], noResults: true });
      }

      const pubmedTermParts: string[] = [];
      if (titleTerms) pubmedTermParts.push(`(${titleTerms})[Title/Abstract]`);
      pubmedTermParts.push(`"${therapyArea}"[MeSH Terms]`);
      if (conceptModality && conceptModality !== "other" && conceptModality !== "unknown") pubmedTermParts.push(conceptModality);
      const pubmedQuery = pubmedTermParts.join(" AND ");

      const biorxivTerms = [titleTerms, therapyArea, conceptModality !== "other" && conceptModality !== "unknown" ? conceptModality : ""].filter(Boolean).join(" ");

      const assetWhereConditions = [
        eq(ingestedAssets.relevant, true),
        sql`lower(${ingestedAssets.indication}) like ${"%" + therapyArea + "%"}`,
      ];
      if (conceptModality && conceptModality !== "other" && conceptModality !== "unknown") {
        assetWhereConditions.push(sql`lower(${ingestedAssets.modality}) like ${"%" + conceptModality + "%"}`);
      }

      const [relatedAssets, pubmedResults] = await Promise.allSettled([
        db
          .select({
            id: ingestedAssets.id,
            assetName: ingestedAssets.assetName,
            institution: ingestedAssets.institution,
            modality: ingestedAssets.modality,
            developmentStage: ingestedAssets.developmentStage,
            target: ingestedAssets.target,
            sourceUrl: ingestedAssets.sourceUrl,
          })
          .from(ingestedAssets)
          .where(and(...assetWhereConditions))
          .orderBy(desc(ingestedAssets.firstSeenAt))
          .limit(6),

        (async () => {
          const [pubmedItems, biorxivItems] = await Promise.allSettled([
            (async () => {
              if (!pubmedQuery) return [];
              const searchTerm = encodeURIComponent(pubmedQuery);
              const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${searchTerm}&retmax=3&retmode=json&sort=relevance`;
              const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(5000) });
              if (!searchRes.ok) return [];
              const searchJson = await searchRes.json() as { esearchresult?: { idlist?: string[] } };
              const ids: string[] = searchJson.esearchresult?.idlist ?? [];
              if (ids.length === 0) return [];
              const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids.join(",")}&retmode=json`;
              const summaryRes = await fetch(summaryUrl, { signal: AbortSignal.timeout(5000) });
              if (!summaryRes.ok) return [];
              const summaryJson = await summaryRes.json() as { result?: Record<string, unknown> };
              const result = summaryJson.result ?? {};
              return ids.slice(0, 3).map((pmid) => {
                const doc = (result[pmid] ?? {}) as Record<string, unknown>;
                return {
                  source: "pubmed" as const,
                  pmid,
                  title: (doc.title as string) ?? "Untitled",
                  authors: (Array.isArray(doc.authors) ? doc.authors : []).slice(0, 2).map((a: Record<string, string>) => a.name).join(", "),
                  journal: (doc.fulljournalname as string) ?? (doc.source as string) ?? "",
                  year: typeof doc.pubdate === "string" ? doc.pubdate.substring(0, 4) : "",
                  url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
                };
              });
            })(),
            (async () => {
              if (!biorxivTerms.trim()) return [];
              const q = encodeURIComponent(biorxivTerms);
              const url = `https://api.crossref.org/works?query=${q}&filter=type:posted-content,member:246&rows=3&sort=relevance&mailto=eden@edenradar.io`;
              const biorxivRes = await fetch(url, { signal: AbortSignal.timeout(5000) });
              if (!biorxivRes.ok) return [];
              const json = await biorxivRes.json() as { message?: { items?: Record<string, unknown>[] } };
              return (json.message?.items ?? []).slice(0, 3).map((item) => {
                const doi = (item.DOI as string) ?? "";
                const authorArr = Array.isArray(item.author) ? item.author : [];
                const authors = authorArr.slice(0, 2).map((a: Record<string, string>) => `${a.given ?? ""} ${a.family ?? ""}`.trim()).join(", ");
                const created = item.created as Record<string, unknown> | undefined;
                const dateParts = created?.["date-parts"] as number[][] | undefined;
                const year = dateParts?.[0]?.[0]?.toString() ?? "";
                const titleArr = item.title as string[] | undefined;
                return {
                  source: "biorxiv" as const,
                  pmid: doi,
                  title: titleArr?.[0] ?? "Untitled",
                  authors,
                  journal: "bioRxiv preprint",
                  year,
                  url: `https://doi.org/${doi}`,
                };
              });
            })(),
          ]);
          const pubmed = pubmedItems.status === "fulfilled" ? pubmedItems.value : [];
          const biorxiv = biorxivItems.status === "fulfilled" ? biorxivItems.value : [];
          return [...pubmed, ...biorxiv].slice(0, 3);
        })(),
      ]);

      const assets = relatedAssets.status === "fulfilled" ? relatedAssets.value : [];
      const literature = pubmedResults.status === "fulfilled" ? pubmedResults.value : [];

      if (assets.length === 0 && literature.length === 0) {
        const emptyResp = { assets: [], literature: [], noResults: true };
        cacheSet(landscapeCacheKey, emptyResp, 2 * 60 * 60 * 1000);
        return res.json(emptyResp);
      }
      const landscapeResp = { assets, literature };
      cacheSet(landscapeCacheKey, landscapeResp, 2 * 60 * 60 * 1000);
      res.json(landscapeResp);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/discovery/concepts/:id â€” edit own concept
  app.patch("/api/discovery/concepts/:id", verifyConceptAuth, async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      const userId = req.headers["x-concept-user-id"] as string;
      const [existing] = await db.select().from(conceptCards).where(eq(conceptCards.id, id));
      if (!existing) return res.status(404).json({ error: "Not found" });
      if (existing.userId !== userId) return res.status(403).json({ error: "Forbidden" });

      const allowed = ["title", "oneLiner", "hypothesis", "problem", "proposedApproach",
        "requiredExpertise", "seeking", "therapeuticArea", "modality", "stage",
        "openQuestions", "mechanismTags"] as const;
      const updates: Record<string, any> = {};
      for (const key of allowed) {
        if (key in req.body) updates[key] = req.body[key];
      }
      if (Object.keys(updates).length === 0) return res.status(400).json({ error: "No valid fields" });

      const hash = crypto
        .createHash("sha256")
        .update(JSON.stringify({ ...existing, ...updates }))
        .digest("hex")
        .substring(0, 16);
      updates.contentHash = hash;

      const [updated] = await db.update(conceptCards).set(updates).where(eq(conceptCards.id, id)).returning();
      res.json({ concept: stripPrivateFields(updated) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/discovery/concepts/:id/escalate â€” request graduation to research project
  app.post("/api/discovery/concepts/:id/escalate", verifyConceptAuth, async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      const userId = req.headers["x-concept-user-id"] as string;
      const [existing] = await db.select().from(conceptCards).where(eq(conceptCards.id, id));
      if (!existing) return res.status(404).json({ error: "Not found" });
      if (existing.userId !== userId) return res.status(403).json({ error: "Forbidden" });
      if (existing.escalationStatus === "pending") return res.status(409).json({ error: "Escalation already pending" });
      if (existing.escalationStatus === "approved") return res.status(409).json({ error: "Already graduated to research project" });

      const [updated] = await db
        .update(conceptCards)
        .set({ escalationStatus: "pending", escalationRequestedAt: new Date() })
        .where(eq(conceptCards.id, id))
        .returning();
      res.json({ concept: stripPrivateFields(updated) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/admin/concept-escalations â€” admin escalation queue
  app.get("/api/admin/concept-escalations", async (req, res) => {
    try {
      const concepts = await db
        .select()
        .from(conceptCards)
        .where(eq(conceptCards.escalationStatus, "pending"))
        .orderBy(conceptCards.escalationRequestedAt);
      res.json({ concepts });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/admin/concept-escalations/:id/approve â€” approve and create research project
  app.post("/api/admin/concept-escalations/:id/approve", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      const [concept] = await db.select().from(conceptCards).where(eq(conceptCards.id, id));
      if (!concept) return res.status(404).json({ error: "Not found" });
      if (concept.escalationStatus !== "pending") return res.status(409).json({ error: "Not pending" });

      const [project] = await db
        .insert(researchProjects)
        .values({
          researcherId: concept.userId,
          title: concept.title,
          researchDomain: concept.therapeuticArea,
          description: `${concept.oneLiner}\n\n${concept.problem}`,
          status: "planning",
        })
        .returning();

      await db
        .update(conceptCards)
        .set({ escalationStatus: "approved", escalationReviewedAt: new Date(), projectId: project.id })
        .where(eq(conceptCards.id, id));

      res.json({ projectId: project.id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/admin/concept-escalations/:id/reject â€” reject with optional note
  app.post("/api/admin/concept-escalations/:id/reject", async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      const { note } = req.body;
      const [concept] = await db.select().from(conceptCards).where(eq(conceptCards.id, id));
      if (!concept) return res.status(404).json({ error: "Not found" });

      await db
        .update(conceptCards)
        .set({ escalationStatus: "rejected", escalationReviewedAt: new Date(), escalationNote: note ?? null })
        .where(eq(conceptCards.id, id));

      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/discovery/research-needs â€” public list of research needs posted by industry
  app.get("/api/discovery/research-needs", async (_req, res) => {
    try {
      const needs = await db
        .select()
        .from(researchNeeds)
        .where(eq(researchNeeds.status, "active"))
        .orderBy(desc(researchNeeds.createdAt))
        .limit(50);
      res.json({ needs });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/discovery/research-needs â€” industry posts a research need (admin-mediated)
  app.post("/api/discovery/research-needs", verifyAnyAuth, async (req, res) => {
    try {
      const userId = await tryGetUserId(req);
      if (!userId) return res.status(401).json({ error: "Authentication required" });
      const { companyName, title, description, therapeuticArea, mechanismTags, stagePreference, whatTheyOffer } = req.body;
      if (!companyName || !title || !description) return res.status(400).json({ error: "companyName, title and description required" });
      const [need] = await db
        .insert(researchNeeds)
        .values({ industryUserId: userId, companyName, title, description, therapeuticArea, mechanismTags, stagePreference, whatTheyOffer, status: "active" })
        .returning();
      res.json({ need });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

}