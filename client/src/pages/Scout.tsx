import { useState, useMemo, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { OrientationHint } from "@/components/OrientationHint";
import { useLocation, useSearch } from "wouter";
import { INSTITUTIONS } from "@/lib/institutions";
import { SearchBar } from "@/components/SearchBar";
import { SearchResults } from "@/components/SearchResults";
import { ResearchCard } from "@/components/ResearchCard";
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
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { FileBarChart2, Loader2, Globe, SlidersHorizontal, X, Database, Search, Building2, FlaskConical, Radio, ChevronDown, Settings, ScrollText, Activity } from "lucide-react";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import type { SavedAsset } from "@shared/schema";
import type { ScoredAsset, BuyerProfile, ReportPayload } from "@/lib/types";
import { DEFAULT_BUYER_PROFILE } from "@/lib/types";
import { PatentCard } from "@/components/PatentCard";
import { ClinicalTrialCard } from "@/components/ClinicalTrialCard";

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

function scorePatentRelevance(asset: ScoredAsset): number {
  let score = 0;

  const meta = (asset.signals?.[0]?.metadata ?? {}) as Record<string, unknown>;

  const filingDateStr = (meta.filing_date as string | undefined) ?? asset.latest_signal_date;
  const filingDate = parseDateLoose(filingDateStr);
  if (filingDate) {
    const yearsAgo = (Date.now() - filingDate.getTime()) / (1000 * 60 * 60 * 24 * 365);
    if (yearsAgo < 1) score += 40;
    else if (yearsAgo < 2) score += 30;
    else if (yearsAgo < 3) score += 20;
    else if (yearsAgo < 5) score += 10;
  }

  const ownerType = ((meta.owner_type as string | undefined) ?? asset.owner_type ?? "unknown").toLowerCase().trim();
  if (ownerType === "university") score += 30;
  else if (ownerType === "unknown") score += 15;

  const patentStatus = ((meta.patent_status as string | undefined) ?? asset.patent_status ?? "unknown").toLowerCase().trim();
  if (patentStatus === "pending") score += 20;
  else if (patentStatus === "patented") score += 10;

  const authorsStr = (asset.signals?.[0]?.authors_or_owner as string | undefined) ?? "";
  const inventorCount = authorsStr
    ? authorsStr.split(",").map((s) => s.trim()).filter(Boolean).length
    : 0;
  if (inventorCount >= 3 && inventorCount <= 6) score += 10;
  else if (inventorCount >= 2) score += 7;
  else if (inventorCount === 1) score += 5;

  return score;
}

type InstitutionsResponse = {
  institutions: { institution: string; count: number }[];
  total: number;
};

const RESEARCH_SOURCE_OPTIONS = [
  { key: "pubmed",           label: "PubMed",              desc: "Biomedical literature" },
  { key: "biorxiv",          label: "bioRxiv",              desc: "Biology preprints" },
  { key: "medrxiv",          label: "medRxiv",              desc: "Clinical preprints" },
  { key: "nih_reporter",     label: "NIH Reporter",         desc: "Federal grants" },
  { key: "harvard",          label: "Harvard LibraryCloud", desc: "Harvard Library catalog: theses, journals, datasets" },
  { key: "openalex",         label: "OpenAlex",             desc: "Academic publications" },
  { key: "semantic_scholar", label: "Semantic Scholar",     desc: "Research papers" },
  { key: "europepmc",        label: "Europe PMC",           desc: "European biomedical literature" },
  { key: "arxiv",            label: "arXiv",                desc: "Physics & biology preprints" },
  { key: "chemrxiv",         label: "ChemRxiv",             desc: "Chemistry preprints" },
  { key: "zenodo",           label: "Zenodo",               desc: "Open research data" },
  { key: "pdb",              label: "PDB",                  desc: "Protein structures" },
  { key: "geo",              label: "GEO",                  desc: "Genomics expression data" },
  { key: "nsf_awards",       label: "NSF Awards",           desc: "National Science Foundation" },
  { key: "grants_gov",       label: "Grants.gov",           desc: "Federal grant database" },
  { key: "eu_clinicaltrials",label: "EU Clinical Trials",   desc: "EU trial registry" },
  { key: "eu_cordis",        label: "EU Cordis",            desc: "EU research programs" },
  { key: "lens",             label: "Lens.org",             desc: "Patents + literature" },
  { key: "doaj",             label: "DOAJ",                 desc: "Open access journals" },
  { key: "openaire",         label: "OpenAIRE",             desc: "European open research" },
  { key: "ieee",             label: "IEEE Xplore",          desc: "Engineering & biomedical" },
  { key: "core",             label: "CORE",                 desc: "Open access research" },
  { key: "base",             label: "BASE",                 desc: "Academic search engine" },
  { key: "eric",             label: "ERIC",                 desc: "Education research" },
  { key: "hal",              label: "HAL",                  desc: "French academic repository" },
  { key: "isrctn",           label: "ISRCTN",               desc: "Clinical trial registry" },
  { key: "socarxiv",         label: "SocArXiv",             desc: "Social science preprints" },
  { key: "psyarxiv",         label: "PsyArXiv",             desc: "Psychology preprints" },
  { key: "eartharxiv",       label: "EarthArXiv",           desc: "Earth science preprints" },
  { key: "engrxiv",          label: "EngrXiv",              desc: "Engineering preprints" },
  { key: "figshare",         label: "Figshare",             desc: "Research data & figures" },
  { key: "dryad",            label: "Dryad",                desc: "Scientific data repository" },
  { key: "biostudies",       label: "BioStudies",           desc: "Biological study data" },
  { key: "techtransfer",     label: "Tech Transfer",        desc: "TTO licensing database" },
  { key: "lab_discoveries",  label: "Lab Discoveries",      desc: "Research lab discoveries" },
];

const BUYER_PROFILE_KEY = "edenradar:buyer-profile";

function loadBuyerProfile(): BuyerProfile {
  try {
    const stored = localStorage.getItem(BUYER_PROFILE_KEY);
    if (stored) return { ...DEFAULT_BUYER_PROFILE, ...JSON.parse(stored) };
  } catch {}
  return DEFAULT_BUYER_PROFILE;
}

function SourcesDropdown({
  researchSources,
  onSourcesChange,
  open,
  onOpenChange,
}: {
  researchSources: string[];
  onSourcesChange: (sources: string[]) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  function toggleSource(key: string) {
    const next = researchSources.includes(key)
      ? researchSources.filter((s) => s !== key)
      : [...researchSources, key];
    onSourcesChange(next);
  }

  const label = researchSources.length === 0
    ? "Sources"
    : `Sources · ${researchSources.length}`;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          className={`inline-flex items-center gap-1 text-[11px] transition-colors shrink-0 ${
            researchSources.length > 0
              ? "text-primary font-semibold"
              : "text-muted-foreground hover:text-foreground"
          }`}
          data-testid="button-sources-dropdown"
        >
          <Database className="w-3 h-3" />
          {label}
          <ChevronDown className="w-3 h-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0 max-h-[420px] overflow-hidden flex flex-col">
        <div className="px-3 py-2.5 border-b border-border shrink-0">
          <p className="text-[11px] font-semibold text-foreground">Academic Sources</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Search academic databases alongside TTO assets. Patents and clinical trials each have their own dedicated tab.
            {researchSources.length > 0 && (
              <button
                className="ml-1.5 text-primary hover:underline"
                onClick={() => onSourcesChange([])}
              >
                Clear all
              </button>
            )}
          </p>
        </div>
        <div className="overflow-y-auto flex-1 p-2">
          <div className="grid grid-cols-2 gap-1">
            {RESEARCH_SOURCE_OPTIONS.map((src) => {
              const checked = researchSources.includes(src.key);
              return (
                <label
                  key={src.key}
                  className={`flex items-start gap-2 p-2 rounded-md border cursor-pointer transition-all ${
                    checked
                      ? "border-primary/30 bg-primary/5"
                      : "border-border/50 hover:border-primary/20 hover:bg-primary/[0.03]"
                  }`}
                  data-testid={`source-toggle-${src.key}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleSource(src.key)}
                    className="mt-0.5 accent-primary w-3 h-3 shrink-0"
                  />
                  <div className="min-w-0">
                    <p className={`text-[10px] font-semibold leading-tight ${checked ? "text-primary" : "text-foreground"}`}>
                      {src.label}
                    </p>
                    <p className="text-[9px] text-muted-foreground leading-tight mt-0.5">{src.desc}</p>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
        {researchSources.length > 0 && (
          <div className="shrink-0 px-3 py-2 border-t border-border">
            <p className="text-[10px] text-muted-foreground">{researchSources.length} of {RESEARCH_SOURCE_OPTIONS.length} sources active</p>
          </div>
        )}
      </PopoverContent>
    </Popover>
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
  const [patentResults, setPatentResults] = useState<ScoredAsset[]>(() => ssGet("scout-patent-results", []));
  const [hasSearched, setHasSearched] = useState<boolean>(() => ssGet("scout-has-searched", false));
  const [currentQuery, setCurrentQuery] = useState<string>(() => ssGet("scout-query", ""));
  const [inputQuery, setInputQuery] = useState<string>(() => ssGet("scout-query", ""));
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [modalityFilter, setModalityFilter] = useState<string>("all");
  const [institutionFilter, setInstitutionFilter] = useState<string>("all");
  const [sinceFilter, setSinceFilter] = useState<string>("any");
  const [sortMode, setSortMode] = useState<"score" | "recency">("score");
  const [minScore, setMinScore] = useState<number>(0);
  const [buyerProfile, setBuyerProfile] = useState<BuyerProfile>(loadBuyerProfile);
  const skipNextPersist = useRef(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [patentSortMode, setPatentSortMode] = useState<"newest" | "best_match">(() => ssGet("scout-patent-sort", "newest"));
  const [patentOwnerFilter, setPatentOwnerFilter] = useState<"all" | "university" | "company">(() => ssGet("scout-patent-owner", "all"));
  const [patentAssigneeSearch, setPatentAssigneeSearch] = useState<string>(() => ssGet("scout-patent-assignee", ""));
  const [patentDateFilter, setPatentDateFilter] = useState<"any" | "6m" | "2024" | "2023" | "2022">(() => ssGet("scout-patent-date", "any"));
  const [resultTab, setResultTab] = useState<"assets" | "patents" | "trials" | "research">(() => ssGet("scout-result-tab", "assets"));
  const DEFAULT_RESEARCH_SOURCES: string[] = ["pubmed"];
  const [researchSources, setResearchSources] = useState<string[]>(() => {
    try {
      const raw = sessionStorage.getItem("scout-research-sources");
      const stored = raw ? JSON.parse(raw) as string[] : DEFAULT_RESEARCH_SOURCES;
      return stored.filter((s: string) => s !== "clinicaltrials");
    } catch { return DEFAULT_RESEARCH_SOURCES; }
  });

  const [sourcesDropdownOpen, setSourcesDropdownOpen] = useState(false);

  const [trialResults, setTrialResults] = useState<ScoredAsset[]>(() => ssGet("scout-trial-results", []));
  const [trialSortMode, setTrialSortMode] = useState<"newest" | "by_phase">(() => ssGet("scout-trial-sort", "newest"));
  const [trialPhaseFilter, setTrialPhaseFilter] = useState<"all" | "phase 1" | "phase 2" | "phase 3" | "preclinical">(() => ssGet("scout-trial-phase", "all"));
  const [trialStatusFilter, setTrialStatusFilter] = useState<"all" | "recruiting" | "active" | "completed">(() => ssGet("scout-trial-status", "all"));
  const [trialSponsorSearch, setTrialSponsorSearch] = useState<string>(() => ssGet("scout-trial-sponsor", ""));

  const PATENT_PAGE_SIZE = 25;
  const RESEARCH_PAGE_SIZE = 30;
  const TRIAL_PAGE_SIZE = 25;
  const [shownPatentCount, setShownPatentCount] = useState(PATENT_PAGE_SIZE);
  const [shownResearchCount, setShownResearchCount] = useState(RESEARCH_PAGE_SIZE);
  const [shownTrialCount, setShownTrialCount] = useState(TRIAL_PAGE_SIZE);

  useEffect(() => { setShownPatentCount(PATENT_PAGE_SIZE); }, [patentResults, patentOwnerFilter, patentAssigneeSearch, patentSortMode, patentDateFilter]);
  useEffect(() => { setShownResearchCount(RESEARCH_PAGE_SIZE); }, [researchResults]);
  useEffect(() => { setShownTrialCount(TRIAL_PAGE_SIZE); }, [trialResults, trialPhaseFilter, trialStatusFilter, trialSponsorSearch, trialSortMode]);

  useEffect(() => {
    const params = new URLSearchParams(searchStr);
    const qParam = params.get("q");
    const draftParam = params.get("draft");
    if (qParam && qParam.trim()) {
      const q = qParam.trim();
      setInputQuery(q);
      setCurrentQuery(q);
      setResearchResults([]);
      setPatentResults([]);
      setTrialResults([]);
      setPatentSortMode("newest");
      setPatentOwnerFilter("all");
      setPatentAssigneeSearch("");
      setTrialPhaseFilter("all");
      setTrialStatusFilter("all");
      setTrialSponsorSearch("");
      setTrialSortMode("newest");
      setResultTab("assets");
      searchMutation.mutate({ query: q });
      patentMutation.mutate({ query: q });
      trialMutation.mutate({ query: q });
      if (researchSources.length > 0) {
        researchMutation.mutate({ query: q, sources: researchSources });
      }
      setLocation("/scout", { replace: true });
    } else if (draftParam && draftParam.trim()) {
      setInputQuery(draftParam.trim());
      setLocation("/scout", { replace: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem("scout-results", JSON.stringify(searchResults));
      sessionStorage.setItem("scout-research-results", JSON.stringify(researchResults));
      sessionStorage.setItem("scout-patent-results", JSON.stringify(patentResults));
      sessionStorage.setItem("scout-trial-results", JSON.stringify(trialResults));
      sessionStorage.setItem("scout-has-searched", JSON.stringify(hasSearched));
      sessionStorage.setItem("scout-query", JSON.stringify(currentQuery));
      sessionStorage.setItem("scout-research-sources", JSON.stringify(researchSources));
      sessionStorage.setItem("scout-result-tab", JSON.stringify(resultTab));
      sessionStorage.setItem("scout-patent-sort", JSON.stringify(patentSortMode));
      sessionStorage.setItem("scout-patent-owner", JSON.stringify(patentOwnerFilter));
      sessionStorage.setItem("scout-patent-assignee", JSON.stringify(patentAssigneeSearch));
      sessionStorage.setItem("scout-patent-date", JSON.stringify(patentDateFilter));
      sessionStorage.setItem("scout-trial-sort", JSON.stringify(trialSortMode));
      sessionStorage.setItem("scout-trial-phase", JSON.stringify(trialPhaseFilter));
      sessionStorage.setItem("scout-trial-status", JSON.stringify(trialStatusFilter));
      sessionStorage.setItem("scout-trial-sponsor", JSON.stringify(trialSponsorSearch));
    } catch {}
  }, [searchResults, researchResults, patentResults, trialResults, hasSearched, currentQuery, researchSources, resultTab, patentSortMode, patentOwnerFilter, patentAssigneeSearch, patentDateFilter, trialSortMode, trialPhaseFilter, trialStatusFilter, trialSponsorSearch]);

  useEffect(() => {
    if (skipNextPersist.current) {
      skipNextPersist.current = false;
      return;
    }
    try {
      localStorage.setItem(BUYER_PROFILE_KEY, JSON.stringify(buyerProfile));
    } catch {}
  }, [buyerProfile]);

  function handleClearProfile() {
    skipNextPersist.current = true;
    try {
      localStorage.removeItem(BUYER_PROFILE_KEY);
    } catch {}
  }

  const { data: savedData } = useQuery<SavedAssetsResponse>({ queryKey: ["/api/saved-assets"] });
  const { data: institutionsData } = useQuery<InstitutionsResponse>({
    queryKey: ["/api/scout/institutions"],
    staleTime: 10 * 60 * 1000,
  });
  const liveInstitutionCount = institutionsData?.total ?? COVERED_INSTITUTIONS.length;


  function getDateBounds(filter: string): { since?: string; before?: string } {
    const now = Date.now();
    if (filter === "6m") return { since: new Date(now - 183 * 24 * 60 * 60 * 1000).toISOString() };
    if (filter === "2024") return { since: new Date("2024-01-01").toISOString() };
    if (filter === "2023") return { since: new Date("2023-01-01").toISOString() };
    if (filter === "2022") return { before: new Date("2023-01-01").toISOString() };
    return {};
  }

  const searchMutation = useMutation({
    mutationFn: async ({ query }: { query: string }) => {
      const profileModality = buyerProfile.modalities.length === 1 ? buyerProfile.modalities[0] : undefined;
      const profileStage = buyerProfile.preferred_stages.length === 1 ? buyerProfile.preferred_stages[0] : undefined;
      const profileIndication = buyerProfile.indication_keywords.length === 1 ? buyerProfile.indication_keywords[0] : undefined;
      const dateBounds = getDateBounds(sinceFilter);
      const res = await apiRequest("POST", "/api/scout/search", {
        query,
        minSimilarity: 0.40,
        limit: 100,
        ...(profileModality ? { modality: profileModality } : {}),
        ...(profileStage ? { stage: profileStage } : {}),
        ...(profileIndication ? { indication: profileIndication } : {}),
        ...dateBounds,
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
      const backendSources = sources.map((k) => k === "harvard" ? "harvard_librarycloud" : k);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 40_000);
      try {
        const res = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, sources: backendSources, maxPerSource: 20, buyerProfile }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error ?? "Research search failed");
        }
        return res.json() as Promise<SearchResponse>;
      } catch (err: any) {
        clearTimeout(timeoutId);
        if (err.name === "AbortError") {
          throw new Error("Research signals timed out after 40 seconds.");
        }
        throw err;
      }
    },
    onSuccess: (data) => {
      setResearchResults(data.assets ?? []);
    },
    onError: () => {
      setResearchResults([]);
    },
  });

  const patentMutation = useMutation({
    mutationFn: async ({ query, patentSince }: { query: string; patentSince?: string }) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30_000);
      try {
        const body: Record<string, unknown> = { query, sources: ["patents"], maxPerSource: 100, buyerProfile };
        if (patentSince && patentSince !== "any") {
          body.patentSince = patentSince;
        }
        const res = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error ?? "Patent search failed");
        }
        return res.json() as Promise<SearchResponse>;
      } catch (err: any) {
        clearTimeout(timeoutId);
        if (err.name === "AbortError") {
          throw new Error("Patent search timed out.");
        }
        throw err;
      }
    },
    onSuccess: (data) => {
      setPatentResults(data.assets ?? []);
    },
    onError: () => {
      setPatentResults([]);
    },
  });

  const trialMutation = useMutation({
    mutationFn: async ({ query }: { query: string }) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30_000);
      try {
        const res = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, sources: ["clinicaltrials"], maxPerSource: 50, buyerProfile }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error ?? "Clinical trials search failed");
        }
        return res.json() as Promise<SearchResponse>;
      } catch (err: any) {
        clearTimeout(timeoutId);
        if (err.name === "AbortError") {
          throw new Error("Clinical trials search timed out.");
        }
        throw err;
      }
    },
    onSuccess: (data) => {
      setTrialResults(data.assets ?? []);
    },
    onError: () => {
      setTrialResults([]);
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
      apiRequest("POST", "/api/saved-reports", {
        title: report.title || `Report: ${currentQuery}`,
        query: report.query ?? currentQuery,
        assetsJson: report.top_assets as unknown as Record<string, unknown>[],
        reportJson: report as unknown as Record<string, unknown>,
      }).catch(() => {});
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

  const saveMutation = useMutation({
    mutationFn: async (asset: ScoredAsset) => {
      const signal = asset.signals?.[0];
      const rawSourceTypes = asset.source_types ?? [];
      const isPatent = rawSourceTypes.some((s) => s === "patent");
      const isTrial = rawSourceTypes.some((s) => s === "clinical_trial");
      const canonicalSource = isPatent ? "patent" : isTrial ? "clinical_trial" : rawSourceTypes[0] ?? "unknown";
      const patentId = (signal?.metadata?.patent_id as string) ?? null;
      const nctId = (signal?.metadata?.nct_id as string) ?? null;
      const dedupeKey = (isPatent && patentId) ? patentId : (isTrial && nctId) ? nctId : asset.id;
      const res = await apiRequest("POST", "/api/saved-assets", {
        asset_name: asset.asset_name,
        target: asset.target,
        modality: asset.modality,
        development_stage: asset.development_stage,
        disease_indication: asset.indication,
        summary: asset.summary,
        source_title: signal?.title ?? asset.asset_name,
        source_journal: asset.institution !== "unknown" ? asset.institution : "Unknown",
        publication_year: asset.latest_signal_date?.slice(0, 4) ?? "Unknown",
        source_name: canonicalSource,
        source_url: asset.source_urls?.[0] ?? undefined,
        pmid: dedupeKey,
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/saved-assets"] });
      toast({ title: "Saved to pipeline" });
    },
    onError: (err: any) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  const savedAssets = savedData?.assets ?? [];
  const savedAssetIds = new Set(savedAssets.map((a) => a.pmid ?? a.assetName).filter(Boolean) as string[]);

  const handleSearch = (query: string) => {
    setCurrentQuery(query);
    setInputQuery(query);
    setResearchResults([]);
    setPatentResults([]);
    setTrialResults([]);
    setPatentSortMode("newest");
    setPatentOwnerFilter("all");
    setPatentAssigneeSearch("");
    setPatentDateFilter("any");
    setTrialPhaseFilter("all");
    setTrialStatusFilter("all");
    setTrialSponsorSearch("");
    setTrialSortMode("newest");
    setResultTab("assets");
    searchMutation.mutate({ query });
    patentMutation.mutate({ query });
    trialMutation.mutate({ query });
    if (researchSources.length > 0) {
      researchMutation.mutate({ query, sources: researchSources });
    }
  };

  const handleChipClick = (query: string) => {
    setInputQuery(query);
    handleSearch(query);
  };

  const handleClearSearch = () => {
    setCurrentQuery("");
    setInputQuery("");
    setSearchResults([]);
    setResearchResults([]);
    setPatentResults([]);
    setTrialResults([]);
    setHasSearched(false);
    setStageFilter("all");
    setModalityFilter("all");
    setInstitutionFilter("all");
    setSortMode("score");
    setMinScore(0);
    setTrialPhaseFilter("all");
    setTrialStatusFilter("all");
    setTrialSponsorSearch("");
    setTrialSortMode("newest");
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
    let results = searchResults.filter((asset) => {
      const stageOk = stageFilter === "all" || asset.development_stage?.toLowerCase() === stageFilter;
      const modalityOk = modalityFilter === "all" || asset.modality?.toLowerCase() === modalityFilter;
      const institutionOk = institutionFilter === "all" || asset.institution === institutionFilter;
      const scoreOk = minScore === 0 || asset.score >= minScore;
      return stageOk && modalityOk && institutionOk && scoreOk;
    });
    if (sortMode === "recency") {
      results = [...results].sort((a, b) => {
        const da = parseDateLoose(a.latest_signal_date)?.getTime() ?? 0;
        const db = parseDateLoose(b.latest_signal_date)?.getTime() ?? 0;
        if (db !== da) return db - da;
        return (a.id ?? "").localeCompare(b.id ?? "");
      });
    } else {
      results = [...results].sort((a, b) => {
        const diff = b.score - a.score;
        if (diff !== 0) return diff;
        return (a.id ?? "").localeCompare(b.id ?? "");
      });
    }
    return results;
  }, [searchResults, stageFilter, modalityFilter, institutionFilter, sortMode, minScore]);

  const filteredPatentResults = useMemo(() => {
    const now = Date.now();
    const patentDateSince: Date | null =
      patentDateFilter === "6m" ? new Date(now - 183 * 24 * 60 * 60 * 1000) :
      patentDateFilter === "2024" ? new Date("2024-01-01") :
      patentDateFilter === "2023" ? new Date("2023-01-01") :
      null;
    const patentDateBefore: Date | null =
      patentDateFilter === "2022" ? new Date("2023-01-01") : null;

    let results = patentResults.filter((asset) => {
      const ownerType = (asset.signals?.[0]?.metadata?.owner_type as string) ?? asset.owner_type ?? "unknown";
      const ownerOk = patentOwnerFilter === "all" || ownerType === patentOwnerFilter;
      const assignee = asset.institution && asset.institution !== "unknown"
        ? asset.institution
        : asset.owner_name && asset.owner_name !== "unknown"
        ? asset.owner_name
        : "";
      const assigneeOk = !patentAssigneeSearch.trim() ||
        assignee.toLowerCase().includes(patentAssigneeSearch.trim().toLowerCase());
      let dateOk = true;
      if (patentDateSince || patentDateBefore) {
        const filingDate = asset.signals?.[0]?.metadata?.filing_date as string | undefined;
        const d = parseDateLoose(asset.latest_signal_date) ?? parseDateLoose(filingDate);
        if (!d) {
          dateOk = false;
        } else {
          if (patentDateSince && d < patentDateSince) dateOk = false;
          if (patentDateBefore && d >= patentDateBefore) dateOk = false;
        }
      }
      return ownerOk && assigneeOk && dateOk;
    });
    if (patentSortMode === "best_match") {
      const scored = results.map((a) => ({ asset: a, relevance: scorePatentRelevance(a) }));
      scored.sort((a, b) => {
        const diff = b.relevance - a.relevance;
        if (diff !== 0) return diff;
        return (a.asset.id ?? "").localeCompare(b.asset.id ?? "");
      });
      results = scored.map((s) => s.asset);
    } else {
      results = [...results].sort((a, b) => {
        const da = parseDateLoose(a.latest_signal_date)?.getTime() ?? 0;
        const db = parseDateLoose(b.latest_signal_date)?.getTime() ?? 0;
        if (db !== da) return db - da;
        return (a.id ?? "").localeCompare(b.id ?? "");
      });
    }
    return results;
  }, [patentResults, patentOwnerFilter, patentAssigneeSearch, patentSortMode, patentDateFilter]);

  const filteredTrialResults = useMemo(() => {
    let results = trialResults;
    if (trialPhaseFilter !== "all") {
      results = results.filter((a) => {
        const stage = (a.development_stage ?? "").toLowerCase().trim();
        return stage === trialPhaseFilter;
      });
    }
    if (trialStatusFilter !== "all") {
      results = results.filter((a) => {
        const st = ((a.signals?.[0]?.metadata?.status as string) ?? "").toLowerCase();
        if (trialStatusFilter === "recruiting") return st === "recruiting";
        if (trialStatusFilter === "active") return st === "active_not_recruiting";
        if (trialStatusFilter === "completed") return st === "completed";
        return true;
      });
    }
    if (trialSponsorSearch.trim()) {
      const q = trialSponsorSearch.trim().toLowerCase();
      results = results.filter((a) => {
        const sp = ((a.institution ?? a.owner_name ?? "")).toLowerCase();
        return sp.includes(q);
      });
    }
    if (trialSortMode === "by_phase") {
      const phaseOrder: Record<string, number> = { "phase 3": 0, "phase 2": 1, "phase 1": 2, "approved": 3, "preclinical": 4 };
      results = [...results].sort((a, b) => {
        const ao = phaseOrder[(a.development_stage ?? "").toLowerCase()] ?? 5;
        const bo = phaseOrder[(b.development_stage ?? "").toLowerCase()] ?? 5;
        if (ao !== bo) return ao - bo;
        return (a.id ?? "").localeCompare(b.id ?? "");
      });
    } else {
      results = [...results].sort((a, b) => {
        const da = parseDateLoose(a.latest_signal_date)?.getTime() ?? 0;
        const db = parseDateLoose(b.latest_signal_date)?.getTime() ?? 0;
        if (db !== da) return db - da;
        return (a.id ?? "").localeCompare(b.id ?? "");
      });
    }
    return results;
  }, [trialResults, trialPhaseFilter, trialStatusFilter, trialSponsorSearch, trialSortMode]);

  const trialSponsorFiltered = useMemo(() => {
    if (!trialSponsorSearch.trim()) return trialResults;
    const q = trialSponsorSearch.trim().toLowerCase();
    return trialResults.filter((a) => {
      const sp = ((a.institution ?? a.owner_name ?? "")).toLowerCase();
      return sp.includes(q);
    });
  }, [trialResults, trialSponsorSearch]);

  const showControls = !searchMutation.isPending && hasSearched && searchResults.length > 0;
  const isAnyPending = searchMutation.isPending || reportMutation.isPending;

  const activeFilterCount = [
    stageFilter !== "all",
    modalityFilter !== "all",
    institutionFilter !== "all",
    sinceFilter !== "any",
    sortMode !== "score",
    minScore !== 0,
  ].filter(Boolean).length;

  return (
    <div className="min-h-full flex flex-col bg-gradient-to-b from-background via-background to-muted/20">
      <div className="flex flex-1 w-full">
        <main className="flex-1 min-w-0 flex flex-col">
          <div className="px-4 sm:px-6 pt-8 pb-5 space-y-4">
            <div className="max-w-3xl mx-auto text-center mb-6 relative">
              <button
                onClick={() => setLocation("/settings")}
                className="absolute right-0 top-0 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
                data-testid="button-scout-settings"
                title="Settings"
              >
                <Settings className="w-4 h-4" />
              </button>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">
                <span className="gradient-text dark:gradient-text gradient-text-light">
                  Asset Discovery
                </span>
              </h1>
              <p className="text-muted-foreground text-sm max-w-xl mx-auto">
                Semantic search across indexed TTO assets from leading research institutions, matched to your buyer thesis.
              </p>
            </div>

            {!hasSearched && (
              <div className="max-w-3xl mx-auto">
                <OrientationHint
                  hintId="scout-cross-source"
                  title="TTO asset discovery."
                  body="Search across 300+ TTO disclosures, scored against your buyer thesis. Results automatically include patents and clinical trials in their dedicated tabs. Optionally add PubMed or preprint sources via the Sources selector."
                  accent="emerald"
                />
              </div>
            )}

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
                  placeholder="Search indications, targets, modalities, mechanisms..."
                />
              </div>
              {inputQuery.trim().length > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 h-10 w-10 text-muted-foreground hover:text-foreground"
                  onClick={handleClearSearch}
                  data-testid="button-clear-search"
                  title="New search"
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
              <div className="h-3 w-px bg-border/60" />
              <SourcesDropdown
                researchSources={researchSources}
                onSourcesChange={setResearchSources}
                open={sourcesDropdownOpen}
                onOpenChange={setSourcesDropdownOpen}
              />
            </div>

            <BuyerProfileForm value={buyerProfile} onChange={setBuyerProfile} onClear={handleClearProfile} />
          </div>

          {/* TTO loading indicator */}
          {searchMutation.isPending && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-primary opacity-60" />
            </div>
          )}

          {/* Patents compiling banner — shows alongside TTO results while patent search is pending */}
          {hasSearched && !searchMutation.isPending && patentMutation.isPending && (
            <div className="px-4 sm:px-6 pb-2">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/15 text-xs text-muted-foreground" data-testid="patents-compiling-banner">
                <Loader2 className="w-3 h-3 animate-spin text-amber-600 dark:text-amber-400 shrink-0" />
                <span>Compiling patents...</span>
              </div>
            </div>
          )}

          {/* Patents failed banner */}
          {hasSearched && !searchMutation.isPending && patentMutation.isError && (
            <div className="px-4 sm:px-6 pb-2">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border border-card-border text-xs text-muted-foreground" data-testid="patents-error-banner">
                <Radio className="w-3 h-3 shrink-0 opacity-40" />
                <span>Patent database unavailable. Showing TTO results only.</span>
              </div>
            </div>
          )}

          {/* Research signals compiling banner — shows alongside TTO results while research is still pending */}
          {hasSearched && !searchMutation.isPending && researchMutation.isPending && researchSources.length > 0 && (
            <div className="px-4 sm:px-6 pb-2">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/15 text-xs text-muted-foreground" data-testid="research-compiling-banner">
                <Loader2 className="w-3 h-3 animate-spin text-primary shrink-0" />
                <span>Compiling research signals from {researchSources.length === 1
                  ? (RESEARCH_SOURCE_OPTIONS.find(s => s.key === researchSources[0])?.label ?? researchSources[0])
                  : `${researchSources.length} sources`}...</span>
              </div>
            </div>
          )}

          {/* Research signals failed banner */}
          {hasSearched && !searchMutation.isPending && researchMutation.isError && researchSources.length > 0 && (
            <div className="px-4 sm:px-6 pb-2">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border border-card-border text-xs text-muted-foreground" data-testid="research-error-banner">
                <Radio className="w-3 h-3 shrink-0 opacity-40" />
                <span>Research signals unavailable.</span>
              </div>
            </div>
          )}

          {/* Tab toggle — shown as soon as TTO is done; always shows TTO + Patents, Research shown when sources are active */}
          {hasSearched && !searchMutation.isPending && (
            <div className="px-4 sm:px-6 pb-2">
              <div className="flex justify-center w-full">
                <div className="grid w-full items-stretch rounded-lg border border-border overflow-hidden shadow-sm" style={{ gridTemplateColumns: '1fr 1px 1fr 1px 1fr 1px 1fr' }} data-testid="result-tab-toggle">
                  <button
                    onClick={() => setResultTab("assets")}
                    className={`flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold transition-colors whitespace-nowrap ${
                      resultTab === "assets"
                        ? "bg-primary text-primary-foreground"
                        : "bg-background text-muted-foreground hover:text-foreground"
                    }`}
                    data-testid="result-tab-assets"
                  >
                    <Building2 className="w-4 h-4 shrink-0" />
                    Tech Transfer Assets
                    <span className={`ml-1 inline-flex items-center justify-center min-w-[20px] h-5 rounded px-1.5 text-[10px] font-bold ${
                      resultTab === "assets" ? "bg-white/25 text-white" : "bg-primary/10 text-primary"
                    }`}>
                      {filteredResults.length}
                    </span>
                  </button>
                  <div className="w-px bg-border shrink-0" />
                  <button
                    onClick={() => setResultTab("patents")}
                    className={`flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold transition-colors whitespace-nowrap ${
                      resultTab === "patents"
                        ? "bg-amber-600 text-white"
                        : "bg-background text-muted-foreground hover:text-foreground"
                    }`}
                    data-testid="result-tab-patents"
                  >
                    {patentMutation.isPending
                      ? <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
                      : <ScrollText className="w-4 h-4 shrink-0" />
                    }
                    Patents
                    {patentMutation.isPending ? (
                      <span className="ml-1 text-[10px] italic font-normal opacity-70">Searching...</span>
                    ) : (
                      <span className={`ml-1 inline-flex items-center justify-center min-w-[20px] h-5 rounded px-1.5 text-[10px] font-bold ${
                        resultTab === "patents" ? "bg-white/25 text-white" : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                      }`}>
                        {patentResults.length}
                      </span>
                    )}
                  </button>
                  <div className="w-px bg-border shrink-0" />
                  <button
                    onClick={() => setResultTab("trials")}
                    className={`flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold transition-colors whitespace-nowrap ${
                      resultTab === "trials"
                        ? "bg-teal-600 text-white"
                        : "bg-background text-muted-foreground hover:text-foreground"
                    }`}
                    data-testid="result-tab-trials"
                  >
                    {trialMutation.isPending
                      ? <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
                      : <Activity className="w-4 h-4 shrink-0" />
                    }
                    Clinical Trials
                    {trialMutation.isPending ? (
                      <span className="ml-1 text-[10px] italic font-normal opacity-70">Searching...</span>
                    ) : (
                      <span className={`ml-1 inline-flex items-center justify-center min-w-[20px] h-5 rounded px-1.5 text-[10px] font-bold ${
                        resultTab === "trials" ? "bg-white/25 text-white" : "bg-teal-500/10 text-teal-600 dark:text-teal-400"
                      }`}>
                        {trialResults.length}
                      </span>
                    )}
                  </button>
                  <div className="w-px bg-border shrink-0" />
                  <button
                    onClick={() => setResultTab("research")}
                    className={`flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold transition-colors whitespace-nowrap ${
                      resultTab === "research"
                        ? "bg-primary text-primary-foreground"
                        : "bg-background text-muted-foreground hover:text-foreground"
                    }`}
                    data-testid="result-tab-research"
                  >
                    {researchMutation.isPending
                      ? <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
                      : <FlaskConical className="w-4 h-4 shrink-0" />
                    }
                    External Research Papers
                    {researchMutation.isPending ? (
                      <span className="ml-1 text-[10px] italic font-normal opacity-70">Compiling...</span>
                    ) : (
                      <span className={`ml-1 inline-flex items-center justify-center min-w-[20px] h-5 rounded px-1.5 text-[10px] font-bold ${
                        resultTab === "research" ? "bg-white/25 text-white" : "bg-primary/10 text-primary"
                      }`}>
                        {researchResults.length}
                      </span>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Active filter chips — only on assets tab */}
          {showControls && activeFilterCount > 0 && resultTab === "assets" && (
            <div className="px-4 sm:px-6 pb-3">
              <div className="flex flex-wrap items-center gap-2">
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
              </div>
            </div>
          )}

          <div className="flex-1 px-4 sm:px-6 pb-10 space-y-6">
            {/* Assets tab — TTO results shown immediately once TTO query resolves; not blocked by patent/research loading */}
            {(resultTab === "assets" || !hasSearched) && !searchMutation.isPending && (
              <>
                {/* Threshold + action controls — always visible after a search so users can escape a restrictive threshold */}
                {hasSearched && (
                  <div className="flex items-end justify-start gap-4">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Score Filter</span>
                      <div className="inline-flex items-stretch rounded-md border border-border overflow-hidden" data-testid="score-threshold-toggle">
                        {([0, 60, 70, 80] as const).map((threshold) => (
                          <button
                            key={threshold}
                            onClick={() => setMinScore(threshold)}
                            className={`px-2 py-1 text-[10px] font-semibold transition-colors border-r border-border last:border-r-0 ${
                              minScore === threshold
                                ? "bg-primary text-primary-foreground"
                                : "bg-background text-muted-foreground hover:text-foreground"
                            }`}
                            data-testid={`score-threshold-${threshold}`}
                          >
                            {threshold === 0 ? "Any" : `${threshold}+`}
                          </button>
                        ))}
                      </div>
                    </div>
                    <Select value={sinceFilter} onValueChange={setSinceFilter} data-testid="filter-since-inline">
                      <SelectTrigger className="h-7 text-[11px] w-[110px] border-border">
                        <SelectValue placeholder="Any time" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any time</SelectItem>
                        <SelectItem value="6m">Last 6 months</SelectItem>
                        <SelectItem value="2024">2024</SelectItem>
                        <SelectItem value="2023">2023</SelectItem>
                        <SelectItem value="2022">2022 and older</SelectItem>
                      </SelectContent>
                    </Select>
                    <button
                      onClick={() => setFiltersOpen(true)}
                      className="text-[11px] text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
                      data-testid="button-filters-hint"
                    >
                      <SlidersHorizontal className="w-3 h-3" />
                      {activeFilterCount > 0 ? `${activeFilterCount} active` : "Refine"}
                    </button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-[11px] h-7 border-primary/30 text-primary hover:bg-primary/5 hover:text-primary"
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
                  </div>
                )}

                {hasSearched && filteredResults.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                    <Search className="w-8 h-8 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">
                      Try refining your search for <span className="font-medium text-foreground">"{currentQuery}"</span>
                    </p>
                  </div>
                ) : (
                  <SearchResults
                    assets={filteredResults}
                    isLoading={false}
                    hasSearched={hasSearched}
                    query={currentQuery}
                    savedAssetIds={savedAssetIds}
                    onUnsave={handleUnsave}
                    onChipClick={handleChipClick}
                  />
                )}
              </>
            )}

            {/* Patents tab — loading state */}
            {hasSearched && resultTab === "patents" && !searchMutation.isPending && patentMutation.isPending && (
              <div className="flex flex-col items-center justify-center py-16 gap-4 text-center" data-testid="patents-loading-state">
                <Loader2 className="w-8 h-8 animate-spin text-amber-500 opacity-70" />
                <div>
                  <p className="text-sm font-medium text-foreground mb-1">Searching patent databases...</p>
                  <p className="text-xs text-muted-foreground">Querying USPTO PatentsView for "{currentQuery}"</p>
                </div>
              </div>
            )}

            {/* Patents tab — results */}
            {hasSearched && resultTab === "patents" && !searchMutation.isPending && !patentMutation.isPending && (
              <>
                {patentResults.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                    <ScrollText className="w-8 h-8 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">
                      No patents found for <span className="font-medium text-foreground">"{currentQuery}"</span>
                    </p>
                    <p className="text-xs text-muted-foreground">Try broader terms or a different indication.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Patent controls */}
                    <div className="flex flex-wrap items-center gap-3">
                      {/* Sort toggle */}
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Sort</span>
                        <div className="inline-flex items-stretch rounded-md border border-border overflow-hidden" data-testid="patent-sort-toggle">
                          {(["newest", "best_match"] as const).map((mode) => (
                            <button
                              key={mode}
                              onClick={() => setPatentSortMode(mode)}
                              className={`px-2.5 py-1 text-[10px] font-semibold transition-colors border-r border-border last:border-r-0 ${
                                patentSortMode === mode
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-background text-muted-foreground hover:text-foreground"
                              }`}
                              data-testid={`patent-sort-${mode}`}
                            >
                              {mode === "newest" ? "Newest" : "Best Match"}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Owner type filter */}
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Assignee Type</span>
                        <div className="inline-flex items-stretch rounded-md border border-border overflow-hidden" data-testid="patent-owner-filter">
                          {(["all", "university", "company"] as const).map((type) => (
                            <button
                              key={type}
                              onClick={() => setPatentOwnerFilter(type)}
                              className={`px-2.5 py-1 text-[10px] font-semibold capitalize transition-colors border-r border-border last:border-r-0 ${
                                patentOwnerFilter === type
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-background text-muted-foreground hover:text-foreground"
                              }`}
                              data-testid={`patent-owner-filter-${type}`}
                            >
                              {type === "all" ? "All" : type === "university" ? "University" : "Company"}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Date range filter */}
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Date</span>
                        <div className="inline-flex items-stretch rounded-md border border-border overflow-hidden" data-testid="patent-date-filter">
                          {(["any", "6m", "2024", "2023", "2022"] as const).map((opt) => (
                            <button
                              key={opt}
                              onClick={() => {
                                setPatentDateFilter(opt);
                                if (currentQuery) {
                                  patentMutation.mutate({ query: currentQuery, patentSince: opt !== "any" ? opt : undefined });
                                }
                              }}
                              className={`px-2.5 py-1 text-[10px] font-semibold transition-colors border-r border-border last:border-r-0 ${
                                patentDateFilter === opt
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-background text-muted-foreground hover:text-foreground"
                              }`}
                              data-testid={`patent-date-filter-${opt}`}
                            >
                              {opt === "any" ? "Any time" : opt === "6m" ? "Last 6 months" : opt === "2022" ? "2022 and older" : opt}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Assignee search */}
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Assignee</span>
                        <div className="relative">
                          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                          <Input
                            value={patentAssigneeSearch}
                            onChange={(e) => setPatentAssigneeSearch(e.target.value)}
                            placeholder="Filter by assignee…"
                            className="h-7 pl-6 pr-2 text-[11px] w-[160px] border-border"
                            data-testid="input-patent-assignee-search"
                          />
                        </div>
                      </div>

                      {/* Active filter chips */}
                      {(patentOwnerFilter !== "all" || patentAssigneeSearch.trim() || patentDateFilter !== "any") && (
                        <div className="flex items-center gap-1.5 flex-wrap mt-4">
                          {patentOwnerFilter !== "all" && (
                            <Badge variant="secondary" className="text-[11px] gap-1 cursor-pointer capitalize" onClick={() => setPatentOwnerFilter("all")} data-testid="patent-active-filter-owner">
                              {patentOwnerFilter} ×
                            </Badge>
                          )}
                          {patentDateFilter !== "any" && (
                            <Badge variant="secondary" className="text-[11px] gap-1 cursor-pointer" onClick={() => {
                              setPatentDateFilter("any");
                              if (currentQuery) {
                                patentMutation.mutate({ query: currentQuery });
                              }
                            }} data-testid="patent-active-filter-date">
                              {patentDateFilter === "6m" ? "Last 6 months" : patentDateFilter === "2022" ? "2022 and older" : patentDateFilter} ×
                            </Badge>
                          )}
                          {patentAssigneeSearch.trim() && (
                            <Badge variant="secondary" className="text-[11px] gap-1 cursor-pointer" onClick={() => setPatentAssigneeSearch("")} data-testid="patent-active-filter-assignee">
                              "{patentAssigneeSearch}" ×
                            </Badge>
                          )}
                          <button
                            onClick={() => {
                              setPatentOwnerFilter("all");
                              setPatentAssigneeSearch("");
                              setPatentDateFilter("any");
                              if (patentDateFilter !== "any" && currentQuery) {
                                patentMutation.mutate({ query: currentQuery });
                              }
                            }}
                            className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2 ml-1 transition-colors"
                            data-testid="button-clear-patent-filters"
                          >
                            Clear filters
                          </button>
                        </div>
                      )}
                    </div>

                    <p className="text-sm text-muted-foreground" data-testid="patents-results-count">
                      {filteredPatentResults.length > shownPatentCount ? (
                        <>Showing <span className="text-foreground font-semibold">{shownPatentCount}</span> of <span className="text-foreground font-semibold">{filteredPatentResults.length}</span></>
                      ) : (
                        <span className="text-foreground font-semibold">{filteredPatentResults.length}</span>
                      )}
                      {filteredPatentResults.length !== patentResults.length && (
                        <span> of <span className="text-foreground font-semibold">{patentResults.length}</span> total</span>
                      )}{" "}
                      patent{filteredPatentResults.length !== 1 ? "s" : ""} found
                      {currentQuery ? <> for "<span className="text-foreground">{currentQuery}</span>"</> : ""}
                    </p>

                    {filteredPatentResults.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                        <Search className="w-8 h-8 text-muted-foreground/40" />
                        <p className="text-sm text-muted-foreground">No patents match the current filters.</p>
                      </div>
                    ) : (
                      <>
                        <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(200px,1fr))]">
                          {filteredPatentResults.slice(0, shownPatentCount).map((asset) => {
                            const patentId = (asset.signals?.[0]?.metadata?.patent_id as string) ?? null;
                            const patentKey = patentId ?? asset.id;
                            return (
                            <PatentCard
                              key={asset.id + "-patent"}
                              asset={asset}
                              isSaved={savedAssetIds.has(patentKey)}
                              onUnsave={() => handleUnsave(patentKey)}
                            />
                            );
                          })}
                        </div>
                        {shownPatentCount < filteredPatentResults.length && (
                          <div className="flex justify-center pt-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1.5 text-[11px] h-7 border-amber-500/30 text-amber-700 dark:text-amber-400 hover:bg-amber-500/5"
                              onClick={() => setShownPatentCount((c) => c + PATENT_PAGE_SIZE)}
                              data-testid="button-load-more-patents"
                            >
                              Show {Math.min(PATENT_PAGE_SIZE, filteredPatentResults.length - shownPatentCount)} more patents
                            </Button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Clinical Trials tab — loading state */}
            {hasSearched && resultTab === "trials" && !searchMutation.isPending && trialMutation.isPending && (
              <div className="flex flex-col items-center justify-center py-16 gap-4 text-center" data-testid="trials-loading-state">
                <Loader2 className="w-8 h-8 animate-spin text-teal-500 opacity-70" />
                <div>
                  <p className="text-sm font-medium text-foreground mb-1">Searching ClinicalTrials.gov...</p>
                  <p className="text-xs text-muted-foreground">Querying active and completed trials for "{currentQuery}"</p>
                </div>
              </div>
            )}

            {/* Clinical Trials tab — results */}
            {hasSearched && resultTab === "trials" && !searchMutation.isPending && !trialMutation.isPending && (
              <>
                {trialResults.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                    <Activity className="w-8 h-8 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">
                      No trials found for <span className="font-medium text-foreground">"{currentQuery}"</span>
                    </p>
                    <p className="text-xs text-muted-foreground">Try broader terms or a different indication.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Phase + Status summary bar */}
                    {(() => {
                      const phaseCounts: Record<string, number> = {};
                      const statusCounts: Record<string, number> = {};
                      for (const a of trialSponsorFiltered) {
                        const stage = (a.development_stage ?? "").toLowerCase().trim();
                        if (stage) phaseCounts[stage] = (phaseCounts[stage] ?? 0) + 1;
                        const st = ((a.signals?.[0]?.metadata?.status as string) ?? "").toLowerCase();
                        if (st) statusCounts[st] = (statusCounts[st] ?? 0) + 1;
                      }
                      type PhaseFilterKey = "phase 1" | "phase 2" | "phase 3" | "preclinical";
                      type StatusFilterKey = "recruiting" | "active" | "completed";
                      const PHASE_DEFS: { rawKey: string; label: string; filterKey: PhaseFilterKey | null; colorClass: string }[] = [
                        { rawKey: "phase 3",    label: "Phase 3",    filterKey: "phase 3",    colorClass: "text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/25 hover:bg-emerald-500/20" },
                        { rawKey: "phase 2",    label: "Phase 2",    filterKey: "phase 2",    colorClass: "text-violet-700 dark:text-violet-400 bg-violet-500/10 border-violet-500/25 hover:bg-violet-500/20" },
                        { rawKey: "phase 1",    label: "Phase 1",    filterKey: "phase 1",    colorClass: "text-sky-700 dark:text-sky-400 bg-sky-500/10 border-sky-500/25 hover:bg-sky-500/20" },
                        { rawKey: "approved",   label: "Approved",   filterKey: null,         colorClass: "text-emerald-800 dark:text-emerald-300 bg-emerald-600/10 border-emerald-600/25 opacity-70" },
                        { rawKey: "preclinical",label: "Preclinical",filterKey: "preclinical",colorClass: "text-zinc-600 dark:text-zinc-400 bg-zinc-500/10 border-zinc-500/25 hover:bg-zinc-500/20" },
                      ];
                      const STATUS_DEFS: { rawKey: string; label: string; filterKey: StatusFilterKey | null; colorClass: string }[] = [
                        { rawKey: "recruiting",            label: "Recruiting",  filterKey: "recruiting", colorClass: "text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/25 hover:bg-emerald-500/20" },
                        { rawKey: "active_not_recruiting", label: "Active",      filterKey: "active",     colorClass: "text-sky-700 dark:text-sky-400 bg-sky-500/10 border-sky-500/25 hover:bg-sky-500/20" },
                        { rawKey: "completed",             label: "Completed",   filterKey: "completed",  colorClass: "text-zinc-600 dark:text-zinc-400 bg-zinc-500/10 border-zinc-500/25 hover:bg-zinc-500/20" },
                        { rawKey: "not_yet_recruiting",    label: "Not Started", filterKey: null,         colorClass: "text-zinc-600 dark:text-zinc-400 bg-zinc-500/10 border-zinc-500/25 opacity-70" },
                        { rawKey: "suspended",             label: "Suspended",   filterKey: null,         colorClass: "text-amber-700 dark:text-amber-400 bg-amber-500/10 border-amber-500/25 opacity-70" },
                        { rawKey: "terminated",            label: "Terminated",  filterKey: null,         colorClass: "text-rose-700 dark:text-rose-400 bg-rose-500/10 border-rose-500/25 opacity-70" },
                        { rawKey: "withdrawn",             label: "Withdrawn",   filterKey: null,         colorClass: "text-rose-700 dark:text-rose-400 bg-rose-500/10 border-rose-500/25 opacity-70" },
                      ];
                      const knownPhaseKeys = new Set(PHASE_DEFS.map(d => d.rawKey));
                      const knownStatusKeys = new Set(STATUS_DEFS.map(d => d.rawKey));
                      const otherPhaseCount = Object.entries(phaseCounts).filter(([k]) => !knownPhaseKeys.has(k)).reduce((s, [, v]) => s + v, 0);
                      const otherStatusCount = Object.entries(statusCounts).filter(([k]) => !knownStatusKeys.has(k)).reduce((s, [, v]) => s + v, 0);
                      const phaseEntries = PHASE_DEFS.filter(e => (phaseCounts[e.rawKey] ?? 0) > 0);
                      const statusEntries = STATUS_DEFS.filter(e => (statusCounts[e.rawKey] ?? 0) > 0);
                      const hasAny = phaseEntries.length > 0 || otherPhaseCount > 0 || statusEntries.length > 0 || otherStatusCount > 0;
                      if (!hasAny) return null;
                      return (
                        <div className="flex flex-wrap items-center gap-1.5" data-testid="trial-summary-bar">
                          {phaseEntries.map(e => {
                            const isActive = e.filterKey !== null && trialPhaseFilter === e.filterKey;
                            const pill = (
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-colors ${e.colorClass} ${isActive ? "ring-1 ring-offset-0 ring-current !opacity-100" : ""}`}
                                data-testid={`trial-summary-phase-${e.rawKey.replace(/ /g, "-")}`}
                              >
                                {e.label}
                                <span className="font-bold">{phaseCounts[e.rawKey]}</span>
                              </span>
                            );
                            return e.filterKey !== null ? (
                              <button key={e.rawKey} onClick={() => setTrialPhaseFilter(trialPhaseFilter === e.filterKey ? "all" : e.filterKey!)} className="focus:outline-none">
                                {pill}
                              </button>
                            ) : (
                              <span key={e.rawKey} title="No filter available for this phase">{pill}</span>
                            );
                          })}
                          {otherPhaseCount > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border text-zinc-500 dark:text-zinc-400 bg-zinc-500/10 border-zinc-500/25 opacity-70" data-testid="trial-summary-phase-other">
                              Other <span className="font-bold">{otherPhaseCount}</span>
                            </span>
                          )}
                          {(phaseEntries.length > 0 || otherPhaseCount > 0) && (statusEntries.length > 0 || otherStatusCount > 0) && (
                            <span className="text-muted-foreground/40 text-xs select-none">·</span>
                          )}
                          {statusEntries.map(e => {
                            const isActive = e.filterKey !== null && trialStatusFilter === e.filterKey;
                            const pill = (
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-colors ${e.colorClass} ${isActive ? "ring-1 ring-offset-0 ring-current !opacity-100" : ""}`}
                                data-testid={`trial-summary-status-${e.rawKey}`}
                              >
                                {e.label}
                                <span className="font-bold">{statusCounts[e.rawKey]}</span>
                              </span>
                            );
                            return e.filterKey !== null ? (
                              <button key={e.rawKey} onClick={() => setTrialStatusFilter(trialStatusFilter === e.filterKey ? "all" : e.filterKey!)} className="focus:outline-none">
                                {pill}
                              </button>
                            ) : (
                              <span key={e.rawKey} title="No filter available for this status">{pill}</span>
                            );
                          })}
                          {otherStatusCount > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border text-zinc-500 dark:text-zinc-400 bg-zinc-500/10 border-zinc-500/25 opacity-70" data-testid="trial-summary-status-other">
                              Other <span className="font-bold">{otherStatusCount}</span>
                            </span>
                          )}
                        </div>
                      );
                    })()}
                    {/* Trial controls */}
                    <div className="flex flex-wrap items-center gap-3">
                      {/* Sort toggle */}
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Sort</span>
                        <div className="inline-flex items-stretch rounded-md border border-border overflow-hidden" data-testid="trial-sort-toggle">
                          {(["newest", "by_phase"] as const).map((mode) => (
                            <button
                              key={mode}
                              onClick={() => setTrialSortMode(mode)}
                              className={`px-2.5 py-1 text-[10px] font-semibold transition-colors border-r border-border last:border-r-0 ${
                                trialSortMode === mode
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-background text-muted-foreground hover:text-foreground"
                              }`}
                              data-testid={`trial-sort-${mode}`}
                            >
                              {mode === "newest" ? "Newest" : "By Phase"}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Phase filter */}
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Phase</span>
                        <div className="inline-flex items-stretch rounded-md border border-border overflow-hidden" data-testid="trial-phase-filter">
                          {(["all", "phase 1", "phase 2", "phase 3", "preclinical"] as const).map((p) => (
                            <button
                              key={p}
                              onClick={() => setTrialPhaseFilter(p)}
                              className={`px-2.5 py-1 text-[10px] font-semibold transition-colors border-r border-border last:border-r-0 ${
                                trialPhaseFilter === p
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-background text-muted-foreground hover:text-foreground"
                              }`}
                              data-testid={`trial-phase-filter-${p.replace(" ", "-")}`}
                            >
                              {p === "all" ? "All" : p === "phase 1" ? "Phase 1" : p === "phase 2" ? "Phase 2" : p === "phase 3" ? "Phase 3" : "Preclinical"}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Status filter */}
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Status</span>
                        <div className="inline-flex items-stretch rounded-md border border-border overflow-hidden" data-testid="trial-status-filter">
                          {(["all", "recruiting", "active", "completed"] as const).map((s) => (
                            <button
                              key={s}
                              onClick={() => setTrialStatusFilter(s)}
                              className={`px-2.5 py-1 text-[10px] font-semibold capitalize transition-colors border-r border-border last:border-r-0 ${
                                trialStatusFilter === s
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-background text-muted-foreground hover:text-foreground"
                              }`}
                              data-testid={`trial-status-filter-${s}`}
                            >
                              {s === "all" ? "All" : s === "recruiting" ? "Recruiting" : s === "active" ? "Active" : "Completed"}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Sponsor search */}
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Sponsor</span>
                        <div className="relative">
                          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                          <Input
                            value={trialSponsorSearch}
                            onChange={(e) => setTrialSponsorSearch(e.target.value)}
                            placeholder="Filter by sponsor…"
                            className="h-7 pl-6 pr-2 text-[11px] w-[160px] border-border"
                            data-testid="input-trial-sponsor-search"
                          />
                        </div>
                      </div>

                      {/* Active filter chips */}
                      {(trialPhaseFilter !== "all" || trialStatusFilter !== "all" || trialSponsorSearch.trim()) && (
                        <div className="flex items-center gap-1.5 flex-wrap mt-4">
                          {trialPhaseFilter !== "all" && (
                            <Badge variant="secondary" className="text-[11px] gap-1 cursor-pointer capitalize" onClick={() => setTrialPhaseFilter("all")} data-testid="trial-active-filter-phase">
                              {trialPhaseFilter} ×
                            </Badge>
                          )}
                          {trialStatusFilter !== "all" && (
                            <Badge variant="secondary" className="text-[11px] gap-1 cursor-pointer capitalize" onClick={() => setTrialStatusFilter("all")} data-testid="trial-active-filter-status">
                              {trialStatusFilter} ×
                            </Badge>
                          )}
                          {trialSponsorSearch.trim() && (
                            <Badge variant="secondary" className="text-[11px] gap-1 cursor-pointer" onClick={() => setTrialSponsorSearch("")} data-testid="trial-active-filter-sponsor">
                              "{trialSponsorSearch}" ×
                            </Badge>
                          )}
                          <button
                            onClick={() => { setTrialPhaseFilter("all"); setTrialStatusFilter("all"); setTrialSponsorSearch(""); }}
                            className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2 ml-1 transition-colors"
                            data-testid="button-clear-trial-filters"
                          >
                            Clear filters
                          </button>
                        </div>
                      )}
                    </div>

                    <p className="text-sm text-muted-foreground" data-testid="trials-results-count">
                      {filteredTrialResults.length > shownTrialCount ? (
                        <>Showing <span className="text-foreground font-semibold">{shownTrialCount}</span> of <span className="text-foreground font-semibold">{filteredTrialResults.length}</span></>
                      ) : (
                        <span className="text-foreground font-semibold">{filteredTrialResults.length}</span>
                      )}
                      {filteredTrialResults.length !== trialResults.length && (
                        <span> of <span className="text-foreground font-semibold">{trialResults.length}</span> total</span>
                      )}{" "}
                      trial{filteredTrialResults.length !== 1 ? "s" : ""} found
                      {currentQuery ? <> for "<span className="text-foreground">{currentQuery}</span>"</> : ""}
                    </p>

                    {filteredTrialResults.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                        <Search className="w-8 h-8 text-muted-foreground/40" />
                        <p className="text-sm text-muted-foreground">No trials match the current filters.</p>
                      </div>
                    ) : (
                      <>
                        <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(200px,1fr))]">
                          {filteredTrialResults.slice(0, shownTrialCount).map((asset) => {
                            const nctId = (asset.signals?.[0]?.metadata?.nct_id as string) ?? null;
                            const trialKey = nctId ?? asset.id;
                            return (
                            <ClinicalTrialCard
                              key={asset.id + "-trial"}
                              asset={asset}
                              isSaved={savedAssetIds.has(trialKey)}
                              onUnsave={() => handleUnsave(trialKey)}
                            />
                            );
                          })}
                        </div>
                        {shownTrialCount < filteredTrialResults.length && (
                          <div className="flex justify-center pt-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1.5 text-[11px] h-7 border-teal-500/30 text-teal-700 dark:text-teal-400 hover:bg-teal-500/5"
                              onClick={() => setShownTrialCount((c) => c + TRIAL_PAGE_SIZE)}
                              data-testid="button-load-more-trials"
                            >
                              Show {Math.min(TRIAL_PAGE_SIZE, filteredTrialResults.length - shownTrialCount)} more trials
                            </Button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Research tab — no sources enabled nudge */}
            {hasSearched && resultTab === "research" && researchSources.length === 0 && !searchMutation.isPending && (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-center" data-testid="research-no-sources-state">
                <FlaskConical className="w-8 h-8 text-muted-foreground/40" />
                <p className="text-sm font-medium text-foreground">No academic sources selected</p>
                <p className="text-xs text-muted-foreground max-w-xs">Enable PubMed or other sources using the Sources dropdown above to see research papers alongside your TTO results.</p>
              </div>
            )}

            {/* Research Signals tab — loading state while compiling */}
            {hasSearched && resultTab === "research" && researchSources.length > 0 && !searchMutation.isPending && researchMutation.isPending && (
              <div className="flex flex-col items-center justify-center py-16 gap-4 text-center" data-testid="research-loading-state">
                <Loader2 className="w-8 h-8 animate-spin text-primary opacity-60" />
                <div>
                  <p className="text-sm font-medium text-foreground mb-1">Compiling research signals...</p>
                  <p className="text-xs text-muted-foreground">Searching {researchSources.length} academic source{researchSources.length !== 1 ? "s" : ""}.</p>
                </div>
              </div>
            )}

            {/* Research Signals tab — results */}
            {hasSearched && resultTab === "research" && researchSources.length > 0 && !searchMutation.isPending && !researchMutation.isPending && (
              <>
                {researchResults.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                    <Search className="w-8 h-8 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">
                      Try refining your search for <span className="font-medium text-foreground">"{currentQuery}"</span>
                    </p>
                    {researchSources.length === 1 && (
                      <div
                        className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-950/30 px-3.5 py-2.5 max-w-sm text-left mt-1"
                        data-testid="callout-expand-sources-empty"
                      >
                        <span className="text-amber-500 mt-0.5 shrink-0 text-base leading-none">&#9888;</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] text-amber-800 dark:text-amber-300 leading-snug">
                            No results from {RESEARCH_SOURCE_OPTIONS.find(s => s.key === researchSources[0])?.label ?? researchSources[0]}. Add bioRxiv, medRxiv, or other preprint sources for broader coverage.
                          </p>
                        </div>
                        <button
                          className="shrink-0 text-[11px] font-semibold text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-200 underline underline-offset-2 transition-colors whitespace-nowrap"
                          onClick={() => setSourcesDropdownOpen(true)}
                          data-testid="button-open-sources-from-callout-empty"
                        >
                          Add sources
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm text-muted-foreground" data-testid="research-results-count">
                        {researchResults.length > shownResearchCount ? (
                          <>Showing <span className="text-foreground font-semibold">{shownResearchCount}</span> of <span className="text-foreground font-semibold">{researchResults.length}</span> research signals</>
                        ) : (
                          <><span className="text-foreground font-semibold">{researchResults.length}</span> research signal{researchResults.length !== 1 ? "s" : ""}</>
                        )}
                        {currentQuery ? <> found for "<span className="text-foreground">{currentQuery}</span>"</> : " found"}
                      </p>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => setFiltersOpen(true)}
                          className="text-[11px] text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
                          data-testid="button-filters-hint-research"
                        >
                          <SlidersHorizontal className="w-3 h-3" />
                          {activeFilterCount > 0 ? `${activeFilterCount} active` : "Refine"}
                        </button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 text-[11px] h-7 border-primary/30 text-primary hover:bg-primary/5 hover:text-primary"
                          onClick={handleGenerateReport}
                          disabled={isAnyPending}
                          data-testid="button-generate-report-research"
                        >
                          {reportMutation.isPending ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <FileBarChart2 className="w-3 h-3" />
                          )}
                          {reportMutation.isPending ? "Generating..." : "Match Report"}
                        </Button>
                      </div>
                    </div>
                    {researchResults.length < 5 && researchSources.length === 1 && (
                      <div
                        className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-950/30 px-3.5 py-2.5"
                        data-testid="callout-expand-sources"
                      >
                        <span className="text-amber-500 mt-0.5 shrink-0 text-base leading-none">&#9888;</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] text-amber-800 dark:text-amber-300 leading-snug">
                            Only {researchResults.length} result{researchResults.length !== 1 ? "s" : ""} from {RESEARCH_SOURCE_OPTIONS.find(s => s.key === researchSources[0])?.label ?? researchSources[0]}. Add bioRxiv, medRxiv, or other preprint sources for broader coverage.
                          </p>
                        </div>
                        <button
                          className="shrink-0 text-[11px] font-semibold text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-200 underline underline-offset-2 transition-colors whitespace-nowrap"
                          onClick={() => setSourcesDropdownOpen(true)}
                          data-testid="button-open-sources-from-callout"
                        >
                          Add sources
                        </button>
                      </div>
                    )}
                    <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(200px,1fr))]">
                      {researchResults.slice(0, shownResearchCount).map((asset) => (
                        <ResearchCard
                          key={asset.id + "-research"}
                          asset={asset}
                        />
                      ))}
                    </div>
                    {shownResearchCount < researchResults.length && (
                      <div className="flex justify-center pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 text-[11px] h-7 border-primary/30 text-primary hover:bg-primary/5"
                          onClick={() => setShownResearchCount((c) => c + RESEARCH_PAGE_SIZE)}
                          data-testid="button-load-more-research"
                        >
                          Show {Math.min(RESEARCH_PAGE_SIZE, researchResults.length - shownResearchCount)} more papers
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </main>
      </div>

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="right" className="w-full sm:max-w-sm overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
          </SheetHeader>

          <div className="mt-6 space-y-6">
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Freshness (re-search to apply)</p>
              <Select value={sinceFilter} onValueChange={setSinceFilter} data-testid="filter-since-select">
                <SelectTrigger className="h-8 text-xs w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any time</SelectItem>
                  <SelectItem value="6m">Last 6 months</SelectItem>
                  <SelectItem value="2024">2024</SelectItem>
                  <SelectItem value="2023">2023</SelectItem>
                  <SelectItem value="2022">2022 and older</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sort</p>
              <Select value={sortMode} onValueChange={(v) => setSortMode(v as "score" | "recency")} data-testid="select-sort">
                <SelectTrigger className="h-8 text-xs w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="score">Best Match</SelectItem>
                  <SelectItem value="recency">Newest First</SelectItem>
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
                  setSinceFilter("any");
                  setSortMode("score");
                  setMinScore(0);
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
