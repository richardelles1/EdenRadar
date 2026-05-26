---
name: MCP SDK dependency
description: @modelcontextprotocol/sdk missing from node_modules causes server startup failure
---

When `server/mcp/server.ts` is present (added by Claude Code), the server imports `@modelcontextprotocol/sdk`. If this package is not installed, the app fails immediately at startup with `ERR_MODULE_NOT_FOUND`.

**Why:** The package is used for MCP server functionality but was added to the source without being installed in the Replit environment.

**How to apply:** If the app ever fails to start with `Cannot find package '@modelcontextprotocol/sdk'`, install it via the packager tool (`installLanguagePackages`).
