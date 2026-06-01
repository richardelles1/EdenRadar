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
import { EnrichmentPipelinePanel, Enrichment } from "./Enrichment";

interface DimRow {
  value: string;
  count: number;
  avg_completeness: number | null;
  fill_target: number | null;
  fill_indication: number | null;
  fill_biology: number | null;
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
  human_verified: Record<string, boolean> | null;
  enrichment_sources: Record<string, string> | null;
}

type AssetBrowserInit = { dim: "modality" | "stage" | "indication" | "biology" | "missing"; value: string } | null;

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

function DimensionBreakdown({ pw, onFilterSelect }: { pw: string; onFilterSelect: (dim: "modality" | "stage" | "indication" | "biology", value: string) => void }) {
  const [activeTab, setActiveTab] = useState<"modality" | "stage" | "indication" | "biology">("modality");
  const [sortKey, setSortKey] = useState<"count" | "avg_completeness" | "fill_target" | "fill_indication" | "fill_biology">("count");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const { data, isLoading } = useQuery<{ dim: string; rows: DimRow[] }>({
    queryKey: ["/api/admin/dataset-quality/dimensions", pw, activeTab],
    queryFn: async () => {
      const res = await fetch(`/api/admin/dataset-quality/dimensions?dim=${activeTab}`, { headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
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

  const exportCsv = async () => {
    const res = await fetch(`/api/admin/dataset-quality/dimensions/export?dim=${activeTab}`, {
      headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dataset-quality-${activeTab}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const tabs = [
    { key: "modality" as const, label: "Modality" },
    { key: "stage" as const, label: "Dev Stage" },
    { key: "indication" as const, label: "Indication" },
    { key: "biology" as const, label: "Biology" },
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
                  { key: "fill_biology" as const, label: "Biology %" },
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
                  <td className="px-4 py-2 text-xs tabular-nums text-right text-foreground">{row.fill_biology != null ? `${row.fill_biology}%` : "—"}</td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-xs text-muted-foreground">No data</td></tr>
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
  asset, editFields, setEditFields, liveScore, isPending, onSave, onCancel, pw: _pw, onVerifyField,
}: {
  asset: BrowsedAsset;
  editFields: Record<string, string>;
  setEditFields: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  liveScore: number;
  isPending: boolean;
  onSave: () => void;
  onCancel: () => void;
  pw: string;
  onVerifyField: (field: string, verified: boolean) => void;
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
        ] as { key: string; label: string }[]).map(f => {
          const src = asset.enrichment_sources?.[f.key];
          const isVerified = asset.human_verified?.[f.key] === true;
          return (
            <div key={f.key} className="space-y-1">
              <div className="flex items-center justify-between gap-1">
                <label className="text-xs font-medium text-muted-foreground">{f.label}</label>
                <div className="flex items-center gap-1">
                  {src && (
                    <span className={`text-[9px] px-1 py-0 rounded font-mono leading-4 ${
                      src === "deep" ? "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400"
                      : src === "mini" ? "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
                      : "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
                    }`} data-testid={`badge-source-${f.key}-${asset.id}`}>{src}</span>
                  )}
                  <button
                    onClick={() => onVerifyField(f.key, !isVerified)}
                    className={`p-0.5 rounded transition-colors ${isVerified ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground/40 hover:text-muted-foreground"}`}
                    title={isVerified ? "Verified — click to unlock" : "Mark as human-verified"}
                    data-testid={`button-verify-${f.key}-${asset.id}`}
                  >
                    {isVerified ? <ShieldCheck className="h-3 w-3" /> : <Shield className="h-3 w-3" />}
                  </button>
                </div>
              </div>
              <Input
                value={editFields[f.key] ?? ""}
                onChange={set(f.key)}
                className={`h-7 text-xs ${isVerified ? "border-emerald-400/50 dark:border-emerald-600/40" : ""}`}
                data-testid={`input-edit-${f.key}-${asset.id}`}
              />
            </div>
          );
        })}
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
  const [biology, setBiology] = useState("");
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
    if (initialFilter.dim === "modality") { setModality(initialFilter.value); setStage(""); setIndication(""); setBiology(""); setMissing(""); }
    else if (initialFilter.dim === "stage") { setStage(initialFilter.value); setModality(""); setIndication(""); setBiology(""); setMissing(""); }
    else if (initialFilter.dim === "indication") { setIndication(initialFilter.value); setModality(""); setStage(""); setBiology(""); setMissing(""); }
    else if (initialFilter.dim === "biology") { setBiology(initialFilter.value); setModality(""); setStage(""); setIndication(""); setMissing(""); }
    else if (initialFilter.dim === "missing") { setMissing(initialFilter.value); setModality(""); setStage(""); setIndication(""); setBiology(""); }
    setPage(1);
    setExpandedId(null);
  }, [initialFilter]);

  const filterValues = useQuery<{ modalities: string[]; stages: string[] }>({
    queryKey: ["/api/admin/assets/filter-values", pw],
    queryFn: async () => {
      const res = await fetch("/api/admin/assets/filter-values", { headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
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
    if (biology) p.biology = biology;
    if (tier) p.tier = tier;
    if (missing) p.missing = missing;
    if (q) p.q = q;
    return new URLSearchParams({ ...p, ...extra }).toString();
  };

  const { data, isLoading } = useQuery<{ total: number; globalTotal: number; page: number; limit: number; assets: BrowsedAsset[] }>({
    queryKey: ["/api/admin/assets", pw, institution, modality, stage, indication, biology, tier, missing, q, page, sort, dir],
    queryFn: async () => {
      const params = buildParams({ page: String(page), limit: "50", sort, dir });
      const res = await fetch(`/api/admin/assets?${params}`, { headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  useEffect(() => {
    if (data?.assets) setLocalAssets(data.assets);
  }, [data?.assets]);

  const patchAsset = useMutation({
    mutationFn: async ({ id, fields }: { id: number; fields: Record<string, string> }) => {
      const res = await fetch(`/api/admin/assets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
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

  const verifyField = useMutation({
    mutationFn: async ({ id, field, verified }: { id: number; field: string; verified: boolean }) => {
      const res = await fetch(`/api/admin/assets/${id}/verify-field`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
        body: JSON.stringify({ field, verified }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Verify failed"); }
      return { id, field, verified };
    },
    onSuccess: ({ id, field, verified }) => {
      setLocalAssets(prev => prev.map(a => {
        if (a.id !== id) return a;
        return { ...a, human_verified: { ...(a.human_verified ?? {}), [field]: verified } };
      }));
    },
    onError: (err: Error) => toast({ title: "Verify failed", description: err.message, variant: "destructive" }),
  });

  const activeFilters = [institution, modality, stage, indication, biology, tier, missing, q].filter(Boolean).length;
  const total = data?.total ?? 0;
  const globalTotal = data?.globalTotal ?? 0;
  const totalPages = Math.ceil(total / 50);

  const clearFilters = () => {
    setInstitution(""); setModality(""); setStage(""); setIndication(""); setBiology("");
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
            <SelectItem value="excellent">Investment Ready (80+)</SelectItem>
            <SelectItem value="good">Reviewable (60-79)</SelectItem>
            <SelectItem value="partial">Developing (40-59)</SelectItem>
            <SelectItem value="poor">Thin (1-39)</SelectItem>
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
            <SelectItem value="capped">Gave up (≥3 attempts)</SelectItem>
          </SelectContent>
        </Select>
        {biology && (
          <button
            onClick={() => { setBiology(""); setPage(1); }}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 border border-teal-300 dark:border-teal-700 hover:bg-teal-200 dark:hover:bg-teal-900/70 transition-colors"
            data-testid="chip-biology-filter"
          >
            Biology: {biology} <X className="h-2.5 w-2.5" />
          </button>
        )}
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
                            pw={pw}
                            onVerifyField={(field, verified) => verifyField.mutate({ id: asset.id, field, verified })}
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

function PotentialDuplicates({ pw }: { pw: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<{ candidates: any[]; total: number }>({
    queryKey: ["/api/admin/duplicate-candidates", pw],
    queryFn: () =>
      fetch(`/api/admin/duplicate-candidates`, {
        headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
      }).then((r) => r.json()),
  });

  const { data: edenStats } = useQuery<{ embeddingCoverage?: { totalEmbedded: number; totalRelevant: number } }>({
    queryKey: ["/api/admin/eden/stats", pw],
    queryFn: async () => {
      const res = await fetch("/api/admin/eden/stats", { headers: pw ? { Authorization: `Bearer ${pw}` } : {} });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 30_000,
  });
  const embPct = edenStats?.embeddingCoverage?.totalRelevant
    ? Math.round((edenStats.embeddingCoverage.totalEmbedded / edenStats.embeddingCoverage.totalRelevant) * 100)
    : null;

  const runDetectionMutation = useMutation({
    mutationFn: () =>
      fetch(`/api/admin/duplicate-detection/run`, {
        method: "POST",
        headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
      }).then((r) => r.json()),
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
      fetch(`/api/admin/duplicate-candidates/${id}/dismiss`, {
        method: "POST",
        headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
      }).then((r) => r.json()),
    onSuccess: () => {
      toast({ title: "Dismissed" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/duplicate-candidates", pw] });
    },
    onError: () => toast({ title: "Failed to dismiss", variant: "destructive" }),
  });

  const dismissAllMutation = useMutation({
    mutationFn: (institution?: string) =>
      fetch(`/api/admin/duplicate-candidates/dismiss-all`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(pw ? { Authorization: `Bearer ${pw}` } : {}) },
        body: JSON.stringify(institution ? { institution } : {}),
      }).then((r) => r.json()),
    onSuccess: (result, institution) => {
      toast({ title: `Dismissed ${result.dismissed} duplicate${result.dismissed === 1 ? "" : "s"}${institution ? ` from ${institution}` : ""}` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/duplicate-candidates", pw] });
    },
    onError: () => toast({ title: "Bulk dismiss failed", variant: "destructive" }),
  });

  const candidates = data?.candidates ?? [];
  const institutionCounts = candidates.reduce<Record<string, number>>((acc, c) => {
    const inst = c.institution ?? "Unknown";
    acc[inst] = (acc[inst] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="bg-card border border-border rounded-xl p-6 mt-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-foreground">Potential Duplicates</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Semantic near-duplicates detected via embedding similarity (threshold: 92%). Run scan to update.
          </p>
          {embPct !== null && (
            <div className={`mt-2 flex items-center gap-1.5 text-xs ${embPct < 90 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
              <span className={`h-1.5 w-1.5 rounded-full inline-block ${embPct < 90 ? "bg-amber-400" : "bg-emerald-500"}`} />
              {embPct}% embedded
              {embPct < 90 && <span className="text-muted-foreground ml-1">— scan results are partial until ≥90%</span>}
            </div>
          )}
        </div>
        <button
          data-testid="button-run-dedup-scan"
          onClick={() => runDetectionMutation.mutate()}
          disabled={runDetectionMutation.isPending || (embPct !== null && embPct < 90)}
          className="px-3 py-1.5 text-xs bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-medium disabled:opacity-50 transition-colors"
        >
          {runDetectionMutation.isPending ? "Scanning..." : (embPct !== null && embPct < 90) ? `Run Scan (${embPct}% embedded)` : "Run Scan"}
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
          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">{candidates.length} flagged asset(s). Dismiss to keep both records.</span>
            <div className="flex items-center gap-2 flex-wrap">
              {Object.entries(institutionCounts).sort((a, b) => b[1] - a[1]).map(([inst, count]) => (
                <button
                  key={inst}
                  onClick={() => {
                    if (window.confirm(`Dismiss all ${count} duplicate(s) from "${inst}"?`)) {
                      dismissAllMutation.mutate(inst);
                    }
                  }}
                  disabled={dismissAllMutation.isPending}
                  className="text-xs px-2 py-1 rounded-md border border-border bg-muted/40 hover:bg-muted/70 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                  data-testid={`button-dismiss-all-${inst.replace(/\s+/g, "-").toLowerCase()}`}
                >
                  Dismiss all {inst} ({count})
                </button>
              ))}
              {candidates.length > 1 && (
                <button
                  onClick={() => {
                    if (window.confirm(`Dismiss all ${candidates.length} duplicate candidates?`)) {
                      dismissAllMutation.mutate(undefined);
                    }
                  }}
                  disabled={dismissAllMutation.isPending}
                  className="text-xs px-2 py-1 rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/40 transition-colors disabled:opacity-50"
                  data-testid="button-dismiss-all"
                >
                  Dismiss all ({candidates.length})
                </button>
              )}
            </div>
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

function DataQualityTab({ pw }: { pw: string }) {
  const [gaveUpTrigger, setGaveUpTrigger] = useState(0);
  const [qualityReportOpen, setQualityReportOpen] = useState(true);
  return (
    <div className="space-y-6" data-testid="data-quality-tab">
      {/* Quality Report first — operator needs ground truth before acting on controls */}
      <div className="border border-border rounded-xl bg-card overflow-hidden" data-testid="quality-report-panel">
        <button
          onClick={() => setQualityReportOpen(o => !o)}
          className="w-full px-5 py-3 bg-muted/20 border-b border-border flex items-center gap-3 hover:bg-muted/30 transition-colors text-left"
          data-testid="button-toggle-quality-report"
        >
          <BarChart3 className="h-4 w-4 text-blue-500 shrink-0" />
          <span className="text-sm font-semibold text-foreground">Quality Report</span>
          <span className="text-xs text-muted-foreground ml-1">Field fill rates · Tiers · Institution breakdown</span>
          <ChevronDown className={`h-3.5 w-3.5 ml-auto text-muted-foreground transition-transform duration-200 ${qualityReportOpen ? "rotate-180" : ""}`} />
        </button>
        {qualityReportOpen && <Enrichment pw={pw} initialGaveUpFilter={gaveUpTrigger} />}
      </div>
      <EnrichmentPipelinePanel pw={pw} onGaveUpClick={() => { setGaveUpTrigger(v => v + 1); setQualityReportOpen(true); }} />
      <PotentialDuplicates pw={pw} />
      <CollapsibleRelevancePanel pw={pw} />
    </div>
  );
}

// ─── Relevance Panel (Task #694) ────────────────────────────────────────────
type RelevanceEvalStats = { tp: number; fp: number; tn: number; fn: number; precision: number; recall: number; f1: number };
type RelevanceEvalResp = {
  holdoutSize: number;
  threshold: number;
  activeThreshold: number;
  currentVariant: "v1_keyword" | "v2_classifier";
  v1: RelevanceEvalStats | null;
  v2: RelevanceEvalStats | null;
  current: RelevanceEvalStats | null;
  sweep: Array<{ threshold: number } & RelevanceEvalStats>;
  bestThreshold: { threshold: number; f1: number } | null;
};
type RelevanceMetricsResp = {
  rows: Array<{ id: number; computedAt: string; periodDays: number; dimension: string; dimensionValue: string; shownCount: number; saveCount: number; dismissCount: number; viewCount: number; saveRate: number | null; dismissRate: number | null }>;
  lastComputedAt: string | null;
};

function fmtPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

function CollapsibleRelevancePanel({ pw }: { pw: string }) {
  const [open, setOpen] = useState(false);
  const evalQ = useQuery<{ holdoutSize: number }>({
    queryKey: ["/api/admin/relevance/eval", pw],
    queryFn: async () => {
      const r = await fetch("/api/admin/relevance/eval", { headers: pw ? { Authorization: `Bearer ${pw}` } : {} });
      if (!r.ok) throw new Error("Eval failed");
      return r.json();
    },
    staleTime: 5 * 60 * 1000,
  });
  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden" data-testid="collapsible-relevance-panel">
      <button
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-muted/40 transition-colors"
        onClick={() => setOpen(v => !v)}
        data-testid="button-toggle-relevance"
      >
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">Feedback-Driven Relevance</span>
          <span className="text-xs text-muted-foreground">Model tuning · holdout eval</span>
          {evalQ.data?.holdoutSize === 0 && (
            <span className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-2 py-0.5">No holdout</span>
          )}
        </div>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${open ? "" : "-rotate-90"}`} />
      </button>
      {open && (
        <div className="border-t border-border">
          <RelevancePanel pw={pw} />
        </div>
      )}
    </div>
  );
}

function RelevancePanel({ pw }: { pw: string }) {
  const { toast } = useToast();
  const authHeaders: Record<string, string> = pw ? { Authorization: `Bearer ${pw}` } : {};

  const evalQ = useQuery<RelevanceEvalResp>({
    queryKey: ["/api/admin/relevance/eval", pw],
    queryFn: async () => {
      const r = await fetch("/api/admin/relevance/eval", { headers: authHeaders });
      if (!r.ok) throw new Error("Eval failed");
      return r.json();
    },
  });

  const metricsQ = useQuery<RelevanceMetricsResp>({
    queryKey: ["/api/admin/relevance/metrics", pw],
    queryFn: async () => {
      const r = await fetch("/api/admin/relevance/metrics", { headers: authHeaders });
      if (!r.ok) throw new Error("Metrics failed");
      return r.json();
    },
  });

  type BuildResp = {
    inserted: number;
    stats?: { total?: number };
    evalSize?: number;
    trainSize?: number;
  };
  const buildHoldout = useMutation<BuildResp, Error, void>({
    mutationFn: async () => {
      const r = await fetch("/api/admin/relevance/holdout/build", { method: "POST", headers: authHeaders });
      if (!r.ok) throw new Error("Build failed");
      return (await r.json()) as BuildResp;
    },
    onSuccess: (data) => {
      toast({
        title: "Holdout built",
        description: `Total ${data?.stats?.total ?? "?"} rows (+${data?.inserted ?? 0} new) · eval ${data?.evalSize ?? "?"} / train ${data?.trainSize ?? "?"}`,
      });
      evalQ.refetch();
    },
    onError: (e) => toast({ title: "Build failed", description: e.message, variant: "destructive" }),
  });

  type RefreshResp = { inserted: number };
  const refreshMetrics = useMutation<RefreshResp, Error, void>({
    mutationFn: async () => {
      const r = await fetch("/api/admin/relevance/metrics/refresh", { method: "POST", headers: authHeaders });
      if (!r.ok) throw new Error("Refresh failed");
      return (await r.json()) as RefreshResp;
    },
    onSuccess: (data) => {
      toast({ title: "Metrics refreshed", description: `${data?.inserted ?? 0} rows snapshotted` });
      metricsQ.refetch();
    },
    onError: (e) => toast({ title: "Refresh failed", description: e.message, variant: "destructive" }),
  });

  type TuneResp = { tuned: { threshold: number; f1: number }; holdoutSize: number };
  const tuneThreshold = useMutation<TuneResp, Error, void>({
    mutationFn: async () => {
      const r = await fetch("/api/admin/relevance/threshold/tune", { method: "POST", headers: authHeaders });
      if (!r.ok) throw new Error("Tune failed");
      return (await r.json()) as TuneResp;
    },
    onSuccess: (data) => {
      toast({ title: "Threshold tuned", description: `t=${data.tuned.threshold.toFixed(2)} · F1=${(data.tuned.f1 * 100).toFixed(1)}%` });
      evalQ.refetch();
    },
    onError: (e) => toast({ title: "Tune failed", description: e.message, variant: "destructive" }),
  });

  type TuneWeightsResp = {
    persisted: boolean;
    improvedF1: boolean;
    fitted: { threshold: number; eval: { f1: number; precision: number; recall: number } };
    baseline: { threshold: number; eval: { f1: number } };
    trainSize: number;
    evalSize: number;
  };
  const tuneWeights = useMutation<TuneWeightsResp, Error, void>({
    mutationFn: async () => {
      const r = await fetch("/api/admin/relevance/weights/tune", { method: "POST", headers: authHeaders });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error || "Tune weights failed");
      }
      return (await r.json()) as TuneWeightsResp;
    },
    onSuccess: (d) => {
      const fF1 = (d.fitted.eval.f1 * 100).toFixed(1);
      const bF1 = (d.baseline.eval.f1 * 100).toFixed(1);
      const verb = d.persisted ? "Persisted" : "Skipped";
      toast({
        title: `${verb} weight tune`,
        description: `Fitted F1 ${fF1}% vs baseline ${bF1}% @ t=${d.fitted.threshold.toFixed(2)} (train=${d.trainSize}, eval=${d.evalSize})`,
      });
      evalQ.refetch();
    },
    onError: (e) => toast({ title: "Tune weights failed", description: e.message, variant: "destructive" }),
  });

  const ev = evalQ.data;
  const m = metricsQ.data;
  const overallRow = m?.rows.find((r) => r.dimension === "overall");
  const sourceRows = (m?.rows ?? []).filter((r) => r.dimension === "source").slice(0, 12);
  const classRows = (m?.rows ?? []).filter((r) => r.dimension === "asset_class").slice(0, 12);
  const bucketRows = (m?.rows ?? []).filter((r) => r.dimension === "score_bucket");

  const renderStats = (s: RelevanceEvalStats | null | undefined, label: string) => (
    <div className="border border-border rounded-lg p-3 bg-muted/10" data-testid={`relevance-stats-${label.toLowerCase()}`}>
      <div className="text-xs font-semibold text-foreground mb-2">{label}</div>
      {!s ? <div className="text-xs text-muted-foreground">No holdout yet</div> : (
        <>
          <div className="grid grid-cols-3 gap-2 text-xs mb-2">
            <div><span className="text-muted-foreground">Precision</span><div className="font-semibold tabular-nums" data-testid={`stat-precision-${label.toLowerCase()}`}>{fmtPct(s.precision)}</div></div>
            <div><span className="text-muted-foreground">Recall</span><div className="font-semibold tabular-nums" data-testid={`stat-recall-${label.toLowerCase()}`}>{fmtPct(s.recall)}</div></div>
            <div><span className="text-muted-foreground">F1</span><div className="font-semibold tabular-nums" data-testid={`stat-f1-${label.toLowerCase()}`}>{fmtPct(s.f1)}</div></div>
          </div>
          <div className="grid grid-cols-2 gap-1 text-[10px] text-muted-foreground">
            <div className="bg-emerald-50 dark:bg-emerald-950/30 px-2 py-1 rounded">TP <span className="font-semibold text-emerald-700 dark:text-emerald-300">{s.tp}</span></div>
            <div className="bg-rose-50 dark:bg-rose-950/30 px-2 py-1 rounded">FP <span className="font-semibold text-rose-700 dark:text-rose-300">{s.fp}</span></div>
            <div className="bg-rose-50 dark:bg-rose-950/30 px-2 py-1 rounded">FN <span className="font-semibold text-rose-700 dark:text-rose-300">{s.fn}</span></div>
            <div className="bg-zinc-100 dark:bg-zinc-800/40 px-2 py-1 rounded">TN <span className="font-semibold">{s.tn}</span></div>
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="bg-card rounded-xl border border-border p-5 space-y-5" data-testid="relevance-panel">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" /> Feedback-Driven Relevance
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">Compare keyword pre-filter (v1) vs calibrated classifier (v2). Holdout built from human-verified flags + save/dismiss signals.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => buildHoldout.mutate()} disabled={buildHoldout.isPending} data-testid="button-build-holdout">
            {buildHoldout.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Build holdout"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => refreshMetrics.mutate()} disabled={refreshMetrics.isPending} data-testid="button-refresh-metrics">
            {refreshMetrics.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Refresh metrics"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => tuneThreshold.mutate()} disabled={tuneThreshold.isPending} data-testid="button-tune-threshold">
            {tuneThreshold.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Tune threshold"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => tuneWeights.mutate()} disabled={tuneWeights.isPending} data-testid="button-tune-weights">
            {tuneWeights.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Tune weights"}
          </Button>
        </div>
      </div>

      <div>
        <div className="text-xs text-muted-foreground mb-2 flex flex-wrap gap-x-3 gap-y-1">
          <span>Eval holdout size: <span className="font-semibold text-foreground" data-testid="holdout-size">{ev?.holdoutSize ?? "—"}</span></span>
          {ev?.activeThreshold != null && <span>Active threshold: <span className="font-semibold text-foreground" data-testid="active-threshold">{ev.activeThreshold.toFixed(2)}</span></span>}
          {ev?.currentVariant && <span>Current pipeline: <span className="font-semibold text-foreground" data-testid="current-variant">{ev.currentVariant}</span></span>}
          {ev?.bestThreshold && <span>Best (sweep) F1 @ <span className="font-semibold text-foreground" data-testid="best-threshold">{ev.bestThreshold.threshold.toFixed(2)}</span></span>}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {renderStats(ev?.v1, "v1 keyword")}
          {renderStats(ev?.v2, "v2 classifier")}
          {renderStats(ev?.current, "Current pipeline")}
        </div>
      </div>

      {ev?.sweep && ev.sweep.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-foreground mb-2">Threshold sweep (v2)</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr><th className="text-left py-1 px-2">Threshold</th><th className="text-right">Precision</th><th className="text-right">Recall</th><th className="text-right">F1</th><th className="text-right">TP</th><th className="text-right">FP</th><th className="text-right">FN</th></tr>
              </thead>
              <tbody>
                {ev.sweep.map((s) => (
                  <tr key={s.threshold} className="border-t border-border tabular-nums" data-testid={`sweep-row-${s.threshold}`}>
                    <td className="py-1 px-2">{s.threshold.toFixed(2)}</td>
                    <td className="text-right">{fmtPct(s.precision)}</td>
                    <td className="text-right">{fmtPct(s.recall)}</td>
                    <td className="text-right font-semibold">{fmtPct(s.f1)}</td>
                    <td className="text-right">{s.tp}</td>
                    <td className="text-right text-rose-600">{s.fp}</td>
                    <td className="text-right text-rose-600">{s.fn}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div>
        <div className="text-xs font-semibold text-foreground mb-2">Save / Dismiss rates (last snapshot{m?.lastComputedAt ? `: ${new Date(m.lastComputedAt).toLocaleString()}` : ""})</div>
        {!overallRow && (m?.rows.length ?? 0) === 0 ? (
          <div className="text-xs text-muted-foreground">No metrics yet — click Refresh metrics.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="border border-border rounded-lg p-3 bg-muted/10">
              <div className="text-xs font-semibold text-foreground mb-1">Overall (7d)</div>
              {overallRow ? (
                <div className="text-xs space-y-1">
                  <div>Saves: <span className="font-semibold tabular-nums">{overallRow.saveCount}</span></div>
                  <div>Dismisses: <span className="font-semibold tabular-nums">{overallRow.dismissCount}</span></div>
                  <div>Save rate: <span className="font-semibold tabular-nums">{fmtPct(overallRow.saveRate)}</span></div>
                </div>
              ) : <div className="text-xs text-muted-foreground">No overall snapshot</div>}
            </div>
            <div className="border border-border rounded-lg p-3 bg-muted/10">
              <div className="text-xs font-semibold text-foreground mb-2">By source</div>
              <div className="space-y-1 text-xs">
                {sourceRows.length === 0 && <div className="text-muted-foreground">—</div>}
                {sourceRows.map((r) => (
                  <div key={r.id} className="flex justify-between gap-2 tabular-nums">
                    <span className="truncate">{r.dimensionValue}</span>
                    <span className="text-muted-foreground">{r.saveCount}/{r.dismissCount} · {fmtPct(r.saveRate)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="border border-border rounded-lg p-3 bg-muted/10">
              <div className="text-xs font-semibold text-foreground mb-2">By asset class</div>
              <div className="space-y-1 text-xs">
                {classRows.length === 0 && <div className="text-muted-foreground">—</div>}
                {classRows.map((r) => (
                  <div key={r.id} className="flex justify-between gap-2 tabular-nums">
                    <span className="truncate">{r.dimensionValue}</span>
                    <span className="text-muted-foreground">{r.saveCount}/{r.dismissCount} · {fmtPct(r.saveRate)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        {bucketRows.length > 0 && (
          <div className="mt-3 border border-border rounded-lg p-3 bg-muted/10" data-testid="score-bucket-row">
            <div className="text-xs font-semibold text-foreground mb-2">By scoring confidence bucket (categoryConfidence)</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              {bucketRows.map((r) => (
                <div key={r.id} className="border border-border rounded px-2 py-1">
                  <div className="font-semibold capitalize">{r.dimensionValue}</div>
                  <div className="text-muted-foreground tabular-nums">{r.saveCount}/{r.dismissCount} · {fmtPct(r.saveRate)}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export { DataQualityTab, DimensionBreakdown, AssetBrowser, AssetEditorPanel };
export type { AssetBrowserInit };
