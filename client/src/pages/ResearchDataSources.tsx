import { useState, useRef, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search, ExternalLink, Microscope, Loader2, ChevronLeft, ChevronRight,
  Bookmark, BookmarkCheck, X, SlidersHorizontal, ChevronDown,
  Sparkles, ChevronUp, RefreshCw, Save, Lightbulb, HelpCircle, Star, ArrowRight,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useResearcherId, useResearcherHeaders } from "@/hooks/use-researcher";
import { useToast } from "@/hooks/use-toast";
import type { ResearchProject, SavedReference } from "@shared/schema";

type Signal = {
  id: string;
  title: string;
  text: string;
  url: string;
  date: string;
  institution_or_sponsor: string;
  source_type: string;
  authors_or_owner?: string;
};

type Asset = {
  asset_name: string;
  signals: Signal[];
  summary: string;
  score: number;
  development_stage: string;
  modality: string;
};

type SearchResponse = { assets: Asset[]; signalsFound?: number };

const FIELD_OPTIONS = [
  { value: "oncology", label: "Oncology" },
  { value: "immunology", label: "Immunology" },
  { value: "neurology", label: "Neurology" },
  { value: "cardiology", label: "Cardiology" },
  { value: "rare_diseases", label: "Rare Diseases" },
  { value: "infectious_disease", label: "Infectious Disease" },
  { value: "metabolic", label: "Metabolic" },
  { value: "ophthalmology", label: "Ophthalmology" },
  { value: "dermatology", label: "Dermatology" },
  { value: "respiratory", label: "Respiratory" },
  { value: "gastroenterology", label: "Gastroenterology" },
  { value: "hematology", label: "Hematology" },
  { value: "musculoskeletal", label: "Musculoskeletal" },
  { value: "psychiatry", label: "Psychiatry" },
];

const SOURCE_TYPE_OPTIONS = [
  { value: "publication", label: "Publication" },
  { value: "preprint", label: "Preprint" },
  { value: "grant", label: "Grant" },
  { value: "clinical_trial", label: "Clinical Trial" },
  { value: "dataset", label: "Dataset" },
  { value: "patent", label: "Patent" },
  { value: "conference_abstract", label: "Conference Abstract" },
];

const DATE_RANGE_OPTIONS = [
  { value: "30d", label: "Last 30 days" },
  { value: "6m", label: "Last 6 months" },
  { value: "1y", label: "Last year" },
  { value: "5y", label: "Last 5 years" },
];

const TECH_TYPE_OPTIONS = [
  { value: "small_molecule", label: "Small Molecule" },
  { value: "biologic", label: "Biologic" },
  { value: "gene_therapy", label: "Gene Therapy" },
  { value: "cell_therapy", label: "Cell Therapy" },
  { value: "antibody", label: "Antibody" },
  { value: "vaccine", label: "Vaccine" },
  { value: "diagnostic", label: "Diagnostic" },
  { value: "medical_device", label: "Medical Device" },
];

const TRIAL_PHASE_OPTIONS = [
  { value: "preclinical", label: "Preclinical" },
  { value: "phase_1", label: "Phase 1" },
  { value: "phase_2", label: "Phase 2" },
  { value: "phase_3", label: "Phase 3" },
  { value: "phase_4", label: "Phase 4" },
  { value: "approved", label: "Approved / Post-Market" },
];

const SOURCE_GROUPS: { label: string; keys: { key: string; label: string }[] }[] = [
  {
    label: "Literature",
    keys: [
      { key: "pubmed", label: "PubMed" },
      { key: "openalex", label: "OpenAlex" },
      { key: "semantic_scholar", label: "Semantic Scholar" },
      { key: "europepmc", label: "Europe PMC" },
      { key: "base", label: "BASE" },
      { key: "core", label: "CORE" },
      { key: "ieee", label: "IEEE Xplore" },
      { key: "eric", label: "ERIC" },
    ],
  },
  {
    label: "Preprints",
    keys: [
      { key: "biorxiv", label: "bioRxiv" },
      { key: "medrxiv", label: "medRxiv" },
      { key: "arxiv", label: "arXiv" },
      { key: "chemrxiv", label: "ChemRxiv" },
      { key: "socarxiv", label: "SocArXiv" },
      { key: "psyarxiv", label: "PsyArXiv" },
      { key: "eartharxiv", label: "EarthArXiv" },
      { key: "engrxiv", label: "engrXiv" },
    ],
  },
  {
    label: "Grants",
    keys: [
      { key: "nih_reporter", label: "NIH Reporter" },
      { key: "nsf_awards", label: "NSF Awards" },
      { key: "eu_cordis", label: "EU CORDIS" },
      { key: "grants_gov", label: "Grants.gov" },
    ],
  },
  {
    label: "Clinical Trials",
    keys: [
      { key: "clinicaltrials", label: "ClinicalTrials.gov" },
      { key: "eu_clinicaltrials", label: "EU Clinical Trials" },
      { key: "isrctn", label: "ISRCTN" },
    ],
  },
  {
    label: "Patents",
    keys: [
      { key: "patents", label: "USPTO Patents" },
      { key: "techtransfer", label: "Tech Transfer" },
      { key: "lens", label: "Lens.org" },
    ],
  },
  {
    label: "Open Access",
    keys: [
      { key: "doaj", label: "DOAJ" },
      { key: "openaire", label: "OpenAIRE" },
      { key: "hal", label: "HAL" },
    ],
  },
  {
    label: "Datasets",
    keys: [
      { key: "zenodo", label: "Zenodo" },
      { key: "geo", label: "GEO" },
      { key: "pdb", label: "PDB" },
      { key: "lab_discoveries", label: "Lab Discoveries" },
    ],
  },
];

const ALL_SOURCE_KEYS = SOURCE_GROUPS.flatMap((g) => g.keys.map((k) => k.key));

const DEFAULT_SOURCE_KEYS = ["pubmed", "biorxiv", "medrxiv", "arxiv", "clinicaltrials"];

const SOURCE_LABELS: Record<string, string> = {};
SOURCE_GROUPS.forEach((g) => g.keys.forEach((k) => { SOURCE_LABELS[k.key] = k.label; }));

const SOURCE_TYPE_LABELS: Record<string, string> = {
  paper: "Paper",
  preprint: "Preprint",
  clinical_trial: "Clinical Trial",
  patent: "Patent",
  tech_transfer: "Tech Transfer",
  grant: "Grant",
  dataset: "Dataset",
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

const PAGE_SIZE = 50;

type SynthesisResult = {
  consensus: string;
  open_questions: string[];
  strongest_signals: { index: number; title: string; reason: string }[];
  suggested_next_search: string;
};

type Filters = {
  field?: string;
  sourceType?: string;
  dateRange?: string;
  technologyType?: string;
  trialPhase?: string;
};

function getFilterLabel(key: keyof Filters, value: string): string {
  const maps: Record<string, { value: string; label: string }[]> = {
    field: FIELD_OPTIONS,
    sourceType: SOURCE_TYPE_OPTIONS,
    dateRange: DATE_RANGE_OPTIONS,
    technologyType: TECH_TYPE_OPTIONS,
    trialPhase: TRIAL_PHASE_OPTIONS,
  };
  return maps[key]?.find((o) => o.value === value)?.label ?? value;
}

const RESEARCH_TIPS = [
  "Use Boolean operators (AND, OR) in your search to combine or broaden terms.",
  "Narrow results by date range to focus on the most recent breakthroughs.",
  "Save promising results to your Library for easy reference later.",
  "Try searching by target name, mechanism, or disease area for best results.",
  "Use the AI Synthesis feature to get a consensus view across all your results.",
  "Combine multiple data sources to cross-reference findings across databases.",
  "Check grants databases alongside literature to spot funded research trends.",
  "Export your synthesis results to share with collaborators.",
];

const PLATFORM_FACTS = [
  "EdenRadar aggregates data from 30+ academic and patent databases worldwide.",
  "AI Synthesis analyzes up to 10 of your strongest results in a single pass.",
  "Your Library persists across sessions — save now, review anytime.",
  "Each source is queried in parallel for faster, more comprehensive results.",
  "EdenLab connects your research projects to real-time literature and grant data.",
  "Discovery Cards let researchers showcase work directly to industry scouts.",
];

type InsightCard = { type: "tip"; text: string } | { type: "fact"; text: string };

function SearchInsightsPanel({ activeSources }: { activeSources: string[] }) {
  const allCards: InsightCard[] = useMemo(() => {
    const cards: InsightCard[] = [];
    const max = Math.max(RESEARCH_TIPS.length, PLATFORM_FACTS.length);
    for (let i = 0; i < max; i++) {
      if (i < RESEARCH_TIPS.length) cards.push({ type: "tip", text: RESEARCH_TIPS[i] });
      if (i < PLATFORM_FACTS.length) cards.push({ type: "fact", text: PLATFORM_FACTS[i] });
    }
    return cards;
  }, []);

  const [cardIndex, setCardIndex] = useState(0);
  const [fadeIn, setFadeIn] = useState(true);
  const [highlightIdx, setHighlightIdx] = useState(0);

  useEffect(() => {
    const cardInterval = setInterval(() => {
      setFadeIn(false);
      setTimeout(() => {
        setCardIndex((prev) => (prev + 1) % allCards.length);
        setFadeIn(true);
      }, 400);
    }, 4000);
    return () => clearInterval(cardInterval);
  }, [allCards.length]);

  useEffect(() => {
    if (activeSources.length === 0) return;
    const hlInterval = setInterval(() => {
      setHighlightIdx((prev) => (prev + 1) % activeSources.length);
    }, 1500);
    return () => clearInterval(hlInterval);
  }, [activeSources.length]);

  const current = allCards[cardIndex];

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4" data-testid="search-insights-panel">
      <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
        <Sparkles className="w-3.5 h-3.5 text-violet-500" />
        Querying {activeSources.length} source{activeSources.length !== 1 ? "s" : ""}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {activeSources.map((key, i) => (
          <span
            key={key}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all duration-500 ${
              i === highlightIdx
                ? "border-violet-500/40 bg-violet-500/10 text-violet-600 dark:text-violet-400"
                : "border-border bg-muted/50 text-muted-foreground"
            }`}
            data-testid={`source-pill-${key}`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full transition-all duration-500 ${
                i === highlightIdx ? "bg-violet-500 scale-125" : "bg-muted-foreground/40"
              }`}
            />
            {SOURCE_LABELS[key] ?? key}
          </span>
        ))}
      </div>

      <div className="border-t border-border pt-3">
        <p
          className="text-sm text-muted-foreground leading-relaxed transition-opacity duration-300"
          style={{ opacity: fadeIn ? 1 : 0 }}
          data-testid="research-tip"
        >
          <span className={`font-medium mr-1.5 ${current?.type === "tip" ? "text-violet-500" : "text-emerald-500"}`}>
            {current?.type === "tip" ? "Tip:" : "Did you know?"}
          </span>
          {current?.text}
        </p>
      </div>
    </div>
  );
}

export default function ResearchDataSources() {
  const researcherId = useResearcherId();
  const researcherHeaders = useResearcherHeaders();
  const { toast } = useToast();
  const qc = useQueryClient();
  const resultsRef = useRef<HTMLDivElement>(null);

  const searchParams = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const initialQuery = searchParams.get("q") ?? "";
  const initialSources = searchParams.get("sources")
    ? searchParams.get("sources")!.split(",").filter((s) => ALL_SOURCE_KEYS.includes(s))
    : DEFAULT_SOURCE_KEYS;
  const initialPage = parseInt(searchParams.get("page") ?? "1") || 1;
  const [query, setQuery] = useState(initialQuery);
  const [activeQuery, setActiveQuery] = useState(initialQuery);
  const [selectedSources, setSelectedSources] = useState<string[]>(initialSources);
  const [filters, setFilters] = useState<Filters>(() => {
    const f: Filters = {};
    if (searchParams.get("field")) f.field = searchParams.get("field")!;
    if (searchParams.get("sourceType")) f.sourceType = searchParams.get("sourceType")!;
    if (searchParams.get("dateRange")) f.dateRange = searchParams.get("dateRange")!;
    if (searchParams.get("technologyType")) f.technologyType = searchParams.get("technologyType")!;
    if (searchParams.get("trialPhase")) f.trialPhase = searchParams.get("trialPhase")!;
    return f;
  });
  const [page, setPage] = useState(initialPage);
  const [showFilters, setShowFilters] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth >= 768 : true
  );

  useEffect(() => {
    const params = new URLSearchParams();
    if (activeQuery) params.set("q", activeQuery);
    Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
    const isDefault =
      selectedSources.length === DEFAULT_SOURCE_KEYS.length &&
      DEFAULT_SOURCE_KEYS.every((k) => selectedSources.includes(k));
    if (!isDefault) {
      params.set("sources", selectedSources.join(","));
    }
    if (page > 1) params.set("page", String(page));
    const url = `/research/data-sources${params.toString() ? "?" + params.toString() : ""}`;
    window.history.replaceState(null, "", url);
  }, [activeQuery, filters, selectedSources, page]);

  const { data, isLoading } = useQuery<SearchResponse>({
    queryKey: ["/api/search", activeQuery, selectedSources, filters],
    queryFn: () =>
      fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: activeQuery,
          sources: selectedSources,
          maxPerSource: 5,
          ...filters,
        }),
      }).then((r) => r.json()),
    enabled: !!activeQuery,
  });

  const { data: refsData } = useQuery<{ references: SavedReference[] }>({
    queryKey: ["/api/research/references", researcherId],
    queryFn: () =>
      fetch("/api/research/references", { headers: researcherHeaders }).then((r) => r.json()),
    enabled: !!researcherId,
  });

  const { data: projectsData } = useQuery<{ projects: ResearchProject[] }>({
    queryKey: ["/api/research/projects", researcherId],
    queryFn: () =>
      fetch("/api/research/projects", { headers: researcherHeaders }).then((r) => {
        if (!r.ok) throw new Error("Failed to load projects");
        return r.json();
      }),
    enabled: !!researcherId,
  });

  const [synthesis, setSynthesis] = useState<SynthesisResult | null>(null);
  const [synthesisCollapsed, setSynthesisCollapsed] = useState(false);
  const [synthesisSaveProject, setSynthesisSaveProject] = useState<string>("none");

  const savedUrls = useMemo(() => new Set((refsData?.references ?? []).map((r) => r.url)), [refsData]);

  const allSignals = useMemo(() => {
    const assets = data?.assets ?? [];
    return assets.flatMap((a) => a.signals ?? []);
  }, [data]);

  const totalResults = allSignals.length;
  const totalPages = Math.max(1, Math.ceil(totalResults / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages);
  const pagedSignals = allSignals.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  const synthesizeMutation = useMutation({
    mutationFn: async () => {
      const top = allSignals.slice(0, 10).map((s) => ({
        title: s.title,
        text: s.text,
        url: s.url,
        date: s.date,
        source_type: s.source_type,
      }));
      const r = await fetch("/api/research/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...researcherHeaders },
        body: JSON.stringify({ signals: top, query: activeQuery }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error || "Synthesis failed");
      }
      return r.json() as Promise<SynthesisResult>;
    },
    onSuccess: (data) => {
      setSynthesis(data);
      setSynthesisCollapsed(false);
    },
    onError: (err: Error) => {
      toast({ title: "Synthesis failed", description: err.message, variant: "destructive" });
    },
  });

  function handleSearch() {
    if (query.trim()) {
      setSynthesis(null);
      setActiveQuery(query.trim());
      setPage(1);
    }
  }

  function setFilter(key: keyof Filters, value: string | undefined) {
    setFilters((prev) => {
      const next = { ...prev };
      if (value) next[key] = value;
      else delete next[key];
      return next;
    });
    setSynthesis(null);
    setPage(1);
  }

  function clearFilter(key: keyof Filters) {
    setFilter(key, undefined);
  }

  function toggleSource(key: string) {
    setSelectedSources((prev) =>
      prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]
    );
    setSynthesis(null);
    setPage(1);
  }

  function selectAllSources() {
    setSelectedSources(ALL_SOURCE_KEYS);
    setSynthesis(null);
    setPage(1);
  }

  function resetSources() {
    setSelectedSources(DEFAULT_SOURCE_KEYS);
    setSynthesis(null);
    setPage(1);
  }

  function changePage(p: number) {
    setPage(p);
    resultsRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

  const activeFilters = Object.entries(filters).filter(([, v]) => v) as [keyof Filters, string][];

  return (
    <div className="flex h-screen overflow-hidden">
      {showFilters && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-40 md:hidden"
            onClick={() => setShowFilters(false)}
          />
        <aside className="fixed inset-y-0 left-0 z-50 md:relative md:inset-auto md:z-auto w-[280px] shrink-0 border-r border-border bg-background overflow-y-auto p-4 space-y-4 shadow-xl md:shadow-none">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Filters</h2>
            <Button variant="ghost" size="icon" className="w-6 h-6" onClick={() => setShowFilters(false)} data-testid="button-close-filters">
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sources</h3>
              <div className="flex gap-1.5">
                <button className="text-[10px] text-violet-500 hover:underline" onClick={selectAllSources} data-testid="button-select-all-sources">Select all</button>
                <span className="text-[10px] text-muted-foreground">|</span>
                <button className="text-[10px] text-violet-500 hover:underline" onClick={resetSources} data-testid="button-reset-sources">Reset</button>
              </div>
            </div>
            <div className="space-y-3">
              {SOURCE_GROUPS.map((group) => (
                <div key={group.label}>
                  <p className="text-[11px] font-medium text-muted-foreground mb-1.5">{group.label}</p>
                  <div className="space-y-1">
                    {group.keys.map(({ key, label }) => (
                      <label key={key} className="flex items-center gap-2 cursor-pointer py-0.5">
                        <Checkbox
                          checked={selectedSources.includes(key)}
                          onCheckedChange={() => toggleSource(key)}
                          data-testid={`checkbox-source-${key}`}
                          className="w-3.5 h-3.5"
                        />
                        <span className="text-xs text-foreground">{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Accordion type="multiple" defaultValue={[]} className="space-y-0">
            <FilterSection
              id="field"
              title="Field"
              options={FIELD_OPTIONS}
              value={filters.field}
              onChange={(v) => setFilter("field", v)}
            />
            <FilterSection
              id="sourceType"
              title="Source Type"
              options={SOURCE_TYPE_OPTIONS}
              value={filters.sourceType}
              onChange={(v) => setFilter("sourceType", v)}
            />
            <FilterSection
              id="dateRange"
              title="Publication Date"
              options={DATE_RANGE_OPTIONS}
              value={filters.dateRange}
              onChange={(v) => setFilter("dateRange", v)}
            />
            <FilterSection
              id="technologyType"
              title="Technology Type"
              options={TECH_TYPE_OPTIONS}
              value={filters.technologyType}
              onChange={(v) => setFilter("technologyType", v)}
            />
            <FilterSection
              id="trialPhase"
              title="Clinical Trial Phase"
              options={TRIAL_PHASE_OPTIONS}
              value={filters.trialPhase}
              onChange={(v) => setFilter("trialPhase", v)}
            />
          </Accordion>
        </aside>
        </>
      )}

      <div ref={resultsRef} className="flex-1 overflow-y-auto p-6 space-y-5">
        <div className="flex items-center gap-3">
          {!showFilters && (
            <Button variant="outline" size="icon" className="shrink-0" onClick={() => setShowFilters(true)} data-testid="button-open-filters">
              <SlidersHorizontal className="w-4 h-4" />
            </Button>
          )}
          <div className="flex gap-2 flex-1">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search across all data sources..."
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
        </div>

        {activeFilters.length > 0 && (
          <div className="flex flex-wrap gap-1.5" data-testid="active-filters">
            {activeFilters.map(([key, value]) => (
              <Badge
                key={key}
                variant="secondary"
                className="gap-1 text-xs cursor-pointer hover:bg-destructive/10"
                onClick={() => clearFilter(key)}
                data-testid={`filter-chip-${key}`}
              >
                {getFilterLabel(key, value)}
                <X className="w-3 h-3" />
              </Badge>
            ))}
            <button
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
              onClick={() => { setFilters({}); setPage(1); }}
              data-testid="button-clear-all-filters"
            >
              Clear all
            </button>
          </div>
        )}

        {!activeQuery && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Suggested searches</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTED.map((s) => (
                <button
                  key={s}
                  onClick={() => { setQuery(s); setActiveQuery(s); setPage(1); }}
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
          <div className="space-y-5" data-testid="search-scanning">
            <div className="rounded-xl border bg-card p-5 space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="relative w-5 h-5">
                  <Microscope className="w-5 h-5 text-violet-500" />
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-violet-500 rounded-full animate-ping" />
                </div>
                <span className="text-sm font-medium">
                  Scanning {selectedSources.length} data source{selectedSources.length !== 1 ? "s" : ""}...
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {selectedSources.map((key, i) => (
                  <span
                    key={key}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border transition-colors"
                    style={{
                      animation: `source-pulse 2s ease-in-out ${i * 0.15}s infinite`,
                    }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full bg-violet-500"
                      style={{
                        animation: `source-dot 2s ease-in-out ${i * 0.15}s infinite`,
                      }}
                    />
                    {SOURCE_LABELS[key] ?? key}
                  </span>
                ))}
              </div>

              <div className="h-1 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-violet-500 via-purple-500 to-violet-500"
                  style={{
                    animation: "scan-bar 2s ease-in-out infinite",
                    width: "40%",
                  }}
                />
              </div>
            </div>

            <SearchInsightsPanel activeSources={selectedSources} />

            <style>{`
              @keyframes source-pulse {
                0%, 100% { background-color: transparent; color: hsl(var(--muted-foreground)); }
                50% { background-color: hsl(263 70% 50% / 0.1); color: hsl(263 70% 50%); border-color: hsl(263 70% 50% / 0.3); }
              }
              @keyframes source-dot {
                0%, 100% { opacity: 0.3; transform: scale(1); }
                50% { opacity: 1; transform: scale(1.4); }
              }
              @keyframes scan-bar {
                0% { transform: translateX(-100%); }
                100% { transform: translateX(350%); }
              }
              @keyframes skeleton-fade {
                0%, 100% { opacity: 0.5; }
                50% { opacity: 1; }
              }
            `}</style>
          </div>
        )}

        {activeQuery && !isLoading && totalResults === 0 && (
          <div className="text-center py-12 text-sm text-muted-foreground" data-testid="no-results">
            No results found for "{activeQuery}". Try adjusting your filters or query.
          </div>
        )}

        {totalResults > 0 && !isLoading && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground font-medium" data-testid="result-count">
                {totalResults} result{totalResults !== 1 ? "s" : ""} for "{activeQuery}"
                {totalPages > 1 && ` — Page ${clampedPage} of ${totalPages}`}
              </p>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs border-violet-500/30 text-violet-600 dark:text-violet-400 hover:bg-violet-500/10"
                disabled={synthesizeMutation.isPending}
                onClick={() => synthesizeMutation.mutate()}
                data-testid="button-synthesize"
              >
                {synthesizeMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                {synthesizeMutation.isPending
                  ? `Analyzing ${Math.min(allSignals.length, 10)} results...`
                  : synthesis
                    ? "Regenerate"
                    : "Synthesize Results"}
              </Button>
            </div>

            {synthesizeMutation.isPending && !synthesis && (
              <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-5 space-y-3" data-testid="synthesis-loading">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-violet-500" />
                  <span className="text-sm font-medium text-violet-600 dark:text-violet-400">
                    Analyzing {Math.min(allSignals.length, 10)} results...
                  </span>
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-5/6" />
                </div>
              </div>
            )}

            {synthesis && (
              <div className="rounded-xl border border-violet-500/20 bg-card overflow-hidden" data-testid="synthesis-panel">
                <button
                  className="w-full flex items-center justify-between p-4 hover:bg-accent/30 transition-colors"
                  onClick={() => setSynthesisCollapsed(!synthesisCollapsed)}
                  data-testid="button-synthesis-toggle"
                >
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-violet-500" />
                    <span className="text-sm font-semibold text-foreground">AI Synthesis</span>
                    <Badge variant="secondary" className="text-[10px]">
                      {Math.min(allSignals.length, 10)} results analyzed
                    </Badge>
                  </div>
                  {synthesisCollapsed ? (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronUp className="w-4 h-4 text-muted-foreground" />
                  )}
                </button>

                {!synthesisCollapsed && (
                  <div className="px-4 pb-4 space-y-4">
                    <div className="space-y-1.5" data-testid="synthesis-consensus">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        <Lightbulb className="w-3.5 h-3.5" />
                        What the field currently knows
                      </div>
                      <p className="text-sm text-foreground leading-relaxed">{synthesis.consensus}</p>
                    </div>

                    {synthesis.open_questions.length > 0 && (
                      <div className="space-y-1.5" data-testid="synthesis-questions">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          <HelpCircle className="w-3.5 h-3.5" />
                          Key open questions
                        </div>
                        <ul className="space-y-1">
                          {synthesis.open_questions.map((q, i) => (
                            <li key={i} className="text-sm text-foreground flex items-start gap-2">
                              <span className="text-violet-500 mt-1 shrink-0">&#8226;</span>
                              {q}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {synthesis.strongest_signals.length > 0 && (
                      <div className="space-y-1.5" data-testid="synthesis-strongest">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          <Star className="w-3.5 h-3.5" />
                          Strongest signals
                        </div>
                        <div className="space-y-2">
                          {synthesis.strongest_signals.map((s, i) => {
                            const clampedIdx = Math.max(0, Math.min(s.index - 1, allSignals.length - 1));
                            const matchedSignal = allSignals.length > 0 ? allSignals[clampedIdx] : undefined;
                            return (
                              <div key={i} className="rounded-lg border border-border bg-accent/20 p-3 space-y-1">
                                <div className="flex items-start gap-2">
                                  <Badge variant="secondary" className="text-[10px] shrink-0 mt-0.5">#{s.index}</Badge>
                                  <div className="flex-1 min-w-0">
                                    {matchedSignal?.url ? (
                                      <a
                                        href={matchedSignal.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-sm font-medium text-foreground hover:text-violet-600 dark:hover:text-violet-400 transition-colors line-clamp-1"
                                        data-testid={`synthesis-signal-link-${i}`}
                                      >
                                        {s.title}
                                        <ExternalLink className="w-3 h-3 inline ml-1 opacity-50" />
                                      </a>
                                    ) : (
                                      <span className="text-sm font-medium text-foreground line-clamp-1">{s.title}</span>
                                    )}
                                    <p className="text-xs text-muted-foreground mt-0.5">{s.reason}</p>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {synthesis.suggested_next_search && (
                      <div className="space-y-1.5" data-testid="synthesis-next-search">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          <ArrowRight className="w-3.5 h-3.5" />
                          Suggested next search
                        </div>
                        <button
                          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-violet-500/30 bg-violet-500/5 text-sm text-violet-600 dark:text-violet-400 hover:bg-violet-500/10 transition-colors"
                          onClick={() => {
                            setQuery(synthesis.suggested_next_search);
                            setActiveQuery(synthesis.suggested_next_search);
                            setSynthesis(null);
                            setPage(1);
                          }}
                          data-testid="button-next-search"
                        >
                          <Search className="w-3.5 h-3.5" />
                          {synthesis.suggested_next_search}
                        </button>
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-2 border-t border-border">
                      <Select value={synthesisSaveProject} onValueChange={setSynthesisSaveProject}>
                        <SelectTrigger className="h-7 text-xs w-[180px]" data-testid="select-synthesis-project">
                          <SelectValue placeholder="Save to project..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No project</SelectItem>
                          {(projectsData?.projects ?? []).map((p) => (
                            <SelectItem key={p.id} value={String(p.id)}>{p.title}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1"
                        disabled={synthesisSaveProject === "none"}
                        onClick={async () => {
                          const projectId = parseInt(synthesisSaveProject);
                          const noteText = [
                            `## AI Synthesis: "${activeQuery}"`,
                            "",
                            `### What the field currently knows`,
                            synthesis.consensus,
                            "",
                            `### Key open questions`,
                            ...synthesis.open_questions.map((q) => `- ${q}`),
                            "",
                            `### Strongest signals`,
                            ...synthesis.strongest_signals.map((s) => `- **[${s.index}] ${s.title}**: ${s.reason}`),
                            "",
                            `### Suggested next search`,
                            synthesis.suggested_next_search,
                          ].join("\n");
                          try {
                            const r = await fetch(`/api/research/projects/${projectId}/notes`, {
                              method: "POST",
                              headers: { "Content-Type": "application/json", ...researcherHeaders },
                              body: JSON.stringify({ content: noteText }),
                            });
                            if (!r.ok) throw new Error("Failed to save");
                            toast({ title: "Synthesis saved to project" });
                            setSynthesisSaveProject("none");
                          } catch {
                            toast({ title: "Failed to save synthesis", variant: "destructive" });
                          }
                        }}
                        data-testid="button-save-synthesis"
                      >
                        <Save className="w-3 h-3" />
                        Save to Project
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {pagedSignals.map((signal, i) => (
              <SignalCard
                key={signal.id ?? `${clampedPage}-${i}`}
                signal={signal}
                index={(clampedPage - 1) * PAGE_SIZE + i}
                isSaved={savedUrls.has(signal.url)}
                projects={projectsData?.projects ?? []}
                researcherHeaders={researcherHeaders}
                researcherId={researcherId}
                onSaved={() => {
                  qc.invalidateQueries({ queryKey: ["/api/research/references", researcherId] });
                }}
              />
            ))}

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-4" data-testid="pagination">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={clampedPage <= 1}
                  onClick={() => changePage(clampedPage - 1)}
                  data-testid="button-prev-page"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous
                </Button>
                <div className="flex gap-1">
                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                    let p: number;
                    if (totalPages <= 7) {
                      p = i + 1;
                    } else if (clampedPage <= 4) {
                      p = i + 1;
                    } else if (clampedPage >= totalPages - 3) {
                      p = totalPages - 6 + i;
                    } else {
                      p = clampedPage - 3 + i;
                    }
                    return (
                      <Button
                        key={p}
                        variant={p === clampedPage ? "default" : "outline"}
                        size="sm"
                        className="w-8 h-8 p-0"
                        onClick={() => changePage(p)}
                        data-testid={`button-page-${p}`}
                      >
                        {p}
                      </Button>
                    );
                  })}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={clampedPage >= totalPages}
                  onClick={() => changePage(clampedPage + 1)}
                  data-testid="button-next-page"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function FilterSection({
  id,
  title,
  options,
  value,
  onChange,
}: {
  id: string;
  title: string;
  options: { value: string; label: string }[];
  value?: string;
  onChange: (v: string | undefined) => void;
}) {
  return (
    <AccordionItem value={id} className="border-b-0">
      <AccordionTrigger className="py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide hover:no-underline" data-testid={`filter-trigger-${id}`}>
        {title}
        {value && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-violet-500 inline-block" />}
      </AccordionTrigger>
      <AccordionContent className="pb-2">
        <div className="space-y-0.5">
          {options.map((opt) => (
            <button
              key={opt.value}
              className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${
                value === opt.value
                  ? "bg-violet-500/10 text-violet-600 dark:text-violet-400 font-medium"
                  : "text-foreground hover:bg-accent/60"
              }`}
              onClick={() => onChange(value === opt.value ? undefined : opt.value)}
              data-testid={`filter-option-${id}-${opt.value}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

function SignalCard({
  signal,
  index,
  isSaved,
  projects,
  researcherHeaders,
  researcherId,
  onSaved,
}: {
  signal: Signal;
  index: number;
  isSaved: boolean;
  projects: ResearchProject[];
  researcherHeaders: Record<string, string>;
  researcherId: string;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [bookmarkOpen, setBookmarkOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<string>("none");
  const [note, setNote] = useState("");

  const saveMutation = useMutation({
    mutationFn: () =>
      fetch("/api/research/references", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...researcherHeaders },
        body: JSON.stringify({
          userId: researcherId,
          title: signal.title,
          url: signal.url,
          sourceType: signal.source_type,
          date: signal.date ?? "",
          institution: signal.institution_or_sponsor ?? "",
          notes: note || null,
          projectId: selectedProject !== "none" ? parseInt(selectedProject) : null,
        }),
      }).then((r) => {
        if (!r.ok) throw new Error("Failed to save");
        return r.json();
      }),
    onSuccess: () => {
      toast({ title: "Reference saved" });
      setBookmarkOpen(false);
      setNote("");
      setSelectedProject("none");
      onSaved();
    },
    onError: () => {
      toast({ title: "Failed to save reference", variant: "destructive" });
    },
  });

  return (
    <div
      className="border border-border rounded-lg p-4 bg-card hover:border-violet-500/20 transition-colors flex flex-col gap-2"
      data-testid={`signal-result-${index}`}
    >
      <div className="flex items-start gap-3 justify-between">
        <h3 className="text-sm font-semibold text-foreground leading-snug flex-1 line-clamp-2">{signal.title}</h3>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="secondary" className="text-[10px]">
            {SOURCE_TYPE_LABELS[signal.source_type] ?? signal.source_type}
          </Badge>
          <Popover open={bookmarkOpen} onOpenChange={setBookmarkOpen}>
            <PopoverTrigger asChild>
              <button
                className={`p-1 rounded transition-colors ${isSaved ? "text-violet-500" : "text-muted-foreground hover:text-foreground"}`}
                data-testid={`button-bookmark-${index}`}
              >
                {isSaved ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-3 space-y-3" align="end">
              <p className="text-xs font-semibold text-foreground">Save Reference</p>
              <Select value={selectedProject} onValueChange={setSelectedProject}>
                <SelectTrigger className="h-8 text-xs" data-testid={`select-project-${index}`}>
                  <SelectValue placeholder="No project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No project</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Textarea
                placeholder="Add a note (optional)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="text-xs min-h-[60px]"
                data-testid={`input-bookmark-note-${index}`}
              />
              <Button
                size="sm"
                className="w-full bg-violet-600 hover:bg-violet-700 text-white text-xs"
                disabled={saveMutation.isPending || isSaved}
                onClick={() => saveMutation.mutate()}
                data-testid={`button-save-bookmark-${index}`}
              >
                {saveMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
              </Button>
            </PopoverContent>
          </Popover>
          {signal.url && (
            <a href={signal.url} target="_blank" rel="noopener noreferrer" data-testid={`link-result-${index}`}>
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
  );
}
