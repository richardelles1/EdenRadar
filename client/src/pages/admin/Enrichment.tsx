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

// ── Enrichment Pipeline Panel ──────────────────────────────────────────────
// All enrichment controls in one collapsible card: EDEN auto-run + Steps 1/2/3.
function EnrichmentPipelinePanel({ pw, onGaveUpClick }: { pw: string; onGaveUpClick?: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  // ── EDEN auto-enrichment state ──
  const { data: edenStatus, refetch: refetchEdenStatus } = useQuery<{
    running: boolean; capPerCycle: number; processed: number; total: number;
    succeeded: number; failed: number; skipped: number; lastCycleCount: number; lastCycleDeferred: number;
    job: { status: string; completedAt: string | null } | null; staleJobDetected: boolean; staleJobId: number | null;
    lastSummary: { succeeded: number; failed: number; skipped: number; total: number; deferred: number; durationMs: number; bandMovements: Record<string, number>; completedAt: string; } | null;
  }>({
    queryKey: ["/api/admin/eden/enrich/status", pw],
    queryFn: async () => {
      const res = await fetch("/api/admin/eden/enrich/status", { headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) throw new Error("Failed to load enrichment status");
      return res.json();
    },
    refetchInterval: 5000,
    retry: 2,
  });

  const { data: edenStats, refetch: refetchEdenStats } = useQuery<EdenStatsResponse>({
    queryKey: ["/api/admin/eden/stats", pw],
    queryFn: async () => {
      const res = await fetch("/api/admin/eden/stats", { headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) throw new Error("Failed to load EDEN stats");
      return res.json();
    },
    refetchInterval: 5000,
  });

  const [confirming, setConfirming] = useState(false);
  const [embedConfirming, setEmbedConfirming] = useState(false);
  const [reEmbedBioConfirming, setReEmbedBioConfirming] = useState(false);

  const { data: embedStatus } = useQuery<{ running: boolean; processed: number; total: number }>({
    queryKey: ["/api/admin/eden/embed/status"],
    queryFn: async () => {
      const res = await fetch("/api/admin/eden/embed/status", { headers: pw ? { Authorization: `Bearer ${pw}` } : {} });
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
    onSuccess: (data) => { setEmbedConfirming(false); toast({ title: "EDEN Embedding started", description: `Embedding ${data.total?.toLocaleString() ?? "?"} assets` }); refetchEdenStats(); },
    onError: (e: Error) => { setEmbedConfirming(false); toast({ title: "Failed to start embedding", description: e.message, variant: "destructive" }); },
  });

  const reEmbedBioMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/eden/embed", { method: "POST", headers: { "Content-Type": "application/json", ...(pw ? { Authorization: `Bearer ${pw}` } : {}) }, body: JSON.stringify({ mode: "biology" }) });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "Failed to start re-embedding"); }
      return res.json();
    },
    onSuccess: (data) => { setReEmbedBioConfirming(false); toast({ title: "Re-embed started", description: `Re-embedding ${data.total?.toLocaleString() ?? "?"} assets with biology/categories` }); },
    onError: (e: Error) => { setReEmbedBioConfirming(false); toast({ title: "Failed to start re-embedding", description: e.message, variant: "destructive" }); },
  });

  const edenWasRunningRef = useRef(false);
  useEffect(() => {
    const nowRunning = edenStatus?.running ?? false;
    if (edenWasRunningRef.current && !nowRunning && edenStatus != null) {
      const enriched = edenStatus.succeeded ?? 0;
      const skipped = edenStatus.skipped ?? 0;
      const failed = edenStatus.failed ?? 0;
      const parts: string[] = [];
      if (enriched > 0) parts.push(`${enriched.toLocaleString()} enriched`);
      if (skipped > 0) parts.push(`${skipped.toLocaleString()} thin content`);
      if (failed > 0) parts.push(`${failed.toLocaleString()} failed`);
      toast({ title: "Deep Enrichment complete", description: parts.length > 0 ? parts.join(" · ") : "No assets were written this cycle" });
      refetchEdenStats();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dataset-quality"] });
    }
    edenWasRunningRef.current = nowRunning;
  }, [edenStatus?.running]);

  // ── Steps 1/2/3 pipeline state ──
  const [polling, setPolling] = useState(false);
  const [ruleFillPolling, setRuleFillPolling] = useState(false);
  const [bandGapFill, setBandGapFill] = React.useState<Record<string, boolean>>({});
  const [bandNewestFirst, setBandNewestFirst] = React.useState<Record<string, boolean>>({});
  const [bandCap, setBandCap] = React.useState<Record<string, number>>({});
  const [bandPolling, setBandPolling] = React.useState(false);
  const [bandConfirm, setBandConfirm] = React.useState<string | null>(null);
  const [bandSummaryDismissed, setBandSummaryDismissed] = React.useState(false);
  const [classifyPolling, setClassifyPolling] = React.useState(false);
  const [classifyConfirm, setClassifyConfirm] = React.useState(false);
  const [modalityFillDone, setModalityFillDone] = React.useState<{ filled: number } | null>(null);
  const [ttoLicensingFillDone, setTtoLicensingFillDone] = React.useState<{ filled: number; beforeCount: number } | null>(null);
  const [biologyFillDone, setBiologyFillDone] = React.useState<{ totalUpdated: number; targetDerived: number; ruleMatched: number; gptResolved: number; unresolved: number; gptSent: number } | null>(null);
  type MoaFillSummary = { pass1Total: number; pass1Filled: number; pass2Total: number; aiFilled: number; failed: number; totalWritten: number };
  const [moaFillDone, setMoaFillDone] = React.useState<MoaFillSummary | null>(null);
  const [rescorePolling, setRescorePolling] = React.useState(false);
  const [usptoPolling, setUsptoPolling] = React.useState(false);

  const { data: pipelineStats } = useQuery<EnrichmentStats>({
    queryKey: ["/api/admin/enrichment/stats", pw],
    queryFn: async () => {
      const res = await fetch("/api/admin/enrichment/stats", { headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) throw new Error("Failed to load enrichment stats");
      return res.json();
    },
  });

  const { data: status, refetch: refetchStatus } = useQuery<EnrichmentStatus>({
    queryKey: ["/api/admin/enrichment/status", pw],
    queryFn: async () => {
      const res = await fetch("/api/admin/enrichment/status", { headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) throw new Error("Failed to load enrichment status");
      return res.json();
    },
    refetchInterval: polling ? 1500 : 10_000,
  });

  const { data: miniQueue } = useQuery<{ count: number; costEstimate: number; exhaustedCount: number; backfillCount: number }>({
    queryKey: ["/api/admin/enrichment/mini-queue", pw],
    queryFn: async () => {
      const res = await fetch("/api/admin/enrichment/mini-queue", { headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) throw new Error("Failed to load mini-queue");
      return res.json();
    },
    staleTime: 60_000,
  });

  // ── Targeted enrichment filter state ──
  const [enrichInstitution, setEnrichInstitution] = useState("");
  const [enrichModality, setEnrichModality] = useState("");
  const [enrichTier, setEnrichTier] = useState("");
  const [enrichMissingField, setEnrichMissingField] = useState("");
  const [enrichInstOpen, setEnrichInstOpen] = useState(false);
  const [debouncedInstitution, setDebouncedInstitution] = useState("");

  const enrichInstitutionsQuery = useQuery<{ institutions: { name: string; queueCount: number }[] }>({
    queryKey: ["/api/admin/enrichment/institution-queues"],
    queryFn: async () => {
      const r = await fetch("/api/admin/enrichment/institution-queues", { headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!r.ok) return { institutions: [] };
      return r.json();
    },
    staleTime: 2 * 60 * 1000,
    enabled: !!pw,
  });
  useEffect(() => {
    const t = setTimeout(() => setDebouncedInstitution(enrichInstitution), 400);
    return () => clearTimeout(t);
  }, [enrichInstitution]);

  const hasEnrichFilters = !!(debouncedInstitution || enrichModality || enrichTier || enrichMissingField);
  const enrichCountParams = new URLSearchParams();
  if (debouncedInstitution) enrichCountParams.set("institution", debouncedInstitution);
  if (enrichModality) enrichCountParams.set("modality", enrichModality);
  if (enrichTier) enrichCountParams.set("tier", enrichTier);
  if (enrichMissingField) enrichCountParams.set("missingField", enrichMissingField);

  const { data: enrichCount, isFetching: enrichCountLoading } = useQuery<{ count: number; costEstimate: number }>({
    queryKey: ["/api/admin/enrichment/count", pw, debouncedInstitution, enrichModality, enrichTier, enrichMissingField],
    queryFn: async () => {
      const qs = enrichCountParams.toString();
      const res = await fetch(`/api/admin/enrichment/count${qs ? "?" + qs : ""}`, { headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) throw new Error("Failed to count enrichment queue");
      return res.json();
    },
    staleTime: 30_000,
  });

  const { data: enrichHealth } = useQuery<{ readyCount: number; needsRefetchCount: number; gaveUpCount: number; enriched24hCount: number }>({
    queryKey: ["/api/admin/enrichment/health", pw],
    queryFn: async () => {
      const res = await fetch("/api/admin/enrichment/health", { headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) throw new Error("Failed to load enrichment health");
      return res.json();
    },
    staleTime: 30_000,
    refetchInterval: status?.status === "running" ? 12_000 : 30_000,
  });

  const { data: classifyCount, refetch: refetchClassifyCount } = useQuery<{
    thick: number; thin: number; tooThin: number; total: number; estCost: number; exhausted: number;
  }>({
    queryKey: ["/api/admin/enrichment/classify-unclassified/count", pw],
    queryFn: async () => {
      const res = await fetch("/api/admin/enrichment/classify-unclassified/count", { headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 30_000,
  });

  const { data: classifyStatus, refetch: refetchClassifyStatus } = useQuery<{
    running: boolean; processed: number; total: number; succeeded: number; failed: number;
    skipped: number; liveCostUsd: number;
    lastSummary: { succeeded: number; failed: number; skipped: number; total: number; costUsd: number; durationMs: number; completedAt: string } | null;
  }>({
    queryKey: ["/api/admin/enrichment/classify-unclassified/status", pw],
    queryFn: async () => {
      const res = await fetch("/api/admin/enrichment/classify-unclassified/status", { headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    refetchInterval: classifyPolling ? 2000 : false,
  });

  const { data: ttoLicensingFillCount, refetch: refetchTtoLicensingFillCount } = useQuery<{ total: number }>({
    queryKey: ["/api/admin/enrichment/tto-licensing-fill/count", pw],
    queryFn: async () => {
      const res = await fetch("/api/admin/enrichment/tto-licensing-fill/count", { headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 30_000,
  });

  const runTtoLicensingFill = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/enrichment/tto-licensing-fill", { method: "POST", headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ filled: number; beforeCount: number }>;
    },
    onSuccess: (data) => {
      setTtoLicensingFillDone(data);
      refetchTtoLicensingFillCount();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dataset-quality"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/enrichment/stats"] });
    },
  });

  const { data: modalityFillCount, refetch: refetchModalityFillCount } = useQuery<{ total: number }>({
    queryKey: ["/api/admin/enrichment/modality-fill/count", pw],
    queryFn: async () => {
      const res = await fetch("/api/admin/enrichment/modality-fill/count", { headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 30_000,
  });

  const { data: biologyFillCount, refetch: refetchBiologyFillCount } = useQuery<{ total: number }>({
    queryKey: ["/api/admin/enrich/biology-fill/count", pw],
    queryFn: async () => {
      const res = await fetch("/api/admin/enrich/biology-fill/count", { headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 30_000,
  });

  const { data: moaFillCount, refetch: refetchMoaFillCount } = useQuery<{ total: number }>({
    queryKey: ["/api/admin/enrich/moa-fill/count", pw],
    queryFn: async () => {
      const res = await fetch("/api/admin/enrich/moa-fill/count", { headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 30_000,
  });

  const { data: dealCompsStats, refetch: refetchDealCompsStats } = useQuery<{ count: number; lastIngestedAt: string | null }>({
    queryKey: ["/api/admin/deal-comparables/stats", pw],
    queryFn: async () => {
      const res = await fetch("/api/admin/deal-comparables/stats", { headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 60_000,
  });

  const { data: dealCompsStatus, refetch: refetchDealCompsStatus } = useQuery<{ running: boolean; lastLine: string }>({
    queryKey: ["/api/admin/deal-comparables/status", pw],
    queryFn: async () => {
      const res = await fetch("/api/admin/deal-comparables/status", { headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    refetchInterval: (query) => query.state.data?.running ? 2000 : 10_000,
  });

  const runDealCompsIngest = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/deal-comparables/ingest", { method: "POST", headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error ?? "Failed to start"); }
      return res.json() as Promise<{ started: boolean }>;
    },
    onSuccess: () => { refetchDealCompsStatus(); refetchDealCompsStats(); },
  });

  const stopDealCompsIngest = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/deal-comparables/ingest/stop", { method: "POST", headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) throw new Error("Failed to stop");
      return res.json();
    },
    onSuccess: () => { refetchDealCompsStatus(); refetchDealCompsStats(); },
  });

  const { data: biologyFillStatus } = useQuery<{ running: boolean; result: typeof biologyFillDone | null; progress: { processed: number; total: number; phase: string; targetDerived: number; ruleMatched: number; gptSent: number; gptResolved: number; written: number } | null }>({
    queryKey: ["/api/admin/enrich/biology-fill/status", pw],
    queryFn: async () => {
      const res = await fetch("/api/admin/enrich/biology-fill/status", { headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    refetchInterval: (query) => query.state.data?.running ? 1500 : 5000,
  });

  const runBiologyFill = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/enrich/biology-fill", { method: "POST", headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ started: boolean }>;
    },
    onSuccess: () => {
      refetchBiologyFillCount();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dataset-quality"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/enrichment/stats"] });
    },
  });

  const stopBiologyFill = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/enrich/biology-fill/stop", { method: "POST", headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) throw new Error("Failed to stop");
      return res.json();
    },
  });

  React.useEffect(() => {
    if (biologyFillStatus?.result && !biologyFillStatus.running) {
      setBiologyFillDone(biologyFillStatus.result as any);
    }
  }, [biologyFillStatus?.result, biologyFillStatus?.running]);

  type MoaFillProgressData = { phase: string; processed: number; total: number; pass1Filled: number; aiFilled: number; failed: number; done: boolean };
  const { data: moaFillStatus } = useQuery<{ running: boolean; result: MoaFillSummary | null; progress: MoaFillProgressData | null }>({
    queryKey: ["/api/admin/enrich/moa-fill/status", pw],
    queryFn: async () => {
      const res = await fetch("/api/admin/enrich/moa-fill/status", { headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    refetchInterval: (query) => query.state.data?.running ? 1500 : 5000,
  });

  const runMoaFill = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/enrich/moa-fill", { method: "POST", headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ started: boolean }>;
    },
    onSuccess: () => {
      refetchMoaFillCount();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dataset-quality"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/enrichment/stats"] });
    },
  });

  const stopMoaFill = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/enrich/moa-fill/stop", { method: "POST", headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) throw new Error("Failed to stop");
      return res.json();
    },
  });

  React.useEffect(() => {
    if (moaFillStatus?.result && !moaFillStatus.running) {
      setMoaFillDone(moaFillStatus.result);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dataset-quality"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/enrichment/stats"] });
      refetchMoaFillCount();
    }
  }, [moaFillStatus?.result, moaFillStatus?.running]);

  const runModalityFill = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/enrichment/modality-fill", { method: "POST", headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ filled: number }>;
    },
    onSuccess: (data) => {
      setModalityFillDone(data);
      refetchModalityFillCount();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dataset-quality"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/enrichment/stats"] });
    },
  });

  const { data: rescoreStatus, refetch: refetchRescoreStatus } = useQuery<{
    running: boolean; processed: number; total: number; updated: number; elapsedMs: number;
    lastSummary: { updated: number; total: number; durationMs: number; completedAt: string } | null;
  }>({
    queryKey: ["/api/admin/enrichment/rescore/status", pw],
    queryFn: async () => {
      const res = await fetch("/api/admin/enrichment/rescore/status", { headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    refetchInterval: rescorePolling ? 2000 : false,
  });

  React.useEffect(() => {
    if (rescoreStatus?.running && !rescorePolling) setRescorePolling(true);
    if (!rescoreStatus?.running && rescorePolling) {
      setRescorePolling(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dataset-quality"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/enrichment/bands"] });
    }
  }, [rescoreStatus?.running]);

  const runRescore = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/enrichment/rescore", { method: "POST", headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => setRescorePolling(true),
  });

  const stopRescore = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/enrichment/rescore/stop", { method: "POST", headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) throw new Error("Failed to stop");
      return res.json();
    },
  });


  const prevClassifyRunning = useRef(false);
  useEffect(() => {
    const nowRunning = classifyStatus?.running ?? false;
    if (nowRunning && !classifyPolling) setClassifyPolling(true);
    if (prevClassifyRunning.current && !nowRunning && classifyStatus != null) {
      setClassifyPolling(false);
      refetchClassifyCount();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dataset-quality"] });
      const s = classifyStatus.lastSummary;
      if (s) toast({ title: "Classification complete", description: `${s.succeeded.toLocaleString()} assets classified, ${s.skipped} too thin — $${s.costUsd.toFixed(2)}` });
    }
    prevClassifyRunning.current = nowRunning;
  }, [classifyStatus?.running]);

  const runClassify = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/enrichment/classify-unclassified", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
        body: JSON.stringify({ cap: 30000 }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed to start"); }
      return res.json();
    },
    onSuccess: () => { setClassifyConfirm(false); setClassifyPolling(true); toast({ title: "Classification started", description: `Processing up to ${(classifyCount?.total ?? 0).toLocaleString()} unclassified assets…` }); },
    onError: (e: Error) => { setClassifyConfirm(false); toast({ title: "Failed to start", description: e.message, variant: "destructive" }); },
  });

  const stopClassify = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/enrichment/classify-unclassified/stop", { method: "POST", headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) throw new Error("Failed to stop");
      return res.json();
    },
    onSuccess: () => toast({ title: "Stop signal sent", description: "Classification will halt after the current batch" }),
  });

  const prevStatusRef = useRef<string | undefined>();
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status?.status;
    if (status?.status === "running" && !polling) setPolling(true);
    const isTerminal = (s?: string) => s === "done" || s === "error" || s === "interrupted";
    if (prev === "running" && isTerminal(status?.status)) {
      setPolling(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dataset-quality"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/enrichment/institution-queues"] });
      if (status?.status === "done") {
        const costStr = status.tokenCost != null && status.tokenCost > 0 ? ` · $${status.tokenCost.toFixed(3)} spent` : "";
        toast({ title: "Enrichment complete", description: `${status.improved} assets improved out of ${status.total} processed${costStr}` });
      } else if (status?.status === "interrupted") {
        toast({ title: "Enrichment interrupted", description: "Server restarted mid-run. Check progress and restart if needed.", variant: "destructive" });
      } else {
        toast({ title: "Enrichment failed", description: status?.error ?? "Unknown error", variant: "destructive" });
      }
    }
    // Safety catch-all: stop polling whenever job is in any terminal state (handles fast completions and server restart races)
    if (polling && isTerminal(status?.status)) {
      setPolling(false);
    }
  }, [status?.status]);

  const runEnrichment = useMutation({
    mutationFn: async (opts?: { all?: boolean; institution?: string; modality?: string; tier?: string; missingField?: string }) => {
      const url = opts?.all ? "/api/admin/enrichment/run?all=1" : "/api/admin/enrichment/run";
      const body: Record<string, string | boolean> = {};
      if (opts?.all) body.all = true;
      if (opts?.institution) body.institution = opts.institution;
      if (opts?.modality) body.modality = opts.modality;
      if (opts?.tier) body.tier = opts.tier;
      if (opts?.missingField) body.missingField = opts.missingField;
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...(pw ? { Authorization: `Bearer ${pw}` } : {}) }, body: JSON.stringify(body) });
      if (!res.ok) { const data = await res.json(); throw new Error(data.error || "Failed to start"); }
      return res.json();
    },
    onSuccess: (_data, vars) => {
      setPolling(true); refetchStatus();
      const isFiltered = vars?.institution || vars?.modality || vars?.tier || vars?.missingField;
      toast({ title: vars?.all ? "Drain enrichment started" : "Step 2 started", description: vars?.all ? (isFiltered ? "Draining filtered queue until empty…" : "Running GPT-4o-mini on every un-scanned asset until the queue is empty...") : (isFiltered ? "Running enrichment on filtered asset set…" : "Running GPT-4o-mini pass on incomplete assets...") });
    },
    onError: (err: Error) => toast({ title: "Failed to start", description: err.message, variant: "destructive" }),
  });

  const stopEnrichment = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/enrichment/stop", { method: "POST", headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) { const data = await res.json(); throw new Error(data.error || "Failed to stop"); }
      return res.json();
    },
    onSuccess: () => { toast({ title: "Stop signal sent", description: "Field enrichment will halt after current batch" }); refetchStatus(); },
    onError: (err: Error) => toast({ title: "Failed to stop", description: err.message, variant: "destructive" }),
  });

  const dismissError = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/enrichment/reset", { method: "POST", headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) { const data = await res.json(); throw new Error(data.error || "Failed to dismiss"); }
      return res.json();
    },
    onSuccess: () => { refetchStatus(); toast({ title: "Error dismissed", description: "Enrichment status cleared" }); },
    onError: (err: Error) => toast({ title: "Failed to dismiss", description: err.message, variant: "destructive" }),
  });

  const { data: ruleFillStatus, refetch: refetchRuleFillStatus } = useQuery<{
    running: boolean;
    progress: { processed: number; total: number; filled: number } | null;
    result: { processed: number; filled: number; fieldsWritten: number; byField: Record<string, number>; dataSparseTagged: number } | null;
  }>({
    queryKey: ["/api/admin/enrichment/rule-fill/status", pw],
    queryFn: async () => {
      const res = await fetch("/api/admin/enrichment/rule-fill/status", { headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    refetchInterval: ruleFillPolling ? 1500 : false,
  });

  const { data: ruleFillEstimate, refetch: refetchRuleFillEstimate, isFetching: estimateFetching } = useQuery<{
    total: number; fillable: number; byField: Record<string, number>; dataSparseCount: number;
  }>({
    queryKey: ["/api/admin/enrichment/rule-fill/estimate", pw],
    queryFn: async () => {
      const res = await fetch("/api/admin/enrichment/rule-fill/estimate", { headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) throw new Error("Failed to estimate");
      return res.json();
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    if (ruleFillStatus?.running && !ruleFillPolling) setRuleFillPolling(true);
    if (!ruleFillStatus?.running && ruleFillPolling) {
      setRuleFillPolling(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dataset-quality"] });
    }
  }, [ruleFillStatus?.running]);

  const runRuleFill = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/enrichment/rule-fill", { method: "POST", headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) { const data = await res.json(); throw new Error(data.error || "Failed to start"); }
      return res.json();
    },
    onSuccess: () => { setRuleFillPolling(true); refetchRuleFillStatus(); toast({ title: "Step 1 started", description: "Rule-based fill running (no AI cost)" }); },
    onError: (err: Error) => toast({ title: "Failed to start", description: err.message, variant: "destructive" }),
  });

  const stopRuleFill = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/enrichment/rule-fill/stop", { method: "POST", headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) { const data = await res.json(); throw new Error(data.error || "Failed"); }
      return res.json();
    },
    onSuccess: () => toast({ title: "Stop signal sent" }),
    onError: (err: Error) => toast({ title: "Failed to stop", description: err.message, variant: "destructive" }),
  });

  const clearSparse = useMutation<{ cleared: number }, Error, void>({
    mutationFn: async (): Promise<{ cleared: number }> => {
      const res = await fetch("/api/admin/enrichment/clear-sparse", { method: "POST", headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) { const data = await res.json(); throw new Error(data.error || "Failed"); }
      return res.json();
    },
    onSuccess: (data) => toast({ title: "Data-sparse flags cleared", description: `${data.cleared.toLocaleString()} assets unlocked for AI enrichment` }),
    onError: (err: Error) => toast({ title: "Failed to clear sparse flags", description: err.message, variant: "destructive" }),
  });

  // ── USPTO Patent Cross-Reference hooks ──
  type UsptoSpotResult = { institution: string; assigneeName: string; count: number; hasTitle: boolean; hasValidDate: boolean; sample: Array<{ number: string; title: string; date: string | null }>; error?: string; valid: boolean };
  type UsptoSpotValidation = { results: UsptoSpotResult[]; validCount: number; passed: boolean; reason?: string };
  type UsptoStatus = {
    running: boolean;
    progress: { processed: number; total: number; matched: number; unmatched: number; skipped: number } | null;
    result: { processed: number; matched: number; unmatched: number; skipped: number; missingIpTypeCount: number } | null;
    spotCheck: UsptoSpotValidation | null;
    noApiKey: boolean;
  };

  const { data: usptoStatus, refetch: refetchUsptoStatus } = useQuery<UsptoStatus>({
    queryKey: ["/api/admin/enrichment/uspto/status", pw],
    queryFn: async () => {
      const res = await fetch("/api/admin/enrichment/uspto/status", { headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    refetchInterval: usptoPolling ? 2000 : false,
  });

  const { data: usptoCount, refetch: refetchUsptoCount } = useQuery<{ missingIpTypeCount: number }>({
    queryKey: ["/api/admin/enrichment/uspto/count", pw],
    queryFn: async () => {
      const res = await fetch("/api/admin/enrichment/uspto/count", { headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    if (usptoStatus?.running && !usptoPolling) setUsptoPolling(true);
    if (!usptoStatus?.running && usptoPolling) {
      setUsptoPolling(false);
      refetchUsptoCount();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dataset-quality"] });
    }
  }, [usptoStatus?.running]);

  const runUsptoSpotCheck = useMutation<{ validation: UsptoSpotValidation }, Error>({
    mutationFn: async () => {
      const res = await fetch("/api/admin/enrichment/uspto/spot-check", { method: "POST", headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Spot check failed");
      return data;
    },
    onSuccess: (data) => {
      refetchUsptoStatus();
      if (data.validation.passed) {
        toast({ title: "Spot check passed", description: `${data.validation.validCount} institutions verified — full run button is now enabled` });
      } else {
        toast({ title: "Spot check incomplete", description: data.validation.reason ?? "Fewer than 3 institutions returned valid data", variant: "destructive" });
      }
    },
    onError: (err: Error) => toast({ title: "Spot check failed", description: err.message, variant: "destructive" }),
  });

  const runUsptoXref = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/enrichment/uspto/run", { method: "POST", headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start");
      return data;
    },
    onSuccess: () => { setUsptoPolling(true); refetchUsptoStatus(); toast({ title: "USPTO cross-reference started", description: "Matching patent titles against TTO assets" }); },
    onError: (err: Error) => toast({ title: "Failed to start", description: err.message, variant: "destructive" }),
  });

  const stopUsptoXref = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/enrichment/uspto/stop", { method: "POST", headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) { const data = await res.json(); throw new Error(data.error || "Failed"); }
      return res.json();
    },
    onSuccess: () => toast({ title: "Stop signal sent" }),
    onError: (err: Error) => toast({ title: "Failed to stop", description: err.message, variant: "destructive" }),
  });

  const usptoProgressPct = usptoStatus?.progress?.total
    ? Math.round((usptoStatus.progress.processed / usptoStatus.progress.total) * 100)
    : 0;
  const usptoSpotCheckOk = usptoStatus?.spotCheck?.passed === true;

  const { data: bandsData, refetch: refetchBands } = useQuery<{ bands: BandInfo[] }>({
    queryKey: ["/api/admin/enrichment/bands", pw],
    queryFn: async () => {
      const res = await fetch("/api/admin/enrichment/bands", { headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) throw new Error("Failed to load band data");
      return res.json();
    },
    staleTime: 60_000,
  });

  const { data: bandStatus, refetch: refetchBandStatus } = useQuery<BandStatusResponse>({
    queryKey: ["/api/admin/enrichment/band/status", pw],
    queryFn: async () => {
      const res = await fetch("/api/admin/enrichment/band/status", { headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) throw new Error("Failed to load band status");
      return res.json();
    },
    refetchInterval: bandPolling ? 1500 : false,
  });

  const prevBandRunningRef = React.useRef<boolean>(false);
  React.useEffect(() => {
    const wasRunning = prevBandRunningRef.current;
    prevBandRunningRef.current = bandStatus?.running ?? false;
    if (bandStatus?.running && !bandPolling) setBandPolling(true);
    if (wasRunning && !bandStatus?.running) {
      setBandPolling(false);
      refetchBands();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dataset-quality"] });
      if (bandStatus?.lastSummary) {
        toast({ title: "Band enrichment complete", description: `${bandStatus.lastSummary.succeeded} assets written · $${bandStatus.lastSummary.costUsd.toFixed(4)} spent` });
      }
    }
  }, [bandStatus?.running]);

  const runBand = useMutation({
    mutationFn: async ({ band, gapFill, cap, newestFirst }: { band: string; gapFill: boolean; cap: number; newestFirst: boolean }) => {
      const res = await fetch("/api/admin/enrichment/run-band", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
        body: JSON.stringify({ band, gapFill, cap, newestFirst }),
      });
      if (!res.ok) { const data = await res.json(); throw new Error(data.error || "Failed to start"); }
      return res.json();
    },
    onSuccess: (_d, vars) => {
      setBandPolling(true); setBandConfirm(null); setBandSummaryDismissed(false); refetchBandStatus();
      toast({ title: `Band run started`, description: `GPT-4o running on ${vars.band.replace("_", " ")} band${vars.gapFill ? " (gap-fill)" : ""}…` });
    },
    onError: (err: Error) => toast({ title: "Failed to start", description: err.message, variant: "destructive" }),
  });

  const stopBand = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/enrichment/band/stop", { method: "POST", headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) { const data = await res.json(); throw new Error(data.error || "Failed"); }
      return res.json();
    },
    onSuccess: () => { toast({ title: "Stop signal sent" }); refetchBandStatus(); },
    onError: (err: Error) => toast({ title: "Failed to stop", description: err.message, variant: "destructive" }),
  });

  const isRunning = status?.status === "running";
  const isResumed = status?.resumed === true;
  const unknownCount = pipelineStats?.unknownCount ?? 0;
  const totalAssets = pipelineStats?.total ?? 0;
  const costEstimate = miniQueue?.costEstimate ?? (unknownCount * 0.0003);
  const progressPct = status && status.total > 0 ? Math.round((status.processed / status.total) * 100) : 0;
  const ruleFillProgressPct = ruleFillStatus?.progress && ruleFillStatus.progress.total > 0
    ? Math.round((ruleFillStatus.progress.processed / ruleFillStatus.progress.total) * 100) : 0;

  const anyRunning = isRunning || ruleFillStatus?.running || bandStatus?.running || edenStatus?.running;

  return (
    <div className="border border-border rounded-xl bg-card overflow-hidden" data-testid="card-enrichment-pipeline">
      {/* Header */}
      <div className="px-5 py-3 bg-muted/20 border-b border-border flex items-center gap-3 flex-wrap">
        <Sparkles className="h-4 w-4 text-violet-500 shrink-0" />
        <span className="text-sm font-semibold text-foreground">Enrichment Controls</span>
        {anyRunning && (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 dark:text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-full px-2.5 py-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />Running
          </span>
        )}
        {(edenStatus?.lastCycleCount ?? 0) > 0 && (
          <span className="text-xs text-muted-foreground hidden sm:inline">
            Last cycle: <span className="text-foreground font-medium">{edenStatus!.lastCycleCount.toLocaleString()}</span> enriched
            {(edenStatus?.lastCycleDeferred ?? 0) > 0 && <span className="text-amber-600 dark:text-amber-400 ml-1">({edenStatus!.lastCycleDeferred.toLocaleString()} deferred)</span>}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setOpen(o => !o)}
            className="inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg border border-border hover:bg-muted/40 transition-colors"
            data-testid="button-toggle-enrichment-controls">
            {open ? "Collapse" : "Open Controls"}
            <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>

      {/* Pipeline Funnel — always visible */}
      <div className="px-5 py-2.5 border-b border-border bg-background/60 flex items-center gap-1.5 flex-wrap" data-testid="pipeline-funnel">
        {([
          { label: "Collected", value: pipelineStats?.total, color: "text-foreground" },
          { label: "Relevant", value: pipelineStats?.relevantAssets, color: "text-emerald-600 dark:text-emerald-400" },
          { label: "Deep Enriched", value: edenStats?.coverage?.deepEnriched, color: "text-violet-600 dark:text-violet-400" },
          { label: "Embedded", value: edenStats?.embeddingCoverage?.totalEmbedded, color: "text-purple-600 dark:text-purple-400" },
        ] as const).map((stage, i, arr) => (
          <React.Fragment key={stage.label}>
            <div className="flex flex-col items-center shrink-0 min-w-[64px] text-center">
              <span className={`text-sm font-bold tabular-nums ${stage.color}`}>
                {stage.value != null ? stage.value.toLocaleString() : "—"}
              </span>
              <span className="text-[10px] text-muted-foreground leading-tight">{stage.label}</span>
            </div>
            {i < arr.length - 1 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />}
          </React.Fragment>
        ))}
        {(pipelineStats?.unknownCount ?? 0) > 0 && (
          <span className="ml-auto text-xs text-amber-600 dark:text-amber-400 shrink-0">
            <span className="font-bold tabular-nums">{pipelineStats!.unknownCount.toLocaleString()}</span> unknown fields
          </span>
        )}
      </div>

      {open && (
        <div className="px-5 py-4 space-y-5 border-t border-border">

          {/* Coverage summary */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="rounded-xl border border-border bg-background p-3 text-center">
              <div className="text-xl font-bold tabular-nums text-foreground" data-testid="stat-total-assets">{totalAssets.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground mt-0.5">Total Assets</div>
            </div>
            <div className="rounded-xl border border-border bg-background p-3 text-center">
              <div className="text-xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400" data-testid="stat-relevant-assets">{(pipelineStats?.relevantAssets ?? 0).toLocaleString()}</div>
              <div className="text-xs text-muted-foreground mt-0.5">Relevant Assets</div>
            </div>
            <div className="rounded-xl border border-border bg-background p-3 text-center">
              <div className="text-xl font-bold tabular-nums text-amber-600 dark:text-amber-400" data-testid="stat-unknown-count">{unknownCount.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground mt-0.5">Unknown Fields</div>
            </div>
            <div className="rounded-xl border border-border bg-background p-3 text-center">
              <div className="text-xl font-bold tabular-nums text-foreground" data-testid="stat-complete-count">{(totalAssets - unknownCount).toLocaleString()}</div>
              <div className="text-xs text-muted-foreground mt-0.5">Fully Enriched</div>
            </div>
            <div className="rounded-xl border border-border bg-background p-3 text-center">
              <div className="text-xl font-bold tabular-nums text-foreground" data-testid="stat-completion-rate">{totalAssets > 0 ? Math.round(((totalAssets - unknownCount) / totalAssets) * 100) : 0}%</div>
              <div className="text-xs text-muted-foreground mt-0.5">Completion Rate</div>
            </div>
          </div>

          {/* EDEN Corpus Coverage */}
          {(edenStats?.coverage || edenStats?.embeddingCoverage) && (() => {
            const cov = edenStats?.coverage;
            const emb = edenStats?.embeddingCoverage;
            const deepPct = cov && cov.totalRelevant > 0 ? Math.round((cov.deepEnriched / cov.totalRelevant) * 100) : 0;
            const embPct2 = emb && emb.totalRelevant > 0 ? Math.round((emb.totalEmbedded / emb.totalRelevant) * 100) : 0;
            const edenRemaining = cov ? cov.totalRelevant - cov.deepEnriched : 0;
            const estCostUsd = edenRemaining > 0 ? (edenRemaining * 0.01).toFixed(2) : "0.00";
            const embRemaining = emb ? emb.totalRelevant - emb.totalEmbedded : 0;
            const embEstCost = embRemaining > 0 ? (embRemaining * 0.00002).toFixed(2) : "0.00";
            const edenLive = edenStatus?.running ? edenStatus : edenStats?.live ? { running: true, processed: edenStats.live.processed, total: edenStats.live.total } : null;
            const edenPct = edenLive && edenLive.total > 0 ? Math.round((edenLive.processed / edenLive.total) * 100) : null;
            const embedLive = embedStatus?.running ? embedStatus : null;
            const embedPct = embedLive && embedLive.total > 0 ? Math.round((embedLive.processed / embedLive.total) * 100) : null;
            return (
              <div className="border border-border rounded-xl bg-muted/5 overflow-hidden" data-testid="card-eden-coverage">
                <div className="px-4 py-2.5 border-b border-border bg-muted/20 flex items-center gap-2">
                  <BrainCircuit className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span className="text-sm font-semibold text-foreground">EDEN Corpus Coverage</span>
                  {embPct2 >= 100 && deepPct >= 90
                    ? <span className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 ml-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block"/>Active</span>
                    : <span className="flex items-center gap-1 text-[11px] text-muted-foreground ml-1"><span className="h-1.5 w-1.5 rounded-full bg-amber-400 inline-block"/>Indexing</span>
                  }
                </div>
                <div className="p-4 space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <div className="rounded-lg border border-border bg-muted/20 p-3"><p className="text-[11px] text-muted-foreground uppercase tracking-wide">Corpus</p><p className="text-xl font-bold text-foreground mt-0.5">{cov?.totalRelevant?.toLocaleString() ?? "—"}</p><p className="text-[11px] text-muted-foreground">relevant assets</p></div>
                    <div className="rounded-lg border border-border bg-muted/20 p-3"><p className="text-[11px] text-muted-foreground uppercase tracking-wide">Enriched</p><p className="text-xl font-bold text-emerald-600 mt-0.5">{cov?.deepEnriched?.toLocaleString() ?? "—"}</p><p className="text-[11px] text-muted-foreground">{deepPct}% with GPT-4o</p></div>
                    <div className="rounded-lg border border-border bg-muted/20 p-3"><p className="text-[11px] text-muted-foreground uppercase tracking-wide">Embedded</p><p className="text-xl font-bold text-violet-600 mt-0.5">{emb?.totalEmbedded?.toLocaleString() ?? "—"}</p><p className="text-[11px] text-muted-foreground">{embPct2}% vectorized</p></div>
                    <div className="rounded-lg border border-border bg-muted/20 p-3"><p className="text-[11px] text-muted-foreground uppercase tracking-wide">With MoA</p><p className="text-xl font-bold text-foreground mt-0.5">{cov?.withMoa?.toLocaleString() ?? "—"}</p><p className="text-[11px] text-muted-foreground">mechanism of action</p></div>
                    <div className="rounded-lg border border-border bg-muted/20 p-3"><p className="text-[11px] text-muted-foreground uppercase tracking-wide">Completeness</p><p className="text-xl font-bold text-foreground mt-0.5">{cov?.avgCompletenessScore != null ? `${cov.avgCompletenessScore}` : "—"}</p><p className="text-[11px] text-muted-foreground">avg / 100 pts</p></div>
                  </div>
                  <div className="space-y-2">
                    <div><div className="flex justify-between text-xs text-muted-foreground mb-1"><span>Deep Enrichment</span><span>{deepPct}%</span></div><Progress value={deepPct} className="h-1.5" /></div>
                    <div><div className="flex justify-between text-xs text-muted-foreground mb-1"><span>Vector Embeddings</span><span>{embPct2}%</span></div><Progress value={embPct2} className="h-1.5" /></div>
                  </div>
                  {edenLive && (
                    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 flex items-center gap-3">
                      <Loader2 className="h-4 w-4 text-emerald-500 animate-spin shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Deep Enrichment running</span>
                          <span className="text-xs font-bold text-emerald-600">{edenPct}%</span>
                          <Button variant="ghost" size="sm" onClick={() => stopEdenMutation.mutate()} disabled={stopEdenMutation.isPending} className="ml-auto h-6 px-2 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30">Stop</Button>
                        </div>
                        <Progress value={edenPct ?? 0} className="h-1 mt-1" />
                      </div>
                    </div>
                  )}
                  {embedLive && (
                    <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-3 flex items-center gap-3">
                      <Loader2 className="h-4 w-4 text-violet-500 animate-spin shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-violet-700 dark:text-violet-400">Embedding running</span>
                          <span className="ml-auto text-xs font-bold text-violet-600">{embedPct}%</span>
                        </div>
                        <Progress value={embedPct ?? 0} className="h-1 mt-1" />
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <h4 className="text-xs font-semibold text-foreground mb-1">Deep Enrichment (GPT-4o)</h4>
                      <p className="text-xs text-muted-foreground mb-2">{edenRemaining.toLocaleString()} assets queued · ~${estCostUsd} est.</p>
                      {!confirming ? (
                        <Button size="sm" onClick={() => setConfirming(true)} disabled={edenLive != null || edenRemaining === 0} className="bg-emerald-600 hover:bg-emerald-700 text-white h-7 text-xs w-full" data-testid="button-eden-run">
                          <PlayCircle className="h-3.5 w-3.5 mr-1.5" />{edenRemaining === 0 ? "All Enriched" : `Enrich ${edenRemaining.toLocaleString()}`}
                        </Button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Button size="sm" onClick={() => startEdenMutation.mutate()} disabled={startEdenMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white h-7 text-xs flex-1">
                            {startEdenMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}~${estCostUsd} confirm
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => setConfirming(false)} className="h-7 text-xs">Cancel</Button>
                        </div>
                      )}
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-foreground mb-1">Vector Embeddings</h4>
                      <p className="text-xs text-muted-foreground mb-2">{embRemaining.toLocaleString()} assets queued · ~${embEstCost} est.</p>
                      {!embedConfirming ? (
                        <Button size="sm" onClick={() => setEmbedConfirming(true)} disabled={embedLive != null || embRemaining === 0} className="bg-violet-600 hover:bg-violet-700 text-white h-7 text-xs w-full" data-testid="button-embed-run">
                          <Sparkles className="h-3.5 w-3.5 mr-1.5" />{embRemaining === 0 ? "All Embedded" : `Embed ${embRemaining.toLocaleString()}`}
                        </Button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Button size="sm" onClick={() => embedMutation.mutate()} disabled={embedMutation.isPending} className="bg-violet-600 hover:bg-violet-700 text-white h-7 text-xs flex-1">
                            {embedMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}~${embEstCost} confirm
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => setEmbedConfirming(false)} className="h-7 text-xs">Cancel</Button>
                        </div>
                      )}
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-foreground mb-1">Re-embed: Biology & Categories</h4>
                      <p className="text-xs text-muted-foreground mb-2">Refresh vectors for enriched assets — adds biology taxonomy and category tags to existing embeddings.</p>
                      {!reEmbedBioConfirming ? (
                        <Button size="sm" onClick={() => setReEmbedBioConfirming(true)} disabled={embedLive != null} className="bg-indigo-600 hover:bg-indigo-700 text-white h-7 text-xs w-full" data-testid="button-re-embed-bio-run">
                          <Sparkles className="h-3.5 w-3.5 mr-1.5" />Re-embed with Biology
                        </Button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Button size="sm" onClick={() => reEmbedBioMutation.mutate()} disabled={reEmbedBioMutation.isPending} className="bg-indigo-600 hover:bg-indigo-700 text-white h-7 text-xs flex-1">
                            {reEmbedBioMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}Confirm re-embed
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => setReEmbedBioConfirming(false)} className="h-7 text-xs">Cancel</Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Step 1: Classify Unclassified Assets */}
          <div className="border border-sky-200 dark:border-sky-900 rounded-xl bg-sky-50/50 dark:bg-sky-950/20 overflow-hidden" data-testid="card-classify-unclassified">
            <div className="px-4 py-2.5 border-b border-sky-200 dark:border-sky-900 bg-sky-100/60 dark:bg-sky-950/40 flex items-center gap-2">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-sky-500 text-white text-xs font-bold shrink-0">1</span>
              <span className="text-sm font-semibold text-sky-800 dark:text-sky-300">Classify Unclassified Assets</span>
              <span className="ml-auto text-xs font-medium text-sky-700 dark:text-sky-400 flex items-center gap-1.5">
                <span className="bg-sky-100 dark:bg-sky-900/50 px-1.5 py-0.5 rounded font-mono text-[10px]">gpt-4o + gpt-4o-mini</span>
                {classifyCount && <span>~${classifyCount.estCost.toFixed(2)} est.</span>}
              </span>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                Sets <span className="font-medium text-foreground">asset_class</span> on all {(classifyCount?.total ?? 28862).toLocaleString()} relevant assets that have never been deep-enriched.
                Thick text (≥120 chars) uses <span className="font-mono text-[10px] bg-muted px-1 rounded">gpt-4o</span>; thin text (40–119 chars) uses <span className="font-mono text-[10px] bg-muted px-1 rounded">gpt-4o-mini</span> automatically.
                Assets under 40 chars are skipped until re-scraped with more content.
              </p>
              {classifyCount && (
                <div className="grid grid-cols-5 gap-2">
                  {[
                    { label: "Total", val: classifyCount.total, color: "sky" },
                    { label: "GPT-4o (thick)", val: classifyCount.thick, color: "violet" },
                    { label: "Mini (thin)", val: classifyCount.thin, color: "amber" },
                    { label: "Too thin (skip)", val: classifyCount.tooThin, color: "muted" },
                    { label: "Exhausted (≥3×)", val: classifyCount.exhausted ?? 0, color: "red" },
                  ].map(f => (
                    <div key={f.label} className="rounded-lg border border-sky-200 dark:border-sky-800 bg-background p-2 text-center">
                      <div className={`text-base font-bold tabular-nums ${f.color === "red" && (classifyCount.exhausted ?? 0) > 0 ? "text-red-600 dark:text-red-400" : "text-sky-700 dark:text-sky-400"}`}>{f.val.toLocaleString()}</div>
                      <div className="text-xs text-muted-foreground">{f.label}</div>
                    </div>
                  ))}
                </div>
              )}
              {classifyStatus?.running && (
                <div className="space-y-2 rounded-lg border border-sky-200 dark:border-sky-900 bg-sky-50 dark:bg-sky-950/40 p-3">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-600" />
                    <span className="text-xs font-medium text-sky-700 dark:text-sky-400">Classifying…</span>
                    <span className="ml-auto text-xs tabular-nums text-muted-foreground">{classifyStatus.processed.toLocaleString()}/{classifyStatus.total.toLocaleString()}</span>
                    <Button variant="ghost" size="sm" onClick={() => stopClassify.mutate()} disabled={stopClassify.isPending}
                      className="h-6 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30" data-testid="button-classify-stop">
                      Stop
                    </Button>
                  </div>
                  <div className="w-full bg-sky-100 dark:bg-sky-900/40 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-sky-500 h-1.5 rounded-full transition-all duration-500"
                      style={{ width: `${classifyStatus.total > 0 ? Math.round((classifyStatus.processed / classifyStatus.total) * 100) : 0}%` }} />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>{classifyStatus.succeeded.toLocaleString()} classified · {classifyStatus.skipped.toLocaleString()} thin-skipped · {classifyStatus.failed.toLocaleString()} failed</span>
                    <span className="font-medium text-sky-700 dark:text-sky-400">${classifyStatus.liveCostUsd.toFixed(4)} so far</span>
                  </div>
                </div>
              )}
              {!classifyStatus?.running && classifyStatus?.lastSummary && (
                <div className="rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 p-3 space-y-1">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                      Last run: {classifyStatus.lastSummary.succeeded.toLocaleString()} classified, {classifyStatus.lastSummary.skipped} skipped, ${classifyStatus.lastSummary.costUsd.toFixed(2)} spent
                    </span>
                    <span className="text-[11px] text-muted-foreground ml-auto">{Math.round(classifyStatus.lastSummary.durationMs / 1000)}s</span>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2">
                {!classifyConfirm ? (
                  <Button size="sm"
                    onClick={() => setClassifyConfirm(true)}
                    disabled={classifyStatus?.running || (classifyCount?.total ?? 0) === 0 || anyRunning}
                    className="gap-1.5 bg-sky-600 hover:bg-sky-700 text-white" data-testid="button-classify-run">
                    <Sparkles className="h-3.5 w-3.5" />
                    Classify all unclassified ({(classifyCount?.total ?? 0).toLocaleString()}) · ~${(classifyCount?.estCost ?? 0).toFixed(2)}
                  </Button>
                ) : (
                  <div className="flex items-center gap-2 rounded-lg border border-sky-300 dark:border-sky-700 bg-sky-50 dark:bg-sky-950/40 px-3 py-2">
                    <span className="text-xs text-sky-800 dark:text-sky-300 font-medium">
                      Classify {(classifyCount?.total ?? 0).toLocaleString()} assets for ~${(classifyCount?.estCost ?? 0).toFixed(2)}?
                    </span>
                    <Button size="sm" onClick={() => runClassify.mutate()} disabled={runClassify.isPending}
                      className="h-6 px-3 text-xs bg-sky-600 hover:bg-sky-700 text-white" data-testid="button-classify-confirm">
                      {runClassify.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Confirm"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setClassifyConfirm(false)}
                      className="h-6 px-2 text-xs text-muted-foreground" data-testid="button-classify-cancel">
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Step 2a: Rule-Based Fill */}
          <div className="border border-emerald-200 dark:border-emerald-900 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-emerald-200 dark:border-emerald-900 bg-emerald-100/60 dark:bg-emerald-950/40 flex items-center gap-2">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500 text-white text-xs font-bold shrink-0">2a</span>
              <span className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Rule-Based Fill</span>
              <span className="ml-auto text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/50 px-2 py-0.5 rounded-full">FREE — no AI cost</span>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-xs text-muted-foreground">Applies regex pattern rules to fill <em>modality</em>, <em>target</em>, <em>indication</em>, <em>developmentStage</em>, <em>ipType</em>, and <em>licensingReadiness</em> from asset text and stored categories. Also tags data-sparse assets (description &lt; 150 chars). Respects human-verified locks.</p>
              {ruleFillEstimate && (
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {Object.entries(ruleFillEstimate.byField).map(([field, count]) => (
                    <div key={field} className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-background p-2 text-center">
                      <div className="text-base font-bold tabular-nums text-emerald-700 dark:text-emerald-400">{(count as number).toLocaleString()}</div>
                      <div className="text-xs text-muted-foreground capitalize">{field}</div>
                    </div>
                  ))}
                  <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-background p-2 text-center">
                    <div className="text-base font-bold tabular-nums text-amber-600 dark:text-amber-400">{ruleFillEstimate.dataSparseCount.toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">Sparse</div>
                  </div>
                </div>
              )}
              {ruleFillStatus?.running && ruleFillStatus.progress && (
                <div className="space-y-2" data-testid="rule-fill-progress">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600" />
                    <span className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">Running…</span>
                    <span className="text-xs tabular-nums text-muted-foreground ml-auto">{ruleFillStatus.progress.processed.toLocaleString()}/{ruleFillStatus.progress.total.toLocaleString()} ({ruleFillProgressPct}%)</span>
                    <Button variant="ghost" size="sm" onClick={() => stopRuleFill.mutate()} disabled={stopRuleFill.isPending} className="h-6 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30" data-testid="button-rule-fill-stop">Stop</Button>
                  </div>
                  <div className="w-full bg-emerald-100 dark:bg-emerald-900/40 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${ruleFillProgressPct}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground">{ruleFillStatus.progress.filled.toLocaleString()} fields filled so far</p>
                </div>
              )}
              {!ruleFillStatus?.running && ruleFillStatus?.result && (
                <div className="flex items-start gap-2 p-3 rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30" data-testid="rule-fill-result">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Done — {ruleFillStatus.result.fieldsWritten.toLocaleString()} fields written across {ruleFillStatus.result.filled.toLocaleString()} assets{ruleFillStatus.result.dataSparseTagged > 0 && `, ${ruleFillStatus.result.dataSparseTagged} sparse-flagged`}</p>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {Object.entries(ruleFillStatus.result.byField).map(([f, n]) => (
                        <span key={f} className="text-xs bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded">{f}: {(n as number).toLocaleString()}</span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => refetchRuleFillEstimate()} disabled={estimateFetching}
                  className="gap-1.5 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30" data-testid="button-rule-fill-estimate">
                  {estimateFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}Estimate
                </Button>
                <Button size="sm" onClick={() => runRuleFill.mutate()} disabled={ruleFillStatus?.running || runRuleFill.isPending}
                  className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="button-run-rule-fill">
                  {ruleFillStatus?.running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}Run Rule Fill
                </Button>
              </div>
            </div>
          </div>

          {/* Step 2b: TTO Licensing Fill — structural source rule, zero cost */}
          <div className="border border-teal-200 dark:border-teal-900 rounded-xl bg-teal-50/50 dark:bg-teal-950/20 overflow-hidden" data-testid="card-tto-licensing-fill">
            <div className="px-4 py-2.5 border-b border-teal-200 dark:border-teal-900 bg-teal-100/60 dark:bg-teal-950/40 flex items-center gap-2">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-teal-500 text-white text-xs font-bold shrink-0">2b</span>
              <span className="text-sm font-semibold text-teal-800 dark:text-teal-300">TTO Licensing Availability Fill</span>
              <span className="ml-auto text-xs font-medium text-teal-600 dark:text-teal-400 bg-teal-100 dark:bg-teal-900/50 px-2 py-0.5 rounded-full">FREE — no AI cost</span>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                Sets <span className="font-medium text-foreground">licensing_readiness = 'available'</span> for all TTO assets where it is null or unknown.
                Universities list technologies on TTO portals specifically because they want to license them — the listing itself is proof of availability.
                Stamps <span className="font-mono text-[10px] bg-muted px-1 rounded">rule:tto_source</span> so AI enrichment can still override.
              </p>
              {ttoLicensingFillCount != null && (
                <div className="flex items-center gap-3 p-2.5 rounded-lg border border-teal-200 dark:border-teal-800 bg-background">
                  <span className="text-lg font-bold tabular-nums text-teal-700 dark:text-teal-400">{ttoLicensingFillCount.total.toLocaleString()}</span>
                  <span className="text-xs text-muted-foreground">TTO assets with missing licensing_readiness</span>
                </div>
              )}
              {runTtoLicensingFill.isPending && (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-teal-600" />
                  <span className="text-xs text-teal-700 dark:text-teal-400 font-medium">Filling licensing_readiness…</span>
                </div>
              )}
              {ttoLicensingFillDone && !runTtoLicensingFill.isPending && (
                <div className="flex items-start gap-2 p-3 rounded-lg border border-teal-200 dark:border-teal-900 bg-teal-50 dark:bg-teal-950/30" data-testid="tto-licensing-fill-result">
                  <CheckCircle2 className="h-4 w-4 text-teal-500 shrink-0 mt-0.5" />
                  <p className="text-xs font-medium text-teal-700 dark:text-teal-400">Done — {ttoLicensingFillDone.filled.toLocaleString()} assets filled (was {ttoLicensingFillDone.beforeCount.toLocaleString()} missing)</p>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => refetchTtoLicensingFillCount()}
                  className="gap-1.5 border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/30" data-testid="button-tto-licensing-fill-count">
                  <RefreshCw className="h-3.5 w-3.5" />Count
                </Button>
                <Button size="sm" onClick={() => runTtoLicensingFill.mutate()}
                  disabled={runTtoLicensingFill.isPending || (ttoLicensingFillCount?.total ?? 1) === 0}
                  className="gap-1.5 bg-teal-600 hover:bg-teal-700 text-white" data-testid="button-run-tto-licensing-fill">
                  {runTtoLicensingFill.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                  Fill {ttoLicensingFillCount != null ? `(${ttoLicensingFillCount.total.toLocaleString()})` : ""}
                </Button>
              </div>
            </div>
          </div>

          {/* Step 2c: Modality Fill — rule-based, zero cost */}
          <div className="border border-teal-200 dark:border-teal-900 rounded-xl bg-teal-50/50 dark:bg-teal-950/20 overflow-hidden" data-testid="card-modality-fill">
            <div className="px-4 py-2.5 border-b border-teal-200 dark:border-teal-900 bg-teal-100/60 dark:bg-teal-950/40 flex items-center gap-2">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-teal-500 text-white text-xs font-bold shrink-0">2c</span>
              <span className="text-sm font-semibold text-teal-800 dark:text-teal-300">Modality Fill from Titles</span>
              <span className="ml-auto text-xs font-medium text-teal-600 dark:text-teal-400 bg-teal-100 dark:bg-teal-900/50 px-2 py-0.5 rounded-full">FREE — no AI cost</span>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                Keyword pattern matching on asset titles and summaries fills <span className="font-medium text-foreground">modality</span> for assets where it is null or unknown — at zero API cost.
                Detects antibody, small molecule, diagnostic, nanoparticle, gene therapy, mRNA, CAR-T, siRNA, vaccine, peptide, PROTAC, and more.
                Stamps <span className="font-mono text-[10px] bg-muted px-1 rounded">source: rule</span> so AI enrichment can later override with higher confidence.
              </p>
              {modalityFillCount != null && (
                <div className="flex items-center gap-3 p-2.5 rounded-lg border border-teal-200 dark:border-teal-800 bg-background">
                  <span className="text-lg font-bold tabular-nums text-teal-700 dark:text-teal-400">{modalityFillCount.total.toLocaleString()}</span>
                  <span className="text-xs text-muted-foreground">assets with detectable modality still unfilled</span>
                </div>
              )}
              {runModalityFill.isPending && (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-teal-600" />
                  <span className="text-xs text-teal-700 dark:text-teal-400 font-medium">Running keyword fill…</span>
                </div>
              )}
              {modalityFillDone && !runModalityFill.isPending && (
                <div className="flex items-start gap-2 p-3 rounded-lg border border-teal-200 dark:border-teal-900 bg-teal-50 dark:bg-teal-950/30" data-testid="modality-fill-result">
                  <CheckCircle2 className="h-4 w-4 text-teal-500 shrink-0 mt-0.5" />
                  <p className="text-xs font-medium text-teal-700 dark:text-teal-400">Done — {modalityFillDone.filled.toLocaleString()} modality fields written</p>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => refetchModalityFillCount()}
                  className="gap-1.5 border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/30" data-testid="button-modality-fill-count">
                  <RefreshCw className="h-3.5 w-3.5" />Count
                </Button>
                <Button size="sm" onClick={() => runModalityFill.mutate()}
                  disabled={runModalityFill.isPending || (modalityFillCount?.total ?? 0) === 0}
                  className="gap-1.5 bg-teal-600 hover:bg-teal-700 text-white" data-testid="button-run-modality-fill">
                  {runModalityFill.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                  Fill {modalityFillCount != null ? `(${modalityFillCount.total.toLocaleString()})` : ""}
                </Button>
              </div>
            </div>
          </div>

          {/* Step 2d: USPTO Patent Cross-Reference */}
          <div className="border border-blue-200 dark:border-blue-900 rounded-xl bg-blue-50/50 dark:bg-blue-950/20 overflow-hidden" data-testid="card-uspto-xref">
            <div className="px-4 py-2.5 border-b border-blue-200 dark:border-blue-900 bg-blue-100/60 dark:bg-blue-950/40 flex items-center gap-2">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-500 text-white text-xs font-bold shrink-0">2d</span>
              <span className="text-sm font-semibold text-blue-800 dark:text-blue-300">USPTO Patent Cross-Reference</span>
              <span className="ml-auto text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/50 px-2 py-0.5 rounded-full">FREE — no AI cost</span>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                Queries the USPTO API by institution assignee, then fuzzy-matches patent titles against TTO asset names (Jaccard ≥ 0.35) to fill <em>ip_type = "patent"</em> and <em>patent_status</em>.
                A regex supplement pass also catches assets with patent numbers embedded directly in their text.
                Never overwrites existing non-null values or human-verified fields.
              </p>

              {/* No API key banner */}
              {usptoStatus?.noApiKey && (
                <div className="flex items-start gap-2.5 p-3 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30" data-testid="uspto-no-api-key-banner">
                  <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                  <div className="text-xs space-y-1">
                    <p className="font-semibold text-amber-800 dark:text-amber-300">USPTO_ODP_API_KEY not set</p>
                    <p className="text-amber-700 dark:text-amber-400">
                      The API pass will be skipped — only the regex text-extraction supplement will run.
                      Add <span className="font-mono">USPTO_ODP_API_KEY</span> to your environment secrets for full coverage.
                    </p>
                  </div>
                </div>
              )}

              {/* Missing ip_type count */}
              {usptoCount && (
                <div className="flex items-center gap-2">
                  <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-background px-3 py-2 flex items-center gap-2">
                    <span className="text-base font-bold tabular-nums text-blue-700 dark:text-blue-400" data-testid="stat-uspto-missing-ip-type">{usptoCount.missingIpTypeCount.toLocaleString()}</span>
                    <span className="text-xs text-muted-foreground">assets with missing ip_type</span>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => refetchUsptoCount()} className="h-7 w-7 p-0 text-muted-foreground" data-testid="button-uspto-refresh-count">
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}

              {/* Spot check results */}
              {usptoStatus?.spotCheck && (
                <div className="space-y-1.5" data-testid="uspto-spot-check-results">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-medium text-muted-foreground">Spot check results:</p>
                    {usptoStatus.spotCheck.passed
                      ? <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">{usptoStatus.spotCheck.validCount}/{usptoStatus.spotCheck.results.length} valid — gate passed</span>
                      : <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">{usptoStatus.spotCheck.validCount}/{usptoStatus.spotCheck.results.length} valid — need ≥3 to run</span>
                    }
                  </div>
                  {usptoStatus.spotCheck.reason && (
                    <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded px-2 py-1">{usptoStatus.spotCheck.reason}</p>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {usptoStatus.spotCheck.results.map((r) => (
                      <div key={r.institution}
                        className={`rounded-lg border px-3 py-2 text-xs ${!r.valid ? "border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20" : "border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20"}`}
                        data-testid={`spot-check-row-${r.institution.replace(/\s+/g, "-").toLowerCase()}`}>
                        <div className="flex items-center gap-1.5">
                          {!r.valid
                            ? <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                            : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
                          <span className="font-medium">{r.institution}</span>
                          <span className="ml-auto tabular-nums text-muted-foreground">{r.count.toLocaleString()} patents</span>
                        </div>
                        {r.sample.length > 0 && (
                          <p className="mt-1 text-muted-foreground truncate pl-5" title={r.sample[0].title}>
                            {r.sample[0].title}
                          </p>
                        )}
                        {r.error && <p className="mt-1 text-red-600 dark:text-red-400 pl-5">{r.error}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Progress */}
              {usptoStatus?.running && usptoStatus.progress && (
                <div className="space-y-2" data-testid="uspto-xref-progress">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
                    <span className="text-xs text-blue-700 dark:text-blue-400 font-medium">Running…</span>
                    <span className="text-xs tabular-nums text-muted-foreground ml-auto">
                      {usptoStatus.progress.processed.toLocaleString()}/{usptoStatus.progress.total.toLocaleString()} ({usptoProgressPct}%)
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => stopUsptoXref.mutate()} disabled={stopUsptoXref.isPending}
                      className="h-6 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30" data-testid="button-uspto-stop">Stop</Button>
                  </div>
                  <div className="w-full bg-blue-100 dark:bg-blue-900/40 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-blue-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${usptoProgressPct}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    matched: {usptoStatus.progress.matched.toLocaleString()} · unmatched: {usptoStatus.progress.unmatched.toLocaleString()} · skipped: {usptoStatus.progress.skipped.toLocaleString()}
                  </p>
                </div>
              )}

              {/* Result */}
              {!usptoStatus?.running && usptoStatus?.result && (
                <div className="flex items-start gap-2 p-3 rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/30" data-testid="uspto-xref-result">
                  <CheckCircle2 className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-blue-700 dark:text-blue-400">
                      Done — {usptoStatus.result.matched.toLocaleString()} assets matched &amp; updated
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      <span className="text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 px-1.5 py-0.5 rounded">matched: {usptoStatus.result.matched.toLocaleString()}</span>
                      <span className="text-xs bg-slate-100 dark:bg-slate-900/40 text-slate-600 dark:text-slate-400 px-1.5 py-0.5 rounded">unmatched: {usptoStatus.result.unmatched.toLocaleString()}</span>
                      <span className="text-xs bg-slate-100 dark:bg-slate-900/40 text-slate-600 dark:text-slate-400 px-1.5 py-0.5 rounded">skipped (no mapping): {usptoStatus.result.skipped.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 flex-wrap">
                <Button size="sm" variant="outline" onClick={() => runUsptoSpotCheck.mutate()} disabled={runUsptoSpotCheck.isPending || usptoStatus?.running}
                  className="gap-1.5 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30" data-testid="button-uspto-spot-check">
                  {runUsptoSpotCheck.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Activity className="h-3.5 w-3.5" />}
                  Spot Check API
                </Button>
                <Button size="sm" onClick={() => runUsptoXref.mutate()} disabled={usptoStatus?.running || runUsptoXref.isPending}
                  className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50" data-testid="button-run-uspto-xref">
                  {usptoStatus?.running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                  Run Cross-Reference
                </Button>
              </div>
            </div>
          </div>

          {/* Step 2e: Clear Data-Sparse Flags */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-950/20 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-950/40 flex items-center gap-2">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-500 text-white text-xs font-bold shrink-0">2e</span>
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-300">Clear Data-Sparse Flags</span>
              <span className="ml-auto text-xs font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-900/50 px-2 py-0.5 rounded-full">FREE — no AI cost</span>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                Unlocks assets that were previously flagged as data-sparse but have since gained enough text (≥ 150 chars combined title + summary + abstract).
                Resets <em>enriched_at</em> so the AI enrichment queue picks them up again.
                Run this after any retroactive refetch to maximize the deep-enrichment queue.
              </p>
              {clearSparse.isSuccess && (
                <div className="flex items-center gap-2 p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/30" data-testid="clear-sparse-result">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                  <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                    {(clearSparse.data?.cleared ?? 0).toLocaleString()} assets unlocked for AI enrichment
                  </p>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => clearSparse.mutate()} disabled={clearSparse.isPending}
                  className="gap-1.5 bg-slate-600 hover:bg-slate-700 text-white" data-testid="button-clear-sparse">
                  {clearSparse.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  Clear Data-Sparse Flags
                </Button>
              </div>
            </div>
          </div>

          {/* Step 3a: Biology Fill — target-derived + rule-based + GPT fallback */}
          <div className="border border-purple-200 dark:border-purple-900 rounded-xl bg-purple-50/50 dark:bg-purple-950/20 overflow-hidden" data-testid="card-biology-fill">
            <div className="px-4 py-2.5 border-b border-purple-200 dark:border-purple-900 bg-purple-100/60 dark:bg-purple-950/40 flex items-center gap-2">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-purple-500 text-white text-xs font-bold shrink-0">3a</span>
              <span className="text-sm font-semibold text-purple-800 dark:text-purple-300">Biology Fill</span>
              <span className="ml-auto text-xs font-medium text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/50 px-2 py-0.5 rounded-full">Tier A free · Tier B GPT-mini fallback</span>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                Fills the <span className="font-medium text-foreground">biology</span> field — the pathological mechanism between indication and target — using a 32-value closed taxonomy.
                Three layers run in order: <span className="font-mono text-[10px] bg-muted px-1 rounded">target→biology derivation</span> (zero cost),
                <span className="font-mono text-[10px] bg-muted px-1 rounded">regex rules</span> (zero cost),
                then <span className="font-mono text-[10px] bg-muted px-1 rounded">GPT-4o-mini</span> fallback for unresolved assets.
                Respects <span className="font-mono text-[10px] bg-muted px-1 rounded">enrichment_sources</span> provenance tracking.
              </p>
              {biologyFillCount != null && (
                <div className="flex items-center gap-3 p-2.5 rounded-lg border border-purple-200 dark:border-purple-800 bg-background">
                  <span className="text-lg font-bold tabular-nums text-purple-700 dark:text-purple-400">{biologyFillCount.total.toLocaleString()}</span>
                  <span className="text-xs text-muted-foreground">relevant assets without a biology value</span>
                </div>
              )}
              {(biologyFillStatus?.running || runBiologyFill.isPending) && (() => {
                const prog = biologyFillStatus?.progress;
                const pct = prog && prog.total > 0 ? Math.round((prog.processed / prog.total) * 100) : 0;
                return (
                  <div className="space-y-2 p-3 rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50/60 dark:bg-purple-950/30">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-purple-600" />
                        <span className="text-xs text-purple-700 dark:text-purple-400 font-medium">
                          {prog ? prog.phase : "Starting…"}
                        </span>
                      </div>
                      {prog && prog.total > 0 && (
                        <span className="text-xs tabular-nums text-purple-600 dark:text-purple-400 font-mono">
                          {prog.processed.toLocaleString()} / {prog.total.toLocaleString()} ({pct}%)
                        </span>
                      )}
                    </div>
                    {prog && prog.total > 0 && (
                      <div className="w-full bg-purple-100 dark:bg-purple-900/40 rounded-full h-1.5">
                        <div
                          className="bg-purple-500 h-1.5 rounded-full transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    )}
                    {prog && (
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 pt-1">
                        <div className="flex justify-between text-[10px]">
                          <span className="text-muted-foreground">Target-derived</span>
                          <span className="tabular-nums font-mono text-purple-700 dark:text-purple-400">{(prog.targetDerived ?? 0).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-[10px]">
                          <span className="text-muted-foreground">Rule-matched</span>
                          <span className="tabular-nums font-mono text-purple-700 dark:text-purple-400">{(prog.ruleMatched ?? 0).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-[10px]">
                          <span className="text-muted-foreground">GPT sent / resolved</span>
                          <span className="tabular-nums font-mono text-purple-700 dark:text-purple-400">{(prog.gptSent ?? 0).toLocaleString()} / {(prog.gptResolved ?? 0).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-[10px]">
                          <span className="text-muted-foreground">Written to DB</span>
                          <span className="tabular-nums font-mono font-semibold text-green-600 dark:text-green-400">{(prog.written ?? 0).toLocaleString()}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
              {biologyFillDone && !biologyFillStatus?.running && (
                <div className="flex items-start gap-2 p-3 rounded-lg border border-purple-200 dark:border-purple-900 bg-purple-50 dark:bg-purple-950/30" data-testid="biology-fill-result">
                  <CheckCircle2 className="h-4 w-4 text-purple-500 shrink-0 mt-0.5" />
                  <div className="text-xs font-medium text-purple-700 dark:text-purple-400 space-y-1">
                    <p>Done — <strong className="text-green-600 dark:text-green-400">{biologyFillDone.totalUpdated.toLocaleString()}</strong> biology fields written</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                      <span className="text-purple-600/80 dark:text-purple-500/80">Target-derived: <strong>{biologyFillDone.targetDerived.toLocaleString()}</strong></span>
                      <span className="text-purple-600/80 dark:text-purple-500/80">Rule-matched: <strong>{biologyFillDone.ruleMatched.toLocaleString()}</strong></span>
                      <span className="text-purple-600/80 dark:text-purple-500/80">GPT sent: <strong>{(biologyFillDone.gptSent ?? 0).toLocaleString()}</strong></span>
                      <span className="text-purple-600/80 dark:text-purple-500/80">GPT resolved: <strong>{biologyFillDone.gptResolved.toLocaleString()}</strong></span>
                      <span className="text-purple-600/80 dark:text-purple-500/80 col-span-2">Unresolved: <strong>{biologyFillDone.unresolved.toLocaleString()}</strong></span>
                    </div>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => refetchBiologyFillCount()}
                  className="gap-1.5 border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/30" data-testid="button-biology-fill-count">
                  <RefreshCw className="h-3.5 w-3.5" />Count
                </Button>
                {biologyFillStatus?.running ? (
                  <Button size="sm" variant="outline" onClick={() => stopBiologyFill.mutate()}
                    disabled={stopBiologyFill.isPending}
                    className="gap-1.5 border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30" data-testid="button-stop-biology-fill">
                    <Square className="h-3.5 w-3.5 fill-current" />Stop
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => runBiologyFill.mutate()}
                    disabled={runBiologyFill.isPending || (biologyFillCount?.total ?? 0) === 0}
                    className="gap-1.5 bg-purple-600 hover:bg-purple-700 text-white" data-testid="button-run-biology-fill">
                    {runBiologyFill.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                    Fill {biologyFillCount != null ? `(${biologyFillCount.total.toLocaleString()})` : ""}
                  </Button>
                )}
              </div>
            </div>
          </div>


          {/* Step 3b: MOA Fill — biology→MOA lookup + AI extraction */}
          <div className="border border-cyan-200 dark:border-cyan-900 rounded-xl bg-cyan-50/50 dark:bg-cyan-950/20 overflow-hidden" data-testid="card-moa-fill">
            <div className="px-4 py-2.5 border-b border-cyan-200 dark:border-cyan-900 bg-cyan-100/60 dark:bg-cyan-950/40 flex items-center gap-2">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-cyan-500 text-white text-xs font-bold shrink-0">3b</span>
              <span className="text-sm font-semibold text-cyan-800 dark:text-cyan-300">MOA Fill</span>
              <span className="ml-auto text-xs font-medium text-cyan-600 dark:text-cyan-400 bg-cyan-100 dark:bg-cyan-900/50 px-2 py-0.5 rounded-full">Pass 1 free · Pass 2 GPT-mini</span>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                Fills the <span className="font-medium text-foreground">mechanism_of_action</span> field using two passes.
                <span className="font-mono text-[10px] bg-muted px-1 rounded ml-1">Pass 1</span> applies a deterministic biology→MOA lookup table (zero cost).
                <span className="font-mono text-[10px] bg-muted px-1 rounded ml-1">Pass 2</span> uses <span className="font-mono text-[10px] bg-muted px-1 rounded">GPT-4o-mini</span> to extract MOA from assets whose <span className="font-medium text-foreground">summary</span>, <span className="font-medium text-foreground">abstract</span>, or <span className="font-medium text-foreground">innovation_claim</span> provides &gt;200 chars of context.
              </p>
              {moaFillCount != null && (
                <div className="flex items-center gap-3 p-2.5 rounded-lg border border-cyan-200 dark:border-cyan-800 bg-background">
                  <span className="text-lg font-bold tabular-nums text-cyan-700 dark:text-cyan-400">{moaFillCount.total.toLocaleString()}</span>
                  <span className="text-xs text-muted-foreground">relevant assets without a MOA value</span>
                </div>
              )}
              {(moaFillStatus?.running || runMoaFill.isPending) && (() => {
                const prog = moaFillStatus?.progress;
                const isPass1 = !prog || prog.phase === "pass1";
                const processPct = prog && prog.total > 0 ? Math.round((prog.processed / prog.total) * 100) : 0;
                const totalProcessed = (prog?.pass1Filled ?? 0) + (prog?.aiFilled ?? 0) + (prog?.failed ?? 0);
                const totalFilled = (prog?.pass1Filled ?? 0) + (prog?.aiFilled ?? 0);
                const fillRate = totalProcessed > 0 ? Math.round((totalFilled / totalProcessed) * 100) : null;
                return (
                  <div className="space-y-2 p-3 rounded-lg border border-cyan-200 dark:border-cyan-800 bg-cyan-50/60 dark:bg-cyan-950/30">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-600" />
                        <span className="text-xs text-cyan-700 dark:text-cyan-400 font-medium">
                          {prog ? (isPass1 ? "Pass 1 — biology → MOA lookup…" : `Pass 2 — AI extraction (${prog.processed.toLocaleString()} / ${prog.total.toLocaleString()})`) : "Starting…"}
                        </span>
                      </div>
                      {prog && prog.total > 0 && !isPass1 && (
                        <span className="text-xs tabular-nums text-cyan-600 dark:text-cyan-400 font-mono">
                          {processPct}%
                        </span>
                      )}
                    </div>
                    {prog && prog.total > 0 && !isPass1 && (
                      <div className="w-full bg-cyan-100 dark:bg-cyan-900/40 rounded-full h-1.5">
                        <div
                          className="bg-cyan-500 h-1.5 rounded-full transition-all duration-500"
                          style={{ width: `${processPct}%` }}
                        />
                      </div>
                    )}
                    {prog && (
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 pt-1">
                        <div className="flex justify-between text-[10px]">
                          <span className="text-muted-foreground">Pass 1 filled</span>
                          <span className="tabular-nums font-mono text-cyan-700 dark:text-cyan-400">{(prog.pass1Filled ?? 0).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-[10px]">
                          <span className="text-muted-foreground">AI filled</span>
                          <span className="tabular-nums font-mono text-cyan-700 dark:text-cyan-400">{(prog.aiFilled ?? 0).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-[10px]">
                          <span className="text-muted-foreground">Failed / unresolved</span>
                          <span className="tabular-nums font-mono text-muted-foreground">{(prog.failed ?? 0).toLocaleString()}</span>
                        </div>
                        {fillRate !== null && (
                          <div className="flex justify-between text-[10px]">
                            <span className="text-muted-foreground">Fill rate so far</span>
                            <span className="tabular-nums font-mono text-green-600 dark:text-green-400">{fillRate}%</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
              {moaFillDone && !moaFillStatus?.running && (() => {
                const eligible = moaFillDone.pass1Total + moaFillDone.pass2Total;
                const successRate = eligible > 0 ? Math.round((moaFillDone.totalWritten / eligible) * 100) : null;
                return (
                  <div className="flex items-start gap-2 p-3 rounded-lg border border-cyan-200 dark:border-cyan-900 bg-cyan-50 dark:bg-cyan-950/30" data-testid="moa-fill-result">
                    <CheckCircle2 className="h-4 w-4 text-cyan-500 shrink-0 mt-0.5" />
                    <div className="flex-1 text-xs font-medium text-cyan-700 dark:text-cyan-400 space-y-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p>Done — <strong className="text-green-600 dark:text-green-400">{moaFillDone.totalWritten.toLocaleString()}</strong> MOA fields written
                          {successRate !== null && <span className="ml-1 text-muted-foreground font-normal">({successRate}% fill rate)</span>}
                        </p>
                        <button
                          onClick={() => setMoaFillDone(null)}
                          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                          aria-label="Dismiss"
                          data-testid="button-dismiss-moa-fill"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                        <span className="text-cyan-600/80 dark:text-cyan-500/80">Pass 1 (biology lookup): <strong>{moaFillDone.pass1Filled.toLocaleString()}</strong> / {moaFillDone.pass1Total.toLocaleString()}</span>
                        <span className="text-cyan-600/80 dark:text-cyan-500/80">Pass 2 (AI): <strong>{moaFillDone.aiFilled.toLocaleString()}</strong> / {moaFillDone.pass2Total.toLocaleString()}</span>
                        <span className="text-cyan-600/80 dark:text-cyan-500/80 col-span-2">Failed / unresolved: <strong>{moaFillDone.failed.toLocaleString()}</strong></span>
                      </div>
                    </div>
                  </div>
                );
              })()}
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => refetchMoaFillCount()}
                  className="gap-1.5 border-cyan-300 dark:border-cyan-700 text-cyan-700 dark:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-950/30" data-testid="button-moa-fill-count">
                  <RefreshCw className="h-3.5 w-3.5" />Count
                </Button>
                {moaFillStatus?.running ? (
                  <Button size="sm" variant="outline" onClick={() => stopMoaFill.mutate()}
                    disabled={stopMoaFill.isPending}
                    className="gap-1.5 border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30" data-testid="button-stop-moa-fill">
                    <Square className="h-3.5 w-3.5 fill-current" />Stop
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => runMoaFill.mutate()}
                    disabled={runMoaFill.isPending || (moaFillCount?.total ?? 0) === 0}
                    className="gap-1.5 bg-cyan-600 hover:bg-cyan-700 text-white" data-testid="button-run-moa-fill">
                    {runMoaFill.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                    Fill {moaFillCount != null ? `(${moaFillCount.total.toLocaleString()})` : ""}
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Deal Comparables — SEC EDGAR 8-K archive */}
          <div className="border border-indigo-200 dark:border-indigo-900 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/20 overflow-hidden" data-testid="card-deal-comparables">
            <div className="px-4 py-2.5 border-b border-indigo-200 dark:border-indigo-900 bg-indigo-100/60 dark:bg-indigo-950/40 flex items-center gap-2">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-indigo-500 text-white text-xs font-bold shrink-0">$</span>
              <span className="text-sm font-semibold text-indigo-800 dark:text-indigo-300">Deal Comparables (SEC EDGAR)</span>
              <span className="ml-auto text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/50 px-2 py-0.5 rounded-full">Offline ingest script</span>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                Archived biotech/pharma licensing deal records scraped from <span className="font-medium text-foreground">SEC 8-K Item 1.01 filings</span> (5-year window).
                Deals are extracted via GPT-4o-mini and stored in <span className="font-mono text-[10px] bg-muted px-1 rounded">deal_comparables</span> for EdenMarket dossier panels.
                Run the <span className="font-mono text-[10px] bg-muted px-1 rounded">ingest-deal-comparables</span> workflow to populate or refresh the archive.
              </p>
              {dealCompsStats != null && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-3 p-2.5 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-background">
                    <span className="text-lg font-bold tabular-nums text-indigo-700 dark:text-indigo-400">{dealCompsStats.count.toLocaleString()}</span>
                    <span className="text-xs text-muted-foreground">deals in archive</span>
                  </div>
                  <div className="flex items-center gap-3 p-2.5 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-background">
                    <span className="text-xs text-muted-foreground">
                      {dealCompsStats.lastIngestedAt
                        ? <>Last run: <span className="font-medium text-foreground">{new Date(dealCompsStats.lastIngestedAt).toLocaleDateString()}</span></>
                        : <span className="text-amber-600 dark:text-amber-400 font-medium">Never run</span>
                      }
                    </span>
                  </div>
                </div>
              )}
              {dealCompsStatus?.running && (
                <div className="space-y-2 p-3 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50/60 dark:bg-indigo-950/30">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-600" />
                    <span className="text-xs text-indigo-700 dark:text-indigo-400 font-medium truncate max-w-xs">
                      {dealCompsStatus.lastLine || "Running…"}
                    </span>
                  </div>
                </div>
              )}
              {!dealCompsStatus?.running && dealCompsStatus?.lastLine && dealCompsStatus.lastLine !== "" && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg border border-indigo-200 dark:border-indigo-900 bg-background" data-testid="deal-comps-last-line">
                  <CheckCircle2 className="h-4 w-4 text-indigo-500 shrink-0" />
                  <p className="text-xs text-indigo-700 dark:text-indigo-400 truncate">{dealCompsStatus.lastLine}</p>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => { refetchDealCompsStats(); refetchDealCompsStatus(); }}
                  className="gap-1.5 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30" data-testid="button-deal-comps-refresh">
                  <RefreshCw className="h-3.5 w-3.5" />Refresh
                </Button>
                {dealCompsStatus?.running ? (
                  <Button size="sm" variant="outline" onClick={() => stopDealCompsIngest.mutate()}
                    disabled={stopDealCompsIngest.isPending}
                    className="gap-1.5 border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30" data-testid="button-deal-comps-stop">
                    <Square className="h-3.5 w-3.5 fill-current" />Stop
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => runDealCompsIngest.mutate()}
                    disabled={runDealCompsIngest.isPending || dealCompsStatus?.running}
                    className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white" data-testid="button-deal-comps-ingest">
                    {runDealCompsIngest.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                    Run Ingest
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Step 3c: GPT-4o-mini Re-enrich */}
          <div className="border border-amber-200 dark:border-amber-900 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-amber-200 dark:border-amber-900 bg-amber-100/60 dark:bg-amber-950/40 flex items-center gap-2">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-amber-500 text-white text-xs font-bold shrink-0">3c</span>
              <span className="text-sm font-semibold text-amber-800 dark:text-amber-300">GPT-4o-mini Re-enrich</span>
              <span className="ml-auto text-xs font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                <span className="bg-amber-100 dark:bg-amber-900/50 px-1.5 py-0.5 rounded font-mono text-[10px]">gpt-4o-mini</span>
                <span>~$0.15/1k assets</span><span className="text-amber-500">·</span><span>~${costEstimate.toFixed(2)} est.</span>
              </span>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-xs text-muted-foreground">Runs GPT-4o-mini on assets that still have unknown fields after rule fill. Type-aware classification: nulls returned for non-applicable fields. Resumable.</p>

              {/* Queue Health */}
              {enrichHealth && (
                <div className="grid grid-cols-4 gap-2" data-testid="enrichment-queue-health">
                  <div title="Have sufficient text and are under the 3-attempt cap — will be processed by the next run"
                    className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-background p-2.5 text-center"
                    data-testid="stat-health-ready-to-enrich">
                    <div className="text-base font-bold tabular-nums text-emerald-700 dark:text-emerald-400">{enrichHealth.readyCount.toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground leading-tight mt-0.5">Ready to enrich</div>
                  </div>
                  <div title="Summary &lt; 120 chars — run a re-fetch tool first to gather more text before enrichment"
                    className="rounded-lg border border-sky-200 dark:border-sky-800 bg-background p-2.5 text-center"
                    data-testid="stat-health-needs-re-fetch">
                    <div className="text-base font-bold tabular-nums text-sky-700 dark:text-sky-400">{enrichHealth.needsRefetchCount.toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground leading-tight mt-0.5">Needs re-fetch</div>
                  </div>
                  <button
                    title="Hit the 3-attempt cap — AI tried 3× and couldn't classify. Click to filter the asset list below. Re-fetch that improves text by 200+ chars will reset the cap."
                    onClick={onGaveUpClick}
                    className={`rounded-lg border bg-background p-2.5 text-center transition-colors
                      ${enrichHealth.gaveUpCount > 0
                        ? "border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                        : "border-border cursor-default"}
                    `}
                    data-testid="stat-health-gave-up">
                    <div className={`text-base font-bold tabular-nums ${enrichHealth.gaveUpCount > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>
                      {enrichHealth.gaveUpCount.toLocaleString()}
                    </div>
                    <div className="text-xs text-muted-foreground leading-tight mt-0.5">
                      Gave up{enrichHealth.gaveUpCount > 0 && onGaveUpClick ? " ↓ view" : ""}
                    </div>
                  </button>
                  <div title="Assets where enriched_at was set in the last 24 hours"
                    className="rounded-lg border border-violet-200 dark:border-violet-800 bg-background p-2.5 text-center"
                    data-testid="stat-health-enriched-24-h">
                    <div className="text-base font-bold tabular-nums text-violet-700 dark:text-violet-400">{enrichHealth.enriched24hCount.toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground leading-tight mt-0.5">Enriched (24 h)</div>
                  </div>
                </div>
              )}

              {pipelineStats && unknownCount > 0 && (
                <div className="grid grid-cols-4 gap-2">
                  {[{ label: "Target", val: pipelineStats.byField.target }, { label: "Modality", val: pipelineStats.byField.modality }, { label: "Indication", val: pipelineStats.byField.indication }, { label: "Dev Stage", val: pipelineStats.byField.developmentStage }].map(f => (
                    <div key={f.label} className="rounded-lg border border-amber-200 dark:border-amber-800 bg-background p-2 text-center">
                      <div className="text-base font-bold tabular-nums text-amber-700 dark:text-amber-400">{f.val.toLocaleString()}</div>
                      <div className="text-xs text-muted-foreground">{f.label}</div>
                    </div>
                  ))}
                </div>
              )}
              {isRunning && status && (
                <div className="space-y-2" data-testid="enrichment-progress">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-600" />
                    <span className="text-xs text-amber-700 dark:text-amber-400 font-medium">Running{isResumed ? " (resumed)" : ""}…</span>
                    <span className="text-xs tabular-nums text-muted-foreground ml-auto" data-testid="enrichment-progress-text">{status.processed.toLocaleString()}/{status.total.toLocaleString()} ({progressPct}%)</span>
                    <Button variant="ghost" size="sm" onClick={() => stopEnrichment.mutate()} disabled={stopEnrichment.isPending} className="h-6 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30" data-testid="button-enrichment-stop">
                      {stopEnrichment.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Stop"}
                    </Button>
                  </div>
                  {status.filters && Object.values(status.filters).some(Boolean) && (
                    <div className="flex flex-wrap gap-1.5 items-center" data-testid="enrichment-active-filters">
                      <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Filters:</span>
                      {status.filters.institution && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800" data-testid="badge-filter-institution">
                          Institution: {status.filters.institution}
                        </span>
                      )}
                      {status.filters.modality && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800" data-testid="badge-filter-modality">
                          Modality: {status.filters.modality}
                        </span>
                      )}
                      {status.filters.tier && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800" data-testid="badge-filter-tier">
                          Tier: {status.filters.tier}
                        </span>
                      )}
                      {status.filters.missingField && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800" data-testid="badge-filter-missing">
                          Missing: {status.filters.missingField}
                        </span>
                      )}
                      {status.filters.stage && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800" data-testid="badge-filter-stage">
                          Stage: {status.filters.stage}
                        </span>
                      )}
                      {status.filters.indication && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800" data-testid="badge-filter-indication">
                          Indication: {status.filters.indication}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="w-full bg-amber-100 dark:bg-amber-900/40 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-amber-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${progressPct}%` }} data-testid="enrichment-progress-bar" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {status.improved.toLocaleString()} assets improved so far
                    {status.tokenCost != null && status.tokenCost > 0 && (
                      <span className="ml-1.5 text-amber-600 dark:text-amber-400">${status.tokenCost.toFixed(3)} spent</span>
                    )}
                  </p>
                </div>
              )}
              {status?.status === "done" && (
                <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30" data-testid="enrichment-done">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                  <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                    Complete — {status.improved} of {status.total} assets improved
                    {status.tokenCost != null && status.tokenCost > 0 && (
                      <span className="ml-1.5 font-normal text-emerald-600 dark:text-emerald-500">(${status.tokenCost.toFixed(3)} spent)</span>
                    )}
                  </p>
                </div>
              )}
              {status?.status === "error" && (
                <div className="flex items-start gap-2 p-3 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30" data-testid="enrichment-error">
                  <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-red-700 dark:text-red-400">Job failed</p>
                    <p className="text-xs text-red-600 dark:text-red-500">{status.error ?? "Dismiss to return to idle."}</p>
                  </div>
                  <Button size="sm" variant="ghost" className="h-6 text-xs text-red-600 dark:text-red-400 hover:text-red-800 shrink-0" onClick={() => dismissError.mutate()} disabled={dismissError.isPending} data-testid="button-dismiss-enrichment-error">
                    {dismissError.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Dismiss"}
                  </Button>
                </div>
              )}
              {(miniQueue?.exhaustedCount ?? 0) > 0 && (
                <p className="text-xs text-muted-foreground" data-testid="text-mini-exhausted">
                  <span className="text-red-500 font-medium">{miniQueue!.exhaustedCount.toLocaleString()} gave up</span>
                  <span className="ml-1">— reached 3-attempt cap with fields still unknown. Content change will reset.</span>
                </p>
              )}

              {/* ── Targeted Filter Bar ── */}
              <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 p-2.5 space-y-2" data-testid="enrichment-filter-bar">
                <p className="text-xs font-medium text-amber-800 dark:text-amber-300">Target enrichment run</p>
                <div className="flex flex-wrap gap-2">
                  <Popover open={enrichInstOpen} onOpenChange={setEnrichInstOpen}>
                    <PopoverTrigger asChild>
                      <button
                        className="h-7 px-2 text-xs rounded-md border border-input bg-background w-44 focus:outline-none focus:ring-1 focus:ring-amber-400 flex items-center justify-between gap-1 truncate"
                        data-testid="input-enrich-institution"
                      >
                        <span className={`truncate ${enrichInstitution ? "text-foreground" : "text-muted-foreground"}`}>
                          {enrichInstitution || "All institutions"}
                        </span>
                        <ChevronsUpDown className="w-3 h-3 shrink-0 opacity-50" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-64 p-0">
                      <Command>
                        <CommandInput placeholder="Search institutions…" className="h-8 text-xs" />
                        <CommandList className="max-h-56">
                          <CommandEmpty className="py-2 text-xs text-center text-muted-foreground">No institution found</CommandEmpty>
                          <CommandGroup>
                            <CommandItem
                              value="__all__"
                              onSelect={() => { setEnrichInstitution(""); setEnrichInstOpen(false); }}
                              className="text-xs"
                            >
                              <Check className={`mr-2 h-3 w-3 ${!enrichInstitution ? "opacity-100" : "opacity-0"}`} />
                              All institutions
                            </CommandItem>
                          </CommandGroup>
                          {(() => {
                            const queues = enrichInstitutionsQuery.data?.institutions ?? [];
                            if (enrichInstitutionsQuery.isLoading) return (
                              <div className="py-3 text-xs text-center text-muted-foreground">Loading…</div>
                            );
                            if (queues.length === 0) return (
                              <div className="py-3 text-xs text-center text-muted-foreground">All caught up ✓</div>
                            );
                            return (
                              <CommandGroup heading={`${queues.length} institution${queues.length === 1 ? "" : "s"} with pending work`}>
                                {queues.map(inst => (
                                  <CommandItem
                                    key={inst.name}
                                    value={inst.name}
                                    onSelect={(val) => { setEnrichInstitution(val); setEnrichInstOpen(false); }}
                                    className="text-xs"
                                  >
                                    <Check className={`mr-2 h-3 w-3 shrink-0 ${enrichInstitution === inst.name ? "opacity-100" : "opacity-0"}`} />
                                    <span className="flex-1 truncate">{inst.name}</span>
                                    <span className="ml-2 text-muted-foreground tabular-nums">({inst.queueCount})</span>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            );
                          })()}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <Select value={enrichTier || "__all__"} onValueChange={v => setEnrichTier(v === "__all__" ? "" : v)}>
                    <SelectTrigger className="h-7 text-xs w-32" data-testid="select-enrich-tier"><SelectValue placeholder="Any tier" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Any tier</SelectItem>
                      <SelectItem value="excellent">Excellent (≥80)</SelectItem>
                      <SelectItem value="good">Good (60–79)</SelectItem>
                      <SelectItem value="partial">Partial (40–59)</SelectItem>
                      <SelectItem value="poor">Poor (1–39)</SelectItem>
                      <SelectItem value="unscored">Unscored</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={enrichModality || "__all__"} onValueChange={v => setEnrichModality(v === "__all__" ? "" : v)}>
                    <SelectTrigger className="h-7 text-xs w-36" data-testid="select-enrich-modality"><SelectValue placeholder="Any modality" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Any modality</SelectItem>
                      <SelectItem value="small molecule">Small molecule</SelectItem>
                      <SelectItem value="biologic">Biologic</SelectItem>
                      <SelectItem value="cell therapy">Cell therapy</SelectItem>
                      <SelectItem value="gene therapy">Gene therapy</SelectItem>
                      <SelectItem value="medical device">Medical Device</SelectItem>
                      <SelectItem value="diagnostic">Diagnostic</SelectItem>
                      <SelectItem value="platform">Platform</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={enrichMissingField || "__all__"} onValueChange={v => setEnrichMissingField(v === "__all__" ? "" : v)}>
                    <SelectTrigger className="h-7 text-xs w-36" data-testid="select-enrich-missing"><SelectValue placeholder="Any field" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Any field</SelectItem>
                      <SelectItem value="target">Missing: Target</SelectItem>
                      <SelectItem value="indication">Missing: Indication</SelectItem>
                      <SelectItem value="modality">Missing: Modality</SelectItem>
                      <SelectItem value="stage">Missing: Dev Stage</SelectItem>
                    </SelectContent>
                  </Select>
                  {hasEnrichFilters && (
                    <button
                      onClick={() => { setEnrichInstitution(""); setEnrichModality(""); setEnrichTier(""); setEnrichMissingField(""); }}
                      className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                      data-testid="button-enrich-clear-filters"
                    >Clear</button>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {(() => {
                    // Always source count from /count endpoint (same criteria as the batch run)
                    // so the button label always matches what will actually be processed.
                    const totalCount = enrichCount?.count ?? 0;
                    const totalCost = enrichCount?.costEstimate ?? 0;
                    const batchCount = Math.min(500, totalCount);
                    const filterOpts = hasEnrichFilters ? { institution: debouncedInstitution || undefined, modality: enrichModality || undefined, tier: enrichTier || undefined, missingField: enrichMissingField || undefined } : undefined;
                    const noAssets = enrichCount?.count === 0;
                    return (<>
                      <Button size="sm"
                        onClick={() => runEnrichment.mutate(filterOpts)}
                        disabled={isRunning || runEnrichment.isPending || noAssets || enrichCountLoading}
                        className="gap-1.5 bg-amber-500 hover:bg-amber-600 text-white"
                        data-testid="button-run-enrichment"
                        title={hasEnrichFilters ? `Enrich the top ${batchCount.toLocaleString()} assets matching current filters (completeness DESC)` : `Enrich the top ${batchCount.toLocaleString()} assets (completeness DESC)`}>
                        {isRunning || enrichCountLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                        Run {batchCount.toLocaleString()}{hasEnrichFilters ? " filtered" : " batch"}
                        {totalCost > 0 && <span className="opacity-70 text-[10px]"> ~${(batchCount * 0.0003).toFixed(2)}</span>}
                      </Button>
                      <Button size="sm" variant="outline"
                        onClick={() => {
                          const label = hasEnrichFilters ? "filtered assets" : "assets in queue";
                          const ok = window.confirm(`Run on ALL ${totalCount.toLocaleString()} ${label}?\n\nEstimated cost: $${totalCost.toFixed(2)}\n\nThe job pulls the next 500 until the queue is empty. You can stop at any time.`);
                          if (ok) runEnrichment.mutate({ all: true, ...filterOpts });
                        }}
                        disabled={isRunning || runEnrichment.isPending || noAssets || enrichCountLoading}
                        className="gap-1.5 border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                        data-testid="button-run-enrichment-all">
                        {isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                        Run all ({enrichCountLoading ? "…" : totalCount.toLocaleString()})
                      </Button>
                    </>);
                  })()}
                  {(miniQueue?.backfillCount ?? 0) > 0 && (
                    <MiniBackfillButton pw={pw} onDone={() => queryClient.invalidateQueries({ queryKey: ["/api/admin/enrichment/mini-queue"] })} />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Step 4: Rescore All */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-950/20 overflow-hidden" data-testid="card-rescore">
            <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-900/40 flex items-center gap-2">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-500 text-white text-xs font-bold shrink-0">4</span>
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Rescore All Assets</span>
              <span className="ml-auto text-xs font-medium text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">FREE — no AI cost</span>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                Recomputes <span className="font-medium text-foreground">completeness_score</span> for all enriched assets using the updated v2 formula.
                Target is now a <span className="font-medium text-foreground">bonus field</span> (+10, capped at 100) rather than a required gate — assets with indication, modality, and dev stage can now reach 80+ without a molecular target.
                Unclassified assets now receive a description-quality score instead of null.
                Run this after any bulk field update to apply the new weights.
              </p>
              {rescoreStatus?.running && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-500" />
                    <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">Rescoring…</span>
                    <span className="text-xs tabular-nums text-muted-foreground ml-auto">{rescoreStatus.processed.toLocaleString()}/{rescoreStatus.total.toLocaleString()}</span>
                    <Button variant="ghost" size="sm" onClick={() => stopRescore.mutate()} disabled={stopRescore.isPending}
                      className="h-6 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30" data-testid="button-rescore-stop">
                      {stopRescore.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Stop"}
                    </Button>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-slate-500 h-1.5 rounded-full transition-all duration-500"
                      style={{ width: `${rescoreStatus.total > 0 ? Math.round((rescoreStatus.processed / rescoreStatus.total) * 100) : 0}%` }} />
                  </div>
                </div>
              )}
              {rescoreStatus?.lastSummary && !rescoreStatus.running && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-background" data-testid="rescore-result">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                  <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    {rescoreStatus.lastSummary.updated.toLocaleString()} of {rescoreStatus.lastSummary.total.toLocaleString()} scores updated
                    <span className="text-muted-foreground ml-1">({Math.round(rescoreStatus.lastSummary.durationMs / 1000)}s)</span>
                  </p>
                </div>
              )}
              <Button size="sm" onClick={() => runRescore.mutate()} disabled={rescoreStatus?.running || runRescore.isPending}
                variant="outline" className="gap-1.5 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900/30" data-testid="button-run-rescore">
                {rescoreStatus?.running || runRescore.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Rescore all
              </Button>
            </div>
          </div>

          {/* Step 5: GPT-4o Surgical Band Enrichment */}
          <div className="border border-violet-200 dark:border-violet-900 rounded-xl bg-violet-50/50 dark:bg-violet-950/20 overflow-hidden" data-testid="card-band-enrichment">
            <div className="px-4 py-2.5 border-b border-violet-200 dark:border-violet-900 bg-violet-100/60 dark:bg-violet-950/40 flex items-center gap-2">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-violet-500 text-white text-xs font-bold shrink-0">5</span>
              <span className="text-sm font-semibold text-violet-800 dark:text-violet-300">GPT-4o Surgical Deep Pass</span>
              <span className="ml-auto text-xs font-medium text-violet-600 dark:text-violet-400">~$0.01/asset</span>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-xs text-muted-foreground">Target a specific quality band for GPT-4o deep enrichment. Enable <span className="font-medium text-foreground">gap-fill</span> to only generate missing MoA/unmet-need fields on drug assets — minimising cost. <span className="font-medium text-foreground">Newest first</span> processes recently ingested assets before older ones.</p>
              {bandStatus?.running && (
                <div className="space-y-2 rounded-lg border border-violet-200 dark:border-violet-900 bg-violet-50 dark:bg-violet-950/40 p-3" data-testid="band-live-progress">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-600" />
                    <span className="text-xs font-medium text-violet-700 dark:text-violet-400">{bandStatus.band?.replace("_", " ")} band{bandStatus.gapFill ? " (gap-fill)" : ""} running…</span>
                    <span className="ml-auto text-xs tabular-nums text-muted-foreground" data-testid="band-progress-text">{bandStatus.processed.toLocaleString()}/{bandStatus.total.toLocaleString()}</span>
                    <Button variant="ghost" size="sm" onClick={() => stopBand.mutate()} disabled={stopBand.isPending} className="h-6 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30" data-testid="button-band-stop">
                      {stopBand.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Stop"}
                    </Button>
                  </div>
                  <div className="w-full bg-violet-100 dark:bg-violet-900/40 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-violet-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${bandStatus.total > 0 ? Math.round((bandStatus.processed / bandStatus.total) * 100) : 0}%` }} data-testid="band-progress-bar" />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>{bandStatus.succeeded.toLocaleString()} assets improved</span>
                    <span className="font-medium text-violet-700 dark:text-violet-400" data-testid="band-live-cost">${bandStatus.liveCostUsd.toFixed(4)} of ~${bandStatus.liveProjectedTotalUsd?.toFixed(2) ?? "?"} · {(bandStatus.liveInputTokens + bandStatus.liveOutputTokens).toLocaleString()} tok (actual)</span>
                  </div>
                  {bandStatus.gapFill && (bandStatus.targetFields ?? []).length > 0 && Object.keys(bandStatus.liveFieldCounts ?? {}).length === 0 && (
                    <div data-testid="band-targeting-fields">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Targeting</p>
                      <div className="flex flex-wrap gap-1">
                        {bandStatus.targetFields.map((f) => (
                          <span key={f} className="rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-400 text-[10px] px-2 py-0.5 font-medium" data-testid={`targeting-field-${f}`}>{f.replace(/([A-Z])/g, " $1").toLowerCase()}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {bandStatus.gapFill && Object.keys(bandStatus.liveFieldCounts ?? {}).length > 0 && (
                    <div data-testid="band-live-field-counts">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Fields filled so far</p>
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(bandStatus.liveFieldCounts).sort((a, b) => b[1] - a[1]).map(([f, n]) => (
                          <span key={f} className="rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-400 text-[10px] px-2 py-0.5 font-medium" data-testid={`live-field-count-${f}`}>{f.replace(/([A-Z])/g, " $1").toLowerCase()} ×{n}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {!bandStatus?.running && !bandSummaryDismissed && bandStatus?.lastSummary && (
                <div className="rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 p-3 space-y-2" data-testid="band-last-summary">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Last run: {bandStatus.lastSummary.band.replace("_", " ")} band{bandStatus.lastSummary.gapFill ? " gap-fill" : ""}</span>
                    <span className="text-[11px] text-muted-foreground">{Math.round(bandStatus.lastSummary.durationMs / 1000)}s</span>
                    <button onClick={() => setBandSummaryDismissed(true)} className="ml-auto text-[11px] text-muted-foreground hover:text-foreground" data-testid="button-band-dismiss-summary" aria-label="Dismiss summary">✕</button>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <div className="text-center"><p className="text-sm font-bold text-foreground" data-testid="summary-succeeded">{bandStatus.lastSummary.succeeded.toLocaleString()}</p><p className="text-[10px] text-muted-foreground">written</p></div>
                    <div className="text-center"><p className="text-sm font-bold text-foreground">{bandStatus.lastSummary.failed.toLocaleString()}</p><p className="text-[10px] text-muted-foreground">failed</p></div>
                    <div className="text-center"><p className="text-sm font-bold text-violet-600" data-testid="summary-cost">${bandStatus.lastSummary.costUsd.toFixed(4)}</p><p className="text-[10px] text-muted-foreground">cost</p></div>
                    <div className="text-center"><p className="text-sm font-bold text-foreground">{(bandStatus.lastSummary.inputTokens + bandStatus.lastSummary.outputTokens).toLocaleString()}</p><p className="text-[10px] text-muted-foreground">tokens (actual)</p></div>
                  </div>
                  {bandStatus.lastSummary.avgScoreBefore != null && bandStatus.lastSummary.avgScoreAfter != null && (
                    <div className="flex items-center gap-1.5 text-[11px]" data-testid="summary-score-delta">
                      <span className="text-muted-foreground">Avg score:</span>
                      <span className="font-medium text-foreground">{bandStatus.lastSummary.avgScoreBefore}</span>
                      <span className="text-muted-foreground">→</span>
                      <span className={`font-semibold ${bandStatus.lastSummary.avgScoreAfter > bandStatus.lastSummary.avgScoreBefore ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"}`}>{bandStatus.lastSummary.avgScoreAfter}</span>
                      {bandStatus.lastSummary.avgScoreAfter > bandStatus.lastSummary.avgScoreBefore && <span className="text-emerald-600 dark:text-emerald-400">(+{(bandStatus.lastSummary.avgScoreAfter - bandStatus.lastSummary.avgScoreBefore).toFixed(1)})</span>}
                    </div>
                  )}
                  {bandStatus.lastSummary.gapFill && Object.keys(bandStatus.lastSummary.fieldFillCounts ?? {}).length > 0 && (
                    <div data-testid="summary-fields-filled">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Fields populated per asset</p>
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(bandStatus.lastSummary.fieldFillCounts).sort((a, b) => b[1] - a[1]).map(([f, n]) => (
                          <span key={f} className="rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 text-[10px] px-2 py-0.5 font-medium" data-testid={`summary-field-count-${f}`}>{f.replace(/([A-Z])/g, " $1").toLowerCase()} <span className="font-bold">×{n}</span></span>
                        ))}
                      </div>
                    </div>
                  )}
                  {!bandStatus.lastSummary.gapFill && bandStatus.lastSummary.fieldsFilledNames.length > 0 && (
                    <div data-testid="summary-fields-filled">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Fields targeted</p>
                      <div className="flex flex-wrap gap-1">
                        {bandStatus.lastSummary.fieldsFilledNames.map((f) => (
                          <span key={f} className="rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-400 text-[10px] px-2 py-0.5 font-medium">{f.replace(/([A-Z])/g, " $1").toLowerCase()}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {Object.keys(bandStatus.lastSummary.bandMovements ?? {}).length > 0 && (() => {
                    const bandOrder = ["bare", "very_sparse", "sparse", "decent", "rich"];
                    return (
                      <div data-testid="summary-band-movements">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Band movements</p>
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(bandStatus.lastSummary!.bandMovements).sort((a, b) => b[1] - a[1]).map(([key, n]) => {
                            const [from, to] = key.split("→");
                            const isUp = bandOrder.indexOf(to) > bandOrder.indexOf(from);
                            return <span key={key} className={`rounded-full text-[10px] px-2 py-0.5 font-medium border ${isUp ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800" : "bg-muted text-muted-foreground border-border"}`}>{from.replace("_", " ")} → {to.replace("_", " ")} ×{n}</span>;
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
              <div className="space-y-2" data-testid="band-rows">
                {(bandsData?.bands ?? [
                  { id: "rich" as const, count: 0, gapFillCount: 0, missingTarget: 0, missingModality: 0, missingIndication: 0, missingStage: 0, missingMoa: 0, missingUnmet: 0, missingComparable: 0, missingInnovation: 0, totalMissingFields: 0, estCostFull: 0, estCostGapFill: 0, needsRescrape: false, populationB: 0 },
                  { id: "decent" as const, count: 0, gapFillCount: 0, missingTarget: 0, missingModality: 0, missingIndication: 0, missingStage: 0, missingMoa: 0, missingUnmet: 0, missingComparable: 0, missingInnovation: 0, totalMissingFields: 0, estCostFull: 0, estCostGapFill: 0, needsRescrape: false, populationB: 0 },
                  { id: "sparse" as const, count: 0, gapFillCount: 0, missingTarget: 0, missingModality: 0, missingIndication: 0, missingStage: 0, missingMoa: 0, missingUnmet: 0, missingComparable: 0, missingInnovation: 0, totalMissingFields: 0, estCostFull: 0, estCostGapFill: 0, needsRescrape: false, populationB: 0 },
                  { id: "very_sparse" as const, count: 0, gapFillCount: 0, missingTarget: 0, missingModality: 0, missingIndication: 0, missingStage: 0, missingMoa: 0, missingUnmet: 0, missingComparable: 0, missingInnovation: 0, totalMissingFields: 0, estCostFull: 0, estCostGapFill: 0, needsRescrape: false, populationB: 0 },
                  { id: "bare" as const, count: 0, gapFillCount: 0, missingTarget: 0, missingModality: 0, missingIndication: 0, missingStage: 0, missingMoa: 0, missingUnmet: 0, missingComparable: 0, missingInnovation: 0, totalMissingFields: 0, estCostFull: 0, estCostGapFill: 0, needsRescrape: true, populationB: 0 },
                ]).map((band) => {
                  const isBare = band.id === "bare";
                  const isGapFill = bandGapFill[band.id] ?? !isBare;
                  const isNewest = bandNewestFirst[band.id] ?? false;
                  const targetCount = isGapFill ? band.gapFillCount : band.count;
                  const estCost = isGapFill ? band.estCostGapFill : band.estCostFull;
                  const isThisRunning = bandStatus?.running && bandStatus.band === band.id;
                  const anyRunningBand = bandStatus?.running;
                  const isConfirming = bandConfirm === band.id;
                  const bandMeta: Record<string, { label: string; range: string; dot: string; bg: string; border: string; text: string }> = {
                    rich:        { label: "Rich",        range: "80–100", dot: "bg-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-950/20",  border: "border-emerald-200 dark:border-emerald-900", text: "text-emerald-700 dark:text-emerald-400" },
                    decent:      { label: "Decent",      range: "60–79",  dot: "bg-teal-500",    bg: "bg-teal-50 dark:bg-teal-950/20",        border: "border-teal-200 dark:border-teal-900",    text: "text-teal-700 dark:text-teal-400" },
                    sparse:      { label: "Sparse",      range: "40–59",  dot: "bg-amber-500",   bg: "bg-amber-50 dark:bg-amber-950/20",      border: "border-amber-200 dark:border-amber-900",  text: "text-amber-700 dark:text-amber-400" },
                    very_sparse: { label: "Very Sparse", range: "1–39",   dot: "bg-orange-500",  bg: "bg-orange-50 dark:bg-orange-950/20",    border: "border-orange-200 dark:border-orange-900", text: "text-orange-700 dark:text-orange-400" },
                    bare:        { label: "Bare",        range: "0/null", dot: "bg-muted-foreground/40", bg: "bg-muted/20", border: "border-border", text: "text-muted-foreground" },
                  };
                  const m = bandMeta[band.id];
                  const primaryPills = !isBare ? [
                    { key: "target", label: "Target", count: band.missingTarget },
                    { key: "modality", label: "Modality", count: band.missingModality },
                    { key: "indication", label: "Indication", count: band.missingIndication },
                    { key: "stage", label: "Stage", count: band.missingStage },
                  ].filter((p) => p.count > 0) : [];
                  const secondaryPills = !isBare ? [
                    { key: "moa", label: "MoA", count: band.missingMoa },
                    { key: "unmet", label: "Unmet need", count: band.missingUnmet },
                    { key: "comparable", label: "Comparables", count: band.missingComparable },
                    { key: "innovation", label: "Innovation", count: band.missingInnovation },
                  ].filter((p) => p.count > 0) : [];
                  const gapPills = [...primaryPills, ...secondaryPills];
                  return (
                    <div key={band.id} className={`rounded-lg border ${m.border} ${m.bg} p-3 space-y-2`} data-testid={`band-row-${band.id}`}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`h-2 w-2 rounded-full ${m.dot} shrink-0`} />
                        <span className={`text-xs font-semibold ${m.text}`}>{m.label}</span>
                        <span className="text-[11px] text-muted-foreground">score {m.range}</span>
                        <span className="text-[11px] font-medium text-foreground tabular-nums" data-testid={`band-count-${band.id}`}>{band.count.toLocaleString()} assets</span>
                        {!isBare && band.gapFillCount > 0 && <span className="text-[11px] text-muted-foreground">· {band.gapFillCount.toLocaleString()} gap-fillable</span>}
                        <span className="ml-auto text-[11px] font-medium text-violet-600 dark:text-violet-400 tabular-nums" data-testid={`band-cost-${band.id}`}>{isBare ? "—" : `~$${estCost.toFixed(2)}`}</span>
                      </div>
                      {gapPills.length > 0 && (
                        <div className="flex flex-wrap gap-1" data-testid={`band-gap-pills-${band.id}`}>
                          {primaryPills.map((p) => (
                            <span key={p.key} className="rounded-full bg-rose-100 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-[10px] px-1.5 py-0.5 text-rose-700 dark:text-rose-400 font-medium">
                              {p.count.toLocaleString()} missing {p.label}
                            </span>
                          ))}
                          {secondaryPills.map((p) => (
                            <span key={p.key} className="rounded-full bg-white/60 dark:bg-white/5 border border-current/10 text-[10px] px-1.5 py-0.5 text-muted-foreground">
                              {p.count.toLocaleString()} missing {p.label}
                            </span>
                          ))}
                        </div>
                      )}
                      {!isBare ? (
                        <div className="flex items-center gap-3 flex-wrap">
                          <label className="flex items-center gap-1.5 cursor-pointer select-none" data-testid={`band-gapfill-toggle-${band.id}`}>
                            <div onClick={() => setBandGapFill((prev) => ({ ...prev, [band.id]: !prev[band.id] }))} className={`relative h-4 w-7 rounded-full transition-colors cursor-pointer ${isGapFill ? "bg-violet-500" : "bg-muted-foreground/30"}`}>
                              <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform ${isGapFill ? "translate-x-3" : "translate-x-0.5"}`} />
                            </div>
                            <span className="text-[11px] text-muted-foreground">Gap-fill{isGapFill && band.gapFillCount > 0 ? ` (${band.gapFillCount.toLocaleString()})` : ""}</span>
                          </label>
                          <label className="flex items-center gap-1.5 cursor-pointer select-none" data-testid={`band-newest-toggle-${band.id}`}>
                            <div onClick={() => setBandNewestFirst((prev) => ({ ...prev, [band.id]: !prev[band.id] }))} className={`relative h-4 w-7 rounded-full transition-colors cursor-pointer ${isNewest ? "bg-violet-400" : "bg-muted-foreground/30"}`}>
                              <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform ${isNewest ? "translate-x-3" : "translate-x-0.5"}`} />
                            </div>
                            <span className="text-[11px] text-muted-foreground">Newest first</span>
                          </label>
                          <label className="flex items-center gap-1 text-[11px] text-muted-foreground" data-testid={`band-cap-label-${band.id}`}>
                            <span>Cap:</span>
                            <input type="number" min={10} max={5000} step={50} value={bandCap[band.id] ?? 500}
                              onChange={(e) => setBandCap((prev) => ({ ...prev, [band.id]: Math.min(5000, Math.max(10, parseInt(e.target.value) || 500)) }))}
                              onBlur={(e) => setBandCap((prev) => ({ ...prev, [band.id]: Math.min(5000, Math.max(10, parseInt(e.target.value) || 500)) }))}
                              className="w-16 h-5 rounded border border-input bg-background px-1 text-[11px] text-foreground tabular-nums" data-testid={`band-cap-input-${band.id}`} />
                            <span className="text-[10px] text-muted-foreground/60">(10–5k)</span>
                          </label>
                          {isConfirming ? (() => {
                            const capValue = bandCap[band.id] ?? 500;
                            const effectiveCount = Math.min(targetCount, capValue);
                            const perAssetCost = targetCount > 0 ? estCost / targetCount : 0;
                            const effectiveCost = effectiveCount * perAssetCost;
                            return (
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[11px] font-semibold text-amber-600" data-testid={`band-confirm-text-${band.id}`}>
                                  Run {effectiveCount.toLocaleString()} assets (~${effectiveCost.toFixed(2)})?{effectiveCount < targetCount && <span className="text-amber-500 font-normal"> (capped from {targetCount.toLocaleString()})</span>}
                                </span>
                                <Button size="sm" className="h-6 px-2.5 text-[11px] bg-violet-600 hover:bg-violet-700 text-white" disabled={runBand.isPending}
                                  onClick={() => runBand.mutate({ band: band.id, gapFill: isGapFill, cap: capValue, newestFirst: isNewest })} data-testid={`button-band-confirm-${band.id}`}>
                                  {runBand.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Yes, Run"}
                                </Button>
                                <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => setBandConfirm(null)} data-testid={`button-band-cancel-${band.id}`}>Cancel</Button>
                              </div>
                            );
                          })() : (
                            <Button size="sm" variant="outline" className={`h-6 px-2.5 text-[11px] ${m.border} ${m.text} hover:bg-white/60 dark:hover:bg-white/5`}
                              disabled={anyRunningBand || targetCount === 0 || runBand.isPending} onClick={() => setBandConfirm(band.id)} data-testid={`button-band-run-${band.id}`}
                              title={isThisRunning ? "Running…" : targetCount === 0 ? "No assets to process" : `Run GPT-4o on ${targetCount.toLocaleString()} assets`}>
                              {isThisRunning ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}Run {isGapFill ? "gap-fill" : "full pass"}
                            </Button>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 flex-wrap">
                          {(band.populationB ?? 0) > 0 ? (
                            isConfirming ? (() => {
                              const capValue = bandCap[band.id] ?? 500;
                              const effective = Math.min(band.populationB ?? 0, capValue);
                              const perAssetCost = 0.011;
                              return (
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[11px] font-semibold text-amber-600" data-testid="button-band-confirm-bare-text">Enrich {effective.toLocaleString()} bare assets (~${(effective * perAssetCost).toFixed(2)})?</span>
                                  <Button size="sm" className="h-6 px-2.5 text-[11px] bg-violet-600 hover:bg-violet-700 text-white" disabled={runBand.isPending}
                                    onClick={() => runBand.mutate({ band: band.id, gapFill: false, cap: capValue, newestFirst: false })} data-testid="button-band-confirm-bare">
                                    {runBand.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Yes, Run"}
                                  </Button>
                                  <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => setBandConfirm(null)} data-testid="button-band-cancel-bare">Cancel</Button>
                                </div>
                              );
                            })() : (
                              <Button size="sm" variant="outline" className={`h-6 px-2.5 text-[11px] ${m.border} ${m.text} hover:bg-white/60 dark:hover:bg-white/5`}
                                disabled={anyRunningBand || runBand.isPending} onClick={() => setBandConfirm(band.id)} data-testid="button-band-run-bare"
                                title={`Enrich ${(band.populationB ?? 0).toLocaleString()} bare assets with ≥120 chars of content`}>
                                <Sparkles className="h-3 w-3 mr-1" />Run pop B ({(band.populationB ?? 0).toLocaleString()})
                              </Button>
                            )
                          ) : (
                            <>
                              <Button size="sm" variant="outline" className="h-6 px-2.5 text-[11px] border-border text-muted-foreground opacity-50 cursor-not-allowed" disabled data-testid="button-band-run-bare" title="No bare assets with ≥120 chars — re-scrape first">
                                <Sparkles className="h-3 w-3 mr-1" />Run full pass
                              </Button>
                              <span className="text-[11px] text-muted-foreground">Re-scrape first</span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {unknownCount === 0 && totalAssets > 0 && (
                <div className="text-center py-4 text-muted-foreground" data-testid="enrichment-all-complete">
                  <CheckCircle2 className="h-7 w-7 mx-auto mb-2 opacity-40" />
                  <p className="text-sm font-medium">All assets fully enriched</p>
                  <p className="text-xs mt-1">No unknown fields remaining.</p>
                </div>
              )}
            </div>
          </div>


        </div>
      )}
    </div>
  );
}

function Enrichment({ pw, initialGaveUpFilter }: { pw: string; initialGaveUpFilter?: number }) {
  const [institutionFilter, setInstitutionFilter] = useState("");
  const [institutionSortKey, setInstitutionSortKey] = useState<"relevant_count" | "avg_completeness" | "fill_target" | "fill_indication" | "fill_biology" | "fill_moa">("relevant_count");
  const [institutionSortDir, setInstitutionSortDir] = useState<"asc" | "desc">("desc");
  const [expandedInstitution, setExpandedInstitution] = useState<string | null>(null);
  const [browserPreFilter, setBrowserPreFilter] = useState<AssetBrowserInit>(null);
  const browserRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (initialGaveUpFilter) {
      setBrowserPreFilter({ dim: "missing", value: "capped" });
      setTimeout(() => browserRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 200);
    }
  }, [initialGaveUpFilter]);

  const handleFilterSelect = (dim: "modality" | "stage" | "indication" | "biology", value: string) => {
    setBrowserPreFilter({ dim, value });
    setTimeout(() => browserRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  };

  const { data: quality, isLoading: qualityLoading, refetch: refetchQuality } = useQuery<DatasetQualityResponse>({
    queryKey: ["/api/admin/dataset-quality", pw],
    queryFn: async () => {
      const res = await fetch("/api/admin/dataset-quality", { headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) throw new Error("Failed to load dataset quality");
      return res.json();
    },
  });

  const { data: drilldown, isLoading: drilldownLoading } = useQuery<{ assets: DrilldownAsset[] }>({
    queryKey: ["/api/admin/dataset-quality/institution", expandedInstitution, pw],
    queryFn: async () => {
      const res = await fetch(`/api/admin/dataset-quality/institution/${encodeURIComponent(expandedInstitution!)}`, {
        headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
      });
      if (!res.ok) throw new Error("Failed to load institution assets");
      return res.json();
    },
    enabled: expandedInstitution !== null,
  });

  const [showByClass, setShowByClass] = React.useState(false);
  const { data: byClass } = useQuery<ClassRow[]>({
    queryKey: ["/api/admin/dataset-quality/by-class", pw],
    queryFn: async () => {
      const res = await fetch("/api/admin/dataset-quality/by-class", { headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) throw new Error("Failed to load class breakdown");
      return res.json();
    },
    enabled: showByClass,
    staleTime: 120_000,
  });

  // ── Confidence Distribution (Task #693) ─────────────────────────────────────
  const [showConfidence, setShowConfidence] = React.useState(false);
  const { data: confidenceDist } = useQuery<{
    histogram: Array<{ bucket: string; count: number; avg_completeness: number | null }>;
    saveRate: Array<{ bucket: string; asset_count: number; saved_asset_count: number; save_rate_pct: number | null }>;
  }>({
    queryKey: ["/api/admin/dataset-quality/confidence-distribution", pw],
    queryFn: async () => {
      const res = await fetch("/api/admin/dataset-quality/confidence-distribution", { headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) throw new Error("Failed to load confidence distribution");
      return res.json();
    },
    enabled: showConfidence,
    staleTime: 120_000,
  });

  const g = quality?.global;
  const totalRelevant = g?.total_relevant ?? 0;
  const scoredPct = totalRelevant > 0 && g ? Math.round((g.scored_count / totalRelevant) * 100) : 0;
  const tierTotal = totalRelevant || 1;

  const tiers = [
    { label: "Investment Ready", key: "tier_excellent" as const, color: "bg-emerald-500", textColor: "text-emerald-700 dark:text-emerald-400", bgColor: "bg-emerald-50 dark:bg-emerald-950/30", range: "80+" },
    { label: "Reviewable", key: "tier_good" as const, color: "bg-teal-400", textColor: "text-teal-700 dark:text-teal-400", bgColor: "bg-teal-50 dark:bg-teal-950/30", range: "60–79" },
    { label: "Developing", key: "tier_partial" as const, color: "bg-amber-400", textColor: "text-amber-700 dark:text-amber-400", bgColor: "bg-amber-50 dark:bg-amber-950/30", range: "40–59" },
    { label: "Thin", key: "tier_poor" as const, color: "bg-orange-400", textColor: "text-orange-700 dark:text-orange-400", bgColor: "bg-orange-50 dark:bg-orange-950/30", range: "1–39" },
    { label: "Unscored", key: "tier_unscored" as const, color: "bg-muted-foreground/30", textColor: "text-muted-foreground", bgColor: "bg-muted/30", range: "null" },
  ];

  const fieldRows = [
    { label: "Target", key: "fill_target" as const, color: "bg-violet-500", tooltip: "Specific molecular target (e.g. EGFR, PD-1). Often unavailable in early-stage TTO listings — now a bonus field, not required for a high score." },
    { label: "Indication", key: "fill_indication" as const, color: "bg-blue-500", tooltip: "Therapeutic area or disease indication (e.g. oncology, Alzheimer's). Highest-weight field for pharma buyers." },
    { label: "Modality", key: "fill_modality" as const, color: "bg-indigo-500", tooltip: "Therapy type (e.g. small molecule, antibody, gene therapy, cell therapy). Critical for portfolio fit." },
    { label: "Dev Stage", key: "fill_stage" as const, color: "bg-teal-500", tooltip: "Development stage (e.g. preclinical, Phase I/II). Buyers use this to assess time-to-value." },
    { label: "Licensing", key: "fill_licensing" as const, color: "bg-amber-500", tooltip: "Licensing availability status (e.g. available, exclusively licensed). Indicates commercial accessibility." },
    { label: "Patent / IP", key: "fill_patent" as const, color: "bg-orange-500", tooltip: "Patent status (e.g. patent pending, patented) and IP type. Buyers need IP clarity before engagement." },
    { label: "Biology", key: "fill_biology" as const, color: "bg-purple-500", tooltip: "Canonical biology bucket (e.g. aberrant kinase signaling, protein aggregation). Assigned by biology fill — drives MOA mapping and scoring." },
    { label: "MOA", key: "fill_moa" as const, color: "bg-cyan-500", tooltip: "Mechanism of action (e.g. kinase inhibition, immune checkpoint blockade). Key dossier field buyers use to evaluate portfolio fit." },
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

  const downloadCsv = async (path: string) => {
    const res = await fetch(path, {
      headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = path.split("/").pop()?.split("?")[0] ?? "export.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (qualityLoading) {
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
            <div className="text-[10px] text-muted-foreground/60 mt-0.5">same as Biotech Relevant above</div>
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
                    <div className={`text-xs font-medium ${t.textColor}`}>{t.label}</div>
                    <div className="text-[10px] text-muted-foreground/70">{t.range}</div>
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
                <div className="flex items-center gap-1">
                  <span className="text-xs font-medium text-foreground">{f.label}</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-muted-foreground/50 cursor-help text-[10px] leading-none">ⓘ</span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-56 text-xs">{f.tooltip}</TooltipContent>
                  </Tooltip>
                </div>
                <FillBar pct={g[f.key] !== undefined && g[f.key] !== null ? Number(g[f.key]) : null} color={f.color} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Breakdown by Dimension ── */}
      <DimensionBreakdown pw={pw} onFilterSelect={handleFilterSelect} />

      {/* ── Fill-Rate by Asset Class ── */}
      {quality && (
        <div className="border border-border rounded-xl bg-card overflow-hidden">
          <button
            className="w-full px-5 py-3 flex items-center justify-between bg-muted/20 hover:bg-muted/40 transition-colors text-left"
            onClick={() => setShowByClass(v => !v)}
            data-testid="button-toggle-by-class"
          >
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <FlaskConical className="h-4 w-4" />
              Fill-Rate by Asset Class
            </h3>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${showByClass ? "rotate-180" : ""}`} />
          </button>
          {showByClass && (
            <div className="overflow-x-auto border-t border-border">
              {byClass && byClass.length > 0 ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/10">
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Class</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Assets</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Avg Score</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Target %</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Modality %</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Indication %</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Stage %</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Sparse</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byClass.map(row => (
                      <tr key={row.asset_class} className="border-b border-border last:border-0 hover:bg-muted/20" data-testid={`row-class-${row.asset_class}`}>
                        <td className="px-4 py-2.5 text-xs font-medium text-foreground capitalize">{row.asset_class}</td>
                        <td className="px-4 py-2.5 text-xs tabular-nums text-right text-foreground">{row.count.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-xs tabular-nums text-right text-foreground">{row.avg_score ?? "—"}</td>
                        <td className="px-4 py-2.5 text-xs tabular-nums text-right text-foreground">{row.fill_target != null ? `${row.fill_target}%` : "—"}</td>
                        <td className="px-4 py-2.5 text-xs tabular-nums text-right text-foreground">{row.fill_modality != null ? `${row.fill_modality}%` : "—"}</td>
                        <td className="px-4 py-2.5 text-xs tabular-nums text-right text-foreground">{row.fill_indication != null ? `${row.fill_indication}%` : "—"}</td>
                        <td className="px-4 py-2.5 text-xs tabular-nums text-right text-foreground">{row.fill_stage != null ? `${row.fill_stage}%` : "—"}</td>
                        <td className="px-4 py-2.5 text-xs tabular-nums text-right text-amber-600 dark:text-amber-400">{row.sparse_count > 0 ? row.sparse_count : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="px-5 py-4 text-xs text-muted-foreground">No class data yet — run enrichment first to classify assets.</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Confidence Distribution + Save-Rate (Task #693) ── */}
      {quality && (
        <div className="border border-border rounded-xl bg-card overflow-hidden">
          <button
            className="w-full px-5 py-3 flex items-center justify-between bg-muted/20 hover:bg-muted/40 transition-colors text-left"
            onClick={() => setShowConfidence(v => !v)}
            data-testid="button-toggle-confidence"
          >
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Classifier Confidence × Save Rate
            </h3>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${showConfidence ? "rotate-180" : ""}`} />
          </button>
          {showConfidence && (
            <div className="border-t border-border px-5 py-4 space-y-5">
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-2">
                  Distribution of <code className="text-[10px]">category_confidence</code> across relevant assets
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2" data-testid="confidence-histogram">
                  {(confidenceDist?.histogram ?? []).map(row => {
                    const max = Math.max(1, ...(confidenceDist?.histogram ?? []).map(r => r.count));
                    const pct = Math.round((row.count / max) * 100);
                    return (
                      <div key={row.bucket} className="rounded-lg border border-border bg-background p-2 text-center" data-testid={`hist-bucket-${row.bucket}`}>
                        <div className="h-12 flex items-end justify-center mb-1">
                          <div className="w-6 rounded-t bg-primary/60" style={{ height: `${pct}%` }} />
                        </div>
                        <div className="text-xs font-bold tabular-nums text-foreground">{row.count.toLocaleString()}</div>
                        <div className="text-[10px] text-muted-foreground">{row.bucket}</div>
                        {row.avg_completeness != null && (
                          <div className="text-[10px] text-muted-foreground/70">avg {row.avg_completeness}</div>
                        )}
                      </div>
                    );
                  })}
                  {(!confidenceDist || confidenceDist.histogram.length === 0) && (
                    <div className="col-span-full text-xs text-muted-foreground">No confidence data — run classification first.</div>
                  )}
                </div>
              </div>

              <div>
                <div className="text-xs font-medium text-muted-foreground mb-2">
                  Save rate by confidence bucket — does the classifier predict what users actually save?
                </div>
                <table className="w-full text-sm" data-testid="confidence-save-rate">
                  <thead>
                    <tr className="border-b border-border bg-muted/10">
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Bucket</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Assets</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Saves</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Save Rate</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">&nbsp;</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(confidenceDist?.saveRate ?? []).map(row => {
                      const rate = row.save_rate_pct ?? 0;
                      const barW = Math.min(100, rate * 4); // amplify 0-25% range to fill bar
                      return (
                        <tr key={row.bucket} className="border-b border-border last:border-0" data-testid={`save-rate-${row.bucket}`}>
                          <td className="px-3 py-2 text-xs font-medium text-foreground">{row.bucket}</td>
                          <td className="px-3 py-2 text-xs tabular-nums text-right text-foreground">{row.asset_count.toLocaleString()}</td>
                          <td className="px-3 py-2 text-xs tabular-nums text-right text-foreground">{row.saved_asset_count.toLocaleString()}</td>
                          <td className="px-3 py-2 text-xs tabular-nums text-right text-foreground">{rate}%</td>
                          <td className="px-3 py-2 w-1/3">
                            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                              <div className="h-full rounded-full bg-emerald-500/70" style={{ width: `${barW}%` }} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {(!confidenceDist || confidenceDist.saveRate.length === 0) && (
                      <tr><td colSpan={5} className="px-3 py-3 text-xs text-muted-foreground">No save data yet.</td></tr>
                    )}
                  </tbody>
                </table>
                <p className="text-[10px] text-muted-foreground mt-2">
                  Higher save rate in higher-confidence buckets = the classifier is correctly identifying valuable assets.
                  Flat or inverted = ranker tuning needed.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

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
                    { key: "fill_biology" as const, label: "Biology %" },
                    { key: "fill_moa" as const, label: "MOA %" },
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
                        <td className="px-4 py-2.5 text-xs tabular-nums text-right text-foreground">{row.fill_biology !== null ? `${row.fill_biology}%` : "—"}</td>
                        <td className="px-4 py-2.5 text-xs tabular-nums text-right text-foreground">{row.fill_moa !== null ? `${row.fill_moa}%` : "—"}</td>
                        <td className="px-4 py-2.5 text-right">
                          <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="border-b border-border bg-muted/5">
                          <td colSpan={8} className="px-4 py-3">
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
          <ExportMenu
            label="CSV → Cloud"
            getContent={async () => {
              const res = await fetch(`/api/admin/export/full-relevant-csv`, {
                headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
              });
              if (!res.ok) throw new Error("Could not fetch CSV from server.");
              const blob = await res.blob();
              const buf = new Uint8Array(await blob.arrayBuffer());
              let binary = "";
              for (let i = 0; i < buf.length; i += 0x8000) {
                binary += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + 0x8000)));
              }
              return {
                content: btoa(binary),
                filename: `EdenRadar_Assets_${new Date().toISOString().slice(0, 10)}.csv`,
                fileType: "csv",
              };
            }}
          />
        </div>
      )}

    </div>
  );
}

function IndustryProjectsQueue({ pw }: { pw: string }) {

export { Enrichment };
