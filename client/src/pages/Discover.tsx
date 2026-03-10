import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { SearchBar } from "@/components/SearchBar";
import { SearchResults } from "@/components/SearchResults";
import { SavedAssetsPanel } from "@/components/SavedAssetsPanel";
import { SearchHistoryPanel } from "@/components/SearchHistoryPanel";
import { BuyerProfileForm } from "@/components/BuyerProfileForm";
import { Nav } from "@/components/Nav";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { X, FileBarChart2, Loader2 } from "lucide-react";
import type { SavedAsset, SearchHistory } from "@shared/schema";
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

type SearchHistoryResponse = {
  history: SearchHistory[];
};

const ALL_SOURCE_KEYS = ["pubmed", "biorxiv", "medrxiv", "clinicaltrials", "patents", "techtransfer", "nih_reporter", "openalex"];

const STAGES = ["discovery", "preclinical", "phase 1", "phase 2", "phase 3", "approved"];
const MODALITIES = [
  "small molecule", "antibody", "car-t", "gene therapy",
  "mrna therapy", "peptide", "bispecific antibody", "adc", "cell therapy", "protac",
];

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
              background: "conic-gradient(from 0deg, transparent 250deg, hsl(183 85% 52% / 0.06) 290deg, hsl(183 85% 52% / 0.3) 360deg)",
            }}
          />
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="w-px h-1/2 origin-bottom"
            style={{ background: "linear-gradient(to top, hsl(183 85% 60% / 0.9), transparent)" }}
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
  const [stageFilter, setStageFilter] = useState<string | null>(null);
  const [modalityFilter, setModalityFilter] = useState<string | null>(null);
  const [buyerProfile, setBuyerProfile] = useState<BuyerProfile>(DEFAULT_BUYER_PROFILE);
  const [selectedSources, setSelectedSources] = useState<string[]>(ALL_SOURCE_KEYS);

  const { data: sourcesData } = useQuery<SourcesResponse>({ queryKey: ["/api/sources"] });
  const { data: savedData } = useQuery<SavedAssetsResponse>({ queryKey: ["/api/saved-assets"] });
  const { data: historyData } = useQuery<SearchHistoryResponse>({ queryKey: ["/api/search-history"] });

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
      setStageFilter(null);
      setModalityFilter(null);
      qc.invalidateQueries({ queryKey: ["/api/search-history"] });
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
  const history = historyData?.history ?? [];

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

  const handleSelectHistoryQuery = (query: string) => {
    setInputQuery(query);
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
    a.download = "helixradar-assets.json";
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
    a.download = "helixradar-assets.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredResults = useMemo(() => {
    return searchResults.filter((asset) => {
      const stageOk = !stageFilter || asset.development_stage?.toLowerCase() === stageFilter;
      const modalityOk = !modalityFilter || asset.modality?.toLowerCase() === modalityFilter;
      return stageOk && modalityOk;
    });
  }, [searchResults, stageFilter, modalityFilter]);

  const availableStages = useMemo(
    () => STAGES.filter((s) => searchResults.some((a) => a.development_stage?.toLowerCase() === s)),
    [searchResults]
  );
  const availableModalities = useMemo(
    () => MODALITIES.filter((m) => searchResults.some((a) => a.modality?.toLowerCase() === m)),
    [searchResults]
  );

  const hasFilters = stageFilter !== null || modalityFilter !== null;
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

            <BuyerProfileForm value={buyerProfile} onChange={setBuyerProfile} />

            <SourceSelector sources={sources} selected={selectedSources} onToggle={handleToggleSource} />

            {history.length > 0 && (
              <div className="max-w-3xl mx-auto">
                <SearchHistoryPanel history={history} onSelectQuery={(q) => handleSelectHistoryQuery(q)} />
              </div>
            )}
          </div>

          {searchMutation.isPending && (
            <div className="px-4 sm:px-6">
              <RadarOverlay sources={selectedSources} />
            </div>
          )}

          {!searchMutation.isPending && hasSearched && searchResults.length > 0 && (availableStages.length > 0 || availableModalities.length > 0) && (
            <div className="px-4 sm:px-6 pb-3 space-y-2">
              {availableStages.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wide w-16 shrink-0">Stage</span>
                  {availableStages.map((s) => (
                    <button
                      key={s}
                      onClick={() => setStageFilter(stageFilter === s ? null : s)}
                      className={`text-xs px-3 py-1 rounded-full border transition-all duration-150 capitalize ${
                        stageFilter === s
                          ? "border-primary bg-primary/15 text-primary font-medium"
                          : "border-card-border bg-card text-muted-foreground hover:text-foreground hover:border-primary/40"
                      }`}
                      data-testid={`filter-stage-${s.replace(/\s+/g, "-")}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
              {availableModalities.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wide w-16 shrink-0">Modality</span>
                  {availableModalities.map((m) => (
                    <button
                      key={m}
                      onClick={() => setModalityFilter(modalityFilter === m ? null : m)}
                      className={`text-xs px-3 py-1 rounded-full border transition-all duration-150 capitalize ${
                        modalityFilter === m
                          ? "border-primary bg-primary/15 text-primary font-medium"
                          : "border-card-border bg-card text-muted-foreground hover:text-foreground hover:border-primary/40"
                      }`}
                      data-testid={`filter-modality-${m.replace(/\s+/g, "-")}`}
                    >
                      {m}
                    </button>
                  ))}
                  {hasFilters && (
                    <button
                      onClick={() => { setStageFilter(null); setModalityFilter(null); }}
                      className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/10 transition-all duration-150"
                      data-testid="button-clear-filters"
                    >
                      <X className="w-3 h-3" />
                      Clear
                    </button>
                  )}
                </div>
              )}
              {hasFilters && availableModalities.length === 0 && (
                <div className="flex">
                  <button
                    onClick={() => { setStageFilter(null); setModalityFilter(null); }}
                    className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/10 transition-all duration-150"
                    data-testid="button-clear-filters"
                  >
                    <X className="w-3 h-3" />
                    Clear
                  </button>
                </div>
              )}
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
