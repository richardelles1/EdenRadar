import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import {
  BadgeDollarSign, Search, Bookmark, BookmarkCheck, Plus, Trash2,
  ExternalLink, Calendar, Building2, DollarSign, Loader2, X, ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useResearcherId, useResearcherHeaders } from "@/hooks/use-researcher";
import { useToast } from "@/hooks/use-toast";
import type { SavedGrant, ResearchProject } from "@shared/schema";

const GRANT_SOURCES = ["grants_gov", "nih_reporter", "nsf_awards", "eu_cordis"];

const RESEARCH_AREAS = [
  "Biotech", "Drug Discovery", "Genomics", "Immunology", "Oncology",
  "AI in Healthcare", "Medical Devices", "Diagnostics", "Digital Health", "Public Health",
];

const OPP_STATUSES = ["Posted", "Forecasted"];

const DEADLINE_OPTIONS = [
  { label: "Any deadline", value: "any" },
  { label: "≤ 30 days", value: "30" },
  { label: "≤ 60 days", value: "60" },
  { label: "≤ 90 days", value: "90" },
  { label: "≤ 180 days", value: "180" },
];

const STATUS_CONFIG = {
  not_started: { label: "Not Started", color: "bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/30" },
  in_progress: { label: "In Progress", color: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30" },
  submitted: { label: "Submitted", color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" },
};

type SignalResult = {
  id: string;
  title: string;
  text: string;
  url: string;
  date: string;
  institution_or_sponsor: string;
  source_key?: string;
  metadata?: {
    opp_status?: string;
    opp_num?: string;
    open_date?: string;
    close_date?: string;
    doc_type?: string;
    cfda?: string[];
    [key: string]: unknown;
  };
};

function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const allSelected = selected.length === 0;

  function toggle(option: string) {
    if (selected.includes(option)) {
      onChange(selected.filter((s) => s !== option));
    } else {
      const next = [...selected, option];
      if (next.length === options.length) {
        onChange([]);
      } else {
        onChange(next);
      }
    }
  }

  function selectAll() {
    onChange([]);
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-1.5 h-7 px-2.5 text-xs rounded-md border border-border bg-background hover:bg-accent/60 transition-colors text-muted-foreground hover:text-foreground"
          data-testid={`filter-${label.toLowerCase().replace(/\s+/g, "-")}`}
        >
          {label}
          {selected.length > 0 && (
            <span className="bg-violet-500/20 text-violet-600 dark:text-violet-400 text-[10px] font-semibold px-1.5 py-0.5 rounded-full leading-none">
              {selected.length}
            </span>
          )}
          <ChevronDown className="w-3 h-3 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-2" align="start">
        <label
          className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent/60 cursor-pointer text-xs font-medium text-foreground"
          data-testid={`filter-${label.toLowerCase().replace(/\s+/g, "-")}-all`}
        >
          <Checkbox
            checked={allSelected}
            onCheckedChange={selectAll}
          />
          All
        </label>
        <div className="h-px bg-border my-1" />
        <div className="max-h-48 overflow-y-auto space-y-0.5">
          {options.map((option) => (
            <label
              key={option}
              className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent/60 cursor-pointer text-xs text-foreground"
              data-testid={`filter-option-${option.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <Checkbox
                checked={selected.includes(option)}
                onCheckedChange={() => toggle(option)}
              />
              {option}
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr + "T00:00:00Z");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function GrantResultCard({
  signal,
  isSaved,
  onSave,
  projects,
}: {
  signal: SignalResult;
  isSaved: boolean;
  onSave: (g: { title: string; url: string; agencyName: string; notes: string; projectId?: number }) => void;
  projects: ResearchProject[];
}) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [projectId, setProjectId] = useState<number | undefined>(undefined);

  function handleSave() {
    onSave({
      title: signal.title,
      url: signal.url,
      agencyName: signal.institution_or_sponsor || "",
      notes,
      projectId,
    });
    setOpen(false);
    setNotes("");
    setProjectId(undefined);
  }

  const oppStatus = signal.metadata?.opp_status;
  const sourceLabel = (signal.metadata?.source_label as string) ?? signal.source_key ?? "";

  return (
    <div
      className="bg-card border border-border rounded-lg p-4 flex flex-col gap-2 hover:border-violet-500/30 transition-colors"
      data-testid={`grant-result-card-${signal.id}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-sm font-semibold text-foreground line-clamp-2 leading-snug">{signal.title}</p>
            {sourceLabel && (
              <Badge variant="secondary" className="text-[9px] shrink-0 bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30" data-testid={`grant-source-badge-${signal.id}`}>
                {sourceLabel}
              </Badge>
            )}
            {oppStatus && (
              <Badge
                variant="secondary"
                className={`text-[10px] shrink-0 ${
                  oppStatus === "posted"
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                    : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                }`}
                data-testid={`grant-status-badge-${signal.id}`}
              >
                {oppStatus === "posted" ? "Posted" : "Forecasted"}
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {signal.institution_or_sponsor && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Building2 className="w-3 h-3" />
                {signal.institution_or_sponsor}
              </span>
            )}
            {signal.date && (
              <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-medium">
                <Calendar className="w-3 h-3" />
                Deadline: {signal.date}
              </span>
            )}
            {signal.metadata?.opp_num && (
              <span className="text-xs text-muted-foreground">
                {signal.metadata.opp_num}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {signal.url && (
            <a
              href={signal.url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 text-muted-foreground hover:text-foreground"
              data-testid={`grant-result-link-${signal.id}`}
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={`w-7 h-7 ${isSaved ? "text-violet-600 dark:text-violet-400" : "text-muted-foreground hover:text-violet-600"}`}
                disabled={isSaved}
                data-testid={`grant-save-btn-${signal.id}`}
              >
                {isSaved ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-3" align="end">
              <p className="text-xs font-semibold text-foreground mb-2">Save Grant</p>
              <div className="space-y-2">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Link to project (optional)</p>
                  <Select
                    value={projectId?.toString() ?? "none"}
                    onValueChange={(v) => setProjectId(v === "none" ? undefined : parseInt(v))}
                  >
                    <SelectTrigger className="h-7 text-xs" data-testid="grant-save-project-select">
                      <SelectValue placeholder="No project" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No project</SelectItem>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={p.id.toString()}>{p.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Notes</p>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Why is this relevant?"
                    className="text-xs h-16 resize-none"
                    data-testid="grant-save-notes"
                  />
                </div>
                <Button size="sm" className="w-full h-7 text-xs" onClick={handleSave} data-testid="grant-save-confirm">
                  Save Grant
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
      {signal.text && signal.text !== signal.title && (
        <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">{signal.text}</p>
      )}
    </div>
  );
}

function SavedGrantCard({
  grant,
  projects,
  onStatusChange,
  onDelete,
}: {
  grant: SavedGrant;
  projects: ResearchProject[];
  onStatusChange: (status: string) => void;
  onDelete: () => void;
}) {
  const linkedProject = projects.find((p) => p.id === grant.projectId);

  return (
    <div
      className="bg-card border border-border rounded-lg p-4 flex flex-col gap-3 hover:border-violet-500/30 transition-colors"
      data-testid={`saved-grant-card-${grant.id}`}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground line-clamp-2 leading-snug">{grant.title}</p>
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
            {grant.agencyName && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Building2 className="w-3 h-3" />
                {grant.agencyName}
              </span>
            )}
            {grant.deadline && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Calendar className="w-3 h-3" />
                {grant.deadline}
              </span>
            )}
            {grant.amount && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <DollarSign className="w-3 h-3" />
                {grant.amount}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {grant.url && (
            <a
              href={grant.url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="w-7 h-7 text-muted-foreground hover:text-red-500"
            onClick={onDelete}
            data-testid={`delete-grant-${grant.id}`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {grant.notes && (
        <p className="text-xs text-muted-foreground bg-muted/40 rounded px-2 py-1.5 leading-relaxed">
          {grant.notes}
        </p>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {(["not_started", "in_progress", "submitted"] as const).map((s) => {
          const cfg = STATUS_CONFIG[s];
          const active = grant.status === s;
          return (
            <button
              key={s}
              onClick={() => onStatusChange(s)}
              className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-all ${
                active ? cfg.color : "bg-transparent text-muted-foreground border-border hover:border-violet-500/40"
              }`}
              data-testid={`grant-status-${s}-${grant.id}`}
            >
              {cfg.label}
            </button>
          );
        })}
        {linkedProject && (
          <Badge variant="outline" className="text-xs border-violet-500/30 text-violet-600 dark:text-violet-400">
            {linkedProject.title}
          </Badge>
        )}
      </div>
    </div>
  );
}

export default function ResearchGrants() {
  const researcherId = useResearcherId();
  const researcherHeaders = useResearcherHeaders();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [tab, setTab] = useState<"find" | "my">("find");
  const [query, setQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [areaFilters, setAreaFilters] = useState<string[]>([]);
  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const [deadlineFilter, setDeadlineFilter] = useState("any");
  const [addOpen, setAddOpen] = useState(false);

  const [addTitle, setAddTitle] = useState("");
  const [addAgency, setAddAgency] = useState("");
  const [addDeadline, setAddDeadline] = useState("");
  const [addAmount, setAddAmount] = useState("");
  const [addNotes, setAddNotes] = useState("");
  const [addStatus, setAddStatus] = useState("not_started");
  const [addProjectId, setAddProjectId] = useState<number | undefined>(undefined);

  const { data: projectsData } = useQuery<{ projects: ResearchProject[] }>({
    queryKey: ["/api/research/projects", researcherId],
    queryFn: () =>
      fetch("/api/research/projects", { headers: researcherHeaders }).then((r) => {
        if (!r.ok) throw new Error("Failed to load projects");
        return r.json();
      }),
    enabled: !!researcherId,
  });
  const projects = projectsData?.projects ?? [];

  const { data: grantsData, isLoading: grantsLoading } = useQuery<{ grants: SavedGrant[] }>({
    queryKey: ["/api/research/grants", researcherId],
    queryFn: () =>
      fetch("/api/research/grants", { headers: researcherHeaders }).then((r) => {
        if (!r.ok) throw new Error("Failed to load grants");
        return r.json();
      }),
    enabled: !!researcherId,
  });
  const savedGrants = grantsData?.grants ?? [];
  const savedUrls = useMemo(() => new Set(savedGrants.map((g) => g.url).filter(Boolean)), [savedGrants]);

  const builtQuery = useMemo(() => {
    const parts = [activeQuery, ...areaFilters].filter(Boolean);
    return parts.join(" ").trim();
  }, [activeQuery, areaFilters]);

  const { data: searchData, isFetching: searching } = useQuery<{ assets: { signals: SignalResult[] }[] }>({
    queryKey: ["/api/search/grants", builtQuery],
    queryFn: async () => {
      const r = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: builtQuery, sources: GRANT_SOURCES, maxPerSource: 20 }),
      });
      if (!r.ok) throw new Error("Search failed");
      return r.json();
    },
    enabled: !!builtQuery,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const rawResults = useMemo(() => searchData?.assets?.flatMap((a) => a.signals ?? []) ?? [], [searchData]);

  const results = useMemo(() => {
    let filtered = rawResults;

    if (statusFilters.length > 0) {
      const lowerSet = new Set(statusFilters.map((s) => s.toLowerCase()));
      filtered = filtered.filter((s) => {
        const status = (s.metadata?.opp_status ?? "").toLowerCase();
        return lowerSet.has(status);
      });
    }

    if (deadlineFilter !== "any") {
      const maxDays = parseInt(deadlineFilter);
      filtered = filtered.filter((s) => {
        if (!s.date) return false;
        const days = daysUntil(s.date);
        return days >= 0 && days <= maxDays;
      });
    }

    return filtered;
  }, [rawResults, statusFilters, deadlineFilter]);

  type SaveGrantPayload = { title: string; url?: string; agencyName?: string; notes?: string; projectId?: number; deadline?: string; amount?: string; status?: string };

  const saveGrant = useMutation({
    mutationFn: async (data: SaveGrantPayload) => {
      const r = await fetch("/api/research/grants", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...researcherHeaders },
        body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Failed to save grant");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/research/grants"] });
      toast({ title: "Grant saved" });
    },
    onError: () => toast({ title: "Failed to save grant", variant: "destructive" }),
  });

  const updateGrant = useMutation({
    mutationFn: async ({ id, ...data }: { id: number } & Partial<SavedGrant>) => {
      const r = await fetch(`/api/research/grants/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...researcherHeaders },
        body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Failed to update grant");
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/research/grants"] }),
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });

  const deleteGrant = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/research/grants/${id}`, {
        method: "DELETE",
        headers: researcherHeaders,
      });
      if (!r.ok) throw new Error("Failed to delete grant");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/research/grants"] });
      toast({ title: "Grant removed" });
    },
    onError: () => toast({ title: "Failed to remove grant", variant: "destructive" }),
  });

  function handleSearch() {
    if (query.trim()) setActiveQuery(query.trim());
  }

  function clearSearch() {
    setQuery("");
    setActiveQuery("");
    setAreaFilters([]);
    setStatusFilters([]);
    setDeadlineFilter("any");
  }

  function handleTabChange(t: "find" | "my") {
    setTab(t);
    clearSearch();
  }

  function handleAddGrant() {
    if (!addTitle.trim()) return;
    saveGrant.mutate({
      title: addTitle,
      agencyName: addAgency,
      deadline: addDeadline || undefined,
      amount: addAmount || undefined,
      notes: addNotes || undefined,
      status: addStatus,
      projectId: addProjectId,
    });
    setAddOpen(false);
    setAddTitle(""); setAddAgency(""); setAddDeadline(""); setAddAmount(""); setAddNotes("");
    setAddStatus("not_started"); setAddProjectId(undefined);
  }

  const hasActiveFilters = areaFilters.length > 0 || statusFilters.length > 0 || deadlineFilter !== "any";
  const hasAnythingActive = !!activeQuery || hasActiveFilters;

  const activeFilterChips: { label: string; clear: () => void }[] = [
    ...areaFilters.map((f) => ({
      label: f,
      clear: () => setAreaFilters((prev) => prev.filter((x) => x !== f)),
    })),
    ...statusFilters.map((f) => ({
      label: f,
      clear: () => setStatusFilters((prev) => prev.filter((x) => x !== f)),
    })),
    ...(deadlineFilter !== "any"
      ? [{ label: `≤ ${deadlineFilter} days`, clear: () => setDeadlineFilter("any") }]
      : []),
  ];

  return (
    <div className="flex flex-col min-h-screen">
      <div className="px-6 pt-6 pb-4 border-b border-border">
        <div className="flex items-center gap-2.5">
          <BadgeDollarSign className="w-5 h-5 text-violet-500" />
          <div>
            <h1 className="text-lg font-bold text-foreground" data-testid="text-grants-title">Grants</h1>
            <p className="text-xs text-muted-foreground">Discover and track research funding opportunities</p>
          </div>
        </div>
        <div className="flex gap-1 mt-4">
          {([["find", "Find Grants"], ["my", "Saved Grants"]] as const).map(([t, label]) => (
            <button
              key={t}
              onClick={() => handleTabChange(t)}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                tab === t
                  ? "bg-violet-500/10 text-violet-600 dark:text-violet-400"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
              }`}
              data-testid={`grants-tab-${t}`}
            >
              {label}
              {t === "my" && savedGrants.length > 0 && (
                <span className="ml-1.5 text-xs bg-violet-500/20 text-violet-600 dark:text-violet-400 px-1.5 py-0.5 rounded-full">
                  {savedGrants.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div>
        {tab === "find" && (
          <div className="p-6 max-w-3xl mx-auto space-y-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  placeholder="Search grants by keyword, disease area, or technique…"
                  className="pl-9 text-sm"
                  data-testid="grants-search-input"
                />
              </div>
              <Button onClick={handleSearch} disabled={!query.trim()} className="shrink-0" data-testid="grants-search-btn">
                {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search"}
              </Button>
              {hasAnythingActive && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 w-9 h-9 text-muted-foreground hover:text-foreground"
                  onClick={clearSearch}
                  data-testid="grants-clear-btn"
                  title="Clear search"
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <MultiSelectFilter
                label="Research Area"
                options={RESEARCH_AREAS}
                selected={areaFilters}
                onChange={setAreaFilters}
              />
              <MultiSelectFilter
                label="Status"
                options={OPP_STATUSES}
                selected={statusFilters}
                onChange={setStatusFilters}
              />
              <Select value={deadlineFilter} onValueChange={setDeadlineFilter}>
                <SelectTrigger className="h-7 text-xs w-36" data-testid="filter-deadline">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEADLINE_OPTIONS.map((d) => (
                    <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {activeFilterChips.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {activeFilterChips.map((chip) => (
                  <button
                    key={chip.label}
                    onClick={chip.clear}
                    className="flex items-center gap-1 text-xs bg-violet-500/10 text-violet-600 dark:text-violet-400 px-2 py-1 rounded-full border border-violet-500/20 hover:bg-violet-500/20 transition-colors"
                    data-testid={`filter-chip-${chip.label.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    {chip.label}
                    <X className="w-3 h-3" />
                  </button>
                ))}
                <button
                  onClick={() => { setAreaFilters([]); setStatusFilters([]); setDeadlineFilter("any"); }}
                  className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 transition-colors"
                  data-testid="filter-clear-all"
                >
                  Clear all
                </button>
              </div>
            )}

            {!builtQuery && (
              <div className="text-center py-16 text-muted-foreground">
                <BadgeDollarSign className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium">Search open funding opportunities</p>
                <p className="text-xs mt-1 max-w-xs mx-auto">Search across Grants.gov, NIH Reporter, NSF Awards, and EU CORDIS</p>
                <div className="flex flex-wrap justify-center gap-2 mt-4">
                  {["CRISPR cancer therapy", "AI drug discovery", "gene editing", "immunotherapy"].map((s) => (
                    <button
                      key={s}
                      onClick={() => { setQuery(s); setActiveQuery(s); }}
                      className="text-xs px-3 py-1.5 rounded-full border border-border text-muted-foreground hover:border-violet-500/40 hover:text-foreground transition-colors"
                      data-testid={`grants-suggestion-${s}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {builtQuery && searching && (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-24 w-full rounded-lg" />
                ))}
              </div>
            )}

            {builtQuery && !searching && results.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <p className="text-sm">No grants found{rawResults.length > 0 ? " matching your filters" : ` for "${builtQuery}"`}</p>
                <p className="text-xs mt-1">
                  {rawResults.length > 0
                    ? `${rawResults.length} result${rawResults.length !== 1 ? "s" : ""} hidden by filters — try adjusting them`
                    : "Try a broader keyword or different filters"}
                </p>
              </div>
            )}

            {results.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  {results.length} opportunit{results.length === 1 ? "y" : "ies"} found
                  {rawResults.length > results.length && (
                    <span className="ml-1">({rawResults.length - results.length} filtered out)</span>
                  )}
                </p>
                {results.map((signal) => (
                  <GrantResultCard
                    key={signal.id}
                    signal={signal}
                    isSaved={savedUrls.has(signal.url)}
                    onSave={(g) => saveGrant.mutate(g)}
                    projects={projects}
                  />
                ))}
              </div>
            )}

            <div className="rounded-lg border border-dashed border-border p-4 mt-6" data-testid="coming-soon-sources">
              <p className="text-xs font-semibold text-muted-foreground mb-2">Coming Soon</p>
              <div className="flex flex-wrap gap-2">
                {["SBIR.gov", "UKRI", "Wellcome Trust", "ERC"].map((name) => (
                  <Badge key={name} variant="outline" className="text-[11px] text-muted-foreground border-border">
                    {name}
                  </Badge>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">More funding databases will be added in upcoming releases.</p>
            </div>
          </div>
        )}

        {tab === "my" && (
          <div className="p-6 max-w-3xl mx-auto">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-muted-foreground">
                {savedGrants.length} grant{savedGrants.length !== 1 ? "s" : ""} saved
              </p>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs"
                onClick={() => setAddOpen(true)}
                data-testid="add-grant-btn"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Grant
              </Button>
            </div>

            {grantsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full rounded-lg" />)}
              </div>
            ) : savedGrants.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-lg">
                <BadgeDollarSign className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium">No grants saved yet</p>
                <p className="text-xs mt-1 max-w-xs mx-auto">Save grants from the search tab, or add one you found offline</p>
                <div className="flex justify-center gap-2 mt-4">
                  <Button size="sm" variant="outline" onClick={() => setTab("find")} className="text-xs">
                    Find Grants
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setAddOpen(true)} className="text-xs gap-1">
                    <Plus className="w-3 h-3" /> Add Manually
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {savedGrants.map((g) => (
                  <SavedGrantCard
                    key={g.id}
                    grant={g}
                    projects={projects}
                    onStatusChange={(status) => updateGrant.mutate({ id: g.id, status })}
                    onDelete={() => deleteGrant.mutate(g.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Grant</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <p className="text-xs font-medium text-foreground mb-1">Grant Title *</p>
              <Input
                value={addTitle}
                onChange={(e) => setAddTitle(e.target.value)}
                placeholder="e.g. NIH R01 – Mechanisms of CRISPR Repair"
                className="text-sm"
                data-testid="add-grant-title"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-medium text-foreground mb-1">Source / Agency</p>
                <Input
                  value={addAgency}
                  onChange={(e) => setAddAgency(e.target.value)}
                  placeholder="e.g. NIH, Wellcome"
                  className="text-sm"
                  data-testid="add-grant-agency"
                />
              </div>
              <div>
                <p className="text-xs font-medium text-foreground mb-1">Submission Date</p>
                <Input
                  type="date"
                  value={addDeadline}
                  onChange={(e) => setAddDeadline(e.target.value)}
                  className="text-sm"
                  data-testid="add-grant-deadline"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-medium text-foreground mb-1">Amount</p>
                <Input
                  value={addAmount}
                  onChange={(e) => setAddAmount(e.target.value)}
                  placeholder="e.g. $500K"
                  className="text-sm"
                  data-testid="add-grant-amount"
                />
              </div>
              <div>
                <p className="text-xs font-medium text-foreground mb-1">Link to Project</p>
                <Select
                  value={addProjectId?.toString() ?? "none"}
                  onValueChange={(v) => setAddProjectId(v === "none" ? undefined : parseInt(v))}
                >
                  <SelectTrigger className="text-sm h-9" data-testid="add-grant-project">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id.toString()}>{p.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-foreground mb-1">Notes</p>
              <Textarea
                value={addNotes}
                onChange={(e) => setAddNotes(e.target.value)}
                placeholder="Relevance, requirements, collaborators…"
                className="text-sm resize-none h-16"
                data-testid="add-grant-notes"
              />
            </div>
            <div>
              <p className="text-xs font-medium text-foreground mb-2">Status</p>
              <div className="flex gap-2">
                {(["not_started", "in_progress", "submitted"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setAddStatus(s)}
                    className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-all ${
                      addStatus === s
                        ? STATUS_CONFIG[s].color
                        : "bg-transparent text-muted-foreground border-border hover:border-violet-500/40"
                    }`}
                    data-testid={`add-grant-status-${s}`}
                  >
                    {STATUS_CONFIG[s].label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} data-testid="add-grant-cancel">Cancel</Button>
            <Button
              onClick={handleAddGrant}
              disabled={!addTitle.trim() || saveGrant.isPending}
              data-testid="add-grant-submit"
            >
              {saveGrant.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Add Grant
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
