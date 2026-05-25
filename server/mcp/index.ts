/**
 * Eden MCP — Express router
 *
 * Mounts at /mcp.  A single endpoint accepts all MCP Streamable HTTP traffic
 * (POST for tool calls, GET for SSE event stream).
 *
 * The MCP spec (2025-03-26) uses a single endpoint:
 *   POST /mcp  — JSON-RPC messages (tools/list, tools/call, etc.)
 *   GET  /mcp  — SSE stream for server-initiated notifications (optional)
 *   DELETE /mcp — session teardown (stateless: no-op)
 */

import { Router, json } from "express";
import type { Request, Response } from "express";
import { handleMcpRequest } from "./server";

const router = Router();

// Parse JSON bodies for MCP POST requests before our handler sees them
router.use(json());

// Handle all MCP traffic through one function
async function mcpRoute(req: Request, res: Response): Promise<void> {
  try {
    await handleMcpRequest(req, res, req.body);
  } catch (err) {
    console.error("[mcp] Unhandled error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
}

router.post("/", mcpRoute);
router.get("/", mcpRoute);
router.delete("/", (_req, res) => res.status(200).json({ status: "ok" }));

export default router;
