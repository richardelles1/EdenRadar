import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SearchBar } from "@/components/SearchBar";
import { SearchResults } from "@/components/SearchResults";
import { SavedAssetsPanel } from "@/components/SavedAssetsPanel";
import { SearchHistoryPanel } from "@/components/SearchHistoryPanel";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Bookmark, Activity, Dna, Github, Moon, Sun, Menu } from "lucide-react";
import type { Asset, SavedAsset, SearchHistory } from "@shared/schema";
import { useTheme } from "@/hooks/use-theme";

type SearchResponse = {
  assets: Asset[];
  query: string;
  source: string;
  papersFound: number;
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

export default function Home() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { theme, toggleTheme } = useTheme();

  const [searchResults, setSearchResults] = useState<Asset[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [currentQuery, setCurrentQuery] = useState("");
  const [inputQuery, setInputQuery] = useState("");
  const [selectedSource, setSelectedSource] = useState("pubmed");
  const [savedPanelOpen, setSavedPanelOpen] = useState(false);

  const { data: sourcesData } = useQuery<SourcesResponse>({
    queryKey: ["/api/sources"],
  });

  const { data: savedData } = useQuery<SavedAssetsResponse>({
    queryKey: ["/api/saved-assets"],
  });

  const { data: historyData } = useQuery<SearchHistoryResponse>({
    queryKey: ["/api/search-history"],
  });

  const searchMutation = useMutation({
    mutationFn: async ({ query, source }: { query: string; source: string }) => {
      const res = await apiRequest("POST", "/api/search", { query, source, maxResults: 10 });
      return res.json() as Promise<SearchResponse>;
    },
    onSuccess: (data) => {
      setSearchResults(data.assets);
      setHasSearched(true);
      qc.invalidateQueries({ queryKey: ["/api/search-history"] });
      if (data.assets.length === 0) {
        toast({ title: "No assets found", description: "Try refining your search query." });
      }
    },
    onError: (err: any) => {
      toast({ title: "Search failed", description: err.message, variant: "destructive" });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (asset: Asset) => {
      const res = await apiRequest("POST", "/api/saved-assets", {
        asset_name: asset.asset_name,
        target: asset.target,
        modality: asset.modality,
        development_stage: asset.development_stage,
        disease_indication: asset.disease_indication,
        summary: asset.summary,
        source_title: asset.source_title,
        source_journal: asset.source_journal,
        publication_year: asset.publication_year,
        source_name: asset.source_name,
        source_url: asset.source_url,
        pmid: asset.pmid,
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/saved-assets"] });
      toast({ title: "Asset saved", description: "Added to your saved assets." });
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
  const sources = sourcesData?.sources ?? [{ id: "pubmed", label: "PubMed", description: "NCBI biomedical literature" }];
  const history = historyData?.history ?? [];

  const savedAssetIds = new Set(
    savedAssets.map((a) => a.pmid ?? a.assetName).filter(Boolean)
  );

  const handleSearch = (query: string, source: string) => {
    setCurrentQuery(query);
    setInputQuery(query);
    searchMutation.mutate({ query, source });
  };

  const handleSelectHistoryQuery = (query: string, source: string) => {
    setInputQuery(query);
    setSelectedSource(source);
  };

  const handleUnsave = (pmid?: string, assetName?: string) => {
    const key = pmid ?? assetName;
    const found = savedAssets.find((a) => (a.pmid ?? a.assetName) === key);
    if (found) deleteMutation.mutate(found.id);
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

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
                <Dna className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-bold text-foreground text-lg tracking-tight">HelixRadar</span>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20">
              <Activity className="w-3 h-3 text-primary" />
              <span className="text-xs font-medium text-primary">AI Discovery Engine</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="w-8 h-8"
              onClick={toggleTheme}
              data-testid="button-toggle-theme"
              title="Toggle theme"
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 h-8 border-card-border relative"
              onClick={() => setSavedPanelOpen(true)}
              data-testid="button-open-saved"
            >
              <Bookmark className="w-3.5 h-3.5" />
              <span className="hidden sm:inline text-xs">Saved</span>
              {savedAssets.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-bold">
                  {savedAssets.length}
                </span>
              )}
            </Button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 max-w-screen-2xl mx-auto w-full">
        <main className="flex-1 min-w-0 flex flex-col">
          <div className="px-4 sm:px-6 pt-8 pb-6">
            <div className="max-w-3xl mx-auto text-center mb-8">
              <h1 className="text-3xl sm:text-4xl font-bold text-foreground tracking-tight mb-3">
                Biotech Asset Discovery
              </h1>
              <p className="text-muted-foreground text-base max-w-xl mx-auto">
                Search biomedical literature and extract structured drug asset intelligence using AI.
              </p>
            </div>

            <SearchBar
              query={inputQuery}
              onQueryChange={setInputQuery}
              onSearch={handleSearch}
              isLoading={searchMutation.isPending}
              sources={sources}
              selectedSource={selectedSource}
              onSourceChange={setSelectedSource}
            />

            {history.length > 0 && (
              <div className="max-w-3xl mx-auto mt-5">
                <SearchHistoryPanel
                  history={history}
                  onSelectQuery={handleSelectHistoryQuery}
                />
              </div>
            )}
          </div>

          <div className="flex-1 px-4 sm:px-6 pb-10">
            <SearchResults
              assets={searchResults}
              isLoading={searchMutation.isPending}
              hasSearched={hasSearched}
              query={currentQuery}
              savedAssetIds={savedAssetIds}
              onSave={(asset) => saveMutation.mutate(asset)}
              onUnsave={handleUnsave}
            />
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
