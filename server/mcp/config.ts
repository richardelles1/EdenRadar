/**
 * MCP Tool Access Configuration
 *
 * This is the single file you edit to change what each tool requires.
 * Implementation lives in handlers/ — this file only controls access.
 *
 * Tiers (in order):
 *   "free"         — no API key needed, rate-limited by IP
 *   "starter"      — any valid Eden API key
 *   "professional" — professional or enterprise key
 *   "enterprise"   — enterprise key only
 *   "disabled"     — tool exists but is hidden from all tool lists
 */

export type AccessTier = "free" | "starter" | "professional" | "enterprise" | "disabled";

export interface ToolConfig {
  tier: AccessTier;
  // Max results this tier can return (handlers respect this)
  maxResults?: number;
  // Fields included in response ("summary" = name/institution/indication/stage/one-liner;
  // "detail" = all enriched fields)
  depth?: "summary" | "detail";
}

export const TOOL_CONFIG: Record<string, ToolConfig> = {
  // ── Discovery (no key needed) ────────────────────────────────────────────────
  search_assets:      { tier: "free",         maxResults: 10, depth: "summary" },
  get_asset:          { tier: "free",         maxResults: 1,  depth: "summary" },
  list_institutions:  { tier: "free",         maxResults: 50, depth: "summary" },
  get_institution:    { tier: "free",         maxResults: 1,  depth: "summary" },

  // ── Enriched data (key required) ─────────────────────────────────────────────
  get_asset_detail:   { tier: "starter",      maxResults: 1,  depth: "detail"  },
  search_assets_deep: { tier: "starter",      maxResults: 20, depth: "detail"  },

  // ── Pipeline (active subscription) ───────────────────────────────────────────
  list_pipelines:     { tier: "professional", maxResults: 20, depth: "summary" },
  get_pipeline:       { tier: "professional", maxResults: 50, depth: "detail"  },
  save_to_pipeline:   { tier: "professional", maxResults: 1,  depth: "summary" },
  remove_from_pipeline: { tier: "professional", maxResults: 1, depth: "summary" },

  // ── Intelligence (premium) ────────────────────────────────────────────────────
  get_convergence_signals: { tier: "enterprise", maxResults: 20, depth: "detail" },
  get_trending_areas:      { tier: "enterprise", maxResults: 10, depth: "detail" },
};

// Free tier IP-based rate limits (requests per hour)
export const FREE_RATE_LIMIT_PER_HOUR = 20;

// Tiers in ascending order for comparison
const TIER_RANK: Record<AccessTier, number> = {
  free: 0,
  starter: 1,
  professional: 2,
  enterprise: 3,
  disabled: 99,
};

export function tierSatisfies(userTier: AccessTier, required: AccessTier): boolean {
  if (required === "disabled") return false;
  if (required === "free") return true;
  return TIER_RANK[userTier] >= TIER_RANK[required];
}

// Which tools to show in tools/list for a given user tier
export function getVisibleTools(userTier: AccessTier): string[] {
  return Object.entries(TOOL_CONFIG)
    .filter(([, cfg]) => cfg.tier !== "disabled" && tierSatisfies(userTier, cfg.tier))
    .map(([name]) => name);
}
