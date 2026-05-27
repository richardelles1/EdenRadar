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

// ── JARVIS ────────────────────────────────────────────────────────────────────

interface DatasetQuality {
  total_relevant: number;
  scored_count: number;
  avg_score: string;
  tier_excellent: number;
  tier_good: number;
  tier_partial: number;
  tier_poor: number;
  tier_unscored: number;
  fill_moa: string;
  fill_indication: string;
  fill_modality: string;
  fill_stage: string;
  fill_biology: string;
  fill_patent: string;
  added_7d: number;
  added_30d: number;
}

function JarvisTab({ pw }: { pw: string }) {
  const { toast } = useToast();

  const healthQ = useQuery<{ global: DatasetQuality }>({
    queryKey: ["/api/admin/dataset-quality", "jarvis"],
    queryFn: async () => {
      const res = await fetch("/api/admin/dataset-quality", { headers: { Authorization: `Bearer ${pw}` } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 60_000,
    enabled: !!pw,
  });

  const g = healthQ.data?.global;

  // Pipeline shortcut mutations
  const sweepMut = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/ingest/scheduler/daily-sweep", { method: "POST", headers: { Authorization: `Bearer ${pw}` } });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      return json;
    },
    onSuccess: (data) => toast({ title: "Daily Sweep started", description: data.message ?? "" }),
    onError: (err: Error) => toast({ title: "Daily Sweep failed", description: err.message, variant: "destructive" }),
  });
  const stalenessMut = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/ingest/scheduler/stale-first", { method: "POST", headers: { Authorization: `Bearer ${pw}` } });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      return json;
    },
    onSuccess: (data) => toast({ title: "Staleness Scan started", description: data.message ?? "" }),
    onError: (err: Error) => toast({ title: "Staleness Scan failed", description: err.message, variant: "destructive" }),
  });
  const enrichMut = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/eden/enrich", { method: "POST", headers: { Authorization: `Bearer ${pw}` } });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      return json;
    },
    onSuccess: (data) => toast({ title: "Deep Enrich started", description: data.message ?? "" }),
    onError: (err: Error) => toast({ title: "Deep Enrich failed", description: err.message, variant: "destructive" }),
  });
  const usptoMut = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/enrichment/uspto/run", { method: "POST", headers: { Authorization: `Bearer ${pw}` } });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      return json;
    },
    onSuccess: (data) => toast({ title: "USPTO Cross-ref started", description: data.message ?? "" }),
    onError: (err: Error) => toast({ title: "USPTO Cross-ref failed", description: err.message, variant: "destructive" }),
  });
  const ruleFillMut = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/enrichment/rule-fill", { method: "POST", headers: { Authorization: `Bearer ${pw}` } });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      return json;
    },
    onSuccess: () => toast({ title: "Rule Fill started", description: "Filling fields via regex rules — no AI cost" }),
    onError: (err: Error) => toast({ title: "Rule Fill failed", description: err.message, variant: "destructive" }),
  });

  // SQL pad
  const [sql, setSql] = useState("SELECT id, asset_name, institution, completeness_score\nFROM ingested_assets\nWHERE relevant = true\nORDER BY completeness_score DESC NULLS LAST\nLIMIT 20");
  const [sqlResult, setSqlResult] = useState<{ rows: Record<string, unknown>[]; rowCount: number } | null>(null);
  const [sqlError, setSqlError] = useState<string | null>(null);
  const [sqlRunning, setSqlRunning] = useState(false);

  async function runSql() {
    setSqlRunning(true);
    setSqlError(null);
    setSqlResult(null);
    try {
      const res = await fetch("/api/admin/jarvis/sql", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${pw}` },
        body: JSON.stringify({ query: sql }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Query failed");
      setSqlResult(json);
    } catch (err: any) {
      setSqlError(err.message);
    } finally {
      setSqlRunning(false);
    }
  }

  const tier = (n?: number) => (n ?? 0).toLocaleString();
  const pct = (s?: string) => s ? `${s}%` : "—";

  const shortcuts: { label: string; desc: string; mut: { mutate: () => void; isPending: boolean }; color: string }[] = [
    { label: "Daily Sweep",    desc: "Full staleness-ordered institution sweep",  mut: sweepMut,     color: "border-emerald-700 hover:bg-emerald-950 text-emerald-400" },
    { label: "Staleness Scan", desc: "Oldest-synced institutions first",           mut: stalenessMut, color: "border-sky-700 hover:bg-sky-950 text-sky-400" },
    { label: "Rule Fill",      desc: "Regex rules for MoA, target, indication — free",  mut: ruleFillMut,  color: "border-teal-700 hover:bg-teal-950 text-teal-400" },
    { label: "Deep Enrich",    desc: "Run gpt-4o enrichment on Bucket A queue",   mut: enrichMut,    color: "border-violet-700 hover:bg-violet-950 text-violet-400" },
    { label: "USPTO Cross-ref",desc: "Fill IP fields from patent database",        mut: usptoMut,     color: "border-amber-700 hover:bg-amber-950 text-amber-400" },
  ];

  const cols = sqlResult && sqlResult.rows.length > 0 ? Object.keys(sqlResult.rows[0]) : [];

  return (
    <div className="space-y-6 font-mono">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
            <span className="text-emerald-500">◈</span> JARVIS
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5 font-sans">EdenRadar operator terminal — Intelligence &amp; Control</p>
        </div>
        <span className="text-[10px] uppercase tracking-widest text-emerald-500 border border-emerald-800 px-2 py-1 rounded bg-emerald-950/40">
          ONLINE
        </span>
      </div>

      {/* Corpus Health */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-5 space-y-4">
        <p className="text-[10px] uppercase tracking-widest text-zinc-500">Corpus Health</p>
        {healthQ.isLoading ? (
          <div className="flex items-center gap-2 text-zinc-600 text-xs"><Loader2 className="h-3 w-3 animate-spin" /> Loading...</div>
        ) : g ? (
          <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
            {/* Totals */}
            <div className="space-y-1">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Total Assets</p>
              <p className="text-2xl font-bold text-emerald-400">{(g.total_relevant ?? 0).toLocaleString()}</p>
              <p className="text-[10px] text-zinc-600">+{g.added_7d} this week · +{g.added_30d} this month</p>
            </div>
            {/* Avg completeness */}
            <div className="space-y-1">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Avg Completeness</p>
              <p className="text-2xl font-bold text-emerald-400">{g.avg_score ?? "—"}</p>
              <p className="text-[10px] text-zinc-600">{tier(g.scored_count)} scored</p>
            </div>
            {/* Tiers */}
            <div className="space-y-1 col-span-2">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Completeness Tiers</p>
              <div className="grid grid-cols-4 gap-2 text-center">
                {[
                  { label: "80+", val: g.tier_excellent, color: "text-emerald-400" },
                  { label: "60–80", val: g.tier_good, color: "text-sky-400" },
                  { label: "40–60", val: g.tier_partial, color: "text-amber-400" },
                  { label: "Unscored", val: g.tier_unscored, color: "text-zinc-500" },
                ].map(t => (
                  <div key={t.label} className="rounded border border-zinc-800 bg-zinc-900 p-2">
                    <p className={`text-lg font-bold ${t.color}`}>{tier(t.val)}</p>
                    <p className="text-[10px] text-zinc-600">{t.label}</p>
                  </div>
                ))}
              </div>
            </div>
            {/* Fill rates */}
            <div className="col-span-2 lg:col-span-4">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Field Fill Rates</p>
              <div className="flex flex-wrap gap-3">
                {[
                  { label: "MOA", val: g.fill_moa },
                  { label: "Indication", val: g.fill_indication },
                  { label: "Modality", val: g.fill_modality },
                  { label: "Stage", val: g.fill_stage },
                  { label: "Biology", val: g.fill_biology },
                  { label: "IP", val: g.fill_patent },
                ].map(f => (
                  <div key={f.label} className="flex items-center gap-1.5 text-xs">
                    <span className="text-zinc-500">{f.label}</span>
                    <span className={`font-bold ${parseFloat(f.val ?? "0") >= 80 ? "text-emerald-400" : parseFloat(f.val ?? "0") >= 50 ? "text-amber-400" : "text-red-400"}`}>
                      {pct(f.val)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-zinc-600">No data</p>
        )}
      </div>

      {/* Pipeline Shortcuts */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-5 space-y-3">
        <p className="text-[10px] uppercase tracking-widest text-zinc-500">Pipeline Shortcuts</p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {shortcuts.map(s => (
            <button
              key={s.label}
              onClick={() => s.mut.mutate()}
              disabled={s.mut.isPending}
              className={`rounded-lg border bg-zinc-900 px-4 py-3 text-left transition-colors disabled:opacity-50 ${s.color}`}
            >
              <div className="flex items-center gap-2 mb-1">
                {s.mut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                <span className="text-xs font-semibold">{s.label}</span>
              </div>
              <p className="text-[10px] text-zinc-600 font-sans leading-tight">{s.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* The Librarian */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-violet-500" />
            <p className="text-sm font-semibold text-zinc-300">The Librarian</p>
          </div>
          <span className="text-[10px] uppercase tracking-widest text-zinc-600 border border-zinc-800 px-2 py-0.5 rounded">
            PENDING DEPLOYMENT
          </span>
        </div>
        <div className="rounded-lg border border-dashed border-zinc-800 bg-zinc-900/50 p-8 text-center space-y-2">
          <div className="flex justify-center gap-1 mb-3">
            {Array.from({ length: 24 }).map((_, i) => (
              <div key={i} className="w-1 rounded-full bg-zinc-800" style={{ height: `${8 + Math.sin(i * 0.8) * 6}px` }} />
            ))}
          </div>
          <p className="text-xs text-zinc-600 font-sans">Agent interface wiring in progress.</p>
          <p className="text-[10px] text-zinc-700 font-sans">Natural language corpus control · Enrichment decisions · Completeness audits</p>
        </div>
      </div>

      {/* SQL Pad */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">SQL Pad</p>
          <span className="text-[10px] text-zinc-700">read-only · SELECT only</span>
        </div>
        <Textarea
          value={sql}
          onChange={e => setSql(e.target.value)}
          rows={5}
          className="font-mono text-xs bg-zinc-900 border-zinc-700 text-emerald-300 placeholder:text-zinc-700 resize-y"
          spellCheck={false}
        />
        <div className="flex items-center gap-3">
          <button
            onClick={runSql}
            disabled={sqlRunning || !sql.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-950 border border-emerald-800 text-emerald-400 text-xs font-semibold hover:bg-emerald-900 transition-colors disabled:opacity-50"
          >
            {sqlRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <PlayCircle className="h-3 w-3" />}
            Run
          </button>
          {sqlResult && <span className="text-[10px] text-zinc-600">{sqlResult.rowCount} row{sqlResult.rowCount !== 1 ? "s" : ""}</span>}
          {sqlError && <span className="text-[10px] text-red-500">{sqlError}</span>}
        </div>
        {sqlResult && sqlResult.rows.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-zinc-800">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900">
                  {cols.map(c => (
                    <th key={c} className="px-3 py-2 text-left text-zinc-500 uppercase tracking-wider text-[10px] whitespace-nowrap">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sqlResult.rows.map((row, i) => (
                  <tr key={i} className={`border-b border-zinc-900 ${i % 2 === 0 ? "bg-zinc-950" : "bg-zinc-900/50"}`}>
                    {cols.map(c => (
                      <td key={c} className="px-3 py-1.5 text-zinc-300 whitespace-nowrap max-w-[300px] truncate">
                        {row[c] == null ? <span className="text-zinc-700">null</span> : String(row[c])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}


export { JarvisTab };
