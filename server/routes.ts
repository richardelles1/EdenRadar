import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { getSource, dataSources } from "./lib/sources/index";
import { extractAssetsFromPapers } from "./lib/extractor";
import { z } from "zod";
import OpenAI from "openai";

function friendlyOpenAIError(err: unknown): string {
  if (err instanceof OpenAI.AuthenticationError || (err instanceof Error && (err.message.includes("401") || err.message.includes("invalid_api_key") || err.message.includes("Incorrect API key")))) {
    return "OpenAI API key is invalid. Please check the OPENAI_API_KEY secret in your Replit settings.";
  }
  if (err instanceof OpenAI.RateLimitError || (err instanceof Error && (err.message.includes("429") || err.message.includes("quota") || err.message.includes("insufficient_quota")))) {
    return "OpenAI quota exceeded or rate limited. Please check your OpenAI account billing.";
  }
  if (err instanceof Error) return err.message;
  return "Search failed. Please try again.";
}

const searchBodySchema = z.object({
  query: z.string().min(1).max(500),
  source: z.string().default("pubmed"),
  maxResults: z.number().int().min(1).max(20).default(10),
});

const saveAssetBodySchema = z.object({
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

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.get("/api/sources", (_req, res) => {
    const sources = Object.values(dataSources).map((s) => ({
      id: s.id,
      label: s.label,
      description: s.description,
    }));
    res.json({ sources });
  });

  app.post("/api/search", async (req, res) => {
    try {
      const { query, source, maxResults } = searchBodySchema.parse(req.body);
      const dataSource = getSource(source);
      const papers = await dataSource.search(query, maxResults);

      if (papers.length === 0) {
        await storage.createSearchHistory({ query, source, resultCount: 0 });
        return res.json({ assets: [], query, source, papersFound: 0 });
      }

      const assets = await extractAssetsFromPapers(papers);
      await storage.createSearchHistory({ query, source, resultCount: assets.length });

      return res.json({ assets, query, source, papersFound: papers.length });
    } catch (err: any) {
      console.error("Search error:", err);
      return res.status(500).json({ error: friendlyOpenAIError(err) });
    }
  });

  app.get("/api/search-history", async (_req, res) => {
    try {
      const history = await storage.getSearchHistory(30);
      res.json({ history });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch history" });
    }
  });

  app.get("/api/saved-assets", async (_req, res) => {
    try {
      const assets = await storage.getSavedAssets();
      res.json({ assets });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to fetch saved assets" });
    }
  });

  app.post("/api/saved-assets", async (req, res) => {
    try {
      const body = saveAssetBodySchema.parse(req.body);
      const asset = await storage.createSavedAsset({
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
      });
      res.status(201).json({ asset });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to save asset" });
    }
  });

  app.delete("/api/saved-assets/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
      await storage.deleteSavedAsset(id);
      res.status(204).send();
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to delete asset" });
    }
  });

  return httpServer;
}
