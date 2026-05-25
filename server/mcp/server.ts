/**
 * Eden MCP Server — per-request factory.
 *
 * Each HTTP request gets its own McpServer + transport.  Stateless mode means
 * no session IDs, no in-memory state between calls — every request is
 * self-contained.  This matches how a REST API works and avoids any session
 * management complexity.
 *
 * Tier enforcement lives inside each tool handler: tools invisible to the
 * caller's tier are simply not registered, so the MCP tools/list response
 * only shows what the caller can actually use.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";

import { resolveAuth, checkFreeRateLimit, type ResolvedAuth } from "./auth";
import { TOOL_CONFIG, tierSatisfies, getVisibleTools } from "./config";
import {
  handleSearchAssets,
  handleGetAsset,
  handleSearchAssetsDeep,
} from "./handlers/search";
import { handleListInstitutions, handleGetInstitution } from "./handlers/institutions";
import {
  handleListPipelines,
  handleGetPipeline,
  handleSaveToPipeline,
  handleRemoveFromPipeline,
} from "./handlers/pipeline";
import { handleGetConvergenceSignals, handleGetTrendingAreas } from "./handlers/intelligence";

const SERVER_INFO = {
  name: "eden-scout",
  version: "1.0.0",
};

const INSTRUCTIONS = `
Eden Scout gives you conversational access to a curated database of university and research institution technology transfer office (TTO) assets — pharmaceutical compounds, medical devices, diagnostics, and research tools seeking industry partners.

Tool tiers:
• Free (no key): search and browse — up to 10 results per call, 20 calls/hr per IP
• Starter (API key): enriched detail fields + deeper search — up to 20 results
• Professional: full pipeline access — save and manage assets across watchlists
• Enterprise: convergence intelligence and trend analysis

All assets are pre-filtered for biotech/pharma relevance. For an API key, visit https://edennx.com.
`.trim();

function getClientIp(req: IncomingMessage): string {
  const fwd = req.headers["x-forwarded-for"] as string | undefined;
  return fwd?.split(",")[0]?.trim() ?? req.socket.remoteAddress ?? "unknown";
}

export async function handleMcpRequest(req: IncomingMessage, res: ServerResponse, body: unknown): Promise<void> {
  // 1. Resolve auth
  const auth: ResolvedAuth = await resolveAuth(req);

  // 2. Free-tier IP rate limit
  if (auth.tier === "free") {
    const ip = getClientIp(req);
    const { allowed, remaining } = checkFreeRateLimit(ip);
    if (!allowed) {
      res.writeHead(429, { "Content-Type": "application/json", "Retry-After": "3600" });
      res.end(JSON.stringify({ error: "Free tier rate limit exceeded (20 req/hr). Supply an API key for higher limits." }));
      return;
    }
    res.setHeader("X-RateLimit-Remaining", String(remaining));
  }

  // 3. Build per-request McpServer with only tools the tier can see
  const server = new McpServer(SERVER_INFO, {
    capabilities: { tools: {} },
    instructions: INSTRUCTIONS,
  });

  const visible = getVisibleTools(auth.tier);

  // ── Free tools ───────────────────────────────────────────────────────────────

  if (visible.includes("search_assets")) {
    const cfg = TOOL_CONFIG.search_assets;
    server.tool(
      "search_assets",
      `Search the Eden asset database. Returns up to ${cfg.maxResults} results with name, institution, indication, stage, and a brief summary.`,
      {
        query: z.string().describe("Search term (asset name, indication, target, etc.)"),
        institution: z.string().optional().describe("Filter by institution name"),
        modality: z.string().optional().describe("Filter by modality (e.g. small molecule, antibody)"),
        stage: z.string().optional().describe("Filter by development stage (e.g. preclinical, Phase I)"),
        limit: z.number().int().min(1).max(cfg.maxResults!).optional(),
      },
      async (args) => handleSearchAssets(args as Record<string, unknown>, cfg),
    );
  }

  if (visible.includes("get_asset")) {
    const cfg = TOOL_CONFIG.get_asset;
    server.tool(
      "get_asset",
      "Retrieve a single asset by its numeric id or fingerprint string.",
      {
        id: z.number().int().optional().describe("Numeric asset id"),
        fingerprint: z.string().optional().describe("Asset fingerprint (slug)"),
      },
      async (args) => handleGetAsset(args as Record<string, unknown>, cfg),
    );
  }

  if (visible.includes("list_institutions")) {
    const cfg = TOOL_CONFIG.list_institutions;
    server.tool(
      "list_institutions",
      `List institutions with the most assets in the database. Returns up to ${cfg.maxResults} institutions.`,
      {
        limit: z.number().int().min(1).max(cfg.maxResults!).optional(),
        continent: z.string().optional().describe("Filter by continent (e.g. North America, Europe)"),
      },
      async (args) => handleListInstitutions(args as Record<string, unknown>, cfg),
    );
  }

  if (visible.includes("get_institution")) {
    const cfg = TOOL_CONFIG.get_institution;
    server.tool(
      "get_institution",
      "Get details and asset count for a specific institution.",
      {
        name: z.string().describe("Institution name (exact or partial)"),
      },
      async (args) => handleGetInstitution(args as Record<string, unknown>, cfg),
    );
  }

  // ── Starter tools ────────────────────────────────────────────────────────────

  if (visible.includes("get_asset_detail")) {
    const cfg = TOOL_CONFIG.get_asset_detail;
    server.tool(
      "get_asset_detail",
      "Retrieve full enriched detail for a single asset — mechanism of action, IP type, licensing readiness, contact info, and more.",
      {
        id: z.number().int().describe("Numeric asset id"),
      },
      async (args) => handleGetAsset(args as Record<string, unknown>, cfg),
    );
  }

  if (visible.includes("search_assets_deep")) {
    const cfg = TOOL_CONFIG.search_assets_deep;
    server.tool(
      "search_assets_deep",
      `Deep search across all enriched fields including mechanism of action and biology classification. Returns up to ${cfg.maxResults} full-detail results.`,
      {
        query: z.string().describe("Search term"),
        institution: z.string().optional(),
        modality: z.string().optional(),
        stage: z.string().optional(),
        biology: z.string().optional().describe("Biology/disease mechanism filter"),
        limit: z.number().int().min(1).max(cfg.maxResults!).optional(),
      },
      async (args) => handleSearchAssetsDeep(args as Record<string, unknown>, cfg),
    );
  }

  // ── Professional tools ───────────────────────────────────────────────────────

  if (visible.includes("list_pipelines")) {
    const cfg = TOOL_CONFIG.list_pipelines;
    server.tool(
      "list_pipelines",
      "List your pipeline watchlists with asset counts.",
      {
        limit: z.number().int().min(1).max(cfg.maxResults!).optional(),
      },
      async (args) => {
        if (!auth.userId) return { content: [{ type: "text" as const, text: JSON.stringify({ error: "API key does not have a user context" }) }] };
        return handleListPipelines(args as Record<string, unknown>, cfg, auth.userId, auth.orgId);
      },
    );
  }

  if (visible.includes("get_pipeline")) {
    const cfg = TOOL_CONFIG.get_pipeline;
    server.tool(
      "get_pipeline",
      "Get assets in a specific pipeline watchlist.",
      {
        pipelineId: z.number().int().describe("Pipeline list id (from list_pipelines)"),
        limit: z.number().int().min(1).max(cfg.maxResults!).optional(),
      },
      async (args) => {
        if (!auth.userId) return { content: [{ type: "text" as const, text: JSON.stringify({ error: "API key does not have a user context" }) }] };
        return handleGetPipeline(args as Record<string, unknown>, cfg, auth.userId, auth.orgId);
      },
    );
  }

  if (visible.includes("save_to_pipeline")) {
    const cfg = TOOL_CONFIG.save_to_pipeline;
    server.tool(
      "save_to_pipeline",
      "Save an asset to one of your pipeline watchlists.",
      {
        pipelineId: z.number().int().describe("Pipeline list id"),
        assetId: z.number().int().describe("Ingested asset id (from search results)"),
      },
      async (args) => {
        if (!auth.userId) return { content: [{ type: "text" as const, text: JSON.stringify({ error: "API key does not have a user context" }) }] };
        return handleSaveToPipeline(args as Record<string, unknown>, cfg, auth.userId, auth.orgId);
      },
    );
  }

  if (visible.includes("remove_from_pipeline")) {
    const cfg = TOOL_CONFIG.remove_from_pipeline;
    server.tool(
      "remove_from_pipeline",
      "Remove a saved asset from a pipeline watchlist.",
      {
        savedAssetId: z.number().int().describe("Saved asset id (from get_pipeline results)"),
      },
      async (args) => {
        if (!auth.userId) return { content: [{ type: "text" as const, text: JSON.stringify({ error: "API key does not have a user context" }) }] };
        return handleRemoveFromPipeline(args as Record<string, unknown>, cfg, auth.userId, auth.orgId);
      },
    );
  }

  // ── Enterprise tools ─────────────────────────────────────────────────────────

  if (visible.includes("get_convergence_signals")) {
    const cfg = TOOL_CONFIG.get_convergence_signals;
    server.tool(
      "get_convergence_signals",
      "Identify therapy areas where multiple institutions are converging on the same target or mechanism — early signal of emerging consensus.",
      {
        limit: z.number().int().min(1).max(cfg.maxResults!).optional(),
        minInstitutions: z.number().int().min(2).optional().describe("Minimum institutions co-targeting (default 2)"),
      },
      async (args) => handleGetConvergenceSignals(args as Record<string, unknown>, cfg),
    );
  }

  if (visible.includes("get_trending_areas")) {
    const cfg = TOOL_CONFIG.get_trending_areas;
    server.tool(
      "get_trending_areas",
      "Surface therapy areas seeing the most new asset activity in a recent time window.",
      {
        limit: z.number().int().min(1).max(cfg.maxResults!).optional(),
        windowDays: z.number().int().min(7).max(365).optional().describe("Lookback window in days (default 90)"),
      },
      async (args) => handleGetTrendingAreas(args as Record<string, unknown>, cfg),
    );
  }

  // 4. Wire stateless transport and handle the request
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  await transport.handleRequest(req, res, body);
}
