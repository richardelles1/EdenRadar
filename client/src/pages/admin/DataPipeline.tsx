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
import type { HealthStatus, ErrorType, CollectorHealthRow, SchedulerStatus, ActiveSearchRow, CollectorHealthData, SyncSessionData, SyncStatusResponse, EdenStatsResponse, EdenEmbedStatusResponse } from "./_shared";
import { DataHealth } from "./DataHealth";
import { BulkCsvImport } from "./ManualImport";

function DataPipeline({ pw }: { pw: string }) {
  return (
    <>
      <DataHealth pw={pw} />
      <div className="mt-8">
        <BulkCsvImport pw={pw} />
      </div>
    </>
  );
}

// ── EDEN Readiness Panel (standalone, rendered after Enrichment in DataQualityTab) ──

function EdenReadinessPanel({ pw }: { pw: string }) {
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [embedConfirming, setEmbedConfirming] = useState(false);
  const [reEmbedBioConfirming, setReEmbedBioConfirming] = useState(false);
  const [readinessOpen, setReadinessOpen] = useState(false);

  const { data: edenStatus, refetch: refetchEdenStatus } = useQuery<{
    running: boolean; capPerCycle: number; processed: number; total: number;
    succeeded: number; failed: number; skipped: number; lastCycleCount: number; lastCycleDeferred: number;
    job: { status: string; completedAt: string | null } | null; staleJobDetected: boolean; staleJobId: number | null;
    lastSummary: { succeeded: number; failed: number; skipped: number; total: number; deferred: number; durationMs: number; bandMovements: Record<string, number>; completedAt: string; } | null;
  }>({
    queryKey: ["/api/admin/eden/enrich/status", pw],
    queryFn: async () => {
      const res = await fetch("/api/admin/eden/enrich/status", { headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) throw new Error("Failed to load eden status");
      return res.json();
    },
    refetchInterval: 5000,
  });

  const { data: edenStats, refetch: refetchEdenStats } = useQuery<EdenStatsResponse>({
    queryKey: ["/api/admin/eden/stats", pw],
    queryFn: async () => {
      const res = await fetch("/api/admin/eden/stats", { headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) throw new Error("Failed to load eden stats");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const { data: embedStatus } = useQuery<EdenEmbedStatusResponse>({
    queryKey: ["/api/admin/eden/embed/status"],
    queryFn: async () => {
      const res = await fetch("/api/admin/eden/embed/status", { headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) throw new Error("Failed to load embed status");
      return res.json();
    },
    refetchInterval: 3000,
  });

  const startEdenMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/eden/enrich", { method: "POST", headers: { "Content-Type": "application/json", ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "Failed to start"); }
      return res.json();
    },
    onSuccess: (data) => { setConfirming(false); toast({ title: "EDEN Deep Enrichment started", description: `Processing ${data.total?.toLocaleString() ?? "?"} assets with GPT-4o` }); refetchEdenStats(); refetchEdenStatus(); },
    onError: (e: Error) => { setConfirming(false); toast({ title: "Failed to start enrichment", description: e.message, variant: "destructive" }); },
  });

  const stopEdenMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/eden/enrich/stop", { method: "POST", headers: { "Content-Type": "application/json", ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "Failed to stop"); }
      return res.json();
    },
    onSuccess: () => { toast({ title: "Stop signal sent", description: "EDEN Deep Enrichment will halt after the current batch finishes" }); refetchEdenStatus(); },
    onError: (e: Error) => toast({ title: "Failed to stop", description: e.message, variant: "destructive" }),
  });

  const embedMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/eden/embed", { method: "POST", headers: { "Content-Type": "application/json", ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "Failed to start embedding"); }
      return res.json();
    },
    onSuccess: (data) => { setEmbedConfirming(false); toast({ title: "EDEN Embedding started", description: `Embedding ${data.total?.toLocaleString() ?? "?"} assets with text-embedding-3-small` }); refetchEdenStats(); },
    onError: (e: Error) => { setEmbedConfirming(false); toast({ title: "Failed to start embedding", description: e.message, variant: "destructive" }); },
  });

  const reEmbedBioMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/eden/embed", { method: "POST", headers: { "Content-Type": "application/json", ...(pw ? { Authorization: `Bearer ${pw}` } : {}) }, body: JSON.stringify({ mode: "biology" }) });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "Failed to start re-embedding"); }
      return res.json();
    },
    onSuccess: (data) => { setReEmbedBioConfirming(false); toast({ title: "Biology re-embed started", description: `Re-embedding ${data.total?.toLocaleString() ?? "?"} assets with biology + categories` }); refetchEdenStats(); },
    onError: (e: Error) => { setReEmbedBioConfirming(false); toast({ title: "Failed to start re-embedding", description: e.message, variant: "destructive" }); },
  });

  const cov = edenStats?.coverage;
  const emb = edenStats?.embeddingCoverage;
  const edenLive = edenStatus?.running ? edenStatus : edenStats?.live ? { running: true, processed: edenStats.live.processed, total: edenStats.live.total } : null;
  const edenPct = edenLive && edenLive.total > 0 ? Math.round((edenLive.processed / edenLive.total) * 100) : null;
  const deepPct = cov && cov.totalRelevant > 0 ? Math.round((cov.deepEnriched / cov.totalRelevant) * 100) : 0;
  const edenBreakdown = edenStats?.breakdown;
  const edenRemaining = edenBreakdown?.total ?? edenStats?.needingDeepEnrich ?? (cov ? cov.totalRelevant - cov.deepEnriched : 0);
  const estCostUsd = edenRemaining > 0 ? (edenRemaining * 0.01).toFixed(2) : "0.00";
  const embPct = emb && emb.totalRelevant > 0 ? Math.round((emb.totalEmbedded / emb.totalRelevant) * 100) : 0;
  const embRemaining = emb ? emb.totalRelevant - emb.totalEmbedded : 0;
  const embEstCost = embRemaining > 0 ? (embRemaining * 0.00002).toFixed(2) : "0.00";
  const embedLive = embedStatus?.running ? embedStatus : null;
  const embedPct = embedLive && embedLive.total > 0 ? Math.round((embedLive.processed / embedLive.total) * 100) : null;

  return (
    <div className="rounded-lg border border-border bg-muted/10 overflow-hidden" data-testid="card-eden-readiness">
      <button className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors" onClick={() => setReadinessOpen((v) => !v)} data-testid="button-toggle-readiness">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">EDEN Readiness</span>
          {embPct >= 100 && deepPct >= 90 ? (
            <span className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 ml-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block"/>Active</span>
          ) : (
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground ml-1"><span className="h-1.5 w-1.5 rounded-full bg-amber-400 inline-block"/>Indexing</span>
          )}
        </div>
        {readinessOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </button>
      {readinessOpen && (
        <div className="border-t border-border p-4 space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="rounded-lg border border-border bg-muted/20 p-3"><p className="text-[11px] text-muted-foreground uppercase tracking-wide">Corpus</p><p className="text-xl font-bold text-foreground mt-0.5">{cov?.totalRelevant?.toLocaleString() ?? "—"}</p><p className="text-[11px] text-muted-foreground">relevant assets</p></div>
            <div className="rounded-lg border border-border bg-muted/20 p-3"><p className="text-[11px] text-muted-foreground uppercase tracking-wide">Enriched</p><p className="text-xl font-bold text-emerald-600 mt-0.5">{cov?.deepEnriched?.toLocaleString() ?? "—"}</p><p className="text-[11px] text-muted-foreground">{deepPct}% with GPT-4o</p></div>
            <div className="rounded-lg border border-border bg-muted/20 p-3"><p className="text-[11px] text-muted-foreground uppercase tracking-wide">Embedded</p><p className="text-xl font-bold text-violet-600 mt-0.5">{emb?.totalEmbedded?.toLocaleString() ?? "—"}</p><p className="text-[11px] text-muted-foreground">{embPct}% vectorized</p></div>
            <div className="rounded-lg border border-border bg-muted/20 p-3"><p className="text-[11px] text-muted-foreground uppercase tracking-wide">With MoA</p><p className="text-xl font-bold text-foreground mt-0.5">{cov?.withMoa?.toLocaleString() ?? "—"}</p><p className="text-[11px] text-muted-foreground">mechanism of action</p></div>
            <div className="rounded-lg border border-border bg-muted/20 p-3"><p className="text-[11px] text-muted-foreground uppercase tracking-wide">Completeness</p><p className="text-xl font-bold text-foreground mt-0.5">{cov?.avgCompletenessScore != null ? `${cov.avgCompletenessScore}` : "—"}</p><p className="text-[11px] text-muted-foreground">avg / 100 pts</p></div>
          </div>
          <div className="space-y-3">
            <div><div className="flex justify-between text-xs text-muted-foreground mb-1"><span>Deep Enrichment</span><span>{deepPct}%</span></div><Progress value={deepPct} className="h-1.5" /></div>
            <div><div className="flex justify-between text-xs text-muted-foreground mb-1"><span>Vector Embeddings</span><span>{embPct}%</span></div><Progress value={embPct} className="h-1.5" /></div>
          </div>
          {edenLive && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4" data-testid="card-eden-live">
              <div className="flex items-center gap-2 mb-2">
                <Loader2 className="h-4 w-4 text-emerald-500 animate-spin" />
                <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">EDEN Deep Enrichment (GPT-4o): {edenLive.processed.toLocaleString()} / {edenLive.total.toLocaleString()}</span>
                <span className="text-sm font-bold text-emerald-600">{edenPct}%</span>
                <Button variant="ghost" size="sm" onClick={() => stopEdenMutation.mutate()} disabled={stopEdenMutation.isPending} className="ml-auto h-7 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30" data-testid="button-eden-stop">
                  {stopEdenMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Stop"}
                </Button>
              </div>
              <Progress value={edenPct ?? 0} className="h-1.5" />
              {(edenStatus?.succeeded != null || edenStatus?.failed != null || edenStatus?.skipped != null) && (
                <div className="flex items-center gap-3 mt-2 text-[11px]" data-testid="eden-live-counters">
                  {(edenStatus?.succeeded ?? 0) > 0 && <span className="text-emerald-700 dark:text-emerald-400 font-medium" data-testid="eden-live-enriched">{edenStatus!.succeeded.toLocaleString()} enriched</span>}
                  {(edenStatus?.skipped ?? 0) > 0 && <span className="text-muted-foreground" data-testid="eden-live-skipped">{edenStatus!.skipped.toLocaleString()} thin content</span>}
                  {(edenStatus?.failed ?? 0) > 0 && <span className="text-red-600 dark:text-red-400" data-testid="eden-live-failed">{edenStatus!.failed.toLocaleString()} failed</span>}
                </div>
              )}
            </div>
          )}
          {embedLive && (
            <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-4" data-testid="card-embed-live">
              <div className="flex items-center gap-2 mb-2">
                <Loader2 className="h-4 w-4 text-violet-500 animate-spin" />
                <span className="text-sm font-semibold text-violet-700 dark:text-violet-400">Embedding running: {embedLive.processed.toLocaleString()} / {embedLive.total.toLocaleString()}</span>
                <span className="ml-auto text-sm font-bold text-violet-600">{embedPct}%</span>
              </div>
              <Progress value={embedPct ?? 0} className="h-1.5" />
            </div>
          )}
          <div data-testid="card-eden-run">
            <h4 className="text-xs font-semibold text-foreground mb-1">Deep Enrichment Blitz</h4>
            <p className="text-xs text-muted-foreground mb-2">GPT-4o extracts MoA, Innovation Claim, Unmet Need, Comparable Drugs and Licensing Readiness. <span className="ml-1 font-semibold text-foreground">{edenRemaining.toLocaleString()} assets</span> queued{edenRemaining > 0 && <> at <span className="font-semibold text-foreground">~$0.01/asset</span> = ~<span className="font-semibold text-foreground">${estCostUsd}</span></>}.</p>
            {edenBreakdown && edenRemaining > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {edenBreakdown.fresh > 0 && <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border bg-blue-500/8 border-blue-500/20 text-blue-700 dark:text-blue-400"><span className="h-1.5 w-1.5 rounded-full bg-blue-500 inline-block" />{edenBreakdown.fresh.toLocaleString()} fresh</span>}
                {edenBreakdown.legacy > 0 && <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border bg-amber-500/8 border-amber-500/20 text-amber-700 dark:text-amber-400"><span className="h-1.5 w-1.5 rounded-full bg-amber-400 inline-block" />{edenBreakdown.legacy.toLocaleString()} legacy</span>}
                {edenBreakdown.lowQualityRetry > 0 && <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border bg-orange-500/8 border-orange-500/20 text-orange-700 dark:text-orange-400"><span className="h-1.5 w-1.5 rounded-full bg-orange-400 inline-block" />{edenBreakdown.lowQualityRetry.toLocaleString()} low-score retry</span>}
                {(edenBreakdown.nullCategory ?? 0) > 0 && <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border bg-red-500/8 border-red-500/20 text-red-700 dark:text-red-400"><span className="h-1.5 w-1.5 rounded-full bg-red-400 inline-block" />{edenBreakdown.nullCategory!.toLocaleString()} missing category</span>}
              </div>
            )}
            {!confirming ? (
              <Button onClick={() => setConfirming(true)} disabled={edenLive != null || edenRemaining === 0} className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs" data-testid="button-eden-run">
                <PlayCircle className="h-3.5 w-3.5 mr-1.5" />{edenRemaining === 0 ? "All Enriched" : `Enrich ${edenRemaining.toLocaleString()} Assets`}
              </Button>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-xs font-semibold text-amber-600">Use ~${estCostUsd} of GPT-4o budget?</p>
                <Button onClick={() => startEdenMutation.mutate()} disabled={startEdenMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs" data-testid="button-eden-confirm">
                  {startEdenMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}Yes, Run
                </Button>
                <Button variant="outline" onClick={() => setConfirming(false)} className="h-8 text-xs" data-testid="button-eden-cancel">Cancel</Button>
              </div>
            )}
          </div>
          <div data-testid="card-eden-embeddings">
            <h4 className="text-xs font-semibold text-foreground mb-1">Vector Embeddings</h4>
            <p className="text-xs text-muted-foreground mb-3">{emb?.totalEmbedded?.toLocaleString() ?? "—"} of {emb?.totalRelevant?.toLocaleString() ?? "—"} assets embedded with text-embedding-3-small.{embRemaining > 0 && <> Remaining cost: <span className="font-semibold text-foreground">${embEstCost}</span>.</>}</p>
            {!embedConfirming ? (
              <Button onClick={() => setEmbedConfirming(true)} disabled={embedLive != null || embRemaining === 0} className="bg-violet-600 hover:bg-violet-700 text-white h-8 text-xs" data-testid="button-embed-run">
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />{embRemaining === 0 ? "All Embedded" : `Embed ${embRemaining.toLocaleString()} Assets`}
              </Button>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-xs font-semibold text-amber-600">Embed {embRemaining.toLocaleString()} assets (~${embEstCost})?</p>
                <Button onClick={() => embedMutation.mutate()} disabled={embedMutation.isPending} className="bg-violet-600 hover:bg-violet-700 text-white h-8 text-xs" data-testid="button-embed-confirm">
                  {embedMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}Yes, Embed
                </Button>
                <Button variant="outline" onClick={() => setEmbedConfirming(false)} className="h-8 text-xs" data-testid="button-embed-cancel">Cancel</Button>
              </div>
            )}
          </div>
          <div data-testid="card-eden-re-embed-bio">
            <h4 className="text-xs font-semibold text-foreground mb-1">Re-embed: Biology &amp; Categories</h4>
            <p className="text-xs text-muted-foreground mb-3">Refreshes vector embeddings to include biology taxonomy and structured categories — improves Eden's semantic matching for mechanism-based queries. Only re-processes already-embedded assets that have biology or category data.</p>
            {!reEmbedBioConfirming ? (
              <Button onClick={() => setReEmbedBioConfirming(true)} disabled={embedLive != null} className="bg-indigo-600 hover:bg-indigo-700 text-white h-8 text-xs" data-testid="button-re-embed-bio-run">
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />Re-embed Biology + Categories
              </Button>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-xs font-semibold text-amber-600">This will overwrite existing embeddings for biology-enriched assets. Continue?</p>
                <Button onClick={() => reEmbedBioMutation.mutate()} disabled={reEmbedBioMutation.isPending} className="bg-indigo-600 hover:bg-indigo-700 text-white h-8 text-xs" data-testid="button-re-embed-bio-confirm">
                  {reEmbedBioMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}Yes, Re-embed
                </Button>
                <Button variant="outline" onClick={() => setReEmbedBioConfirming(false)} className="h-8 text-xs" data-testid="button-re-embed-bio-cancel">Cancel</Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Data Quality Tab ─────────────────────────────────────────────────────────


export { DataPipeline };
