import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import {
  BadgeDollarSign, Search, Bookmark, BookmarkCheck, Plus, Trash2,
  ExternalLink, Calendar, Building2, DollarSign, Loader2, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { useResearcherId, useResearcherHeaders } from "@/hooks/use-researcher";
import { useToast } from "@/hooks/use-toast";
import { PORTAL_ACCENT, accentMix } from "@/components/sidebar-primitives";
import type { SavedGrant, ResearchProject } from "@shared/schema";

const AMBER = "hsl(38 92% 50%)";
const EMERALD = "hsl(142 52% 36%)";
const ACCENT = PORTAL_ACCENT.lab;

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
  not_started: { label: "Not Started", color: "bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20" },
  in_progress: { label: "In Progress", color: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
  submitted: { label: "Submitted", color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
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
    source_label?: string;
    [key: string]: unknown;
  };
};

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr + "T00:00:00Z");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function ToggleChip({
  label,
  active,
  onClick,
  accent = ACCENT,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  accent?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="text-[11px] font-medium px-2.5 py-1 rounded-md border transition-all"
      style={
        active
          ? { background: accentMix(accent, 10), color: accent, borderColor: accentMix(accent, 35) }
          : { background: "transparent", color: "hsl(var(--muted-foreground))", borderColor: "hsl(var(--border) / 0.5)" }
      }
    >
      {label}
    </button>
  );
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
    onSave({ title: signal.title, url: signal.url, agencyName: signal.institution_or_sponsor || "", notes, projectId });
    setOpen(false);
    setNotes("");
    setProjectId(undefined);
  }

  const oppStatus = signal.metadata?.opp_status;
  const sourceLabel = (signal.metadata?.source_label as string) ?? signal.source_key ?? "";

  return (
    <div
      className="relative rounded-lg border border-amber-500/20 bg-amber-500/5 dark:bg-amber-950/20 flex flex-col gap-2 p-4 overflow-hidden transition-all"
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = "hsl(38 92% 50% / 0.4)";
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)";
        (e.currentTarget as HTMLDivElement).style.boxShadow = `0 4px 16px ${AMBER}18`;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = "";
        (e.currentTarget as HTMLDivElement).style.transform = "";
        (e.currentTarget as HTMLDivElement).style.boxShadow = "";
      }}
      data-testid={`grant-result-card-${signal.id}`}
    >
      <div className="absolute left-0 inset-y-0 w-[3px] rounded-l-lg bg-amber-500" />

      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 mb-1.5">
            <p className="text-sm font-semibold text-foreground leading-snug flex-1 line-clamp-2">
              {signal.title}
            </p>
            <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
              {sourceLabel && (
                <span
                  className="text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide border"
                  style={{
                    background: accentMix(AMBER, 10),
                    color: AMBER,
                    borderColor: accentMix(AMBER, 30),
                  }}
                  data-testid={`grant-source-badge-${signal.id}`}
                >
                  {sourceLabel}
                </span>
              )}
              {oppStatus && (
                <span
                  className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border uppercase tracking-wide ${
                    oppStatus === "posted"
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                      : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                  }`}
                  data-testid={`grant-status-badge-${signal.id}`}
                >
                  {oppStatus === "posted" ? "Open" : "Forecast"}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {signal.institution_or_sponsor && (
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Building2 className="w-3 h-3" />
                {signal.institution_or_sponsor}
              </span>
            )}
            {signal.date && (
              <span className="flex items-center gap-1 text-[11px] font-medium" style={{ color: AMBER }}>
                <Calendar className="w-3 h-3" />
                Deadline: {signal.date}
              </span>
            )}
            {signal.metadata?.opp_num && (
              <span className="text-[11px] font-mono text-muted-foreground">
                {signal.metadata.opp_num as string}
              </span>
            )}
          </div>

          {signal.text && signal.text !== signal.title && (
            <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed mt-1.5">
              {signal.text}
            </p>
          )}
        </div>

        <div className="flex flex-col items-center gap-1.5 shrink-0">
          {signal.url && (
            <a
              href={signal.url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
              data-testid={`grant-result-link-${signal.id}`}
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <button
                className={`p-1.5 transition-colors ${isSaved ? "text-amber-500" : "text-muted-foreground hover:text-amber-500"}`}
                disabled={isSaved}
                data-testid={`grant-save-btn-${signal.id}`}
              >
                {isSaved ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
              </button>
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
      className="relative rounded-lg border border-amber-500/20 bg-amber-500/5 dark:bg-amber-950/20 flex flex-col gap-3 p-4 overflow-hidden transition-all"
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = "hsl(38 92% 50% / 0.4)";
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = "";
        (e.currentTarget as HTMLDivElement).style.transform = "";
      }}
      data-testid={`saved-grant-card-${grant.id}`}
    >
      <div className="absolute left-0 inset-y-0 w-[3px] rounded-l-lg bg-amber-500" />

      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2">{grant.title}</p>
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
            {grant.agencyName && (
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Building2 className="w-3 h-3" />
                {grant.agencyName}
              </span>
            )}
            {grant.deadline && (
              <span className="flex items-center gap-1 text-[11px] font-medium" style={{ color: AMBER }}>
                <Calendar className="w-3 h-3" />
                {grant.deadline}
              </span>
            )}
            {grant.amount && (
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <DollarSign className="w-3 h-3" />
                {grant.amount}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {grant.url && (
            <a href={grant.url} target="_blank" rel="noopener noreferrer" className="p-1.5 text-muted-foreground hover:text-foreground">
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
          <button
            className="p-1.5 text-muted-foreground/40 hover:text-red-500 transition-colors"
            onClick={onDelete}
            data-testid={`delete-grant-${grant.id}`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {grant.notes && (
        <p className="text-[11px] text-muted-foreground bg-black/5 dark:bg-white/5 rounded px-2 py-1.5 leading-relaxed">
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
              className={`text-[11px] font-medium px-2 py-0.5 rounded border transition-all ${
                active ? cfg.color : "bg-transparent text-muted-foreground border-border/50 hover:border-amber-500/40"
              }`}
              data-testid={`grant-status-${s}-${grant.id}`}
            >
              {cfg.label}
            </button>
          );
        })}
        {linkedProject && (
          <span
            className="text-[11px] font-medium px-2 py-0.5 rounded border truncate max-w-[140px]"
            style={{
              background: accentMix(ACCENT, 8),
              color: ACCENT,
              borderColor: accentMix(ACCENT, 25),
            }}
          >
            {linkedProject.title}
          </span>
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
    queryFn: () => fetch("/api/research/projects", { headers: researcherHeaders }).then((r) => {
      if (!r.ok) throw new Error("Failed to load projects");
      return r.json();
    }),
    enabled: !!researcherId,
  });
  const projects = projectsData?.projects ?? [];

  const { data: grantsData, isLoading: grantsLoading } = useQuery<{ grants: SavedGrant[] }>({
    queryKey: ["/api/research/grants", researcherId],
    queryFn: () => fetch("/api/research/grants", { headers: researcherHeaders }).then((r) => {
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
      filtered = filtered.filter((s) => lowerSet.has((s.metadata?.opp_status ?? "").toLowerCase()));
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/research/grants"] }); toast({ title: "Grant saved" }); },
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
      const r = await fetch(`/api/research/grants/${id}`, { method: "DELETE", headers: researcherHeaders });
      if (!r.ok) throw new Error("Failed to delete grant");
      return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/research/grants"] }); toast({ title: "Grant removed" }); },
    onError: () => toast({ title: "Failed to remove grant", variant: "destructive" }),
  });

  function handleSearch() { if (query.trim()) setActiveQuery(query.trim()); }

  function clearSearch() {
    setQuery(""); setActiveQuery(""); setAreaFilters([]); setStatusFilters([]); setDeadlineFilter("any");
  }

  function handleTabChange(t: "find" | "my") { setTab(t); clearSearch(); }

  function handleAddGrant() {
    if (!addTitle.trim()) return;
    saveGrant.mutate({ title: addTitle, agencyName: addAgency, deadline: addDeadline || undefined, amount: addAmount || undefined, notes: addNotes || undefined, status: addStatus, projectId: addProjectId });
    setAddOpen(false);
    setAddTitle(""); setAddAgency(""); setAddDeadline(""); setAddAmount(""); setAddNotes("");
    setAddStatus("not_started"); setAddProjectId(undefined);
  }

  const hasAnythingActive = !!activeQuery || areaFilters.length > 0 || statusFilters.length > 0 || deadlineFilter !== "any";

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <div className="px-6 pt-6 pb-0">
        <div
          className="rounded-xl border border-border p-4 flex items-center justify-between gap-4 mb-5"
          style={{ background: accentMix(AMBER, 5) }}
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: AMBER }}>
              <BadgeDollarSign className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-foreground" data-testid="text-grants-title">Grants</h1>
              <p className="text-xs text-muted-foreground">
                {savedGrants.length > 0 ? `${savedGrants.length} tracked · Search across NIH, NSF, Grants.gov, EU CORDIS` : "Discover and track research funding opportunities"}
              </p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border pb-0 -mb-px">
          {([["find", "Find Grants"], ["my", "Saved Grants"]] as const).map(([t, label]) => (
            <button
              key={t}
              onClick={() => handleTabChange(t)}
              className="relative px-4 py-2 text-sm font-medium transition-all rounded-t-md"
              style={
                tab === t
                  ? { color: AMBER, background: accentMix(AMBER, 6), borderBottom: `2px solid ${AMBER}` }
                  : { color: "hsl(var(--muted-foreground))" }
              }
              data-testid={`grants-tab-${t}`}
            >
              {label}
              {t === "my" && savedGrants.length > 0 && (
                <span
                  className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full tabular-nums"
                  style={{ background: accentMix(AMBER, 15), color: AMBER }}
                >
                  {savedGrants.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Find Grants */}
      {tab === "find" && (
        <div className="p-6 max-w-3xl mx-auto space-y-4 w-full">
          {/* Search bar */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="Search grants by keyword, disease area, technique…"
                className="pl-9 text-sm"
                data-testid="grants-search-input"
              />
            </div>
            <Button
              onClick={handleSearch}
              disabled={!query.trim()}
              size="sm"
              className="shrink-0 text-white"
              style={{ background: AMBER }}
              data-testid="grants-search-btn"
            >
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search"}
            </Button>
            {hasAnythingActive && (
              <Button variant="ghost" size="icon" className="shrink-0 w-9 h-9" onClick={clearSearch} data-testid="grants-clear-btn">
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>

          {/* Inline filter chips */}
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mr-1">Area</span>
            {RESEARCH_AREAS.slice(0, 6).map((area) => (
              <ToggleChip
                key={area}
                label={area}
                active={areaFilters.includes(area)}
                onClick={() =>
                  setAreaFilters((prev) =>
                    prev.includes(area) ? prev.filter((x) => x !== area) : [...prev, area]
                  )
                }
                accent={AMBER}
              />
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mr-1">Status</span>
            {OPP_STATUSES.map((s) => (
              <ToggleChip
                key={s}
                label={s}
                active={statusFilters.includes(s)}
                onClick={() =>
                  setStatusFilters((prev) =>
                    prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
                  )
                }
                accent={AMBER}
              />
            ))}
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mr-1 ml-2">Deadline</span>
            {DEADLINE_OPTIONS.slice(1).map((d) => (
              <ToggleChip
                key={d.value}
                label={d.label}
                active={deadlineFilter === d.value}
                onClick={() => setDeadlineFilter(deadlineFilter === d.value ? "any" : d.value)}
                accent={AMBER}
              />
            ))}
          </div>

          {/* Active filter pills */}
          {(areaFilters.length > 0 || statusFilters.length > 0) && (
            <div className="flex flex-wrap gap-1.5 items-center">
              {[...areaFilters, ...statusFilters].map((f) => (
                <span
                  key={f}
                  className="flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border"
                  style={{ background: accentMix(AMBER, 10), color: AMBER, borderColor: accentMix(AMBER, 30) }}
                >
                  {f}
                  <button
                    onClick={() => {
                      setAreaFilters((prev) => prev.filter((x) => x !== f));
                      setStatusFilters((prev) => prev.filter((x) => x !== f));
                    }}
                    className="hover:opacity-70"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              <button
                onClick={() => { setAreaFilters([]); setStatusFilters([]); setDeadlineFilter("any"); }}
                className="text-[11px] text-muted-foreground hover:text-foreground"
                data-testid="filter-clear-all"
              >
                Clear all
              </button>
            </div>
          )}

          {/* Empty state */}
          {!builtQuery && (
            <div className="text-center py-16 text-muted-foreground">
              <BadgeDollarSign className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm font-medium">Search open funding opportunities</p>
              <p className="text-xs mt-1 opacity-70">Across Grants.gov · NIH Reporter · NSF Awards · EU CORDIS</p>
              <div className="flex flex-wrap justify-center gap-2 mt-5">
                {["CRISPR cancer therapy", "AI drug discovery", "gene editing", "mRNA immunotherapy"].map((s) => (
                  <button
                    key={s}
                    onClick={() => { setQuery(s); setActiveQuery(s); }}
                    className="text-xs px-3 py-1.5 rounded-full border border-border text-muted-foreground hover:border-amber-500/40 hover:text-foreground transition-colors"
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
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
            </div>
          )}

          {builtQuery && !searching && results.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-sm">No grants found{rawResults.length > 0 ? " matching your filters" : ` for "${builtQuery}"`}</p>
              <p className="text-xs mt-1 opacity-70">
                {rawResults.length > 0
                  ? `${rawResults.length} result${rawResults.length !== 1 ? "s" : ""} hidden by filters`
                  : "Try a broader keyword"}
              </p>
            </div>
          )}

          {results.length > 0 && (
            <div className="space-y-3">
              <p className="text-[11px] text-muted-foreground tabular-nums">
                {results.length} opportunit{results.length === 1 ? "y" : "ies"} found
                {rawResults.length > results.length && (
                  <span className="ml-1 opacity-60">({rawResults.length - results.length} filtered)</span>
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
        </div>
      )}

      {/* Saved Grants */}
      {tab === "my" && (
        <div className="p-6 max-w-3xl mx-auto w-full">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-muted-foreground tabular-nums">
              {savedGrants.length} grant{savedGrants.length !== 1 ? "s" : ""} tracked
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
            <div
              className="text-center py-16 rounded-lg border border-dashed border-border"
              style={{ background: accentMix(AMBER, 3) }}
            >
              <BadgeDollarSign className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm font-medium text-muted-foreground">No grants saved yet</p>
              <p className="text-xs mt-1 text-muted-foreground opacity-70 max-w-xs mx-auto">Save grants from search, or add one you found offline</p>
              <div className="flex justify-center gap-2 mt-4">
                <Button size="sm" variant="outline" onClick={() => setTab("find")} className="text-xs">Find Grants</Button>
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

      {/* Add Grant Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Grant</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Grant Title *</p>
              <Input value={addTitle} onChange={(e) => setAddTitle(e.target.value)} placeholder="e.g. NIH R01 – Mechanisms of CRISPR Repair" data-testid="add-grant-title" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Source / Agency</p>
                <Input value={addAgency} onChange={(e) => setAddAgency(e.target.value)} placeholder="e.g. NIH, Wellcome" data-testid="add-grant-agency" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Submission Date</p>
                <Input type="date" value={addDeadline} onChange={(e) => setAddDeadline(e.target.value)} data-testid="add-grant-deadline" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Amount</p>
                <Input value={addAmount} onChange={(e) => setAddAmount(e.target.value)} placeholder="e.g. $500K" data-testid="add-grant-amount" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Link to Project</p>
                <Select value={addProjectId?.toString() ?? "none"} onValueChange={(v) => setAddProjectId(v === "none" ? undefined : parseInt(v))}>
                  <SelectTrigger data-testid="add-grant-project"><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {projects.map((p) => <SelectItem key={p.id} value={p.id.toString()}>{p.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Notes</p>
              <Textarea value={addNotes} onChange={(e) => setAddNotes(e.target.value)} placeholder="Relevance, requirements, collaborators…" className="resize-none h-16" data-testid="add-grant-notes" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Status</p>
              <div className="flex gap-2">
                {(["not_started", "in_progress", "submitted"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setAddStatus(s)}
                    className={`text-xs px-2.5 py-1 rounded-md border font-medium transition-all ${addStatus === s ? STATUS_CONFIG[s].color : "bg-transparent text-muted-foreground border-border/50"}`}
                    data-testid={`add-grant-status-${s}`}
                  >
                    {STATUS_CONFIG[s].label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAddOpen(false)} data-testid="add-grant-cancel">Cancel</Button>
            <Button size="sm" onClick={handleAddGrant} disabled={!addTitle.trim() || saveGrant.isPending} data-testid="add-grant-submit">
              {saveGrant.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Add Grant
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
