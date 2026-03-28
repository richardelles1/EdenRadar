import React, { useState, useEffect, useRef, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Shield, Lock, LogOut, Loader2, Download, Database, RefreshCw, ArrowUpCircle, AlertTriangle, CheckCircle2, ExternalLink, Zap, Sparkles, DollarSign, Activity, AlertCircle, XCircle, Microscope, Trash2, ClipboardList, Lightbulb, Users, UserPlus, Copy, Check, Inbox, ChevronDown, ChevronRight, ChevronUp, Building2, Clock, PackagePlus, BrainCircuit, PlayCircle, BarChart3, Mic, MicOff, ThumbsUp, ThumbsDown, Bookmark, Layers, Plus, Upload, FileText, Image as ImageIcon, Pencil, BookOpen, X, CreditCard, Server, TrendingUp, Globe, MessageSquare, FlaskConical, Send, Eye, Tag, ArrowUp, ArrowDown, type LucideIcon } from "lucide-react";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import type { ConceptCard } from "@shared/schema";
import { PORTAL_CONFIG, ALL_PORTAL_ROLES, getPortalConfig, type PortalRole } from "@shared/portals";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useTheme } from "@/hooks/use-theme";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { useEdenChat, type ChatAsset, type ChatMessage, type EdenSessionSummary } from "@/hooks/useEdenChat";
import { PipelinePicker, type PipelinePickerPayload } from "@/components/PipelinePicker";
import { EdenAvatar, MarkdownContent, EdenIntro, PROMPT_CARDS, getFollowUpPills } from "@/components/EdenOrb";

const ADMIN_KEY = "eden-admin-pw";

function PasswordGate({ onAuth }: { onAuth: () => void }) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState(false);

  const submit = () => {
    if (pw === "eden") {
      localStorage.setItem(ADMIN_KEY, pw);
      onAuth();
    } else {
      setError(true);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background" data-testid="admin-gate">
      <div className="w-full max-w-sm space-y-6 p-8 border border-border rounded-xl bg-card">
        <div className="flex items-center gap-3">
          <Lock className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-semibold text-foreground">Admin Access</h1>
        </div>
        <div className="space-y-3">
          <Input
            type="password"
            placeholder="Portal password"
            value={pw}
            onChange={(e) => { setPw(e.target.value); setError(false); }}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            data-testid="input-admin-password"
            className={error ? "border-destructive" : ""}
          />
          {error && <p className="text-sm text-destructive">Incorrect password</p>}
          <Button onClick={submit} className="w-full" data-testid="button-admin-login">
            Enter
          </Button>
        </div>
      </div>
    </div>
  );
}


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

type HealthStatus = "ok" | "warning" | "degraded" | "failing" | "stale" | "syncing" | "never";

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
  currentTier: 1 | 2 | 3 | 4 | null;
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
  if (health === "warning") return <AlertTriangle className="h-4 w-4 text-yellow-500" data-testid="health-warning" />;
  if (health === "degraded") return <AlertTriangle className="h-4 w-4 text-amber-500" data-testid="health-degraded" />;
  if (health === "stale") return <AlertCircle className="h-4 w-4 text-orange-500" data-testid="health-stale" />;
  if (health === "never") return <Database className="h-4 w-4 text-muted-foreground/40" data-testid="health-never" />;
  return <XCircle className="h-4 w-4 text-red-500" data-testid="health-failing" />;
}

function HealthLabel({ health }: { health: HealthStatus }) {
  if (health === "ok") return <span className="text-emerald-600 dark:text-emerald-400 text-xs font-medium">Working</span>;
  if (health === "syncing") return <span className="text-blue-600 dark:text-blue-400 text-xs font-medium">Syncing</span>;
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
  currentIndexed: number;
  createdAt: string;
  completedAt: string | null;
  lastRefreshedAt: string | null;
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

function ExpandedSyncPanel({ institution, pw, onCollapse }: { institution: string; pw: string; onCollapse: () => void }) {
  const [polling, setPolling] = useState(true);
  const { toast } = useToast();

  const { data: statusData, refetch: refetchStatus } = useQuery<SyncStatusResponse>({
    queryKey: ["/api/ingest/sync/status", institution, pw],
    queryFn: async () => {
      const res = await fetch(`/api/ingest/sync/${encodeURIComponent(institution)}/status`, {
        headers: { "x-admin-password": pw },
      });
      if (!res.ok) throw new Error("Failed to load sync status");
      return res.json();
    },
    refetchInterval: polling ? 2000 : 8000,
  });

  const { data: historyData } = useQuery<{ sessions: SyncSessionData[] }>({
    queryKey: ["/api/ingest/sync/history", institution, pw],
    queryFn: async () => {
      const res = await fetch(`/api/ingest/sync/${encodeURIComponent(institution)}/history`, {
        headers: { "x-admin-password": pw },
      });
      if (!res.ok) return { sessions: [] };
      return res.json();
    },
    staleTime: 30000,
  });

  const syncForThisInst = !!(statusData?.syncRunning && statusData?.syncRunningFor === institution);

  useEffect(() => {
    const status = statusData?.session?.status;
    const isTerminal = status === "enriched" || status === "pushed" || status === "failed";
    if (isTerminal) {
      setPolling(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/collector-health"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ingest/sync/history", institution, pw] });
    } else if ((syncForThisInst || status === "running") && !polling) {
      setPolling(true);
    }
  }, [statusData?.session?.status, syncForThisInst]);

  const cancelStaleMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/ingest/sync/${encodeURIComponent(institution)}/cancel`, {
        method: "POST",
        headers: { "x-admin-password": pw },
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Cancel failed");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Session cleared", description: `Stale session for ${institution} reset` });
      refetchStatus();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/collector-health"] });
    },
    onError: (err: Error) => {
      toast({ title: "Cancel failed", description: err.message, variant: "destructive" });
    },
  });

  const pushMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/ingest/sync/${encodeURIComponent(institution)}/push`, {
        method: "POST",
        headers: { "x-admin-password": pw },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Push failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Pushed to index", description: data.message });
      refetchStatus();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/collector-health"] });
    },
    onError: (err: Error) => {
      toast({ title: "Push failed", description: err.message, variant: "destructive" });
    },
  });

  const session = statusData?.session;
  const newEntries = statusData?.newEntries ?? [];
  const isRunning = session?.status === "running" || syncForThisInst;
  const isEnriched = session?.status === "enriched" && !syncForThisInst;
  const isPushed = session?.status === "pushed" && !syncForThisInst;
  const isFailed = session?.status === "failed" && !syncForThisInst;
  const syncIsActive = statusData?.syncRunning ?? false;

  const rawCount = session?.rawCount ?? 0;
  const currentIndexed = session?.currentIndexed ?? 0;
  const zeroGuard = isEnriched && rawCount === 0;
  const softWarning = isEnriched && currentIndexed > 0 && rawCount > 0 && rawCount < currentIndexed * 0.5;

  const phaseLabel = syncForThisInst && session?.status !== "running" ? "Starting sync..."
    : session?.phase === "scraping" ? "Collecting..."
    : session?.phase === "comparing" ? "Comparing fingerprints..."
    : session?.phase === "enriching" ? "Enriching with AI..."
    : session?.phase === "done" ? "Done"
    : "";

  const recentHistory = (historyData?.sessions ?? []).filter(
    (s) => s.status === "pushed" || s.status === "failed" || s.status === "enriched"
  ).slice(0, 4);

  if (!statusData) {
    return (
      <tr>
        <td colSpan={7} className="p-4 bg-muted/10 border-b border-border">
          <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground" data-testid="sync-panel-loading">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading sync status for {institution}...</span>
          </div>
        </td>
      </tr>
    );
  }

  if (!statusData.found || !session) {
    return (
      <tr>
        <td colSpan={7} className="p-0 border-b border-border">
          <div className="bg-muted/10 border-t border-border px-5 py-5" data-testid={`sync-panel-empty-${institution.replace(/\s+/g, "-").toLowerCase()}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-muted-foreground">
                <Database className="h-5 w-5 opacity-40" />
                <div>
                  <p className="text-sm font-medium text-foreground">{institution}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">No sync session found — this institution has not been synced yet.</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onCollapse} data-testid="button-collapse-sync-empty">
                  <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </div>
            </div>
            {recentHistory.length > 0 && (
              <div className="mt-4 border-t border-border/40 pt-3" data-testid="sync-history-only">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Past Sessions</h4>
                <div className="space-y-1">
                  {recentHistory.map((s, i) => (
                    <div key={s.sessionId} className="flex items-center justify-between py-1.5 px-3 rounded-md bg-muted/30 text-xs" data-testid={`history-row-empty-${i}`}>
                      <div className="flex items-center gap-2">
                        {s.status === "pushed" ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" aria-label="Pushed to pipeline" />
                        ) : s.status === "failed" ? (
                          <XCircle className="h-3.5 w-3.5 text-red-500" aria-label="Scrape failed" />
                        ) : s.status === "enriched" && (s.rawCount ?? 0) > 0 ? (
                          <Clock className="h-3.5 w-3.5 text-blue-500" aria-label="Ready to push" />
                        ) : (
                          <AlertCircle className="h-3.5 w-3.5 text-amber-500" aria-label="Scraped 0 results — site may have been unreachable" />
                        )}
                        <span className="text-muted-foreground">{s.completedAt ? formatDate(s.completedAt) : "In progress"}</span>
                      </div>
                      <div className="flex items-center gap-3 text-muted-foreground/70">
                        <span>{s.rawCount} scraped</span>
                        <span className={s.relevantCount > 0 ? "text-emerald-600 dark:text-emerald-400 font-medium" : ""}>{s.relevantCount} relevant</span>
                        {s.pushedCount > 0 && <span className="text-primary font-medium">{s.pushedCount} pushed</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td colSpan={7} className="p-0 border-b border-border">
        <div className="bg-muted/10 border-t border-border" data-testid={`sync-panel-${institution.replace(/\s+/g, "-").toLowerCase()}`}>
          <div className="px-5 py-3 border-b border-border/50 bg-muted/20 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-foreground text-sm" data-testid="sync-institution-name">{institution}</h3>
              {(session.lastRefreshedAt || session.completedAt) && (
                <p className="text-[11px] text-muted-foreground mt-0.5" data-testid="sync-last-refreshed">
                  Last refreshed: {formatDate(session.lastRefreshedAt ?? session.completedAt!)}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant={isPushed ? "default" : isFailed ? "destructive" : isEnriched ? "secondary" : "outline"}
                className={isRunning ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200 dark:border-blue-800" : ""}
                data-testid="sync-status-badge"
              >
                {syncForThisInst && session?.status !== "running" ? "starting…" : session.status}
              </Badge>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onCollapse} data-testid="button-collapse-sync">
                <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </div>
          </div>

          {isRunning && (
            <div className="px-5 py-5" data-testid="sync-progress">
              <div className="flex items-center gap-3 mb-3">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <span className="text-sm font-medium text-foreground">{phaseLabel}</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                <div
                  className="bg-primary h-2 rounded-full transition-all duration-500 animate-pulse"
                  style={{ width: session.phase === "scraping" ? "33%" : session.phase === "comparing" ? "50%" : session.phase === "enriching" ? "75%" : "100%" }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {rawCount > 0 ? `${rawCount} raw listings scraped` : "Fetching listings from institution..."}
              </p>
              {!syncIsActive && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => cancelStaleMutation.mutate()}
                  disabled={cancelStaleMutation.isPending}
                  data-testid="button-clear-stale"
                >
                  {cancelStaleMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Clear stale session
                </Button>
              )}
            </div>
          )}

          {(isEnriched || isPushed || isFailed) && (
            <div className="px-5 py-4 space-y-4" data-testid="sync-result-details">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-lg border border-border bg-background p-3 text-center">
                  <div className="text-xl font-bold tabular-nums text-foreground" data-testid="stat-currently-indexed">{currentIndexed}</div>
                  <div className="text-xs text-muted-foreground">Currently Indexed</div>
                </div>
                <div className="rounded-lg border border-border bg-background p-3 text-center">
                  <div className="text-xl font-bold tabular-nums text-foreground" data-testid="stat-raw-scraped">{session.rawCount}</div>
                  <div className="text-xs text-muted-foreground">Raw Scraped</div>
                </div>
                <div className="rounded-lg border border-border bg-background p-3 text-center">
                  <div className="text-xl font-bold tabular-nums text-foreground" data-testid="stat-new-found">{session.newCount}</div>
                  <div className="text-xs text-muted-foreground">New (Not in Index)</div>
                </div>
                <div className="rounded-lg border border-border bg-background p-3 text-center">
                  <div className={`text-xl font-bold tabular-nums ${session.relevantCount > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"}`} data-testid="stat-relevant">
                    {session.relevantCount}
                  </div>
                  <div className="text-xs text-muted-foreground">New + Relevant (Biotech)</div>
                </div>
              </div>

              {zeroGuard && (
                <div className="flex items-start gap-3 p-4 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30" data-testid="sync-zero-guard">
                  <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-red-700 dark:text-red-400">Connection may be broken — 0 results returned</p>
                    <p className="text-xs text-red-600 dark:text-red-500 mt-1">The scraper returned no results. This could indicate a broken connection, website change, or temporary outage. Push is blocked.</p>
                  </div>
                </div>
              )}

              {softWarning && !zeroGuard && (
                <div className="flex items-start gap-3 p-4 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30" data-testid="sync-soft-warning">
                  <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Results significantly below expected count</p>
                    <p className="text-xs text-amber-600 dark:text-amber-500 mt-1">
                      Scraped {rawCount} results but {currentIndexed} are currently indexed. This is below 50% of the expected count — the scraper may only be returning partial results.
                    </p>
                  </div>
                </div>
              )}

              {isPushed && (
                <div className="flex items-start gap-3 p-4 rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30" data-testid="sync-pushed-success">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                      {session.pushedCount > 0 ? `${session.pushedCount} new assets pushed to index` : "No new relevant assets to push"}
                    </p>
                  </div>
                </div>
              )}

              {isFailed && (
                <div className="flex items-start gap-3 p-4 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30" data-testid="sync-failed">
                  <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-red-700 dark:text-red-400">Sync failed</p>
                    <p className="text-xs text-red-600 dark:text-red-500 mt-1">The scraper encountered an error. Check server logs for details.</p>
                  </div>
                </div>
              )}

              {isEnriched && !zeroGuard && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-foreground">
                      {session.relevantCount > 0 ? `New Relevant Entries (${newEntries.length})` : "Push to Index"}
                    </h4>
                    <Button
                      onClick={() => pushMutation.mutate()}
                      disabled={pushMutation.isPending || zeroGuard || session.relevantCount === 0}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      size="sm"
                      data-testid="button-push-to-index"
                    >
                      {pushMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <ArrowUpCircle className="h-4 w-4 mr-2" />
                      )}
                      {session.relevantCount > 0 ? "Push to Index" : "Nothing to Push"}
                    </Button>
                  </div>
                  {newEntries.length > 0 && (
                    <div className="border border-border rounded-lg overflow-hidden max-h-[300px] overflow-y-auto" data-testid="sync-new-entries">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                          <tr className="border-b border-border">
                            <th className="text-left py-2 px-3 font-medium text-foreground">Asset Name</th>
                            <th className="text-left py-2 px-3 font-medium text-foreground">Target</th>
                            <th className="text-left py-2 px-3 font-medium text-foreground">Modality</th>
                            <th className="text-left py-2 px-3 font-medium text-foreground">Indication</th>
                            <th className="text-left py-2 px-3 font-medium text-foreground">First Seen</th>
                            <th className="text-center py-2 px-3 font-medium text-foreground">Link</th>
                          </tr>
                        </thead>
                        <tbody>
                          {newEntries.map((entry, i) => (
                            <tr
                              key={i}
                              className="border-b border-border/50 hover:bg-muted/20 opacity-0"
                              style={{
                                animation: `syncEntryIn 0.25s ease forwards`,
                                animationDelay: `${i * 60}ms`,
                              }}
                              data-testid={`sync-entry-${i}`}
                            >
                              <td className="py-2 px-3 font-medium text-foreground max-w-[300px] truncate" title={entry.assetName}>
                                {entry.assetName}
                              </td>
                              <td className="py-2 px-3 text-muted-foreground capitalize">{entry.target}</td>
                              <td className="py-2 px-3 text-muted-foreground capitalize">{entry.modality}</td>
                              <td className="py-2 px-3 text-muted-foreground capitalize">{entry.indication}</td>
                              <td className="py-2 px-3 text-muted-foreground text-xs" data-testid={`sync-entry-firstseen-${i}`}>
                                {entry.firstSeenAt ? formatDate(entry.firstSeenAt) : "—"}
                              </td>
                              <td className="py-2 px-3 text-center">
                                {entry.sourceUrl ? (
                                  <a href={entry.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                    <ExternalLink className="h-3.5 w-3.5 inline" />
                                  </a>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {isEnriched && session.relevantCount === 0 && session.newCount === 0 && !isFailed && (
                <div className="text-center py-4 text-muted-foreground" data-testid="sync-no-new">
                  <CheckCircle2 className="h-6 w-6 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No new entries found — index is up to date.</p>
                </div>
              )}

              {isEnriched && session.relevantCount === 0 && session.newCount > 0 && (
                <div className="text-center py-4 text-muted-foreground" data-testid="sync-no-relevant">
                  <p className="text-sm">{session.newCount} new entries found, but none passed the biotech relevance filter.</p>
                </div>
              )}
            </div>
          )}

          {recentHistory.length > 0 && (
            <div className="px-5 pb-4 pt-2 border-t border-border/40" data-testid="sync-session-history">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Recent Sessions</h4>
              <div className="space-y-1">
                {recentHistory.map((s, i) => (
                  <div
                    key={s.sessionId}
                    className="flex items-center justify-between py-1.5 px-3 rounded-md bg-muted/30 text-xs"
                    style={{ animation: `syncEntryIn 0.2s ease forwards`, animationDelay: `${i * 40}ms`, opacity: 0 }}
                    data-testid={`history-row-${i}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {s.status === "pushed" ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" aria-label="Pushed to pipeline" />
                      ) : s.status === "failed" ? (
                        <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" aria-label="Scrape failed" />
                      ) : s.status === "enriched" && (s.rawCount ?? 0) > 0 ? (
                        <Clock className="h-3.5 w-3.5 text-blue-500 shrink-0" aria-label="Ready to push" />
                      ) : (
                        <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0" aria-label="Scraped 0 results — site may have been unreachable" />
                      )}
                      <span className="text-muted-foreground truncate">
                        {s.completedAt ? formatDate(s.completedAt) : "In progress"}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-muted-foreground/70 shrink-0 ml-3">
                      <span>{s.rawCount} scraped</span>
                      <span className={s.relevantCount > 0 ? "text-emerald-600 dark:text-emerald-400 font-medium" : ""}>{s.relevantCount} relevant</span>
                      {s.pushedCount > 0 && <span className="text-primary font-medium">{s.pushedCount} pushed</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

type SortKey = "institution" | "health" | "totalInDb" | "biotechRelevant" | "lastSyncAt";

function DataHealth({ pw }: { pw: string }) {
  const [statusFilter, setStatusFilter] = useState<"all" | HealthStatus>("all");
  const [errorTypeFilter, setErrorTypeFilter] = useState<ErrorType>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedInstitution, setExpandedInstitution] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("health");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [liveOpen, setLiveOpen] = useState(true);
  const [activeSearchOpen, setActiveSearchOpen] = useState(false);
  const [activeSearchQuery, setActiveSearchQuery] = useState("");
  const [healthPanelOpen, setHealthPanelOpen] = useState(false);
  const lastStableOrder = useRef<string[]>([]);
  const { toast } = useToast();

  const { data, isLoading, error } = useQuery<CollectorHealthData>({
    queryKey: ["/api/admin/collector-health", pw],
    queryFn: async () => {
      const res = await fetch("/api/admin/collector-health", {
        headers: { "x-admin-password": pw },
      });
      if (!res.ok) throw new Error("Failed to load collector health");
      return res.json();
    },
    refetchInterval: (query) => {
      const d = query.state.data as CollectorHealthData | undefined;
      if (d?.syncingCount && d.syncingCount > 0) return 3_000;
      if (d?.scheduler?.state === "running") return 5_000;
      return 30_000;
    },
  });

  const [pendingSyncInst, setPendingSyncInst] = useState<string | null>(null);

  const syncMutation = useMutation({
    mutationFn: async (institution: string) => {
      const res = await fetch(`/api/ingest/sync/${encodeURIComponent(institution)}`, {
        method: "POST",
        headers: { "x-admin-password": pw },
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Sync failed");
      }
      return res.json();
    },
    onSuccess: (_d, institution) => {
      toast({ title: "Sync started", description: `Syncing ${institution}...` });
      setPendingSyncInst(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/collector-health"] });
    },
    onError: (err: Error) => {
      setPendingSyncInst(null);
      toast({ title: "Sync failed", description: err.message, variant: "destructive" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (institution: string) => {
      const res = await fetch(`/api/ingest/sync/${encodeURIComponent(institution)}/cancel`, {
        method: "POST",
        headers: { "x-admin-password": pw },
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Cancel failed");
      }
      return res.json();
    },
    onSuccess: (_d, institution) => {
      toast({ title: "Session cancelled", description: `Stale session for ${institution} cleared` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/collector-health"] });
    },
    onError: (err: Error) => {
      toast({ title: "Cancel failed", description: err.message, variant: "destructive" });
    },
  });

  const bumpMutation = useMutation({
    mutationFn: async (institution: string) => {
      const res = await fetch("/api/ingest/scheduler/bump", {
        method: "POST",
        headers: { "x-admin-password": pw, "Content-Type": "application/json" },
        body: JSON.stringify({ institution }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(d.error || "Bump failed");
      }
      return res.json();
    },
    onSuccess: (_d, institution) => {
      toast({ title: "Priority queued", description: `${institution} will sync next` });
    },
    onError: (err: Error) => {
      toast({ title: "Bump failed", description: err.message, variant: "destructive" });
    },
  });

  const schedulerStartMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/ingest/scheduler/start", {
        method: "POST",
        headers: { "x-admin-password": pw },
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      return res.json();
    },
    onSuccess: (d: { ok: boolean; message?: string }) => {
      if (d.ok) {
        toast({ title: "Scheduler started", description: "Sequential sync cycle is running" });
      } else {
        toast({ title: "Cannot start", description: d.message, variant: "destructive" });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/admin/collector-health"] });
    },
    onError: (err: Error) => {
      toast({ title: "Start failed", description: err.message, variant: "destructive" });
    },
  });

  const schedulerPauseMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/ingest/scheduler/pause", {
        method: "POST",
        headers: { "x-admin-password": pw },
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      return res.json();
    },
    onSuccess: (d: { ok: boolean; message?: string }) => {
      if (d.ok) {
        toast({ title: "Scheduler paused" });
      } else {
        toast({ title: "Cannot pause", description: d.message, variant: "destructive" });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/admin/collector-health"] });
    },
    onError: (err: Error) => {
      toast({ title: "Pause failed", description: err.message, variant: "destructive" });
    },
  });

  const [resetConfirm, setResetConfirm] = useState(false);
  const resetConfirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const schedulerResetMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/ingest/scheduler/reset", {
        method: "POST",
        headers: { "x-admin-password": pw },
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      return res.json();
    },
    onSuccess: (d: { ok: boolean; message?: string }) => {
      setResetConfirm(false);
      if (d.ok) {
        toast({ title: "Restarted from scratch", description: d.message });
      } else {
        toast({ title: "Cannot reset", description: d.message, variant: "destructive" });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/admin/collector-health"] });
    },
    onError: (err: Error) => {
      setResetConfirm(false);
      toast({ title: "Reset failed", description: err.message, variant: "destructive" });
    },
  });

  const handleResetClick = () => {
    if (!resetConfirm) {
      setResetConfirm(true);
      if (resetConfirmTimer.current) clearTimeout(resetConfirmTimer.current);
      resetConfirmTimer.current = setTimeout(() => setResetConfirm(false), 4000);
    } else {
      if (resetConfirmTimer.current) clearTimeout(resetConfirmTimer.current);
      schedulerResetMutation.mutate();
    }
  };

  type ScraperHealthRow = {
    institution: string;
    consecutiveFailures: number;
    lastFailureReason: string | null;
    lastFailureAt: string | null;
    lastSuccessAt: string | null;
    backoffUntil: string | null;
    inBackoff: boolean;
  };

  const { data: scraperHealthData, refetch: refetchScraperHealth } = useQuery<{ rows: ScraperHealthRow[]; total: number; inBackoff: number }>({
    queryKey: ["/api/admin/scraper-health", pw],
    queryFn: async () => {
      const res = await fetch("/api/admin/scraper-health", { headers: { "x-admin-password": pw } });
      if (!res.ok) throw new Error("Failed to load scraper health");
      return res.json();
    },
    enabled: healthPanelOpen,
  });

  const clearBackoffMutation = useMutation({
    mutationFn: async (institution: string) => {
      const res = await fetch(`/api/admin/scraper-health/${encodeURIComponent(institution)}/clear-backoff`, {
        method: "POST",
        headers: { "x-admin-password": pw },
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: "Failed" }));
        throw new Error(d.error || "Clear backoff failed");
      }
      return res.json();
    },
    onSuccess: (_d, institution) => {
      toast({ title: "Backoff cleared", description: `${institution} will be included in the next cycle` });
      refetchScraperHealth();
    },
    onError: (err: Error) => {
      toast({ title: "Clear backoff failed", description: err.message, variant: "destructive" });
    },
  });

  const healthOrder: Record<HealthStatus, number> = { stale: 0, failing: 1, degraded: 2, warning: 3, syncing: 4, never: 5, ok: 6 };

  const sortedRowsForFreeze = React.useMemo(() => {
    if (!data) return [];
    const rows = [...data.rows];
    const dir = sortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      switch (sortKey) {
        case "institution": return dir * a.institution.localeCompare(b.institution);
        case "health": {
          const hDiff = healthOrder[a.health] - healthOrder[b.health];
          return dir * (hDiff !== 0 ? hDiff : b.biotechRelevant - a.biotechRelevant);
        }
        case "totalInDb": return dir * (a.totalInDb - b.totalInDb);
        case "biotechRelevant": return dir * (a.biotechRelevant - b.biotechRelevant);
        case "lastSyncAt": {
          const aT = a.lastSyncAt ? new Date(a.lastSyncAt).getTime() : 0;
          const bT = b.lastSyncAt ? new Date(b.lastSyncAt).getTime() : 0;
          return dir * (aT - bT);
        }
        default: return 0;
      }
    });
    return rows;
  }, [data?.rows, sortKey, sortDir]);

  const sortedRows = React.useMemo(() => {
    if (!data?.syncingCount || data.syncingCount === 0) {
      lastStableOrder.current = sortedRowsForFreeze.map((r) => r.institution);
      return sortedRowsForFreeze;
    }
    const order = lastStableOrder.current;
    if (!order.length) return sortedRowsForFreeze;
    return [...data.rows].sort(
      (a, b) => order.indexOf(a.institution) - order.indexOf(b.institution)
    );
  }, [sortedRowsForFreeze, data?.syncingCount, data?.rows]);

  const syncingRows = (data?.rows ?? []).filter((r) => r.health === "syncing");
  const firstSyncingInstitution = syncingRows[0]?.institution ?? null;
  useEffect(() => {
    if (firstSyncingInstitution && !expandedInstitution) {
      setExpandedInstitution(firstSyncingInstitution);
    }
  }, [firstSyncingInstitution]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20" data-testid="health-loading">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-20 text-muted-foreground" data-testid="health-error">
        Failed to load collector health data.
      </div>
    );
  }

  const lastScanAt = data.rows.reduce((max: string | null, r) => {
    if (!r.lastSyncAt) return max;
    if (!max) return r.lastSyncAt;
    return new Date(r.lastSyncAt).getTime() > new Date(max).getTime() ? r.lastSyncAt : max;
  }, null as string | null);

  const displayRows = sortedRows.filter((r) => {
    if (statusFilter !== "all" && r.health !== statusFilter) return false;
    if (errorTypeFilter !== "all") {
      if (!r.lastSyncError) return false;
      if (getErrorType(r.lastSyncError) !== errorTypeFilter) return false;
    }
    if (searchQuery.trim()) {
      return r.institution.toLowerCase().includes(searchQuery.toLowerCase().trim());
    }
    return true;
  });

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function exportCsv() {
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const headers = ["Institution", "Total In DB", "Biotech Relevant", "Health", "Last Sync", "Error"];
    const csvRows = sortedRows.map((row) => [
      escape(row.institution),
      String(row.totalInDb),
      String(row.biotechRelevant),
      row.health,
      row.lastSyncAt ? new Date(row.lastSyncAt).toISOString().slice(0, 10) : "never",
      escape(row.lastSyncError ?? ""),
    ]);
    const csv = [headers.join(","), ...csvRows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `collector-health-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const sched = data.scheduler;
  const syncedToday = data.syncedToday ?? 0;

  const handleSyncClick = (institution: string) => {
    setPendingSyncInst(institution);
    setExpandedInstitution(institution);
    syncMutation.mutate(institution);
  };

  const handleRowClick = (institution: string) => {
    setExpandedInstitution((prev) => prev === institution ? null : institution);
  };

  const schedRunning = sched.state === "running";
  const schedPaused = sched.state === "paused";

  return (
    <>
      <div className="mb-6">
        <div className="flex items-start justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-2xl font-semibold text-foreground" data-testid="text-section-title">Data Health</h2>
            <p className="text-sm text-muted-foreground mt-1">Monitor collector status, run institution syncs, and manage the sync scheduler</p>
          </div>
          {lastScanAt && (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 border border-border rounded-full px-3 py-1.5 shrink-0" data-testid="badge-last-scan">
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
              Last full scan: <span className="font-medium text-foreground">{relativeTime(lastScanAt)}</span>
            </span>
          )}
        </div>
      </div>

      <div className="border border-border rounded-xl bg-card overflow-hidden">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 px-4 py-4 border-b border-border" data-testid="health-summary">
          <div className="text-center">
            <div className="text-2xl font-bold text-foreground tabular-nums" data-testid="stat-total-in-db">{data.totalInDb.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">Total in DB</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-primary tabular-nums" data-testid="stat-biotech-relevant">{data.totalBiotechRelevant.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">Biotech Relevant</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-foreground tabular-nums" data-testid="stat-synced-today">{syncedToday}</div>
            <div className="text-xs text-muted-foreground">Synced Today</div>
            <div className="text-[10px] text-muted-foreground/60">of {data.totalInstitutions} institutions</div>
          </div>
          <div className="text-center">
            <div className={`text-2xl font-bold tabular-nums ${data.issueCount > 0 ? "text-amber-500" : "text-emerald-500"}`} data-testid="stat-issues">{data.issueCount}</div>
            <div className="text-xs text-muted-foreground">Need Attention</div>
          </div>
          <div className="text-center">
            <div className={`text-2xl font-bold tabular-nums ${data.syncingCount > 0 ? "text-blue-500" : "text-muted-foreground/40"}`} data-testid="stat-syncing">{data.syncingCount}</div>
            <div className="text-xs text-muted-foreground">Currently Syncing</div>
          </div>
        </div>

        <div className="px-4 py-3 border-b border-border bg-muted/20" data-testid="scheduler-strip">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex items-center gap-2 flex-shrink-0">
                <Activity className="w-4 h-4 text-primary" />
                <span className="font-semibold text-foreground text-sm">Scheduler</span>
              </div>

              {schedRunning ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2.5 py-1 flex-shrink-0" data-testid="badge-scheduler-running">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Running
                </span>
              ) : schedPaused ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-2.5 py-1 flex-shrink-0" data-testid="badge-scheduler-paused">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  Paused
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground bg-muted/50 border border-border rounded-full px-2.5 py-1 flex-shrink-0" data-testid="badge-scheduler-idle">
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
                  Idle
                </span>
              )}

              {schedRunning && (sched.currentInstitutions ?? []).length > 0 && (
                <div className="flex flex-wrap gap-1 min-w-0">
                  {(sched.currentInstitutions ?? [sched.currentInstitution]).filter(Boolean).map((inst) => (
                    <Badge key={inst} variant="outline" className="text-xs gap-1 text-blue-600 border-blue-500/30 bg-blue-500/10 max-w-[140px] truncate">
                      <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
                      {inst}
                    </Badge>
                  ))}
                </div>
              )}
              {schedRunning && (sched.currentInstitutions ?? []).length === 0 && !sched.currentInstitution && (
                <span className="text-xs text-blue-600/70">Waiting for next...</span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {schedRunning ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs border-amber-400/50 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/50 font-medium"
                  onClick={() => schedulerPauseMutation.mutate()}
                  disabled={schedulerPauseMutation.isPending}
                  data-testid="button-pause-scheduler"
                >
                  {schedulerPauseMutation.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <AlertCircle className="w-3 h-3 mr-1" />}
                  Pause
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="h-8 text-xs bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95 transition-transform font-medium"
                  onClick={() => schedulerStartMutation.mutate()}
                  disabled={schedulerStartMutation.isPending}
                  data-testid="button-start-scheduler"
                >
                  {schedulerStartMutation.isPending ? (
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  ) : (
                    <Zap className="w-3 h-3 mr-1" />
                  )}
                  {schedPaused ? "Resume" : "Start"}
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                className={`h-8 text-xs font-medium transition-colors ${resetConfirm
                  ? "border-red-500 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-900/50"
                  : "border-border text-muted-foreground hover:text-foreground hover:border-red-400/60"}`}
                onClick={handleResetClick}
                disabled={schedulerResetMutation.isPending}
                data-testid="button-reset-scheduler"
              >
                {schedulerResetMutation.isPending
                  ? <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  : <RefreshCw className="w-3 h-3 mr-1" />
                }
                {resetConfirm ? "Confirm Reset & Restart?" : "Reset & Restart"}
              </Button>
            </div>
          </div>
        </div>

        {/* ── Live Connections section ───────────────────────── */}
        <button
          className="w-full flex items-center justify-between px-4 py-3 border-b border-border bg-muted/10 hover:bg-muted/20 transition-colors text-left"
          onClick={() => setLiveOpen((v) => !v)}
          data-testid="section-live-connections"
        >
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <span className="font-semibold text-foreground text-sm">Live Connections</span>
            <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">{data.totalInstitutions}</span>
            <span className="text-[11px] text-muted-foreground/60">Sequence scan active</span>
          </div>
          <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${liveOpen ? "rotate-90" : ""}`} />
        </button>

        {liveOpen && (
          <>
            <div className="flex flex-col gap-2 px-4 py-3 border-b border-border">
              <div className="flex flex-wrap items-center gap-1.5">
                {(([
                  { key: "all",      label: "All",          activeClass: "bg-primary text-primary-foreground border-primary" },
                  { key: "ok",       label: "Working",      activeClass: "bg-emerald-600 text-white border-emerald-600" },
                  { key: "warning",  label: "Warning",      activeClass: "bg-yellow-500 text-white border-yellow-500" },
                  { key: "degraded", label: "Degraded",     activeClass: "bg-amber-500 text-white border-amber-500" },
                  { key: "stale",    label: "Stale",        activeClass: "bg-orange-500 text-white border-orange-500" },
                  { key: "failing",  label: "Failing",      activeClass: "bg-red-600 text-white border-red-600" },
                  { key: "never",    label: "Never synced", activeClass: "bg-muted text-foreground border-border" },
                ] as { key: "all" | HealthStatus; label: string; activeClass: string }[]).map(({ key, label, activeClass }) => {
                  const count = key === "all" ? sortedRows.length : sortedRows.filter((r) => r.health === key).length;
                  return (
                    <button
                      key={key}
                      onClick={() => setStatusFilter(key)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                        statusFilter === key
                          ? activeClass
                          : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                      data-testid={`filter-status-${key}`}
                    >
                      {label} ({count})
                    </button>
                  );
                }))}
              </div>
              {/* Error type filter — only visible when there are failing/degraded rows */}
              {sortedRows.some((r) => r.lastSyncError) && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider font-semibold">Error type:</span>
                  {(["all", "Timeout", "Blocked", "Network", "Parsing", "Unknown"] as ErrorType[]).map((et) => {
                    const count = et === "all"
                      ? sortedRows.filter((r) => r.lastSyncError).length
                      : sortedRows.filter((r) => r.lastSyncError && getErrorType(r.lastSyncError) === et).length;
                    if (et !== "all" && count === 0) return null;
                    const activeClass =
                      et === "Timeout" ? "bg-orange-500 text-white border-orange-500" :
                      et === "Blocked" ? "bg-red-600 text-white border-red-600" :
                      et === "Network" ? "bg-rose-500 text-white border-rose-500" :
                      et === "Parsing" ? "bg-amber-500 text-white border-amber-500" :
                      et === "Unknown" ? "bg-slate-500 text-white border-slate-500" :
                      "bg-muted text-foreground border-border";
                    return (
                      <button
                        key={et}
                        onClick={() => setErrorTypeFilter(et)}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                          errorTypeFilter === et
                            ? activeClass
                            : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                        data-testid={`filter-error-${et}`}
                      >
                        {et === "all" ? "All errors" : et} {et !== "all" && `(${count})`}
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="flex items-center justify-between gap-3">
                <Input
                  placeholder="Search institutions…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-7 text-xs max-w-[220px]"
                  data-testid="input-institution-search"
                />
                <Button variant="outline" size="sm" onClick={exportCsv} data-testid="button-export-csv">
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                  Export CSV
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    {(["institution", "health", "totalInDb", "biotechRelevant", "lastSyncAt"] as SortKey[]).map((col) => {
                      const label = col === "institution" ? "Institution" : col === "health" ? "Health" : col === "totalInDb" ? "Total" : col === "biotechRelevant" ? "Relevant" : "Last Sync";
                      const align = col === "institution" ? "text-left" : "text-center";
                      const minW = col === "institution" ? "min-w-[200px]" : col === "health" ? "min-w-[90px]" : col === "lastSyncAt" ? "min-w-[80px]" : "min-w-[70px]";
                      const title = col === "totalInDb" ? "Total assets in database" : col === "biotechRelevant" ? "Biotech-relevant subset" : undefined;
                      const active = sortKey === col;
                      return (
                        <th key={col} className={`${align} py-3 px-4 font-semibold text-foreground ${minW}`} title={title}>
                          <button
                            onClick={() => handleSort(col)}
                            className={`inline-flex items-center gap-1 hover:text-primary transition-colors ${active ? "text-primary" : ""}`}
                            data-testid={`sort-${col}`}
                          >
                            {label}
                            <span className="text-[10px] opacity-60 w-3">
                              {active ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}
                            </span>
                          </button>
                        </th>
                      );
                    })}
                    <th className="text-left py-3 px-3 font-semibold text-foreground min-w-[120px]">Error</th>
                    <th className="text-center py-3 px-3 font-semibold text-foreground min-w-[60px]">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map((row) => {
                    const isExpanded = expandedInstitution === row.institution;
                    const instSlug = row.institution.replace(/\s+/g, "-").toLowerCase();
                    return (
                      <React.Fragment key={row.institution}>
                        <tr
                          className={`border-b border-border/50 hover:bg-muted/20 cursor-pointer ${row.consecutiveFailures >= 4 ? "bg-red-500/5" : row.consecutiveFailures >= 2 ? "bg-amber-500/5" : row.consecutiveFailures >= 1 ? "bg-yellow-500/5" : ""} ${isExpanded ? "bg-primary/5 border-b-0" : ""}`}
                          data-testid={`health-row-${instSlug}`}
                          onClick={() => handleRowClick(row.institution)}
                        >
                          <td className="py-2 px-4 font-medium text-foreground truncate max-w-[250px]" title={row.institution}>
                            <div className="flex items-center gap-1.5">
                              <span className="truncate">{row.institution}</span>
                              {row.tier === 1 && (
                                <Badge variant="outline" className="shrink-0 text-[10px] px-1.5 py-0 text-sky-600 border-sky-500/30 bg-sky-500/5" title="Tier 1: API/RSS — fastest">T1</Badge>
                              )}
                              {row.tier === 2 && (
                                <Badge variant="outline" className="shrink-0 text-[10px] px-1.5 py-0 text-violet-600 border-violet-500/30 bg-violet-500/5" title="Tier 2: Platform factory (TechPublisher/Flintbox)">T2</Badge>
                              )}
                              {row.tier === 3 && (
                                <Badge variant="outline" className="shrink-0 text-[10px] px-1.5 py-0 text-emerald-600 border-emerald-500/30 bg-emerald-500/5" title="Tier 3: Custom bespoke HTML">T3</Badge>
                              )}
                              {row.tier === 4 && (
                                <Badge variant="outline" className="shrink-0 text-[10px] px-1.5 py-0 text-orange-600 border-orange-500/30 bg-orange-500/5" title="Tier 4: Playwright (headless browser)">T4</Badge>
                              )}
                              {row.consecutiveFailures >= 4 && (
                                <Badge variant="outline" className="shrink-0 text-[10px] px-1.5 py-0 text-red-500 border-red-500/30 bg-red-500/5" data-testid={`badge-needs-attention-${instSlug}`}>
                                  Sync Error
                                </Badge>
                              )}
                              {row.consecutiveFailures >= 2 && row.consecutiveFailures < 4 && (
                                <Badge variant="outline" className="shrink-0 text-[10px] px-1.5 py-0 text-amber-500 border-amber-500/30 bg-amber-500/5">
                                  {row.consecutiveFailures}x failed
                                </Badge>
                              )}
                              {row.consecutiveFailures === 1 && (
                                <Badge variant="outline" className="shrink-0 text-[10px] px-1.5 py-0 text-yellow-600 border-yellow-500/30 bg-yellow-500/5">
                                  1x failed
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="text-center py-2 px-3">
                            <div className="inline-flex items-center gap-1.5 min-w-[7.5rem] justify-center">
                              <HealthDot health={row.health} />
                              <HealthLabel health={row.health} />
                            </div>
                          </td>
                          <td className={`text-center py-2 px-3 tabular-nums ${row.totalInDb === 0 ? "text-muted-foreground/40" : "text-foreground font-medium"}`}>
                            {row.totalInDb > 0 ? row.totalInDb.toLocaleString() : "\u2014"}
                          </td>
                          <td className={`text-center py-2 px-3 tabular-nums ${row.biotechRelevant === 0 ? "text-muted-foreground/40" : "text-primary font-medium"}`}>
                            {row.biotechRelevant > 0 ? row.biotechRelevant.toLocaleString() : "\u2014"}
                          </td>
                          <td className={`text-center py-2 px-3 text-xs ${!row.lastSyncAt ? "text-muted-foreground/40" : "text-muted-foreground"}`}>
                            {row.health === "syncing" ? (
                              <span className="text-blue-600 dark:text-blue-400 font-medium">{row.phase ?? "syncing"}</span>
                            ) : (
                              relativeTime(row.lastSyncAt)
                            )}
                          </td>
                          <td className="text-left py-2 px-3" data-testid={`error-${instSlug}`}>
                            {row.health === "syncing" ? (
                              <div className="w-full max-w-[180px]">
                                <div className="text-[10px] text-blue-500 font-medium mb-1">{row.phase ?? "starting…"}</div>
                                <div className="h-1.5 rounded-full bg-blue-500/15 overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-blue-500 animate-pulse transition-all duration-700"
                                    style={{ width: row.phase === "scraping" ? "33%" : row.phase === "comparing" ? "55%" : row.phase === "enriching" ? "75%" : row.phase === "done" ? "95%" : "12%" }}
                                  />
                                </div>
                              </div>
                            ) : row.lastSyncError ? (
                              <span className="text-xs text-red-500 truncate block max-w-[200px]" title={row.lastSyncError}>
                                {row.lastSyncError.length > 60 ? row.lastSyncError.slice(0, 60) + "..." : row.lastSyncError}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground/40">&mdash;</span>
                            )}
                          </td>
                          <td className="text-center py-2 px-3" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-1">
                              {row.health === "stale" ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs text-orange-600 hover:text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-950"
                                  onClick={() => cancelMutation.mutate(row.institution)}
                                  disabled={cancelMutation.isPending}
                                  title={`Cancel stale session for ${row.institution}`}
                                  data-testid={`button-cancel-${instSlug}`}
                                >
                                  <XCircle className="h-3.5 w-3.5 mr-1" />
                                  Cancel
                                </Button>
                              ) : row.health === "syncing" ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs text-blue-600"
                                  onClick={() => handleRowClick(row.institution)}
                                  data-testid={`button-view-sync-${instSlug}`}
                                >
                                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                                  View
                                </Button>
                              ) : (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0"
                                    onClick={() => handleSyncClick(row.institution)}
                                    disabled={pendingSyncInst === row.institution}
                                    title={`Sync ${row.institution}`}
                                    data-testid={`button-sync-${instSlug}`}
                                  >
                                    <RefreshCw className={`h-3.5 w-3.5 ${pendingSyncInst === row.institution ? "animate-spin" : ""}`} />
                                  </Button>
                                  {sched.state === "running" && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-7 p-0 text-blue-500 hover:text-blue-600"
                                      onClick={() => bumpMutation.mutate(row.institution)}
                                      disabled={bumpMutation.isPending}
                                      title={`Bump ${row.institution} to front of scheduler queue`}
                                      data-testid={`button-bump-${instSlug}`}
                                    >
                                      <ArrowUpCircle className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                        {isExpanded && (
                          <ExpandedSyncPanel
                            key={`panel-${row.institution}`}
                            institution={row.institution}
                            pw={pw}
                            onCollapse={() => setExpandedInstitution(null)}
                          />
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ── Active Search section ──────────────────────────── */}
        <button
          className="w-full flex items-center justify-between px-4 py-3 border-t border-border bg-muted/10 hover:bg-muted/20 transition-colors text-left"
          onClick={() => setActiveSearchOpen((v) => !v)}
          data-testid="section-active-search"
        >
          <div className="flex items-center gap-2">
            <PackagePlus className="h-4 w-4 text-violet-500" />
            <span className="font-semibold text-foreground text-sm">Active Search</span>
            <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">{data.totalActiveSearch ?? 0}</span>
            <span className="text-[11px] text-muted-foreground/60">Manually imported — not sequence scanned</span>
          </div>
          <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${activeSearchOpen ? "rotate-90" : ""}`} />
        </button>

        {activeSearchOpen && (
          <>
            <div className="px-4 py-3 border-b border-border">
              <Input
                placeholder="Search active search institutions…"
                value={activeSearchQuery}
                onChange={(e) => setActiveSearchQuery(e.target.value)}
                className="h-7 text-xs max-w-[260px]"
                data-testid="input-active-search-filter"
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 font-semibold text-foreground min-w-[200px]">Institution</th>
                    <th className="text-center py-3 px-4 font-semibold text-foreground min-w-[70px]" title="Total assets in database">Total</th>
                    <th className="text-center py-3 px-4 font-semibold text-foreground min-w-[70px]" title="Biotech-relevant subset">Relevant</th>
                    <th className="text-center py-3 px-4 font-semibold text-foreground min-w-[90px]">Status</th>
                    <th className="text-center py-3 px-4 font-semibold text-foreground min-w-[60px]">TTO Link</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.activeSearchRows ?? [])
                    .filter((r) => !activeSearchQuery.trim() || r.institution.toLowerCase().includes(activeSearchQuery.toLowerCase().trim()))
                    .map((row) => {
                      const instSlug = row.institution.replace(/\s+/g, "-").toLowerCase();
                      return (
                        <tr key={row.institution} className="border-b border-border/50 hover:bg-muted/20" data-testid={`active-search-row-${instSlug}`}>
                          <td className="py-2 px-4 font-medium text-foreground truncate max-w-[250px]" title={row.institution}>
                            {row.institution}
                          </td>
                          <td className={`text-center py-2 px-4 tabular-nums ${row.totalInDb === 0 ? "text-muted-foreground/40" : "text-foreground font-medium"}`}>
                            {row.totalInDb > 0 ? row.totalInDb.toLocaleString() : "\u2014"}
                          </td>
                          <td className={`text-center py-2 px-4 tabular-nums ${row.biotechRelevant === 0 ? "text-muted-foreground/40" : "text-primary font-medium"}`}>
                            {row.biotechRelevant > 0 ? row.biotechRelevant.toLocaleString() : "\u2014"}
                          </td>
                          <td className="text-center py-2 px-4">
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-violet-600 border-violet-500/30 bg-violet-500/5">
                              Imported
                            </Badge>
                          </td>
                          <td className="text-center py-2 px-4">
                            {row.ttoUrl ? (
                              <a
                                href={row.ttoUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center h-6 w-6 rounded hover:bg-muted text-muted-foreground hover:text-primary transition-colors"
                                title={row.ttoUrl}
                                data-testid={`link-tto-${instSlug}`}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            ) : (
                              <span className="text-muted-foreground/40 text-xs">&mdash;</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  {(data.activeSearchRows ?? []).filter((r) => !activeSearchQuery.trim() || r.institution.toLowerCase().includes(activeSearchQuery.toLowerCase().trim())).length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-center py-8 text-sm text-muted-foreground">
                        {activeSearchQuery.trim()
                          ? "No institutions match your search."
                          : "No Active Search institutions yet — use Manual Import to add one."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* ── Scraper Health section ─────────────────────────── */}
      <button
        className="w-full flex items-center justify-between px-4 py-3 border-b border-border bg-muted/10 hover:bg-muted/20 transition-colors text-left"
        onClick={() => setHealthPanelOpen((v) => !v)}
        data-testid="section-scraper-health"
      >
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-primary" />
          <span className="font-semibold text-foreground text-sm">Scraper Health</span>
          {scraperHealthData?.inBackoff ? (
            <span className="text-xs text-red-500 bg-red-500/10 border border-red-500/20 rounded-full px-2 py-0.5">
              {scraperHealthData.inBackoff} in backoff
            </span>
          ) : scraperHealthData ? (
            <span className="text-[11px] text-emerald-600/70">all active</span>
          ) : null}
        </div>
        <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${healthPanelOpen ? "rotate-90" : ""}`} />
      </button>

      {healthPanelOpen && (
        <div className="px-4 py-3" data-testid="scraper-health-panel">
          {!scraperHealthData ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : scraperHealthData.rows.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No failure data recorded yet. Scrapers will appear here after their first run.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Institution</th>
                    <th className="text-center px-3 py-2 font-medium text-muted-foreground">Failures</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Last Success</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Last Error</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Backoff Until</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {scraperHealthData.rows.map((row) => (
                    <tr
                      key={row.institution}
                      className={`border-b border-border/40 last:border-0 ${row.inBackoff ? "bg-red-500/5" : row.consecutiveFailures >= 1 ? "bg-amber-500/5" : ""}`}
                      data-testid={`scraper-health-row-${row.institution}`}
                    >
                      <td className="px-3 py-2 font-medium text-foreground max-w-[180px] truncate">{row.institution}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`font-bold tabular-nums ${row.consecutiveFailures >= 5 ? "text-red-500" : row.consecutiveFailures >= 1 ? "text-amber-500" : "text-muted-foreground"}`}>
                          {row.consecutiveFailures}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap" data-testid={`last-success-${row.institution}`}>
                        {row.lastSuccessAt
                          ? new Date(row.lastSuccessAt).toLocaleDateString()
                          : <span className="text-muted-foreground/40">never</span>}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground max-w-[260px] truncate" title={row.lastFailureReason ?? ""}>
                        {row.lastFailureReason ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                        {row.inBackoff && row.backoffUntil
                          ? <span className="text-red-500 font-medium">{new Date(row.backoffUntil).toLocaleDateString()}</span>
                          : row.backoffUntil
                            ? <span className="text-emerald-600">Expired</span>
                            : "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {(row.inBackoff || row.consecutiveFailures > 0) && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-[11px] px-2 border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                            onClick={() => clearBackoffMutation.mutate(row.institution)}
                            disabled={clearBackoffMutation.isPending && clearBackoffMutation.variables === row.institution}
                            data-testid={`button-clear-backoff-${row.institution}`}
                          >
                            {clearBackoffMutation.isPending && clearBackoffMutation.variables === row.institution
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : "Clear"}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );
}


interface EnrichmentStats {
  total: number;
  unknownCount: number;
  byField: { target: number; modality: number; indication: number; developmentStage: number };
}

interface EnrichmentStatus {
  status: "idle" | "running" | "done" | "error";
  processed: number;
  total: number;
  improved: number;
  resumed?: boolean;
  jobId?: number;
  error?: string;
}

interface DatasetQualityGlobal {
  total_relevant: number;
  scored_count: number;
  avg_score: number | null;
  tier_excellent: number;
  tier_good: number;
  tier_partial: number;
  tier_poor: number;
  tier_unscored: number;
  fill_target: number | null;
  fill_indication: number | null;
  fill_modality: number | null;
  fill_stage: number | null;
  fill_licensing: number | null;
  fill_patent: number | null;
  added_7d: number;
  added_30d: number;
}

interface InstitutionRow {
  institution: string;
  relevant_count: number;
  avg_completeness: number | null;
  fill_target: number | null;
  fill_indication: number | null;
}

interface DatasetQualityResponse {
  global: DatasetQualityGlobal;
  institutions: InstitutionRow[];
}

interface DrilldownAsset {
  id: number;
  asset_name: string;
  target: string | null;
  indication: string | null;
  modality: string | null;
  development_stage: string | null;
  completeness_score: number | null;
}

interface DimRow {
  value: string;
  count: number;
  avg_completeness: number | null;
  fill_target: number | null;
  fill_indication: number | null;
}

interface BrowsedAsset {
  id: number;
  asset_name: string;
  institution: string | null;
  target: string | null;
  indication: string | null;
  modality: string | null;
  development_stage: string | null;
  ip_type: string | null;
  licensing_readiness: string | null;
  completeness_score: number | null;
  mechanism_of_action: string | null;
  innovation_claim: string | null;
  unmet_need: string | null;
  comparable_drugs: string | null;
  source_url: string | null;
  abstract: string | null;
  summary: string | null;
  first_seen_at: string | null;
  enriched_at: string | null;
  patent_status: string | null;
  categories: string[] | null;
  inventors: string[] | null;
}

type AssetBrowserInit = { dim: "modality" | "stage" | "indication"; value: string } | null;

function computeLocalScore(
  fields: { target?: string; modality?: string; indication?: string; development_stage?: string; summary?: string; abstract?: string; innovation_claim?: string; mechanism_of_action?: string },
  nonEditablePts: number
): number {
  const pts = (v?: string, w = 0) => (v && v !== "unknown" && v.length >= 3 ? w : 0);
  return nonEditablePts +
    pts(fields.target, 15) + pts(fields.modality, 15) + pts(fields.indication, 15) +
    pts(fields.development_stage, 10) + pts(fields.summary, 10) + pts(fields.abstract, 10) +
    pts(fields.innovation_claim, 5) + pts(fields.mechanism_of_action, 5);
}

function getNonEditablePts(asset: BrowsedAsset): number {
  let pts = 0;
  if (asset.categories && asset.categories.length > 0) pts += 5;
  if (asset.inventors && asset.inventors.length > 0) pts += 5;
  if (asset.patent_status && asset.patent_status !== "unknown" && asset.patent_status.length >= 3) pts += 5;
  return pts;
}

function DimensionBreakdown({ pw, onFilterSelect }: { pw: string; onFilterSelect: (dim: "modality" | "stage" | "indication", value: string) => void }) {
  const [activeTab, setActiveTab] = useState<"modality" | "stage" | "indication">("modality");
  const [sortKey, setSortKey] = useState<"count" | "avg_completeness" | "fill_target" | "fill_indication">("count");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const { data, isLoading } = useQuery<{ dim: string; rows: DimRow[] }>({
    queryKey: ["/api/admin/dataset-quality/dimensions", pw, activeTab],
    queryFn: async () => {
      const res = await fetch(`/api/admin/dataset-quality/dimensions?dim=${activeTab}`, { headers: { "x-admin-password": pw } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const sorted = (data?.rows ?? []).slice().sort((a, b) => {
    const av = (a[sortKey] ?? 0) as number;
    const bv = (b[sortKey] ?? 0) as number;
    return sortDir === "desc" ? bv - av : av - bv;
  });

  const handleSort = (k: typeof sortKey) => {
    if (sortKey === k) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortKey(k); setSortDir("desc"); }
  };

  const DS = ({ k }: { k: typeof sortKey }) => {
    if (sortKey !== k) return <ArrowDown className="h-3 w-3 opacity-30" />;
    return sortDir === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />;
  };

  const exportCsv = () => {
    const a = document.createElement("a");
    a.href = `/api/admin/dataset-quality/dimensions/export?dim=${activeTab}&pw=${encodeURIComponent(pw)}`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const tabs = [
    { key: "modality" as const, label: "Modality" },
    { key: "stage" as const, label: "Dev Stage" },
    { key: "indication" as const, label: "Indication" },
  ];

  return (
    <div className="border border-border rounded-xl bg-card overflow-hidden">
      <div className="px-5 py-3 border-b border-border bg-muted/20 flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          Breakdown by Dimension
        </h3>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg overflow-hidden border border-border">
            {tabs.map(t => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${activeTab === t.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/50"}`}
                data-testid={`tab-dim-${t.key}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={exportCsv} className="gap-1.5 h-7 text-xs" data-testid="button-dim-export">
            <Download className="h-3 w-3" /> Export
          </Button>
        </div>
      </div>
      {isLoading ? (
        <div className="flex items-center gap-2 px-5 py-6 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading...
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/10">
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground capitalize">
                  {tabs.find(t => t.key === activeTab)?.label}
                </th>
                {([
                  { key: "count" as const, label: "Assets" },
                  { key: "avg_completeness" as const, label: "Avg Score" },
                  { key: "fill_target" as const, label: "Target %" },
                  { key: "fill_indication" as const, label: "Indication %" },
                ]).map(col => (
                  <th
                    key={col.key}
                    className="px-4 py-2 text-right text-xs font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground"
                    onClick={() => handleSort(col.key)}
                  >
                    <span className="inline-flex items-center gap-1 justify-end">{col.label} <DS k={col.key} /></span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, i) => (
                <tr
                  key={i}
                  className="border-b border-border cursor-pointer hover:bg-primary/5 transition-colors"
                  onClick={() => onFilterSelect(activeTab, row.value)}
                  title={`Filter Asset Browser by ${activeTab}: ${row.value}`}
                  data-testid={`row-dim-${i}`}
                >
                  <td className="px-4 py-2 text-xs font-medium text-foreground max-w-xs truncate">{row.value || "unknown"}</td>
                  <td className="px-4 py-2 text-xs tabular-nums text-right text-foreground">{row.count.toLocaleString()}</td>
                  <td className="px-4 py-2 text-xs tabular-nums text-right text-foreground">{row.avg_completeness ?? "—"}</td>
                  <td className="px-4 py-2 text-xs tabular-nums text-right text-foreground">{row.fill_target != null ? `${row.fill_target}%` : "—"}</td>
                  <td className="px-4 py-2 text-xs tabular-nums text-right text-foreground">{row.fill_indication != null ? `${row.fill_indication}%` : "—"}</td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-xs text-muted-foreground">No data</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <p className="px-5 py-2 text-xs text-muted-foreground border-t border-border">Click any row to pre-filter the Asset Browser below.</p>
    </div>
  );
}

function AssetEditorPanel({
  asset, editFields, setEditFields, liveScore, isPending, onSave, onCancel,
}: {
  asset: BrowsedAsset;
  editFields: Record<string, string>;
  setEditFields: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  liveScore: number;
  isPending: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copyUrl = () => {
    if (!asset.source_url) return;
    navigator.clipboard.writeText(asset.source_url).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 1500);
    });
  };

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setEditFields(prev => ({ ...prev, [k]: e.target.value }));

  const scoreColor = liveScore >= 80 ? "text-emerald-600 dark:text-emerald-400"
    : liveScore >= 60 ? "text-teal-600 dark:text-teal-400"
    : liveScore >= 40 ? "text-amber-600 dark:text-amber-400"
    : "text-orange-600 dark:text-orange-400";

  return (
    <div className="space-y-4">
      {asset.source_url && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30 border border-border">
          <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
          <a href={asset.source_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex-1 break-all">{asset.source_url}</a>
          <Button variant="outline" size="sm" onClick={copyUrl} className="gap-1.5 h-7 text-xs shrink-0" data-testid={`button-copy-url-${asset.id}`}>
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      )}

      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">Live completeness score:</span>
        <span className={`font-bold tabular-nums text-base ${scoreColor}`}>{liveScore}</span>
        <span className="text-muted-foreground">/ 100</span>
        {asset.completeness_score != null && liveScore !== asset.completeness_score && (
          <span className="text-muted-foreground/60">(was {asset.completeness_score})</span>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {([
          { key: "target", label: "Target" },
          { key: "indication", label: "Indication" },
          { key: "modality", label: "Modality" },
          { key: "development_stage", label: "Dev Stage" },
          { key: "ip_type", label: "IP Type" },
          { key: "licensing_readiness", label: "Licensing Readiness" },
          { key: "comparable_drugs", label: "Comparable Drugs" },
          { key: "unmet_need", label: "Unmet Need" },
        ] as { key: string; label: string }[]).map(f => (
          <div key={f.key} className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">{f.label}</label>
            <Input
              value={editFields[f.key] ?? ""}
              onChange={set(f.key)}
              className="h-7 text-xs"
              data-testid={`input-edit-${f.key}-${asset.id}`}
            />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {([
          { key: "mechanism_of_action", label: "Mechanism of Action", rows: 2 },
          { key: "innovation_claim", label: "Innovation Claim", rows: 2 },
          { key: "summary", label: "Summary", rows: 3 },
          { key: "abstract", label: "Abstract", rows: 4 },
        ] as { key: string; label: string; rows: number }[]).map(f => (
          <div key={f.key} className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">{f.label}</label>
            <Textarea
              value={editFields[f.key] ?? ""}
              onChange={set(f.key)}
              rows={f.rows}
              className="text-xs resize-none"
              data-testid={`textarea-edit-${f.key}-${asset.id}`}
            />
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button onClick={onSave} disabled={isPending} size="sm" className="gap-1.5" data-testid={`button-save-asset-${asset.id}`}>
          {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          Save Changes
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel} className="gap-1.5" data-testid={`button-cancel-edit-${asset.id}`}>
          <X className="h-3 w-3" /> Cancel
        </Button>
      </div>
    </div>
  );
}

function AssetBrowser({ pw, initialFilter }: { pw: string; initialFilter: AssetBrowserInit }) {
  const [institution, setInstitution] = useState("");
  const [modality, setModality] = useState("");
  const [stage, setStage] = useState("");
  const [indication, setIndication] = useState("");
  const [tier, setTier] = useState("");
  const [missing, setMissing] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<"score" | "name" | "date">("score");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editFields, setEditFields] = useState<Record<string, string>>({});
  const [savedId, setSavedId] = useState<number | null>(null);
  const [localAssets, setLocalAssets] = useState<BrowsedAsset[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    if (!initialFilter) return;
    if (initialFilter.dim === "modality") { setModality(initialFilter.value); setStage(""); setIndication(""); }
    else if (initialFilter.dim === "stage") { setStage(initialFilter.value); setModality(""); setIndication(""); }
    else if (initialFilter.dim === "indication") { setIndication(initialFilter.value); setModality(""); setStage(""); }
    setPage(1);
    setExpandedId(null);
  }, [initialFilter]);

  const filterValues = useQuery<{ modalities: string[]; stages: string[] }>({
    queryKey: ["/api/admin/assets/filter-values", pw],
    queryFn: async () => {
      const res = await fetch("/api/admin/assets/filter-values", { headers: { "x-admin-password": pw } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const buildParams = (extra: Record<string, string> = {}) => {
    const p: Record<string, string> = {};
    if (institution) p.institution = institution;
    if (modality) p.modality = modality;
    if (stage) p.stage = stage;
    if (indication) p.indication = indication;
    if (tier) p.tier = tier;
    if (missing) p.missing = missing;
    if (q) p.q = q;
    return new URLSearchParams({ ...p, ...extra }).toString();
  };

  const { data, isLoading } = useQuery<{ total: number; globalTotal: number; page: number; limit: number; assets: BrowsedAsset[] }>({
    queryKey: ["/api/admin/assets", pw, institution, modality, stage, indication, tier, missing, q, page, sort, dir],
    queryFn: async () => {
      const params = buildParams({ page: String(page), limit: "50", sort, dir });
      const res = await fetch(`/api/admin/assets?${params}`, { headers: { "x-admin-password": pw } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  useEffect(() => {
    if (data?.assets) setLocalAssets(data.assets);
  }, [data?.assets]);

  const patchAsset = useMutation({
    mutationFn: async ({ id, fields }: { id: number; fields: Record<string, string> }) => {
      const res = await fetch(`/api/admin/assets/${id}?pw=${encodeURIComponent(pw)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Patch failed"); }
      return res.json() as Promise<{ asset: BrowsedAsset }>;
    },
    onSuccess: ({ asset }) => {
      setLocalAssets(prev => prev.map(a => a.id === asset.id ? asset : a));
      setSavedId(asset.id);
      setExpandedId(null);
      setTimeout(() => setSavedId(null), 2500);
    },
    onError: (err: Error) => toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  const activeFilters = [institution, modality, stage, indication, tier, missing, q].filter(Boolean).length;
  const total = data?.total ?? 0;
  const globalTotal = data?.globalTotal ?? 0;
  const totalPages = Math.ceil(total / 50);

  const clearFilters = () => {
    setInstitution(""); setModality(""); setStage(""); setIndication("");
    setTier(""); setMissing(""); setQ(""); setPage(1);
  };

  const exportCsv = () => {
    const a = document.createElement("a");
    a.href = `/api/admin/assets/export?${buildParams({ pw })}`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const openEditor = (asset: BrowsedAsset) => {
    setExpandedId(asset.id);
    setEditFields({
      target: asset.target ?? "",
      indication: asset.indication ?? "",
      modality: asset.modality ?? "",
      development_stage: asset.development_stage ?? "",
      ip_type: asset.ip_type ?? "",
      licensing_readiness: asset.licensing_readiness ?? "",
      mechanism_of_action: asset.mechanism_of_action ?? "",
      innovation_claim: asset.innovation_claim ?? "",
      unmet_need: asset.unmet_need ?? "",
      comparable_drugs: asset.comparable_drugs ?? "",
      summary: asset.summary ?? "",
      abstract: asset.abstract ?? "",
    });
  };

  return (
    <div className="border border-border rounded-xl bg-card overflow-hidden">
      <div className="px-5 py-3 border-b border-border bg-muted/20 flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Layers className="h-4 w-4" />
          Asset Browser
          {activeFilters > 0 && (
            <Badge variant="secondary" className="text-xs ml-1">{activeFilters} filter{activeFilters > 1 ? "s" : ""}</Badge>
          )}
        </h3>
        <div className="flex items-center gap-2">
          {activeFilters > 0 && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1.5 h-7 text-xs" data-testid="button-clear-filters">
              <X className="h-3 w-3" /> Clear
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={exportCsv} className="gap-1.5 h-7 text-xs" data-testid="button-export-filtered">
            <Download className="h-3 w-3" /> Export filtered
          </Button>
        </div>
      </div>

      <div className="px-5 py-3 border-b border-border bg-muted/10 flex flex-wrap gap-2 items-center">
        <Input
          placeholder="Asset name..."
          value={q}
          onChange={e => { setQ(e.target.value); setPage(1); }}
          className="h-7 text-xs w-36"
          data-testid="input-browser-q"
        />
        <Input
          placeholder="Institution..."
          value={institution}
          onChange={e => { setInstitution(e.target.value); setPage(1); }}
          className="h-7 text-xs w-40"
          data-testid="input-browser-institution"
        />
        <Input
          placeholder="Indication..."
          value={indication}
          onChange={e => { setIndication(e.target.value); setPage(1); }}
          className="h-7 text-xs w-36"
          data-testid="input-browser-indication"
        />
        <Select value={modality || "__all__"} onValueChange={v => { setModality(v === "__all__" ? "" : v); setPage(1); }}>
          <SelectTrigger className="h-7 text-xs w-40" data-testid="select-browser-modality">
            <SelectValue placeholder="Modality..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All modalities</SelectItem>
            {(filterValues.data?.modalities ?? []).map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={stage || "__all__"} onValueChange={v => { setStage(v === "__all__" ? "" : v); setPage(1); }}>
          <SelectTrigger className="h-7 text-xs w-40" data-testid="select-browser-stage">
            <SelectValue placeholder="Dev Stage..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All stages</SelectItem>
            {(filterValues.data?.stages ?? []).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={tier || "__all__"} onValueChange={v => { setTier(v === "__all__" ? "" : v); setPage(1); }}>
          <SelectTrigger className="h-7 text-xs w-36" data-testid="select-browser-tier">
            <SelectValue placeholder="Tier..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All tiers</SelectItem>
            <SelectItem value="excellent">Excellent (80+)</SelectItem>
            <SelectItem value="good">Good (60-79)</SelectItem>
            <SelectItem value="partial">Partial (40-59)</SelectItem>
            <SelectItem value="poor">Poor (1-39)</SelectItem>
            <SelectItem value="unscored">Unscored</SelectItem>
          </SelectContent>
        </Select>
        <Select value={missing || "__all__"} onValueChange={v => { setMissing(v === "__all__" ? "" : v); setPage(1); }}>
          <SelectTrigger className="h-7 text-xs w-40" data-testid="select-browser-missing">
            <SelectValue placeholder="Missing field..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Any field state</SelectItem>
            <SelectItem value="target">Missing: Target</SelectItem>
            <SelectItem value="indication">Missing: Indication</SelectItem>
            <SelectItem value="modality">Missing: Modality</SelectItem>
            <SelectItem value="stage">Missing: Dev Stage</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="px-5 py-2 border-b border-border text-xs text-muted-foreground flex items-center justify-between">
        <span>
          {isLoading ? "Loading..." : `Showing ${total.toLocaleString()} of ${(globalTotal || total).toLocaleString()} relevant assets`}
        </span>
        <div className="flex items-center gap-1">
          <Select value={sort} onValueChange={v => { setSort(v as "score" | "name" | "date"); setPage(1); }}>
            <SelectTrigger className="h-6 text-xs w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="score">By score</SelectItem>
              <SelectItem value="name">By name</SelectItem>
              <SelectItem value="date">By date</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" onClick={() => setDir(d => d === "desc" ? "asc" : "desc")} className="h-6 w-6 p-0">
            {dir === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 px-5 py-8 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading assets...
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/10">
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Asset Name</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Institution</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Target</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Indication</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Modality</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Stage</th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">Score</th>
                <th className="px-4 py-2 text-center font-medium text-muted-foreground">URL</th>
                <th className="px-4 py-2 w-8" />
              </tr>
            </thead>
            <tbody>
              {localAssets.map(asset => {
                const isExpanded = expandedId === asset.id;
                const isSaved = savedId === asset.id;
                const nePts = getNonEditablePts(asset);
                const liveScore = isExpanded ? computeLocalScore(editFields, nePts) : 0;
                const score = asset.completeness_score;
                const scoreClass = score === null || score === 0 ? "text-muted-foreground"
                  : score >= 80 ? "text-emerald-600 dark:text-emerald-400"
                  : score >= 60 ? "text-teal-600 dark:text-teal-400"
                  : score >= 40 ? "text-amber-600 dark:text-amber-400"
                  : "text-orange-600 dark:text-orange-400";

                return (
                  <React.Fragment key={asset.id}>
                    <tr
                      className={`border-b border-border cursor-pointer transition-colors ${isSaved ? "bg-emerald-50 dark:bg-emerald-950/20" : isExpanded ? "bg-primary/5" : "hover:bg-muted/30"}`}
                      onClick={() => { if (isExpanded) { setExpandedId(null); } else { openEditor(asset); } }}
                      data-testid={`row-asset-${asset.id}`}
                    >
                      <td className="px-4 py-2 font-medium text-foreground max-w-[220px]">
                        <span className="block truncate">{asset.asset_name}</span>
                        {isSaved && <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mt-0.5"><Check className="h-3 w-3" /> Saved</span>}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground max-w-[130px] truncate">{asset.institution ?? "—"}</td>
                      <td className="px-4 py-2 text-muted-foreground max-w-[90px] truncate">{(!asset.target || asset.target === "unknown") ? <span className="opacity-40">—</span> : asset.target}</td>
                      <td className="px-4 py-2 text-muted-foreground max-w-[90px] truncate">{(!asset.indication || asset.indication === "unknown") ? <span className="opacity-40">—</span> : asset.indication}</td>
                      <td className="px-4 py-2 text-muted-foreground max-w-[90px] truncate">{(!asset.modality || asset.modality === "unknown") ? <span className="opacity-40">—</span> : asset.modality}</td>
                      <td className="px-4 py-2 text-muted-foreground max-w-[90px] truncate">{(!asset.development_stage || asset.development_stage === "unknown") ? <span className="opacity-40">—</span> : asset.development_stage}</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        <span className={`font-semibold ${scoreClass}`}>{score ?? "—"}</span>
                      </td>
                      <td className="px-4 py-2 text-center">
                        {asset.source_url ? (
                          <span className="inline-flex items-center gap-1">
                            <a
                              href={asset.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="text-muted-foreground hover:text-primary transition-colors"
                              data-testid={`link-source-${asset.id}`}
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                            <button
                              onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(asset.source_url!); }}
                              className="text-muted-foreground hover:text-primary transition-colors"
                              title="Copy URL"
                              data-testid={`button-copy-url-inline-${asset.id}`}
                            >
                              <Copy className="h-3 w-3" />
                            </button>
                          </span>
                        ) : <span className="opacity-30">—</span>}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="border-b border-border bg-muted/5">
                        <td colSpan={9} className="px-5 py-4">
                          <AssetEditorPanel
                            asset={asset}
                            editFields={editFields}
                            setEditFields={setEditFields}
                            liveScore={liveScore}
                            isPending={patchAsset.isPending}
                            onSave={() => patchAsset.mutate({ id: asset.id, fields: editFields })}
                            onCancel={() => setExpandedId(null)}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {localAssets.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-xs text-muted-foreground">No assets match these filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {total > 50 && (
        <div className="px-5 py-3 border-t border-border flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Page {page} of {totalPages.toLocaleString()}</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="h-7 px-3 text-xs">Prev</Button>
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="h-7 px-3 text-xs">Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function FieldBadge({ value }: { value: string | null }) {
  const isKnown = value && value !== "unknown" && value !== "";
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded ${isKnown ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}>
      {isKnown ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
      {isKnown ? (value!.length > 28 ? value!.slice(0, 28) + "…" : value!) : "unknown"}
    </span>
  );
}

function FillBar({ pct, color }: { pct: number | null; color: string }) {
  const p = pct ?? 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${p}%` }} />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground w-10 text-right">{pct !== null ? `${p}%` : "—"}</span>
    </div>
  );
}

function Enrichment({ pw }: { pw: string }) {
  const [polling, setPolling] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [institutionFilter, setInstitutionFilter] = useState("");
  const [institutionSortKey, setInstitutionSortKey] = useState<"relevant_count" | "avg_completeness" | "fill_target" | "fill_indication">("relevant_count");
  const [institutionSortDir, setInstitutionSortDir] = useState<"asc" | "desc">("desc");
  const [expandedInstitution, setExpandedInstitution] = useState<string | null>(null);
  const [browserPreFilter, setBrowserPreFilter] = useState<AssetBrowserInit>(null);
  const browserRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const handleFilterSelect = (dim: "modality" | "stage" | "indication", value: string) => {
    setBrowserPreFilter({ dim, value });
    setTimeout(() => browserRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  };

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery<EnrichmentStats>({
    queryKey: ["/api/admin/enrichment/stats", pw],
    queryFn: async () => {
      const res = await fetch("/api/admin/enrichment/stats", { headers: { "x-admin-password": pw } });
      if (!res.ok) throw new Error("Failed to load enrichment stats");
      return res.json();
    },
  });

  const { data: quality, isLoading: qualityLoading, refetch: refetchQuality } = useQuery<DatasetQualityResponse>({
    queryKey: ["/api/admin/dataset-quality", pw],
    queryFn: async () => {
      const res = await fetch("/api/admin/dataset-quality", { headers: { "x-admin-password": pw } });
      if (!res.ok) throw new Error("Failed to load dataset quality");
      return res.json();
    },
  });

  const { data: drilldown, isLoading: drilldownLoading } = useQuery<{ assets: DrilldownAsset[] }>({
    queryKey: ["/api/admin/dataset-quality/institution", expandedInstitution, pw],
    queryFn: async () => {
      const res = await fetch(`/api/admin/dataset-quality/institution/${encodeURIComponent(expandedInstitution!)}`, {
        headers: { "x-admin-password": pw },
      });
      if (!res.ok) throw new Error("Failed to load institution assets");
      return res.json();
    },
    enabled: expandedInstitution !== null,
  });

  const { data: status, refetch: refetchStatus } = useQuery<EnrichmentStatus>({
    queryKey: ["/api/admin/enrichment/status", pw],
    queryFn: async () => {
      const res = await fetch("/api/admin/enrichment/status", { headers: { "x-admin-password": pw } });
      if (!res.ok) throw new Error("Failed to load enrichment status");
      return res.json();
    },
    refetchInterval: polling ? 1500 : false,
  });

  const prevStatusRef = useRef<string | undefined>();
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status?.status;
    if (status?.status === "running" && !polling) setPolling(true);
    if (prev === "running" && (status?.status === "done" || status?.status === "error")) {
      setPolling(false);
      refetchStats();
      refetchQuality();
      if (status.status === "done") {
        toast({ title: "Enrichment complete", description: `${status.improved} assets improved out of ${status.total} processed` });
      } else {
        toast({ title: "Enrichment failed", description: status.error ?? "Unknown error", variant: "destructive" });
      }
    }
  }, [status?.status]);

  const runEnrichment = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/enrichment/run", { method: "POST", headers: { "x-admin-password": pw } });
      if (!res.ok) { const data = await res.json(); throw new Error(data.error || "Failed to start"); }
      return res.json();
    },
    onSuccess: () => { setPolling(true); refetchStatus(); toast({ title: "Enrichment started", description: "Running GPT-4o-mini pass on incomplete assets..." }); },
    onError: (err: Error) => toast({ title: "Failed to start", description: err.message, variant: "destructive" }),
  });

  const stopEnrichment = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/enrichment/stop", { method: "POST", headers: { "x-admin-password": pw } });
      if (!res.ok) { const data = await res.json(); throw new Error(data.error || "Failed to stop"); }
      return res.json();
    },
    onSuccess: () => { toast({ title: "Stop signal sent", description: "Field enrichment will halt after current batch" }); refetchStatus(); },
    onError: (err: Error) => toast({ title: "Failed to stop", description: err.message, variant: "destructive" }),
  });

  const dismissError = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/enrichment/reset", { method: "POST", headers: { "x-admin-password": pw } });
      if (!res.ok) { const data = await res.json(); throw new Error(data.error || "Failed to dismiss"); }
      return res.json();
    },
    onSuccess: () => { refetchStatus(); toast({ title: "Error dismissed", description: "Enrichment status cleared" }); },
    onError: (err: Error) => toast({ title: "Failed to dismiss", description: err.message, variant: "destructive" }),
  });

  const isRunning = status?.status === "running";
  const isResumed = status?.resumed === true;
  const unknownCount = stats?.unknownCount ?? 0;
  const totalAssets = stats?.total ?? 0;
  const costEstimate = unknownCount * 0.0003;
  const progressPct = status && status.total > 0 ? Math.round((status.processed / status.total) * 100) : 0;

  const g = quality?.global;
  const totalRelevant = g?.total_relevant ?? 0;
  const scoredPct = totalRelevant > 0 && g ? Math.round((g.scored_count / totalRelevant) * 100) : 0;
  const tierTotal = totalRelevant || 1;

  const tiers = [
    { label: "Excellent", key: "tier_excellent" as const, color: "bg-emerald-500", textColor: "text-emerald-700 dark:text-emerald-400", bgColor: "bg-emerald-50 dark:bg-emerald-950/30" },
    { label: "Good", key: "tier_good" as const, color: "bg-teal-400", textColor: "text-teal-700 dark:text-teal-400", bgColor: "bg-teal-50 dark:bg-teal-950/30" },
    { label: "Partial", key: "tier_partial" as const, color: "bg-amber-400", textColor: "text-amber-700 dark:text-amber-400", bgColor: "bg-amber-50 dark:bg-amber-950/30" },
    { label: "Poor", key: "tier_poor" as const, color: "bg-orange-400", textColor: "text-orange-700 dark:text-orange-400", bgColor: "bg-orange-50 dark:bg-orange-950/30" },
    { label: "Unscored", key: "tier_unscored" as const, color: "bg-muted-foreground/30", textColor: "text-muted-foreground", bgColor: "bg-muted/30" },
  ];

  const fieldRows = [
    { label: "Target", key: "fill_target" as const, color: "bg-violet-500" },
    { label: "Indication", key: "fill_indication" as const, color: "bg-blue-500" },
    { label: "Modality", key: "fill_modality" as const, color: "bg-indigo-500" },
    { label: "Dev Stage", key: "fill_stage" as const, color: "bg-teal-500" },
    { label: "Licensing", key: "fill_licensing" as const, color: "bg-amber-500" },
    { label: "Patent / IP", key: "fill_patent" as const, color: "bg-orange-500" },
  ];

  const filteredInstitutions = (quality?.institutions ?? [])
    .filter(r => r.institution.toLowerCase().includes(institutionFilter.toLowerCase()))
    .sort((a, b) => {
      const aVal = (a[institutionSortKey] ?? 0) as number;
      const bVal = (b[institutionSortKey] ?? 0) as number;
      return institutionSortDir === "desc" ? bVal - aVal : aVal - bVal;
    });

  const handleSort = (key: typeof institutionSortKey) => {
    if (institutionSortKey === key) {
      setInstitutionSortDir(d => d === "desc" ? "asc" : "desc");
    } else {
      setInstitutionSortKey(key);
      setInstitutionSortDir("desc");
    }
  };

  const SortIcon = ({ k }: { k: typeof institutionSortKey }) => {
    if (institutionSortKey !== k) return <ArrowDown className="h-3 w-3 opacity-30" />;
    return institutionSortDir === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />;
  };

  const downloadCsv = (path: string) => {
    const a = document.createElement("a");
    a.href = `${path}?pw=${encodeURIComponent(pw)}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  if (statsLoading || qualityLoading) {
    return (
      <div className="flex items-center justify-center py-20" data-testid="enrichment-loading">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="enrichment-tab">

      {/* ── Headline Stats ── */}
      {g && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="rounded-xl border border-border bg-card p-4 text-center">
            <div className="text-2xl font-bold tabular-nums text-foreground" data-testid="stat-relevant-total">{totalRelevant.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground mt-1">Relevant Assets</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 text-center">
            <div className="text-2xl font-bold tabular-nums text-primary" data-testid="stat-scored-pct">{scoredPct}%</div>
            <div className="text-xs text-muted-foreground mt-1">Have Completeness Score</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 text-center">
            <div className="text-2xl font-bold tabular-nums text-foreground" data-testid="stat-avg-score">{g.avg_score !== null ? g.avg_score : "—"}</div>
            <div className="text-xs text-muted-foreground mt-1">Avg Completeness</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 text-center">
            <div className="text-2xl font-bold tabular-nums text-foreground" data-testid="stat-added-30d">{g.added_30d.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground mt-1">
              Added (30d) <span className="text-muted-foreground/60">/ {g.added_7d.toLocaleString()} (7d)</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Completeness Tier Distribution ── */}
      {g && (
        <div className="border border-border rounded-xl bg-card overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-muted/20">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Completeness Tiers
            </h3>
          </div>
          <div className="px-5 py-4 space-y-3">
            <div className="flex h-4 rounded-full overflow-hidden w-full gap-px">
              {tiers.map(t => {
                const count = g[t.key];
                const w = Math.round((count / tierTotal) * 100);
                return w > 0 ? (
                  <div
                    key={t.key}
                    className={`${t.color} transition-all`}
                    style={{ width: `${w}%` }}
                    title={`${t.label}: ${count.toLocaleString()} (${w}%)`}
                  />
                ) : null;
              })}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {tiers.map(t => {
                const count = g[t.key];
                const pct = Math.round((count / tierTotal) * 100);
                return (
                  <div key={t.key} className={`rounded-lg p-2 text-center ${t.bgColor}`}>
                    <div className={`text-base font-bold tabular-nums ${t.textColor}`} data-testid={`tier-${t.key}`}>{count.toLocaleString()}</div>
                    <div className={`text-xs ${t.textColor} opacity-80`}>{t.label}</div>
                    <div className="text-xs text-muted-foreground">{pct}%</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Field Fill Rates ── */}
      {g && (
        <div className="border border-border rounded-xl bg-card overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-muted/20">
            <h3 className="text-sm font-semibold text-foreground">Field Fill Rates (relevant assets only)</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-border">
            {fieldRows.map(f => (
              <div key={f.key} className="bg-card px-4 py-3 space-y-1.5">
                <div className="text-xs font-medium text-foreground">{f.label}</div>
                <FillBar pct={g[f.key] !== undefined && g[f.key] !== null ? Number(g[f.key]) : null} color={f.color} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Breakdown by Dimension ── */}
      <DimensionBreakdown pw={pw} onFilterSelect={handleFilterSelect} />

      {/* ── Institution Quality Table ── */}
      {quality && (
        <div className="border border-border rounded-xl bg-card overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-muted/20 flex items-center justify-between gap-3 flex-wrap">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Institution Quality ({filteredInstitutions.length})
            </h3>
            <Input
              placeholder="Filter by name..."
              value={institutionFilter}
              onChange={e => setInstitutionFilter(e.target.value)}
              className="h-7 text-xs w-44"
              data-testid="input-institution-filter"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/10">
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Institution</th>
                  {([
                    { key: "relevant_count" as const, label: "Assets" },
                    { key: "avg_completeness" as const, label: "Avg Score" },
                    { key: "fill_target" as const, label: "Target %" },
                    { key: "fill_indication" as const, label: "Indication %" },
                  ]).map(col => (
                    <th
                      key={col.key}
                      className="px-4 py-2 text-right text-xs font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground"
                      onClick={() => handleSort(col.key)}
                    >
                      <span className="inline-flex items-center gap-1 justify-end">
                        {col.label} <SortIcon k={col.key} />
                      </span>
                    </th>
                  ))}
                  <th className="px-4 py-2 w-8" />
                </tr>
              </thead>
              <tbody>
                {filteredInstitutions.map(row => {
                  const isExpanded = expandedInstitution === row.institution;
                  return (
                    <React.Fragment key={row.institution}>
                      <tr
                        className={`border-b border-border cursor-pointer transition-colors ${isExpanded ? "bg-primary/5" : "hover:bg-muted/30"}`}
                        onClick={() => setExpandedInstitution(isExpanded ? null : row.institution)}
                        data-testid={`row-institution-${row.institution}`}
                      >
                        <td className="px-4 py-2.5 text-xs font-medium text-foreground max-w-xs truncate">{row.institution}</td>
                        <td className="px-4 py-2.5 text-xs tabular-nums text-right text-foreground">{row.relevant_count.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-xs tabular-nums text-right text-foreground">{row.avg_completeness !== null ? row.avg_completeness : "—"}</td>
                        <td className="px-4 py-2.5 text-xs tabular-nums text-right text-foreground">{row.fill_target !== null ? `${row.fill_target}%` : "—"}</td>
                        <td className="px-4 py-2.5 text-xs tabular-nums text-right text-foreground">{row.fill_indication !== null ? `${row.fill_indication}%` : "—"}</td>
                        <td className="px-4 py-2.5 text-right">
                          <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="border-b border-border bg-muted/5">
                          <td colSpan={6} className="px-4 py-3">
                            {drilldownLoading ? (
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Loader2 className="h-3 w-3 animate-spin" /> Loading...
                              </div>
                            ) : drilldown?.assets && drilldown.assets.length > 0 ? (
                              <div className="space-y-2">
                                <p className="text-xs text-muted-foreground mb-2">5 lowest-completeness relevant assets:</p>
                                {drilldown.assets.map(asset => (
                                  <div key={asset.id} className="rounded-lg border border-border bg-card p-3 space-y-1.5">
                                    <div className="text-xs font-medium text-foreground truncate">{asset.asset_name}</div>
                                    <div className="flex flex-wrap gap-1.5">
                                      <FieldBadge value={asset.target} />
                                      <FieldBadge value={asset.indication} />
                                      <FieldBadge value={asset.modality} />
                                      <FieldBadge value={asset.development_stage} />
                                      {asset.completeness_score !== null && (
                                        <span className="inline-flex items-center text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                          Score: {asset.completeness_score}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground">No assets found.</p>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Asset Browser ── */}
      <div ref={browserRef}>
        <AssetBrowser pw={pw} initialFilter={browserPreFilter} />
      </div>

      {/* ── CSV Exports ── */}
      {quality && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadCsv("/api/admin/export/unenriched-csv")}
            className="gap-2"
            data-testid="button-export-unenriched"
          >
            <Download className="h-4 w-4" />
            Export Unenriched (relevant only)
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadCsv("/api/admin/export/full-relevant-csv")}
            className="gap-2"
            data-testid="button-export-full"
          >
            <Download className="h-4 w-4" />
            Export All Relevant Assets
          </Button>
        </div>
      )}

      {/* ── Enrichment Controls (collapsible) ── */}
      <div className="border border-border rounded-xl bg-card overflow-hidden">
        <button
          className="w-full px-5 py-3 flex items-center justify-between bg-muted/20 hover:bg-muted/40 transition-colors text-left"
          onClick={() => setControlsOpen(o => !o)}
          data-testid="button-toggle-controls"
        >
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Enrichment Controls
            {isRunning && <span className="text-xs font-normal text-primary ml-1">(running...)</span>}
          </h3>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${controlsOpen ? "rotate-180" : ""}`} />
        </button>
        {controlsOpen && (
          <div className="px-5 py-4 space-y-4 border-t border-border">
            <p className="text-xs text-muted-foreground">AI enrichment for assets with unknown fields (resumable, auto-recovers after restart)</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="rounded-xl border border-border bg-background p-4 text-center">
                <div className="text-2xl font-bold tabular-nums text-foreground" data-testid="stat-total-assets">{totalAssets.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground mt-1">Total Assets (DB)</div>
              </div>
              <div className="rounded-xl border border-border bg-background p-4 text-center">
                <div className="text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400" data-testid="stat-unknown-count">{unknownCount.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground mt-1">With Unknown Fields</div>
              </div>
              <div className="rounded-xl border border-border bg-background p-4 text-center">
                <div className="text-2xl font-bold tabular-nums text-foreground" data-testid="stat-complete-count">{(totalAssets - unknownCount).toLocaleString()}</div>
                <div className="text-xs text-muted-foreground mt-1">Fully Enriched</div>
              </div>
              <div className="rounded-xl border border-border bg-background p-4 text-center">
                <div className="text-2xl font-bold tabular-nums text-foreground" data-testid="stat-completion-rate">
                  {totalAssets > 0 ? Math.round(((totalAssets - unknownCount) / totalAssets) * 100) : 0}%
                </div>
                <div className="text-xs text-muted-foreground mt-1">Completion Rate</div>
              </div>
            </div>

            {stats && unknownCount > 0 && (
              <div className="border border-border rounded-xl bg-background overflow-hidden">
                <div className="px-4 py-2.5 border-b border-border bg-muted/20">
                  <h4 className="text-xs font-semibold text-foreground">Per-Field Unknown Counts</h4>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border">
                  {[
                    { label: "Target", val: stats.byField.target, testId: "stat-unknown-target" },
                    { label: "Modality", val: stats.byField.modality, testId: "stat-unknown-modality" },
                    { label: "Indication", val: stats.byField.indication, testId: "stat-unknown-indication" },
                    { label: "Dev Stage", val: stats.byField.developmentStage, testId: "stat-unknown-stage" },
                  ].map(f => (
                    <div key={f.label} className="bg-background p-3 text-center">
                      <div className="text-lg font-bold tabular-nums text-foreground" data-testid={f.testId}>{f.val.toLocaleString()}</div>
                      <div className="text-xs text-muted-foreground">{f.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-background">
              <div>
                <div className="text-sm font-medium text-foreground">GPT-4o-mini Enrichment</div>
                <div className="text-xs text-muted-foreground">{unknownCount.toLocaleString()} assets &times; ~$0.0003/asset</div>
              </div>
              <div className="text-lg font-bold tabular-nums text-foreground" data-testid="cost-estimate">~${costEstimate.toFixed(2)}</div>
            </div>

            <div className="flex items-center gap-3">
              <Button
                onClick={() => runEnrichment.mutate()}
                disabled={isRunning || unknownCount === 0 || runEnrichment.isPending}
                className="flex-1"
                data-testid="button-run-enrichment"
              >
                {isRunning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                Run Enrichment (mini)
              </Button>
            </div>

            {isRunning && status && (
              <div className="border border-border rounded-xl bg-background p-5 space-y-3" data-testid="enrichment-progress">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-sm font-medium text-foreground">
                    Field Enrichment (GPT-4o-mini){isResumed ? " — resuming from checkpoint" : ""}
                  </span>
                  <span className="text-sm tabular-nums text-muted-foreground ml-auto" data-testid="enrichment-progress-text">
                    {status.processed.toLocaleString()}/{status.total.toLocaleString()} ({progressPct}%)
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => stopEnrichment.mutate()}
                    disabled={stopEnrichment.isPending}
                    className="h-7 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                    data-testid="button-enrichment-stop"
                  >
                    {stopEnrichment.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Stop"}
                  </Button>
                </div>
                <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
                  <div
                    className="bg-primary h-2.5 rounded-full transition-all duration-500"
                    style={{ width: `${progressPct}%` }}
                    data-testid="enrichment-progress-bar"
                  />
                </div>
                <p className="text-xs text-muted-foreground">{status.improved.toLocaleString()} assets improved so far</p>
              </div>
            )}

            {status?.status === "done" && (
              <div className="flex items-start gap-3 p-4 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30" data-testid="enrichment-done">
                <CheckCircle2 className="h-5 w-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Enrichment complete</p>
                  <p className="text-xs text-emerald-600 dark:text-emerald-500 mt-1">{status.improved} out of {status.total} assets improved</p>
                </div>
              </div>
            )}

            {status?.status === "error" && (
              <div className="flex items-start gap-3 p-4 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30" data-testid="enrichment-error">
                <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-red-700 dark:text-red-400">Last enrichment job failed</p>
                  <p className="text-xs text-red-600 dark:text-red-500 mt-1">{status.error ?? "The job ended with an error. Dismiss to return to idle."}</p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200 shrink-0"
                  onClick={() => dismissError.mutate()}
                  disabled={dismissError.isPending}
                  data-testid="button-dismiss-enrichment-error"
                >
                  {dismissError.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Dismiss"}
                </Button>
              </div>
            )}

            {unknownCount === 0 && totalAssets > 0 && (
              <div className="text-center py-6 text-muted-foreground" data-testid="enrichment-all-complete">
                <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm font-medium">All assets fully enriched</p>
                <p className="text-xs mt-1">No unknown fields remaining.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function IndustryProjectsQueue({ pw }: { pw: string }) {
  const { toast } = useToast();

  type IndustryProject = {
    id: number;
    title: string;
    discoveryTitle: string | null;
    researchArea: string | null;
    status: string;
    adminStatus: string;
    publishToIndustry: boolean | null;
    discoverySummary: string | null;
    projectUrl: string | null;
    lastEditedAt: string;
    openForCollaboration: boolean | null;
    developmentStage: string | null;
  };

  const { data, isLoading, refetch } = useQuery<{ projects: IndustryProject[] }>({
    queryKey: ["/api/admin/industry-projects"],
    queryFn: async () => {
      const res = await fetch("/api/admin/industry-projects", {
        headers: { "x-admin-password": pw },
      });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    staleTime: 0,
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, adminStatus }: { id: number; adminStatus: string }) => {
      const res = await fetch(`/api/admin/industry-projects/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-password": pw },
        body: JSON.stringify({ adminStatus }),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: (_, vars) => {
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/industry/projects"] });
      const label = vars.adminStatus === "published" ? "Published to EdenLab" : vars.adminStatus === "rejected" ? "Rejected" : "Reset to Pending";
      toast({ title: label, description: "Project status updated." });
    },
    onError: () => toast({ title: "Error", description: "Could not update status.", variant: "destructive" }),
  });

  const projects = data?.projects ?? [];
  const pending = projects.filter((p) => p.adminStatus === "pending");
  const published = projects.filter((p) => p.adminStatus === "published");
  const rejected = projects.filter((p) => p.adminStatus === "rejected");

  if (isLoading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading projects...</div>;
  }

  if (projects.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground" data-testid="industry-projects-empty">
        <FlaskConical className="h-10 w-10 mx-auto mb-3 opacity-30" />
        <p className="text-base font-medium">No research projects yet</p>
        <p className="text-sm mt-1">Projects created in the EdenLab research portal will appear here for review.</p>
      </div>
    );
  }

  function ProjectRow({ project }: { project: IndustryProject }) {
    const isPending = project.adminStatus === "pending";
    const isPublished = project.adminStatus === "published";
    const isRejected = project.adminStatus === "rejected";
    const statusBadge = isPublished
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
      : isRejected
      ? "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20"
      : "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30";
    const statusLabel = isPublished ? "Published" : isRejected ? "Rejected" : "Pending";
    return (
      <div className="p-4 border-b border-border last:border-0" data-testid={`industry-project-row-${project.id}`}>
        <div className="flex items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-semibold ${statusBadge}`} data-testid={`badge-project-status-${project.id}`}>{statusLabel}</span>
              <span className="text-sm font-semibold text-foreground">{project.discoveryTitle || project.title}</span>
              {project.researchArea && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-600 dark:text-violet-400">{project.researchArea}</span>
              )}
              {project.developmentStage && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{project.developmentStage}</span>
              )}
              {project.openForCollaboration && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">Open to Collab</span>
              )}
            </div>
            {project.discoverySummary && (
              <p className="text-xs text-muted-foreground line-clamp-2 mb-1">{project.discoverySummary}</p>
            )}
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
              <span className="capitalize">{project.status}</span>
              <span>·</span>
              <span>{new Date(project.lastEditedAt).toLocaleDateString()}</span>
              {project.projectUrl && (
                <>
                  <span>·</span>
                  <a href={project.projectUrl} target="_blank" rel="noopener noreferrer" className="hover:underline text-primary">Source</a>
                </>
              )}
            </div>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            {isPending && (
              <>
                <Button
                  size="sm"
                  className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => updateStatus.mutate({ id: project.id, adminStatus: "published" })}
                  disabled={updateStatus.isPending}
                  data-testid={`button-publish-project-${project.id}`}
                >
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Publish
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50 dark:hover:bg-red-950/30"
                  onClick={() => updateStatus.mutate({ id: project.id, adminStatus: "rejected" })}
                  disabled={updateStatus.isPending}
                  data-testid={`button-reject-project-${project.id}`}
                >
                  <XCircle className="h-3 w-3 mr-1" /> Reject
                </Button>
              </>
            )}
            {isPublished && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => updateStatus.mutate({ id: project.id, adminStatus: "pending" })}
                disabled={updateStatus.isPending}
                data-testid={`button-unpublish-project-${project.id}`}
              >
                <XCircle className="h-3 w-3 mr-1" /> Unpublish
              </Button>
            )}
            {isRejected && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => updateStatus.mutate({ id: project.id, adminStatus: "pending" })}
                disabled={updateStatus.isPending}
                data-testid={`button-restore-project-${project.id}`}
              >
                <RefreshCw className="h-3 w-3 mr-1" /> Restore
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="industry-projects-queue">
      {pending.length > 0 && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-900 bg-card overflow-hidden" data-testid="section-pending-projects">
          <div className="px-4 py-2.5 border-b border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-amber-600" />
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">Pending Review ({pending.length})</span>
          </div>
          {pending.map((p) => <ProjectRow key={p.id} project={p} />)}
        </div>
      )}

      {published.length > 0 && (
        <div className="rounded-lg border border-emerald-200 dark:border-emerald-900 bg-card overflow-hidden" data-testid="section-published-projects">
          <div className="px-4 py-2.5 border-b border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 flex items-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Published to EdenLab ({published.length})</span>
          </div>
          {published.map((p) => <ProjectRow key={p.id} project={p} />)}
        </div>
      )}

      {rejected.length > 0 && (
        <div className="rounded-lg border border-border bg-card overflow-hidden" data-testid="section-rejected-projects">
          <div className="px-4 py-2.5 border-b border-border bg-muted/30 flex items-center gap-2">
            <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground">Rejected ({rejected.length})</span>
          </div>
          {rejected.map((p) => <ProjectRow key={p.id} project={p} />)}
        </div>
      )}
    </div>
  );
}

function parseCsv(text: string): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  let i = 0;
  const len = text.length;

  function parseField(): string {
    if (i < len && text[i] === '"') {
      i++;
      let val = "";
      while (i < len) {
        if (text[i] === '"') {
          i++;
          if (i < len && text[i] === '"') { val += '"'; i++; }
          else break;
        } else {
          val += text[i++];
        }
      }
      return val;
    }
    let val = "";
    while (i < len && text[i] !== "," && text[i] !== "\n" && text[i] !== "\r") val += text[i++];
    return val;
  }

  function parseLine(): string[] {
    const fields: string[] = [];
    while (i < len && text[i] !== "\n" && text[i] !== "\r") {
      fields.push(parseField());
      if (i < len && text[i] === ",") i++;
    }
    if (i < len && text[i] === "\r") i++;
    if (i < len && text[i] === "\n") i++;
    return fields;
  }

  const headers = parseLine();
  while (i < len) {
    const line = parseLine();
    if (line.every((f) => f === "")) continue;
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => { obj[h] = line[idx] ?? ""; });
    rows.push(obj);
  }
  return rows;
}

function BulkCsvImport({ pw }: { pw: string }) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsedRows, setParsedRows] = useState<Record<string, string>[] | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<{ updated: number; skipped: number; validationSkipped: number; skippedDetails: Array<{ index: number; id?: number; reason: string }> } | null>(null);
  const [importing, setImporting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const CSV_FIELDS = ["id","assetName","institution","summary","abstract","target","modality","indication","developmentStage","categories","mechanismOfAction","innovationClaim","unmetNeed","comparableDrugs","licensingReadiness","ipType","completenessScore"] as const;

  function handleFile(file: File) {
    setResult(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      try {
        const rows = parseCsv(text);
        if (!rows.length || !("id" in rows[0])) {
          toast({ title: "Invalid CSV", description: "File must have an 'id' column header.", variant: "destructive" });
          return;
        }
        setParsedRows(rows);
        setFileName(file.name);
      } catch {
        toast({ title: "Parse error", description: "Could not parse CSV file.", variant: "destructive" });
      }
    };
    reader.readAsText(file);
  }

  function buildRows(rawRows: Record<string, string>[]) {
    return rawRows.map((r) => {
      const id = parseInt(r.id, 10);
      const obj: Record<string, unknown> = { id };
      for (const f of CSV_FIELDS) {
        if (f === "id") continue;
        const v = r[f]?.trim();
        if (!v) continue;
        if (f === "categories") {
          try { obj[f] = JSON.parse(v); } catch { obj[f] = v.split(";").map((s) => s.trim()).filter(Boolean); }
        } else if (f === "completenessScore") {
          const n = parseFloat(v);
          if (!isNaN(n)) obj[f] = n;
        } else {
          obj[f] = v;
        }
      }
      return obj;
    });
  }

  function fieldCoverage(rawRows: Record<string, string>[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const f of CSV_FIELDS) {
      if (f === "id") continue;
      counts[f] = rawRows.filter((r) => r[f] && r[f].trim() !== "").length;
    }
    return counts;
  }

  async function handleImport() {
    if (!parsedRows) return;
    setImporting(true);
    setResult(null);
    try {
      const rows = buildRows(parsedRows);
      const res = await fetch(`/api/admin/assets/bulk-update?pw=${pw}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rows),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      setResult({
        updated: data.updated,
        skipped: data.skipped,
        validationSkipped: data.validationSkipped ?? 0,
        skippedDetails: data.skippedDetails ?? [],
      });
      setParsedRows(null);
      setFileName(null);
      toast({ title: "Import complete", description: `${data.updated} assets updated.` });
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  }

  const previewRows = parsedRows?.slice(0, 10) ?? [];
  const previewCols = ["id", "assetName", "institution", "target", "modality", "developmentStage", "completenessScore"];
  const willUpdateCount = parsedRows
    ? parsedRows.filter((r) => {
        const id = parseInt(r.id, 10);
        if (isNaN(id)) return false;
        return CSV_FIELDS.some((f) => f !== "id" && r[f] && r[f].trim() !== "");
      }).length
    : 0;

  return (
    <div className="rounded-xl border border-border bg-card p-6 mb-6" data-testid="bulk-csv-import-panel">
      <div className="flex items-center gap-2 mb-1">
        <FileText className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-base font-semibold text-foreground">CSV Bulk Import</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Export relevant assets to CSV, enrich fields externally (e.g. with GPT-4o), then re-import. Only non-empty fields are written; id must match an existing asset.
      </p>

      <div className="flex flex-wrap items-center gap-3 mb-3">
        <a
          href={`/api/admin/assets/export-csv?pw=${pw}`}
          download
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-muted hover:bg-muted/80 border border-border text-foreground transition-colors"
          data-testid="link-export-enrichment-csv"
        >
          <Download className="h-3.5 w-3.5" />
          Export Enrichment CSV
        </a>
      </div>

      {/* Drag-and-drop dropzone */}
      <div
        className={`mb-4 rounded-lg border-2 border-dashed transition-colors cursor-pointer ${isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/20"}`}
        data-testid="dropzone-csv"
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f) handleFile(f);
        }}
      >
        <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
          <Upload className={`h-6 w-6 ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
          <p className="text-xs font-medium text-foreground">
            {fileName ? `Re-upload CSV (current: ${fileName})` : "Drop enriched CSV here or click to browse"}
          </p>
          <p className="text-xs text-muted-foreground">Accepts .csv files up to 50,000 rows</p>
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        data-testid="input-csv-file"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
      />

      {result && (
        <div className="mb-4 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20 text-xs text-green-800 dark:text-green-300 overflow-hidden" data-testid="text-import-result">
          <div className="flex items-center gap-2 px-3 py-2">
            <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
            <span>Last import: <span className="font-semibold">{result.updated}</span> assets updated, <span className="font-semibold">{result.skipped}</span> skipped{result.validationSkipped > 0 ? ` (${result.validationSkipped} failed validation)` : ""}.</span>
          </div>
          {result.skippedDetails.length > 0 && (
            <div className="border-t border-green-200 dark:border-green-800 px-3 py-2 space-y-0.5" data-testid="text-skipped-details">
              <p className="font-semibold mb-1">Skipped rows (first {result.skippedDetails.length}):</p>
              {result.skippedDetails.map((d, i) => (
                <p key={i} className="font-mono">{d.index >= 0 ? `Row ${d.index + 1}` : "—"}{d.id !== undefined ? ` (id=${d.id})` : ""}: {d.reason}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {parsedRows && parsedRows.length > 0 && (
        <div data-testid="csv-preview-section">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-foreground space-y-0.5">
              <p className="font-medium">{parsedRows.length.toLocaleString()} rows, {Object.keys(parsedRows[0] ?? {}).length} columns from <span className="font-semibold">{fileName}</span></p>
              <p className="text-muted-foreground"><span className="font-semibold text-foreground" data-testid="text-will-update-count">{willUpdateCount.toLocaleString()}</span> rows will be updated (valid id + at least one non-empty field)</p>
            </div>
            <Button
              size="sm"
              className="text-xs h-7"
              onClick={handleImport}
              disabled={importing || willUpdateCount === 0}
              data-testid="button-confirm-import"
            >
              {importing ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <ArrowUpCircle className="h-3.5 w-3.5 mr-1.5" />}
              {importing ? "Importing…" : `Import ${willUpdateCount.toLocaleString()} rows`}
            </Button>
          </div>

          {/* Field coverage summary */}
          <div className="mb-3 p-3 rounded-lg bg-muted/30 border border-border text-xs" data-testid="field-coverage-summary">
            <p className="font-semibold text-foreground mb-1.5">Fields to be written (non-empty counts):</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
              {Object.entries(fieldCoverage(parsedRows)).map(([field, count]) => count > 0 && (
                <span key={field}>
                  <span className="text-foreground font-medium">{field}</span>: {count.toLocaleString()}
                </span>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border text-xs">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-muted/40 border-b border-border">
                  {previewCols.map((col) => (
                    <th key={col} className="px-3 py-2 text-left font-semibold text-foreground whitespace-nowrap">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, idx) => (
                  <tr key={idx} className="border-b border-border last:border-0 hover:bg-muted/20" data-testid={`row-csv-preview-${idx}`}>
                    {previewCols.map((col) => (
                      <td key={col} className="px-3 py-1.5 text-muted-foreground max-w-[200px] truncate" title={row[col]}>
                        {row[col] || <span className="text-border italic">empty</span>}
                      </td>
                    ))}
                  </tr>
                ))}
                {parsedRows.length > 10 && (
                  <tr>
                    <td colSpan={previewCols.length} className="px-3 py-1.5 text-center text-muted-foreground italic">
                      …and {(parsedRows.length - 10).toLocaleString()} more rows
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function PotentialDuplicates({ pw }: { pw: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<{ candidates: any[]; total: number }>({
    queryKey: ["/api/admin/duplicate-candidates", pw],
    queryFn: () => fetch(`/api/admin/duplicate-candidates?pw=${pw}`).then((r) => r.json()),
  });

  const runDetectionMutation = useMutation({
    mutationFn: () =>
      fetch(`/api/admin/duplicate-detection/run?pw=${pw}`, { method: "POST" }).then((r) => r.json()),
    onSuccess: (result) => {
      toast({
        title: "Dedup scan complete",
        description: `${result.flagged} duplicate(s) flagged across ${result.pairs} pair(s). ${result.embedded} embeddings generated.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/duplicate-candidates", pw] });
    },
    onError: () => toast({ title: "Scan failed", variant: "destructive" }),
  });

  const dismissMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/admin/duplicate-candidates/${id}/dismiss?pw=${pw}`, { method: "POST" }).then((r) => r.json()),
    onSuccess: () => {
      toast({ title: "Dismissed" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/duplicate-candidates", pw] });
    },
    onError: () => toast({ title: "Failed to dismiss", variant: "destructive" }),
  });

  const candidates = data?.candidates ?? [];

  return (
    <div className="bg-card border border-border rounded-xl p-6 mt-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-foreground">Potential Duplicates</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Semantic near-duplicates detected via embedding similarity (threshold: 92%). Run scan to update.
          </p>
        </div>
        <button
          data-testid="button-run-dedup-scan"
          onClick={() => runDetectionMutation.mutate()}
          disabled={runDetectionMutation.isPending}
          className="px-3 py-1.5 text-xs bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-medium disabled:opacity-50 transition-colors"
        >
          {runDetectionMutation.isPending ? "Scanning..." : "Run Scan"}
        </button>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground py-4 text-center">Loading...</div>
      ) : candidates.length === 0 ? (
        <div className="text-sm text-muted-foreground py-6 text-center border border-dashed border-border rounded-lg">
          No duplicate candidates flagged. Run a scan to detect near-duplicates.
        </div>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          <div className="text-xs text-muted-foreground mb-3">
            {candidates.length} flagged asset(s). Dismiss to keep both records.
          </div>
          {candidates.map((c) => (
            <div
              key={c.id}
              data-testid={`card-duplicate-${c.id}`}
              className="flex items-start justify-between gap-3 p-3 bg-muted/40 rounded-lg border border-border text-sm"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="font-medium text-foreground truncate" data-testid={`text-dup-name-${c.id}`}>
                    {c.assetName}
                  </div>
                  {c.dedupeSimilarity != null && (
                    <span
                      data-testid={`text-dup-similarity-${c.id}`}
                      className="shrink-0 text-xs font-mono px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300"
                      title={`Raw similarity score: ${c.dedupeSimilarity.toFixed(4)}`}
                    >
                      {Math.round(c.dedupeSimilarity * 100)}% ({c.dedupeSimilarity.toFixed(3)})
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 truncate">
                  {c.institution ?? "Unknown institution"} {c.indication ? `· ${c.indication}` : ""}
                </div>
                {c.canonicalName && (
                  <div className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    Duplicate of: {c.canonicalName} (ID {c.duplicateOfId})
                  </div>
                )}
                {c.sourceUrl && (
                  <a
                    href={c.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-500 hover:underline mt-0.5 block truncate"
                    data-testid={`link-dup-source-${c.id}`}
                  >
                    {c.sourceUrl}
                  </a>
                )}
              </div>
              <button
                data-testid={`button-dismiss-dup-${c.id}`}
                onClick={() => dismissMutation.mutate(c.id)}
                disabled={dismissMutation.isPending}
                className="px-2.5 py-1 text-xs bg-background border border-border rounded-lg hover:bg-muted transition-colors whitespace-nowrap disabled:opacity-50"
              >
                Dismiss
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PipelineReviewQueue({ pw }: { pw: string }) {
  const { toast } = useToast();

  const { data, isLoading, refetch } = useQuery<{ items: any[] }>({
    queryKey: ["/api/admin/review-queue"],
    queryFn: async () => {
      const res = await fetch("/api/admin/review-queue", {
        headers: { "x-admin-password": pw },
      });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    staleTime: 0,
  });

  const resolve = useMutation({
    mutationFn: async ({ id, note }: { id: number; note: string }) => {
      const res = await fetch(`/api/admin/review-queue/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-password": pw },
        body: JSON.stringify({ note }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      refetch();
      toast({ title: "Resolved", description: "Review item resolved." });
    },
  });

  const wipeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/wipe-assets", {
        method: "POST",
        headers: { "x-admin-password": pw },
      });
      if (!res.ok) throw new Error("Failed to wipe");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/collector-health"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/scan-matrix"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/review-queue"] });
      toast({ title: "Wiped", description: "All ingested assets have been removed. Run a sync to re-collect." });
    },
    onError: () => toast({ title: "Error", description: "Wipe failed.", variant: "destructive" }),
  });

  const [confirmWipe, setConfirmWipe] = useState(false);

  const items = data?.items ?? [];

  return (
    <div className="space-y-6" data-testid="pipeline-review-tab">
      <div className="border border-border rounded-xl bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Asset Review Queue</h3>
            <p className="text-sm text-muted-foreground">Ambiguous assets flagged by the pre-filter for manual review</p>
          </div>
          <Badge variant="secondary" data-testid="badge-review-count">{items.length} pending</Badge>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : items.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">No items pending review</div>
        ) : (
          <div className="space-y-2">
            {items.slice(0, 20).map((item: any) => (
              <div key={item.id} className="flex items-center justify-between p-3 border border-border rounded-lg" data-testid={`review-item-${item.id}`}>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">{item.fingerprint}</div>
                  <div className="text-xs text-muted-foreground">{item.reason}</div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => resolve.mutate({ id: item.id, note: "reviewed" })}
                  disabled={resolve.isPending}
                  data-testid={`button-resolve-${item.id}`}
                >
                  Resolve
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border border-destructive/30 rounded-xl bg-card p-5">
        <div className="flex items-center gap-3 mb-3">
          <Trash2 className="h-5 w-5 text-destructive" />
          <div>
            <h3 className="text-lg font-semibold text-foreground">Wipe & Re-collect</h3>
            <p className="text-sm text-muted-foreground">Delete all ingested assets and start fresh. This is irreversible.</p>
          </div>
        </div>

        {!confirmWipe ? (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setConfirmWipe(true)}
            data-testid="button-wipe-start"
          >
            <Trash2 className="h-4 w-4 mr-1" /> Wipe All Assets
          </Button>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-sm text-destructive font-medium">Are you sure? This deletes everything.</span>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => { wipeMutation.mutate(); setConfirmWipe(false); }}
              disabled={wipeMutation.isPending}
              data-testid="button-wipe-confirm"
            >
              {wipeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Yes, Wipe"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmWipe(false)}
              data-testid="button-wipe-cancel"
            >
              Cancel
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function ConceptQueue({ pw }: { pw: string }) {
  const { data, isLoading } = useQuery<{ concepts: ConceptCard[] }>({
    queryKey: ["/api/admin/concepts"],
    queryFn: async () => {
      const res = await fetch("/api/admin/concepts", {
        headers: { "x-admin-password": pw },
      });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    staleTime: 0,
  });

  const concepts = data?.concepts ?? [];

  if (isLoading) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading concepts...</div>;
  if (concepts.length === 0) return <p className="text-sm text-muted-foreground">No concept cards submitted yet.</p>;

  return (
    <div className="space-y-3">
      {concepts.map((c) => (
        <div key={c.id} className="border border-border rounded-lg p-4 bg-card" data-testid={`admin-concept-${c.id}`}>
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-foreground text-sm">{c.title}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{c.oneLiner}</p>
            </div>
            {c.credibilityScore !== null && (
              <span className={`shrink-0 inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                c.credibilityScore >= 70
                  ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                  : c.credibilityScore >= 40
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                    : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
              }`}>
                <Sparkles className="w-3 h-3" />
                {c.credibilityScore}/100
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium">{c.therapeuticArea}</span>
            <span className="px-2 py-0.5 rounded-full bg-muted font-medium">{c.modality}</span>
            <span className="px-2 py-0.5 rounded-full bg-muted font-medium">Stage {c.stage}</span>
            <span>by {c.submitterName}</span>
            <span className="ml-auto">
            {((c.interestCollaborating ?? 0) + (c.interestFunding ?? 0) + (c.interestAdvising ?? 0))} interest · {new Date(c.createdAt).toLocaleDateString()}
          </span>
          </div>
          {c.credibilityRationale && (
            <p className="text-xs text-muted-foreground italic mt-2 border-t border-border pt-2">AI: {c.credibilityRationale}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function ResearchQueue({ pw }: { pw: string }) {
  const { toast } = useToast();
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  const { data, isLoading, refetch } = useQuery<{ cards: any[] }>({
    queryKey: ["/api/admin/research-queue"],
    queryFn: async () => {
      const res = await fetch("/api/admin/research-queue", {
        headers: { "x-admin-password": pw },
      });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    staleTime: 0,
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, adminStatus, adminNote }: { id: number; adminStatus: string; adminNote?: string }) => {
      const res = await fetch(`/api/admin/research-queue/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-password": pw },
        body: JSON.stringify({ adminStatus, adminNote }),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: (_, vars) => {
      refetch();
      setRejectingId(null);
      setRejectNote("");
      const label = vars.adminStatus === "approved" ? "Approved" : vars.adminStatus === "rejected" ? "Rejected" : "Revoked";
      toast({ title: `${label}`, description: "Card status updated." });
    },
    onError: () => toast({ title: "Error", description: "Could not update status.", variant: "destructive" }),
  });

  const cards = data?.cards ?? [];
  const pending = cards.filter((c) => c.adminStatus === "pending");
  const approved = cards.filter((c) => c.adminStatus === "approved");
  const rejected = cards.filter((c) => c.adminStatus === "rejected");

  function CardRow({ card, actions }: { card: any; actions: ReactNode }) {
    return (
      <div className="p-4 border-b border-border last:border-0" data-testid={`research-queue-card-${card.id}`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-sm font-semibold text-foreground">{card.title}</span>
              <span className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary">{card.technologyType}</span>
              <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{card.developmentStage}</span>
              <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{card.ipStatus}</span>
            </div>
            <div className="text-xs text-muted-foreground mb-1.5">
              <span className="font-medium text-foreground">{card.institution}</span>
              {card.lab && <span> · {card.lab}</span>}
              <span className="mx-1">·</span>
              <span>{card.contactEmail}</span>
              <span className="mx-1">·</span>
              <span>{card.seeking}</span>
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2">{card.summary}</p>
            {card.adminNote && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">Note: {card.adminNote}</p>
            )}
          </div>
          <div className="shrink-0 flex flex-col gap-2">{actions}</div>
        </div>
        {rejectingId === card.id && (
          <div className="mt-3 flex gap-2" data-testid={`reject-note-row-${card.id}`}>
            <input
              className="flex-1 text-xs border border-border rounded px-2 py-1.5 bg-background text-foreground placeholder:text-muted-foreground"
              placeholder="Optional rejection note…"
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              data-testid={`input-reject-note-${card.id}`}
            />
            <Button
              size="sm"
              variant="destructive"
              className="text-xs"
              onClick={() => updateStatus.mutate({ id: card.id, adminStatus: "rejected", adminNote: rejectNote || undefined })}
              disabled={updateStatus.isPending}
              data-testid={`button-confirm-reject-${card.id}`}
            >
              Confirm
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-xs"
              onClick={() => { setRejectingId(null); setRejectNote(""); }}
              data-testid={`button-cancel-reject-${card.id}`}
            >
              Cancel
            </Button>
          </div>
        )}
      </div>
    );
  }

  function Panel({ title, count, color, children }: { title: string; count: number; color: string; children: ReactNode }) {
    return (
      <div className="border border-border rounded-xl bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-muted/20 flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${color}`}>{count}</span>
        </div>
        {count === 0 ? (
          <p className="px-5 py-4 text-sm text-muted-foreground">No cards here.</p>
        ) : (
          <div>{children}</div>
        )}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16" data-testid="research-queue-loading">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="research-queue-tab">
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <div className="text-2xl font-bold tabular-nums text-amber-500" data-testid="stat-pending-count">{pending.length}</div>
          <div className="text-xs text-muted-foreground mt-1">Pending Review</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <div className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400" data-testid="stat-approved-count">{approved.length}</div>
          <div className="text-xs text-muted-foreground mt-1">Approved · Live in Scout</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <div className="text-2xl font-bold tabular-nums text-foreground" data-testid="stat-rejected-count">{rejected.length}</div>
          <div className="text-xs text-muted-foreground mt-1">Rejected</div>
        </div>
      </div>

      <Panel title="Pending Review" count={pending.length} color="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
        {pending.map((card) => (
          <CardRow
            key={card.id}
            card={card}
            actions={
              <>
                <Button
                  size="sm"
                  className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => updateStatus.mutate({ id: card.id, adminStatus: "approved" })}
                  disabled={updateStatus.isPending}
                  data-testid={`button-approve-${card.id}`}
                >
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs border-destructive/50 text-destructive hover:bg-destructive/10"
                  onClick={() => { setRejectingId(card.id); setRejectNote(""); }}
                  disabled={updateStatus.isPending}
                  data-testid={`button-reject-${card.id}`}
                >
                  <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                </Button>
              </>
            }
          />
        ))}
      </Panel>

      <Panel title="Approved · Live in Scout" count={approved.length} color="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
        {approved.map((card) => (
          <CardRow
            key={card.id}
            card={card}
            actions={
              <Button
                size="sm"
                variant="outline"
                className="text-xs"
                onClick={() => updateStatus.mutate({ id: card.id, adminStatus: "pending" })}
                disabled={updateStatus.isPending}
                data-testid={`button-revoke-${card.id}`}
              >
                Revoke
              </Button>
            }
          />
        ))}
      </Panel>

      <Panel title="Rejected" count={rejected.length} color="bg-muted text-muted-foreground">
        {rejected.map((card) => (
          <CardRow
            key={card.id}
            card={card}
            actions={
              <Button
                size="sm"
                variant="outline"
                className="text-xs"
                onClick={() => updateStatus.mutate({ id: card.id, adminStatus: "pending" })}
                disabled={updateStatus.isPending}
                data-testid={`button-requeue-${card.id}`}
              >
                Re-queue
              </Button>
            }
          />
        ))}
      </Panel>
    </div>
  );
}

interface AdminUser {
  id: string;
  email: string;
  contactEmail: string | null;
  role: PortalRole | null;
  subscribedToDigest: boolean;
  createdAt: string;
  lastSignInAt: string | null;
}

interface AdminIndustryProfile {
  userId: string;
  companyName: string;
  companyType: string;
  therapeuticAreas: string[];
  dealStages: string[];
  modalities: string[];
  onboardingDone: boolean;
}

function AccountCenter({ pw }: { pw: string }) {
  const { toast } = useToast();
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [inviteRole, setInviteRole] = useState<PortalRole>("concept");
  const [copiedRole, setCopiedRole] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ users: AdminUser[] }>({
    queryKey: ["/api/admin/users"],
    queryFn: async () => {
      const res = await fetch("/api/admin/users", { headers: { "x-admin-password": pw } });
      if (!res.ok) throw new Error("Failed to load users");
      return res.json();
    },
    staleTime: 30000,
    enabled: !!pw,
  });

  const { data: profilesData } = useQuery<{ profiles: AdminIndustryProfile[] }>({
    queryKey: ["/api/admin/industry-profiles"],
    queryFn: async () => {
      const res = await fetch("/api/admin/industry-profiles", { headers: { "x-admin-password": pw } });
      if (!res.ok) return { profiles: [] };
      return res.json();
    },
    staleTime: 60000,
    enabled: !!pw,
  });

  const industryProfileMap = new Map<string, AdminIndustryProfile>(
    (profilesData?.profiles ?? []).map((p) => [p.userId, p])
  );

  const updateRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: PortalRole }) => {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-password": pw },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to update role");
      }
      return res.json();
    },
    onMutate: async ({ userId, role }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/admin/users"] });
      const prev = queryClient.getQueryData<{ users: AdminUser[] }>(["/api/admin/users"]);
      queryClient.setQueryData<{ users: AdminUser[] }>(["/api/admin/users"], (old) => {
        if (!old) return old;
        return { users: old.users.map((u) => u.id === userId ? { ...u, role } : u) };
      });
      return { prev };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Role updated" });
    },
    onError: (err: Error, _vars, context) => {
      if (context?.prev) queryClient.setQueryData(["/api/admin/users"], context.prev);
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  const [editingEmailUserId, setEditingEmailUserId] = useState<string | null>(null);
  const [editingEmailValue, setEditingEmailValue] = useState("");

  const updateContactEmail = useMutation({
    mutationFn: async ({ userId, contactEmail }: { userId: string; contactEmail: string }) => {
      const res = await fetch(`/api/admin/users/${userId}/email`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-password": pw },
        body: JSON.stringify({ contactEmail }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to update email");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setEditingEmailUserId(null);
      toast({ title: "Contact email updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  const updateSubscribed = useMutation({
    mutationFn: async ({ userId, subscribedToDigest }: { userId: string; subscribedToDigest: boolean }) => {
      const res = await fetch(`/api/admin/users/${userId}/subscribed`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-password": pw },
        body: JSON.stringify({ subscribedToDigest }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to update subscription");
      }
      return res.json();
    },
    onMutate: async ({ userId, subscribedToDigest }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/admin/users"] });
      const prev = queryClient.getQueryData<{ users: AdminUser[] }>(["/api/admin/users"]);
      queryClient.setQueryData<{ users: AdminUser[] }>(["/api/admin/users"], (old) => {
        if (!old) return old;
        return { users: old.users.map((u) => u.id === userId ? { ...u, subscribedToDigest } : u) };
      });
      return { prev };
    },
    onSuccess: (_data, { subscribedToDigest }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: subscribedToDigest ? "Subscribed to digest" : "Unsubscribed from digest" });
    },
    onError: (err: Error, _vars, context) => {
      if (context?.prev) queryClient.setQueryData(["/api/admin/users"], context.prev);
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  const inviteUser = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/users/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": pw },
        body: JSON.stringify({ email: inviteEmail, password: invitePassword, role: inviteRole }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to create user");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User created", description: `${inviteEmail} added as ${PORTAL_CONFIG[inviteRole].label}` });
      setShowInvite(false);
      setInviteEmail("");
      setInvitePassword("");
      setInviteRole("concept");
    },
    onError: (err: Error) => {
      toast({ title: "Invite failed", description: err.message, variant: "destructive" });
    },
  });

  const users = data?.users ?? [];

  const portalCounts: Record<string, number> = {};
  let unassignedCount = 0;
  let subscriberCount = 0;
  for (const u of users) {
    if (u.role) {
      portalCounts[u.role] = (portalCounts[u.role] ?? 0) + 1;
    } else {
      unassignedCount++;
    }
    if (u.subscribedToDigest) subscriberCount++;
  }

  function copyInviteLink(role: PortalRole) {
    const origin = window.location.origin;
    const cfg = PORTAL_CONFIG[role];
    navigator.clipboard.writeText(`${origin}${cfg.registerPath}`);
    setCopiedRole(role);
    setTimeout(() => setCopiedRole(null), 2000);
    toast({ title: "Link copied", description: `Registration link for ${cfg.label} copied to clipboard` });
  }

  function formatDate(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function timeAgoShort(iso: string | null) {
    if (!iso) return "Never";
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  return (
    <div className="space-y-6" data-testid="account-center-tab">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="text-2xl font-bold tabular-nums text-foreground" data-testid="stat-total-users">{users.length}</div>
            <span className="text-sm text-muted-foreground">total users</span>
            <span className="text-xs text-muted-foreground">&bull;</span>
            <div className="text-sm font-semibold tabular-nums text-foreground" data-testid="stat-digest-subscribers">{subscriberCount}</div>
            <span className="text-sm text-muted-foreground">digest subscriber{subscriberCount !== 1 ? "s" : ""}</span>
          </div>
          {unassignedCount > 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400" data-testid="text-unassigned-count">
              {unassignedCount} user{unassignedCount !== 1 ? "s" : ""} without a portal assignment
            </p>
          )}
        </div>
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => setShowInvite(true)}
          data-testid="button-invite-user"
        >
          <UserPlus className="w-4 h-4" />
          Invite User
        </Button>
      </div>

      {showInvite && (
        <div className="border border-border rounded-xl bg-card p-5" data-testid="invite-modal">
          <h3 className="font-semibold text-sm text-foreground mb-4">Create New User</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Email</label>
              <Input
                type="email"
                placeholder="user@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                data-testid="input-invite-email"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Password</label>
              <Input
                type="password"
                placeholder="Min 8 characters"
                value={invitePassword}
                onChange={(e) => setInvitePassword(e.target.value)}
                data-testid="input-invite-password"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Portal</label>
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as PortalRole)}
                data-testid="select-invite-role"
              >
                {ALL_PORTAL_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {PORTAL_CONFIG[r].label} (Tier {PORTAL_CONFIG[r].tier})
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => inviteUser.mutate()}
              disabled={!inviteEmail || invitePassword.length < 8 || inviteUser.isPending}
              data-testid="button-confirm-invite"
            >
              {inviteUser.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
              Create User
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { setShowInvite(false); setInviteEmail(""); setInvitePassword(""); }}
              data-testid="button-cancel-invite"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="border border-border rounded-xl overflow-hidden bg-card">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left py-3 px-4 font-semibold text-foreground">Login Email</th>
                <th className="text-left py-3 px-4 font-semibold text-foreground">Contact Email</th>
                <th className="text-left py-3 px-4 font-semibold text-foreground min-w-[160px]">Portal</th>
                <th className="text-center py-3 px-4 font-semibold text-foreground">Digest</th>
                <th className="text-center py-3 px-4 font-semibold text-foreground">Joined</th>
                <th className="text-center py-3 px-4 font-semibold text-foreground">Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const portal = getPortalConfig(user.role);
                return (
                  <tr key={user.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors" data-testid={`row-user-${user.id}`}>
                    <td className="py-2.5 px-4 text-foreground font-medium text-xs" data-testid={`text-email-${user.id}`}>
                      {user.email}
                    </td>
                    <td className="py-2 px-4" data-testid={`cell-contact-email-${user.id}`}>
                      {editingEmailUserId === user.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="email"
                            value={editingEmailValue}
                            onChange={(e) => setEditingEmailValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") updateContactEmail.mutate({ userId: user.id, contactEmail: editingEmailValue });
                              if (e.key === "Escape") setEditingEmailUserId(null);
                            }}
                            autoFocus
                            className="flex-1 h-7 px-2 text-xs border border-primary/40 rounded bg-background text-foreground focus:outline-none"
                            placeholder="contact@example.com"
                            data-testid={`input-contact-email-${user.id}`}
                          />
                          <button
                            onClick={() => updateContactEmail.mutate({ userId: user.id, contactEmail: editingEmailValue })}
                            className="text-emerald-600 hover:text-emerald-700"
                            disabled={updateContactEmail.isPending}
                            data-testid={`button-save-contact-email-${user.id}`}
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setEditingEmailUserId(null)}
                            className="text-muted-foreground hover:text-foreground"
                            data-testid={`button-cancel-contact-email-${user.id}`}
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setEditingEmailUserId(user.id); setEditingEmailValue(user.contactEmail ?? ""); }}
                          className="text-xs text-muted-foreground hover:text-foreground group flex items-center gap-1"
                          data-testid={`button-edit-contact-email-${user.id}`}
                        >
                          <span className={user.contactEmail ? "text-foreground" : "italic opacity-50"}>
                            {user.contactEmail || "Set contact email"}
                          </span>
                          <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-50" />
                        </button>
                      )}
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <select
                          className="h-7 rounded-md border border-input bg-background px-2 text-xs"
                          value={user.role ?? ""}
                          onChange={(e) => {
                            if (e.target.value) {
                              updateRole.mutate({ userId: user.id, role: e.target.value as PortalRole });
                            }
                          }}
                          data-testid={`select-role-${user.id}`}
                        >
                          {!user.role && <option value="">No portal assigned</option>}
                          {ALL_PORTAL_ROLES.map((r) => (
                            <option key={r} value={r}>
                              {PORTAL_CONFIG[r].label} (Tier {PORTAL_CONFIG[r].tier})
                            </option>
                          ))}
                        </select>
                        {portal && (
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${portal.badgeClass}`} data-testid={`badge-portal-${user.id}`}>
                            {portal.label}
                          </span>
                        )}
                        {!portal && user.role === null && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground" data-testid={`badge-unassigned-${user.id}`}>
                            Unassigned
                          </span>
                        )}
                      </div>
                      {user.role === "industry" && (() => {
                        const ip = industryProfileMap.get(user.id);
                        if (!ip) return null;
                        const interests = [...(ip.therapeuticAreas ?? []), ...(ip.modalities ?? [])].slice(0, 4);
                        if (interests.length === 0 && !ip.companyName) return null;
                        return (
                          <div className="mt-1 flex flex-wrap gap-1" data-testid={`interests-${user.id}`}>
                            {ip.companyName && (
                              <span className="text-[10px] text-muted-foreground italic">{ip.companyName}</span>
                            )}
                            {interests.map((tag) => (
                              <span key={tag} className="inline-flex items-center px-1 py-0.5 rounded text-[9px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                {tag}
                              </span>
                            ))}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="text-center py-2.5 px-4">
                      <input
                        type="checkbox"
                        checked={user.subscribedToDigest}
                        onChange={(e) => updateSubscribed.mutate({ userId: user.id, subscribedToDigest: e.target.checked })}
                        className="w-4 h-4 accent-primary cursor-pointer"
                        title={user.subscribedToDigest ? "Unsubscribe from digest" : "Subscribe to digest"}
                        data-testid={`toggle-digest-${user.id}`}
                      />
                    </td>
                    <td className="text-center py-2.5 px-4 text-xs text-muted-foreground">
                      {formatDate(user.createdAt)}
                    </td>
                    <td className="text-center py-2.5 px-4 text-xs text-muted-foreground">
                      {timeAgoShort(user.lastSignInAt)}
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-muted-foreground">No users found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div>
        <h3 className="font-semibold text-sm text-foreground mb-3">Portal Directory</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {ALL_PORTAL_ROLES.map((role) => {
            const cfg = PORTAL_CONFIG[role];
            const count = portalCounts[role] ?? 0;
            return (
              <div
                key={role}
                className="border border-border rounded-xl bg-card p-4 space-y-3"
                data-testid={`card-portal-${role}`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${cfg.badgeClass}`}>
                      Tier {cfg.tier}
                    </span>
                    <h4 className="font-semibold text-foreground mt-1">{cfg.label}</h4>
                  </div>
                  <div className="text-2xl font-bold tabular-nums text-foreground" data-testid={`stat-portal-count-${role}`}>
                    {count}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{cfg.description}</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full text-xs gap-1.5"
                  onClick={() => copyInviteLink(role)}
                  data-testid={`button-copy-link-${role}`}
                >
                  {copiedRole === role ? (
                    <><Check className="w-3 h-3 text-emerald-500" /> Copied!</>
                  ) : (
                    <><Copy className="w-3 h-3" /> Copy invite link</>
                  )}
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── New Arrivals ─────────────────────────────────────────────────────────────

type NewArrivalAsset = {
  id: number;
  assetName: string;
  firstSeenAt: string;
  sourceUrl: string | null;
};

type NewArrivalGroup = {
  institution: string;
  count: number;
  assets: NewArrivalAsset[];
};

type NewArrivalsData = {
  totalUnindexed: number;
  totalInstitutions: number;
  groups: NewArrivalGroup[];
};

function NewArrivals({ pw }: { pw: string }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pendingRejectIds, setPendingRejectIds] = useState<Set<number>>(new Set());
  const { toast } = useToast();

  const { data, isLoading } = useQuery<NewArrivalsData>({
    queryKey: ["/api/admin/new-arrivals"],
    queryFn: async () => {
      const res = await fetch("/api/admin/new-arrivals", {
        headers: { "x-admin-password": pw },
      });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    staleTime: 30000,
    enabled: !!pw,
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: number) => {
      setPendingRejectIds((prev) => new Set(prev).add(id));
      const res = await fetch(`/api/admin/new-arrivals/${id}`, {
        method: "DELETE",
        headers: { "x-admin-password": pw },
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Reject failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/new-arrivals"] });
    },
    onError: (err: Error) => {
      toast({ title: "Reject failed", description: err.message, variant: "destructive" });
    },
    onSettled: (_data, _err, id) => {
      setPendingRejectIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
    },
  });

  const pushMutation = useMutation({
    mutationFn: async ({ institution }: { institution?: string }) => {
      const res = await fetch("/api/admin/new-arrivals/push", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": pw },
        body: JSON.stringify({ institution }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Push failed");
      return res.json() as Promise<{ updated: number; message: string }>;
    },
    onSuccess: (result) => {
      toast({ title: result.message });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/new-arrivals"] });
    },
    onError: (err: Error) => {
      toast({ title: "Push failed", description: err.message, variant: "destructive" });
    },
  });

  const toggleExpand = (institution: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(institution)) {
        next.delete(institution);
      } else {
        next.add(institution);
      }
      return next;
    });
  };

  const totalUnindexed = data?.totalUnindexed ?? 0;

  return (
    <div className="space-y-6" data-testid="new-arrivals-panel">
      {/* Header row */}
      <div className="flex items-center justify-end">
        <Button
          size="sm"
          onClick={() => pushMutation.mutate({})}
          disabled={pushMutation.isPending || totalUnindexed === 0}
          data-testid="button-push-all-new"
        >
          {pushMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <PackagePlus className="h-4 w-4 mr-2" />
          )}
          Mark all as enriched
        </Button>
      </div>

      {/* Summary banner */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <div className="border border-border rounded-lg p-4 bg-card" data-testid="banner-total-unindexed">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Pending enrichment</p>
            <p className="text-3xl font-bold text-amber-600 dark:text-amber-400 mt-1">{totalUnindexed}</p>
          </div>
          <div className="border border-border rounded-lg p-4 bg-card" data-testid="banner-institutions">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Institutions</p>
            <p className="text-3xl font-bold text-foreground mt-1">{data?.totalInstitutions ?? 0}</p>
          </div>
        </div>
      )}

      {/* Institution rows */}
      {!isLoading && data && (
        data.groups.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground" data-testid="text-no-arrivals">
            <Inbox className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">No assets pending enrichment — queue is clear.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {data.groups.map((group) => {
              const isOpen = expanded.has(group.institution);
              return (
                <div
                  key={group.institution}
                  className="border border-border rounded-lg bg-card overflow-hidden"
                  data-testid={`card-institution-${group.institution}`}
                >
                  {/* Institution header */}
                  <div className="flex items-center justify-between px-4 py-3 gap-3">
                    <button
                      className="flex items-center gap-2 min-w-0 flex-1 text-left"
                      onClick={() => toggleExpand(group.institution)}
                      data-testid={`button-expand-${group.institution}`}
                    >
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="font-medium text-sm text-foreground truncate">{group.institution}</span>
                    </button>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[10px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 rounded-full px-2 py-0.5" data-testid={`badge-unindexed-${group.institution}`}>
                        {group.count} pending
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => pushMutation.mutate({ institution: group.institution })}
                        disabled={pushMutation.isPending}
                        className="h-7 text-xs"
                        data-testid={`button-push-${group.institution}`}
                      >
                        {pushMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Push"}
                      </Button>
                    </div>
                  </div>

                  {/* Asset list */}
                  {isOpen && (
                    <div className="border-t border-border divide-y divide-border">
                      {group.assets.map((asset) => (
                        <div
                          key={asset.id}
                          className="flex items-center px-4 py-2.5 gap-3"
                          data-testid={`row-asset-${asset.id}`}
                        >
                          <div className="min-w-0 flex-1">
                            {asset.sourceUrl ? (
                              <a
                                href={asset.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-foreground hover:text-primary hover:underline line-clamp-1"
                                data-testid={`link-asset-${asset.id}`}
                              >
                                {asset.assetName}
                              </a>
                            ) : (
                              <span className="text-sm text-foreground line-clamp-1">{asset.assetName}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">{formatDate(asset.firstSeenAt)}</span>
                            <button
                              className="ml-1 h-5 w-5 flex items-center justify-center rounded text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
                              onClick={() => rejectMutation.mutate(asset.id)}
                              disabled={pendingRejectIds.has(asset.id)}
                              title="Remove from queue"
                              data-testid={`button-reject-${asset.id}`}
                            >
                              {pendingRejectIds.has(asset.id)
                                ? <Loader2 className="h-3 w-3 animate-spin" />
                                : <X className="h-3 w-3" />
                              }
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}

// ── EDEN Tab ────────────────────────────────────────────────────────────────

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

type EdenStatsResponse = {
  coverage: EdenCoverage;
  embeddingCoverage: EdenEmbeddingCoverage;
  latestJob: { id: number; total: number; processed: number; status: string; startedAt: string; completedAt: string | null } | null;
  needingDeepEnrich?: number;
  live: { processed: number; total: number } | null;
};

type EdenStatusResponse = {
  running: boolean;
  processed: number;
  total: number;
  succeeded: number;
  failed: number;
  job: { id: number; total: number; processed: number; improved: number; status: string; startedAt: string; completedAt: string | null } | null;
};

type EdenEmbedStatusResponse = {
  running: boolean;
  processed: number;
  total: number;
  succeeded: number;
  failed: number;
};

function devStageBadgeClass(stage?: string): string {
  if (!stage) return "bg-muted text-muted-foreground border-border";
  const s = stage.toLowerCase();
  if (s.includes("clinical") || s.includes("phase")) return "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20";
  if (s.includes("preclinical") || s.includes("pre-clinical")) return "bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/20";
  if (s.includes("research") || s.includes("discovery")) return "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20";
  if (s.includes("approved") || s.includes("commercial")) return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20";
  return "bg-muted text-muted-foreground border-border";
}

function modalityBadgeClass(modality?: string): string {
  if (!modality) return "bg-muted text-muted-foreground border-border";
  const m = modality.toLowerCase();
  if (m.includes("antibody") || m.includes("biologic")) return "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/20";
  if (m.includes("small molecule") || m.includes("compound")) return "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20";
  if (m.includes("gene") || m.includes("cell") || m.includes("rna") || m.includes("mrna")) return "bg-pink-500/10 text-pink-700 dark:text-pink-400 border-pink-500/20";
  if (m.includes("platform") || m.includes("diagnostic") || m.includes("device")) return "bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-500/20";
  return "bg-muted text-muted-foreground border-border";
}


function relevanceLabel(similarity: number): { label: string; cls: string } {
  if (similarity >= 0.70) return { label: "Strong", cls: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800" };
  if (similarity >= 0.50) return { label: "Good", cls: "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-400 dark:border-teal-800" };
  return { label: "Relevant", cls: "bg-muted text-muted-foreground border-border" };
}

type PipelineWithCount = { id: number; name: string; assetCount: number };
type PipelinesResponse = { pipelines: PipelineWithCount[]; uncategorisedCount: number };

function CitationCard({ asset, index, savedIngestedIds }: {
  asset: ChatAsset;
  index: number;
  savedIngestedIds: Set<number>;
}) {
  const { label, cls } = relevanceLabel(asset.similarity);
  const isSaved = savedIngestedIds.has(asset.id);

  const pickerPayload: PipelinePickerPayload = {
    asset_name: asset.assetName,
    target: "unknown",
    modality: asset.modality || "unknown",
    development_stage: asset.developmentStage || "unknown",
    disease_indication: asset.indication || "unknown",
    summary: "",
    source_title: asset.assetName,
    source_journal: asset.institution,
    publication_year: "",
    source_name: asset.sourceName || "tto",
    source_url: asset.sourceUrl ?? null,
    ingested_asset_id: asset.id,
  };

  return (
    <div className="rounded-lg border border-border bg-background p-3 flex flex-col gap-1.5" data-testid={`citation-card-${index}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold text-foreground leading-snug line-clamp-2 flex-1">{asset.assetName}</p>
        <div className="flex items-center gap-1 shrink-0">
          <PipelinePicker payload={pickerPayload} alreadySaved={isSaved} />
          <span className={`text-[10px] font-medium border rounded px-1.5 py-0.5 ${cls}`}>{label}</span>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground truncate">{asset.institution}</p>
      <div className="flex flex-wrap gap-1 mt-0.5">
        {asset.modality && asset.modality !== "unknown" && (
          <span className={`text-[10px] font-medium border rounded px-1.5 py-0.5 ${modalityBadgeClass(asset.modality)}`}>
            {asset.modality.length > 22 ? asset.modality.slice(0, 22) + "…" : asset.modality}
          </span>
        )}
        {asset.developmentStage && asset.developmentStage !== "unknown" && (
          <span className={`text-[10px] font-medium border rounded px-1.5 py-0.5 ${devStageBadgeClass(asset.developmentStage)}`}>
            {asset.developmentStage.length > 18 ? asset.developmentStage.slice(0, 18) + "…" : asset.developmentStage}
          </span>
        )}
        {asset.ipType && (
          <span className="text-[10px] font-medium border rounded px-1.5 py-0.5 bg-muted text-muted-foreground border-border">
            {asset.ipType}
          </span>
        )}
      </div>
      {asset.sourceUrl && (
        <a
          href={asset.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-primary hover:underline flex items-center gap-1 mt-0.5"
          data-testid={`citation-link-${index}`}
        >
          <ExternalLink className="h-2.5 w-2.5 shrink-0" />
          View source
        </a>
      )}
    </div>
  );
}

function EdenTab({ pw }: { pw: string }) {
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [embedConfirming, setEmbedConfirming] = useState(false);
  const [readinessOpen, setReadinessOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [expandedCitations, setExpandedCitations] = useState<Record<number, boolean>>({});
  const [introPlayed, setIntroPlayed] = useState(() => {
    try { return sessionStorage.getItem("eden-admin-intro-played") === "1"; } catch { return false; }
  });
  const handleIntroDone = () => setIntroPlayed(true);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const { data: savedAssetsData } = useQuery<{ assets: Array<{ ingestedAssetId: number | null }> }>({
    queryKey: ["/api/saved-assets"],
    staleTime: 30000,
  });
  const savedIngestedIds = React.useMemo(() => {
    const ids = new Set<number>();
    for (const a of savedAssetsData?.assets ?? []) {
      if (a.ingestedAssetId != null) ids.add(a.ingestedAssetId);
    }
    return ids;
  }, [savedAssetsData]);

  const {
    messages: chatMessages,
    input: chatInput,
    setInput: setChatInput,
    streaming: chatStreaming,
    sessionId: chatSessionId,
    send: sendChatMessage,
    clearChat,
    loadSession: loadSessionFromHook,
  } = useEdenChat(pw);
  const [messageFeedback, setMessageFeedback] = useState<Record<number, "up" | "down">>({});
  const chatEndRef = useRef<HTMLDivElement>(null);

  const { data: stats, refetch: refetchStats } = useQuery<EdenStatsResponse>({
    queryKey: ["/api/admin/eden/stats"],
    queryFn: async () => {
      const res = await fetch("/api/admin/eden/stats", { headers: { "x-admin-password": pw } });
      if (!res.ok) throw new Error("Failed to load EDEN stats");
      return res.json();
    },
    refetchInterval: 5000,
  });

  const { data: status, refetch: refetchStatus } = useQuery<EdenStatusResponse>({
    queryKey: ["/api/admin/eden/enrich/status"],
    queryFn: async () => {
      const res = await fetch("/api/admin/eden/enrich/status", { headers: { "x-admin-password": pw } });
      if (!res.ok) throw new Error("Failed to load status");
      return res.json();
    },
    refetchInterval: 3000,
  });

  const { data: embedStatus } = useQuery<EdenEmbedStatusResponse>({
    queryKey: ["/api/admin/eden/embed/status"],
    queryFn: async () => {
      const res = await fetch("/api/admin/eden/embed/status", { headers: { "x-admin-password": pw } });
      if (!res.ok) throw new Error("Failed to load embed status");
      return res.json();
    },
    refetchInterval: 3000,
  });

  const startMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/eden/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": pw },
        body: JSON.stringify({ adminPassword: pw }),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error ?? "Failed to start");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setConfirming(false);
      toast({ title: "EDEN Deep Enrichment started", description: `Processing ${data.total?.toLocaleString() ?? "?"} assets with GPT-4o` });
      refetchStats();
      refetchStatus();
    },
    onError: (e: Error) => {
      setConfirming(false);
      toast({ title: "Failed to start enrichment", description: e.message, variant: "destructive" });
    },
  });

  const stopEdenMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/eden/enrich/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": pw },
        body: JSON.stringify({ adminPassword: pw }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "Failed to stop"); }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Stop signal sent", description: "EDEN Deep Enrichment will halt after the current batch finishes" });
      refetchStatus();
    },
    onError: (e: Error) => toast({ title: "Failed to stop", description: e.message, variant: "destructive" }),
  });

  const embedMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/eden/embed", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": pw },
        body: JSON.stringify({ adminPassword: pw }),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error ?? "Failed to start embedding");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setEmbedConfirming(false);
      toast({ title: "EDEN Embedding started", description: `Embedding ${data.total?.toLocaleString() ?? "?"} assets with text-embedding-3-small` });
      refetchStats();
    },
    onError: (e: Error) => {
      setEmbedConfirming(false);
      toast({ title: "Failed to start embedding", description: e.message, variant: "destructive" });
    },
  });

  const { data: sessionsData, refetch: refetchSessions } = useQuery<EdenSessionSummary[]>({
    queryKey: ["/api/eden/sessions"],
    queryFn: async () => {
      const res = await fetch("/api/eden/sessions?limit=25", { headers: { "x-admin-password": pw } });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: historyOpen,
    staleTime: 10000,
  });

  function loadSession(s: EdenSessionSummary) {
    loadSessionFromHook(s);
    setExpandedCitations({});
    setMessageFeedback({});
    setHistoryOpen(false);
  }

  async function handleFeedback(msgIndex: number, sentiment: "up" | "down") {
    if (messageFeedback[msgIndex]) return;
    setMessageFeedback((prev) => ({ ...prev, [msgIndex]: sentiment }));
    try {
      const res = await fetch("/api/eden/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": pw },
        body: JSON.stringify({ sessionId: chatSessionId, messageIndex: msgIndex, sentiment }),
      });
      if (!res.ok) throw new Error("server error");
      toast({ title: "Feedback noted — thanks!", duration: 2000 });
    } catch {
      setMessageFeedback((prev) => { const n = { ...prev }; delete n[msgIndex]; return n; });
      toast({ title: "Couldn't save feedback", variant: "destructive" });
    }
  }

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  useEffect(() => {
    if (chatMessages.length > 0) {
      try { sessionStorage.setItem("eden-admin-intro-played", "1"); } catch {}
    }
  }, [chatMessages.length]);

  useEffect(() => {
    if (!chatSessionId) return;
    fetch(`/api/eden/feedback/${chatSessionId}`, { headers: { "x-admin-password": pw } })
      .then((r) => r.ok ? r.json() : [])
      .then((data: Array<{ messageIndex: number; sentiment: string }>) => {
        if (!Array.isArray(data)) return;
        const map: Record<number, "up" | "down"> = {};
        for (const item of data) {
          if (item.sentiment === "up" || item.sentiment === "down") {
            map[item.messageIndex] = item.sentiment as "up" | "down";
          }
        }
        setMessageFeedback(map);
      })
      .catch(() => {});
  }, [chatSessionId]);

  const { isListening, isSupported: speechSupported, toggle: toggleSpeech } = useSpeechRecognition(
    (transcript) => setChatInput(chatInput ? `${chatInput} ${transcript}` : transcript)
  );

  const cov = stats?.coverage;
  const emb = stats?.embeddingCoverage;
  const live = status?.running ? status : stats?.live ? { running: true, processed: stats.live.processed, total: stats.live.total, succeeded: 0, failed: 0 } : null;
  const pct = live && live.total > 0 ? Math.round((live.processed / live.total) * 100) : null;
  const deepPct = cov && cov.totalRelevant > 0 ? Math.round((cov.deepEnriched / cov.totalRelevant) * 100) : 0;
  const remaining = stats?.needingDeepEnrich ?? (cov ? cov.totalRelevant - cov.deepEnriched : 0);
  const estCostUsd = remaining > 0 ? (remaining * 0.0012).toFixed(0) : "0";
  const embPct = emb && emb.totalRelevant > 0 ? Math.round((emb.totalEmbedded / emb.totalRelevant) * 100) : 0;
  const embRemaining = emb ? emb.totalRelevant - emb.totalEmbedded : 0;
  const embEstCost = embRemaining > 0 ? (embRemaining * 0.00002).toFixed(2) : "0.00";
  const embedLive = embedStatus?.running ? embedStatus : null;
  const embedPct = embedLive && embedLive.total > 0 ? Math.round((embedLive.processed / embedLive.total) * 100) : null;
  const chatReady = emb && emb.totalEmbedded > 0;
  const institutionCount = 223;

  return (
    <div className="space-y-6" data-testid="eden-tab">

      {/* ── EDEN Chat (hero section) ── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm" data-testid="card-eden-chat">

        {/* Identity header */}
        <div className="px-5 py-4 border-b border-border bg-gradient-to-r from-emerald-500/5 to-transparent flex items-center gap-3" data-testid="eden-identity-header">
          <EdenAvatar isThinking={chatStreaming} size={36} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-foreground" data-testid="eden-name">EDEN</h3>
              {chatReady && (
                <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 rounded-full px-2 py-0.5 border border-emerald-500/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  live
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5" data-testid="eden-descriptor">
              TTO Intelligence Analyst · {institutionCount} institutions · {emb?.totalEmbedded?.toLocaleString() ?? "—"} assets indexed
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {chatMessages.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7 px-2"
                onClick={() => { clearChat(); setExpandedCitations({}); setMessageFeedback({}); }}
                data-testid="button-chat-clear"
              >
                New chat
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7 px-2 gap-1"
              onClick={() => { setHistoryOpen((v) => !v); if (!historyOpen) refetchSessions(); }}
              data-testid="button-chat-history"
            >
              <Clock className="h-3.5 w-3.5" />
              History
            </Button>
          </div>
        </div>

        {/* Session history dropdown */}
        {historyOpen && (
          <div className="border-b border-border bg-muted/30 p-3 max-h-52 overflow-y-auto" data-testid="session-history-panel">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Recent Sessions</p>
            {!sessionsData && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
              </div>
            )}
            {sessionsData && sessionsData.length === 0 && (
              <p className="text-xs text-muted-foreground">No sessions yet.</p>
            )}
            {sessionsData && sessionsData.length > 0 && (
              <div className="space-y-1">
                {sessionsData.map((s) => {
                  const firstQ = s.messages?.find((m) => m.role === "user")?.content ?? "Untitled session";
                  const date = new Date(s.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
                  const msgCount = s.messages?.length ?? 0;
                  return (
                    <button
                      key={s.sessionId}
                      onClick={() => loadSession(s)}
                      className="w-full text-left rounded-md px-3 py-2 hover:bg-muted transition-colors flex items-center gap-2 group"
                      data-testid={`session-item-${s.id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{firstQ.slice(0, 70)}{firstQ.length > 70 ? "…" : ""}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{date} · {msgCount} message{msgCount !== 1 ? "s" : ""}</p>
                      </div>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Not-ready banner — non-blocking */}
        {!chatReady && (
          <div className="mx-5 my-3 px-3 py-2 rounded-lg bg-amber-500/8 border border-amber-500/20 flex items-center gap-2" data-testid="chat-not-ready">
            <Sparkles className="h-3.5 w-3.5 text-amber-500 shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-400">EDEN is not yet active — generate vector embeddings first using the EDEN Readiness panel below.</p>
          </div>
        )}

        {/* Chat area */}
        <>
          <style>{`
            @keyframes em-slide-user {
              from { opacity: 0; transform: translateX(20px) translateY(4px); }
              to   { opacity: 1; transform: translateX(0) translateY(0); }
            }
            @keyframes em-slide-assistant {
              from { opacity: 0; transform: translateX(-20px) translateY(4px); }
              to   { opacity: 1; transform: translateX(0) translateY(0); }
            }
            @keyframes em-fade-in {
              from { opacity: 0; transform: translateY(8px) scale(0.97); }
              to   { opacity: 1; transform: translateY(0) scale(1); }
            }
            @keyframes em-fade-up {
              from { opacity: 0; transform: translateY(12px); }
              to   { opacity: 1; transform: translateY(0); }
            }
            @keyframes em-dot-float {
              0%, 100% { transform: translateY(0px) translateX(0px); }
              33%       { transform: translateY(-10px) translateX(4px); }
              66%       { transform: translateY(-5px) translateX(-3px); }
            }
            @keyframes em-pill-in {
              from { opacity: 0; transform: translateY(6px) scale(0.95); }
              to   { opacity: 1; transform: translateY(0) scale(1); }
            }
          `}</style>
          <div className="relative h-[580px] overflow-y-auto flex flex-col bg-gradient-to-b from-background to-emerald-500/[0.02]" data-testid="chat-messages">

            {/* Ambient dots */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
              {[
                { s: 5,  x: "6%",  y: "18%", c: "#10b981", o: 0.07, d: 7.2,  dl: 0.0 },
                { s: 4,  x: "17%", y: "78%", c: "#10b981", o: 0.06, d: 9.8,  dl: 2.3 },
                { s: 6,  x: "58%", y: "9%",  c: "#6ee7b7", o: 0.07, d: 11.5, dl: 4.7 },
                { s: 3,  x: "86%", y: "72%", c: "#10b981", o: 0.06, d: 8.1,  dl: 6.2 },
                { s: 5,  x: "3%",  y: "48%", c: "#6ee7b7", o: 0.05, d: 10.3, dl: 1.1 },
                { s: 7,  x: "91%", y: "22%", c: "#10b981", o: 0.07, d: 8.7,  dl: 3.4 },
                { s: 4,  x: "44%", y: "88%", c: "#6ee7b7", o: 0.05, d: 12.0, dl: 5.9 },
              ].map((dot, i) => (
                <div
                  key={i}
                  className="absolute rounded-full"
                  style={{
                    width: dot.s, height: dot.s,
                    left: dot.x, top: dot.y,
                    background: dot.c, opacity: dot.o,
                    animation: `em-dot-float ${dot.d}s ease-in-out infinite`,
                    animationDelay: `${dot.dl}s`,
                  }}
                />
              ))}
            </div>

            {/* Empty state — EdenIntro animation or prompt card grid */}
            {chatMessages.length === 0 && (
              introPlayed ? (
                <div className="flex flex-col items-center justify-center flex-1 px-4 py-8" data-testid="chat-empty">
                  <div
                    className="flex flex-col items-center mb-6"
                    style={{ animation: "em-fade-up 400ms cubic-bezier(0.16, 1, 0.3, 1) both" }}
                  >
                    <div className="relative mb-4">
                      <EdenAvatar isThinking={chatStreaming} size={52} />
                      {chatStreaming && (
                        <span className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full bg-emerald-500 border-2 border-background animate-pulse" />
                      )}
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground leading-none">
                      <span style={{
                        background: "linear-gradient(135deg, hsl(var(--foreground)) 0%, #10b981 60%, #6ee7b7 100%)",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                        backgroundClip: "text",
                      }}>
                        E · D · E · N
                      </span>
                    </h1>
                    <p className="text-[11px] text-muted-foreground mt-1 tracking-widest uppercase">
                      Engine for Discovery &amp; Emerging Networks
                    </p>
                    {emb?.totalEmbedded != null && (
                      <p className="text-[11px] text-muted-foreground/60 mt-1">
                        {emb.totalEmbedded.toLocaleString()} assets indexed across {institutionCount} institutions
                      </p>
                    )}
                  </div>
                  <div
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 w-full max-w-2xl"
                    style={{ animation: "em-fade-up 400ms cubic-bezier(0.16, 1, 0.3, 1) both", animationDelay: "120ms" }}
                  >
                    {PROMPT_CARDS.map((card, ci) => {
                      const Icon = card.icon;
                      return (
                        <button
                          key={card.q}
                          onClick={() => sendChatMessage(card.q)}
                          disabled={chatStreaming}
                          className={`group text-left rounded-xl border bg-gradient-to-br p-3 sm:p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none ${card.color}`}
                          style={{ animation: "em-fade-up 360ms cubic-bezier(0.16, 1, 0.3, 1) both", animationDelay: `${180 + ci * 45}ms` }}
                          data-testid={`prompt-card-${ci}`}
                        >
                          <Icon className={`h-4 w-4 sm:h-5 sm:w-5 mb-2 sm:mb-2.5 shrink-0 ${card.iconColor}`} />
                          <p className="text-[11px] sm:text-xs font-semibold text-foreground leading-tight">{card.label}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <EdenIntro onDone={handleIntroDone} />
              )
            )}

            {/* Message thread */}
            {chatMessages.length > 0 && (
              <div className="px-4 sm:px-5 py-5 space-y-5 max-w-3xl w-full mx-auto">
                {chatMessages.map((msg, i) => {
                  const followUps = !msg.isStreaming && msg.role === "assistant" && msg.content
                    ? getFollowUpPills(msg.content, (msg.assets?.length ?? 0) > 0)
                    : [];
                  return (
                    <div
                      key={i}
                      className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                      style={{ animation: msg.role === "user" ? "em-slide-user 340ms cubic-bezier(0.16, 1, 0.3, 1) both" : "em-slide-assistant 340ms cubic-bezier(0.16, 1, 0.3, 1) both" }}
                      data-testid={`chat-msg-${i}`}
                    >
                      {msg.role === "assistant" && (
                        <div className="shrink-0 mt-1 mr-2">
                          <EdenAvatar isThinking={!!(msg.isStreaming)} size={22} />
                        </div>
                      )}
                      <div className={`${msg.role === "user" ? "max-w-[78%]" : "flex-1 min-w-0"}`}>
                        <div className={`rounded-2xl px-4 py-3 ${
                          msg.role === "user"
                            ? "rounded-tr-sm bg-emerald-600 text-white text-sm ml-auto w-fit shadow-sm"
                            : "rounded-tl-sm bg-muted/60 border-l-2 border-l-emerald-500/40 text-foreground"
                        }`}>
                          {msg.role === "assistant" && msg.isStreaming && !msg.content && (
                            <div className="flex gap-1 items-center py-0.5">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/70 animate-bounce" style={{ animationDelay: "0ms" }} />
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/70 animate-bounce" style={{ animationDelay: "130ms" }} />
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/70 animate-bounce" style={{ animationDelay: "260ms" }} />
                            </div>
                          )}
                          {msg.role === "user" && (
                            <p className="text-sm leading-relaxed">{msg.content}</p>
                          )}
                          {msg.role === "assistant" && msg.content && (
                            <MarkdownContent text={msg.content} isStreaming={msg.isStreaming} />
                          )}
                        </div>

                        {/* Feedback buttons */}
                        {msg.role === "assistant" && !msg.isStreaming && msg.content && (
                          <div className="flex items-center gap-0.5 mt-1 ml-0.5">
                            <button
                              onClick={() => handleFeedback(i, "up")}
                              className={`p-1 rounded-md transition-colors ${messageFeedback[i] === "up" ? "text-emerald-500" : "text-muted-foreground/30 hover:text-emerald-500"}`}
                              title="Good response"
                              data-testid={`button-feedback-up-${i}`}
                            >
                              <ThumbsUp className="h-3 w-3" fill={messageFeedback[i] === "up" ? "currentColor" : "none"} />
                            </button>
                            <button
                              onClick={() => handleFeedback(i, "down")}
                              className={`p-1 rounded-md transition-colors ${messageFeedback[i] === "down" ? "text-rose-400" : "text-muted-foreground/30 hover:text-rose-400"}`}
                              title="Bad response"
                              data-testid={`button-feedback-down-${i}`}
                            >
                              <ThumbsDown className="h-3 w-3" fill={messageFeedback[i] === "down" ? "currentColor" : "none"} />
                            </button>
                          </div>
                        )}

                        {/* Follow-up pills */}
                        {followUps.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2 ml-0.5" data-testid={`follow-up-pills-${i}`}>
                            {followUps.map((pill, pi) => (
                              <button
                                key={pill}
                                onClick={() => { sendChatMessage(pill); inputRef.current?.focus(); }}
                                disabled={chatStreaming}
                                className="text-[11px] px-2.5 py-1 rounded-full border border-emerald-500/25 bg-emerald-500/5 text-muted-foreground hover:text-foreground hover:border-emerald-500/50 hover:bg-emerald-500/10 transition-all disabled:opacity-40"
                                style={{ animation: "em-pill-in 280ms cubic-bezier(0.16, 1, 0.3, 1) both", animationDelay: `${pi * 60}ms` }}
                                data-testid={`pill-followup-${i}-${pi}`}
                              >
                                {pill}
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Citation cards — deferred behind toggle */}
                        {msg.role === "assistant" && msg.assets && msg.assets.length > 0 && !msg.isStreaming && (
                          <div className="mt-2.5" data-testid={`chat-citations-${i}`}>
                            {!expandedCitations[i] ? (
                              <button
                                className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors group"
                                onClick={() => setExpandedCitations((prev) => ({ ...prev, [i]: true }))}
                                data-testid={`button-show-citations-${i}`}
                              >
                                <ChevronDown className="h-3 w-3 shrink-0 group-hover:text-foreground transition-colors" />
                                Show {msg.assets.length} matched asset{msg.assets.length !== 1 ? "s" : ""}
                              </button>
                            ) : (
                              <>
                                <button
                                  className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors mb-2 group"
                                  onClick={() => setExpandedCitations((prev) => ({ ...prev, [i]: false }))}
                                  data-testid={`button-hide-citations-${i}`}
                                >
                                  <ChevronDown className="h-3 w-3 shrink-0 rotate-180 group-hover:text-foreground transition-colors" />
                                  Hide assets
                                </button>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                  {msg.assets.map((a, ci) => (
                                    <div
                                      key={a.id}
                                      style={{ animation: "em-fade-in 320ms cubic-bezier(0.16, 1, 0.3, 1) both", animationDelay: `${ci * 55}ms` }}
                                    >
                                      <CitationCard asset={a} index={ci} savedIngestedIds={savedIngestedIds} />
                                    </div>
                                  ))}
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div ref={chatEndRef} />
              </div>
            )}
            {chatMessages.length === 0 && <div ref={chatEndRef} />}
          </div>

          {/* Input bar — integrated pill style */}
          <div className="px-4 py-3 border-t border-border bg-background/95 backdrop-blur" data-testid="chat-input-area">
            <div className="flex gap-2 items-center rounded-2xl border border-border bg-card px-3 py-2 shadow-sm focus-within:ring-2 focus-within:ring-emerald-500/30 focus-within:border-emerald-500/50 transition-all">
              <input
                ref={inputRef}
                className="flex-1 text-sm bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground/60"
                placeholder="Ask about targets, mechanisms, institutions, licensing readiness…"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChatMessage(); } }}
                disabled={chatStreaming}
                data-testid="input-chat"
              />
              {speechSupported && (
                <button
                  type="button"
                  onClick={toggleSpeech}
                  disabled={chatStreaming}
                  className={`shrink-0 p-1.5 rounded-lg transition-colors ${isListening ? "text-red-500 bg-red-500/10 animate-pulse" : "text-muted-foreground/50 hover:text-muted-foreground"}`}
                  title={isListening ? "Stop listening" : "Speak your question"}
                  data-testid="button-chat-mic"
                >
                  {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </button>
              )}
              <button
                onClick={() => sendChatMessage()}
                disabled={chatStreaming || !chatInput.trim()}
                className="shrink-0 h-7 w-7 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-600/30 text-white flex items-center justify-center transition-all"
                data-testid="button-chat-send"
              >
                {chatStreaming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
              </button>
            </div>
            {isListening && (
              <p className="text-[11px] text-red-500 mt-1.5 flex items-center justify-center gap-1" data-testid="status-listening">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse inline-block" />
                Listening… speak now
              </p>
            )}
          </div>
        </>
      </div>

      {/* ── EDEN Readiness (collapsible) ── */}
      <div className="rounded-lg border border-border bg-card overflow-hidden" data-testid="card-eden-readiness">
        <button
          className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-muted/40 transition-colors"
          onClick={() => setReadinessOpen((v) => !v)}
          data-testid="button-toggle-readiness"
        >
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">EDEN Readiness</span>
            {embPct >= 100 && deepPct >= 90 ? (
              <span className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 ml-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block"/>
                Active
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground ml-1">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400 inline-block"/>
                Indexing
              </span>
            )}
          </div>
          {readinessOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </button>

        {readinessOpen && (
          <div className="border-t border-border p-5 space-y-6">
            {/* Coverage stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="rounded-lg border border-border bg-muted/20 p-3" data-testid="card-eden-total">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Corpus</p>
                <p className="text-xl font-bold text-foreground mt-0.5">{cov?.totalRelevant?.toLocaleString() ?? "—"}</p>
                <p className="text-[11px] text-muted-foreground">relevant assets</p>
              </div>
              <div className="rounded-lg border border-border bg-muted/20 p-3" data-testid="card-eden-enriched">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Enriched</p>
                <p className="text-xl font-bold text-emerald-600 mt-0.5">{cov?.deepEnriched?.toLocaleString() ?? "—"}</p>
                <p className="text-[11px] text-muted-foreground">{deepPct}% with GPT-4o</p>
              </div>
              <div className="rounded-lg border border-border bg-muted/20 p-3" data-testid="card-eden-embedded">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Embedded</p>
                <p className="text-xl font-bold text-violet-600 mt-0.5">{emb?.totalEmbedded?.toLocaleString() ?? "—"}</p>
                <p className="text-[11px] text-muted-foreground">{embPct}% vectorized</p>
              </div>
              <div className="rounded-lg border border-border bg-muted/20 p-3" data-testid="card-eden-moa">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">With MoA</p>
                <p className="text-xl font-bold text-foreground mt-0.5">{cov?.withMoa?.toLocaleString() ?? "—"}</p>
                <p className="text-[11px] text-muted-foreground">mechanism of action</p>
              </div>
              <div className="rounded-lg border border-border bg-muted/20 p-3" data-testid="card-eden-score">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Completeness</p>
                <p className="text-xl font-bold text-foreground mt-0.5">{cov?.avgCompletenessScore != null ? `${cov.avgCompletenessScore}` : "—"}</p>
                <p className="text-[11px] text-muted-foreground">avg / 100 pts</p>
              </div>
            </div>

            {/* Coverage bars */}
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Deep Enrichment</span><span>{deepPct}%</span>
                </div>
                <Progress value={deepPct} className="h-1.5" />
              </div>
              <div>
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Vector Embeddings</span><span>{embPct}%</span>
                </div>
                <Progress value={embPct} className="h-1.5" />
              </div>
            </div>

            {/* Live EDEN deep enrichment status */}
            {live && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4" data-testid="card-eden-live">
                <div className="flex items-center gap-2 mb-2">
                  <Loader2 className="h-4 w-4 text-emerald-500 animate-spin" />
                  <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                    EDEN Deep Enrichment (GPT-4o) — {live.processed.toLocaleString()} / {live.total.toLocaleString()}
                  </span>
                  <span className="text-sm font-bold text-emerald-600">{pct}%</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => stopEdenMutation.mutate()}
                    disabled={stopEdenMutation.isPending}
                    className="ml-auto h-7 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                    data-testid="button-eden-stop"
                  >
                    {stopEdenMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Stop"}
                  </Button>
                </div>
                <Progress value={pct ?? 0} className="h-1.5" />
              </div>
            )}

            {/* Live embedding status */}
            {embedLive && (
              <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-4" data-testid="card-embed-live">
                <div className="flex items-center gap-2 mb-2">
                  <Loader2 className="h-4 w-4 text-violet-500 animate-spin" />
                  <span className="text-sm font-semibold text-violet-700 dark:text-violet-400">
                    Embedding running — {embedLive.processed.toLocaleString()} / {embedLive.total.toLocaleString()}
                  </span>
                  <span className="ml-auto text-sm font-bold text-violet-600">{embedPct}%</span>
                </div>
                <Progress value={embedPct ?? 0} className="h-1.5" />
              </div>
            )}

            {/* Run enrichment */}
            <div data-testid="card-eden-run">
              <h4 className="text-xs font-semibold text-foreground mb-1">Deep Enrichment Blitz</h4>
              <p className="text-xs text-muted-foreground mb-3">
                GPT-4o extracts MoA, Innovation Claim, Unmet Need, Comparable Drugs &amp; Licensing Readiness for {remaining.toLocaleString()} assets with incomplete deep-enrichment fields.
                Estimated cost: <span className="font-semibold text-foreground">~${estCostUsd}</span>.
              </p>
              {!confirming ? (
                <Button onClick={() => setConfirming(true)} disabled={live != null || remaining === 0} className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs" data-testid="button-eden-run">
                  <PlayCircle className="h-3.5 w-3.5 mr-1.5" />
                  {remaining === 0 ? "All Enriched" : `Enrich ${remaining.toLocaleString()} Assets`}
                </Button>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-xs font-semibold text-amber-600">Consume ~${estCostUsd}? Confirm?</p>
                  <Button onClick={() => startMutation.mutate()} disabled={startMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs" data-testid="button-eden-confirm">
                    {startMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                    Yes, Run
                  </Button>
                  <Button variant="outline" onClick={() => setConfirming(false)} className="h-8 text-xs" data-testid="button-eden-cancel">Cancel</Button>
                </div>
              )}
            </div>

            {/* Run embeddings */}
            <div data-testid="card-eden-embeddings">
              <h4 className="text-xs font-semibold text-foreground mb-1">Vector Embeddings</h4>
              <p className="text-xs text-muted-foreground mb-3">
                {emb?.totalEmbedded?.toLocaleString() ?? "—"} of {emb?.totalRelevant?.toLocaleString() ?? "—"} assets embedded with text-embedding-3-small.
                {embRemaining > 0 && <> Remaining cost: <span className="font-semibold text-foreground">${embEstCost}</span>.</>}
              </p>
              {!embedConfirming ? (
                <Button onClick={() => setEmbedConfirming(true)} disabled={embedLive != null || embRemaining === 0} className="bg-violet-600 hover:bg-violet-700 text-white h-8 text-xs" data-testid="button-embed-run">
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                  {embRemaining === 0 ? "All Embedded" : `Embed ${embRemaining.toLocaleString()} Assets`}
                </Button>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-xs font-semibold text-amber-600">Embed {embRemaining.toLocaleString()} assets (~${embEstCost})?</p>
                  <Button onClick={() => embedMutation.mutate()} disabled={embedMutation.isPending} className="bg-violet-600 hover:bg-violet-700 text-white h-8 text-xs" data-testid="button-embed-confirm">
                    {embedMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                    Yes, Embed
                  </Button>
                  <Button variant="outline" onClick={() => setEmbedConfirming(false)} className="h-8 text-xs" data-testid="button-embed-cancel">Cancel</Button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Admin() {
  const [authed, setAuthed] = useState(false);
  const [activeTab, setActiveTab] = useState("data-health");
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    const stored = localStorage.getItem(ADMIN_KEY);
    if (stored === "eden") setAuthed(true);
  }, []);

  if (!authed) return <PasswordGate onAuth={() => setAuthed(true)} />;

  const pw = localStorage.getItem(ADMIN_KEY) ?? "";

  return <AdminPanel pw={pw} setAuthed={setAuthed} theme={theme} setTheme={setTheme} activeTab={activeTab} setActiveTab={setActiveTab} />;
}

type ParsedImportAsset = {
  name: string;
  description: string;
  sourceUrl: string;
  inventors: string[];
  patentStatus: string;
  technologyId: string;
  contactEmail: string;
  target: string;
  modality: string;
  indication: string;
  developmentStage: string;
  abstract: string;
  categories: string[];
  innovationClaim: string;
  mechanismOfAction: string;
};

// Mirror of server/lib/pipeline/contentHash.ts computeCompletenessScore — same weights, no server call
function computeManualAssetScore(a: ParsedImportAsset): number {
  let score = 0;
  type FieldKey = "target" | "modality" | "indication" | "developmentStage" | "summary" | "abstract" | "categories" | "innovationClaim" | "mechanismOfAction" | "inventors" | "patentStatus";
  const checks: [FieldKey, number][] = [
    ["target", 15], ["modality", 15], ["indication", 15], ["developmentStage", 10],
    ["summary", 10], ["abstract", 10], ["categories", 5], ["innovationClaim", 5],
    ["mechanismOfAction", 5], ["inventors", 5], ["patentStatus", 5],
  ];
  const mapped: Record<FieldKey, string | string[] | null> = {
    target: a.target,
    modality: a.modality,
    indication: a.indication,
    developmentStage: a.developmentStage,
    summary: a.description,
    abstract: a.abstract,
    categories: a.categories,
    innovationClaim: a.innovationClaim,
    mechanismOfAction: a.mechanismOfAction,
    inventors: a.inventors,
    patentStatus: a.patentStatus,
  };
  for (const [field, weight] of checks) {
    const val = mapped[field];
    if (!val || val === "unknown" || val === "") continue;
    if (Array.isArray(val) && val.length === 0) continue;
    if (typeof val === "string" && val.length < 3) continue;
    score += weight;
  }
  return score;
}

function assetGrade(score: number): "pass" | "revisions" | "incomplete" {
  return score >= 75 ? "pass" : score >= 50 ? "revisions" : "incomplete";
}

function getMissingFields(a: ParsedImportAsset): string[] {
  const missing: string[] = [];
  const isMissing = (v: string | string[]) =>
    !v || v === "unknown" || v === "n/a" || v === "" || (Array.isArray(v) && v.length === 0);
  if (isMissing(a.technologyId)) missing.push("Tech ID");
  if (isMissing(a.description)) missing.push("description");
  if (isMissing(a.abstract)) missing.push("abstract");
  if (isMissing(a.inventors)) missing.push("inventors");
  if (isMissing(a.contactEmail)) missing.push("contact email");
  if (isMissing(a.target)) missing.push("target");
  if (isMissing(a.modality)) missing.push("modality");
  if (isMissing(a.indication)) missing.push("indication");
  return missing;
}

function GradeBadge({ grade, score }: { grade: string; score: number }) {
  if (grade === "pass") return (
    <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200">
      Pass ({score})
    </Badge>
  );
  if (grade === "revisions") return (
    <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200">
      Revisions needed ({score})
    </Badge>
  );
  return (
    <Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-red-200">
      Incomplete ({score})
    </Badge>
  );
}

function ManualImportTab({ pw, setActiveTab }: { pw: string; setActiveTab: (tab: string) => void }) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  // Stage: "input" → "preview" → "done"
  const [stage, setStage] = useState<"input" | "preview" | "done">("input");
  const [mode, setMode] = useState<"text" | "image" | "document">("text");

  // Institution combobox state
  const [instSearch, setInstSearch] = useState("");
  const [instOpen, setInstOpen] = useState(false);
  const [selectedInst, setSelectedInst] = useState("");
  const instBlurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (instBlurTimer.current) clearTimeout(instBlurTimer.current); }, []);
  const [showCreateInst, setShowCreateInst] = useState(false);
  const [newInstName, setNewInstName] = useState("");
  const [newInstTtoUrl, setNewInstTtoUrl] = useState("");

  // Input content
  const [pastedText, setPastedText] = useState("");
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [docFiles, setDocFiles] = useState<File[]>([]);

  // Preview stage
  const [parsedAssets, setParsedAssets] = useState<ParsedImportAsset[]>([]);
  const [checked, setChecked] = useState<boolean[]>([]);
  const [parsedInstitution, setParsedInstitution] = useState("");

  // Done stage
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null);

  // Per-image parse warnings
  const [failedImages, setFailedImages] = useState<string[]>([]);

  const { data: instData } = useQuery<{ institutions: string[]; manual: { name: string; ttoUrl: string }[] }>({
    queryKey: ["/api/admin/institutions", pw],
    queryFn: async () => {
      const res = await fetch("/api/admin/institutions", { headers: { "x-admin-password": pw } });
      if (!res.ok) throw new Error("Failed to load institutions");
      return res.json();
    },
  });

  const allInstitutions: string[] = instData?.institutions ?? [];
  const filteredInsts = allInstitutions.filter((n) => n.toLowerCase().includes(instSearch.toLowerCase())).slice(0, 20);

  const createInstMutation = useMutation({
    mutationFn: async () => {
      if (!newInstName.trim()) throw new Error("Institution name is required");
      const res = await fetch("/api/admin/institutions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": pw },
        body: JSON.stringify({ name: newInstName.trim(), ttoUrl: newInstTtoUrl.trim() || undefined }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to create institution");
      return d;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/institutions", pw] });
      setSelectedInst(data.institution.name);
      setInstSearch(data.institution.name);
      setShowCreateInst(false);
      setNewInstName("");
      setNewInstTtoUrl("");
      toast({ title: "Institution saved", description: data.institution.name });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const parseMutation = useMutation({
    mutationFn: async () => {
      if (!selectedInst) throw new Error("Select or create an institution first");
      if (mode === "text" && !pastedText.trim()) throw new Error("Paste some text first");
      if (mode === "image" && imageFiles.length === 0) throw new Error("Upload at least one screenshot");
      if (mode === "document" && docFiles.length === 0) throw new Error("Upload at least one document");

      const formData = new FormData();
      formData.append("institution", selectedInst);
      if (mode === "text") {
        formData.append("rawText", pastedText);
      } else if (mode === "image") {
        for (const file of imageFiles) {
          formData.append("images", file);
        }
      } else {
        for (const file of docFiles) {
          formData.append("documents", file);
        }
      }

      const res = await fetch("/api/admin/manual-import/parse", {
        method: "POST",
        headers: { "x-admin-password": pw },
        body: formData,
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Parse failed");
      return d as { assets: ParsedImportAsset[]; institution: string; failedImages?: string[] };
    },
    onSuccess: (data) => {
      setParsedAssets(data.assets);
      setChecked(data.assets.map(() => true));
      setParsedInstitution(data.institution);
      setFailedImages(data.failedImages ?? []);
      setStage("preview");
    },
    onError: (err: Error) => toast({ title: "Parse failed", description: err.message, variant: "destructive" }),
  });

  const commitMutation = useMutation({
    mutationFn: async () => {
      const selected = parsedAssets.filter((_, i) => checked[i]);
      if (selected.length === 0) throw new Error("Select at least one asset to import");
      const res = await fetch("/api/admin/manual-import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": pw },
        body: JSON.stringify({
          institution: parsedInstitution,
          assets: selected.map(({ name, description, abstract, sourceUrl, inventors, patentStatus, technologyId, contactEmail, target, modality, indication, developmentStage }) =>
            ({ name, description, abstract, sourceUrl, inventors, patentStatus, technologyId, contactEmail, target, modality, indication, developmentStage })
          ),
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Commit failed");
      return d as { imported: number; skipped: number };
    },
    onSuccess: (data) => {
      setImportResult(data);
      setStage("done");
      queryClient.invalidateQueries({ queryKey: ["/api/ingest/new-arrivals"] });
      toast({ title: `Imported ${data.imported} assets`, description: data.skipped > 0 ? `${data.skipped} skipped (duplicates)` : undefined });
    },
    onError: (err: Error) => toast({ title: "Import failed", description: err.message, variant: "destructive" }),
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).slice(0, 10);
    setImageFiles(files);
    const previews = files.map((f) => URL.createObjectURL(f));
    setImagePreviews(previews);
  };

  const selectedCount = checked.filter(Boolean).length;
  const passCnt = parsedAssets.filter((a) => assetGrade(computeManualAssetScore(a)) === "pass").length;
  const revCnt = parsedAssets.filter((a) => assetGrade(computeManualAssetScore(a)) === "revisions").length;
  const incCnt = parsedAssets.filter((a) => assetGrade(computeManualAssetScore(a)) === "incomplete").length;

  const resetToInput = () => {
    setStage("input");
    setParsedAssets([]);
    setChecked([]);
    setImportResult(null);
    setFailedImages([]);
    setPastedText("");
    setImageFiles([]);
    setImagePreviews([]);
    setDocFiles([]);
  };

  return (
    <div className="space-y-6 max-w-4xl" data-testid="manual-import-tab">

      {/* ── Stage 1: Institution + Input ────────────────────── */}
      {stage === "input" && (
        <>
          {/* Institution searchable combobox */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              <h3 className="font-semibold text-foreground">Institution</h3>
            </div>

            <div className="relative w-full">
              <Input
                placeholder="Search institution…"
                value={instSearch}
                onChange={(e) => { setInstSearch(e.target.value); setInstOpen(true); setSelectedInst(""); }}
                onFocus={() => setInstOpen(true)}
                onBlur={() => { instBlurTimer.current = setTimeout(() => setInstOpen(false), 150); }}
                className="pr-8"
                data-testid="input-institution-search"
              />
              {selectedInst ? (
                <button
                  type="button"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 h-5 w-5 flex items-center justify-center rounded-full hover:bg-muted text-muted-foreground transition-colors"
                  onClick={() => { setSelectedInst(""); setInstSearch(""); setShowCreateInst(false); setInstOpen(false); }}
                  data-testid="button-clear-institution"
                  aria-label="Clear institution"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : (
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              )}
              {instOpen && !selectedInst && (
                <div
                  className="absolute top-full left-0 right-0 z-50 mt-1 max-h-64 overflow-y-auto rounded-md border border-border bg-popover shadow-md"
                  data-testid="institution-dropdown"
                >
                  {filteredInsts.map((name) => (
                    <button
                      key={name}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
                      onClick={() => { if (instBlurTimer.current) clearTimeout(instBlurTimer.current); setSelectedInst(name); setInstSearch(name); setInstOpen(false); setShowCreateInst(false); }}
                      data-testid={`inst-option-${name}`}
                    >
                      {name}
                    </button>
                  ))}
                  {instSearch.trim() && !allInstitutions.some((n) => n.toLowerCase() === instSearch.toLowerCase()) && (
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted text-primary font-medium transition-colors flex items-center gap-1.5"
                      onClick={() => { if (instBlurTimer.current) clearTimeout(instBlurTimer.current); setNewInstName(instSearch.trim()); setShowCreateInst(true); setInstOpen(false); }}
                      data-testid="button-create-institution"
                    >
                      <Plus className="h-3.5 w-3.5" /> Create "{instSearch.trim()}"…
                    </button>
                  )}
                  {filteredInsts.length === 0 && !instSearch.trim() && (
                    <p className="px-3 py-2 text-sm text-muted-foreground">Start typing to search…</p>
                  )}
                </div>
              )}
            </div>

            {selectedInst && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1" data-testid="selected-institution-label">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Selected: <strong>{selectedInst}</strong>
              </p>
            )}

            {showCreateInst && (
              <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 space-y-3" data-testid="create-institution-form">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Register New Institution</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input
                    placeholder="Institution name *"
                    value={newInstName}
                    onChange={(e) => setNewInstName(e.target.value)}
                    data-testid="input-new-inst-name"
                  />
                  <Input
                    placeholder="TTO website URL (optional)"
                    value={newInstTtoUrl}
                    onChange={(e) => setNewInstTtoUrl(e.target.value)}
                    data-testid="input-new-inst-url"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => createInstMutation.mutate()}
                    disabled={createInstMutation.isPending || !newInstName.trim()}
                    data-testid="button-save-institution"
                  >
                    {createInstMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}
                    Save & select
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowCreateInst(false)} data-testid="button-cancel-create-inst">
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Input mode */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-muted-foreground" />
              <h3 className="font-semibold text-foreground">TTO Content</h3>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant={mode === "text" ? "default" : "outline"} onClick={() => setMode("text")} className="gap-1.5" data-testid="button-mode-text">
                <FileText className="h-3.5 w-3.5" /> Paste text
              </Button>
              <Button size="sm" variant={mode === "image" ? "default" : "outline"} onClick={() => setMode("image")} className="gap-1.5" data-testid="button-mode-image">
                <ImageIcon className="h-3.5 w-3.5" /> Screenshots
              </Button>
              <Button size="sm" variant={mode === "document" ? "default" : "outline"} onClick={() => setMode("document")} className="gap-1.5" data-testid="button-mode-document">
                <BookOpen className="h-3.5 w-3.5" /> Documents
              </Button>
            </div>

            {mode === "text" ? (
              <Textarea
                placeholder="Paste the TTO listing text — titles, descriptions, inventors, patent info…"
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                className="min-h-[180px] font-mono text-xs"
                data-testid="textarea-paste-text"
              />
            ) : mode === "image" ? (
              <div className="space-y-3">
                <div
                  className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-border rounded-lg p-8 cursor-pointer hover:bg-muted/20 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onDrop={(e) => {
                    e.preventDefault(); e.stopPropagation();
                    const dropped = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/")).slice(0, 10);
                    if (dropped.length > 0) {
                      setImageFiles(dropped);
                      setImagePreviews(dropped.map(f => URL.createObjectURL(f)));
                    }
                  }}
                  data-testid="dropzone-image-upload"
                >
                  <Upload className="h-8 w-8 text-muted-foreground/50" />
                  <div className="text-center">
                    <p className="text-sm font-medium text-foreground">Drag & drop or click to upload screenshots</p>
                    <p className="text-xs text-muted-foreground mt-1">PNG, JPG, WebP — up to 10 images</p>
                  </div>
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileChange} data-testid="input-file-upload" />
                {imagePreviews.length > 0 && (
                  <div className="flex flex-wrap gap-2" data-testid="image-preview-grid">
                    {imagePreviews.map((src, i) => (
                      <img key={i} src={src} alt={`Screenshot ${i + 1}`} className="h-24 w-auto rounded border border-border object-cover" data-testid={`image-preview-${i}`} />
                    ))}
                    <p className="w-full text-xs text-muted-foreground">{imagePreviews.length} image{imagePreviews.length !== 1 ? "s" : ""} ready</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div
                  className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-border rounded-lg p-8 cursor-pointer hover:bg-muted/20 transition-colors"
                  onClick={() => docInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onDrop={(e) => {
                    e.preventDefault(); e.stopPropagation();
                    const allowed = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
                    const dropped = Array.from(e.dataTransfer.files).filter(f => allowed.includes(f.type)).slice(0, 5);
                    if (dropped.length > 0) setDocFiles(dropped);
                  }}
                  data-testid="dropzone-document-upload"
                >
                  <Upload className="h-8 w-8 text-muted-foreground/50" />
                  <div className="text-center">
                    <p className="text-sm font-medium text-foreground">Drag & drop or click to upload documents</p>
                    <p className="text-xs text-muted-foreground mt-1">PDF or DOCX — up to 5 files, 20 MB each</p>
                  </div>
                </div>
                <input
                  ref={docInputRef}
                  type="file"
                  accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const selected = Array.from(e.target.files ?? []).slice(0, 5);
                    setDocFiles(selected);
                    e.target.value = "";
                  }}
                  data-testid="input-doc-upload"
                />
                {docFiles.length > 0 && (
                  <div className="space-y-1" data-testid="doc-file-list">
                    {docFiles.map((f, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground" data-testid={`doc-file-${i}`}>
                        <FileText className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{f.name}</span>
                        <span className="shrink-0 text-muted-foreground/60">({(f.size / 1024).toFixed(0)} KB)</span>
                      </div>
                    ))}
                    <p className="text-xs text-muted-foreground pt-1">{docFiles.length} document{docFiles.length !== 1 ? "s" : ""} ready</p>
                  </div>
                )}
              </div>
            )}

            <Button onClick={() => parseMutation.mutate()} disabled={parseMutation.isPending || !selectedInst} className="gap-2" data-testid="button-parse">
              {parseMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Parsing with AI…</> : <><Zap className="h-4 w-4" /> Parse with AI</>}
            </Button>
          </div>
        </>
      )}

      {/* ── Stage 2: Preview table ─────────────────────────── */}
      {stage === "preview" && (
        <div className="space-y-4" data-testid="preview-stage">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-foreground">{parsedAssets.length} asset{parsedAssets.length !== 1 ? "s" : ""} extracted</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                <span className="text-emerald-600 dark:text-emerald-400">{passCnt} Pass</span>
                {" · "}
                <span className="text-amber-600 dark:text-amber-400">{revCnt} Revisions needed</span>
                {" · "}
                <span className="text-red-600 dark:text-red-400">{incCnt} Incomplete</span>
              </p>
            </div>
            <Button size="sm" variant="ghost" onClick={resetToInput} data-testid="button-back-to-input">
              ← Back
            </Button>
          </div>

          {failedImages.length > 0 && (
            <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 flex items-start gap-2.5" data-testid="failed-images-warning">
              <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                  {failedImages.length} image{failedImages.length !== 1 ? "s" : ""} yielded no asset
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">
                  {failedImages.join(", ")} — the screenshot may be too low resolution, cropped, or show a listing index rather than a single asset page. Try re-uploading a cleaner screenshot.
                </p>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-border overflow-hidden" data-testid="preview-table">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="w-8 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selectedCount === parsedAssets.length}
                      onChange={(e) => setChecked(parsedAssets.map(() => e.target.checked))}
                      data-testid="checkbox-select-all"
                    />
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Name</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground hidden md:table-cell">Description</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground hidden lg:table-cell">Inventors</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Grade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {parsedAssets.map((asset, i) => {
                  const score = computeManualAssetScore(asset);
                  const grade = assetGrade(score);
                  return (
                    <tr key={i} className={`transition-colors ${checked[i] ? "bg-card" : "bg-muted/20 opacity-60"}`} data-testid={`preview-row-${i}`}>
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={checked[i] ?? false}
                          onChange={(e) => { const next = [...checked]; next[i] = e.target.checked; setChecked(next); }}
                          data-testid={`checkbox-asset-${i}`}
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-foreground line-clamp-1">{asset.name}</p>
                        {asset.sourceUrl && (
                          <a href={asset.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline line-clamp-1" data-testid={`link-source-${i}`}>
                            {asset.sourceUrl}
                          </a>
                        )}
                        {asset.patentStatus && asset.patentStatus !== "unknown" && (
                          <p className="text-xs text-muted-foreground mt-0.5">{asset.patentStatus}</p>
                        )}
                      </td>
                      <td className="px-3 py-2.5 hidden md:table-cell max-w-xs">
                        <p className="text-xs text-muted-foreground line-clamp-2">{asset.description || "—"}</p>
                      </td>
                      <td className="px-3 py-2.5 hidden lg:table-cell">
                        <p className="text-xs text-muted-foreground">{asset.inventors.length > 0 ? asset.inventors.join(", ") : "—"}</p>
                      </td>
                      <td className="px-3 py-2.5">
                        <GradeBadge grade={grade} score={score} />
                        {(() => {
                          const missing = getMissingFields(asset);
                          if (missing.length === 0) return null;
                          return (
                            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1" data-testid={`missing-fields-${i}`}>
                              Missing: {missing.join(" · ")}
                            </p>
                          );
                        })()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={() => commitMutation.mutate()}
              disabled={commitMutation.isPending || selectedCount === 0}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
              data-testid="button-import"
            >
              {commitMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Importing…</> : <><PackagePlus className="h-4 w-4" /> Import {selectedCount} selected</>}
            </Button>
            <p className="text-xs text-muted-foreground">{selectedCount} of {parsedAssets.length} selected</p>
          </div>
        </div>
      )}

      {/* ── Stage 3: Done summary ──────────────────────────── */}
      {stage === "done" && importResult && (
        <div className="space-y-4" data-testid="done-stage">
          <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 p-6 space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-6 w-6 text-emerald-500" />
              <h3 className="font-semibold text-emerald-700 dark:text-emerald-400">Import complete</h3>
            </div>
            <div className="flex gap-6 text-sm">
              <div data-testid="text-imported-count">
                <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{importResult.imported}</p>
                <p className="text-xs text-emerald-600 dark:text-emerald-400">Assets added to Indexing Queue</p>
              </div>
              {importResult.skipped > 0 && (
                <div data-testid="text-skipped-count">
                  <p className="text-2xl font-bold text-muted-foreground">{importResult.skipped}</p>
                  <p className="text-xs text-muted-foreground">Skipped (duplicates)</p>
                </div>
              )}
            </div>
            <p className="text-xs text-emerald-600 dark:text-emerald-500">
              AI classification is running in the background. Assets remain in Indexing Queue until you push them to Scout.
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setActiveTab("indexing-queue")}
              className="gap-1.5"
              data-testid="button-go-to-queue"
            >
              <PackagePlus className="h-4 w-4" /> Go to Indexing Queue
            </Button>
            <Button variant="ghost" onClick={resetToInput} data-testid="button-import-more">
              Import more assets
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

type DiscoveryAsset = {
  id: number;
  assetName: string;
  institution: string;
  indication: string;
  modality: string;
  target: string;
  developmentStage: string;
  summary: string | null;
  sourceUrl: string | null;
  firstSeenAt: string;
  previouslySent: boolean;
};

type DispatchLogEntry = {
  id: number;
  sentAt: string;
  subject: string;
  recipients: string[];
  assetIds: number[];
  assetNames: string[];
  assetSourceUrls: string[];
  assetCount: number;
  windowHours: number;
  isTest: boolean;
};

type SubscriberMatchData = {
  userId: string;
  email: string;
  companyName: string;
  therapeuticAreas: string[];
  modalities: string[];
  dealStages: string[];
  totalMatches: number;
  top5AssetIds: number[];
};

type SmartAsset = DiscoveryAsset & {
  score: number;
  matchedFields: string[];
};

function StagePill({ stage }: { stage: string }) {
  const s = stage.toLowerCase();
  let cls = "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300";
  if (s.includes("phase 3") || s.includes("approved")) cls = "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
  else if (s.includes("phase 2")) cls = "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
  else if (s.includes("phase 1")) cls = "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400";
  else if (s.includes("preclinical")) cls = "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
  const label = stage && stage !== "unknown" ? stage.charAt(0).toUpperCase() + stage.slice(1) : "Unknown";
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${cls}`}>{label}</span>;
}

function assetAge(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function DispatchTab({ pw }: { pw: string }) {
  const { toast } = useToast();
  const [windowHours, setWindowHours] = useState(168);
  const [filterInstitutions, setFilterInstitutions] = useState<string[]>([]);
  const [filterModalities, setFilterModalities] = useState<string[]>([]);
  const [filterSearch, setFilterSearch] = useState("");
  const [instDropOpen, setInstDropOpen] = useState(false);
  const [modalDropOpen, setModalDropOpen] = useState(false);
  const [instFilterSearch, setInstFilterSearch] = useState("");
  const instDropRef = useRef<HTMLDivElement>(null);
  const modalDropRef = useRef<HTMLDivElement>(null);
  const [dragOverDigest, setDragOverDigest] = useState(false);
  const [dragDigestIdx, setDragDigestIdx] = useState<number | null>(null);
  const [previewAutoLoading, setPreviewAutoLoading] = useState(false);
  const [historyExpandedId, setHistoryExpandedId] = useState<number | null>(null);
  const [digestAssets, setDigestAssets] = useState<DiscoveryAsset[]>([]);
  const [subject, setSubject] = useState("EdenRadar: {count} new TTO assets from {institution_count} institutions");
  const [recipients, setRecipients] = useState<string[]>([]);
  const [recipientInput, setRecipientInput] = useState("");
  const [testAddress, setTestAddress] = useState("");
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [showInlinePreview, setShowInlinePreview] = useState(false);
  const [colorMode, setColorMode] = useState<"light" | "dark">("light");
  const [showConfirm, setShowConfirm] = useState(false);
  const [isTest, setIsTest] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loadingSubscribers, setLoadingSubscribers] = useState(false);
  const [dispatchMode, setDispatchMode] = useState<"manual" | "smart">("manual");
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);
  const [smartDigests, setSmartDigests] = useState<Record<string, DiscoveryAsset[]>>({});
  const [smartDragOver, setSmartDragOver] = useState(false);
  const [smartDragIdx, setSmartDragIdx] = useState<number | null>(null);
  const [sendingSmartId, setSendingSmartId] = useState<string | null>(null);
  const [sendAllPending, setSendAllPending] = useState(false);
  const [subscriberMgmtOpen, setSubscriberMgmtOpen] = useState(false);
  const [allUsersSearch, setAllUsersSearch] = useState("");
  const [allUsersPage, setAllUsersPage] = useState(1);
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null);
  const [testSubscriberEmail, setTestSubscriberEmail] = useState("");
  const [addingTestSubscriber, setAddingTestSubscriber] = useState(false);
  const [manualWindowInput, setManualWindowInput] = useState("");

  const subscriberCountQuery = useQuery<{ subscribers: { id: string; username: string; effectiveEmail: string }[] }>({
    queryKey: ["/api/admin/dispatch/subscribers"],
    queryFn: async () => {
      const res = await fetch("/api/admin/dispatch/subscribers", { headers: { "x-admin-password": pw } });
      if (!res.ok) return { subscribers: [] };
      return res.json();
    },
    staleTime: 60000,
    enabled: !!pw,
  });

  const windowOptions = [
    { label: "Last 24 hours", value: 24 },
    { label: "Last 48 hours", value: 48 },
    { label: "Last 72 hours", value: 72 },
    { label: "Last 7 days", value: 168 },
    { label: "Last 14 days", value: 336 },
    { label: "Last 30 days", value: 720 },
  ];

  const allInstitutionsQuery = useQuery<{ institutions: string[] }>({
    queryKey: ["/api/admin/all-institutions"],
    queryFn: async () => {
      const r = await fetch("/api/admin/all-institutions", { headers: { "x-admin-password": pw } });
      if (!r.ok) return { institutions: [] };
      return r.json();
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!pw,
  });

  const allUsersQuery = useQuery<{ users: Array<{ id: string; email: string; contactEmail: string | null; subscribedToDigest: boolean; role: string | null }> }>({
    queryKey: ["/api/admin/users"],
    queryFn: async () => {
      const r = await fetch("/api/admin/users", { headers: { "x-admin-password": pw } });
      if (!r.ok) return { users: [] };
      return r.json();
    },
    staleTime: 60 * 1000,
    enabled: !!pw && subscriberMgmtOpen,
  });

  const discoveriesQuery = useQuery<{ assets: DiscoveryAsset[]; windowHours: number }>({
    queryKey: ["/api/admin/new-discoveries", windowHours],
    queryFn: async () => {
      const params = new URLSearchParams({ windowHours: String(windowHours) });
      const r = await fetch(`/api/admin/new-discoveries?${params}`, { headers: { "x-admin-password": pw } });
      if (!r.ok) throw new Error("Failed to load discoveries");
      return r.json();
    },
  });

  const historyQuery = useQuery<{ history: DispatchLogEntry[] }>({
    queryKey: ["/api/admin/dispatch/history"],
    queryFn: async () => {
      const r = await fetch(`/api/admin/dispatch/history`, { headers: { "x-admin-password": pw } });
      if (!r.ok) throw new Error("Failed to load history");
      return r.json();
    },
    enabled: historyOpen,
  });

  const subscriberMatchesQuery = useQuery<{ subscribers: SubscriberMatchData[]; windowHours: number }>({
    queryKey: ["/api/admin/dispatch/subscriber-matches", windowHours],
    queryFn: async () => {
      const r = await fetch(`/api/admin/dispatch/subscriber-matches?windowHours=${windowHours}`, { headers: { "x-admin-password": pw } });
      if (!r.ok) throw new Error("Failed to load subscriber matches");
      return r.json();
    },
    enabled: dispatchMode === "smart" && !!pw,
    staleTime: 2 * 60 * 1000,
  });

  const suggestionsQuery = useQuery<{ assets: SmartAsset[]; windowHours: number }>({
    queryKey: ["/api/admin/dispatch/suggestions", selectedSubId, windowHours],
    queryFn: async () => {
      const r = await fetch(`/api/admin/dispatch/suggestions/${selectedSubId}?windowHours=${windowHours}`, { headers: { "x-admin-password": pw } });
      if (!r.ok) throw new Error("Failed to load suggestions");
      return r.json();
    },
    enabled: dispatchMode === "smart" && !!selectedSubId && !!pw,
    staleTime: 2 * 60 * 1000,
  });

  const sendMutation = useMutation({
    mutationFn: async (payload: { isTest: boolean }) => {
      const r = await fetch("/api/admin/dispatch/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": pw },
        body: JSON.stringify({
          subject,
          recipients,
          testAddress: payload.isTest ? testAddress || recipients[0] : undefined,
          assetIds: digestAssets.map((a) => a.id),
          windowHours,
          isTest: payload.isTest,
          colorMode,
        }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: "Send failed" }));
        throw new Error(err.error ?? "Send failed");
      }
      return r.json();
    },
    onSuccess: (data, payload) => {
      toast({
        title: payload.isTest ? "Test email sent" : "Digest dispatched",
        description: payload.isTest
          ? `Test sent to ${data.sentTo} recipient`
          : `Sent to ${data.sentTo} recipient${data.sentTo !== 1 ? "s" : ""}`,
      });
      setShowConfirm(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dispatch/history"] });
      if (!payload.isTest) setDigestAssets([]);
    },
    onError: (err: Error) => {
      toast({ title: "Send failed", description: err.message, variant: "destructive" });
    },
  });

  const allAssets = discoveriesQuery.data?.assets ?? [];
  const digestIds = new Set(digestAssets.map((a) => a.id));

  const filteredAssets = allAssets.filter((a) => {
    if (digestIds.has(a.id)) return false;
    if (filterSearch && !a.assetName.toLowerCase().includes(filterSearch.toLowerCase()) && !a.indication.toLowerCase().includes(filterSearch.toLowerCase())) return false;
    if (filterInstitutions.length > 0 && !filterInstitutions.includes(a.institution)) return false;
    if (filterModalities.length > 0 && !filterModalities.includes(a.modality ?? "")) return false;
    return true;
  });

  const windowInstCounts = allAssets.reduce<Record<string, number>>((acc, a) => {
    if (a.institution) acc[a.institution] = (acc[a.institution] ?? 0) + 1;
    return acc;
  }, {});
  const institutionOptions = allInstitutionsQuery.data?.institutions ?? Array.from(new Set(allAssets.map((a) => a.institution).filter(Boolean))).sort();
  const modalityOptions = Array.from(new Set(allAssets.map((a) => a.modality).filter((m): m is string => !!m && m !== "unknown"))).sort();
  const visibleInstOptions = instFilterSearch
    ? institutionOptions.filter((n) => n.toLowerCase().includes(instFilterSearch.toLowerCase()))
    : institutionOptions;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (instDropRef.current && !instDropRef.current.contains(e.target as Node)) {
        setInstDropOpen(false);
        setInstFilterSearch("");
      }
      if (modalDropRef.current && !modalDropRef.current.contains(e.target as Node)) {
        setModalDropOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (digestAssets.length === 0) return;
    const timer = setTimeout(async () => {
      setPreviewAutoLoading(true);
      try {
        const r = await fetch("/api/admin/dispatch/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-admin-password": pw },
          body: JSON.stringify({ subject, assetIds: digestAssets.map((a) => a.id), windowHours, isTest: false, colorMode }),
        });
        if (!r.ok) return;
        const { html } = await r.json();
        setPreviewHtml(html);
        setShowInlinePreview(true);
      } catch {
      } finally {
        setPreviewAutoLoading(false);
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [digestAssets, subject, windowHours, colorMode]);

  function insertSubjectToken(token: string) {
    const input = document.querySelector<HTMLInputElement>("[data-testid='input-subject']");
    if (!input) { setSubject((s) => (s + token).slice(0, 200)); return; }
    const start = input.selectionStart ?? subject.length;
    const end = input.selectionEnd ?? subject.length;
    const next = (subject.slice(0, start) + token + subject.slice(end)).slice(0, 200);
    setSubject(next);
    setTimeout(() => { input.focus(); input.setSelectionRange(start + token.length, start + token.length); }, 0);
  }

  function handleDiscoveryDragStart(e: React.DragEvent, asset: DiscoveryAsset) {
    e.dataTransfer.setData("discovery-id", String(asset.id));
    e.dataTransfer.effectAllowed = "copy";
  }
  function handleDigestDragStart(e: React.DragEvent, idx: number) {
    e.dataTransfer.setData("digest-idx", String(idx));
    e.dataTransfer.effectAllowed = "move";
    setDragDigestIdx(idx);
  }
  function handleDigestDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOverDigest(false);
    const discoveryId = e.dataTransfer.getData("discovery-id");
    const fromIdxStr = e.dataTransfer.getData("digest-idx");
    if (discoveryId) {
      const id = Number(discoveryId);
      const asset = allAssets.find((a) => a.id === id);
      if (asset && !digestIds.has(id)) setDigestAssets((prev) => [...prev, asset]);
    } else if (fromIdxStr !== "") {
      const fromIdx = Number(fromIdxStr);
      const toIdx = dragDigestIdx !== null ? dragDigestIdx : digestAssets.length - 1;
      if (fromIdx !== toIdx) {
        setDigestAssets((prev) => {
          const arr = [...prev];
          const [moved] = arr.splice(fromIdx, 1);
          arr.splice(toIdx, 0, moved);
          return arr;
        });
      }
    }
    setDragDigestIdx(null);
  }
  function handleDigestItemDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    setDragDigestIdx(idx);
  }

  function addToDigest(asset: DiscoveryAsset) {
    setDigestAssets((prev) => [...prev, asset]);
  }

  function removeFromDigest(id: number) {
    setDigestAssets((prev) => prev.filter((a) => a.id !== id));
  }

  function moveUp(index: number) {
    if (index === 0) return;
    setDigestAssets((prev) => {
      const arr = [...prev];
      [arr[index - 1], arr[index]] = [arr[index], arr[index - 1]];
      return arr;
    });
  }

  function moveDown(index: number) {
    setDigestAssets((prev) => {
      if (index >= prev.length - 1) return prev;
      const arr = [...prev];
      [arr[index], arr[index + 1]] = [arr[index + 1], arr[index]];
      return arr;
    });
  }

  async function loadSubscribers() {
    setLoadingSubscribers(true);
    try {
      const res = await fetch("/api/admin/dispatch/subscribers", {
        headers: { "x-admin-password": pw },
      });
      if (!res.ok) throw new Error("Failed to load subscribers");
      const { subscribers } = await res.json() as { subscribers: { id: string; username: string; effectiveEmail: string }[] };
      const newEmails = subscribers.map((s) => s.effectiveEmail).filter(Boolean);
      setRecipients((prev) => {
        const combined = [...prev];
        for (const email of newEmails) {
          if (!combined.includes(email)) combined.push(email);
        }
        return combined;
      });
      toast({
        title: `${newEmails.length} subscriber${newEmails.length !== 1 ? "s" : ""} loaded`,
        description: newEmails.length === 0 ? "No subscribed users found. Subscribe users in Account Center." : `${newEmails.join(", ")}`,
      });
    } catch (err: any) {
      toast({ title: "Failed to load subscribers", description: err.message, variant: "destructive" });
    } finally {
      setLoadingSubscribers(false);
    }
  }

  function addRecipient() {
    const email = recipientInput.trim().toLowerCase();
    const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRx.test(email)) {
      toast({ title: "Invalid email", description: `"${email}" is not a valid email address.`, variant: "destructive" });
      return;
    }
    if (recipients.includes(email)) {
      toast({ title: "Already added", description: `${email} is already in the recipient list.` });
      setRecipientInput("");
      return;
    }
    setRecipients((prev) => [...prev, email]);
    setRecipientInput("");
  }

  async function generatePreview() {
    if (digestAssets.length === 0) {
      toast({ title: "No assets selected", description: "Add at least one asset to the Digest Zone first.", variant: "destructive" });
      return;
    }
    setPreviewLoading(true);
    try {
      const r = await fetch("/api/admin/dispatch/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": pw },
        body: JSON.stringify({
          subject,
          assetIds: digestAssets.map((a) => a.id),
          windowHours,
          isTest: false,
          colorMode,
        }),
      });
      if (!r.ok) throw new Error("Preview failed");
      const { html } = await r.json();
      setPreviewHtml(html);
      setShowInlinePreview(true);
    } catch {
      const windowLabel = windowOptions.find((o) => o.value === windowHours)?.label ?? `${windowHours}h`;
      const html = buildFallbackPreview(subject, digestAssets, windowLabel);
      setPreviewHtml(html);
      setShowInlinePreview(true);
    } finally {
      setPreviewLoading(false);
    }
  }

  function buildFallbackPreview(subj: string, assets: DiscoveryAsset[], windowLabel: string): string {
    const byInst = new Map<string, DiscoveryAsset[]>();
    for (const a of assets) {
      const inst = a.institution || "Unknown";
      if (!byInst.has(inst)) byInst.set(inst, []);
      byInst.get(inst)!.push(a);
    }
    const cards = Array.from(byInst.entries()).map(([inst, items]) => `
      <div style="margin-bottom:20px;">
        <p style="margin:0 0 8px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;">${inst}</p>
        ${items.map((a) => `
          <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px 18px;margin-bottom:10px;">
            <p style="margin:0 0 6px;font-size:14px;font-weight:600;color:#111827;">${a.assetName}</p>
            <p style="margin:0 0 8px;font-size:12px;color:#6b7280;">${a.indication !== "unknown" ? a.indication : ""} &bull; ${a.modality !== "unknown" ? a.modality : ""}</p>
            ${a.summary ? `<p style="margin:0;font-size:12px;color:#4b5563;">${a.summary.slice(0, 180)}...</p>` : ""}
            ${a.sourceUrl ? `<a href="${a.sourceUrl}" style="font-size:11px;color:#4f46e5;">View Listing &rarr;</a>` : ""}
          </div>`).join("")}
      </div>`).join("");
    return `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:24px;background:#f3f4f6;">
      <div style="max-width:620px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#1e1b4b,#312e81);padding:24px 28px;">
          <p style="margin:0;color:#fff;font-size:20px;font-weight:800;">EdenRadar</p>
          <p style="margin:4px 0 0;color:#a5b4fc;font-size:13px;">TTO Intelligence Digest &mdash; ${windowLabel}</p>
        </div>
        <div style="padding:24px 28px;">${cards}</div>
        <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 28px;">
          <p style="margin:0;font-size:11px;color:#9ca3af;">&copy; ${new Date().getFullYear()} EdenRadar. All rights reserved.</p>
        </div>
      </div></body></html>`;
  }

  function handleSendClick(test: boolean) {
    if (digestAssets.length === 0) {
      toast({ title: "Digest Zone is empty", description: "Add assets to the Digest Zone before dispatching.", variant: "destructive" });
      return;
    }
    if (!test && recipients.length === 0) {
      toast({ title: "No recipients", description: "Add at least one subscriber email address.", variant: "destructive" });
      return;
    }
    if (test && !testAddress && recipients.length === 0) {
      toast({ title: "No test address", description: "Enter a test send address or add a subscriber.", variant: "destructive" });
      return;
    }
    if (!subject.trim()) {
      toast({ title: "Subject required", description: "Enter a subject line for the digest.", variant: "destructive" });
      return;
    }
    setIsTest(test);
    setShowConfirm(true);
  }

  const windowLabel = windowOptions.find((o) => o.value === windowHours)?.label ?? `${windowHours}h`;

  function getSmartDigest(userId: string): DiscoveryAsset[] {
    return smartDigests[userId] ?? [];
  }

  function addToSmartDigest(userId: string, asset: DiscoveryAsset) {
    setSmartDigests((prev) => ({ ...prev, [userId]: [...(prev[userId] ?? []), asset] }));
  }

  function removeFromSmartDigest(userId: string, assetId: number) {
    setSmartDigests((prev) => ({ ...prev, [userId]: (prev[userId] ?? []).filter((a) => a.id !== assetId) }));
  }

  function addTop5(userId: string) {
    const suggestions = suggestionsQuery.data?.assets ?? [];
    const already = new Set(getSmartDigest(userId).map((a) => a.id));
    const top5 = suggestions.filter((a) => !already.has(a.id)).slice(0, 5);
    setSmartDigests((prev) => ({ ...prev, [userId]: [...(prev[userId] ?? []), ...top5] }));
  }

  async function sendSmartDigest(sub: SubscriberMatchData): Promise<void> {
    const staged = getSmartDigest(sub.userId);
    const r = await fetch("/api/admin/dispatch/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-password": pw },
      body: JSON.stringify({
        subject: `EdenRadar: ${staged.length} new TTO asset${staged.length !== 1 ? "s" : ""} matched for you`,
        recipients: [sub.email],
        assetIds: staged.map((a) => a.id),
        windowHours,
        isTest: false,
        colorMode,
      }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({ error: "Send failed" }));
      throw new Error(err.error ?? "Send failed");
    }
    setSmartDigests((prev) => ({ ...prev, [sub.userId]: [] }));
    queryClient.invalidateQueries({ queryKey: ["/api/admin/dispatch/history"] });
  }

  async function sendToSubscriber(sub: SubscriberMatchData) {
    const staged = getSmartDigest(sub.userId);
    if (staged.length === 0) {
      toast({ title: "No assets staged", description: "Add assets to this subscriber's digest zone first.", variant: "destructive" });
      return;
    }
    setSendingSmartId(sub.userId);
    try {
      await sendSmartDigest(sub);
      toast({ title: `Sent to ${sub.email}`, description: `${staged.length} asset${staged.length !== 1 ? "s" : ""} dispatched.` });
    } catch (err: any) {
      toast({ title: "Send failed", description: err.message, variant: "destructive" });
    } finally {
      setSendingSmartId(null);
    }
  }

  async function sendAllPersonalized() {
    const subs = subscriberMatchesQuery.data?.subscribers ?? [];
    const subsWithDigests = subs.filter((s) => getSmartDigest(s.userId).length > 0);
    if (subsWithDigests.length === 0) {
      toast({ title: "No staged digests", description: "Stage assets for at least one subscriber first.", variant: "destructive" });
      return;
    }
    setSendAllPending(true);
    let sent = 0; let failed = 0;
    for (const sub of subsWithDigests) {
      try { await sendSmartDigest(sub); sent++; } catch { failed++; }
    }
    setSendAllPending(false);
    toast({
      title: failed === 0 ? `${sent} personalized digest${sent !== 1 ? "s" : ""} sent` : `${sent} sent, ${failed} failed`,
      variant: failed > 0 ? "destructive" : "default",
    });
  }

  const selectedSub = (subscriberMatchesQuery.data?.subscribers ?? []).find((s) => s.userId === selectedSubId) ?? null;
  const smartQueueAssets = suggestionsQuery.data?.assets ?? [];
  const smartStagedIds = new Set(getSmartDigest(selectedSubId ?? "").map((a) => a.id));

  return (
    <div className="space-y-0">
      <div className="mb-4">
        <h2 className="text-2xl font-semibold text-foreground" data-testid="text-section-title">Dispatch</h2>
        <p className="text-sm text-muted-foreground mt-1">Curate new TTO discoveries into a branded email digest and send to subscriber lists.</p>
      </div>

      <div className="mb-5 flex items-center gap-1 p-1 bg-muted rounded-lg w-fit" data-testid="toggle-dispatch-mode">
        <button
          onClick={() => setDispatchMode("manual")}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${dispatchMode === "manual" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          data-testid="button-mode-manual"
        >
          Manual
        </button>
        <button
          onClick={() => setDispatchMode("smart")}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${dispatchMode === "smart" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          data-testid="button-mode-smart"
        >
          Smart
        </button>
      </div>

      {dispatchMode === "manual" && <div className="flex gap-4 items-start">

        {/* LEFT: Discovery Browser */}
        <div className="w-80 shrink-0 flex flex-col gap-3">
          <div className="border border-border rounded-xl p-4 bg-card space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">New Discoveries</p>
              {discoveriesQuery.isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              {!discoveriesQuery.isLoading && (
                <span className="text-[11px] text-muted-foreground">{allAssets.length} found</span>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex flex-wrap gap-1">
                {[{ label: "24h", value: 24 }, { label: "48h", value: 48 }, { label: "7d", value: 168 }, { label: "14d", value: 336 }, { label: "30d", value: 720 }].map((o) => (
                  <button
                    key={o.value}
                    onClick={() => { setWindowHours(o.value); setManualWindowInput(""); setFilterInstitutions([]); setFilterModalities([]); }}
                    className={`h-6 px-2.5 text-[10px] font-medium rounded-full border transition-colors ${windowHours === o.value && !manualWindowInput ? "bg-primary text-white border-primary" : "border-border text-muted-foreground hover:border-primary/50 hover:text-primary"}`}
                    data-testid={`button-window-preset-${o.label}`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={1}
                  max={8760}
                  placeholder="Custom hrs"
                  value={manualWindowInput}
                  onChange={(e) => {
                    setManualWindowInput(e.target.value);
                    const n = parseInt(e.target.value, 10);
                    if (!isNaN(n) && n >= 1 && n <= 8760) { setWindowHours(n); setFilterInstitutions([]); setFilterModalities([]); }
                  }}
                  className="flex-1 h-6 px-2 text-[10px] border border-border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
                  data-testid="input-window-custom-hours"
                />
                <span className="text-[10px] text-muted-foreground shrink-0">hrs</span>
              </div>
            </div>

            <div className="relative">
              <input
                type="text"
                placeholder="Search by name or indication..."
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setFilterSearch("")}
                className="w-full h-8 px-3 pr-7 text-xs border border-border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
                data-testid="input-filter-search"
              />
              {filterSearch && (
                <button
                  onClick={() => setFilterSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  data-testid="button-clear-search"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="flex gap-2">
              {/* Institution multi-select */}
              <div className="relative flex-1" ref={instDropRef}>
                <button
                  onClick={() => { setInstDropOpen((o) => !o); setModalDropOpen(false); if (!instDropOpen) setInstFilterSearch(""); }}
                  className={`w-full h-7 px-2.5 text-xs border rounded-md bg-background text-left flex items-center justify-between gap-1 ${filterInstitutions.length > 0 ? "border-primary/50 text-primary" : "border-border text-muted-foreground"}`}
                  data-testid="button-filter-institutions"
                >
                  <span className="truncate">{filterInstitutions.length > 0 ? `Inst (${filterInstitutions.length})` : "Institution"}</span>
                  <ChevronDown className="h-3 w-3 shrink-0" />
                </button>
                {instDropOpen && (
                  <div className="absolute z-30 top-8 left-0 w-64 bg-popover border border-border rounded-lg shadow-lg flex flex-col max-h-64">
                    <div className="p-1.5 border-b border-border shrink-0">
                      <input
                        type="text"
                        placeholder="Search institutions..."
                        value={instFilterSearch}
                        onChange={(e) => setInstFilterSearch(e.target.value)}
                        className="w-full h-6 px-2 text-xs bg-background border border-border rounded focus:outline-none"
                        data-testid="input-inst-search"
                        autoFocus
                      />
                    </div>
                    <div className="overflow-y-auto flex-1 p-1">
                      {discoveriesQuery.isLoading && (
                        <div className="px-2.5 py-3 text-xs text-muted-foreground text-center">Loading...</div>
                      )}
                      {visibleInstOptions.length === 0 && (
                        <div className="px-2.5 py-3 text-xs text-muted-foreground text-center">
                          {instFilterSearch ? `No match for "${instFilterSearch}"` : allInstitutionsQuery.isLoading ? "Loading..." : "No institutions found"}
                        </div>
                      )}
                      {visibleInstOptions.length > 0 && (
                        <>
                          <button onClick={() => setFilterInstitutions([])} className="w-full text-left px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted rounded" data-testid="button-clear-inst-filter">Clear all</button>
                          {visibleInstOptions.map((inst) => {
                            const windowCount = windowInstCounts[inst] ?? 0;
                            return (
                              <label key={inst} className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-muted rounded cursor-pointer">
                                <input type="checkbox" checked={filterInstitutions.includes(inst)} onChange={() => setFilterInstitutions((prev) => prev.includes(inst) ? prev.filter((i) => i !== inst) : [...prev, inst])} className="h-3 w-3 accent-primary" />
                                <span className="text-xs text-foreground truncate flex-1">{inst}</span>
                                {windowCount > 0 && (
                                  <span className="shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">{windowCount}</span>
                                )}
                              </label>
                            );
                          })}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
              {/* Modality multi-select */}
              <div className="relative flex-1" ref={modalDropRef}>
                <button
                  onClick={() => { setModalDropOpen((o) => !o); setInstDropOpen(false); }}
                  className={`w-full h-7 px-2.5 text-xs border rounded-md bg-background text-left flex items-center justify-between gap-1 ${filterModalities.length > 0 ? "border-primary/50 text-primary" : "border-border text-muted-foreground"}`}
                  data-testid="button-filter-modalities"
                >
                  <span className="truncate">{filterModalities.length > 0 ? `Mod (${filterModalities.length})` : "Modality"}</span>
                  <ChevronDown className="h-3 w-3 shrink-0" />
                </button>
                {modalDropOpen && (
                  <div className="absolute z-30 top-8 left-0 w-48 bg-popover border border-border rounded-lg shadow-lg max-h-52 overflow-y-auto">
                    <div className="p-1">
                      {discoveriesQuery.isLoading && (
                        <div className="px-2.5 py-3 text-xs text-muted-foreground text-center">Loading...</div>
                      )}
                      {!discoveriesQuery.isLoading && modalityOptions.length === 0 && (
                        <div className="px-2.5 py-3 text-xs text-muted-foreground text-center">No modalities in this window</div>
                      )}
                      {!discoveriesQuery.isLoading && modalityOptions.length > 0 && (
                        <>
                          <button onClick={() => setFilterModalities([])} className="w-full text-left px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted rounded">Clear all</button>
                          {modalityOptions.map((m) => (
                            <label key={m} className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-muted rounded cursor-pointer">
                              <input type="checkbox" checked={filterModalities.includes(m)} onChange={() => setFilterModalities((prev) => prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m])} className="h-3 w-3 accent-primary" />
                              <span className="text-xs text-foreground">{m.charAt(0).toUpperCase() + m.slice(1)}</span>
                            </label>
                          ))}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
            {(filterInstitutions.length > 0 || filterModalities.length > 0) && (
              <div className="flex flex-wrap gap-1 items-center">
                {filterInstitutions.map((inst) => (
                  <span key={inst} className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-medium">
                    {inst.length > 18 ? inst.slice(0, 18) + "…" : inst}
                    <button onClick={() => setFilterInstitutions((p) => p.filter((i) => i !== inst))} className="ml-0.5 text-primary/60 hover:text-primary"><X className="h-2.5 w-2.5" /></button>
                  </span>
                ))}
                {filterModalities.map((m) => (
                  <span key={m} className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 text-[10px] font-medium">
                    {m}
                    <button onClick={() => setFilterModalities((p) => p.filter((x) => x !== m))} className="ml-0.5 text-violet-500 hover:text-violet-700"><X className="h-2.5 w-2.5" /></button>
                  </span>
                ))}
                <button
                  onClick={() => { setFilterInstitutions([]); setFilterModalities([]); }}
                  className="text-[10px] text-muted-foreground hover:text-foreground underline ml-1"
                  data-testid="button-clear-filter-chips"
                >
                  Clear all
                </button>
              </div>
            )}
          </div>

          <div className="border border-border rounded-xl bg-card overflow-hidden flex flex-col" style={{ maxHeight: "calc(100vh - 320px)" }}>
            <div className="overflow-y-auto flex-1 divide-y divide-border">
              {discoveriesQuery.isLoading && (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />
                  Loading discoveries...
                </div>
              )}
              {!discoveriesQuery.isLoading && filteredAssets.length === 0 && (
                <div className="p-6 text-center space-y-2">
                  <p className="text-sm text-muted-foreground">
                    {allAssets.length === 0
                      ? "No new assets in this window."
                      : filterSearch
                        ? `No results for "${filterSearch}"`
                        : "No assets match the selected filters."}
                  </p>
                  {(filterSearch || filterInstitutions.length > 0 || filterModalities.length > 0) && (
                    <button
                      onClick={() => { setFilterSearch(""); setFilterInstitutions([]); setFilterModalities([]); }}
                      className="text-xs text-primary hover:underline"
                      data-testid="button-clear-all-filters"
                    >
                      Clear all filters
                    </button>
                  )}
                </div>
              )}
              {(() => {
                const groupMap = new Map<string, typeof filteredAssets>();
                for (const asset of filteredAssets) {
                  const inst = asset.institution || "Unknown";
                  if (!groupMap.has(inst)) groupMap.set(inst, []);
                  groupMap.get(inst)!.push(asset);
                }
                const sortedGroups = Array.from(groupMap.entries())
                  .map(([inst, assets]) => ({ inst, assets }))
                  .sort((a, b) => a.inst.localeCompare(b.inst));
                return sortedGroups.map(({ inst, assets: grpAssets }) => (
                  <div key={inst}>
                    <div className="flex items-center justify-between px-3 py-1.5 bg-muted/60 border-b border-border sticky top-0 z-10">
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide truncate">{inst}</span>
                      <button
                        onClick={() => {
                          const toAdd = grpAssets.filter((a) => !digestIds.has(a.id));
                          setDigestAssets((prev) => [...prev, ...toAdd]);
                        }}
                        className="shrink-0 text-[9px] text-primary/70 hover:text-primary flex items-center gap-0.5 font-medium"
                        data-testid={`button-add-all-${inst.replace(/\s+/g, "-")}`}
                        title={`Add all ${grpAssets.length} from ${inst}`}
                      >
                        <Plus className="h-2.5 w-2.5" />Add all
                      </button>
                    </div>
                    {grpAssets.map((asset) => (
                      <div
                        key={asset.id}
                        draggable
                        onDragStart={(e) => handleDiscoveryDragStart(e, asset)}
                        className="p-3 hover:bg-muted/40 transition-colors group cursor-grab active:cursor-grabbing"
                        data-testid={`card-discovery-${asset.id}`}
                      >
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-foreground truncate leading-snug">{asset.assetName}</p>
                            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                              <span className="text-[9px] text-muted-foreground/50">{assetAge(asset.firstSeenAt)}</span>
                              {asset.sourceUrl && (
                                <a href={asset.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-[9px] text-primary/60 hover:text-primary" title="View source" onClick={(e) => e.stopPropagation()} data-testid={`link-source-${asset.id}`}>
                                  <ExternalLink className="h-2.5 w-2.5" />
                                </a>
                              )}
                            </div>
                            {asset.indication && asset.indication !== "unknown" && (
                              <p className="text-[10px] text-muted-foreground/80 truncate mt-0.5">{asset.indication}</p>
                            )}
                            {asset.target && asset.target !== "unknown" && (
                              <p className="text-[10px] text-amber-600/80 dark:text-amber-400/70 truncate font-mono">&#x2192; {asset.target}</p>
                            )}
                            <div className="mt-1 flex flex-wrap gap-1">
                              <StagePill stage={asset.developmentStage} />
                              {asset.modality && asset.modality !== "unknown" && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 text-[9px] font-medium">
                                  {asset.modality.charAt(0).toUpperCase() + asset.modality.slice(1)}
                                </span>
                              )}
                              {asset.previouslySent && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 text-[9px] font-semibold">
                                  <Check className="h-2.5 w-2.5" /> Sent
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => addToDigest(asset)}
                            className="shrink-0 opacity-0 group-hover:opacity-100 h-6 w-6 rounded-full bg-primary/10 text-primary hover:bg-primary hover:text-white flex items-center justify-center transition-all"
                            data-testid={`button-add-asset-${asset.id}`}
                            title="Add to digest (or drag)"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>

        {/* RIGHT: Compose + Digest Zone */}
        <div className="flex-1 space-y-4">

          {/* Subject Line */}
          <div className="border border-border rounded-xl p-4 bg-card space-y-2">
            <label className="text-xs font-semibold text-foreground uppercase tracking-wide">Subject Line</label>
            <div className="relative">
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value.slice(0, 200))}
                maxLength={200}
                className="w-full h-9 px-3 pr-40 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
                data-testid="input-subject"
              />
              <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-[10px] ${subject.length > 60 ? "text-red-500 font-semibold" : subject.length > 55 ? "text-orange-500 font-medium" : "text-muted-foreground"}`}>
                {subject.length}/200 {subject.length > 60 ? "(clients may truncate)" : subject.length > 55 ? "(approaching 60-char limit)" : ""}
              </span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-muted-foreground">Insert value:</span>
              {[
                { label: "{count}", hint: `will resolve to: ${digestAssets.length}` },
                { label: "{institution_count}", hint: `will resolve to: ${new Set(digestAssets.map((a) => a.institution)).size}` },
                { label: "{date}", hint: `will resolve to: ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` },
              ].map(({ label, hint }) => (
                <button
                  key={label}
                  onClick={() => insertSubjectToken(label)}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors font-mono"
                  data-testid={`button-token-${label.replace(/[{}]/g, "")}`}
                  title={hint}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Recipients */}
          <div className="border border-border rounded-xl p-4 bg-card space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-foreground uppercase tracking-wide">Subscriber Recipients</label>
              <Button
                size="sm"
                variant="outline"
                onClick={loadSubscribers}
                disabled={loadingSubscribers}
                className="h-7 px-2.5 text-xs gap-1.5"
                data-testid="button-load-subscribers"
              >
                {loadingSubscribers ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Users className="h-3 w-3" />
                )}
                Load {subscriberCountQuery.data?.subscribers.length ?? 0} subscriber{(subscriberCountQuery.data?.subscribers.length ?? 0) !== 1 ? "s" : ""}
              </Button>
            </div>
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="subscriber@company.com"
                value={recipientInput}
                onChange={(e) => setRecipientInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addRecipient(); } }}
                className="flex-1 h-8 px-3 text-sm border border-border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
                data-testid="input-recipient"
              />
              <Button size="sm" variant="outline" onClick={addRecipient} className="h-8 px-3" data-testid="button-add-recipient">
                <Tag className="h-3.5 w-3.5" />
              </Button>
            </div>
            {recipients.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {recipients.map((email) => (
                  <span key={email} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium" data-testid={`tag-recipient-${email}`}>
                    {email}
                    <button onClick={() => setRecipients((prev) => prev.filter((r) => r !== email))} className="text-primary/60 hover:text-primary" data-testid={`button-remove-recipient-${email}`}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Enter emails and press Enter or comma to add.</p>
            )}
            <div className="border-t border-border pt-3">
              <label className="text-xs font-semibold text-foreground uppercase tracking-wide block mb-1.5">Test Send Address</label>
              <input
                type="email"
                placeholder="your@email.com (for test sends only)"
                value={testAddress}
                onChange={(e) => setTestAddress(e.target.value)}
                className="w-full h-8 px-3 text-sm border border-border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
                data-testid="input-test-address"
              />
              <p className="text-[11px] text-muted-foreground mt-1">When blank, test send uses the first subscriber above.</p>
            </div>
          </div>

          {/* Digest Zone */}
          <div className="border border-border rounded-xl bg-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Digest Zone</p>
                <span className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{digestAssets.length} asset{digestAssets.length !== 1 ? "s" : ""}</span>
              </div>
              {digestAssets.length > 0 && (
                <button onClick={() => setDigestAssets([])} className="text-xs text-muted-foreground hover:text-destructive transition-colors" data-testid="button-clear-digest">
                  Clear all
                </button>
              )}
            </div>

            <div
              onDragOver={(e) => { e.preventDefault(); setDragOverDigest(true); }}
              onDragLeave={() => setDragOverDigest(false)}
              onDrop={handleDigestDrop}
              className={`min-h-[80px] transition-colors ${dragOverDigest ? "bg-primary/5 ring-2 ring-primary/20 ring-inset" : ""}`}
            >
              {digestAssets.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  <Send className="h-8 w-8 mx-auto mb-2 opacity-20" />
                  <p>Drag discoveries here, or click the + button to add.</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {digestAssets.map((asset, i) => (
                    <div
                      key={asset.id}
                      draggable
                      onDragStart={(e) => handleDigestDragStart(e, i)}
                      onDragOver={(e) => handleDigestItemDragOver(e, i)}
                      className={`flex items-start gap-3 px-4 py-3 transition-colors cursor-grab active:cursor-grabbing ${dragDigestIdx === i ? "bg-primary/5" : "hover:bg-muted/30"}`}
                      data-testid={`digest-item-${asset.id}`}
                    >
                      <div className="flex flex-col gap-0.5 pt-0.5 text-muted-foreground/40">
                        <ArrowUp className="h-2.5 w-2.5" />
                        <ArrowDown className="h-2.5 w-2.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{asset.assetName}</p>
                        <p className="text-xs text-muted-foreground truncate">{asset.institution}</p>
                        <div className="mt-1 flex gap-1.5 flex-wrap">
                          <StagePill stage={asset.developmentStage} />
                          {asset.modality && asset.modality !== "unknown" && (
                            <span className="text-[10px] bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 px-2 py-0.5 rounded-full">
                              {asset.modality.charAt(0).toUpperCase() + asset.modality.slice(1)}
                            </span>
                          )}
                          {asset.previouslySent && (
                            <span className="text-[9px] bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 px-1.5 py-0.5 rounded-full font-semibold">
                              Previously sent
                            </span>
                          )}
                        </div>
                        {asset.summary && (
                          <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{asset.summary}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0 mt-0.5">
                        <button onClick={() => moveUp(i)} disabled={i === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-20" data-testid={`button-move-up-${asset.id}`} title="Move up">
                          <ArrowUp className="h-3 w-3" />
                        </button>
                        <button onClick={() => moveDown(i)} disabled={i === digestAssets.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-20" data-testid={`button-move-down-${asset.id}`} title="Move down">
                          <ArrowDown className="h-3 w-3" />
                        </button>
                        <button onClick={() => removeFromDigest(asset.id)} className="text-muted-foreground hover:text-destructive transition-colors" data-testid={`button-remove-digest-${asset.id}`} title="Remove">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Action Bar */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex rounded-md border border-border overflow-hidden text-[11px] font-medium" data-testid="toggle-color-mode-bar">
              <button
                onClick={() => setColorMode("light")}
                className={`px-2.5 py-1.5 transition-colors ${colorMode === "light" ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground hover:text-foreground"}`}
                data-testid="button-bar-color-mode-light"
                title="Light email theme"
              >
                Light
              </button>
              <button
                onClick={() => setColorMode("dark")}
                className={`px-2.5 py-1.5 transition-colors ${colorMode === "dark" ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground hover:text-foreground"}`}
                data-testid="button-bar-color-mode-dark"
                title="Dark email theme"
              >
                Dark
              </button>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={generatePreview}
              disabled={previewLoading || digestAssets.length === 0}
              className="gap-1.5"
              data-testid="button-generate-preview"
            >
              {(previewLoading || previewAutoLoading) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
              {showInlinePreview ? "Refresh Preview" : "Preview Email"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleSendClick(true)}
              disabled={sendMutation.isPending || digestAssets.length === 0}
              className="gap-1.5"
              data-testid="button-test-send"
            >
              <Send className="h-3.5 w-3.5" />
              Test Send
            </Button>
            <Button
              size="sm"
              onClick={() => handleSendClick(false)}
              disabled={sendMutation.isPending || digestAssets.length === 0}
              className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white"
              data-testid="button-dispatch"
            >
              {sendMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Dispatch Digest
            </Button>
            {recipients.length > 0 && (
              <span className="text-xs text-muted-foreground">{recipients.length} recipient{recipients.length !== 1 ? "s" : ""}</span>
            )}
          </div>

          {/* Inline Preview Panel */}
          {showInlinePreview && previewHtml && (
            <div className="border border-border rounded-xl overflow-hidden bg-card" data-testid="panel-email-preview">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
                <p className="text-xs font-semibold text-foreground uppercase tracking-wide flex items-center gap-2">
                  <Eye className="h-3.5 w-3.5" />
                  Email Preview
                </p>
                <div className="flex items-center gap-2">
                  <div className="flex rounded-md border border-border overflow-hidden text-[11px] font-medium" data-testid="toggle-color-mode">
                    <button
                      onClick={() => setColorMode("light")}
                      className={`px-2.5 py-1 transition-colors ${colorMode === "light" ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground hover:text-foreground"}`}
                      data-testid="button-color-mode-light"
                    >
                      Light
                    </button>
                    <button
                      onClick={() => setColorMode("dark")}
                      className={`px-2.5 py-1 transition-colors ${colorMode === "dark" ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground hover:text-foreground"}`}
                      data-testid="button-color-mode-dark"
                    >
                      Dark
                    </button>
                  </div>
                  <button onClick={() => setShowInlinePreview(false)} className="text-muted-foreground hover:text-foreground text-xs" data-testid="button-close-preview">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <iframe
                srcDoc={previewHtml}
                title="Email Preview"
                className="w-full border-0"
                style={{ minHeight: "560px" }}
                data-testid="iframe-email-preview"
                sandbox="allow-same-origin"
              />
            </div>
          )}

          {/* Confirm Modal */}
          {showConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" data-testid="modal-confirm">
              <div className="bg-card rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center ${isTest ? "bg-blue-100 dark:bg-blue-900/30" : "bg-orange-100 dark:bg-orange-900/30"}`}>
                    <Send className={`h-5 w-5 ${isTest ? "text-blue-600" : "text-orange-600"}`} />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{isTest ? "Send test email" : "Dispatch to all recipients"}</p>
                    <p className="text-sm text-muted-foreground">
                      {isTest
                        ? `Will send to ${testAddress || recipients[0] || "—"} only`
                        : `Will send to ${recipients.length} recipient${recipients.length !== 1 ? "s" : ""}`}
                    </p>
                  </div>
                </div>

                <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-xs text-muted-foreground">
                  <p><span className="font-medium text-foreground">Subject:</span> {isTest ? `[TEST] ${subject}` : subject}</p>
                  <p><span className="font-medium text-foreground">Assets:</span> {digestAssets.length} selected</p>
                  <p><span className="font-medium text-foreground">{isTest ? "Test address" : "Recipients"}:</span> {isTest ? (testAddress || recipients[0] || "—") : recipients.join(", ")}</p>
                </div>

                <div className="flex gap-2 justify-end">
                  <Button variant="outline" size="sm" onClick={() => setShowConfirm(false)} data-testid="button-cancel-confirm">Cancel</Button>
                  <Button
                    size="sm"
                    onClick={() => sendMutation.mutate({ isTest })}
                    disabled={sendMutation.isPending}
                    className={isTest ? "" : "bg-indigo-600 hover:bg-indigo-700 text-white"}
                    data-testid="button-confirm-send"
                  >
                    {sendMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                    {isTest ? "Send Test" : "Confirm Dispatch"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>}

      {dispatchMode === "smart" && (
        <div className="flex gap-4 items-start">

          {/* SUBSCRIBER ROSTER */}
          <div className="w-52 shrink-0 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">Subscribers</p>
              {subscriberMatchesQuery.isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </div>
            <div className="flex flex-wrap gap-1">
              {[{ label: "24h", value: 24 }, { label: "48h", value: 48 }, { label: "7d", value: 168 }, { label: "14d", value: 336 }, { label: "30d", value: 720 }].map((o) => (
                <button
                  key={o.value}
                  onClick={() => { setWindowHours(o.value); setManualWindowInput(""); }}
                  className={`h-6 px-2.5 text-[10px] font-medium rounded-full border transition-colors ${windowHours === o.value && !manualWindowInput ? "bg-primary text-white border-primary" : "border-border text-muted-foreground hover:border-primary/50 hover:text-primary"}`}
                  data-testid={`button-smart-window-preset-${o.label}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-1.5 max-h-[calc(100vh-260px)] overflow-y-auto pr-0.5">
              {subscriberMatchesQuery.data?.subscribers.length === 0 && (
                <div className="p-3 text-xs text-muted-foreground text-center bg-card border border-border rounded-lg">
                  No subscribers with profiles.<br />Ask subscribers to complete their profile.
                </div>
              )}
              {(subscriberMatchesQuery.data?.subscribers ?? []).map((sub) => (
                <button
                  key={sub.userId}
                  onClick={() => setSelectedSubId(sub.userId)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${selectedSubId === sub.userId ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-muted/40"}`}
                  data-testid={`sub-card-${sub.userId}`}
                >
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <p className="text-xs font-medium text-foreground truncate">{sub.companyName || sub.email}</p>
                    <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${sub.totalMatches > 0 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}>
                      {sub.totalMatches}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate mb-1">{sub.email}</p>
                  <div className="flex flex-wrap gap-0.5">
                    {[...sub.therapeuticAreas.slice(0, 2), ...sub.modalities.slice(0, 1)].map((tag, i) => (
                      <span key={i} className="text-[9px] px-1 py-0.5 rounded bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">{tag}</span>
                    ))}
                    {sub.therapeuticAreas.length + sub.modalities.length > 3 && (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-muted text-muted-foreground">+{sub.therapeuticAreas.length + sub.modalities.length - 3}</span>
                    )}
                  </div>
                </button>
              ))}
            </div>

            {/* Subscriber Management */}
            <div className="border border-border rounded-xl bg-card overflow-hidden">
              <button
                onClick={() => setSubscriberMgmtOpen((o) => !o)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted/40 transition-colors"
                data-testid="button-subscriber-mgmt-toggle"
              >
                <span className="flex items-center gap-1.5"><Users className="h-3 w-3 text-muted-foreground" />Manage Subscribers</span>
                <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${subscriberMgmtOpen ? "rotate-180" : ""}`} />
              </button>
              {subscriberMgmtOpen && (
                <div className="border-t border-border p-2 space-y-2">
                  {/* Create test subscriber */}
                  <div className="flex gap-1.5">
                    <input
                      type="email"
                      placeholder="email@company.com"
                      value={testSubscriberEmail}
                      onChange={(e) => setTestSubscriberEmail(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && testSubscriberEmail.trim() && !addingTestSubscriber && (async () => {
                        const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                        if (!emailRx.test(testSubscriberEmail.trim())) { toast({ title: "Invalid email", variant: "destructive" }); return; }
                        setAddingTestSubscriber(true);
                        try {
                          const allUsers = allUsersQuery.data?.users ?? [];
                          const existing = allUsers.find((u) => u.email.toLowerCase() === testSubscriberEmail.trim().toLowerCase());
                          if (existing) {
                            const r = await fetch(`/api/admin/users/${existing.id}/subscribed`, { method: "PATCH", headers: { "Content-Type": "application/json", "x-admin-password": pw }, body: JSON.stringify({ subscribedToDigest: true }) });
                            if (!r.ok) throw new Error("Failed");
                          } else {
                            toast({ title: "User not found", description: `${testSubscriberEmail} has no account yet. Ask them to sign up first.`, variant: "destructive" }); return;
                          }
                          queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
                          queryClient.invalidateQueries({ queryKey: ["/api/admin/dispatch/subscribers"] });
                          queryClient.invalidateQueries({ queryKey: ["/api/admin/dispatch/subscriber-matches", windowHours] });
                          toast({ title: "Subscribed", description: `${testSubscriberEmail} added to digest list.` });
                          setTestSubscriberEmail("");
                        } catch { toast({ title: "Error", variant: "destructive" }); } finally { setAddingTestSubscriber(false); }
                      })()}
                      className="flex-1 h-7 px-2.5 text-[10px] border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary/30"
                      data-testid="input-test-subscriber-email"
                    />
                    <button
                      onClick={async () => {
                        const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                        if (!emailRx.test(testSubscriberEmail.trim())) { toast({ title: "Invalid email", variant: "destructive" }); return; }
                        setAddingTestSubscriber(true);
                        try {
                          const allUsers = allUsersQuery.data?.users ?? [];
                          const existing = allUsers.find((u) => u.email.toLowerCase() === testSubscriberEmail.trim().toLowerCase());
                          if (existing) {
                            const r = await fetch(`/api/admin/users/${existing.id}/subscribed`, { method: "PATCH", headers: { "Content-Type": "application/json", "x-admin-password": pw }, body: JSON.stringify({ subscribedToDigest: true }) });
                            if (!r.ok) throw new Error("Failed");
                          } else {
                            toast({ title: "User not found", description: `${testSubscriberEmail} has no account yet.`, variant: "destructive" }); return;
                          }
                          queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
                          queryClient.invalidateQueries({ queryKey: ["/api/admin/dispatch/subscribers"] });
                          queryClient.invalidateQueries({ queryKey: ["/api/admin/dispatch/subscriber-matches", windowHours] });
                          toast({ title: "Subscribed", description: `${testSubscriberEmail} added.` });
                          setTestSubscriberEmail("");
                        } catch { toast({ title: "Error", variant: "destructive" }); } finally { setAddingTestSubscriber(false); }
                      }}
                      disabled={addingTestSubscriber || !testSubscriberEmail.trim()}
                      className="shrink-0 h-7 px-2 text-[9px] font-semibold rounded-md bg-primary text-white hover:bg-primary/90 disabled:opacity-40 flex items-center gap-0.5"
                      data-testid="button-add-test-subscriber"
                    >
                      {addingTestSubscriber ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Plus className="h-2.5 w-2.5" />}
                      Add
                    </button>
                  </div>
                  {/* Search existing users */}
                  <input
                    type="text"
                    placeholder="Search users by email..."
                    value={allUsersSearch}
                    onChange={(e) => { setAllUsersSearch(e.target.value); setAllUsersPage(1); }}
                    className="w-full h-7 px-2.5 text-xs border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary/30"
                    data-testid="input-all-users-search"
                  />
                  {allUsersQuery.isLoading && (
                    <div className="flex items-center justify-center py-3">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    </div>
                  )}
                  {!allUsersQuery.isLoading && (allUsersQuery.data?.users ?? []).length === 0 && (
                    <p className="text-[10px] text-muted-foreground text-center py-2">No users found.</p>
                  )}
                  {(() => {
                    const PAGE_SIZE = 30;
                    const filtered = (allUsersQuery.data?.users ?? []).filter((u) =>
                      !allUsersSearch || u.email.toLowerCase().includes(allUsersSearch.toLowerCase()) || (u.contactEmail ?? "").toLowerCase().includes(allUsersSearch.toLowerCase())
                    );
                    const paginated = filtered.slice(0, allUsersPage * PAGE_SIZE);
                    return (
                      <>
                        {filtered.length > 0 && (
                          <p className="text-[9px] text-muted-foreground">Showing {paginated.length} of {filtered.length} users</p>
                        )}
                        <div className="max-h-56 overflow-y-auto space-y-1">
                          {paginated.map((u) => (
                            <div key={u.id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-muted/40" data-testid={`user-row-${u.id}`}>
                              <div className="flex-1 min-w-0">
                                <p className="text-[10px] font-medium text-foreground truncate">{u.contactEmail || u.email}</p>
                                {u.role && <p className="text-[9px] text-muted-foreground">{u.role}</p>}
                              </div>
                              <button
                                onClick={async () => {
                                  setTogglingUserId(u.id);
                                  try {
                                    const r = await fetch(`/api/admin/users/${u.id}/subscribed`, {
                                      method: "PATCH",
                                      headers: { "Content-Type": "application/json", "x-admin-password": pw },
                                      body: JSON.stringify({ subscribedToDigest: !u.subscribedToDigest }),
                                    });
                                    if (!r.ok) throw new Error("Failed");
                                    queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
                                    queryClient.invalidateQueries({ queryKey: ["/api/admin/dispatch/subscribers"] });
                                    queryClient.invalidateQueries({ queryKey: ["/api/admin/dispatch/subscriber-matches", windowHours] });
                                    toast({ title: u.subscribedToDigest ? "Unsubscribed" : "Subscribed", description: `${u.contactEmail || u.email} ${u.subscribedToDigest ? "removed from" : "added to"} digest list.` });
                                  } catch {
                                    toast({ title: "Error", description: "Failed to update subscription.", variant: "destructive" });
                                  } finally {
                                    setTogglingUserId(null);
                                  }
                                }}
                                disabled={togglingUserId === u.id}
                                className={`shrink-0 text-[9px] font-semibold px-2 py-1 rounded-full transition-colors ${u.subscribedToDigest ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 hover:bg-red-100 hover:text-red-600" : "bg-muted text-muted-foreground hover:bg-emerald-100 hover:text-emerald-700"}`}
                                data-testid={`button-toggle-sub-${u.id}`}
                                title={u.subscribedToDigest ? "Click to unsubscribe" : "Click to subscribe"}
                              >
                                {togglingUserId === u.id ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : u.subscribedToDigest ? "Subscribed" : "Subscribe"}
                              </button>
                            </div>
                          ))}
                        </div>
                        {paginated.length < filtered.length && (
                          <button
                            onClick={() => setAllUsersPage((p) => p + 1)}
                            className="w-full text-[10px] text-primary hover:underline py-1"
                            data-testid="button-load-more-users"
                          >
                            Load more ({filtered.length - paginated.length} remaining)
                          </button>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>

          {/* SMART QUEUE */}
          <div className="flex-1 min-w-0 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">
                {selectedSub ? `Matches for ${selectedSub.companyName || selectedSub.email}` : "Select a subscriber"}
              </p>
              {selectedSub && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2.5 text-xs gap-1.5"
                  onClick={() => addTop5(selectedSub.userId)}
                  disabled={!selectedSubId || suggestionsQuery.isLoading}
                  data-testid="button-add-top5"
                >
                  <Plus className="h-3 w-3" />
                  Add top 5
                </Button>
              )}
            </div>

            {!selectedSubId && (
              <div className="border border-border rounded-xl p-10 bg-card text-center text-sm text-muted-foreground">
                Select a subscriber to see their personalized asset recommendations.
              </div>
            )}

            {selectedSubId && (
              <div className="border border-border rounded-xl bg-card overflow-hidden" style={{ maxHeight: "calc(100vh - 260px)" }}>
                <div className="overflow-y-auto flex-1 divide-y divide-border">
                  {suggestionsQuery.isLoading && (
                    <div className="p-6 text-center text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />Loading matches...
                    </div>
                  )}
                  {!suggestionsQuery.isLoading && smartQueueAssets.length === 0 && (
                    <div className="p-8 text-center text-sm text-muted-foreground">No new assets in this window.</div>
                  )}
                  {smartQueueAssets.map((asset) => {
                    const inDigest = smartStagedIds.has(asset.id);
                    return (
                      <div
                        key={asset.id}
                        draggable={!inDigest}
                        onDragStart={(e) => { e.dataTransfer.setData("smart-asset-id", String(asset.id)); e.dataTransfer.effectAllowed = "copy"; }}
                        className={`p-3 transition-colors group ${inDigest ? "opacity-40" : "hover:bg-muted/40 cursor-grab active:cursor-grabbing"}`}
                        data-testid={`smart-asset-${asset.id}`}
                      >
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-foreground truncate">{asset.assetName}</p>
                            <p className="text-[10px] text-muted-foreground truncate">{asset.institution}</p>
                            <div className="mt-1 flex flex-wrap gap-1 items-center">
                              <StagePill stage={asset.developmentStage} />
                              {asset.modality && asset.modality !== "unknown" && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
                                  {asset.modality}
                                </span>
                              )}
                              {asset.score > 0 && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 font-semibold">
                                  {asset.score}pt
                                </span>
                              )}
                              {asset.matchedFields.slice(0, 2).map((f, i) => (
                                <span key={i} className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">{f}</span>
                              ))}
                            </div>
                          </div>
                          {!inDigest && selectedSubId && (
                            <button
                              onClick={() => addToSmartDigest(selectedSubId, asset)}
                              className="shrink-0 opacity-0 group-hover:opacity-100 h-6 w-6 rounded-full bg-primary/10 text-primary hover:bg-primary hover:text-white flex items-center justify-center transition-all"
                              data-testid={`smart-add-${asset.id}`}
                              title="Add to digest"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* PER-USER DIGEST ZONE */}
          <div className="w-72 shrink-0 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">
                Digest Zone
                {selectedSub && <span className="ml-1.5 text-xs font-normal text-muted-foreground">for {selectedSub.companyName || selectedSub.email}</span>}
              </p>
              {selectedSubId && getSmartDigest(selectedSubId).length > 0 && (
                <button onClick={() => setSmartDigests((p) => ({ ...p, [selectedSubId]: [] }))} className="text-xs text-muted-foreground hover:text-destructive" data-testid="smart-clear-digest">
                  Clear
                </button>
              )}
            </div>

            <div
              onDragOver={(e) => { e.preventDefault(); setSmartDragOver(true); }}
              onDragLeave={() => setSmartDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setSmartDragOver(false);
                if (!selectedSubId) return;
                const reorderStr = e.dataTransfer.getData("digest-smart-idx");
                if (reorderStr !== "") {
                  const fromIdx = Number(reorderStr);
                  const toIdx = smartDragIdx ?? fromIdx;
                  setSmartDragIdx(null);
                  if (fromIdx === toIdx) return;
                  setSmartDigests((prev) => {
                    const items = [...(prev[selectedSubId] ?? [])];
                    const [moved] = items.splice(fromIdx, 1);
                    items.splice(toIdx, 0, moved);
                    return { ...prev, [selectedSubId]: items };
                  });
                  return;
                }
                const idStr = e.dataTransfer.getData("smart-asset-id");
                if (!idStr) return;
                const id = Number(idStr);
                const asset = smartQueueAssets.find((a) => a.id === id);
                if (asset && !smartStagedIds.has(id)) addToSmartDigest(selectedSubId, asset);
              }}
              className={`min-h-[120px] border border-border rounded-xl bg-card overflow-hidden transition-colors ${smartDragOver ? "ring-2 ring-primary/20 ring-inset bg-primary/5" : ""}`}
              data-testid="smart-digest-zone"
            >
              {!selectedSubId ? (
                <div className="p-6 text-center text-xs text-muted-foreground">Select a subscriber first.</div>
              ) : getSmartDigest(selectedSubId).length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground">
                  <Send className="h-6 w-6 mx-auto mb-2 opacity-20" />
                  Drag assets here or use "Add top 5".
                </div>
              ) : (
                <div className="divide-y divide-border max-h-[400px] overflow-y-auto">
                  {getSmartDigest(selectedSubId).map((asset, i) => (
                    <div
                      key={asset.id}
                      draggable
                      onDragStart={(e) => { e.dataTransfer.setData("digest-smart-idx", String(i)); e.dataTransfer.effectAllowed = "move"; setSmartDragIdx(i); }}
                      onDragOver={(e) => { e.preventDefault(); setSmartDragIdx(i); }}
                      className={`flex items-start gap-2 px-3 py-2.5 cursor-grab ${smartDragIdx === i ? "bg-primary/5" : "hover:bg-muted/30"}`}
                      data-testid={`smart-digest-item-${asset.id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{asset.assetName}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{asset.institution}</p>
                      </div>
                      <button
                        onClick={() => removeFromSmartDigest(selectedSubId, asset.id)}
                        className="text-muted-foreground hover:text-destructive mt-0.5"
                        data-testid={`smart-remove-${asset.id}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {selectedSub && (
              <Button
                size="sm"
                onClick={() => sendToSubscriber(selectedSub)}
                disabled={sendingSmartId === selectedSub.userId || getSmartDigest(selectedSub.userId).length === 0}
                className="w-full gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white"
                data-testid={`button-send-to-${selectedSub.userId}`}
              >
                {sendingSmartId === selectedSub.userId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Send to {selectedSub.companyName || selectedSub.email}
              </Button>
            )}

            {(subscriberMatchesQuery.data?.subscribers ?? []).some((s) => getSmartDigest(s.userId).length > 0) && (
              <Button
                size="sm"
                variant="outline"
                onClick={sendAllPersonalized}
                disabled={sendAllPending}
                className="w-full gap-1.5"
                data-testid="button-send-all-personalized"
              >
                {sendAllPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Send All Personalized
              </Button>
            )}
          </div>

        </div>
      )}

      {/* Dispatch History */}
      <div className="mt-6 border border-border rounded-xl overflow-hidden bg-card">
        <button
          onClick={() => setHistoryOpen((o) => !o)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-foreground hover:bg-muted/40 transition-colors"
          data-testid="button-toggle-history"
        >
          <span className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            Dispatch History
            {historyQuery.data && (
              <span className="text-[11px] text-muted-foreground">({historyQuery.data.history.length} entries)</span>
            )}
          </span>
          {historyOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>

        {historyOpen && (
          <div className="border-t border-border">
            {historyQuery.isLoading && (
              <div className="p-6 text-center text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />
                Loading history...
              </div>
            )}
            {historyQuery.data?.history.length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">No dispatches sent yet.</div>
            )}
            {(historyQuery.data?.history ?? []).map((log) => {
              const isExpanded = historyExpandedId === log.id;
              return (
                <div key={log.id} className="border-b border-border last:border-b-0" data-testid={`history-row-${log.id}`}>
                  <button
                    onClick={() => setHistoryExpandedId(isExpanded ? null : log.id)}
                    className="w-full flex items-start justify-between gap-4 px-4 py-3 hover:bg-muted/30 text-left"
                    data-testid={`button-expand-history-${log.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-foreground truncate">{log.subject}</p>
                        {log.isTest && (
                          <span className="text-[10px] bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 px-2 py-0.5 rounded-full font-semibold">TEST</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {log.assetCount} asset{log.assetCount !== 1 ? "s" : ""} &bull; {log.recipients.length} recipient{log.recipients.length !== 1 ? "s" : ""} &bull; {log.windowHours}h window
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] text-muted-foreground">{timeAgo(log.sentAt)}</span>
                      {isExpanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="px-4 pb-3 pt-0 space-y-1.5 bg-muted/20">
                      <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Recipients</p>
                      <p className="text-xs text-muted-foreground">{log.recipients.join(", ")}</p>
                      {(log.assetNames ?? []).length > 0 && (
                        <>
                          <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide mt-2">Assets dispatched</p>
                          <ul className="space-y-0.5">
                            {(log.assetNames ?? []).map((name, idx) => {
                              const url = (log.assetSourceUrls ?? [])[idx];
                              return (
                                <li key={idx} className="text-xs text-foreground flex items-center gap-1.5">
                                  <span className="h-1 w-1 rounded-full bg-primary/60 shrink-0" />
                                  {url ? (
                                    <a href={url} target="_blank" rel="noopener noreferrer" className="hover:text-primary hover:underline flex items-center gap-1">
                                      {name}
                                      <ExternalLink className="h-2.5 w-2.5 opacity-50" />
                                    </a>
                                  ) : (
                                    <span>{name}</span>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function SubscriptionData() {
  const tiers = [
    { name: "EdenDiscovery", price: 19.99, subscribers: 8, color: "bg-blue-500/10 text-blue-600 border-blue-200 dark:border-blue-800" },
    { name: "EdenLab", price: 29.99, subscribers: 5, color: "bg-violet-500/10 text-violet-600 border-violet-200 dark:border-violet-800" },
    { name: "EdenScout", price: 299, subscribers: 2, color: "bg-emerald-500/10 text-emerald-600 border-emerald-200 dark:border-emerald-800" },
  ];
  const totalMRR = tiers.reduce((sum, t) => sum + t.price * t.subscribers, 0);
  const totalSubs = tiers.reduce((sum, t) => sum + t.subscribers, 0);
  const ARR = totalMRR * 12;

  return (
    <div className="space-y-6" data-testid="section-subscription-data">
      <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-700 dark:text-amber-400 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        Preview data — connect billing provider to activate live metrics.
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {[
          { label: "ARR Projection", value: `$${ARR.toLocaleString("en-US", { maximumFractionDigits: 0 })}`, icon: TrendingUp, testid: "stat-arr" },
          { label: "Active Subscribers", value: totalSubs.toString(), icon: Users, testid: "stat-total-subscribers" },
          { label: "Monthly Churn", value: "3.2%", icon: Activity, testid: "stat-churn" },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-border bg-card p-4 flex flex-col gap-1" data-testid={s.testid}>
            <div className="flex items-center gap-2 text-muted-foreground">
              <s.icon className="h-4 w-4" />
              <span className="text-xs">{s.label}</span>
            </div>
            <p className="text-2xl font-semibold text-foreground">{s.value}</p>
            <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wide">preview</p>
          </div>
        ))}
      </div>

      <div className="grid gap-3">
        {tiers.map((t) => {
          const rev = t.price * t.subscribers;
          const pct = totalMRR > 0 ? (rev / totalMRR) * 100 : 0;
          return (
            <div key={t.name} className={`rounded-lg border p-4 ${t.color}`} data-testid={`card-tier-${t.name.toLowerCase().replace(/\s+/g, "-")}`}>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <p className="font-semibold text-sm">{t.name}</p>
                  <p className="text-xs opacity-75">${t.price.toFixed(2)}/mo per seat</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-sm">${rev.toFixed(2)}/mo</p>
                  <p className="text-xs opacity-75">{t.subscribers} subscriber{t.subscribers !== 1 ? "s" : ""} · {pct.toFixed(1)}% of MRR</p>
                </div>
              </div>
              <div className="mt-3 h-1.5 rounded-full bg-black/10 dark:bg-white/10">
                <div className="h-1.5 rounded-full bg-current opacity-50" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {[
          { label: "Avg Subscription Age", value: "2.4 mo", testid: "stat-avg-age" },
          { label: "Net New Subs This Month", value: "+3", testid: "stat-net-new" },
          { label: "Avg Revenue Per User", value: `$${(totalMRR / Math.max(totalSubs, 1)).toFixed(2)}`, testid: "stat-arpu" },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-border bg-card p-4 flex flex-col gap-1" data-testid={s.testid}>
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className="text-xl font-semibold text-foreground">{s.value}</p>
            <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wide">preview</p>
          </div>
        ))}
      </div>

      {/* Prominent Total MRR bottom summary */}
      <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-6 flex flex-col sm:flex-row items-center justify-between gap-4" data-testid="stat-total-mrr">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-primary/10 p-3">
            <DollarSign className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Total Monthly Recurring Revenue</p>
            <p className="text-4xl font-bold text-foreground mt-0.5">${totalMRR.toFixed(2)}</p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-muted-foreground">Annualised</p>
          <p className="text-xl font-semibold text-foreground">${ARR.toLocaleString("en-US", { maximumFractionDigits: 0 })}/yr</p>
          <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wide mt-1">preview — connect billing to activate</p>
        </div>
      </div>
    </div>
  );
}

function PlatformInfo({ pw }: { pw: string }) {
  const { data, isLoading } = useQuery<{
    totalUsers: number;
    totalAssets: number;
    relevantAssets: number;
    totalInstitutions: number;
    edenSessionsAllTime: number;
    edenSessions24h: number;
    edenSessions7d: number;
    edenSessions30d: number;
    conceptCards: number;
    researchProjects: number;
    publishedDiscoveryCards: number;
    savedAssets: number;
    enrichmentJobsProcessed: number;
  }>({
    queryKey: ["/api/admin/platform-stats"],
    queryFn: async () => {
      const res = await fetch("/api/admin/platform-stats", { headers: { "x-admin-password": pw } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 60000,
    enabled: !!pw,
  });

  const aiCalls24h = data ? Math.round(data.edenSessions24h * 4 + (data.enrichmentJobsProcessed / Math.max(data.totalAssets, 1)) * 50) : 0;
  const aiCalls7d = data ? Math.round(data.edenSessions7d * 4 + (data.enrichmentJobsProcessed / Math.max(data.totalAssets, 1)) * 300) : 0;
  const aiCalls30d = data ? Math.round(data.edenSessions30d * 4 + data.enrichmentJobsProcessed) : 0;
  const costPer = 0.0003;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Loading platform stats…</span>
      </div>
    );
  }

  const StatCard = ({ label, value, sub, icon: Icon, testid }: { label: string; value: string | number; sub?: string; icon: LucideIcon; testid: string }) => (
    <div className="rounded-lg border border-border bg-card p-4 flex flex-col gap-1" data-testid={testid}>
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="text-xs">{label}</span>
      </div>
      <p className="text-2xl font-semibold text-foreground">{typeof value === "number" ? value.toLocaleString() : value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );

  return (
    <div className="space-y-8" data-testid="section-platform-info">
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest mb-3">Data & Coverage</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Registered Users" value={data?.totalUsers ?? 0} icon={Users} testid="stat-total-users" />
          <StatCard label="Total Assets" value={data?.totalAssets ?? 0} icon={Database} testid="stat-total-assets" />
          <StatCard label="Biotech-Relevant" value={data?.relevantAssets ?? 0} sub={data ? `${((data.relevantAssets / Math.max(data.totalAssets, 1)) * 100).toFixed(1)}% of total` : undefined} icon={FlaskConical} testid="stat-relevant-assets" />
          <StatCard label="Institutions Indexed" value={data?.totalInstitutions ?? 0} icon={Globe} testid="stat-total-institutions" />
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest mb-3">Eden AI Conversations</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Last 24 Hours" value={data?.edenSessions24h ?? 0} icon={MessageSquare} testid="stat-eden-24h" />
          <StatCard label="Last 7 Days" value={data?.edenSessions7d ?? 0} icon={MessageSquare} testid="stat-eden-7d" />
          <StatCard label="Last 30 Days" value={data?.edenSessions30d ?? 0} icon={MessageSquare} testid="stat-eden-30d" />
          <StatCard label="All Time" value={data?.edenSessionsAllTime ?? 0} icon={MessageSquare} testid="stat-eden-alltime" />
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest mb-3">
          AI Usage <span className="normal-case tracking-normal font-normal text-muted-foreground/60 text-xs ml-1">(est.)</span>
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <StatCard label="Est. AI Calls (24h)" value={aiCalls24h.toLocaleString()} sub="est." icon={Zap} testid="stat-ai-calls-24h" />
          <StatCard label="Est. AI Calls (7d)" value={aiCalls7d.toLocaleString()} sub="est." icon={Zap} testid="stat-ai-calls-7d" />
          <StatCard label="Est. AI Calls (30d)" value={aiCalls30d.toLocaleString()} sub="est." icon={Zap} testid="stat-ai-calls-30d" />
          <StatCard label="Est. Cost (24h)" value={`$${(aiCalls24h * costPer).toFixed(4)}`} sub="est. @ $0.0003/call" icon={DollarSign} testid="stat-ai-cost-24h" />
          <StatCard label="Est. Cost (7d)" value={`$${(aiCalls7d * costPer).toFixed(3)}`} sub="est. @ $0.0003/call" icon={DollarSign} testid="stat-ai-cost-7d" />
          <StatCard label="Enrichment Calls Total" value={(data?.enrichmentJobsProcessed ?? 0).toLocaleString()} sub="cumulative enrichment" icon={Sparkles} testid="stat-enrichment-total" />
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest mb-3">Content & Engagement</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Concept Cards" value={data?.conceptCards ?? 0} icon={Lightbulb} testid="stat-concept-cards" />
          <StatCard label="Research Projects" value={data?.researchProjects ?? 0} icon={Microscope} testid="stat-research-projects" />
          <StatCard label="Published Discoveries" value={data?.publishedDiscoveryCards ?? 0} icon={BookOpen} testid="stat-published-discoveries" />
          <StatCard label="Saved Assets" value={data?.savedAssets ?? 0} icon={Bookmark} testid="stat-saved-assets" />
        </div>
      </div>
    </div>
  );
}

function AdminPanel({ pw, setAuthed, theme, setTheme, activeTab, setActiveTab }: {
  pw: string;
  setAuthed: (v: boolean) => void;
  theme: string;
  setTheme: (v: "light" | "dark") => void;
  activeTab: string;
  setActiveTab: (v: string) => void;
}) {
  const { data: queueData } = useQuery<{ cards: any[] }>({
    queryKey: ["/api/admin/research-queue"],
    queryFn: async () => {
      const res = await fetch("/api/admin/research-queue", { headers: { "x-admin-password": pw } });
      if (!res.ok) return { cards: [] };
      return res.json();
    },
    staleTime: 30000,
    enabled: !!pw,
  });
  const pendingCount = (queueData?.cards ?? []).filter((c) => c.adminStatus === "pending").length;

  return (
    <div className="min-h-screen bg-background" data-testid="admin-panel">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-screen-2xl mx-auto flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <Shield className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold text-foreground">EdenRadar Admin</h1>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              data-testid="button-toggle-theme"
            >
              {theme === "dark" ? "Light" : "Dark"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { localStorage.removeItem(ADMIN_KEY); setAuthed(false); }}
              data-testid="button-admin-logout"
            >
              <LogOut className="h-4 w-4 mr-1" /> Logout
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-screen-2xl mx-auto flex flex-col lg:flex-row">
        <aside className="shrink-0 border-b lg:border-b-0 lg:w-56 lg:border-r border-border lg:min-h-[calc(100vh-57px)]">
          <nav className="flex flex-row overflow-x-auto gap-1 p-2 lg:flex-col lg:overflow-x-visible lg:p-4 lg:gap-0">

            {/* ── DATA CONTROLS ── */}
            <div className="hidden lg:block pt-1 pb-1.5" data-testid="nav-section-data-controls">
              <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground px-3">Data Controls</p>
            </div>
            <button
              onClick={() => setActiveTab("data-health")}
              className={`shrink-0 whitespace-nowrap lg:w-full text-left px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 ${
                activeTab === "data-health" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
              data-testid="nav-data-health"
            >
              <Activity className="h-4 w-4" />
              Data Health
            </button>
            <button
              onClick={() => setActiveTab("enrichment")}
              className={`shrink-0 whitespace-nowrap lg:w-full text-left px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 ${
                activeTab === "enrichment" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
              data-testid="nav-enrichment"
            >
              <BarChart3 className="h-4 w-4" />
              Data Quality
            </button>
            <button
              onClick={() => setActiveTab("manual-import")}
              className={`shrink-0 whitespace-nowrap lg:w-full text-left px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 ${
                activeTab === "manual-import" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
              data-testid="nav-manual-import"
            >
              <PackagePlus className="h-4 w-4" />
              Manual Import
            </button>
            <button
              onClick={() => setActiveTab("pipeline-review")}
              className={`shrink-0 whitespace-nowrap lg:w-full text-left px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 ${
                activeTab === "pipeline-review" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
              data-testid="nav-pipeline-review"
            >
              <ClipboardList className="h-4 w-4" />
              Pipeline Review
            </button>
            <button
              onClick={() => setActiveTab("new-arrivals")}
              className={`shrink-0 whitespace-nowrap lg:w-full text-left px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 ${
                activeTab === "new-arrivals" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
              data-testid="nav-new-arrivals"
            >
              <Inbox className="h-4 w-4" />
              Indexing Queue
            </button>
            <button
              onClick={() => setActiveTab("dispatch")}
              className={`shrink-0 whitespace-nowrap lg:w-full text-left px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 ${
                activeTab === "dispatch" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
              data-testid="nav-dispatch"
            >
              <Send className="h-4 w-4" />
              Dispatch
            </button>

            {/* ── PRODUCT CONTROLS ── */}
            <div className="hidden lg:block border-t border-border mt-3 pt-3 pb-1.5" data-testid="nav-section-product-controls">
              <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground px-3">Product Controls</p>
            </div>
            <div className="hidden lg:block h-2" />
            <button
              onClick={() => setActiveTab("research-queue")}
              className={`shrink-0 whitespace-nowrap lg:w-full text-left px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 ${
                activeTab === "research-queue" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
              data-testid="nav-research-queue"
            >
              <Microscope className="h-4 w-4" />
              <span>Research Review</span>
              {pendingCount > 0 && (
                <span className="ml-auto text-[10px] font-bold bg-amber-500 text-white rounded-full px-1.5 py-0.5 min-w-[18px] text-center" data-testid="badge-pending-count">
                  {pendingCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("concept-queue")}
              className={`shrink-0 whitespace-nowrap lg:w-full text-left px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 ${
                activeTab === "concept-queue" ? "bg-amber-500/10 text-amber-600" : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
              data-testid="nav-concept-queue"
            >
              <Lightbulb className="h-4 w-4" />
              Concept Review
            </button>
            <button
              onClick={() => setActiveTab("edenlab-review")}
              className={`shrink-0 whitespace-nowrap lg:w-full text-left px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 ${
                activeTab === "edenlab-review" ? "bg-violet-500/10 text-violet-600" : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
              data-testid="nav-edenlab-review"
            >
              <FlaskConical className="h-4 w-4" />
              EdenLab Review
            </button>
            <button
              onClick={() => setActiveTab("eden")}
              className={`shrink-0 whitespace-nowrap lg:w-full text-left px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 ${
                activeTab === "eden" ? "bg-emerald-500/10 text-emerald-600" : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
              data-testid="nav-eden"
            >
              <BrainCircuit className="h-4 w-4" />
              EDEN
            </button>

            {/* ── ADMIN CONTROLS ── */}
            <div className="hidden lg:block border-t border-border mt-3 pt-3 pb-1.5" data-testid="nav-section-admin-controls">
              <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground px-3">Admin Controls</p>
            </div>
            <div className="hidden lg:block h-2" />
            <button
              onClick={() => setActiveTab("account-center")}
              className={`shrink-0 whitespace-nowrap lg:w-full text-left px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 ${
                activeTab === "account-center" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
              data-testid="nav-account-center"
            >
              <Users className="h-4 w-4" />
              Account Center
            </button>
            <button
              onClick={() => setActiveTab("subscription-data")}
              className={`shrink-0 whitespace-nowrap lg:w-full text-left px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 ${
                activeTab === "subscription-data" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
              data-testid="nav-subscription-data"
            >
              <CreditCard className="h-4 w-4" />
              Subscription Data
            </button>
            <button
              onClick={() => setActiveTab("platform-info")}
              className={`shrink-0 whitespace-nowrap lg:w-full text-left px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 ${
                activeTab === "platform-info" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
              data-testid="nav-platform-info"
            >
              <Server className="h-4 w-4" />
              Platform Info
            </button>
          </nav>
        </aside>

        <main className="flex-1 p-6 overflow-hidden">
          {activeTab === "new-arrivals" && (
            <>
              <div className="mb-6">
                <h2 className="text-2xl font-semibold text-foreground" data-testid="text-section-title">Indexing Queue</h2>
                <p className="text-sm text-muted-foreground mt-1">All discovered assets not yet pushed to the pipeline, grouped by institution. Push to make them visible in Scout.</p>
              </div>
              <NewArrivals pw={pw} />
            </>
          )}

          {activeTab === "dispatch" && <DispatchTab pw={pw} />}

          {activeTab === "manual-import" && (
            <>
              <div className="mb-6">
                <h2 className="text-2xl font-semibold text-foreground" data-testid="text-section-title">Manual Import</h2>
                <p className="text-sm text-muted-foreground mt-1">Upload a screenshot or paste text from any TTO listing — AI extracts structured fields and adds the asset to the Indexing Queue.</p>
              </div>
              <ManualImportTab pw={pw} setActiveTab={setActiveTab} />
            </>
          )}

          {activeTab === "data-health" && (
            <DataHealth pw={pw} />
          )}

          {activeTab === "enrichment" && (
            <>
              <div className="mb-6">
                <h2 className="text-2xl font-semibold text-foreground" data-testid="text-section-title">Data Quality</h2>
                <p className="text-sm text-muted-foreground mt-1">Dataset completeness, field coverage, and duplicate detection for relevant biotech assets. Enrichment controls at the bottom.</p>
              </div>
              <Enrichment pw={pw} />
              <BulkCsvImport pw={pw} />
              <PotentialDuplicates pw={pw} />
            </>
          )}

          {activeTab === "pipeline-review" && (
            <>
              <div className="mb-6">
                <h2 className="text-2xl font-semibold text-foreground" data-testid="text-section-title">Pipeline Review</h2>
                <p className="text-sm text-muted-foreground mt-1">Review ambiguous assets, manage the review queue, and wipe/re-collect data</p>
              </div>
              <PipelineReviewQueue pw={pw} />
            </>
          )}

          {activeTab === "research-queue" && (
            <>
              <div className="mb-6">
                <h2 className="text-2xl font-semibold text-foreground" data-testid="text-section-title">Research Review</h2>
                <p className="text-sm text-muted-foreground mt-1">Review researcher-submitted Discovery Cards. Approved cards enter Scout as the "Lab Discoveries" source.</p>
              </div>
              <ResearchQueue pw={pw} />
            </>
          )}

          {activeTab === "concept-queue" && (
            <>
              <div className="mb-6">
                <h2 className="text-2xl font-semibold text-foreground" data-testid="text-section-title">Concept Review</h2>
                <p className="text-sm text-muted-foreground mt-1">View all submitted concepts from the EdenDiscovery portal with AI credibility scores.</p>
              </div>
              <ConceptQueue pw={pw} />
            </>
          )}

          {activeTab === "edenlab-review" && (
            <>
              <div className="mb-6">
                <h2 className="text-2xl font-semibold text-foreground" data-testid="text-section-title">EdenLab Review</h2>
                <p className="text-sm text-muted-foreground mt-1">Approve community research projects for the industry EdenLab tab. Published projects are immediately visible to industry buyers.</p>
              </div>
              <IndustryProjectsQueue pw={pw} />
            </>
          )}

          {activeTab === "account-center" && (
            <>
              <div className="mb-6">
                <h2 className="text-2xl font-semibold text-foreground" data-testid="text-section-title">Account Center</h2>
                <p className="text-sm text-muted-foreground mt-1">Manage user accounts, assign portal roles, and invite new users to the platform.</p>
              </div>
              <AccountCenter pw={pw} />
            </>
          )}

          {activeTab === "subscription-data" && (
            <>
              <div className="mb-6">
                <h2 className="text-2xl font-semibold text-foreground" data-testid="text-section-title">Subscription Data</h2>
                <p className="text-sm text-muted-foreground mt-1">Revenue by tier, MRR, and subscriber metrics. Preview data — connect a billing provider to activate live figures.</p>
              </div>
              <SubscriptionData />
            </>
          )}

          {activeTab === "platform-info" && (
            <>
              <div className="mb-6">
                <h2 className="text-2xl font-semibold text-foreground" data-testid="text-section-title">Platform Info</h2>
                <p className="text-sm text-muted-foreground mt-1">Live platform metrics: asset coverage, user activity, AI usage, and content health.</p>
              </div>
              <PlatformInfo pw={pw} />
            </>
          )}

          {activeTab === "eden" && (
            <>
              <div className="mb-6">
                <h2 className="text-2xl font-semibold text-foreground flex items-center gap-2" data-testid="text-section-title">
                  <EdenAvatar size={28} />
                  EDEN — AI Analyst
                </h2>
                <p className="text-sm text-muted-foreground mt-1">Eden Radar Novel Innovation Experience. Deep-enriches the 20K relevant TTO assets using GPT-4o for RAG-powered analysis.</p>
              </div>
              <EdenTab pw={pw} />
            </>
          )}

        </main>
      </div>
    </div>
  );
}
