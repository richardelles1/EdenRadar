import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Bell,
  Plus,
  ChevronDown,
  ChevronUp,
  Building2,
  Lightbulb,
  FlaskConical,
  Package,
  Clock,
  Trash2,
  Check,
  ChevronsUpDown,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { UserAlert } from "@shared/schema";

const STORAGE_KEY = "edenLastSeenAlerts";

interface DeltaInstitution {
  institution: string;
  count: number;
  sampleAssets: string[];
}

interface IndustryDeltaResponse {
  newAssets: {
    total: number;
    byInstitution: DeltaInstitution[];
  };
  newConcepts: {
    total: number;
    items: Array<{ id: number; title: string; therapeuticArea: string; submitterAffiliation?: string; oneLiner?: string }>;
  };
  newProjects: {
    total: number;
    items: Array<{ id: number; title: string; discoveryTitle?: string; researchArea?: string; status: string; discoverySummary?: string; description?: string; projectUrl?: string | null; projectContributors?: Array<{ name: string; institution: string; role: string; email: string }> | null }>;
  };
  windowHours: number;
  since?: string;
}

function formatRelative(dateStr: string | null | undefined): string {
  if (!dateStr) return "last 48h";
  const ms = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor(ms / 3600000);
  if (hours < 1) return "the last hour";
  if (hours < 24) return `the last ${hours}h`;
  if (days === 1) return "yesterday";
  if (days < 7) return `the last ${days} days`;
  if (days < 30) return `the last ${Math.round(days / 7)} weeks`;
  return `the last ${Math.round(days / 30)} months`;
}

function SectionHeader({
  icon: Icon,
  label,
  count,
  countLabel,
  color,
  expanded,
  onToggle,
  hasNew,
}: {
  icon: React.ElementType;
  label: string;
  count: number;
  countLabel?: string;
  color: string;
  expanded: boolean;
  onToggle: () => void;
  hasNew?: boolean;
}) {
  return (
    <button
      className="w-full flex items-center gap-3 text-left select-none"
      onClick={onToggle}
      data-testid={`alerts-section-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <div className={`relative w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${color}`}>
        <Icon className="w-4 h-4" />
        {hasNew && !expanded && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-primary border border-card" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-sm font-semibold text-foreground">{label}</span>
      </div>
      <Badge variant="secondary" className="shrink-0 text-[11px] tabular-nums">
        {countLabel ?? `${count} new`}
      </Badge>
      {expanded ? (
        <ChevronUp className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      ) : (
        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      )}
    </button>
  );
}

function MyAlertsSection({ onCreateAlert }: { onCreateAlert: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const { data: alerts = [], isLoading } = useQuery<UserAlert[]>({
    queryKey: ["/api/alerts"],
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/alerts/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/alerts"] }),
  });

  return (
    <div className="rounded-lg border border-card-border bg-card overflow-hidden">
      <div className="p-4">
        <SectionHeader
          icon={Bell}
          label="My Alerts"
          count={alerts.length}
          countLabel={`${alerts.length} saved`}
          color="bg-emerald-500/10 text-emerald-500"
          expanded={expanded}
          onToggle={() => setExpanded((v) => !v)}
          hasNew={false}
        />
      </div>
      {expanded && (
        <div className="border-t border-card-border/60 px-4 pb-4">
          {isLoading ? (
            <div className="pt-3 space-y-2">
              {[1, 2].map((i) => <Skeleton key={i} className="h-12 w-full rounded-md" />)}
            </div>
          ) : alerts.length === 0 ? (
            <div className="pt-3 space-y-2">
              <p className="text-xs text-muted-foreground">No saved alerts yet. Use + Create Alert to set one up.</p>
              <button
                onClick={onCreateAlert}
                className="text-xs text-primary hover:underline"
                data-testid="button-create-first-alert"
              >
                + Create your first alert
              </button>
            </div>
          ) : (
            <div className="pt-3 space-y-2">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className="rounded-md border border-card-border/60 bg-background/50 p-3 flex items-start gap-3"
                  data-testid={`alert-card-${alert.id}`}
                >
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <p className="text-xs font-medium text-foreground">
                      {alert.query || "Any query"}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {(alert.modalities ?? []).map((m) => (
                        <span key={m} className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 capitalize">{m}</span>
                      ))}
                      {(alert.stages ?? []).map((s) => (
                        <span key={s} className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-500 border border-violet-500/20 capitalize">{s}</span>
                      ))}
                      {(alert.institutions ?? []).map((inst) => (
                        <span key={inst} className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20 truncate max-w-[120px]">{inst}</span>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={() => deleteMutation.mutate(alert.id)}
                    className="text-muted-foreground hover:text-destructive transition-colors shrink-0 mt-0.5"
                    data-testid={`button-delete-alert-${alert.id}`}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TtoAssetsSection({ data, since }: { data: IndustryDeltaResponse["newAssets"]; since?: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-card-border bg-card overflow-hidden">
      <div className="p-4">
        <SectionHeader
          icon={Package}
          label="TTO Assets"
          count={data.total}
          color="bg-primary/10 text-primary"
          expanded={expanded}
          onToggle={() => setExpanded((v) => !v)}
          hasNew={data.total > 0}
        />
      </div>
      {expanded && (
        <div className="border-t border-card-border/60 px-4 pb-4">
          {data.total === 0 ? (
            <p className="text-xs text-muted-foreground pt-3">
              No new TTO assets since your last visit. Check back soon.
            </p>
          ) : (
            <div className="pt-3 space-y-2">
              {data.byInstitution.map((inst, i) => (
                <InstitutionRow key={inst.institution} inst={inst} index={i} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function InstitutionRow({ inst, index }: { inst: DeltaInstitution; index: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="rounded-md border border-card-border/60 bg-background/50"
      data-testid={`delta-card-${index}`}
    >
      <div
        className="flex items-center gap-2.5 p-3 cursor-pointer"
        onClick={() => setOpen((v) => !v)}
      >
        <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span className="flex-1 text-xs font-medium text-foreground truncate">{inst.institution}</span>
        <Badge variant="secondary" className="text-[11px] tabular-nums shrink-0">+{inst.count}</Badge>
        {open ? <ChevronUp className="w-3 h-3 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
      </div>
      {open && inst.sampleAssets.length > 0 && (
        <div className="px-3 pb-3 border-t border-card-border/60">
          <ul className="space-y-1 pt-2">
            {inst.sampleAssets.map((name, i) => (
              <li key={i} className="flex items-start gap-2 text-[11px]">
                <span className="w-1 h-1 rounded-full bg-primary/50 mt-1.5 shrink-0" />
                <Link
                  href={`/scout?q=${encodeURIComponent(name)}`}
                  className="truncate text-primary/80 hover:text-primary hover:underline transition-colors"
                  data-testid={`alert-asset-link-${i}`}
                >
                  {name}
                </Link>
              </li>
            ))}
          </ul>
          {inst.count > inst.sampleAssets.length && (
            <p className="text-[10px] text-muted-foreground mt-1.5 pl-3">
              +{inst.count - inst.sampleAssets.length} more
            </p>
          )}
          <Link
            href={`/scout?q=${encodeURIComponent(inst.institution)}`}
            className="inline-flex items-center gap-1 text-[10px] text-primary/70 hover:text-primary hover:underline mt-2 transition-colors"
            data-testid={`alert-scout-link-${inst.institution}`}
          >
            Search Scout for {inst.institution} assets
          </Link>
        </div>
      )}
    </div>
  );
}

function ConceptsSection({ data }: { data: IndustryDeltaResponse["newConcepts"] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-card-border bg-card overflow-hidden">
      <div className="p-4">
        <SectionHeader
          icon={Lightbulb}
          label="New Concepts"
          count={data.total}
          color="bg-amber-500/10 text-amber-500"
          expanded={expanded}
          onToggle={() => setExpanded((v) => !v)}
          hasNew={data.total > 0}
        />
      </div>
      {expanded && (
        <div className="border-t border-card-border/60 px-4 pb-4">
          {data.total === 0 ? (
            <p className="text-xs text-muted-foreground pt-3">
              No new concepts since your last visit. Check back soon.
            </p>
          ) : (
            <div className="pt-3 space-y-2">
              {data.items.map((concept) => (
                <Link key={concept.id} href={`/discovery/concept/${concept.id}`}>
                  <div
                    className="rounded-md border border-card-border/60 bg-background/50 p-3 hover:border-amber-500/30 cursor-pointer transition-colors"
                    data-testid={`alert-concept-${concept.id}`}
                  >
                    <p className="text-xs font-medium text-foreground truncate">{concept.title}</p>
                    {concept.oneLiner && (
                      <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2 leading-relaxed">{concept.oneLiner}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1.5">
                      {concept.therapeuticArea && (
                        <span className="text-[10px] text-amber-500">{concept.therapeuticArea}</span>
                      )}
                      {concept.submitterAffiliation && (
                        <span className="text-[10px] text-muted-foreground truncate">{concept.submitterAffiliation}</span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
              {data.total > data.items.length && (
                <Link href="/industry/concepts">
                  <p className="text-xs text-primary hover:underline cursor-pointer">
                    +{data.total - data.items.length} more — view all concepts
                  </p>
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ProjectsSection({ data }: { data: IndustryDeltaResponse["newProjects"] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-card-border bg-card overflow-hidden">
      <div className="p-4">
        <SectionHeader
          icon={FlaskConical}
          label="Research Projects"
          count={data.total}
          color="bg-violet-500/10 text-violet-500"
          expanded={expanded}
          onToggle={() => setExpanded((v) => !v)}
          hasNew={data.total > 0}
        />
      </div>
      {expanded && (
        <div className="border-t border-card-border/60 px-4 pb-4">
          {data.total === 0 ? (
            <p className="text-xs text-muted-foreground pt-3">
              No new research projects since your last visit. Check back soon.
            </p>
          ) : (
            <div className="pt-3 space-y-2">
              {data.items.map((proj) => (
                <Link key={proj.id} href="/industry/projects">
                  <div
                    className="rounded-md border border-card-border/60 bg-background/50 p-3 hover:border-violet-500/30 cursor-pointer transition-colors"
                    data-testid={`alert-project-${proj.id}`}
                  >
                    <p className="text-xs font-medium text-foreground truncate">
                      {proj.discoveryTitle || proj.title}
                    </p>
                    {(proj.discoverySummary || proj.description) && (
                      <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                        {proj.discoverySummary || proj.description}
                      </p>
                    )}
                    <div className="flex items-center justify-between mt-1.5 gap-2">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        {proj.researchArea && (
                          <span className="text-[10px] text-violet-500">{proj.researchArea}</span>
                        )}
                        {(proj.projectContributors ?? [])[0]?.institution && (
                          <span className="text-[10px] text-muted-foreground truncate">
                            {(proj.projectContributors ?? [])[0].institution}
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground/60 capitalize">{proj.status}</span>
                      </div>
                      {proj.projectUrl && (
                        <a
                          href={proj.projectUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-[10px] text-primary hover:underline shrink-0"
                          data-testid={`alert-project-source-${proj.id}`}
                        >
                          Source
                        </a>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
              {data.total > data.items.length && (
                <Link href="/industry/projects">
                  <p className="text-xs text-primary hover:underline cursor-pointer">
                    +{data.total - data.items.length} more — view all projects
                  </p>
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const MODALITY_OPTIONS = [
  "Small Molecule", "Antibody", "CAR-T", "Gene Therapy",
  "mRNA Therapy", "Peptide", "Bispecific Antibody", "ADC", "PROTAC",
];
const STAGE_OPTIONS = ["Discovery", "Preclinical", "Phase 1", "Phase 2", "Phase 3"];

function MultiSelectCombobox({
  options,
  selected,
  onToggle,
  placeholder,
  searchPlaceholder,
  testId,
}: {
  options: string[];
  selected: string[];
  onToggle: (val: string) => void;
  placeholder: string;
  searchPlaceholder: string;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = options.filter((o) =>
    o.toLowerCase().includes(search.toLowerCase())
  );

  const label = selected.length === 0
    ? placeholder
    : selected.length === 1
      ? selected[0]
      : `${selected.length} selected`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm text-left hover:bg-accent/20 transition-colors"
          data-testid={testId}
        >
          <span className={selected.length === 0 ? "text-muted-foreground" : "text-foreground truncate"}>
            {label}
          </span>
          <ChevronsUpDown className="w-3.5 h-3.5 text-muted-foreground shrink-0 ml-2" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput
            placeholder={searchPlaceholder}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>No options found.</CommandEmpty>
            <CommandGroup>
              {filtered.map((opt) => (
                <CommandItem
                  key={opt}
                  onSelect={() => onToggle(opt)}
                  className="flex items-center gap-2"
                >
                  <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${selected.includes(opt) ? "bg-primary border-primary" : "border-muted-foreground/30"}`}>
                    {selected.includes(opt) && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                  </div>
                  {opt}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function InstitutionCombobox({
  selected,
  onToggle,
}: {
  selected: string[];
  onToggle: (val: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: allInstitutions = [] } = useQuery<string[]>({
    queryKey: ["/api/ingest/institutions/names"],
    staleTime: 10 * 60 * 1000,
  });

  const filtered = allInstitutions.filter((inst) =>
    inst.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 100);

  const label = selected.length === 0
    ? "All institutions"
    : selected.length === 1
      ? selected[0]
      : `${selected.length} selected`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm text-left hover:bg-accent/20 transition-colors"
          data-testid="select-alert-institutions"
        >
          <span className={selected.length === 0 ? "text-muted-foreground" : "text-foreground truncate"}>
            {label}
          </span>
          <ChevronsUpDown className="w-3.5 h-3.5 text-muted-foreground shrink-0 ml-2" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          <CommandInput
            placeholder="Type to search institutions..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList className="max-h-60">
            <CommandEmpty>No institutions found.</CommandEmpty>
            <CommandGroup>
              {filtered.map((inst) => (
                <CommandItem
                  key={inst}
                  onSelect={() => onToggle(inst)}
                  className="flex items-center gap-2"
                >
                  <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${selected.includes(inst) ? "bg-primary border-primary" : "border-muted-foreground/30"}`}>
                    {selected.includes(inst) && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                  </div>
                  <span className="truncate text-sm">{inst}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function CreateAlertSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [modalities, setModalities] = useState<string[]>([]);
  const [stages, setStages] = useState<string[]>([]);
  const [institutions, setInstitutions] = useState<string[]>([]);

  function toggleItem(arr: string[], setArr: (v: string[]) => void, val: string) {
    setArr(arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val]);
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/alerts", {
        query: query.trim() || null,
        modalities: modalities.map((m) => m.toLowerCase().replace(/\s+/g, "-")),
        stages: stages.map((s) => s.toLowerCase().replace(/\s+/g, "-")),
        institutions,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
      toast({ title: "Alert saved", description: "You'll see it in My Alerts." });
      setQuery("");
      setModalities([]);
      setStages([]);
      setInstitutions([]);
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Error saving alert", description: err.message, variant: "destructive" });
    },
  });

  function handleSave() {
    if (!query.trim() && modalities.length === 0 && stages.length === 0 && institutions.length === 0) {
      toast({ title: "Set at least one filter", variant: "destructive" });
      return;
    }
    saveMutation.mutate();
  }

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Create Alert</SheetTitle>
          <SheetDescription>
            Set up a saved search that notifies you when new matching assets are found.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="alert-query">Query</Label>
            <Input
              id="alert-query"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. CAR-T solid tumor preclinical"
              data-testid="input-alert-query"
            />
          </div>

          <div className="space-y-2">
            <Label>Modality</Label>
            <MultiSelectCombobox
              options={MODALITY_OPTIONS}
              selected={modalities}
              onToggle={(v) => toggleItem(modalities, setModalities, v)}
              placeholder="Any modality"
              searchPlaceholder="Search modalities..."
              testId="select-alert-modality"
            />
            {modalities.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {modalities.map((m) => (
                  <span key={m} className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 flex items-center gap-1">
                    {m}
                    <button onClick={() => toggleItem(modalities, setModalities, m)} className="hover:text-destructive">×</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Stage</Label>
            <MultiSelectCombobox
              options={STAGE_OPTIONS}
              selected={stages}
              onToggle={(v) => toggleItem(stages, setStages, v)}
              placeholder="Any stage"
              searchPlaceholder="Search stages..."
              testId="select-alert-stage"
            />
            {stages.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {stages.map((s) => (
                  <span key={s} className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-500 border border-violet-500/20 flex items-center gap-1">
                    {s}
                    <button onClick={() => toggleItem(stages, setStages, s)} className="hover:text-destructive">×</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Institutions</Label>
            <InstitutionCombobox
              selected={institutions}
              onToggle={(v) => toggleItem(institutions, setInstitutions, v)}
            />
            {institutions.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {institutions.map((inst) => (
                  <span key={inst} className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20 flex items-center gap-1 max-w-[150px]">
                    <span className="truncate">{inst}</span>
                    <button onClick={() => toggleItem(institutions, setInstitutions, inst)} className="hover:text-destructive shrink-0">×</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="pt-4 flex gap-3">
            <Button
              className="flex-1"
              onClick={handleSave}
              disabled={saveMutation.isPending}
              data-testid="button-save-alert"
            >
              {saveMutation.isPending ? "Saving..." : "Save Alert"}
            </Button>
            <Button
              variant="outline"
              onClick={onClose}
              data-testid="button-cancel-alert"
            >
              Cancel
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function Alerts() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const hasWrittenSeen = useRef(false);

  const sinceParam = typeof window !== "undefined"
    ? (localStorage.getItem(STORAGE_KEY) ?? "")
    : "";

  const deltaUrl = sinceParam
    ? `/api/industry/alerts/delta?since=${encodeURIComponent(sinceParam)}`
    : "/api/industry/alerts/delta";

  const { data, isLoading } = useQuery<IndustryDeltaResponse>({
    queryKey: [deltaUrl],
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (data && !hasWrittenSeen.current) {
      hasWrittenSeen.current = true;
      localStorage.setItem(STORAGE_KEY, new Date().toISOString());
    }
  }, [data]);

  const totalNew =
    (data?.newAssets.total ?? 0) +
    (data?.newConcepts.total ?? 0) +
    (data?.newProjects.total ?? 0);

  const sinceLabel = formatRelative(data?.since ?? (sinceParam || undefined));

  return (
    <div className="min-h-full bg-background">
      <div className="border-b border-border bg-card/30">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-foreground">Alerts</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                New discoveries across TTO assets, concepts, and research projects since your last visit.
              </p>
            </div>
            <Button
              className="gap-2 shrink-0"
              onClick={() => setSheetOpen(true)}
              data-testid="button-create-alert"
            >
              <Plus className="w-4 h-4" />
              Create Alert
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-8">
        {isLoading ? (
          <div className="space-y-3 max-w-2xl">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : !data ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Bell className="w-10 h-10 text-muted-foreground/30" />
            <p className="text-sm font-medium text-muted-foreground">Could not load alerts</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            <div className="lg:col-span-2 space-y-4">
              <MyAlertsSection onCreateAlert={() => setSheetOpen(true)} />
              <TtoAssetsSection data={data.newAssets} since={data.since} />
              <ConceptsSection data={data.newConcepts} />
              <ProjectsSection data={data.newProjects} />
            </div>

            <div className="lg:col-span-1">
              <div className="rounded-lg border border-card-border bg-card p-5 space-y-3 sticky top-6">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="w-4 h-4" />
                  <span className="text-xs font-medium">Since last visit</span>
                </div>
                <p className="text-[10px] text-muted-foreground/70 -mt-1">
                  Showing activity from {sinceLabel}
                </p>
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">TTO Assets</span>
                    <span className="font-semibold text-foreground tabular-nums">
                      +{data.newAssets.total}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Concepts</span>
                    <span className="font-semibold text-foreground tabular-nums">
                      +{data.newConcepts.total}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Research Projects</span>
                    <span className="font-semibold text-foreground tabular-nums">
                      +{data.newProjects.total}
                    </span>
                  </div>
                </div>
                <div className="border-t border-border/60 pt-3 flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Total
                  </span>
                  <span className="text-xl font-bold text-primary tabular-nums">
                    +{totalNew}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <CreateAlertSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
      />
    </div>
  );
}
