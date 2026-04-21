import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { INSTITUTIONS } from "@/lib/institutions";
import { SearchBar } from "@/components/SearchBar";
import { SearchResults } from "@/components/SearchResults";
import { SavedAssetsPanel } from "@/components/SavedAssetsPanel";
import { BuyerProfileForm } from "@/components/BuyerProfileForm";
import { Nav } from "@/components/Nav";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { FileBarChart2, Loader2, Globe, Building2, FlaskConical, GraduationCap } from "lucide-react";
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
  signalsFound: number;
  assetsFound: number;
};

type SourcesResponse = {
  sources: { id: string; label: string; description: string }[];
};

type SavedAssetsResponse = {
  assets: SavedAsset[];
};

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

export default function Discover() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();

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
        maxPerSource: 25,
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
        maxPerSource: 20,
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
    <div className="min-h-screen bg-background flex flex-col">
      <Nav onOpenSaved={() => setSavedPanelOpen(true)} />

      <div className="flex flex-1 max-w-screen-2xl mx-auto w-full">
        <main className="flex-1 min-w-0 flex flex-col">
          <div className="px-4 sm:px-6 pt-8 pb-5 space-y-4">
            <div className="max-w-3xl mx-auto text-center mb-6">
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">
                <span className="gradient-text dark:gradient-text gradient-text-light">
                  Asset Discovery
                </span>
              </h1>
              <p className="text-muted-foreground text-sm max-w-xl mx-auto">
                Multi-source biotech intelligence: scored, ranked, and matched to your buyer thesis.
              </p>
            </div>

            <div className="max-w-3xl mx-auto">
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

            <div className="max-w-3xl mx-auto flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide shrink-0">Owner:</span>
              {(["any", "university", "company"] as const).map((t) => {
                const icon = t === "university"
                  ? <GraduationCap className="w-3 h-3" />
                  : t === "company"
                  ? <Building2 className="w-3 h-3" />
                  : <FlaskConical className="w-3 h-3" />;
                const label = t === "any" ? "Any" : t === "university" ? "University" : "Company";
                const active = buyerProfile.owner_type_preference === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setBuyerProfile({ ...buyerProfile, owner_type_preference: t })}
                    className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-all duration-150 ${
                      active
                        ? "border-primary bg-primary/15 text-primary font-medium"
                        : "border-card-border bg-card text-muted-foreground hover:text-foreground hover:border-primary/40"
                    }`}
                    data-testid={`owner-type-${t}`}
                  >
                    {icon}
                    {label}
                  </button>
                );
              })}
            </div>
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
              <p className="text-[10px] text-muted-foreground mt-1.5 pl-0.5">
                Use the Date filter to control result recency.
              </p>
            </div>
          )}

          <div className="flex-1 px-4 sm:px-6 pb-10">
            {showControls && (
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-muted-foreground">
                  Showing <span className="font-medium text-foreground">{filteredResults.length}</span> result{filteredResults.length !== 1 ? "s" : ""}
                </span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-xs h-8 border-primary/30 text-primary hover:bg-primary/5 hover:text-primary"
                        onClick={handleGenerateReport}
                        disabled={isAnyPending}
                        data-testid="button-generate-report"
                      >
                        {reportMutation.isPending ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <FileBarChart2 className="w-3.5 h-3.5" />
                        )}
                        {reportMutation.isPending ? "Generating..." : "Match Report"}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="left">
                      <p className="text-xs max-w-[200px]">AI summary of how these results align with your deal focus.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            )}
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

        <div className="hidden lg:block w-80 shrink-0 border-l border-border sticky top-14 h-[calc(100vh-3.5rem)] overflow-hidden">
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
