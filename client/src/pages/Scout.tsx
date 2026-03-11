import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { INSTITUTIONS } from "@/lib/institutions";
import { SearchBar } from "@/components/SearchBar";
import { SearchResults } from "@/components/SearchResults";
import { SavedAssetsPanel } from "@/components/SavedAssetsPanel";
import { BuyerProfileForm } from "@/components/BuyerProfileForm";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { FileBarChart2, Loader2, Globe, RefreshCw, CheckCircle2, AlertCircle, XCircle, Building2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import type { IngestionRun } from "@shared/schema";
import type { SavedAsset } from "@shared/schema";
import type { ScoredAsset, BuyerProfile, ReportPayload } from "@/lib/types";
import { DEFAULT_BUYER_PROFILE } from "@/lib/types";

type SearchResponse = {
  assets: ScoredAsset[];
  query: string;
  sources: string[];
  signalsFound: number;
  assetsFound: number;
};

type SourcesResponse = {
  sources: { id: string; label: string; description: string }[];
};

type SavedAssetsResponse = {
  assets: SavedAsset[];
};

type ScrapingProgress = { done: number; total: number; found: number };
type IngestStatus = IngestionRun & { status: string } | { status: "never_run"; totalFound: 0; newCount: 0; ranAt: null };

function formatRelativeTime(dt: Date | string | null): string {
  if (!dt) return "unknown";
  const d = new Date(dt);
  const now = Date.now();
  const diff = now - d.getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function ScanStatusBar({ onRefresh }: { onRefresh: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: statusData } = useQuery<IngestStatus & { enrichingCount?: number; scrapingProgress?: ScrapingProgress }>({
    queryKey: ["/api/ingest/status"],
    refetchInterval: (query) => {
      const data = query.state.data as (IngestStatus & { enrichingCount?: number }) | undefined;
      if (data?.status === "running") return 3000;
      if ((data?.enrichingCount ?? 0) > 0) return 5000;
      return 30000;
    },
    staleTime: 0,
  });

  const scanMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ingest/run", {});
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/ingest/status"] });
    },
    onError: (err: any) => {
      toast({ title: "Scan failed", description: err.message, variant: "destructive" });
    },
  });

  const isRunning = statusData?.status === "running" || scanMutation.isPending;
  const enrichingCount = statusData?.enrichingCount ?? 0;
  const scrapingProgress = statusData?.scrapingProgress ?? { done: 0, total: 0, found: 0 };
  const progressPct = scrapingProgress.total > 0
    ? Math.round((scrapingProgress.done / scrapingProgress.total) * 100)
    : 0;

  const handleScan = () => {
    scanMutation.mutate();
    onRefresh();
  };

  if (!statusData || statusData.status === "never_run") {
    return (
      <div className="max-w-3xl mx-auto flex items-center justify-between gap-3 px-3.5 py-2 rounded-lg border border-amber-500/20 bg-amber-500/5" data-testid="scan-status-bar">
        <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span className="font-medium">Sources not yet indexed</span>
          <span className="hidden sm:inline text-muted-foreground">— run a full scan to pull real listings from all {INSTITUTIONS.length} TTOs</span>
        </div>
        <Button
          size="sm"
          className="h-7 text-xs shrink-0 bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={handleScan}
          disabled={isRunning}
          data-testid="button-run-scan"
        >
          {isRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
          Run Full Scan
        </Button>
      </div>
    );
  }

  if (isRunning) {
    const hasProgress = scrapingProgress.total > 0;
    return (
      <div className="max-w-3xl mx-auto px-3.5 py-2.5 rounded-lg border border-primary/20 bg-primary/5 space-y-1.5" data-testid="scan-status-bar">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 text-primary animate-spin shrink-0" />
            <span className="text-xs text-primary font-medium">Scanning TTO sources…</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {hasProgress ? (
              <>
                <Building2 className="w-3 h-3" />
                <span data-testid="progress-institutions">
                  {scrapingProgress.done.toLocaleString()} / {scrapingProgress.total.toLocaleString()} institutions
                </span>
                <span className="text-muted-foreground/40">·</span>
                <span data-testid="progress-listings">
                  {scrapingProgress.found.toLocaleString()} listings found
                </span>
              </>
            ) : (
              <span>Starting up…</span>
            )}
          </div>
        </div>
        <Progress
          value={progressPct}
          className="h-1.5 bg-primary/10"
          data-testid="progress-bar"
        />
      </div>
    );
  }

  if (statusData.status === "failed") {
    return (
      <div className="max-w-3xl mx-auto flex items-center justify-between gap-3 px-3.5 py-2 rounded-lg border border-destructive/20 bg-destructive/5" data-testid="scan-status-bar">
        <div className="flex items-center gap-2 text-xs text-destructive">
          <XCircle className="w-3.5 h-3.5 shrink-0" />
          <span className="font-medium">Last scan failed</span>
          {statusData.errorMessage && (
            <span className="hidden sm:inline text-muted-foreground">— {statusData.errorMessage}</span>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs shrink-0 border-destructive/30 text-destructive hover:bg-destructive/5"
          onClick={handleScan}
          disabled={isRunning}
          data-testid="button-retry-scan"
        >
          <RefreshCw className="w-3 h-3 mr-1.5" />
          Retry
        </Button>
      </div>
    );
  }

  const updatedCount = (statusData.totalFound ?? 0) - (statusData.newCount ?? 0);

  return (
    <div className="max-w-3xl mx-auto flex items-center justify-between gap-3 px-3.5 py-2 rounded-lg border border-primary/15 bg-primary/5" data-testid="scan-status-bar">
      <div className="flex items-center gap-2 text-xs">
        <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />
        <span className="text-muted-foreground">
          Last scan: <span className="text-foreground font-medium">{formatRelativeTime(statusData.ranAt)}</span>
        </span>
        <span className="text-muted-foreground/50">·</span>
        <span className="text-muted-foreground">
          <span className="text-foreground font-medium">{statusData.totalFound}</span> assets indexed
        </span>
        {statusData.newCount > 0 ? (
          <>
            <span className="text-muted-foreground/50">·</span>
            <span className="text-primary font-medium">+{statusData.newCount} new</span>
          </>
        ) : updatedCount > 0 ? (
          <>
            <span className="text-muted-foreground/50">·</span>
            <span className="text-muted-foreground">{updatedCount} refreshed</span>
          </>
        ) : null}
        {enrichingCount > 0 && (
          <span className="flex items-center gap-1 ml-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 text-[10px] font-medium">
            <Loader2 className="w-2.5 h-2.5 animate-spin" />
            Enriching {enrichingCount.toLocaleString()} assets…
          </span>
        )}
      </div>
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs shrink-0 border-primary/30 text-primary hover:bg-primary/5"
        onClick={handleScan}
        disabled={isRunning}
        data-testid="button-refresh-scan"
      >
        <RefreshCw className="w-3 h-3 mr-1.5" />
        Refresh
      </Button>
    </div>
  );
}

const ALL_SOURCE_KEYS = ["pubmed", "biorxiv", "medrxiv", "clinicaltrials", "patents", "techtransfer", "nih_reporter", "openalex"];

const COVERED_INSTITUTIONS = INSTITUTIONS.map((i) => i.name);

const STAGES = ["discovery", "preclinical", "phase 1", "phase 2", "phase 3", "approved"];
const MODALITIES = [
  "small molecule", "antibody", "car-t", "gene therapy",
  "mrna therapy", "peptide", "bispecific antibody", "adc", "cell therapy", "protac",
];

function getCutoffDate(filter: string): Date {
  const now = Date.now();
  if (filter === "30d") return new Date(now - 30 * 24 * 60 * 60 * 1000);
  if (filter === "90d") return new Date(now - 90 * 24 * 60 * 60 * 1000);
  if (filter === "1y") return new Date(now - 365 * 24 * 60 * 60 * 1000);
  return new Date(0);
}

function parseDateLoose(dateStr: string | undefined): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d;
  const yearMatch = dateStr.match(/^(\d{4})/);
  if (yearMatch) return new Date(`${yearMatch[1]}-07-01`);
  return null;
}

function RadarOverlay({ sources }: { sources: string[] }) {
  return (
    <div className="flex flex-col items-center gap-4 py-12">
      <div className="relative w-24 h-24 flex items-center justify-center">
        {[1, 0.72, 0.44].map((scale, i) => (
          <div
            key={i}
            className="absolute rounded-full border border-primary/25"
            style={{ width: `${scale * 100}%`, height: `${scale * 100}%` }}
          />
        ))}
        <div className="absolute inset-0 rounded-full overflow-hidden radar-sweep" style={{ transformOrigin: "center center" }}>
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: "conic-gradient(from 0deg, transparent 250deg, hsl(142 65% 48% / 0.06) 290deg, hsl(142 65% 48% / 0.3) 360deg)",
            }}
          />
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="w-px h-1/2 origin-bottom"
            style={{ background: "linear-gradient(to top, hsl(142 65% 55% / 0.9), transparent)" }}
          />
        </div>
        <div className="w-2 h-2 rounded-full bg-primary glow-pulse absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-foreground">Scanning {sources.length} source{sources.length !== 1 ? "s" : ""}...</p>
        <p className="text-xs text-muted-foreground mt-1">Collecting signals, normalizing, scoring</p>
      </div>
    </div>
  );
}

function SourceSelector({
  sources, selected, onToggle,
}: {
  sources: { id: string; label: string }[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="max-w-3xl mx-auto flex flex-wrap items-center gap-2">
      <span className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide shrink-0">Sources:</span>
      {sources.map((s) => (
        <button
          key={s.id}
          onClick={() => onToggle(s.id)}
          className={`text-xs px-2.5 py-1 rounded-full border transition-all duration-150 ${
            selected.includes(s.id)
              ? "border-primary bg-primary/15 text-primary font-medium"
              : "border-card-border bg-card text-muted-foreground hover:text-foreground hover:border-primary/40"
          }`}
          data-testid={`source-toggle-${s.id}`}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

export default function Scout() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const [scanTick, setScanTick] = useState(0);

  const [searchResults, setSearchResults] = useState<ScoredAsset[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [currentQuery, setCurrentQuery] = useState("");
  const [inputQuery, setInputQuery] = useState("");
  const [savedPanelOpen, setSavedPanelOpen] = useState(false);
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [modalityFilter, setModalityFilter] = useState<string>("all");
  const [institutionFilter, setInstitutionFilter] = useState<string>("all");
  const [sortMode, setSortMode] = useState<"score" | "recency">("score");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [minScore, setMinScore] = useState<number>(0);
  const [buyerProfile, setBuyerProfile] = useState<BuyerProfile>(DEFAULT_BUYER_PROFILE);
  const [selectedSources, setSelectedSources] = useState<string[]>(ALL_SOURCE_KEYS);

  const { data: sourcesData } = useQuery<SourcesResponse>({ queryKey: ["/api/sources"] });
  const { data: savedData } = useQuery<SavedAssetsResponse>({ queryKey: ["/api/saved-assets"] });

  const searchMutation = useMutation({
    mutationFn: async ({ query }: { query: string }) => {
      const res = await apiRequest("POST", "/api/search", {
        query,
        sources: selectedSources,
        maxPerSource: 8,
        buyerProfile,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Search failed");
      }
      return res.json() as Promise<SearchResponse>;
    },
    onSuccess: (data) => {
      setSearchResults(data.assets);
      setHasSearched(true);
      setStageFilter("all");
      setModalityFilter("all");
      setInstitutionFilter("all");
      setSortMode("score");
      setDateFilter("all");
      setMinScore(0);
      if (data.assets.length === 0) {
        toast({ title: "No assets found", description: "Try a different query or enable more sources." });
      }
    },
    onError: (err: any) => {
      toast({ title: "Search failed", description: err.message, variant: "destructive" });
    },
  });

  const reportMutation = useMutation({
    mutationFn: async ({ query }: { query: string }) => {
      const res = await apiRequest("POST", "/api/report", {
        query,
        sources: selectedSources,
        maxPerSource: 6,
        buyerProfile,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Report generation failed");
      }
      return res.json() as Promise<ReportPayload>;
    },
    onSuccess: (report) => {
      sessionStorage.setItem("current-report", JSON.stringify(report));
      setLocation("/report");
    },
    onError: (err: any) => {
      toast({ title: "Report failed", description: err.message, variant: "destructive" });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (asset: ScoredAsset) => {
      const res = await apiRequest("POST", "/api/saved-assets", {
        asset_name: asset.asset_name,
        target: asset.target,
        modality: asset.modality,
        development_stage: asset.development_stage,
        disease_indication: asset.indication,
        summary: asset.summary,
        source_title: asset.signals?.[0]?.title ?? asset.asset_name,
        source_journal: asset.institution !== "unknown" ? asset.institution : "Unknown",
        publication_year: asset.latest_signal_date?.slice(0, 4) ?? "Unknown",
        source_name: asset.source_types?.[0] ?? "unknown",
        source_url: asset.source_urls?.[0] ?? undefined,
        pmid: asset.id,
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/saved-assets"] });
      toast({ title: "Asset saved", description: "Added to your pipeline." });
    },
    onError: (err: any) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/saved-assets/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/saved-assets"] });
      toast({ title: "Asset removed" });
    },
    onError: (err: any) => {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    },
  });

  const savedAssets = savedData?.assets ?? [];
  const sources = sourcesData?.sources ?? ALL_SOURCE_KEYS.map((id) => ({ id, label: id }));

  const savedAssetIds = new Set(savedAssets.map((a) => a.pmid ?? a.assetName).filter(Boolean) as string[]);

  const handleSearch = (query: string) => {
    setCurrentQuery(query);
    setInputQuery(query);
    searchMutation.mutate({ query });
  };

  const handleGenerateReport = () => {
    const query = currentQuery || inputQuery;
    if (!query.trim()) {
      toast({ title: "Enter a query first", description: "Type a search query before generating a report." });
      return;
    }
    reportMutation.mutate({ query });
  };

  const handleUnsave = (id: string) => {
    const found = savedAssets.find((a) => (a.pmid ?? a.assetName) === id);
    if (found) deleteMutation.mutate(found.id);
  };

  const handleToggleSource = (id: string) => {
    setSelectedSources((prev) =>
      prev.includes(id)
        ? prev.length === 1 ? prev : prev.filter((s) => s !== id)
        : [...prev, id]
    );
  };

  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(savedAssets, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "edenradar-assets.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCsv = () => {
    if (savedAssets.length === 0) return;
    const headers = ["Asset Name", "Target", "Modality", "Stage", "Disease", "Summary", "Journal", "Year", "Source", "URL"];
    const rows = savedAssets.map((a) => [
      a.assetName, a.target, a.modality, a.developmentStage, a.diseaseIndication,
      `"${a.summary.replace(/"/g, '""')}"`, a.sourceJournal, a.publicationYear, a.sourceName, a.sourceUrl ?? "",
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "edenradar-assets.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const availableStages = useMemo(
    () => STAGES.filter((s) => searchResults.some((a) => a.development_stage?.toLowerCase() === s)),
    [searchResults]
  );
  const availableModalities = useMemo(
    () => MODALITIES.filter((m) => searchResults.some((a) => a.modality?.toLowerCase() === m)),
    [searchResults]
  );
  const availableInstitutions = useMemo(() => {
    const seen = new Set<string>();
    return searchResults
      .map((a) => a.institution)
      .filter((inst): inst is string => !!inst && inst !== "unknown" && inst.length > 2)
      .filter((inst) => { if (seen.has(inst)) return false; seen.add(inst); return true; })
      .sort();
  }, [searchResults]);

  const filteredResults = useMemo(() => {
    const cutoff = getCutoffDate(dateFilter);
    let results = searchResults.filter((asset) => {
      const stageOk = stageFilter === "all" || asset.development_stage?.toLowerCase() === stageFilter;
      const modalityOk = modalityFilter === "all" || asset.modality?.toLowerCase() === modalityFilter;
      const institutionOk = institutionFilter === "all" || asset.institution === institutionFilter;
      const scoreOk = minScore === 0 || asset.score >= minScore;
      const dateOk = dateFilter === "all" || (() => {
        const d = parseDateLoose(asset.latest_signal_date);
        return d !== null && d >= cutoff;
      })();
      return stageOk && modalityOk && institutionOk && scoreOk && dateOk;
    });
    if (sortMode === "recency") {
      results = [...results].sort((a, b) => {
        const da = parseDateLoose(a.latest_signal_date)?.getTime() ?? 0;
        const db = parseDateLoose(b.latest_signal_date)?.getTime() ?? 0;
        return db - da;
      });
    }
    return results;
  }, [searchResults, stageFilter, modalityFilter, institutionFilter, dateFilter, sortMode, minScore]);

  const showControls = !searchMutation.isPending && hasSearched && searchResults.length > 0;
  const isAnyPending = searchMutation.isPending || reportMutation.isPending;

  return (
    <div className="min-h-full bg-background flex flex-col">
      <div className="flex flex-1 w-full">
        <main className="flex-1 min-w-0 flex flex-col">
          <div className="px-4 sm:px-6 pt-8 pb-5 space-y-4">
            <div className="max-w-3xl mx-auto text-center mb-6">
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">
                <span className="gradient-text dark:gradient-text gradient-text-light">
                  Asset Discovery
                </span>
              </h1>
              <p className="text-muted-foreground text-sm max-w-xl mx-auto">
                Multi-source biotech intelligence — scored, ranked, and matched to your buyer thesis.
              </p>
            </div>

            <div className="max-w-3xl mx-auto flex gap-2">
              <div className="flex-1">
                <SearchBar
                  query={inputQuery}
                  onQueryChange={setInputQuery}
                  onSearch={(q) => handleSearch(q)}
                  isLoading={searchMutation.isPending}
                  sources={[]}
                  selectedSource=""
                  onSourceChange={() => {}}
                />
              </div>
              <Button
                variant="outline"
                className="shrink-0 gap-2 text-sm h-10 border-primary/30 text-primary hover:bg-primary/5 hover:text-primary"
                onClick={handleGenerateReport}
                disabled={isAnyPending}
                data-testid="button-generate-report"
              >
                {reportMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <FileBarChart2 className="w-4 h-4" />
                )}
                <span className="hidden sm:inline">
                  {reportMutation.isPending ? "Generating..." : "Match Report"}
                </span>
              </Button>
            </div>

            <ScanStatusBar onRefresh={() => setScanTick((t) => t + 1)} />

            <div className="max-w-3xl mx-auto flex items-center justify-end">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors cursor-default select-none"
                      data-testid="coverage-indicator"
                    >
                      <Globe className="w-3 h-3 shrink-0" />
                      <span>{COVERED_INSTITUTIONS.length} institutions · {ALL_SOURCE_KEYS.length} sources covered</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[300px] p-3">
                    <p className="text-[11px] font-semibold text-foreground mb-2">Coverage includes:</p>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                      {COVERED_INSTITUTIONS.map((inst) => (
                        <p key={inst} className="text-[10px] text-muted-foreground">{inst}</p>
                      ))}
                    </div>
                    <p className="text-[10px] text-primary mt-2">New institutions added weekly.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            <BuyerProfileForm value={buyerProfile} onChange={setBuyerProfile} />

            <SourceSelector sources={sources} selected={selectedSources} onToggle={handleToggleSource} />
          </div>

          {searchMutation.isPending && (
            <div className="px-4 sm:px-6">
              <RadarOverlay sources={selectedSources} />
            </div>
          )}

          {showControls && (
            <div className="px-4 sm:px-6 pb-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide">Score</span>
                  <Select value={String(minScore)} onValueChange={(v) => setMinScore(Number(v))} data-testid="filter-score-select">
                    <SelectTrigger className="h-7 text-xs border-card-border bg-card w-[110px] focus:ring-0 focus:ring-offset-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">Any Score</SelectItem>
                      <SelectItem value="60">≥ 60</SelectItem>
                      <SelectItem value="70">≥ 70</SelectItem>
                      <SelectItem value="80">≥ 80</SelectItem>
                      <SelectItem value="90">≥ 90</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide">Sort</span>
                  <Select value={sortMode} onValueChange={(v) => setSortMode(v as "score" | "recency")} data-testid="select-sort">
                    <SelectTrigger className="h-7 text-xs border-card-border bg-card w-[130px] focus:ring-0 focus:ring-offset-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="score">Best Match</SelectItem>
                      <SelectItem value="recency">Newest First</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide">Date</span>
                  <Select value={dateFilter} onValueChange={setDateFilter} data-testid="select-date">
                    <SelectTrigger className="h-7 text-xs border-card-border bg-card w-[120px] focus:ring-0 focus:ring-offset-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Time</SelectItem>
                      <SelectItem value="30d">Last 30 Days</SelectItem>
                      <SelectItem value="90d">Last 90 Days</SelectItem>
                      <SelectItem value="1y">Last Year</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {availableStages.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide">Stage</span>
                    <Select value={stageFilter} onValueChange={setStageFilter} data-testid="filter-stage-select">
                      <SelectTrigger className="h-7 text-xs border-card-border bg-card w-[130px] focus:ring-0 focus:ring-offset-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Stages</SelectItem>
                        {availableStages.map((s) => (
                          <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {availableModalities.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide">Modality</span>
                    <Select value={modalityFilter} onValueChange={setModalityFilter} data-testid="filter-modality-select">
                      <SelectTrigger className="h-7 text-xs border-card-border bg-card w-[150px] focus:ring-0 focus:ring-offset-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Modalities</SelectItem>
                        {availableModalities.map((m) => (
                          <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {availableInstitutions.length > 1 && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide">Institution</span>
                    <Select value={institutionFilter} onValueChange={setInstitutionFilter} data-testid="filter-institution-select">
                      <SelectTrigger className="h-7 text-xs border-card-border bg-card w-[160px] focus:ring-0 focus:ring-offset-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Institutions</SelectItem>
                        {availableInstitutions.map((inst) => (
                          <SelectItem key={inst} value={inst}>{inst}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex-1 px-4 sm:px-6 pb-10">
            {!searchMutation.isPending && (
              <SearchResults
                assets={filteredResults}
                isLoading={false}
                hasSearched={hasSearched}
                query={currentQuery}
                savedAssetIds={savedAssetIds}
                onSave={(asset) => saveMutation.mutate(asset)}
                onUnsave={handleUnsave}
              />
            )}
          </div>
        </main>

        <div className="hidden lg:block w-80 shrink-0 border-l border-border sticky top-0 h-screen overflow-hidden">
          <SavedAssetsPanel
            assets={savedAssets}
            isOpen={true}
            onClose={() => {}}
            onDelete={(id) => deleteMutation.mutate(id)}
            onExportJson={handleExportJson}
            onExportCsv={handleExportCsv}
          />
        </div>
      </div>

      <div className="lg:hidden">
        <SavedAssetsPanel
          assets={savedAssets}
          isOpen={savedPanelOpen}
          onClose={() => setSavedPanelOpen(false)}
          onDelete={(id) => deleteMutation.mutate(id)}
          onExportJson={handleExportJson}
          onExportCsv={handleExportCsv}
        />
      </div>
    </div>
  );
}
