import React, { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Shield, LogOut, Activity, Inbox, Users, Send, ClipboardCheck,
  Play, Pause, Loader2, CheckCircle2, AlertTriangle, Zap, Database,
  RefreshCw, ChevronRight, ChevronDown, X, Trash2, ArrowUpCircle,
  Eye, Mail, Clock, Building2, Check, Search, AlertCircle,
  Microscope, Lightbulb, BarChart3, XCircle,
} from "lucide-react";

const ADMIN_KEY = "eden-admin-pw";

// ── Types ──────────────────────────────────────────────────────────────────────

type HealthStatus =
  | "ok" | "warning" | "degraded" | "failing" | "stale" | "syncing"
  | "never" | "blocked" | "network_blocked" | "site_down" | "rate_limited" | "parser_failure";

interface HealthRow {
  institution: string;
  health: HealthStatus;
  lastSyncAt: string | null;
  totalInDb: number;
  biotechRelevant: number;
  consecutiveFailures: number;
  tier?: number;
}

interface SchedulerStatus {
  state: "idle" | "running" | "paused";
  currentInstitutions: string[];
  currentInstitution: string | null;
  nextInstitution: string | null;
  queuePosition: number;
  queueTotal: number;
  completedThisCycle: number;
  failedThisCycle: number;
  cycleCount: number;
  avgSyncMs: number | null;
  estimatedRemainingMs: number | null;
  maxConcurrency?: number;
  currentTier?: 1 | 2 | 3 | 4 | null;
  tierOnly?: number | null;
}

interface CollectorHealth {
  rows: HealthRow[];
  totalInDb: number;
  totalBiotechRelevant: number;
  totalInstitutions: number;
  issueCount: number;
  syncingCount: number;
  syncedToday: number;
  scheduler: SchedulerStatus;
}

interface SyncSession {
  id: number;
  sessionId: string;
  institution: string;
  status: string;
  phase: string | null;
  rawCount: number;
  newCount: number;
  relevantCount: number;
  pushedCount: number;
  currentIndexed: number;
  createdAt: string;
  completedAt: string | null;
  lastRefreshedAt: string | null;
  errorMessage: string | null;
}

interface SyncStatusResponse {
  found: boolean;
  session?: SyncSession;
  syncRunning: boolean;
  syncRunningFor: string | null;
}

interface NewArrivalAsset {
  id: number;
  assetName: string;
  firstSeenAt: string;
  sourceUrl: string | null;
}

interface NewArrivalGroup {
  institution: string;
  count: number;
  assets: NewArrivalAsset[];
}

interface NewArrivalsResponse {
  totalUnindexed: number;
  totalPendingEnrichment: number;
  totalInstitutions: number;
  groups: NewArrivalGroup[];
}

interface AdminUser {
  id: string;
  email: string;
  contactEmail: string | null;
  role: string | null;
  subscribedToDigest: boolean;
  createdAt: string;
  lastSignInAt: string | null;
}

interface AdminOrg {
  id: number;
  name: string;
  billingEmail: string | null;
  planTier: string | null;
  memberCount?: number;
}

interface Discovery {
  id: number;
  assetName: string;
  institution: string;
  modality: string;
  indication: string;
  developmentStage: string;
  sourceUrl: string | null;
  firstSeenAt: string | null;
}

interface DispatchSubscriber {
  id: string;
  username: string;
  effectiveEmail: string;
}

interface SubscriberMatch {
  userId: string;
  email: string;
  companyName: string | null;
  totalMatches: number;
  therapeuticAreas: string[];
  modalities: string[];
  top5AssetIds: number[];
}

interface DispatchLog {
  id: number;
  sentAt: string;
  subject: string;
  recipients: string[];
  assetCount: number;
  windowHours: number;
  isTest: boolean;
}

interface ResearchCard {
  id: number;
  assetName: string;
  institution: string;
  adminStatus: "pending" | "approved" | "rejected";
}

interface ConceptCard {
  id: number;
  title: string;
  oneLiner: string;
  credibilityScore: number | null;
  submitterName: string;
  submitterAffiliation: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function adminFetch(url: string, pw: string, options?: RequestInit) {
  return fetch(url, {
    ...options,
    headers: {
      "x-admin-password": pw,
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });
}

function formatRelative(dateStr: string | Date | null): string {
  if (!dateStr) return "never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    " " + new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function healthDot(status: HealthStatus): string {
  switch (status) {
    case "ok": return "bg-emerald-500";
    case "syncing": return "bg-blue-500 animate-pulse";
    case "never": return "bg-muted-foreground/30";
    case "stale": return "bg-amber-400";
    case "warning": return "bg-amber-500";
    case "degraded": return "bg-orange-500";
    default: return "bg-red-500";
  }
}

function healthIsIssue(status: HealthStatus): boolean {
  return !["ok", "syncing", "never"].includes(status);
}

function roleBadge(role: string | null): { label: string; color: string } {
  switch (role) {
    case "industry": return { label: "Industry", color: "bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300" };
    case "researcher": return { label: "Researcher", color: "bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300" };
    case "concept": return { label: "Discovery", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300" };
    default: return { label: role ?? "None", color: "bg-muted text-muted-foreground" };
  }
}

// ── Password Gate ──────────────────────────────────────────────────────────────

function PasswordGate({ onAuth }: { onAuth: () => void }) {
  const [pw, setPw] = useState(() => localStorage.getItem(ADMIN_KEY) ?? "");
  const [error, setError] = useState(false);

  function attempt() {
    if (pw === "eden") {
      localStorage.setItem(ADMIN_KEY, pw);
      onAuth();
    } else {
      setError(true);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-5">
        <div className="flex items-center gap-2 justify-center">
          <Shield className="h-6 w-6 text-primary" />
          <span className="text-lg font-semibold text-foreground">EdenRadar Admin</span>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); attempt(); }} className="space-y-3">
          <input
            type="password"
            value={pw}
            onChange={(e) => { setPw(e.target.value); setError(false); }}
            placeholder="Admin password"
            className={`w-full rounded-xl border px-4 py-3 text-base bg-background focus:outline-none focus:ring-2 focus:ring-primary ${
              error ? "border-destructive focus:ring-destructive" : "border-border"
            }`}
            data-testid="input-mobile-admin-password"
            autoFocus
          />
          {error && <p className="text-sm text-destructive text-center">Incorrect password</p>}
          <button
            type="submit"
            className="w-full rounded-xl bg-primary text-primary-foreground py-3 text-base font-semibold active:opacity-80"
            data-testid="button-mobile-admin-login"
          >
            Enter
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Per-Institution Sync Panel ─────────────────────────────────────────────────

interface SyncHistorySession {
  sessionId: string;
  status: string;
  rawCount: number;
  relevantCount: number;
  pushedCount: number;
  completedAt: string | null;
  errorMessage: string | null;
}

function InstitutionSyncPanel({
  institution, pw, onClose, health, tier,
}: {
  institution: string;
  pw: string;
  onClose: () => void;
  health?: string;
  tier?: number;
}) {
  const qc = useQueryClient();
  const [polling, setPolling] = useState(true);
  const [confirmStart, setConfirmStart] = useState(false);
  const confirmStartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data, refetch } = useQuery<SyncStatusResponse>({
    queryKey: ["/api/ingest/sync/status-mobile", institution, pw],
    queryFn: async () => {
      const res = await adminFetch(`/api/ingest/sync/${encodeURIComponent(institution)}/status`, pw);
      if (!res.ok) return { found: false, syncRunning: false, syncRunningFor: null };
      return res.json();
    },
    refetchInterval: polling ? 3000 : false,
  });

  const { data: historyData, refetch: refetchHistory } = useQuery<{ sessions: SyncHistorySession[] }>({
    queryKey: ["/api/ingest/sync/history-mobile", institution, pw],
    queryFn: async () => {
      const res = await adminFetch(`/api/ingest/sync/${encodeURIComponent(institution)}/history`, pw);
      if (!res.ok) return { sessions: [] };
      return res.json();
    },
    staleTime: 30000,
  });

  const session = data?.session;
  const isRunning = session?.status === "running" || (data?.syncRunning && data.syncRunningFor === institution);
  const isEnriched = session?.status === "enriched" && !isRunning;
  const isPushed = session?.status === "pushed";
  const isFailed = session?.status === "failed";
  const isAnomalous = session?.status === "anomalous";

  useEffect(() => {
    const terminal = ["enriched", "pushed", "failed", "anomalous"];
    if (session?.status && terminal.includes(session.status) && !isRunning) {
      setPolling(false);
      qc.invalidateQueries({ queryKey: ["/api/admin/collector-health-mobile"] });
      refetchHistory();
    } else if (isRunning && !polling) {
      setPolling(true);
    }
  }, [session?.status, isRunning]);

  useEffect(() => {
    return () => { if (confirmStartTimer.current) clearTimeout(confirmStartTimer.current); };
  }, []);

  const startMutation = useMutation({
    mutationFn: async () => {
      const res = await adminFetch(`/api/ingest/sync/${encodeURIComponent(institution)}`, pw, { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Start failed");
      return d;
    },
    onSuccess: () => { setPolling(true); setConfirmStart(false); refetch(); },
    onError: () => setConfirmStart(false),
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const res = await adminFetch(`/api/ingest/sync/${encodeURIComponent(institution)}/cancel`, pw, { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Cancel failed");
      return d;
    },
    onSuccess: () => { setPolling(false); refetch(); qc.invalidateQueries({ queryKey: ["/api/admin/collector-health-mobile"] }); },
  });

  const pushMutation = useMutation({
    mutationFn: async () => {
      const res = await adminFetch(`/api/ingest/sync/${encodeURIComponent(institution)}/push`, pw, { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Push failed");
      return d;
    },
    onSuccess: () => { refetch(); refetchHistory(); qc.invalidateQueries({ queryKey: ["/api/admin/collector-health-mobile"] }); },
  });

  const handleStartClick = () => {
    if (!confirmStart) {
      setConfirmStart(true);
      if (confirmStartTimer.current) clearTimeout(confirmStartTimer.current);
      confirmStartTimer.current = setTimeout(() => setConfirmStart(false), 3000);
    } else {
      if (confirmStartTimer.current) clearTimeout(confirmStartTimer.current);
      startMutation.mutate();
    }
  };

  const phaseLabel =
    session?.phase === "scraping" ? "Collecting listings…"
    : session?.phase === "comparing" ? "Comparing fingerprints…"
    : session?.phase === "enriching" ? "Enriching with AI…"
    : session?.phase === "done" ? "Done"
    : isRunning ? "Starting sync…" : "";

  const phaseWidth =
    session?.phase === "scraping" ? "33%"
    : session?.phase === "comparing" ? "55%"
    : session?.phase === "enriching" ? "80%"
    : session?.phase === "done" ? "100%" : "10%";

  const isActing = startMutation.isPending || cancelMutation.isPending || pushMutation.isPending;

  const recentHistory = (historyData?.sessions ?? [])
    .filter(s => ["pushed", "failed", "enriched", "anomalous"].includes(s.status))
    .slice(0, 4);

  const tierInfo = tier != null && TIER_COLORS[tier] ? { color: TIER_COLORS[tier], title: TIER_TITLES[tier] } : null;

  return (
    <div className="border-t border-border bg-muted/20 px-4 py-4 space-y-3" data-testid={`sync-panel-${institution}`}>
      {/* Panel header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-foreground truncate">{institution}</p>
            {tierInfo && (
              <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${tierInfo.color.badge}`} title={tierInfo.title}>
                T{tier}
              </span>
            )}
          </div>
          {session?.errorMessage && !isRunning && (
            <p className="text-[11px] text-red-500/80 truncate mt-0.5 max-w-[260px]" title={session.errorMessage}>
              {session.errorMessage.length > 70 ? session.errorMessage.slice(0, 70) + "…" : session.errorMessage}
            </p>
          )}
        </div>
        <button onClick={onClose} className="text-muted-foreground p-1 rounded-lg active:opacity-60 shrink-0" data-testid="button-close-sync-panel">
          <X className="h-4 w-4" />
        </button>
      </div>

      {!data ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading…</span>
        </div>
      ) : !data.found || !session ? (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">No sync session found. This institution hasn't been synced yet.</p>
          <button
            onClick={handleStartClick}
            disabled={isActing}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold w-full justify-center active:opacity-70 transition-colors ${
              confirmStart
                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                : "bg-primary text-primary-foreground"
            }`}
            data-testid="button-start-sync"
          >
            {startMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {confirmStart ? "Confirm Start?" : "Start Sync"}
          </button>
          {startMutation.error && <p className="text-xs text-destructive">{(startMutation.error as Error).message}</p>}
        </div>
      ) : (
        <div className="space-y-3">
          {/* Status badge */}
          <div className="flex items-center gap-2 flex-wrap">
            {isRunning && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
            {isPushed && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
            {isFailed && <XCircle className="h-4 w-4 text-red-500" />}
            {isAnomalous && <AlertTriangle className="h-4 w-4 text-orange-500" />}
            {isEnriched && <Database className="h-4 w-4 text-amber-500" />}
            <span className="text-sm font-medium text-foreground capitalize">{session.status}</span>
            {session.rawCount > 0 && <span className="text-xs text-muted-foreground">{session.rawCount} collected</span>}
            {session.relevantCount > 0 && <span className="text-xs text-emerald-600 dark:text-emerald-400">{session.relevantCount} relevant</span>}
          </div>

          {/* Progress bar (running) */}
          {isRunning && (
            <div className="space-y-1">
              <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                <div className="bg-primary h-2 rounded-full transition-all duration-700 animate-pulse" style={{ width: phaseWidth }} />
              </div>
              {phaseLabel && <p className="text-xs text-muted-foreground">{phaseLabel}</p>}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            {!isRunning && session.status !== "pushed" && (
              <button
                onClick={handleStartClick}
                disabled={isActing || data.syncRunning}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold active:opacity-70 disabled:opacity-50 transition-colors ${
                  confirmStart
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                    : "bg-primary text-primary-foreground"
                }`}
                data-testid="button-start-sync"
              >
                {startMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                {confirmStart ? "Confirm?" : (session.status === "failed" || isAnomalous ? "Re-sync" : "Start Sync")}
              </button>
            )}

            {(isRunning || health === "stale") && (
              <button
                onClick={() => cancelMutation.mutate()}
                disabled={isActing}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 text-xs font-semibold active:opacity-70"
                data-testid="button-cancel-sync"
              >
                {cancelMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                {isRunning && data?.syncRunning ? "Cancel" : "Clear Stale"}
              </button>
            )}

            {isEnriched && session.rawCount > 0 && (
              <button
                onClick={() => pushMutation.mutate()}
                disabled={isActing}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 text-xs font-semibold active:opacity-70"
                data-testid="button-push-sync"
              >
                {pushMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUpCircle className="h-3.5 w-3.5" />}
                Push to Index
              </button>
            )}
          </div>

          {(startMutation.error || cancelMutation.error || pushMutation.error) && (
            <p className="text-xs text-destructive">
              {((startMutation.error || cancelMutation.error || pushMutation.error) as Error).message}
            </p>
          )}

          {session.completedAt && (
            <p className="text-[11px] text-muted-foreground">Last completed: {formatDate(session.completedAt)}</p>
          )}
        </div>
      )}

      {/* Past sessions history */}
      {recentHistory.length > 0 && (
        <div className="pt-3 border-t border-border/40 space-y-1">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Past Sessions</p>
          {recentHistory.map((s, i) => (
            <div key={s.sessionId ?? i} className="flex items-center justify-between py-1.5 px-3 rounded-xl bg-muted/40 text-xs gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {s.status === "pushed"
                  ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  : s.status === "failed"
                  ? <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                  : s.status === "anomalous"
                  ? <AlertTriangle className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                  : <Clock className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                <span className="text-muted-foreground truncate">{s.completedAt ? formatRelative(s.completedAt) : "In progress"}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground/70 shrink-0 tabular-nums">
                <span>{s.rawCount} raw</span>
                {s.relevantCount > 0 && <span className="text-emerald-600 dark:text-emerald-400 font-medium">{s.relevantCount} rel</span>}
                {s.pushedCount > 0 && <span className="text-primary font-medium">{s.pushedCount} pushed</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sync Tab ───────────────────────────────────────────────────────────────────

const TIER_COLORS: Record<number, { badge: string; label: string }> = {
  1: { badge: "text-sky-600 border-sky-500/30 bg-sky-500/5", label: "T1" },
  2: { badge: "text-violet-600 border-violet-500/30 bg-violet-500/5", label: "T2" },
  3: { badge: "text-emerald-600 border-emerald-500/30 bg-emerald-500/5", label: "T3" },
  4: { badge: "text-orange-600 border-orange-500/30 bg-orange-500/5", label: "T4" },
};

const TIER_TITLES: Record<number, string> = {
  1: "T1: API/RSS (fastest)",
  2: "T2: Platform factory",
  3: "T3: Custom bespoke HTML",
  4: "T4: Playwright (headless)",
};

function SyncTab({ pw }: { pw: string }) {
  const [sortMode, setSortMode] = useState<"health" | "alpha" | "recent">("health");
  const [filterTier, setFilterTier] = useState<number | null>(null);
  const [expandedInstitution, setExpandedInstitution] = useState<string | null>(null);
  const [pendingTier, setPendingTier] = useState<1 | 2 | 3 | 4 | null>(null);
  const tierConfirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pendingSyncInst, setPendingSyncInst] = useState<string | null>(null);
  const pendingSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (pendingSyncTimer.current) clearTimeout(pendingSyncTimer.current);
      if (tierConfirmTimer.current) clearTimeout(tierConfirmTimer.current);
    };
  }, []);

  const { data, isLoading, refetch, isRefetching } = useQuery<CollectorHealth>({
    queryKey: ["/api/admin/collector-health-mobile", pw],
    queryFn: async () => {
      const res = await adminFetch("/api/admin/collector-health", pw);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    staleTime: 30000,
    refetchInterval: 30000,
    enabled: !!pw,
  });

  const startMutation = useMutation({
    mutationFn: async () => {
      const res = await adminFetch("/api/ingest/scheduler/start", pw, { method: "POST" });
      if (!res.ok) throw new Error("Failed to start");
      return res.json();
    },
    onSuccess: () => refetch(),
  });

  const pauseMutation = useMutation({
    mutationFn: async () => {
      const res = await adminFetch("/api/ingest/scheduler/pause", pw, { method: "POST" });
      if (!res.ok) throw new Error("Failed to pause");
      return res.json();
    },
    onSuccess: () => refetch(),
  });

  const concurrencyMutation = useMutation({
    mutationFn: async (concurrency: 1 | 2 | 3) => {
      const res = await adminFetch("/api/ingest/scheduler/concurrency", pw, {
        method: "POST",
        body: JSON.stringify({ concurrency }),
      });
      if (!res.ok) throw new Error("Failed to set concurrency");
      return res.json();
    },
    onSuccess: () => refetch(),
  });

  const tierMutation = useMutation({
    mutationFn: async (tier: 1 | 2 | 3 | 4) => {
      const res = await adminFetch("/api/ingest/scheduler/run-tier", pw, {
        method: "POST",
        body: JSON.stringify({ tier }),
      });
      if (!res.ok) throw new Error("Failed to start tier sync");
      return res.json();
    },
    onSuccess: () => { setPendingTier(null); refetch(); },
    onError: () => setPendingTier(null),
  });

  const rowSyncMutation = useMutation({
    mutationFn: async (institution: string) => {
      const res = await adminFetch(`/api/ingest/sync/${encodeURIComponent(institution)}`, pw, { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Sync failed");
      return d;
    },
    onSettled: () => { setPendingSyncInst(null); refetch(); },
  });

  const handleRowSyncClick = (e: React.MouseEvent, institution: string) => {
    e.stopPropagation();
    if (rowSyncMutation.isPending) return;
    if (pendingSyncInst !== institution) {
      setPendingSyncInst(institution);
      if (pendingSyncTimer.current) clearTimeout(pendingSyncTimer.current);
      pendingSyncTimer.current = setTimeout(() => setPendingSyncInst(null), 3000);
    } else {
      if (pendingSyncTimer.current) clearTimeout(pendingSyncTimer.current);
      setPendingSyncInst(null);
      rowSyncMutation.mutate(institution);
    }
  };

  const handleTierClick = (tier: 1 | 2 | 3 | 4) => {
    const sched = data?.scheduler;
    if (sched?.state === "paused" && sched.tierOnly === tier) {
      startMutation.mutate();
      return;
    }
    if (pendingTier !== tier) {
      setPendingTier(tier);
      if (tierConfirmTimer.current) clearTimeout(tierConfirmTimer.current);
      tierConfirmTimer.current = setTimeout(() => setPendingTier(null), 4000);
    } else {
      if (tierConfirmTimer.current) clearTimeout(tierConfirmTimer.current);
      tierMutation.mutate(tier);
    }
  };

  const scheduler = data?.scheduler;
  const rows = data?.rows ?? [];
  const concurrency = scheduler?.maxConcurrency ?? 1;
  const schedRunning = scheduler?.state === "running";
  const schedPaused = scheduler?.state === "paused";

  // Apply tier filter only
  const filteredRows = rows.filter((row) => {
    if (filterTier !== null && row.tier !== filterTier) return false;
    return true;
  });

  const sortedRows = [...filteredRows].sort((a, b) => {
    if (sortMode === "alpha") return a.institution.localeCompare(b.institution);
    if (sortMode === "recent") {
      if (!a.lastSyncAt && !b.lastSyncAt) return a.institution.localeCompare(b.institution);
      if (!a.lastSyncAt) return 1;
      if (!b.lastSyncAt) return -1;
      return new Date(b.lastSyncAt).getTime() - new Date(a.lastSyncAt).getTime();
    }
    const issueStatuses = new Set(["failing", "degraded", "warning", "network_blocked", "site_down", "rate_limited", "parser_failure", "blocked"]);
    const rank = (r: HealthRow) =>
      issueStatuses.has(r.health) ? 0
      : r.health === "stale" ? 1
      : r.health === "syncing" ? 2
      : r.health === "ok" ? 3
      : 4;
    const diff = rank(a) - rank(b);
    return diff !== 0 ? diff : b.consecutiveFailures - a.consecutiveFailures;
  });

  const stateLabel = schedRunning ? "Running" : schedPaused ? "Paused" : "Idle";
  const stateColor = schedRunning ? "text-emerald-600 dark:text-emerald-400"
    : schedPaused ? "text-amber-600 dark:text-amber-400"
    : "text-muted-foreground";
  const isActing = startMutation.isPending || pauseMutation.isPending;
  const anyTierBusy = schedRunning || tierMutation.isPending;

  if (isLoading) return (
    <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" /><span>Loading…</span>
    </div>
  );

  return (
    <div className="space-y-4 px-4 pt-4">
      {/* Scheduler card */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        {/* State row */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Scheduler</p>
            <p className={`text-lg font-bold mt-0.5 ${stateColor}`} data-testid="text-scheduler-state">{stateLabel}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => refetch()} disabled={isRefetching}
              className="p-2 rounded-xl text-muted-foreground hover:bg-muted active:opacity-60" data-testid="button-refresh-sync">
              <RefreshCw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
            </button>
            {schedRunning ? (
              <button onClick={() => pauseMutation.mutate()} disabled={isActing}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 font-semibold text-sm active:opacity-70"
                data-testid="button-pause-scheduler">
                {isActing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />} Pause
              </button>
            ) : (
              <button onClick={() => startMutation.mutate()} disabled={isActing}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 font-semibold text-sm active:opacity-70"
                data-testid="button-start-scheduler">
                {isActing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {schedPaused ? (scheduler?.tierOnly != null ? `Resume T${scheduler.tierOnly}` : "Resume") : "Start"}
              </button>
            )}
          </div>
        </div>

        {/* Running progress */}
        {schedRunning && (scheduler?.currentInstitutions?.length ?? 0) > 0 && (
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm">
              <Zap className="h-3.5 w-3.5 text-blue-500 shrink-0" />
              <span className="text-foreground font-medium truncate">
                {scheduler!.currentInstitutions.join(", ")}
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>{scheduler!.queuePosition}/{scheduler!.queueTotal}</span>
              <span>{scheduler!.completedThisCycle} done</span>
              {(scheduler!.failedThisCycle ?? 0) > 0 && <span className="text-red-500">{scheduler!.failedThisCycle} failed</span>}
            </div>
          </div>
        )}
        {schedRunning && (scheduler?.currentInstitutions?.length ?? 0) === 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin shrink-0" />
            <span>Cycle #{scheduler?.cycleCount} — queuing next batch…</span>
          </div>
        )}

        {/* Concurrency: 1x / 2x / 3x */}
        <div className="flex items-center gap-2 pt-1 border-t border-border/40">
          <span className="text-xs text-muted-foreground font-medium shrink-0">Concurrency:</span>
          <div className="flex items-center rounded-xl border border-border overflow-hidden text-xs font-semibold" data-testid="concurrency-selector">
            {([1, 2, 3] as const).map((n, i) => (
              <button
                key={n}
                onClick={() => concurrencyMutation.mutate(n)}
                disabled={concurrencyMutation.isPending || concurrency === n}
                className={`px-3 py-1.5 transition-colors ${i > 0 ? "border-l border-border" : ""} ${concurrency === n ? "bg-primary text-primary-foreground" : "text-muted-foreground active:opacity-60"}`}
                data-testid={`button-concurrency-${n}`}
                title={n === 1 ? "Serial: one at a time" : n === 2 ? "Parallel: two at once" : "High-speed: three at once"}
              >{n}x</button>
            ))}
          </div>
        </div>

        {/* Tier sync buttons */}
        <div className="flex items-center gap-2 pt-1 border-t border-border/40 flex-wrap">
          <span className="text-xs text-muted-foreground font-medium shrink-0">Sync tier:</span>
          {([1, 2, 3, 4] as const).map((tier) => {
            const isConfirming = pendingTier === tier;
            const isTierRunning = schedRunning && scheduler?.currentTier === tier;
            const isTierPaused = schedPaused && scheduler?.tierOnly === tier;
            const tc = TIER_COLORS[tier];
            return (
              <button
                key={tier}
                onClick={() => handleTierClick(tier)}
                disabled={anyTierBusy}
                className={`px-3 py-1 rounded-xl border text-xs font-semibold transition-colors active:opacity-70 disabled:opacity-40 ${
                  isTierRunning
                    ? "border-emerald-400/60 text-emerald-700 dark:text-emerald-400 bg-emerald-500/10"
                    : isTierPaused
                    ? "border-amber-400/60 text-amber-700 dark:text-amber-400 bg-amber-500/10"
                    : isConfirming
                    ? "border-amber-400/60 text-amber-700 dark:text-amber-400 bg-amber-500/10"
                    : `border-border ${tc.badge}`
                }`}
                data-testid={`button-sync-tier-${tier}`}
                title={TIER_TITLES[tier]}
              >
                {isTierRunning ? (
                  <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />T{tier}</span>
                ) : isTierPaused ? `Resume T${tier}`
                  : isConfirming ? `Confirm T${tier}?`
                  : `Sync T${tier}`}
              </button>
            );
          })}
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl border border-border bg-card p-3 text-center" data-testid="stat-mobile-total">
          <Database className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
          <p className="text-xl font-bold text-foreground tabular-nums">{(data?.totalInDb ?? 0).toLocaleString()}</p>
          <p className="text-[10px] text-muted-foreground">Total in DB</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-3 text-center" data-testid="stat-mobile-today">
          <Activity className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
          <p className="text-xl font-bold text-foreground tabular-nums">{data?.syncedToday ?? 0}</p>
          <p className="text-[10px] text-muted-foreground">Synced today</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-3 text-center" data-testid="stat-mobile-issues">
          <AlertTriangle className={`h-4 w-4 mx-auto mb-1 ${(data?.issueCount ?? 0) > 0 ? "text-red-500" : "text-muted-foreground"}`} />
          <p className={`text-xl font-bold tabular-nums ${(data?.issueCount ?? 0) > 0 ? "text-red-500" : "text-foreground"}`}>
            {data?.issueCount ?? 0}
          </p>
          <p className="text-[10px] text-muted-foreground">Issues</p>
        </div>
      </div>

      {/* Institution health list */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {/* Header: title + sort toggle */}
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">
            Institutions{" "}
            <span className="text-muted-foreground font-normal">
              ({filteredRows.length}{filteredRows.length !== rows.length ? `/${rows.length}` : ""})
            </span>
          </p>
          <button
            onClick={() => setSortMode(s => s === "health" ? "alpha" : s === "alpha" ? "recent" : "health")}
            className="text-xs text-primary font-medium px-2 py-1 rounded-lg bg-primary/10 active:opacity-60"
            data-testid="button-sort-toggle"
          >
            {sortMode === "health" ? "A–Z" : sortMode === "alpha" ? "Recent" : "By Health"}
          </button>
        </div>

        {/* Tier filter chips */}
        <div className="px-4 py-2 border-b border-border/60 flex items-center gap-2 overflow-x-auto">
          <span className="text-[11px] text-muted-foreground font-medium shrink-0">Tier:</span>
          <button
            onClick={() => setFilterTier(null)}
            className={`shrink-0 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors active:opacity-60 ${filterTier === null ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
            data-testid="button-filter-tier-all"
          >All</button>
          {([1, 2, 3, 4] as const).map((tier) => {
            const tc = TIER_COLORS[tier];
            const active = filterTier === tier;
            return (
              <button
                key={tier}
                onClick={() => setFilterTier(active ? null : tier)}
                className={`shrink-0 px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors active:opacity-60 ${active ? "bg-primary text-primary-foreground border-primary" : `border ${tc.badge}`}`}
                data-testid={`button-filter-tier-${tier}`}
                title={TIER_TITLES[tier]}
              >T{tier}</button>
            );
          })}
        </div>

        {/* Rows */}
        <div className="divide-y divide-border">
          {sortedRows.map((row) => {
            const instSlug = row.institution.replace(/\s+/g, "-").toLowerCase();
            const isSyncPending = pendingSyncInst === row.institution;
            const isSyncingNow = rowSyncMutation.isPending && rowSyncMutation.variables === row.institution;
            const isCurrentlyRunning = scheduler?.currentInstitutions?.includes(row.institution) ?? false;
            const isExpanded = expandedInstitution === row.institution;
            const toggleExpand = () => setExpandedInstitution(prev => prev === row.institution ? null : row.institution);
            return (
              <React.Fragment key={row.institution}>
                <div className="flex items-center" data-testid={`row-health-${instSlug}`}>
                  {/* Expand area: dot + name + timestamp (no chevron here) */}
                  <div
                    className="flex-1 flex items-center gap-3 pl-4 pr-2 py-2.5 cursor-pointer active:bg-muted/50 min-w-0"
                    onClick={toggleExpand}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && toggleExpand()}
                  >
                    <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${healthDot(row.health)}`} />
                    <span className="flex-1 text-sm text-foreground truncate">{row.institution}</span>
                    <span className="text-[11px] text-muted-foreground shrink-0">{formatRelative(row.lastSyncAt)}</span>
                  </div>
                  {/* Inline sync button (before chevron) */}
                  <button
                    onClick={(e) => handleRowSyncClick(e, row.institution)}
                    disabled={isSyncingNow || isCurrentlyRunning || (rowSyncMutation.isPending && rowSyncMutation.variables !== row.institution)}
                    className={`flex items-center gap-1 px-2 py-1.5 rounded-xl shrink-0 transition-colors active:opacity-70 disabled:opacity-40 text-xs font-medium ${
                      isSyncPending
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                        : isSyncingNow || isCurrentlyRunning
                        ? "text-primary"
                        : "text-muted-foreground hover:bg-muted"
                    }`}
                    data-testid={`button-row-sync-${instSlug}`}
                    title={isSyncPending ? "Tap again to confirm sync" : isCurrentlyRunning ? "Sync running" : "Start sync"}
                  >
                    {isSyncingNow || isCurrentlyRunning
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : isSyncPending
                      ? <><RefreshCw className="h-3.5 w-3.5" /><span>Tap again</span></>
                      : <Play className="h-3.5 w-3.5" />
                    }
                  </button>
                  {/* Chevron expand indicator */}
                  <button
                    onClick={toggleExpand}
                    className="p-2 mr-1 text-muted-foreground shrink-0 active:opacity-60"
                    tabIndex={-1}
                    aria-label={isExpanded ? "Collapse" : "Expand"}
                  >
                    <ChevronRight className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                  </button>
                </div>
                {isExpanded && (
                  <InstitutionSyncPanel
                    institution={row.institution}
                    pw={pw}
                    health={row.health}
                    tier={row.tier}
                    onClose={() => setExpandedInstitution(null)}
                  />
                )}
              </React.Fragment>
            );
          })}
          {sortedRows.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              {rows.length === 0 ? "No data yet" : "No institutions match the current filters"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Indexing Queue Tab ─────────────────────────────────────────────────────────

function IndexingQueueTab({ pw }: { pw: string }) {
  const qc = useQueryClient();
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [confirmReject, setConfirmReject] = useState<number | null>(null);

  const { data, isLoading, refetch } = useQuery<NewArrivalsResponse>({
    queryKey: ["/api/admin/new-arrivals-mobile", pw],
    queryFn: async () => {
      const res = await adminFetch("/api/admin/new-arrivals", pw);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 30000,
    enabled: !!pw,
  });

  const pushMutation = useMutation({
    mutationFn: async (institution?: string) => {
      const res = await adminFetch("/api/admin/new-arrivals/push", pw, {
        method: "POST",
        body: institution ? JSON.stringify({ institution }) : "{}",
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Push failed");
      return d;
    },
    onSuccess: () => { refetch(); qc.invalidateQueries({ queryKey: ["/api/admin/new-arrivals-mobile"] }); },
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await adminFetch(`/api/admin/new-arrivals/${id}`, pw, { method: "DELETE" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Reject failed");
      return d;
    },
    onSuccess: () => { setConfirmReject(null); refetch(); },
  });

  const groups = data?.groups ?? [];

  if (isLoading) return (
    <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" /><span>Loading queue…</span>
    </div>
  );

  return (
    <div className="space-y-4 px-4 pt-4">
      {/* Summary + push all */}
      <div className="rounded-2xl border border-border bg-card p-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-2xl font-bold tabular-nums text-foreground" data-testid="stat-queue-total">{data?.totalUnindexed ?? 0}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Assets pending indexing across {data?.totalInstitutions ?? 0} institutions</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <button
            onClick={() => pushMutation.mutate(undefined)}
            disabled={pushMutation.isPending || (data?.totalUnindexed ?? 0) === 0}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold active:opacity-70 disabled:opacity-40"
            data-testid="button-push-all"
          >
            {pushMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUpCircle className="h-3.5 w-3.5" />}
            Push All
          </button>
          <button onClick={() => refetch()} className="text-xs text-muted-foreground flex items-center gap-1 active:opacity-60">
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
        </div>
      </div>

      {/* Groups */}
      {groups.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card px-4 py-8 text-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
          <p className="text-sm font-medium text-foreground">Indexing queue is clear</p>
          <p className="text-xs text-muted-foreground mt-1">No new arrivals awaiting indexing</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="divide-y divide-border">
            {groups.map((group) => (
              <React.Fragment key={group.institution}>
                <div
                  className="flex items-center gap-3 px-4 py-3 active:bg-muted/50 cursor-pointer"
                  onClick={() => setExpandedGroup(prev => prev === group.institution ? null : group.institution)}
                  data-testid={`group-queue-${group.institution}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{group.institution}</p>
                    <p className="text-xs text-muted-foreground">{group.count} asset{group.count !== 1 ? "s" : ""}</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); pushMutation.mutate(group.institution); }}
                    disabled={pushMutation.isPending}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 text-xs font-semibold active:opacity-70 shrink-0"
                    data-testid={`button-push-institution-${group.institution}`}
                  >
                    <ArrowUpCircle className="h-3.5 w-3.5" /> Push
                  </button>
                  <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform ${expandedGroup === group.institution ? "rotate-90" : ""}`} />
                </div>

                {expandedGroup === group.institution && (
                  <div className="bg-muted/20 divide-y divide-border/50">
                    {group.assets.map((asset) => (
                      <div key={asset.id} className="flex items-center gap-3 px-5 py-2.5" data-testid={`asset-queue-${asset.id}`}>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground truncate">{asset.assetName}</p>
                          <p className="text-[11px] text-muted-foreground">{formatRelative(asset.firstSeenAt)}</p>
                          {asset.sourceUrl && (
                            <a href={asset.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary underline underline-offset-1 truncate block" data-testid={`link-source-${asset.id}`}>
                              {asset.sourceUrl.replace(/^https?:\/\//, "").slice(0, 50)}
                            </a>
                          )}
                        </div>
                        {confirmReject === asset.id ? (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[11px] text-destructive font-medium">Confirm?</span>
                            <button
                              onClick={() => rejectMutation.mutate(asset.id)}
                              disabled={rejectMutation.isPending}
                              className="px-2 py-1 rounded-lg bg-destructive text-destructive-foreground text-xs font-bold active:opacity-70"
                              data-testid={`button-confirm-reject-${asset.id}`}
                            >
                              {rejectMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Yes"}
                            </button>
                            <button onClick={() => setConfirmReject(null)} className="px-2 py-1 rounded-lg bg-muted text-xs active:opacity-60">No</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmReject(asset.id)}
                            className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-destructive active:opacity-60"
                            data-testid={`button-reject-${asset.id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Account Center Tab ─────────────────────────────────────────────────────────

function AccountCenterTab({ pw }: { pw: string }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const deleteTimerRef = useRef<Record<string, number>>({});
  const [armedDelete, setArmedDelete] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ users: AdminUser[] }>({
    queryKey: ["/api/admin/users-mobile", pw],
    queryFn: async () => {
      const res = await adminFetch("/api/admin/users", pw);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 60000,
    enabled: !!pw,
  });

  const { data: orgsData } = useQuery<AdminOrg[]>({
    queryKey: ["/api/admin/organizations-mobile", pw],
    queryFn: async () => {
      const res = await adminFetch("/api/admin/organizations", pw);
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 120000,
    enabled: !!pw,
  });

  // Build billing-email → org name map for display (frontend-only cross-reference)
  const orgByBillingEmail = new Map<string, string>(
    (orgsData ?? [])
      .filter((o): o is AdminOrg & { billingEmail: string } => !!o.billingEmail)
      .map((o) => [o.billingEmail.toLowerCase(), o.name])
  );

  const roleMutation = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: string }) => {
      const res = await adminFetch(`/api/admin/users/${id}/role`, pw, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Role update failed");
      return d;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/users-mobile"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await adminFetch(`/api/admin/members/${userId}`, pw, { method: "DELETE" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Delete failed");
      return d;
    },
    onSuccess: () => {
      setDeletingId(null);
      setArmedDelete(null);
      qc.invalidateQueries({ queryKey: ["/api/admin/users-mobile"] });
    },
  });

  function handleDeleteTap(userId: string) {
    if (armedDelete === userId) {
      setDeletingId(userId);
      deleteMutation.mutate(userId);
      clearTimeout(deleteTimerRef.current[userId]);
      delete deleteTimerRef.current[userId];
      setArmedDelete(null);
    } else {
      if (armedDelete) {
        clearTimeout(deleteTimerRef.current[armedDelete]);
        setArmedDelete(null);
      }
      setArmedDelete(userId);
      deleteTimerRef.current[userId] = window.setTimeout(() => {
        setArmedDelete(prev => prev === userId ? null : prev);
        delete deleteTimerRef.current[userId];
      }, 3000);
    }
  }

  const users = data?.users ?? [];
  const filtered = search
    ? users.filter(u =>
        u.email.toLowerCase().includes(search.toLowerCase()) ||
        (u.role ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : users;

  const subscriberCount = users.filter(u => u.subscribedToDigest).length;

  if (isLoading) return (
    <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" /><span>Loading accounts…</span>
    </div>
  );

  return (
    <div className="space-y-4 px-4 pt-4">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl border border-border bg-card p-3 text-center">
          <Users className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
          <p className="text-xl font-bold text-foreground tabular-nums" data-testid="stat-total-users">{users.length}</p>
          <p className="text-[10px] text-muted-foreground">Total accounts</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-3 text-center">
          <Mail className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
          <p className="text-xl font-bold text-foreground tabular-nums" data-testid="stat-digest-subs">{subscriberCount}</p>
          <p className="text-[10px] text-muted-foreground">Digest subscribers</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by email or role…"
          className="w-full rounded-xl border border-border bg-background pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          data-testid="input-search-users"
        />
      </div>

      {/* User list */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="divide-y divide-border">
          {filtered.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">No accounts found</div>
          )}
          {filtered.map((user) => {
            const role = roleBadge(user.role);
            const isArmed = armedDelete === user.id;
            const isDeleting = deletingId === user.id;
            return (
              <div
                key={user.id}
                className={`px-4 py-3 space-y-2 transition-colors ${isArmed ? "bg-destructive/5" : ""}`}
                data-testid={`row-user-${user.id}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground truncate">{user.email}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {orgByBillingEmail.get(user.email.toLowerCase()) && (
                        <span className="font-medium text-foreground">{orgByBillingEmail.get(user.email.toLowerCase())} · </span>
                      )}
                      {formatRelative(user.lastSignInAt ?? user.createdAt)} · {user.subscribedToDigest ? "digest ✓" : "no digest"}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDeleteTap(user.id)}
                    disabled={isDeleting}
                    className={`shrink-0 p-1.5 rounded-lg transition-colors active:opacity-60 ${
                      isArmed ? "bg-destructive text-destructive-foreground" : "text-muted-foreground hover:text-destructive"
                    }`}
                    data-testid={`button-delete-user-${user.id}`}
                  >
                    {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </button>
                </div>
                {isArmed && <p className="text-[11px] text-destructive font-medium">Tap delete again to confirm (3s)</p>}
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${role.color}`}>{role.label}</span>
                  <select
                    value={user.role ?? ""}
                    onChange={(e) => roleMutation.mutate({ id: user.id, role: e.target.value })}
                    className="text-xs text-foreground bg-muted border border-border rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary"
                    data-testid={`select-role-${user.id}`}
                  >
                    <option value="">— no role —</option>
                    <option value="concept">Discovery (Concept)</option>
                    <option value="researcher">Researcher</option>
                    <option value="industry">Industry</option>
                  </select>
                  {roleMutation.isPending && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Dispatch Tab ───────────────────────────────────────────────────────────────

type DispatchMode = "manual" | "smart";
const WINDOW_OPTIONS = [
  { label: "24 hours", value: 24 },
  { label: "48 hours", value: 48 },
  { label: "72 hours", value: 72 },
  { label: "7 days", value: 168 },
  { label: "14 days", value: 336 },
  { label: "30 days", value: 720 },
];

function ManualDispatchMode({ pw }: { pw: string }) {
  const [windowHours, setWindowHours] = useState(168);
  const [assetSearch, setAssetSearch] = useState("");
  const [stagedIds, setStagedIds] = useState<number[]>([]);
  const [subject, setSubject] = useState("EdenRadar: {count} new biotech assets");
  const [recipientText, setRecipientText] = useState("");
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);

  const { data: discoveries, isLoading: loadingDisc } = useQuery<{ assets: Discovery[]; windowHours: number }>({
    queryKey: ["/api/admin/new-discoveries-mobile", pw, windowHours],
    queryFn: async () => {
      const res = await adminFetch(`/api/admin/new-discoveries?windowHours=${windowHours}`, pw);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 60000,
    enabled: !!pw,
  });

  const { data: subData } = useQuery<{ subscribers: DispatchSubscriber[] }>({
    queryKey: ["/api/admin/dispatch/subscribers-mobile", pw],
    queryFn: async () => {
      const res = await adminFetch("/api/admin/dispatch/subscribers", pw);
      if (!res.ok) return { subscribers: [] };
      return res.json();
    },
    staleTime: 120000,
    enabled: !!pw,
  });

  const previewMutation = useMutation({
    mutationFn: async () => {
      const res = await adminFetch("/api/admin/dispatch/preview", pw, {
        method: "POST",
        body: JSON.stringify({ subject, assetIds: stagedIds, windowHours, isTest: false, colorMode: "light" }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Preview failed");
      return d;
    },
    onSuccess: (d) => { setPreviewHtml(d.html); setShowPreview(true); },
  });

  const sendMutation = useMutation({
    mutationFn: async ({ isTest }: { isTest: boolean }) => {
      const recipients = recipientText.split(/[\s,;]+/).map(e => e.trim()).filter(e => e.includes("@"));
      const res = await adminFetch("/api/admin/dispatch/send", pw, {
        method: "POST",
        body: JSON.stringify({ subject, assetIds: stagedIds, windowHours, isTest, colorMode: "light", recipients }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Send failed");
      return d;
    },
    onSuccess: (d) => setSendResult(`✓ Sent to ${d.sentTo} recipient${d.sentTo !== 1 ? "s" : ""}${d.isTest ? " (test)" : ""}`),
  });

  const assets = discoveries?.assets ?? [];
  const filteredAssets = assetSearch
    ? assets.filter(a => a.assetName.toLowerCase().includes(assetSearch.toLowerCase()) || a.institution.toLowerCase().includes(assetSearch.toLowerCase()))
    : assets;
  const stagedAssets = assets.filter(a => stagedIds.includes(a.id));

  function toggleStage(id: number) {
    setStagedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function loadSubscribers() {
    const emails = (subData?.subscribers ?? []).map(s => s.effectiveEmail).join(", ");
    setRecipientText(emails);
  }

  return (
    <div className="space-y-4">
      {/* Window selector */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Time Window</p>
        <div className="flex flex-wrap gap-2">
          {WINDOW_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setWindowHours(opt.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium active:opacity-70 ${
                windowHours === opt.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}
              data-testid={`button-window-${opt.value}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Asset browser */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">Recent Discoveries <span className="text-muted-foreground font-normal">({assets.length})</span></p>
          {stagedIds.length > 0 && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">{stagedIds.length} staged</span>
          )}
        </div>
        <div className="px-4 py-2 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={assetSearch}
              onChange={(e) => setAssetSearch(e.target.value)}
              placeholder="Filter assets…"
              className="w-full rounded-lg border border-border bg-background pl-8 pr-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              data-testid="input-asset-search"
            />
          </div>
        </div>
        {loadingDisc ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="divide-y divide-border max-h-72 overflow-y-auto">
            {filteredAssets.slice(0, 50).map((asset) => {
              const staged = stagedIds.includes(asset.id);
              return (
                <button
                  key={asset.id}
                  onClick={() => toggleStage(asset.id)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left active:opacity-70 ${staged ? "bg-primary/5" : ""}`}
                  data-testid={`button-toggle-asset-${asset.id}`}
                >
                  <span className={`h-4 w-4 rounded shrink-0 border-2 flex items-center justify-center ${staged ? "bg-primary border-primary" : "border-muted-foreground/40"}`}>
                    {staged && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{asset.assetName}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{asset.institution}</p>
                  </div>
                </button>
              );
            })}
            {filteredAssets.length === 0 && (
              <div className="px-4 py-4 text-center text-xs text-muted-foreground">No assets found for this window</div>
            )}
          </div>
        )}
      </div>

      {/* Staged assets */}
      {stagedIds.length > 0 && (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">Staged ({stagedIds.length})</p>
            <button onClick={() => setStagedIds([])} className="text-xs text-muted-foreground active:opacity-60">Clear all</button>
          </div>
          <div className="divide-y divide-border">
            {stagedAssets.map(a => (
              <div key={a.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="flex-1 text-xs text-foreground truncate">{a.assetName}</span>
                <button onClick={() => toggleStage(a.id)} className="shrink-0 text-muted-foreground active:opacity-60">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Subject + recipients + send */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Subject</label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            data-testid="input-dispatch-subject"
          />
          <p className="text-[10px] text-muted-foreground">Tokens: {"{count}"} {"{date}"} {"{institution_count}"}</p>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Recipients</label>
            <button
              onClick={loadSubscribers}
              className="text-xs text-primary font-medium active:opacity-60"
              data-testid="button-load-subscribers"
            >
              Load all subscribers
            </button>
          </div>
          <textarea
            value={recipientText}
            onChange={(e) => setRecipientText(e.target.value)}
            placeholder="email@domain.com, another@domain.com"
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            rows={3}
            data-testid="textarea-recipients"
          />
        </div>

        {sendResult && (
          <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400 font-medium">
            <CheckCircle2 className="h-4 w-4" />
            {sendResult}
          </div>
        )}
        {sendMutation.error && (
          <p className="text-sm text-destructive">{(sendMutation.error as Error).message}</p>
        )}

        <div className="flex flex-col gap-2">
          <button
            onClick={() => { if (showPreview) { setShowPreview(false); } else { setShowPreview(true); if (!previewHtml) previewMutation.mutate(); } }}
            disabled={stagedIds.length === 0 || previewMutation.isPending}
            className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border text-sm font-semibold active:opacity-70 disabled:opacity-40"
            data-testid="button-preview-dispatch"
          >
            {previewMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
            {showPreview ? "Hide Preview" : "Preview Email"}
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => sendMutation.mutate({ isTest: true })}
              disabled={stagedIds.length === 0 || sendMutation.isPending}
              className="py-2.5 rounded-xl bg-muted text-foreground text-sm font-semibold active:opacity-70 disabled:opacity-40"
              data-testid="button-test-send"
            >
              Test Send
            </button>
            <button
              onClick={() => sendMutation.mutate({ isTest: false })}
              disabled={stagedIds.length === 0 || sendMutation.isPending || !recipientText.trim()}
              className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold active:opacity-70 disabled:opacity-40"
              data-testid="button-send-dispatch"
            >
              {sendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send
            </button>
          </div>
        </div>
      </div>

      {/* Inline live preview panel */}
      {showPreview && (
        <div className="rounded-2xl border border-border bg-card overflow-hidden" data-testid="panel-preview">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <p className="text-sm font-semibold text-foreground">Email Preview</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => previewMutation.mutate()}
                disabled={previewMutation.isPending}
                className="text-xs text-primary font-medium px-2 py-1 rounded-lg bg-primary/10 active:opacity-60 disabled:opacity-40 flex items-center gap-1"
                data-testid="button-refresh-preview"
              >
                {previewMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                Refresh
              </button>
              <button onClick={() => setShowPreview(false)} className="p-1.5 rounded-lg text-muted-foreground active:opacity-60" data-testid="button-close-preview">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          {previewMutation.isPending && !previewHtml ? (
            <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /><span className="text-sm">Loading preview…</span>
            </div>
          ) : previewHtml ? (
            <iframe
              srcDoc={previewHtml}
              style={{ width: "100%", height: "480px", border: "none" }}
              title="Email preview"
              data-testid="iframe-preview"
            />
          ) : (
            <div className="flex items-center justify-center py-12">
              <button
                onClick={() => previewMutation.mutate()}
                disabled={previewMutation.isPending || stagedIds.length === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold active:opacity-70 disabled:opacity-40"
              >
                {previewMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                Load Preview
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SmartDispatchMode({ pw }: { pw: string }) {
  const [windowHours, setWindowHours] = useState(168);
  const [selectedSubscriber, setSelectedSubscriber] = useState<SubscriberMatch | null>(null);
  const [sendResult, setSendResult] = useState<string | null>(null);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);

  const { data: matchData, isLoading } = useQuery<{ subscribers: SubscriberMatch[]; windowHours: number }>({
    queryKey: ["/api/admin/dispatch/subscriber-matches-mobile", pw, windowHours],
    queryFn: async () => {
      const res = await adminFetch(`/api/admin/dispatch/subscriber-matches?windowHours=${windowHours}`, pw);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 60000,
    enabled: !!pw,
  });

  const { data: suggData } = useQuery<{ assets: Discovery[] }>({
    queryKey: ["/api/admin/dispatch/suggestions-mobile", pw, selectedSubscriber?.userId, windowHours],
    queryFn: async () => {
      if (!selectedSubscriber) return { assets: [] };
      const res = await adminFetch(`/api/admin/dispatch/suggestions/${selectedSubscriber.userId}?windowHours=${windowHours}`, pw);
      if (!res.ok) return { assets: [] };
      return res.json();
    },
    staleTime: 60000,
    enabled: !!pw && !!selectedSubscriber,
  });

  const sendMutation = useMutation({
    mutationFn: async ({ subscriber, assetIds }: { subscriber: SubscriberMatch; assetIds: number[] }) => {
      const res = await adminFetch("/api/admin/dispatch/send", pw, {
        method: "POST",
        body: JSON.stringify({
          subject: "EdenRadar: {count} assets matched to your profile",
          assetIds,
          windowHours,
          isTest: false,
          colorMode: "light",
          recipients: [subscriber.email],
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Send failed");
      return d;
    },
    onSuccess: (d, vars) => setSendResult(`✓ Sent to ${vars.subscriber.email}`),
  });

  const subscribers = matchData?.subscribers ?? [];
  const matchedSubscribers = subscribers.filter(s => s.totalMatches > 0);

  async function sendToAllMatched() {
    if (matchedSubscribers.length === 0) return;
    setBulkProgress({ done: 0, total: matchedSubscribers.length });
    setSendResult(null);
    let successCount = 0;
    for (let i = 0; i < matchedSubscribers.length; i++) {
      const sub = matchedSubscribers[i];
      try {
        const assetIds = sub.top5AssetIds ?? [];
        if (assetIds.length === 0) { setBulkProgress({ done: i + 1, total: matchedSubscribers.length }); continue; }
        const res = await adminFetch("/api/admin/dispatch/send", pw, {
          method: "POST",
          body: JSON.stringify({
            subject: "EdenRadar: {count} assets matched to your profile",
            assetIds: assetIds.slice(0, 20),
            windowHours,
            isTest: false,
            colorMode: "light",
            recipients: [sub.email],
          }),
        });
        if (res.ok) successCount++;
      } catch {}
      setBulkProgress({ done: i + 1, total: matchedSubscribers.length });
    }
    setBulkProgress(null);
    setSendResult(`✓ Sent to ${successCount}/${matchedSubscribers.length} matched subscribers`);
  }
  const suggestions = suggData?.assets ?? [];

  return (
    <div className="space-y-4">
      {/* Window selector */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Matching Window</p>
        <div className="flex flex-wrap gap-2">
          {WINDOW_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => { setWindowHours(opt.value); setSelectedSubscriber(null); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium active:opacity-70 ${
                windowHours === opt.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Subscriber matches */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-foreground">Subscriber Matches</p>
            <p className="text-xs text-muted-foreground">{matchedSubscribers.length} subscribers with matches</p>
          </div>
          {matchedSubscribers.length > 0 && (
            <button
              onClick={sendToAllMatched}
              disabled={!!bulkProgress}
              className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold active:opacity-70 disabled:opacity-50"
              data-testid="button-send-all-matched"
            >
              {bulkProgress ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" />{bulkProgress.done}/{bulkProgress.total}</>
              ) : (
                <><Send className="h-3.5 w-3.5" />Send All</>
              )}
            </button>
          )}
        </div>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="divide-y divide-border max-h-80 overflow-y-auto">
            {subscribers.map(sub => (
              <button
                key={sub.userId}
                onClick={() => setSelectedSubscriber(prev => prev?.userId === sub.userId ? null : sub)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left active:opacity-70 ${selectedSubscriber?.userId === sub.userId ? "bg-primary/5" : ""}`}
                data-testid={`button-subscriber-${sub.userId}`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate">{sub.email}</p>
                  {sub.companyName && <p className="text-xs text-muted-foreground truncate">{sub.companyName}</p>}
                </div>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${sub.totalMatches > 0 ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                  {sub.totalMatches} match{sub.totalMatches !== 1 ? "es" : ""}
                </span>
                <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform ${selectedSubscriber?.userId === sub.userId ? "rotate-90" : ""}`} />
              </button>
            ))}
            {subscribers.length === 0 && <div className="px-4 py-6 text-center text-sm text-muted-foreground">No subscribers found</div>}
          </div>
        )}
      </div>

      {/* Selected subscriber's suggestions */}
      {selectedSubscriber && (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground truncate">{selectedSubscriber.email}</p>
              <p className="text-xs text-muted-foreground">{suggestions.length} suggested assets</p>
            </div>
            <button
              onClick={() => sendMutation.mutate({ subscriber: selectedSubscriber, assetIds: suggestions.slice(0, 20).map(a => a.id) })}
              disabled={suggestions.length === 0 || sendMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold active:opacity-70 disabled:opacity-40 shrink-0"
              data-testid="button-send-to-subscriber"
            >
              {sendMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Send
            </button>
          </div>
          <div className="divide-y divide-border max-h-48 overflow-y-auto">
            {suggestions.slice(0, 10).map(a => (
              <div key={a.id} className="px-4 py-2.5">
                <p className="text-xs font-medium text-foreground truncate">{a.assetName}</p>
                <p className="text-[11px] text-muted-foreground">{a.institution}</p>
              </div>
            ))}
            {suggestions.length === 0 && <div className="px-4 py-4 text-center text-xs text-muted-foreground">No personalized suggestions</div>}
          </div>
        </div>
      )}

      {sendResult && (
        <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400 font-medium px-1">
          <CheckCircle2 className="h-4 w-4 shrink-0" />{sendResult}
        </div>
      )}
      {sendMutation.error && <p className="text-sm text-destructive px-1">{(sendMutation.error as Error).message}</p>}
    </div>
  );
}

function DispatchHistorySection({ pw }: { pw: string }) {
  const [open, setOpen] = useState(false);

  const { data } = useQuery<{ history: DispatchLog[] }>({
    queryKey: ["/api/admin/dispatch/history-mobile", pw],
    queryFn: async () => {
      const res = await adminFetch("/api/admin/dispatch/history", pw);
      if (!res.ok) return { history: [] };
      return res.json();
    },
    staleTime: 120000,
    enabled: !!pw,
  });

  const history = data?.history ?? [];

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 active:bg-muted/50"
        onClick={() => setOpen(v => !v)}
        data-testid="button-toggle-history"
      >
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">Dispatch History</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{history.length} sent</span>
          <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
        </div>
      </button>
      {open && (
        <div className="border-t border-border divide-y divide-border">
          {history.length === 0 && <div className="px-4 py-4 text-center text-sm text-muted-foreground">No dispatches yet</div>}
          {history.map(log => (
            <div key={log.id} className="px-4 py-3" data-testid={`log-dispatch-${log.id}`}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm text-foreground line-clamp-1 flex-1">{log.subject}</p>
                {log.isTest && <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded shrink-0">test</span>}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {log.assetCount} asset{log.assetCount !== 1 ? "s" : ""} · {log.recipients.length} recipient{log.recipients.length !== 1 ? "s" : ""} · {formatRelative(log.sentAt)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DispatchTab({ pw }: { pw: string }) {
  const [mode, setMode] = useState<DispatchMode>("manual");

  return (
    <div className="space-y-4 px-4 pt-4">
      {/* Mode toggle */}
      <div className="rounded-2xl border border-border bg-card p-1 flex">
        <button
          onClick={() => setMode("manual")}
          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors active:opacity-70 ${
            mode === "manual" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
          }`}
          data-testid="button-mode-manual"
        >
          Manual
        </button>
        <button
          onClick={() => setMode("smart")}
          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors active:opacity-70 ${
            mode === "smart" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
          }`}
          data-testid="button-mode-smart"
        >
          Smart
        </button>
      </div>

      {mode === "manual" ? <ManualDispatchMode pw={pw} /> : <SmartDispatchMode pw={pw} />}

      <DispatchHistorySection pw={pw} />
    </div>
  );
}

// ── Review Tab ─────────────────────────────────────────────────────────────────

type QueueItem =
  | { kind: "research"; id: number; title: string; subtitle: string }
  | { kind: "concept"; id: number; title: string; subtitle: string };

function ReviewTab({ pw }: { pw: string }) {
  const qc = useQueryClient();

  const { data: researchData, isLoading: loadingResearch } = useQuery<{ cards: ResearchCard[] }>({
    queryKey: ["/api/admin/research-queue-mobile", pw],
    queryFn: async () => {
      const res = await adminFetch("/api/admin/research-queue", pw);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 60000,
    enabled: !!pw,
  });

  const { data: conceptData, isLoading: loadingConcepts } = useQuery<{ concepts: ConceptCard[] }>({
    queryKey: ["/api/admin/concepts-mobile", pw],
    queryFn: async () => {
      const res = await adminFetch("/api/admin/concepts", pw);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 60000,
    enabled: !!pw,
  });

  const researchMutation = useMutation({
    mutationFn: async ({ id, adminStatus }: { id: number; adminStatus: string }) => {
      const res = await adminFetch(`/api/admin/research-queue/${id}`, pw, {
        method: "PATCH",
        body: JSON.stringify({ adminStatus }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Review failed");
      return d;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/research-queue-mobile"] }),
  });

  const pendingResearch = (researchData?.cards ?? []).filter(c => c.adminStatus === "pending");
  const unreviewedConcepts = (conceptData?.concepts ?? []).filter(c => c.credibilityScore === null);

  // Build unified queue: research items first (actionable), concept items (read-only — no admin PATCH endpoint)
  const queue: QueueItem[] = [
    ...pendingResearch.map(c => ({ kind: "research" as const, id: c.id, title: c.assetName, subtitle: c.institution })),
    ...unreviewedConcepts.map(c => ({
      kind: "concept" as const,
      id: c.id,
      title: c.title,
      subtitle: `${c.submitterName}${c.submitterAffiliation ? ` · ${c.submitterAffiliation}` : ""}`,
    })),
  ];

  if (loadingResearch || loadingConcepts) return (
    <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" /><span>Loading review queue…</span>
    </div>
  );

  return (
    <div className="space-y-4 px-4 pt-4">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl border border-border bg-card p-3 text-center">
          <Microscope className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
          <p className="text-xl font-bold tabular-nums text-foreground" data-testid="stat-pending-research">{pendingResearch.length}</p>
          <p className="text-[10px] text-muted-foreground">Pending research</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-3 text-center">
          <Lightbulb className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
          <p className="text-xl font-bold tabular-nums text-foreground" data-testid="stat-unreviewed-concepts">{unreviewedConcepts.length}</p>
          <p className="text-[10px] text-muted-foreground">Unreviewed concepts</p>
        </div>
      </div>

      {queue.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card px-4 py-8 text-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
          <p className="text-sm font-medium text-foreground">All caught up</p>
          <p className="text-xs text-muted-foreground mt-1">No items pending review</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">Review Queue</p>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
              {queue.length} pending
            </span>
          </div>
          <div className="divide-y divide-border">
            {queue.map(item => (
              <div key={`${item.kind}-${item.id}`} className="px-4 py-3" data-testid={`card-${item.kind}-${item.id}`}>
                <div className="flex items-center gap-2 mb-1.5">
                  {item.kind === "research"
                    ? <Microscope className="h-3.5 w-3.5 text-sky-500 shrink-0" />
                    : <Lightbulb className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                  }
                  <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest">
                    {item.kind === "research" ? "Research" : "Concept"}
                  </span>
                </div>
                <p className="text-sm font-medium text-foreground line-clamp-2 mb-0.5">{item.title}</p>
                <p className="text-xs text-muted-foreground mb-2">{item.subtitle}</p>
                {item.kind === "research" ? (
                  <div className="flex gap-2">
                    <button
                      onClick={() => researchMutation.mutate({ id: item.id, adminStatus: "approved" })}
                      disabled={researchMutation.isPending}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 text-xs font-semibold active:opacity-70 disabled:opacity-50"
                      data-testid={`button-approve-research-${item.id}`}
                    >
                      <Check className="h-3.5 w-3.5" /> Approve
                    </button>
                    <button
                      onClick={() => researchMutation.mutate({ id: item.id, adminStatus: "rejected" })}
                      disabled={researchMutation.isPending}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 text-xs font-semibold active:opacity-70 disabled:opacity-50"
                      data-testid={`button-reject-research-${item.id}`}
                    >
                      <X className="h-3.5 w-3.5" /> Reject
                    </button>
                  </div>
                ) : (
                  <a
                    href="/admin"
                    className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-muted text-muted-foreground text-xs font-medium"
                    data-testid={`link-desktop-concept-${item.id}`}
                  >
                    Review on Desktop
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Bottom Tab Nav ─────────────────────────────────────────────────────────────

type Tab = "sync" | "queue" | "accounts" | "dispatch" | "review";

interface TabConfig {
  id: Tab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const TABS: TabConfig[] = [
  { id: "sync", label: "Sync", icon: Activity },
  { id: "queue", label: "Queue", icon: Inbox },
  { id: "accounts", label: "Accounts", icon: Users },
  { id: "dispatch", label: "Dispatch", icon: Send },
  { id: "review", label: "Review", icon: ClipboardCheck },
];

// ── Main Mobile Admin ──────────────────────────────────────────────────────────

function MobileAdminPanel({ pw, onLogout }: { pw: string; onLogout: () => void }) {
  const [activeTab, setActiveTab] = useState<Tab>("sync");

  const { data: queueData } = useQuery<NewArrivalsResponse>({
    queryKey: ["/api/admin/new-arrivals-mobile", pw],
    queryFn: async () => {
      const res = await adminFetch("/api/admin/new-arrivals", pw);
      if (!res.ok) return { totalUnindexed: 0, totalPendingEnrichment: 0, totalInstitutions: 0, groups: [] };
      return res.json();
    },
    staleTime: 60000,
    enabled: !!pw,
  });

  const { data: reviewData } = useQuery<{ cards: ResearchCard[] }>({
    queryKey: ["/api/admin/research-queue-mobile", pw],
    queryFn: async () => {
      const res = await adminFetch("/api/admin/research-queue", pw);
      if (!res.ok) return { cards: [] };
      return res.json();
    },
    staleTime: 60000,
    enabled: !!pw,
  });

  const { data: conceptBadgeData } = useQuery<{ concepts: ConceptCard[] }>({
    queryKey: ["/api/admin/concepts-mobile", pw],
    queryFn: async () => {
      const res = await adminFetch("/api/admin/concepts", pw);
      if (!res.ok) return { concepts: [] };
      return res.json();
    },
    staleTime: 60000,
    enabled: !!pw,
  });

  const queueBadge = queueData?.totalUnindexed ?? 0;
  const reviewBadge = (reviewData?.cards ?? []).filter(c => c.adminStatus === "pending").length
    + (conceptBadgeData?.concepts ?? []).filter(c => c.credibilityScore === null).length;

  const badges: Partial<Record<Tab, number>> = {
    queue: queueBadge,
    review: reviewBadge,
  };

  return (
    <div className="min-h-screen bg-background" data-testid="mobile-admin-panel">
      {/* Sticky header */}
      <header className="sticky top-0 z-20 border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">EdenRadar Admin</span>
          </div>
          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 text-xs text-muted-foreground px-3 py-1.5 rounded-lg hover:bg-muted active:opacity-60"
            data-testid="button-mobile-admin-logout"
          >
            <LogOut className="h-3.5 w-3.5" /> Logout
          </button>
        </div>
      </header>

      {/* Tab content */}
      <main className="pb-24 overflow-y-auto">
        {activeTab === "sync" && <SyncTab pw={pw} />}
        {activeTab === "queue" && <IndexingQueueTab pw={pw} />}
        {activeTab === "accounts" && <AccountCenterTab pw={pw} />}
        {activeTab === "dispatch" && <DispatchTab pw={pw} />}
        {activeTab === "review" && <ReviewTab pw={pw} />}
      </main>

      {/* Fixed bottom tab bar */}
      <nav className="fixed bottom-0 inset-x-0 z-30 border-t border-border bg-card/95 backdrop-blur-sm" data-testid="mobile-admin-tab-bar">
        <div className="flex items-center">
          {TABS.map(({ id, label, icon: Icon }) => {
            const isActive = activeTab === id;
            const badge = badges[id] ?? 0;
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex-1 flex flex-col items-center gap-1 py-3 px-1 relative transition-colors ${isActive ? "text-primary" : "text-muted-foreground"}`}
                data-testid={`nav-mobile-${id}`}
              >
                <span className="relative">
                  <Icon className="h-5 w-5" />
                  {badge > 0 && (
                    <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 flex items-center justify-center text-[9px] font-bold bg-amber-500 text-white rounded-full px-1" data-testid={`badge-${id}`}>
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </span>
                <span className={`text-[10px] font-medium leading-none ${isActive ? "text-primary" : "text-muted-foreground"}`}>{label}</span>
                {isActive && <span className="absolute top-0 inset-x-0 h-0.5 bg-primary rounded-b-full" />}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

// ── Default Export ─────────────────────────────────────────────────────────────

export default function AdminMobile() {
  const [authed, setAuthed] = useState(() => localStorage.getItem(ADMIN_KEY) === "eden");

  function handleLogout() {
    localStorage.removeItem(ADMIN_KEY);
    setAuthed(false);
  }

  if (!authed) return <PasswordGate onAuth={() => setAuthed(true)} />;
  const pw = localStorage.getItem(ADMIN_KEY) ?? "";
  return <MobileAdminPanel pw={pw} onLogout={handleLogout} />;
}
