import { useState, useMemo, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { INSTITUTIONS } from "@/lib/institutions";
import { SearchBar } from "@/components/SearchBar";
import { SearchResults } from "@/components/SearchResults";
import { AssetCard } from "@/components/AssetCard";
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
import { FileBarChart2, Loader2, Globe, SlidersHorizontal, X, Building2 as Bldg, Database } from "lucide-react";
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

const RADAR_FACT_TEMPLATES = [
  (stats: RadarStats) => `Scanning ${stats.total > 0 ? stats.total.toLocaleString() + "+" : "26,000+"} exclusive TTO assets`,
  (stats: RadarStats) => `${stats.institutions > 0 ? stats.institutions : "262"}+ institutions in our network`,
  () => "Matching against your acquisition thesis",
  () => "40+ therapy areas indexed and monitored",
  (stats: RadarStats) => stats.topModality ? `CAR-T sees highest convergence signal` : "Ranking by relevance and licensing readiness",
  () => "Filtering for biotech and pharma relevance",
  () => "Scoring novelty, fit, and licensability",
];

type RadarStats = { total: number; institutions: number; topModality: string };

function RadarOverlay({ stats }: { stats: RadarStats }) {
  const [factIdx, setFactIdx] = useState(0);
  const facts = RADAR_FACT_TEMPLATES.map((fn) => fn(stats));
  useEffect(() => {
    const iv = setInterval(() => setFactIdx((i) => (i + 1) % facts.length), 4500);
    return () => clearInterval(iv);
  }, [facts.length]);
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
      <div className="text-center min-h-[2.5rem]">
        <p className="text-sm font-medium text-foreground transition-all duration-500">
          {facts[factIdx]}
        </p>
        <div className="flex justify-center gap-1 mt-2">
          {facts.map((_, i) => (
            <span
              key={i}
              className={`block w-1 h-1 rounded-full transition-all duration-300 ${i === factIdx ? "bg-primary" : "bg-primary/20"}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}


type InstitutionsResponse = {
  institutions: { institution: string; count: number }[];
  total: number;
};

function TTONetworkSidebar({ onSearch }: { onSearch: (query: string) => void }) {
  const [filter, setFilter] = useState("");

  const { data } = useQuery<InstitutionsResponse>({
    queryKey: ["/api/scout/institutions"],
    staleTime: 10 * 60 * 1000,
  });

  const institutions = data?.institutions ?? [];
  const total = data?.total ?? 0;

  const filtered = filter.trim()
    ? institutions.filter((i) => i.institution.toLowerCase().includes(filter.toLowerCase()))
    : institutions;

  return (
    <div className="flex flex-col h-full" data-testid="tto-network-panel">
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-1.5 mb-1">
          <Globe className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-semibold text-foreground uppercase tracking-wide">TTO Network</span>
        </div>
        {total > 0 && (
          <p className="text-[10px] text-muted-foreground mb-3">
            <span className="text-foreground font-semibold">{total}</span> institutions indexed
          </p>
        )}
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter institutions..."
          className="w-full h-7 px-2.5 text-[11px] rounded-md border border-border bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
          data-testid="tto-institution-filter"
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.slice(0, 60).map((inst) => (
          <button
            key={inst.institution}
            onClick={() => onSearch(inst.institution)}
            className="w-full text-left flex items-center justify-between gap-2 px-4 py-2 hover:bg-accent/50 transition-colors group border-b border-border/40 last:border-0"
            data-testid={`tto-inst-${inst.institution}`}
          >
            <span className="text-[11px] text-muted-foreground group-hover:text-foreground transition-colors truncate leading-tight">
              {inst.institution}
            </span>
            <span className="text-[10px] text-muted-foreground/60 shrink-0 tabular-nums">{inst.count}</span>
          </button>
        ))}
        {filtered.length === 0 && filter && (
          <p className="text-[11px] text-muted-foreground text-center py-6">No institutions match</p>
        )}
      </div>
    </div>
  );
}

const RESEARCH_SOURCE_OPTIONS = [
  { key: "pubmed",        label: "PubMed",             desc: "Biomedical literature" },
  { key: "biorxiv",       label: "bioRxiv",             desc: "Biology preprints" },
  { key: "medrxiv",       label: "medRxiv",             desc: "Clinical preprints" },
  { key: "clinicaltrials",label: "ClinicalTrials.gov",  desc: "Active trials" },
  { key: "patents",       label: "Patents",              desc: "Patent databases" },
  { key: "nih_reporter",  label: "NIH Reporter",        desc: "Federal grants" },
  { key: "harvard_dataverse", label: "Harvard Catalyst", desc: "Harvard research database" },
];

function ScoutSidebar({
  onSearch,
  researchSources,
  onSourcesChange,
}: {
  onSearch: (q: string) => void;
  researchSources: string[];
  onSourcesChange: (sources: string[]) => void;
}) {
  const [activeTab, setActiveTab] = useState<"institutions" | "sources">("institutions");
  const [filter, setFilter] = useState("");

  const { data } = useQuery<InstitutionsResponse>({
    queryKey: ["/api/scout/institutions"],
    staleTime: 10 * 60 * 1000,
  });

  const institutions = data?.institutions ?? [];
  const total = data?.total ?? 0;
  const filtered = filter.trim()
    ? institutions.filter((i) => i.institution.toLowerCase().includes(filter.toLowerCase()))
    : institutions;

  function toggleSource(key: string) {
    const next = researchSources.includes(key)
      ? researchSources.filter((s) => s !== key)
      : [...researchSources, key];
    onSourcesChange(next);
  }

  return (
    <div className="flex flex-col h-full" data-testid="scout-sidebar">
      <div className="flex border-b border-border shrink-0">
        <button
          onClick={() => setActiveTab("institutions")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-semibold transition-colors border-b-2 ${
            activeTab === "institutions"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          data-testid="scout-tab-institutions"
        >
          <Bldg className="h-3 w-3" />
          TTO Network
        </button>
        <button
          onClick={() => setActiveTab("sources")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-semibold transition-colors border-b-2 ${
            activeTab === "sources"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          data-testid="scout-tab-sources"
        >
          <Database className="h-3 w-3" />
          Research
          {researchSources.length > 0 && (
            <span className="ml-0.5 inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-primary text-[8px] text-primary-foreground font-bold">
              {researchSources.length}
            </span>
          )}
        </button>
      </div>

      {activeTab === "institutions" && (
        <div className="flex flex-col h-full min-h-0">
          <div className="p-3 pb-2 border-b border-border shrink-0">
            <div className="flex items-center gap-1.5 mb-1">
              <Globe className="h-3.5 w-3.5 text-primary" />
              <span className="text-[10px] font-semibold text-foreground uppercase tracking-wide">TTO Institutions</span>
            </div>
            {total > 0 && (
              <p className="text-[10px] text-muted-foreground mb-2">
                <span className="text-foreground font-semibold">{total}</span> institutions indexed
              </p>
            )}
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter institutions..."
              className="w-full h-7 px-2.5 text-[11px] rounded-md border border-border bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
              data-testid="tto-institution-filter"
            />
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            {filtered.slice(0, 80).map((inst) => (
              <button
                key={inst.institution}
                onClick={() => onSearch(inst.institution)}
                className="w-full text-left flex items-center justify-between gap-2 px-3 py-2 hover:bg-accent/50 transition-colors group border-b border-border/40 last:border-0"
                data-testid={`tto-inst-${inst.institution}`}
              >
                <span className="text-[11px] text-muted-foreground group-hover:text-foreground transition-colors truncate leading-tight">
                  {inst.institution}
                </span>
                <span className="text-[10px] text-muted-foreground/60 shrink-0 tabular-nums">{inst.count}</span>
              </button>
            ))}
            {filtered.length === 0 && filter && (
              <p className="text-[11px] text-muted-foreground text-center py-6">No institutions match</p>
            )}
          </div>
        </div>
      )}

      {activeTab === "sources" && (
        <div className="flex flex-col h-full min-h-0 p-3 gap-3">
          <div className="space-y-1">
            <p className="text-[10px] font-semibold text-foreground uppercase tracking-wide mb-1">Research Sources</p>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Checked sources are searched automatically alongside TTO assets.
            </p>
          </div>

          <div className="space-y-1.5 flex-1 overflow-y-auto min-h-0">
            {RESEARCH_SOURCE_OPTIONS.map((src) => {
              const checked = researchSources.includes(src.key);
              return (
                <label
                  key={src.key}
                  className="flex items-start gap-2.5 p-2 rounded-lg border border-border/50 hover:border-primary/30 hover:bg-primary/5 cursor-pointer transition-all"
                  data-testid={`source-toggle-${src.key}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleSource(src.key)}
                    className="mt-0.5 accent-primary w-3.5 h-3.5 shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold text-foreground">{src.label}</p>
                    <p className="text-[10px] text-muted-foreground">{src.desc}</p>
                  </div>
                </label>
              );
            })}
          </div>

          <div className="shrink-0 pt-2 border-t border-border">
            <p className="text-[10px] text-muted-foreground/70">
              {researchSources.length} of {RESEARCH_SOURCE_OPTIONS.length} sources active
            </p>
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
  const [researchResults, setResearchResults] = useState<ScoredAsset[]>(() => ssGet("scout-research-results", []));
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
  const DEFAULT_RESEARCH_SOURCES = ["pubmed", "biorxiv", "clinicaltrials", "patents", "nih_reporter", "harvard_dataverse"];
  const [researchSources, setResearchSources] = useState<string[]>(() => {
    try {
      const raw = sessionStorage.getItem("scout-research-sources");
      return raw ? JSON.parse(raw) : DEFAULT_RESEARCH_SOURCES;
    } catch { return DEFAULT_RESEARCH_SOURCES; }
  });

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
      sessionStorage.setItem("scout-research-results", JSON.stringify(researchResults));
      sessionStorage.setItem("scout-has-searched", JSON.stringify(hasSearched));
      sessionStorage.setItem("scout-query", JSON.stringify(currentQuery));
      sessionStorage.setItem("scout-buyer-profile", JSON.stringify(buyerProfile));
      sessionStorage.setItem("scout-research-sources", JSON.stringify(researchSources));
    } catch {}
  }, [searchResults, researchResults, hasSearched, currentQuery, buyerProfile, researchSources]);

  const { data: savedData } = useQuery<SavedAssetsResponse>({ queryKey: ["/api/saved-assets"] });
  const { data: institutionsData } = useQuery<InstitutionsResponse>({
    queryKey: ["/api/scout/institutions"],
    staleTime: 10 * 60 * 1000,
  });
  const liveInstitutionCount = institutionsData?.total ?? COVERED_INSTITUTIONS.length;

  const { data: dashStats } = useQuery<{ stats: { total: number; byModality: { modality: string; count: number }[] } }>({
    queryKey: ["/api/dashboard/stats"],
    staleTime: 10 * 60 * 1000,
  });
  const radarStats: RadarStats = {
    total: dashStats?.stats?.total ?? 0,
    institutions: liveInstitutionCount,
    topModality: dashStats?.stats?.byModality?.[0]?.modality ?? "",
  };

  const searchMutation = useMutation({
    mutationFn: async ({ query }: { query: string }) => {
      const profileModality = buyerProfile.modalities.length === 1 ? buyerProfile.modalities[0] : undefined;
      const profileStage = buyerProfile.preferred_stages.length === 1 ? buyerProfile.preferred_stages[0] : undefined;
      const profileIndication = buyerProfile.indication_keywords.length === 1 ? buyerProfile.indication_keywords[0] : undefined;
      const res = await apiRequest("POST", "/api/scout/search", {
        query,
        minSimilarity: 0.40,
        limit: 50,
        ...(profileModality ? { modality: profileModality } : {}),
        ...(profileStage ? { stage: profileStage } : {}),
        ...(profileIndication ? { indication: profileIndication } : {}),
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

  const researchMutation = useMutation({
    mutationFn: async ({ query, sources }: { query: string; sources: string[] }) => {
      const res = await apiRequest("POST", "/api/search", {
        query,
        sources,
        maxPerSource: 25,
        buyerProfile,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Research search failed");
      }
      return res.json() as Promise<SearchResponse>;
    },
    onSuccess: (data) => {
      setResearchResults(data.assets ?? []);
    },
    onError: () => {
      setResearchResults([]);
    },
  });

  const reportMutation = useMutation({
    mutationFn: async ({ query }: { query: string }) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60_000);
      try {
        const res = await fetch("/api/report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, sources: ["tech_transfer"], maxPerSource: 6, buyerProfile }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error ?? "Report generation failed");
        }
        return res.json() as Promise<ReportPayload>;
      } catch (err: any) {
        clearTimeout(timeoutId);
        if (err.name === "AbortError") {
          throw new Error("Report timed out after 60 seconds. Try a more specific query.");
        }
        throw err;
      }
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
    setResearchResults([]);
    searchMutation.mutate({ query });
    if (researchSources.length > 0) {
      researchMutation.mutate({ query, sources: researchSources });
    }
  };

  const handleClearSearch = () => {
    setCurrentQuery("");
    setInputQuery("");
    setSearchResults([]);
    setResearchResults([]);
    setHasSearched(false);
    setStageFilter("all");
    setModalityFilter("all");
    setInstitutionFilter("all");
    setSortMode("score");
    setDateFilter("all");
    setMinScore(0);
    try { sessionStorage.removeItem("scout-include-research"); } catch {}
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
  const isAnyPending = searchMutation.isPending || researchMutation.isPending || reportMutation.isPending;

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
              {hasSearched && !searchMutation.isPending && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 h-10 w-10 text-muted-foreground hover:text-foreground"
                  onClick={handleClearSearch}
                  data-testid="button-clear-search"
                  title="Clear search"
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>

            <div className="max-w-3xl mx-auto flex items-center gap-4">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors cursor-default select-none"
                      data-testid="coverage-indicator"
                    >
                      <Globe className="w-3 h-3 shrink-0" />
                      <span>{liveInstitutionCount} institutions indexed</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[300px] p-3">
                    <p className="text-[11px] font-semibold text-foreground mb-2">Coverage includes:</p>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                      {COVERED_INSTITUTIONS.slice(0, 20).map((inst) => (
                        <p key={inst} className="text-[10px] text-muted-foreground">{inst}</p>
                      ))}
                    </div>
                    <p className="text-[10px] text-primary mt-2">New institutions added weekly.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {researchSources.length > 0 && (
                <span className="text-[11px] text-muted-foreground" data-testid="research-sources-indicator">
                  + {researchSources.length} research source{researchSources.length !== 1 ? "s" : ""} active
                </span>
              )}
            </div>

            <BuyerProfileForm value={buyerProfile} onChange={setBuyerProfile} />
          </div>

          {searchMutation.isPending && (
            <div className="px-4 sm:px-6">
              <RadarOverlay stats={radarStats} />
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
                    ? `${activeFilterCount} filter${activeFilterCount !== 1 ? "s" : ""} active — Refine`
                    : "Refine results"}
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

          <div className="flex-1 px-4 sm:px-6 pb-10 space-y-6">
            {!searchMutation.isPending && (
              <SearchResults
                assets={filteredResults}
                isLoading={false}
                hasSearched={hasSearched}
                query={currentQuery}
                savedAssetIds={savedAssetIds}
                onUnsave={handleUnsave}
                headerAction={
                  hasSearched && filteredResults.length > 0 ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-[11px] h-7 border-primary/30 text-primary hover:bg-primary/5 hover:text-primary shrink-0"
                      onClick={handleGenerateReport}
                      disabled={isAnyPending}
                      data-testid="button-generate-report"
                    >
                      {reportMutation.isPending ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <FileBarChart2 className="w-3 h-3" />
                      )}
                      {reportMutation.isPending ? "Generating..." : "Match Report"}
                    </Button>
                  ) : undefined
                }
              />
            )}

            {researchSources.length > 0 && hasSearched && !searchMutation.isPending && (
              <div className="space-y-3" data-testid="research-sources-section">
                <div className="flex items-center gap-2">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest px-2">
                    Research Sources
                  </span>
                  <div className="h-px flex-1 bg-border" />
                </div>
                {researchMutation.isPending ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    <span>Scanning research databases...</span>
                  </div>
                ) : researchResults.length > 0 ? (
                  <>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{researchResults.length}</span> supplementary research signals
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                      {researchResults.map((asset) => (
                        <AssetCard
                          key={asset.id + "-research"}
                          asset={asset}
                          isSaved={savedAssetIds.has(asset.id)}
                          onUnsave={handleUnsave}
                        />
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No supplementary research signals found.
                  </p>
                )}
              </div>
            )}
          </div>
        </main>

        <div className="hidden lg:flex lg:flex-col w-72 shrink-0 border-l border-border sticky top-0 h-screen overflow-hidden">
          <ScoutSidebar
            onSearch={(q) => handleSearch(q)}
            researchSources={researchSources}
            onSourcesChange={setResearchSources}
          />
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
