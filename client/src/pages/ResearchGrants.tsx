import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import {
  BadgeDollarSign, Search, Bookmark, BookmarkCheck, Plus, Trash2,
  ExternalLink, Calendar, Building2, DollarSign, Loader2, X,
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
import { useResearcherId, useResearcherHeaders } from "@/hooks/use-researcher";
import { useToast } from "@/hooks/use-toast";
import type { SavedGrant, ResearchProject } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

const GRANT_SOURCES = ["nih_reporter", "nsf_awards", "eu_cordis"];

const RESEARCH_FIELDS = [
  "Biotech", "Drug Discovery", "Genomics", "Immunology", "Oncology",
  "AI in Healthcare", "Medical Devices", "Diagnostics", "Digital Health", "Public Health",
];

const CAREER_STAGES = [
  "Graduate Student", "Postdoctoral Researcher", "Early Career Investigator",
  "Principal Investigator", "Institutional / Consortium",
];

const AMOUNT_RANGES = [
  { label: "Any amount", value: "" },
  { label: "< $50K", value: "<$50K" },
  { label: "$50K – $100K", value: "$50K-$100K" },
  { label: "$100K – $500K", value: "$100K-$500K" },
  { label: "$500K – $1M", value: "$500K-$1M" },
  { label: "$1M – $5M", value: "$1M-$5M" },
  { label: "$5M+", value: "$5M+" },
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
};

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

  return (
    <div
      className="bg-card border border-border rounded-lg p-4 flex flex-col gap-2 hover:border-violet-500/30 transition-colors"
      data-testid={`grant-result-card-${signal.id}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground line-clamp-2 leading-snug">{signal.title}</p>
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
            {signal.institution_or_sponsor && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Building2 className="w-3 h-3" />
                {signal.institution_or_sponsor}
              </span>
            )}
            {signal.date && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Calendar className="w-3 h-3" />
                {signal.date}
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
              <p className="text-xs font-semibold text-foreground mb-2">Save to My Grants</p>
              <div className="space-y-2">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Link to project (optional)</p>
                  <Select
                    value={projectId?.toString() ?? ""}
                    onValueChange={(v) => setProjectId(v ? parseInt(v) : undefined)}
                  >
                    <SelectTrigger className="h-7 text-xs" data-testid="grant-save-project-select">
                      <SelectValue placeholder="No project" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">No project</SelectItem>
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
      {signal.text && (
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
  const [fieldFilter, setFieldFilter] = useState("");
  const [careerFilter, setCareerFilter] = useState("");
  const [amountFilter, setAmountFilter] = useState("");
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
    const parts = [activeQuery, fieldFilter, careerFilter, amountFilter].filter(Boolean);
    return parts.join(" ").trim();
  }, [activeQuery, fieldFilter, careerFilter, amountFilter]);

  const { data: searchData, isFetching: searching } = useQuery<{ assets: { signals: SignalResult[] }[] }>({
    queryKey: ["/api/search/grants", builtQuery],
    queryFn: async () => {
      const r = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: builtQuery, sources: GRANT_SOURCES, maxPerSource: 15 }),
      });
      if (!r.ok) throw new Error("Search failed");
      return r.json();
    },
    enabled: !!builtQuery,
  });
  const results = useMemo(() => searchData?.assets?.flatMap((a) => a.signals ?? []) ?? [], [searchData]);

  const saveGrant = useMutation({
    mutationFn: (data: Partial<SavedGrant>) =>
      apiRequest("POST", "/api/research/grants", { ...data, userId: researcherId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/research/grants"] });
      toast({ title: "Grant saved" });
    },
    onError: () => toast({ title: "Failed to save grant", variant: "destructive" }),
  });

  const updateGrant = useMutation({
    mutationFn: ({ id, ...data }: { id: number } & Partial<SavedGrant>) =>
      apiRequest("PATCH", `/api/research/grants/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/research/grants"] }),
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });

  const deleteGrant = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/research/grants/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/research/grants"] });
      toast({ title: "Grant removed" });
    },
    onError: () => toast({ title: "Failed to remove grant", variant: "destructive" }),
  });

  function handleSearch() {
    if (query.trim()) setActiveQuery(query.trim());
  }

  function clearFilter(setter: (v: string) => void) {
    setter("");
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
    } as any);
    setAddOpen(false);
    setAddTitle(""); setAddAgency(""); setAddDeadline(""); setAddAmount(""); setAddNotes("");
    setAddStatus("not_started"); setAddProjectId(undefined);
  }

  const activeFilters = [
    fieldFilter && { label: fieldFilter, clear: () => clearFilter(setFieldFilter) },
    careerFilter && { label: careerFilter, clear: () => clearFilter(setCareerFilter) },
    amountFilter && { label: amountFilter, clear: () => clearFilter(setAmountFilter) },
  ].filter(Boolean) as { label: string; clear: () => void }[];

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-6 pt-6 pb-4 border-b border-border shrink-0">
        <div className="flex items-center gap-2.5">
          <BadgeDollarSign className="w-5 h-5 text-violet-500" />
          <div>
            <h1 className="text-lg font-bold text-foreground">My Grants</h1>
            <p className="text-xs text-muted-foreground">Discover and track research funding opportunities</p>
          </div>
        </div>
        <div className="flex gap-1 mt-4">
          {([["find", "Find Grants"], ["my", "My Grants"]] as const).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
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

      <div className="flex-1 overflow-y-auto">
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
            </div>

            <div className="flex flex-wrap gap-2">
              <Select value={fieldFilter} onValueChange={setFieldFilter}>
                <SelectTrigger className="h-7 text-xs w-40" data-testid="grants-filter-field">
                  <SelectValue placeholder="Research field" />
                </SelectTrigger>
                <SelectContent>
                  {RESEARCH_FIELDS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={careerFilter} onValueChange={setCareerFilter}>
                <SelectTrigger className="h-7 text-xs w-44" data-testid="grants-filter-career">
                  <SelectValue placeholder="Career stage" />
                </SelectTrigger>
                <SelectContent>
                  {CAREER_STAGES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={amountFilter} onValueChange={setAmountFilter}>
                <SelectTrigger className="h-7 text-xs w-40" data-testid="grants-filter-amount">
                  <SelectValue placeholder="Funding amount" />
                </SelectTrigger>
                <SelectContent>
                  {AMOUNT_RANGES.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {activeFilters.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {activeFilters.map((f) => (
                  <button
                    key={f.label}
                    onClick={f.clear}
                    className="flex items-center gap-1 text-xs bg-violet-500/10 text-violet-600 dark:text-violet-400 px-2 py-1 rounded-full border border-violet-500/20 hover:bg-violet-500/20 transition-colors"
                  >
                    {f.label}
                    <X className="w-3 h-3" />
                  </button>
                ))}
              </div>
            )}

            {!builtQuery && (
              <div className="text-center py-16 text-muted-foreground">
                <BadgeDollarSign className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium">Search across NIH, NSF, and EU CORDIS</p>
                <p className="text-xs mt-1 max-w-xs mx-auto">Enter keywords to find active funding opportunities matching your research</p>
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
                <p className="text-sm">No grants found for "{builtQuery}"</p>
                <p className="text-xs mt-1">Try a broader keyword or different filters</p>
              </div>
            )}

            {results.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">{results.length} opportunities found</p>
                {results.map((signal) => (
                  <GrantResultCard
                    key={signal.id}
                    signal={signal}
                    isSaved={savedUrls.has(signal.url)}
                    onSave={(g) => saveGrant.mutate(g as any)}
                    projects={projects}
                  />
                ))}
              </div>
            )}
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
                  value={addProjectId?.toString() ?? ""}
                  onValueChange={(v) => setAddProjectId(v ? parseInt(v) : undefined)}
                >
                  <SelectTrigger className="text-sm h-9" data-testid="add-grant-project">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
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
