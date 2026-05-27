import React, { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Download, Database, RefreshCw, AlertTriangle, CheckCircle2, ExternalLink, Zap, Sparkles, Activity, AlertCircle, XCircle, Microscope, Trash2, ClipboardList, Lightbulb, Users, UserPlus, Copy, Check, Inbox, ChevronDown, ChevronRight, ChevronUp, Building2, Clock, PackagePlus, BrainCircuit, PlayCircle, BarChart3, Mic, MicOff, ThumbsUp, ThumbsDown, Bookmark, Layers, Plus, Upload, FileText, Image as ImageIcon, Pencil, BookOpen, X, CreditCard, Server, TrendingUp, Globe, MessageSquare, FlaskConical, Send, Eye, Tag, ArrowUp, ArrowDown, ChevronsUpDown, Square, Key, PowerOff, RotateCcw, ArrowUpCircle, Shield, ShieldCheck, Lock, LogOut, DollarSign, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { PORTAL_CONFIG, ALL_PORTAL_ROLES, getPortalConfig, type PortalRole } from "@shared/portals";
import type { ConceptCard } from "@shared/schema";
import { formatDate, timeAgo, relativeTime, getErrorType, HealthDot, HealthLabel } from "./_shared";
import type { HealthStatus, ErrorType, CollectorHealthRow, SchedulerStatus, ActiveSearchRow, CollectorHealthData, SyncSessionData, SyncStatusResponse } from "./_shared";

function MiniBarChart({ data, label, color = "bg-primary" }: { data: { day: string; count: number }[]; label: string; color?: string }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-24 text-muted-foreground text-xs">No data yet</div>
    );
  }
  const max = Math.max(...data.map(d => d.count), 1);
  // Fill a 30-slot grid by date
  const endDate = new Date();
  const grid: number[] = [];
  const dayMap = new Map(data.map(d => [d.day.slice(0, 10), d.count]));
  for (let i = 29; i >= 0; i--) {
    const d = new Date(endDate);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    grid.push(dayMap.get(key) ?? 0);
  }

  return (
    <div className="space-y-1" data-testid={`chart-${label.replace(/\s+/g, "-").toLowerCase()}`}>
      <div className="flex items-end gap-0.5 h-16">
        {grid.map((v, i) => (
          <div
            key={i}
            className={`flex-1 rounded-sm transition-all ${color} ${v === 0 ? "opacity-10" : "opacity-90"}`}
            style={{ height: `${Math.max(4, (v / max) * 100)}%` }}
            title={`${v}`}
          />
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>30d ago</span>
        <span className="font-medium text-foreground">{label}</span>
        <span>today</span>
      </div>
    </div>
  );
}

function WeekBarChart({ data, label, color = "bg-amber-500" }: { data: { week: string; count: number }[]; label: string; color?: string }) {
  if (data.length === 0) {
    return <div className="flex items-center justify-center h-24 text-muted-foreground text-xs">No data yet</div>;
  }
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <div className="space-y-1" data-testid={`chart-${label.replace(/\s+/g, "-").toLowerCase()}`}>
      <div className="flex items-end gap-1 h-16">
        {data.map((d, i) => (
          <div
            key={i}
            className={`flex-1 rounded-sm ${color} opacity-80 transition-all`}
            style={{ height: `${Math.max(4, (d.count / max) * 100)}%` }}
            title={`Week of ${d.week.slice(0, 10)}: ${d.count}`}
          />
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>8w ago</span>
        <span className="font-medium text-foreground">{label}</span>
        <span>this week</span>
      </div>
    </div>
  );
}

const EVENT_LABELS: Record<string, string> = {
  dossier_opened: "Dossiers Opened",
  intelligence_fetched: "Intelligence Fetched",
  report_generated: "Reports Generated",
  pipeline_brief_generated: "Pipeline Briefs",
  concept_submitted: "Concepts Submitted",
};

const EVENT_COLORS: Record<string, string> = {
  dossier_opened: "text-blue-600 dark:text-blue-400",
  intelligence_fetched: "text-violet-600 dark:text-violet-400",
  report_generated: "text-emerald-600 dark:text-emerald-400",
  pipeline_brief_generated: "text-amber-600 dark:text-amber-400",
  concept_submitted: "text-rose-600 dark:text-rose-400",
};

function AnalyticsTab({ pw }: { pw: string }) {
  const { data: overview, isLoading: loadingOverview } = useQuery<AnalyticsOverview>({
    queryKey: ["/api/admin/analytics/overview", pw],
    queryFn: async () => {
      const res = await fetch("/api/admin/analytics/overview", { headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) throw new Error("Failed to load analytics");
      return res.json();
    },
    staleTime: 60000,
    enabled: !!pw,
  });

  const { data: topSearchData, isLoading: loadingSearches } = useQuery<TopSearchData>({
    queryKey: ["/api/admin/analytics/top-searches", pw],
    queryFn: async () => {
      const res = await fetch("/api/admin/analytics/top-searches", { headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) throw new Error("Failed to load top searches");
      return res.json();
    },
    staleTime: 60000,
    enabled: !!pw,
  });

  if (loadingOverview) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground gap-2" data-testid="analytics-loading">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Loading analytics...</span>
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground text-sm" data-testid="analytics-error">
        Failed to load analytics data.
      </div>
    );
  }

  // Build full event map (all event types shown, even if 0)
  const allEventTypes = ["dossier_opened", "intelligence_fetched", "report_generated", "pipeline_brief_generated", "concept_submitted"];
  const eventCountMap = new Map(overview.featureUsage.map(f => [f.event, f.count]));

  return (
    <div className="space-y-8" data-testid="analytics-tab">
      {/* Totals row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Searches", value: overview.totals.searches, icon: <TrendingUp className="h-4 w-4 text-primary" /> },
          { label: "AI Sessions", value: overview.totals.sessions, icon: <BrainCircuit className="h-4 w-4 text-violet-500" /> },
          { label: "Saved Assets", value: overview.totals.savedAssets, icon: <Bookmark className="h-4 w-4 text-emerald-500" /> },
          { label: "Dispatches Sent", value: overview.totals.dispatches, icon: <Send className="h-4 w-4 text-amber-500" /> },
        ].map(stat => (
          <div key={stat.label} className="rounded-lg border border-border bg-card p-4 space-y-1" data-testid={`stat-${stat.label.replace(/\s+/g, "-").toLowerCase()}`}>
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
              {stat.icon}
              {stat.label}
            </div>
            <div className="text-2xl font-bold tabular-nums text-foreground">{stat.value.toLocaleString()}</div>
          </div>
        ))}
      </div>

      {/* Time-series charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Daily Searches (last 30 days)</h3>
          <MiniBarChart data={overview.searchesPerDay} label="searches/day" color="bg-primary" />
        </div>
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Eden AI Sessions (last 30 days)</h3>
          <MiniBarChart data={overview.sessionsPerDay} label="sessions/day" color="bg-violet-500" />
        </div>
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Saved Assets Added (last 30 days)</h3>
          <MiniBarChart data={overview.savedAssetsPerDay} label="assets/day" color="bg-emerald-500" />
        </div>
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Email Dispatches (last 8 weeks)</h3>
          <WeekBarChart data={overview.dispatchesPerWeek} label="dispatches/week" />
        </div>
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">New User Signups (last 8 weeks)</h3>
          {overview.signupsPerWeek.length === 0 ? (
            <div className="flex items-center justify-center h-16 text-muted-foreground text-xs">No signup data available</div>
          ) : (
            <WeekBarChart data={overview.signupsPerWeek} label="signups/week" color="bg-sky-500" />
          )}
        </div>
      </div>

      {/* Feature usage grid */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Feature Usage (all time)</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {allEventTypes.map(evt => {
            const count = eventCountMap.get(evt) ?? 0;
            return (
              <div key={evt} className="rounded-lg border border-border bg-background p-3 text-center space-y-1" data-testid={`feature-usage-${evt}`}>
                <div className={`text-xl font-bold tabular-nums ${EVENT_COLORS[evt] ?? "text-foreground"}`}>{count.toLocaleString()}</div>
                <div className="text-[11px] text-muted-foreground leading-tight">{EVENT_LABELS[evt] ?? evt}</div>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-muted-foreground">Counts begin from when event tracking was deployed. Historical data before this release will not be included.</p>
      </div>

      {/* Top searches + recent events side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top searches */}
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Top Searches</h3>
          {loadingSearches ? (
            <div className="flex items-center gap-2 text-muted-foreground text-xs py-4">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />Loading...
            </div>
          ) : (topSearchData?.searches ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground py-4">No search history yet.</p>
          ) : (
            <div className="space-y-0.5 max-h-80 overflow-y-auto">
              {(topSearchData?.searches ?? []).map((s, i) => {
                const max = topSearchData!.searches[0].count;
                return (
                  <div key={i} className="flex items-center gap-3 py-1.5 px-2 rounded hover:bg-muted/40 transition-colors" data-testid={`row-search-${i}`}>
                    <span className="text-[11px] text-muted-foreground/60 w-5 text-right tabular-nums shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-foreground truncate font-medium">{s.query}</div>
                      <div className="h-1 mt-1 rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-primary/60 rounded-full" style={{ width: `${(s.count / max) * 100}%` }} />
                      </div>
                    </div>
                    <span className="text-xs font-semibold tabular-nums text-primary shrink-0">{s.count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent feature events */}
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Recent Feature Events</h3>
          {overview.recentEvents.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4">No feature events recorded yet. Events appear as users open dossiers, generate reports, and submit concepts.</p>
          ) : (
            <div className="space-y-0.5 max-h-80 overflow-y-auto">
              {overview.recentEvents.map((ev, i) => (
                <div key={ev.id} className="flex items-start gap-3 py-1.5 px-2 rounded hover:bg-muted/40 transition-colors text-xs" data-testid={`row-event-${i}`}>
                  <div className="flex-1 min-w-0">
                    <span className={`font-medium ${EVENT_COLORS[ev.event] ?? "text-foreground"}`}>
                      {EVENT_LABELS[ev.event] ?? ev.event}
                    </span>
                    {ev.metadata && Object.keys(ev.metadata).length > 0 && (
                      <span className="text-muted-foreground ml-1 text-[10px]">
                        — {Object.entries(ev.metadata).filter(([, v]) => v !== null).map(([k, v]) => `${k}: ${v}`).join(", ")}
                      </span>
                    )}
                  </div>
                  <span className="text-muted-foreground/60 shrink-0 text-[10px]">{timeAgo(ev.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Export Log Tab ───────────────────────────────────────────────────────────
// Previously this tab also generated .docx outbound BD email templates, but
// the canonical copies now live in Gmail templates — we removed the generator
// to avoid keeping a second source of truth in code. What remains is the
// cloud-export audit trail (pitch decks, one-pagers, dossiers, CSVs).

export { AnalyticsTab };
