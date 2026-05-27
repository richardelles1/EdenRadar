import React from "react";
import { CheckCircle2, Loader2, AlertTriangle, XCircle, AlertCircle, Database } from "lucide-react";

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    " " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

type HealthStatus = "ok" | "warning" | "degraded" | "failing" | "stale" | "syncing" | "never" | "blocked" | "network_blocked" | "site_down" | "rate_limited" | "parser_failure" | "empty_response";

type ErrorType = "all" | "Timeout" | "Blocked" | "Network" | "Parsing" | "Unknown";

function getErrorType(reason: string | null | undefined): Exclude<ErrorType, "all"> {
  if (!reason) return "Unknown";
  const r = reason.toLowerCase();
  if (r.includes("timeout") || r.includes("timed out") || r.includes("aborted")) return "Timeout";
  if (r.includes("403") || r.includes("cloudflare") || r.includes("blocked") || r.includes("bot challenge")) return "Blocked";
  if (r.includes("econnrefused") || r.includes("enotfound") || r.includes("network") || r.includes("fetch failed")) return "Network";
  if (r.includes("parse") || r.includes("selector") || r.includes("json") || r.includes("syntax")) return "Parsing";
  return "Unknown";
}

interface CollectorHealthRow {
  institution: string;
  totalInDb: number;
  biotechRelevant: number;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  rawCount: number;
  newCount: number;
  relevantCount: number;
  phase: string | null;
  sessionId: string | null;
  consecutiveFailures: number;
  health: HealthStatus;
  tier: 1 | 2 | 3 | 4;
}

interface SchedulerStatus {
  state: "idle" | "running" | "paused";
  currentInstitution: string | null;
  currentInstitutions: string[];
  nextInstitution: string | null;
  queuePosition: number;
  queueTotal: number;
  completedThisCycle: number;
  failedThisCycle: number;
  skippedThisCycle: number;
  freshSkippedThisCycle: number;
  cycleStartedAt: string | null;
  lastActivityAt: string | null;
  cycleCount: number;
  priorityQueue: string[];
  delayMs: number;
  avgSyncMs: number | null;
  estimatedRemainingMs: number | null;
  lastCycleCompletedAt: string | null;
  concurrentSyncs: number;
  maxConcurrency: number;
  currentTier: 1 | 2 | 3 | 4 | null;
  tierOnly: number | null;
  stalenessFirst: boolean;
  dailySweep: boolean;
  resumedAtPosition: number | null;
}

interface ActiveSearchRow {
  institution: string;
  ttoUrl: string;
  totalInDb: number;
  biotechRelevant: number;
}

interface CollectorHealthData {
  rows: CollectorHealthRow[];
  activeSearchRows: ActiveSearchRow[];
  totalInDb: number;
  totalBiotechRelevant: number;
  totalInstitutions: number;
  totalActiveSearch: number;
  issueCount: number;
  syncingCount: number;
  syncedToday: number;
  scheduler: SchedulerStatus;
}

function HealthDot({ health }: { health: HealthStatus }) {
  if (health === "ok") return <CheckCircle2 className="h-4 w-4 text-emerald-500" data-testid="health-ok" />;
  if (health === "syncing") return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" data-testid="health-syncing" />;
  if (health === "site_down") return <AlertTriangle className="h-4 w-4 text-amber-500" data-testid="health-site-down" />;
  if (health === "rate_limited") return <AlertTriangle className="h-4 w-4 text-orange-500" data-testid="health-rate-limited" />;
  if (health === "blocked") return <AlertTriangle className="h-4 w-4 text-amber-500" data-testid="health-blocked" />;
  if (health === "network_blocked") return <AlertTriangle className="h-4 w-4 text-orange-500" data-testid="health-network-blocked" />;
  if (health === "parser_failure") return <XCircle className="h-4 w-4 text-red-500" data-testid="health-parser-failure" />;
  if (health === "empty_response") return <AlertTriangle className="h-4 w-4 text-yellow-500" data-testid="health-empty-response" />;
  if (health === "warning") return <AlertTriangle className="h-4 w-4 text-yellow-500" data-testid="health-warning" />;
  if (health === "degraded") return <AlertTriangle className="h-4 w-4 text-amber-500" data-testid="health-degraded" />;
  if (health === "stale") return <AlertCircle className="h-4 w-4 text-orange-500" data-testid="health-stale" />;
  if (health === "never") return <Database className="h-4 w-4 text-muted-foreground/40" data-testid="health-never" />;
  return <XCircle className="h-4 w-4 text-red-500" data-testid="health-failing" />;
}

function HealthLabel({ health }: { health: HealthStatus }) {
  if (health === "ok") return <span className="text-emerald-600 dark:text-emerald-400 text-xs font-medium">Working</span>;
  if (health === "syncing") return <span className="text-blue-600 dark:text-blue-400 text-xs font-medium">Syncing</span>;
  if (health === "site_down") return <span className="text-amber-600 dark:text-amber-400 text-xs font-medium">Site temporarily down</span>;
  if (health === "rate_limited") return <span className="text-orange-600 dark:text-orange-400 text-xs font-medium">Rate limited</span>;
  if (health === "blocked") return <span className="text-amber-600 dark:text-amber-400 text-xs font-medium">Blocked / WAF</span>;
  if (health === "network_blocked") return <span className="text-orange-600 dark:text-orange-400 text-xs font-medium">Network blocked</span>;
  if (health === "parser_failure") return <span className="text-red-600 dark:text-red-400 text-xs font-medium">Parser failure</span>;
  if (health === "empty_response") return <span className="text-yellow-600 dark:text-yellow-400 text-xs font-medium">Empty response</span>;
  if (health === "warning") return <span className="text-yellow-600 dark:text-yellow-400 text-xs font-medium">Warning</span>;
  if (health === "degraded") return <span className="text-amber-600 dark:text-amber-400 text-xs font-medium">Degraded</span>;
  if (health === "stale") return <span className="text-orange-600 dark:text-orange-400 text-xs font-medium">Stale</span>;
  if (health === "never") return <span className="text-muted-foreground/50 text-xs font-medium">Never synced</span>;
  return <span className="text-red-500 dark:text-red-400 text-xs font-medium">Failing</span>;
}

function relativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

interface SyncSessionData {
  id: number;
  sessionId: string;
  institution: string;
  status: string;
  phase: string;
  rawCount: number;
  newCount: number;
  relevantCount: number;
  pushedCount: number;
  contentUpdated: number;
  currentIndexed: number;
  createdAt: string;
  completedAt: string | null;
  lastRefreshedAt: string | null;
  errorMessage: string | null;
}

interface SyncStatusResponse {
  found: boolean;
  session?: SyncSessionData;
  newEntries?: Array<{
    assetName: string;
    sourceUrl: string | null;
    target: string;
    modality: string;
    indication: string;
    developmentStage: string;
    firstSeenAt: string;
  }>;
  syncRunning: boolean;
  syncRunningFor: string | null;
}

type EdenCoverage = {
  totalRelevant: number;
  deepEnriched: number;
  withMoa: number;
  withInnovationClaim: number;
  withUnmetNeed: number;
  withComparableDrugs: number;
  avgCompletenessScore: number | null;
};

type EdenEmbeddingCoverage = {
  totalRelevant: number;
  totalEmbedded: number;
};

type EnrichBreakdown = {
  fresh: number;
  legacy: number;
  lowQualityRetry: number;
  nullCategory?: number;
  total: number;
};

type EdenStatsResponse = {
  coverage: EdenCoverage;
  embeddingCoverage: EdenEmbeddingCoverage;
  latestJob: { id: number; total: number; processed: number; status: string; startedAt: string; completedAt: string | null } | null;
  needingDeepEnrich?: number;
  breakdown?: EnrichBreakdown;
  live: { processed: number; total: number } | null;
};

type EdenEmbedStatusResponse = {
  running: boolean;
  processed: number;
  total: number;
  succeeded: number;
  failed: number;
};

export {
  formatDate, timeAgo, relativeTime, getErrorType,
  HealthDot, HealthLabel,
};
export type {
  HealthStatus, ErrorType,
  CollectorHealthRow, SchedulerStatus, ActiveSearchRow, CollectorHealthData,
  SyncSessionData, SyncStatusResponse,
  EdenCoverage, EdenEmbeddingCoverage, EnrichBreakdown, EdenStatsResponse, EdenEmbedStatusResponse,
};
