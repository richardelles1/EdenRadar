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
import { LineChart, Line, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, Dot } from "recharts";

function SubscriptionData() {
  const tiers = [
    { name: "EdenDiscovery", price: 19.99, subscribers: 8, color: "bg-blue-500/10 text-blue-600 border-blue-200 dark:border-blue-800" },
    { name: "EdenLab", price: 29.99, subscribers: 5, color: "bg-violet-500/10 text-violet-600 border-violet-200 dark:border-violet-800" },
    { name: "EdenScout", price: 799, subscribers: 2, color: "bg-emerald-500/10 text-emerald-600 border-emerald-200 dark:border-emerald-800" },
  ];
  const totalMRR = tiers.reduce((sum, t) => sum + t.price * t.subscribers, 0);
  const totalSubs = tiers.reduce((sum, t) => sum + t.subscribers, 0);
  const ARR = totalMRR * 12;

  return (
    <div className="space-y-6" data-testid="section-subscription-data">
      <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-700 dark:text-amber-400 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        Preview data: connect billing provider to activate live metrics.
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
          <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wide mt-1">preview, connect billing to activate</p>
        </div>
      </div>
    </div>
  );
}

function EdenQueryMetrics({ pw }: { pw: string }) {
  const { data } = useQuery<{
    queries24h: number;
    queries7d: number;
    intentBreakdown7d: Record<string, number>;
    emptyResultRate7d: number | null;
    avgLatencyMs7d: number | null;
    feedback7d: { up: number; down: number };
  }>({
    queryKey: ["/api/admin/eden/analytics"],
    queryFn: async () => {
      const res = await fetch("/api/admin/eden/analytics", { headers: pw ? { Authorization: `Bearer ${pw}` } : {} });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 60000,
    enabled: !!pw,
  });

  const total7d = data ? Object.values(data.intentBreakdown7d).reduce((a, b) => a + b, 0) : 0;
  const intents = data ? [
    { key: "search", label: "Search" },
    { key: "aggregation", label: "Count/Breakdown" },
    { key: "conversational", label: "Conversational" },
    { key: "back_ref", label: "Follow-up" },
    { key: "comparative", label: "Compare" },
    { key: "definitional", label: "Definition" },
  ].filter(({ key }) => (data.intentBreakdown7d[key] ?? 0) > 0) : [];

  const feedbackTotal = data ? data.feedback7d.up + data.feedback7d.down : 0;
  const feedbackScore = feedbackTotal > 0 && data
    ? Math.round((data.feedback7d.up / feedbackTotal) * 100)
    : null;

  if (!data) return null;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border border-border bg-card p-4 flex flex-col gap-1">
          <div className="flex items-center gap-2 text-muted-foreground"><Activity className="h-4 w-4" /><span className="text-xs">Queries (24h)</span></div>
          <p className="text-2xl font-semibold text-foreground">{data.queries24h.toLocaleString()}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 flex flex-col gap-1">
          <div className="flex items-center gap-2 text-muted-foreground"><Activity className="h-4 w-4" /><span className="text-xs">Queries (7d)</span></div>
          <p className="text-2xl font-semibold text-foreground">{data.queries7d.toLocaleString()}</p>
          {total7d > 0 && <p className="text-xs text-muted-foreground">{(data.queries7d / Math.max(1, total7d) * 100).toFixed(0)}% search</p>}
        </div>
        <div className="rounded-lg border border-border bg-card p-4 flex flex-col gap-1">
          <div className="flex items-center gap-2 text-muted-foreground"><TrendingUp className="h-4 w-4" /><span className="text-xs">Empty result rate (7d)</span></div>
          <p className={`text-2xl font-semibold ${data.emptyResultRate7d !== null && data.emptyResultRate7d > 20 ? "text-amber-500" : "text-foreground"}`}>
            {data.emptyResultRate7d !== null ? `${data.emptyResultRate7d}%` : "—"}
          </p>
          <p className="text-xs text-muted-foreground">of search queries</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 flex flex-col gap-1">
          <div className="flex items-center gap-2 text-muted-foreground">
            <ThumbsUp className="h-4 w-4" /><span className="text-xs">Feedback score (7d)</span>
          </div>
          <p className="text-2xl font-semibold text-foreground">
            {feedbackScore !== null ? `${feedbackScore}%` : "—"}
          </p>
          {feedbackTotal > 0 && (
            <p className="text-xs text-muted-foreground">{data.feedback7d.up}↑ {data.feedback7d.down}↓ · {feedbackTotal} rated</p>
          )}
        </div>
      </div>

      {intents.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-3">Intent breakdown (7d)</p>
          <div className="space-y-1.5">
            {intents.map(({ key, label }) => {
              const count = data.intentBreakdown7d[key] ?? 0;
              const pct = total7d > 0 ? Math.round((count / total7d) * 100) : 0;
              return (
                <div key={key} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-28 shrink-0">{label}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-emerald-500/60" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs tabular-nums text-muted-foreground w-16 text-right">{count.toLocaleString()} · {pct}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
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
      const res = await fetch("/api/admin/platform-stats", { headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 60000,
    enabled: !!pw,
  });

  const { data: alertLatency } = useQuery<{ avgMinutes: number | null; sampleSize: number; windowHours: number }>({
    queryKey: ["/api/admin/alerts/latency"],
    queryFn: async () => {
      const res = await fetch("/api/admin/alerts/latency", { headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) throw new Error("Failed to load alert latency");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
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
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest mb-3">Alert Delivery</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard
            label="Avg alert latency (24h)"
            value={alertLatency?.avgMinutes != null ? `${alertLatency.avgMinutes.toFixed(1)} min` : "—"}
            sub={alertLatency?.sampleSize ? `${alertLatency.sampleSize} asset send${alertLatency.sampleSize !== 1 ? "s" : ""}` : "no sends in window"}
            icon={Clock}
            testid="stat-alert-latency-24h"
          />
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest mb-3">Eden AI</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-3">
          <StatCard label="Sessions (24h)" value={data?.edenSessions24h ?? 0} icon={MessageSquare} testid="stat-eden-24h" />
          <StatCard label="Sessions (7d)" value={data?.edenSessions7d ?? 0} icon={MessageSquare} testid="stat-eden-7d" />
          <StatCard label="Sessions (30d)" value={data?.edenSessions30d ?? 0} icon={MessageSquare} testid="stat-eden-30d" />
          <StatCard label="Sessions (all time)" value={data?.edenSessionsAllTime ?? 0} icon={MessageSquare} testid="stat-eden-alltime" />
        </div>
        <EdenQueryMetrics pw={pw} />
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


export { SubscriptionData, EdenQueryMetrics as AnalyticsTab, PlatformInfo };
