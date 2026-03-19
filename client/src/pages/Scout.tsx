import { useState, useMemo, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { INSTITUTIONS } from "@/lib/institutions";
import { SearchBar } from "@/components/SearchBar";
import { SearchResults } from "@/components/SearchResults";
import { BuyerProfileForm } from "@/components/BuyerProfileForm";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { FileBarChart2, Loader2, Globe, TrendingUp, Flame, SlidersHorizontal } from "lucide-react";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import type { SavedAsset } from "@shared/schema";
import type { ScoredAsset, BuyerProfile, ReportPayload } from "@/lib/types";
import { DEFAULT_BUYER_PROFILE } from "@/lib/types";

type SearchResponse = {
  assets: ScoredAsset[];
  query: string;
  sources: string[];
  assetsFound: number;
  signalsFound?: number;
};

type SavedAssetsResponse = {
  assets: SavedAsset[];
};


const ALL_SOURCE_KEYS = ["pubmed", "biorxiv", "medrxiv", "clinicaltrials", "patents", "techtransfer", "nih_reporter", "openalex", "lab_discoveries"];

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


type ConvergenceSignal = {
  therapyArea: string;
  targetOrMechanism: string;
  institutionCount: number;
  score: number;
  institutions: string[];
  assetCount: number;
};

type TherapyArea = {
  name: string;
  assetCount: number;
  level: number;
};

function HotAreasSidebar({ onSearchArea }: { onSearchArea: (query: string) => void }) {
  const { data: convergenceData } = useQuery<{ signals: ConvergenceSignal[] }>({
    queryKey: ["/api/taxonomy/convergence"],
    staleTime: 60000,
  });

  const { data: taxonomyData } = useQuery<{ areas: TherapyArea[] }>({
    queryKey: ["/api/taxonomy/therapy-areas"],
    staleTime: 60000,
  });

  const signals = convergenceData?.signals ?? [];
  const areas = (taxonomyData?.areas ?? []).filter((a) => a.assetCount > 0);

  if (signals.length === 0 && areas.length === 0) return null;

  return (
    <div className="p-4 border-b border-border" data-testid="hot-areas-panel">
      {signals.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Flame className="h-3.5 w-3.5 text-orange-500" />
            <span className="text-xs font-semibold text-foreground uppercase tracking-wide">Hot Areas</span>
          </div>
          <div className="space-y-1.5">
            {signals.slice(0, 6).map((s, i) => (
              <button
                key={i}
                onClick={() => onSearchArea(`${s.targetOrMechanism} ${s.therapyArea}`)}
                className="w-full text-left p-2 rounded-md hover:bg-muted/50 transition-colors group"
                data-testid={`hot-area-${i}`}
              >
                <div className="text-xs font-medium text-foreground group-hover:text-primary transition-colors truncate">
                  {s.targetOrMechanism}
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                  <span className="capitalize">{s.therapyArea}</span>
                  <span>{s.institutionCount} institutions</span>
                  <span>{s.assetCount} assets</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {areas.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <TrendingUp className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-semibold text-foreground uppercase tracking-wide">Browse by Area</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {areas.slice(0, 12).map((a) => (
              <button
                key={a.name}
                onClick={() => onSearchArea(a.name)}
                className="text-[10px] px-2 py-0.5 rounded-full border border-border hover:border-primary/40 hover:bg-primary/5 text-muted-foreground hover:text-foreground transition-colors capitalize"
                data-testid={`browse-area-${a.name}`}
              >
                {a.name} <span className="text-muted-foreground/50">{a.assetCount}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Scout() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const searchStr = useSearch();

  function ssGet<T>(key: string, fallback: T): T {
    try {
      const raw = sessionStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  }

  const [searchResults, setSearchResults] = useState<ScoredAsset[]>(() => ssGet("scout-results", []));
  const [hasSearched, setHasSearched] = useState<boolean>(() => ssGet("scout-has-searched", false));
  const [currentQuery, setCurrentQuery] = useState<string>(() => ssGet("scout-query", ""));
  const [inputQuery, setInputQuery] = useState<string>(() => ssGet("scout-query", ""));
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [modalityFilter, setModalityFilter] = useState<string>("all");
  const [institutionFilter, setInstitutionFilter] = useState<string>("all");
  const [sortMode, setSortMode] = useState<"score" | "recency">("score");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [minScore, setMinScore] = useState<number>(0);
  const [buyerProfile, setBuyerProfile] = useState<BuyerProfile>(() => ssGet("scout-buyer-profile", DEFAULT_BUYER_PROFILE));
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(searchStr);
    const qParam = params.get("q");
    if (qParam && qParam.trim()) {
      const q = qParam.trim();
      setInputQuery(q);
      setCurrentQuery(q);
      searchMutation.mutate({ query: q });
      setLocation("/scout", { replace: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem("scout-results", JSON.stringify(searchResults));
      sessionStorage.setItem("scout-has-searched", JSON.stringify(hasSearched));
      sessionStorage.setItem("scout-query", JSON.stringify(currentQuery));
      sessionStorage.setItem("scout-buyer-profile", JSON.stringify(buyerProfile));
    } catch {}
  }, [searchResults, hasSearched, currentQuery, buyerProfile]);

  const { data: savedData } = useQuery<SavedAssetsResponse>({ queryKey: ["/api/saved-assets"] });

  const searchMutation = useMutation({
    mutationFn: async ({ query }: { query: string }) => {
      const res = await apiRequest("POST", "/api/scout/search", {
        query,
        minSimilarity: 0.35,
        limit: 40,
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
        toast({ title: "No TTO assets matched", description: "Try broader terms or a different indication." });
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

  const activeFilterCount = [
    stageFilter !== "all",
    modalityFilter !== "all",
    institutionFilter !== "all",
    dateFilter !== "all",
    minScore !== 0,
    sortMode !== "score",
  ].filter(Boolean).length;

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
                Semantic search across indexed TTO assets from leading research institutions, matched to your buyer thesis.
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
              <Button
                variant="outline"
                className="shrink-0 relative gap-2 text-sm h-10 border-card-border"
                onClick={() => setFiltersOpen(true)}
                data-testid="button-open-filters"
              >
                <SlidersHorizontal className="w-4 h-4" />
                <span className="hidden sm:inline">Filters</span>
                {activeFilterCount > 0 && (
                  <Badge className="absolute -top-1.5 -right-1.5 w-4 h-4 p-0 flex items-center justify-center text-[10px] bg-primary text-primary-foreground border-0">
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>
            </div>

            <div className="max-w-3xl mx-auto flex items-center justify-end">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors cursor-default select-none"
                      data-testid="coverage-indicator"
                    >
                      <Globe className="w-3 h-3 shrink-0" />
                      <span>{COVERED_INSTITUTIONS.length} institutions indexed</span>
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
          </div>

          {searchMutation.isPending && (
            <div className="px-4 sm:px-6">
              <RadarOverlay sources={["tech_transfer"]} />
            </div>
          )}

          {showControls && (
            <div className="px-4 sm:px-6 pb-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setFiltersOpen(true)}
                  className="text-[11px] text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
                  data-testid="button-filters-hint"
                >
                  <SlidersHorizontal className="w-3 h-3" />
                  {activeFilterCount > 0
                    ? `${activeFilterCount} filter${activeFilterCount !== 1 ? "s" : ""} active`
                    : "Add filters"}
                </button>
                {stageFilter !== "all" && (
                  <Badge variant="secondary" className="text-[11px] gap-1 cursor-pointer" onClick={() => setStageFilter("all")} data-testid="active-filter-stage">
                    Stage: {stageFilter} ×
                  </Badge>
                )}
                {modalityFilter !== "all" && (
                  <Badge variant="secondary" className="text-[11px] gap-1 cursor-pointer capitalize" onClick={() => setModalityFilter("all")} data-testid="active-filter-modality">
                    {modalityFilter} ×
                  </Badge>
                )}
                {institutionFilter !== "all" && (
                  <Badge variant="secondary" className="text-[11px] gap-1 cursor-pointer" onClick={() => setInstitutionFilter("all")} data-testid="active-filter-institution">
                    {institutionFilter} ×
                  </Badge>
                )}
                {dateFilter !== "all" && (
                  <Badge variant="secondary" className="text-[11px] gap-1 cursor-pointer" onClick={() => setDateFilter("all")} data-testid="active-filter-date">
                    {dateFilter} ×
                  </Badge>
                )}
                {minScore > 0 && (
                  <Badge variant="secondary" className="text-[11px] gap-1 cursor-pointer" onClick={() => setMinScore(0)} data-testid="active-filter-score">
                    Score ≥ {minScore} ×
                  </Badge>
                )}
              </div>
            </div>
          )}

          <div className="flex-1 px-4 sm:px-6 pb-10 space-y-4">
            {!searchMutation.isPending && (
              <SearchResults
                assets={filteredResults}
                isLoading={false}
                hasSearched={hasSearched}
                query={currentQuery}
                savedAssetIds={savedAssetIds}
                onUnsave={handleUnsave}
              />
            )}
          </div>
        </main>

        <div className="hidden lg:block w-80 shrink-0 border-l border-border sticky top-0 h-screen overflow-y-auto">
          <HotAreasSidebar onSearchArea={(q) => handleSearch(q)} />
        </div>
      </div>

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="right" className="w-full sm:max-w-sm overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
          </SheetHeader>

          <div className="mt-6 space-y-6">
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sort & Score</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[11px] text-muted-foreground">Min Score</label>
                  <Select value={String(minScore)} onValueChange={(v) => setMinScore(Number(v))} data-testid="filter-score-select">
                    <SelectTrigger className="h-8 text-xs">
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
                <div className="space-y-1.5">
                  <label className="text-[11px] text-muted-foreground">Sort By</label>
                  <Select value={sortMode} onValueChange={(v) => setSortMode(v as "score" | "recency")} data-testid="select-sort">
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="score">Best Match</SelectItem>
                      <SelectItem value="recency">Newest First</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Date Range</p>
              <Select value={dateFilter} onValueChange={setDateFilter} data-testid="select-date">
                <SelectTrigger className="h-8 text-xs w-full">
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
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Development Stage</p>
                <Select value={stageFilter} onValueChange={setStageFilter} data-testid="filter-stage-select">
                  <SelectTrigger className="h-8 text-xs w-full">
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
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Modality</p>
                <Select value={modalityFilter} onValueChange={setModalityFilter} data-testid="filter-modality-select">
                  <SelectTrigger className="h-8 text-xs w-full">
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
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Institution</p>
                <Select value={institutionFilter} onValueChange={setInstitutionFilter} data-testid="filter-institution-select">
                  <SelectTrigger className="h-8 text-xs w-full">
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

            {activeFilterCount > 0 && (
              <button
                onClick={() => {
                  setStageFilter("all");
                  setModalityFilter("all");
                  setInstitutionFilter("all");
                  setDateFilter("all");
                  setMinScore(0);
                  setSortMode("score");
                }}
                className="w-full text-xs text-muted-foreground hover:text-red-500 transition-colors text-center py-1 border border-dashed border-card-border rounded-md"
                data-testid="button-reset-filters"
              >
                Reset all filters
              </button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
