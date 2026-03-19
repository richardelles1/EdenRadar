import React, { useState, useEffect, useRef, type ReactNode } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Shield, Lock, LogOut, Loader2, Download, Database, RefreshCw, ArrowUpCircle, AlertTriangle, CheckCircle2, ExternalLink, Zap, Sparkles, DollarSign, Activity, AlertCircle, XCircle, Microscope, Trash2, ClipboardList, Lightbulb, Users, UserPlus, Copy, Check, Inbox, ChevronDown, ChevronRight, Building2, Clock, PackagePlus, BrainCircuit, PlayCircle, BarChart3, Mic, MicOff, ThumbsUp, ThumbsDown, Bookmark, Layers, Plus, Upload, FileText, Image as ImageIcon, Pencil } from "lucide-react";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import type { ConceptCard } from "@shared/schema";
import { PORTAL_CONFIG, ALL_PORTAL_ROLES, getPortalConfig, type PortalRole } from "@shared/portals";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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

type HealthStatus = "ok" | "degraded" | "failing" | "stale" | "syncing" | "never";

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
}

interface SchedulerStatus {
  state: "idle" | "running" | "paused";
  currentInstitution: string | null;
  nextInstitution: string | null;
  queuePosition: number;
  queueTotal: number;
  completedThisCycle: number;
  failedThisCycle: number;
  cycleStartedAt: string | null;
  lastActivityAt: string | null;
  cycleCount: number;
  priorityQueue: string[];
  delayMs: number;
  avgSyncMs: number | null;
  estimatedRemainingMs: number | null;
  lastCycleCompletedAt: string | null;
}

interface CollectorHealthData {
  rows: CollectorHealthRow[];
  totalInDb: number;
  totalBiotechRelevant: number;
  totalInstitutions: number;
  issueCount: number;
  syncingCount: number;
  syncedToday: number;
  scheduler: SchedulerStatus;
}

function HealthDot({ health }: { health: HealthStatus }) {
  if (health === "ok") return <CheckCircle2 className="h-4 w-4 text-emerald-500" data-testid="health-ok" />;
  if (health === "syncing") return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" data-testid="health-syncing" />;
  if (health === "degraded") return <AlertTriangle className="h-4 w-4 text-amber-500" data-testid="health-degraded" />;
  if (health === "stale") return <AlertCircle className="h-4 w-4 text-orange-500" data-testid="health-stale" />;
  if (health === "never") return <Database className="h-4 w-4 text-muted-foreground/40" data-testid="health-never" />;
  return <XCircle className="h-4 w-4 text-red-500" data-testid="health-failing" />;
}

function HealthLabel({ health }: { health: HealthStatus }) {
  if (health === "ok") return <span className="text-emerald-600 dark:text-emerald-400 text-xs font-medium">Working</span>;
  if (health === "syncing") return <span className="text-blue-600 dark:text-blue-400 text-xs font-medium">Syncing</span>;
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
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        ) : s.status === "failed" ? (
                          <XCircle className="h-3.5 w-3.5 text-red-500" />
                        ) : (
                          <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
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
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      ) : s.status === "failed" ? (
                        <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                      ) : (
                        <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
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
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedInstitution, setExpandedInstitution] = useState<string | null>(null);
  const [schedulerOpen, setSchedulerOpen] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("health");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
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

  const healthOrder: Record<HealthStatus, number> = { stale: 0, failing: 1, degraded: 2, syncing: 3, never: 4, ok: 5 };

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
            <div className="flex items-center gap-2">
              <button onClick={() => setSchedulerOpen((v) => !v)} className="flex items-center gap-2 text-sm hover:opacity-80 transition-opacity">
                <Activity className="w-4 h-4 text-primary" />
                <span className="font-semibold text-foreground text-sm">Sequential Sync</span>
              </button>
              {sched.state === "idle" && sched.lastCycleCompletedAt && (
                <span className="text-[11px] text-muted-foreground/60">Last full cycle: {relativeTime(sched.lastCycleCompletedAt)}</span>
              )}
              {sched.state === "idle" && !sched.lastCycleCompletedAt && (
                <span className="text-[11px] text-muted-foreground/60">No cycles completed yet</span>
              )}
              {schedRunning && sched.currentInstitution && (
                <Badge variant="outline" className="text-xs gap-1 text-blue-600 border-blue-500/30 bg-blue-500/10">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {sched.currentInstitution}
                </Badge>
              )}
              {schedRunning && !sched.currentInstitution && (
                <span className="text-xs text-blue-600 font-medium">Waiting for next...</span>
              )}
              {schedPaused && (
                <span className="text-xs text-amber-600 font-medium">Paused at {sched.queuePosition}/{sched.queueTotal}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {schedRunning ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs border-amber-500/30 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950"
                  onClick={() => schedulerPauseMutation.mutate()}
                  disabled={schedulerPauseMutation.isPending}
                  data-testid="button-pause-scheduler"
                >
                  <AlertCircle className="w-3 h-3 mr-1" />
                  Pause
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="h-8 text-sm bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95 transition-transform"
                  onClick={() => schedulerStartMutation.mutate()}
                  disabled={schedulerStartMutation.isPending}
                  data-testid="button-start-scheduler"
                >
                  {schedulerStartMutation.isPending ? (
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  ) : (
                    <Zap className="w-3 h-3 mr-1" />
                  )}
                  {schedPaused ? "Resume" : "Start Cycle"}
                </Button>
              )}
            </div>
          </div>

          {schedulerOpen && sched && (
            <div className="mt-2 space-y-2" data-testid="scheduler-status">
              {sched.state === "idle" ? (
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-3">
                    <span className="tabular-nums">{sched.cycleCount > 0 ? `${sched.cycleCount} cycle${sched.cycleCount !== 1 ? "s" : ""} completed` : "No cycles run yet"}</span>
                    {sched.completedThisCycle > 0 && <span className="text-emerald-600 font-medium">{sched.completedThisCycle} ok last cycle</span>}
                    {sched.failedThisCycle > 0 && <span className="text-red-500 font-medium">{sched.failedThisCycle} failed last cycle</span>}
                  </div>
                  <span className="text-muted-foreground/50">Delay: {(sched.delayMs / 1000).toFixed(0)}s between syncs</span>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex items-center gap-3">
                      <span className="tabular-nums">{sched.queuePosition}/{sched.queueTotal} done{sched.cycleCount > 1 && ` (cycle #${sched.cycleCount})`}</span>
                      <span className="text-emerald-600 font-medium">{sched.completedThisCycle} ok</span>
                      {sched.failedThisCycle > 0 && (
                        <span className="text-red-500 font-medium">{sched.failedThisCycle} failed</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {sched.estimatedRemainingMs != null && (
                        <span>ETA: <span className="font-medium text-foreground/70">{Math.ceil(sched.estimatedRemainingMs / 60000)}m</span></span>
                      )}
                      {sched.priorityQueue.length > 0 && (
                        <span className="text-blue-500">{sched.priorityQueue.length} priority queued</span>
                      )}
                      <span className="text-muted-foreground/50">Delay: {(sched.delayMs / 1000).toFixed(0)}s</span>
                    </div>
                  </div>
                  <Progress
                    value={sched.queueTotal > 0 ? (sched.queuePosition / sched.queueTotal) * 100 : 0}
                    className="h-1.5 bg-blue-500/10"
                    data-testid="scheduler-cycle-progress"
                  />
                </>
              )}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground/70">
                {sched.cycleStartedAt && (
                  <span>Cycle started {relativeTime(sched.cycleStartedAt)}</span>
                )}
                {sched.lastActivityAt && <span>Last activity {relativeTime(sched.lastActivityAt)}</span>}
                {sched.nextInstitution && (
                  <span>Next: <span className="font-medium text-foreground/70">{sched.nextInstitution}</span></span>
                )}
                {sched.lastCycleCompletedAt && (
                  <span>Last cycle completed {relativeTime(sched.lastCycleCompletedAt)}</span>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 px-4 py-3 border-b border-border">
          <div className="flex flex-wrap items-center gap-1.5">
            {(([
              { key: "all",      label: "All",          activeClass: "bg-primary text-primary-foreground border-primary" },
              { key: "ok",       label: "Working",      activeClass: "bg-emerald-600 text-white border-emerald-600" },
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
                      className={`border-b border-border/50 hover:bg-muted/20 cursor-pointer ${row.consecutiveFailures >= 3 ? "bg-red-500/5" : ""} ${isExpanded ? "bg-primary/5 border-b-0" : ""}`}
                      data-testid={`health-row-${instSlug}`}
                      onClick={() => handleRowClick(row.institution)}
                    >
                      <td className="py-2 px-4 font-medium text-foreground truncate max-w-[250px]" title={row.institution}>
                        <div className="flex items-center gap-1.5">
                          <span className="truncate">{row.institution}</span>
                          {row.consecutiveFailures >= 3 && (
                            <Badge variant="outline" className="shrink-0 text-[10px] px-1.5 py-0 text-red-500 border-red-500/30 bg-red-500/5" data-testid={`badge-needs-attention-${instSlug}`}>
                              Broken Connection
                            </Badge>
                          )}
                          {row.consecutiveFailures >= 1 && row.consecutiveFailures < 3 && (
                            <Badge variant="outline" className="shrink-0 text-[10px] px-1.5 py-0 text-amber-500 border-amber-500/30 bg-amber-500/5">
                              {row.consecutiveFailures}x failed
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="text-center py-2 px-3">
                        <div className="flex items-center justify-center gap-1.5">
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
      </div>
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

function Enrichment({ pw }: { pw: string }) {
  const [polling, setPolling] = useState(false);
  const { toast } = useToast();

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery<EnrichmentStats>({
    queryKey: ["/api/admin/enrichment/stats", pw],
    queryFn: async () => {
      const res = await fetch("/api/admin/enrichment/stats", {
        headers: { "x-admin-password": pw },
      });
      if (!res.ok) throw new Error("Failed to load enrichment stats");
      return res.json();
    },
  });

  const { data: status, refetch: refetchStatus } = useQuery<EnrichmentStatus>({
    queryKey: ["/api/admin/enrichment/status", pw],
    queryFn: async () => {
      const res = await fetch("/api/admin/enrichment/status", {
        headers: { "x-admin-password": pw },
      });
      if (!res.ok) throw new Error("Failed to load enrichment status");
      return res.json();
    },
    refetchInterval: polling ? 1500 : false,
  });

  const prevStatusRef = useRef<string | undefined>();
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status?.status;
    if (status?.status === "running" && !polling) {
      setPolling(true);
    }
    if (prev === "running" && (status?.status === "done" || status?.status === "error")) {
      setPolling(false);
      refetchStats();
      if (status.status === "done") {
        toast({ title: "Enrichment complete", description: `${status.improved} assets improved out of ${status.total} processed` });
      } else {
        toast({ title: "Enrichment failed", description: status.error ?? "Unknown error", variant: "destructive" });
      }
    }
  }, [status?.status]);

  const runEnrichment = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/enrichment/run", {
        method: "POST",
        headers: { "x-admin-password": pw },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to start");
      }
      return res.json();
    },
    onSuccess: () => {
      setPolling(true);
      refetchStatus();
      toast({ title: "Enrichment started", description: "Running GPT-4o-mini pass on incomplete assets..." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to start", description: err.message, variant: "destructive" });
    },
  });

  const stopEnrichment = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/enrichment/stop", {
        method: "POST",
        headers: { "x-admin-password": pw },
      });
      if (!res.ok) { const data = await res.json(); throw new Error(data.error || "Failed to stop"); }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Stop signal sent", description: "Field enrichment will halt after current batch" });
      refetchStatus();
    },
    onError: (err: Error) => toast({ title: "Failed to stop", description: err.message, variant: "destructive" }),
  });

  const isRunning = status?.status === "running";
  const isResumed = status?.resumed === true;
  const unknownCount = stats?.unknownCount ?? 0;
  const totalAssets = stats?.total ?? 0;

  const costEstimate = unknownCount * 0.0003;

  const progressPct = status && status.total > 0 ? Math.round((status.processed / status.total) * 100) : 0;

  if (statsLoading) {
    return (
      <div className="flex items-center justify-center py-20" data-testid="enrichment-loading">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="enrichment-tab">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <div className="text-2xl font-bold tabular-nums text-foreground" data-testid="stat-total-assets">{totalAssets.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground mt-1">Total Assets</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <div className="text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400" data-testid="stat-unknown-count">{unknownCount.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground mt-1">With Unknown Fields</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <div className="text-2xl font-bold tabular-nums text-foreground" data-testid="stat-complete-count">{(totalAssets - unknownCount).toLocaleString()}</div>
          <div className="text-xs text-muted-foreground mt-1">Fully Enriched</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <div className="text-2xl font-bold tabular-nums text-foreground" data-testid="stat-completion-rate">
            {totalAssets > 0 ? Math.round(((totalAssets - unknownCount) / totalAssets) * 100) : 0}%
          </div>
          <div className="text-xs text-muted-foreground mt-1">Completion Rate</div>
        </div>
      </div>

      {stats && unknownCount > 0 && (
        <div className="border border-border rounded-xl bg-card overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-muted/20">
            <h3 className="text-sm font-semibold text-foreground">Per-Field Breakdown</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border">
            <div className="bg-card p-3 text-center">
              <div className="text-lg font-bold tabular-nums text-foreground" data-testid="stat-unknown-target">{stats.byField.target.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Target</div>
            </div>
            <div className="bg-card p-3 text-center">
              <div className="text-lg font-bold tabular-nums text-foreground" data-testid="stat-unknown-modality">{stats.byField.modality.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Modality</div>
            </div>
            <div className="bg-card p-3 text-center">
              <div className="text-lg font-bold tabular-nums text-foreground" data-testid="stat-unknown-indication">{stats.byField.indication.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Indication</div>
            </div>
            <div className="bg-card p-3 text-center">
              <div className="text-lg font-bold tabular-nums text-foreground" data-testid="stat-unknown-stage">{stats.byField.developmentStage.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Dev Stage</div>
            </div>
          </div>
        </div>
      )}

      <div className="border border-border rounded-xl bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-muted/20">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            Estimated Cost
          </h3>
        </div>
        <div className="px-5 py-4">
          <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-background">
            <div>
              <div className="text-sm font-medium text-foreground">GPT-4o-mini Enrichment</div>
              <div className="text-xs text-muted-foreground">{unknownCount.toLocaleString()} assets &times; ~$0.0003/asset</div>
            </div>
            <div className="text-lg font-bold tabular-nums text-foreground" data-testid="cost-estimate">
              ~${costEstimate.toFixed(2)}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button
          onClick={() => runEnrichment.mutate()}
          disabled={isRunning || unknownCount === 0 || runEnrichment.isPending}
          className="flex-1"
          data-testid="button-run-enrichment"
        >
          {isRunning ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Sparkles className="h-4 w-4 mr-2" />
          )}
          Run Enrichment (mini)
        </Button>
      </div>

      {isRunning && status && (
        <div className="border border-border rounded-xl bg-card p-5 space-y-3" data-testid="enrichment-progress">
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
          <p className="text-xs text-muted-foreground">
            {status.improved.toLocaleString()} assets improved so far
          </p>
        </div>
      )}

      {status?.status === "done" && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30" data-testid="enrichment-done">
          <CheckCircle2 className="h-5 w-5 text-emerald-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
              Enrichment complete
            </p>
            <p className="text-xs text-emerald-600 dark:text-emerald-500 mt-1">
              {status.improved} out of {status.total} assets improved
            </p>
          </div>
        </div>
      )}

      {status?.status === "error" && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30" data-testid="enrichment-error">
          <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-700 dark:text-red-400">Enrichment failed</p>
            <p className="text-xs text-red-600 dark:text-red-500 mt-1">{status.error ?? "Unknown error"}</p>
          </div>
        </div>
      )}

      {unknownCount === 0 && totalAssets > 0 && (
        <div className="text-center py-10 text-muted-foreground" data-testid="enrichment-all-complete">
          <CheckCircle2 className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-base font-medium">All assets fully enriched</p>
          <p className="text-sm mt-1">No unknown fields remaining in the database.</p>
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
  role: PortalRole | null;
  createdAt: string;
  lastSignInAt: string | null;
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
  for (const u of users) {
    if (u.role) {
      portalCounts[u.role] = (portalCounts[u.role] ?? 0) + 1;
    } else {
      unassignedCount++;
    }
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
        <div>
          <div className="flex items-center gap-3">
            <div className="text-2xl font-bold tabular-nums text-foreground" data-testid="stat-total-users">{users.length}</div>
            <span className="text-sm text-muted-foreground">total users</span>
          </div>
          {unassignedCount > 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1" data-testid="text-unassigned-count">
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
                <th className="text-left py-3 px-4 font-semibold text-foreground">Email</th>
                <th className="text-left py-3 px-4 font-semibold text-foreground min-w-[160px]">Portal</th>
                <th className="text-center py-3 px-4 font-semibold text-foreground">Joined</th>
                <th className="text-center py-3 px-4 font-semibold text-foreground">Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const portal = getPortalConfig(user.role);
                return (
                  <tr key={user.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors" data-testid={`row-user-${user.id}`}>
                    <td className="py-2.5 px-4 text-foreground font-medium" data-testid={`text-email-${user.id}`}>
                      {user.email}
                    </td>
                    <td className="py-2.5 px-4">
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
                        <span className={`ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${portal.badgeClass}`} data-testid={`badge-portal-${user.id}`}>
                          {portal.label}
                        </span>
                      )}
                      {!portal && user.role === null && (
                        <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground" data-testid={`badge-unassigned-${user.id}`}>
                          Unassigned
                        </span>
                      )}
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
                  <td colSpan={4} className="text-center py-8 text-muted-foreground">No users found</td>
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
          Push all to pipeline
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
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Unindexed assets</p>
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
            <p className="text-sm font-medium">No unindexed assets — queue is clear.</p>
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
                        {group.count} unindexed
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
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">{formatDate(asset.firstSeenAt)}</span>
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
                    ? getFollowUpPills(msg.content)
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
  completenessScore: number;
  grade: "pass" | "revisions" | "incomplete";
};

function GradeBadge({ grade, score }: { grade: string; score: number }) {
  if (grade === "pass") return (
    <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200">
      Pass ({score})
    </Badge>
  );
  if (grade === "revisions") return (
    <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200">
      Revisions ({score})
    </Badge>
  );
  return (
    <Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-red-200">
      Incomplete ({score})
    </Badge>
  );
}

function ManualImportTab({ pw }: { pw: string }) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Stage: "input" → "preview" → "done"
  const [stage, setStage] = useState<"input" | "preview" | "done">("input");
  const [mode, setMode] = useState<"text" | "image">("text");

  // Institution combobox state
  const [instSearch, setInstSearch] = useState("");
  const [instOpen, setInstOpen] = useState(false);
  const [selectedInst, setSelectedInst] = useState("");
  const [showCreateInst, setShowCreateInst] = useState(false);
  const [newInstName, setNewInstName] = useState("");
  const [newInstTtoUrl, setNewInstTtoUrl] = useState("");

  // Input content
  const [pastedText, setPastedText] = useState("");
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);

  // Preview stage
  const [parsedAssets, setParsedAssets] = useState<ParsedImportAsset[]>([]);
  const [checked, setChecked] = useState<boolean[]>([]);
  const [parsedInstitution, setParsedInstitution] = useState("");

  // Done stage
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null);

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

      const formData = new FormData();
      formData.append("institution", selectedInst);
      if (mode === "text") {
        formData.append("rawText", pastedText);
      } else {
        for (const file of imageFiles) {
          formData.append("images", file);
        }
      }

      const res = await fetch("/api/admin/manual-import/parse", {
        method: "POST",
        headers: { "x-admin-password": pw },
        body: formData,
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Parse failed");
      return d as { assets: ParsedImportAsset[]; institution: string };
    },
    onSuccess: (data) => {
      setParsedAssets(data.assets);
      setChecked(data.assets.map(() => true));
      setParsedInstitution(data.institution);
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
          assets: selected.map(({ name, description, sourceUrl, inventors, patentStatus, technologyId, contactEmail }) =>
            ({ name, description, sourceUrl, inventors, patentStatus, technologyId, contactEmail })
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
  const passCnt = parsedAssets.filter((a) => a.grade === "pass").length;
  const revCnt = parsedAssets.filter((a) => a.grade === "revisions").length;
  const incCnt = parsedAssets.filter((a) => a.grade === "incomplete").length;

  const resetToInput = () => {
    setStage("input");
    setParsedAssets([]);
    setChecked([]);
    setImportResult(null);
    setPastedText("");
    setImageFiles([]);
    setImagePreviews([]);
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

            <Popover open={instOpen} onOpenChange={setInstOpen}>
              <PopoverTrigger asChild>
                <div className="relative w-full cursor-text">
                  <Input
                    placeholder="Search institution…"
                    value={instSearch}
                    onChange={(e) => { setInstSearch(e.target.value); setInstOpen(true); setSelectedInst(""); }}
                    onFocus={() => setInstOpen(true)}
                    className="pr-8"
                    data-testid="input-institution-search"
                  />
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                </div>
              </PopoverTrigger>
              <PopoverContent className="w-[400px] p-1 max-h-64 overflow-y-auto" align="start" data-testid="institution-dropdown">
                {filteredInsts.map((name) => (
                  <button
                    key={name}
                    type="button"
                    className="w-full text-left px-3 py-1.5 text-sm rounded hover:bg-muted transition-colors"
                    onMouseDown={(e) => { e.preventDefault(); setSelectedInst(name); setInstSearch(name); setInstOpen(false); setShowCreateInst(false); }}
                    data-testid={`inst-option-${name}`}
                  >
                    {name}
                  </button>
                ))}
                {instSearch.trim() && !allInstitutions.some((n) => n.toLowerCase() === instSearch.toLowerCase()) && (
                  <button
                    type="button"
                    className="w-full text-left px-3 py-1.5 text-sm rounded hover:bg-muted text-primary font-medium transition-colors flex items-center gap-1.5"
                    onMouseDown={(e) => { e.preventDefault(); setNewInstName(instSearch.trim()); setShowCreateInst(true); setInstOpen(false); }}
                    data-testid="button-create-institution"
                  >
                    <Plus className="h-3.5 w-3.5" /> Create "{instSearch.trim()}"…
                  </button>
                )}
                {filteredInsts.length === 0 && !instSearch.trim() && (
                  <p className="px-3 py-2 text-sm text-muted-foreground">Start typing to search…</p>
                )}
              </PopoverContent>
            </Popover>

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
            </div>

            {mode === "text" ? (
              <Textarea
                placeholder="Paste the TTO listing text — titles, descriptions, inventors, patent info…"
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                className="min-h-[180px] font-mono text-xs"
                data-testid="textarea-paste-text"
              />
            ) : (
              <div className="space-y-3">
                <div
                  className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-border rounded-lg p-8 cursor-pointer hover:bg-muted/20 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                  data-testid="dropzone-image-upload"
                >
                  <Upload className="h-8 w-8 text-muted-foreground/50" />
                  <div className="text-center">
                    <p className="text-sm font-medium text-foreground">Click to upload screenshots</p>
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
                {parsedAssets.map((asset, i) => (
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
                      <GradeBadge grade={asset.grade} score={asset.completenessScore} />
                    </td>
                  </tr>
                ))}
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
              AI classification is running in the background. Go to the Indexing Queue tab to push assets to Scout.
            </p>
          </div>
          <Button variant="outline" onClick={resetToInput} data-testid="button-import-more">
            Import more assets
          </Button>
        </div>
      )}
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
          <nav className="flex flex-row overflow-x-auto gap-1 p-2 lg:flex-col lg:overflow-x-visible lg:space-y-1 lg:p-4 lg:gap-0">
            <button
              onClick={() => setActiveTab("new-arrivals")}
              className={`shrink-0 whitespace-nowrap lg:w-full text-left px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 ${
                activeTab === "new-arrivals"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
              data-testid="nav-new-arrivals"
            >
              <Inbox className="h-4 w-4" />
              Indexing Queue
            </button>
            <button
              onClick={() => setActiveTab("manual-import")}
              className={`shrink-0 whitespace-nowrap lg:w-full text-left px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 ${
                activeTab === "manual-import"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
              data-testid="nav-manual-import"
            >
              <PackagePlus className="h-4 w-4" />
              Manual Import
            </button>
            <button
              onClick={() => setActiveTab("data-health")}
              className={`shrink-0 whitespace-nowrap lg:w-full text-left px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 ${
                activeTab === "data-health"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
              data-testid="nav-data-health"
            >
              <Activity className="h-4 w-4" />
              Data Health
            </button>
            <button
              onClick={() => setActiveTab("enrichment")}
              className={`shrink-0 whitespace-nowrap lg:w-full text-left px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 ${
                activeTab === "enrichment"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
              data-testid="nav-enrichment"
            >
              <Sparkles className="h-4 w-4" />
              Enrichment
            </button>
            <button
              onClick={() => setActiveTab("pipeline-review")}
              className={`shrink-0 whitespace-nowrap lg:w-full text-left px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 ${
                activeTab === "pipeline-review"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
              data-testid="nav-pipeline-review"
            >
              <ClipboardList className="h-4 w-4" />
              Pipeline Review
            </button>
            <button
              onClick={() => setActiveTab("research-queue")}
              className={`shrink-0 whitespace-nowrap lg:w-full text-left px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 ${
                activeTab === "research-queue"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
              data-testid="nav-research-queue"
            >
              <Microscope className="h-4 w-4" />
              <span>Research Queue</span>
              {pendingCount > 0 && (
                <span className="ml-auto text-[10px] font-bold bg-amber-500 text-white rounded-full px-1.5 py-0.5 min-w-[18px] text-center" data-testid="badge-pending-count">
                  {pendingCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("concept-queue")}
              className={`shrink-0 whitespace-nowrap lg:w-full text-left px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 ${
                activeTab === "concept-queue"
                  ? "bg-amber-500/10 text-amber-600"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
              data-testid="nav-concept-queue"
            >
              <Lightbulb className="h-4 w-4" />
              Concept Queue
            </button>

            <button
              onClick={() => setActiveTab("eden")}
              className={`shrink-0 whitespace-nowrap lg:w-full text-left px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 ${
                activeTab === "eden"
                  ? "bg-emerald-500/10 text-emerald-600"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
              data-testid="nav-eden"
            >
              <BrainCircuit className="h-4 w-4" />
              EDEN
            </button>

            <div className="hidden lg:block border-t border-border my-2" />

            <button
              onClick={() => setActiveTab("account-center")}
              className={`shrink-0 whitespace-nowrap lg:w-full text-left px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 ${
                activeTab === "account-center"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
              data-testid="nav-account-center"
            >
              <Users className="h-4 w-4" />
              Account Center
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

          {activeTab === "manual-import" && (
            <>
              <div className="mb-6">
                <h2 className="text-2xl font-semibold text-foreground" data-testid="text-section-title">Manual Import</h2>
                <p className="text-sm text-muted-foreground mt-1">Upload a screenshot or paste text from any TTO listing — AI extracts structured fields and adds the asset to the Indexing Queue.</p>
              </div>
              <ManualImportTab pw={pw} />
            </>
          )}

          {activeTab === "data-health" && (
            <DataHealth pw={pw} />
          )}

          {activeTab === "enrichment" && (
            <>
              <div className="mb-6">
                <h2 className="text-2xl font-semibold text-foreground" data-testid="text-section-title">Enrichment</h2>
                <p className="text-sm text-muted-foreground mt-1">AI enrichment for assets with unknown fields (resumable, auto-recovers after restart)</p>
              </div>
              <Enrichment pw={pw} />
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
                <h2 className="text-2xl font-semibold text-foreground" data-testid="text-section-title">Research Queue</h2>
                <p className="text-sm text-muted-foreground mt-1">Review researcher-submitted Discovery Cards. Approved cards enter Scout as the "Lab Discoveries" source.</p>
              </div>
              <ResearchQueue pw={pw} />
            </>
          )}

          {activeTab === "concept-queue" && (
            <>
              <div className="mb-6">
                <h2 className="text-2xl font-semibold text-foreground" data-testid="text-section-title">Concept Queue</h2>
                <p className="text-sm text-muted-foreground mt-1">View all submitted concepts from the EdenDiscovery portal with AI credibility scores.</p>
              </div>
              <ConceptQueue pw={pw} />
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
