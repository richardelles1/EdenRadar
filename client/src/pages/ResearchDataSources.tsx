import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, ExternalLink, Microscope, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

type Signal = {
  id: string;
  title: string;
  text: string;
  url: string;
  date: string;
  institution_or_sponsor: string;
  source_type: string;
};

type Asset = {
  asset_name: string;
  signals: Signal[];
  summary: string;
  score: number;
  development_stage: string;
  modality: string;
};

type SearchResponse = { assets: Asset[] };

const SOURCE_LABELS: Record<string, string> = {
  paper: "PubMed",
  preprint: "Preprint",
  clinical_trial: "ClinicalTrials",
  patent: "Patent",
  tech_transfer: "Tech Transfer",
  researcher: "Researcher",
};

const SUGGESTED = [
  "CRISPR gene therapy",
  "mRNA cancer vaccine",
  "CAR-T solid tumor",
  "KRAS G12C inhibitor",
  "GLP-1 obesity",
  "antibody-drug conjugate",
];

export default function ResearchDataSources() {
  const [query, setQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState("");

  const { data, isLoading } = useQuery<SearchResponse>({
    queryKey: ["/api/search", activeQuery, "all-sources"],
    queryFn: () =>
      fetch(
        `/api/search?q=${encodeURIComponent(activeQuery)}&sources=pubmed,biorxiv,medrxiv,clinicaltrials,patents,nih_reporter,openalex&maxPerSource=6`
      ).then((r) => r.json()),
    enabled: !!activeQuery,
  });

  function handleSearch() {
    if (query.trim()) setActiveQuery(query.trim());
  }

  const assets = data?.assets ?? [];
  const allSignals = assets.flatMap((a) => a.signals ?? []);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Data Sources</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Search across PubMed, bioRxiv, medRxiv, ClinicalTrials, patents, NIH Reporter, and OpenAlex.
        </p>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search the literature..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            data-testid="input-literature-search"
          />
        </div>
        <Button
          onClick={handleSearch}
          disabled={isLoading || !query.trim()}
          className="gap-2 bg-violet-600 hover:bg-violet-700 text-white"
          data-testid="button-literature-search"
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Search
        </Button>
      </div>

      {!activeQuery && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Suggested searches</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED.map((s) => (
              <button
                key={s}
                onClick={() => { setQuery(s); setActiveQuery(s); }}
                className="px-3 py-1.5 rounded-full border border-border bg-card text-xs font-medium text-muted-foreground hover:text-foreground hover:border-violet-500/30 transition-colors"
                data-testid={`suggested-search-${s.replace(/\s+/g, "-")}`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {isLoading && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Microscope className="w-4 h-4 animate-pulse text-violet-500" />
            <span>Scanning literature sources...</span>
          </div>
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
          </div>
        </div>
      )}

      {activeQuery && !isLoading && allSignals.length === 0 && (
        <div className="text-center py-12 text-sm text-muted-foreground">
          No results found for "{activeQuery}". Try a different query.
        </div>
      )}

      {allSignals.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground font-medium">
            {allSignals.length} result{allSignals.length !== 1 ? "s" : ""} for "{activeQuery}"
          </p>
          {allSignals.map((signal, i) => (
            <div
              key={signal.id ?? i}
              className="border border-border rounded-lg p-4 bg-card hover:border-violet-500/20 transition-colors flex flex-col gap-2"
              data-testid={`signal-result-${i}`}
            >
              <div className="flex items-start gap-3 justify-between">
                <h3 className="text-sm font-semibold text-foreground leading-snug flex-1 line-clamp-2">{signal.title}</h3>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="secondary" className="text-[10px]">
                    {SOURCE_LABELS[signal.source_type] ?? signal.source_type}
                  </Badge>
                  {signal.url && (
                    <a href={signal.url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                    </a>
                  )}
                </div>
              </div>
              {signal.text && (
                <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">{signal.text}</p>
              )}
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                {signal.date && <span>{signal.date}</span>}
                {signal.institution_or_sponsor && (
                  <>
                    <span>·</span>
                    <span className="truncate max-w-[200px]">{signal.institution_or_sponsor}</span>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
