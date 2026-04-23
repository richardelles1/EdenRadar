import { useState, useEffect } from "react";
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
  Lightbulb,
  FlaskConical,
  Package,
  Clock,
  Trash2,
  Check,
  ChevronsUpDown,
  Pencil,
  Loader2,
  ExternalLink,
  ArrowRight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient, getAuthHeaders } from "@/lib/queryClient";
import type { UserAlert } from "@shared/schema";

const STORAGE_KEY = "edenLastSeenAlerts";

function defaultSince(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString();
}

function formatSinceLabel(dateStr: string | null | undefined): string {
  if (!dateStr) return "the last 7 days";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

interface DeltaInstitution {
  institution: string;
  count: number;
  matchedCount: number;
  matchedBy: string | null;
  sampleAssets: Array<{ id: number; name: string }>;
  matchedSampleAssets: Array<{ id: number; name: string }>;
}

interface IndustryDeltaResponse {
  newAssets: {
    total: number;
    hasAlerts: boolean;
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

interface AlertDeltaBucket {
  alertId: number;
  alertName: string;
  matchCount: number;
  samples: Array<{ id: number; assetName: string; institution: string; modality: string; developmentStage: string }>;
}

interface AlertsDeltaResponse {
  byAlert: AlertDeltaBucket[];
  total: number;
  since: string;
}

interface PreviewResponse {
  count: number | string;
  samples: Array<{ id: number; assetName: string; institution: string; modality: string; developmentStage: string }>;
}

function normalizeModality(m: string): string {
  return m.toLowerCase();
}

function normalizeStage(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ");
}

function toDisplayModality(s: string): string {
  return s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function toDisplayStage(s: string): string {
  return s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function AssetRow({ id, name, institution, modality, stage, index }: {
  id: number; name: string; institution?: string; modality?: string; stage?: string; index: number;
}) {
  return (
    <Link href={`/asset/${id}`}>
      <div
        className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted/60 transition-colors cursor-pointer group border border-transparent hover:border-border"
        data-testid={`asset-row-${index}`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-foreground truncate">{name}</p>
          {(institution || modality || stage) && (
            <p className="text-[10px] text-muted-foreground truncate">
              {[institution, modality, stage].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        <ArrowRight className="w-3 h-3 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0 transition-colors" />
      </div>
    </Link>
  );
}

function AlertCard({ alert, onDelete, onEdit, isPending, matchCount = 0 }: {
  alert: UserAlert; onDelete: (id: number) => void; onEdit: (a: UserAlert) => void; isPending: boolean; matchCount?: number;
}) {
  const parts = [alert.query, ...(alert.modalities ?? []).map(toDisplayModality), ...(alert.stages ?? []).map(toDisplayStage)].filter(Boolean);
  const draft = parts.join(" ");

  return (
    <div
      className="flex items-start gap-3 rounded-md border border-border bg-card px-3 py-2.5 hover:border-primary/30 transition-colors"
      data-testid={`alert-card-${alert.id}`}
    >
      <Bell className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <p className="text-xs font-semibold text-foreground truncate" data-testid={`alert-title-${alert.id}`}>
            {alert.query || "All new assets"}
          </p>
          {matchCount > 0 && (
            <Badge
              variant="secondary"
              className="shrink-0 text-[10px] tabular-nums px-1.5 py-0 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
              data-testid={`alert-match-count-${alert.id}`}
            >
              +{matchCount} new
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {(alert.modalities ?? []).map((m) => (
            <span key={m} className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 capitalize">{toDisplayModality(m)}</span>
          ))}
          {(alert.stages ?? []).map((s) => (
            <span key={s} className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-500 border border-violet-500/20 capitalize">{toDisplayStage(s)}</span>
          ))}
          {(alert.institutions ?? []).map((inst) => (
            <span key={inst} className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 truncate max-w-[120px]">{inst}</span>
          ))}
        </div>
        {draft && (
          <Link href={`/scout?draft=${encodeURIComponent(draft)}`}>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer" data-testid={`alert-explore-${alert.id}`}>
              Explore matches →
            </span>
          </Link>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => onEdit(alert)}
          className="text-muted-foreground hover:text-primary transition-colors w-6 h-6 flex items-center justify-center rounded hover:bg-primary/10"
          data-testid={`button-edit-alert-${alert.id}`}
          disabled={isPending}
        >
          <Pencil className="w-3 h-3" />
        </button>
        <button
          onClick={() => onDelete(alert.id)}
          className="text-muted-foreground hover:text-destructive transition-colors w-6 h-6 flex items-center justify-center rounded hover:bg-destructive/10"
          data-testid={`button-delete-alert-${alert.id}`}
          disabled={isPending}
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

function MyAlertsSection({ onCreateAlert, matchCounts = {} }: { onCreateAlert: () => void; matchCounts?: Record<number, number> }) {
  const [editingAlert, setEditingAlert] = useState<UserAlert | null>(null);
  const { data: alerts = [], isLoading } = useQuery<UserAlert[]>({ queryKey: ["/api/alerts"] });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/alerts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/alerts/delta"] });
    },
  });

  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Bell className="w-4 h-4 text-emerald-500" />
            My Saved Alerts
            {alerts.length > 0 && (
              <Badge variant="secondary" className="text-[11px] tabular-nums">{alerts.length}</Badge>
            )}
          </h2>
          <button
            onClick={onCreateAlert}
            className="text-xs text-primary hover:underline flex items-center gap-1"
            data-testid="button-create-alert-inline"
          >
            <Plus className="w-3 h-3" /> Add alert
          </button>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => <Skeleton key={i} className="h-14 w-full rounded-md" />)}
          </div>
        ) : alerts.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-muted/20 px-4 py-5 text-center space-y-2" data-testid="alerts-empty-state">
            <p className="text-xs text-muted-foreground">No saved alerts yet. Create one to personalise your TTO asset feed.</p>
            <button
              onClick={onCreateAlert}
              className="text-xs text-primary hover:underline"
              data-testid="button-create-first-alert"
            >
              + Create your first alert
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {alerts.map((alert) => (
              <AlertCard
                key={alert.id}
                alert={alert}
                onDelete={(id) => deleteMutation.mutate(id)}
                onEdit={(a) => setEditingAlert(a)}
                isPending={deleteMutation.isPending}
                matchCount={matchCounts[alert.id] ?? 0}
              />
            ))}
          </div>
        )}
      </div>

      {editingAlert && (
        <EditAlertSheet alert={editingAlert} onClose={() => setEditingAlert(null)} />
      )}
    </>
  );
}

function AlertBucketRows({ bucket }: { bucket: AlertDeltaBucket }) {
  return (
    <div className="space-y-0.5" data-testid={`alert-bucket-${bucket.alertId}`}>
      <div className="flex items-center gap-2 px-1 pb-1">
        <Bell className="w-3 h-3 text-emerald-500 shrink-0" />
        <span className="text-[11px] font-semibold text-foreground truncate">{bucket.alertName}</span>
        <Badge variant="secondary" className="text-[10px] tabular-nums shrink-0 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
          +{bucket.matchCount}
        </Badge>
      </div>
      {bucket.samples.map((asset, j) => (
        <AssetRow
          key={asset.id}
          id={asset.id}
          name={asset.assetName}
          institution={asset.institution}
          modality={asset.modality}
          stage={asset.developmentStage}
          index={j}
        />
      ))}
      {bucket.matchCount > bucket.samples.length && (
        <p className="text-[10px] text-muted-foreground px-3 pt-0.5">
          +{bucket.matchCount - bucket.samples.length} more in this alert
        </p>
      )}
    </div>
  );
}

const FLAT_LIST_MAX = 30;

function NewTtoAssetsSection({
  industryData,
  alertsDelta,
  alertsDeltaLoading,
  hasAlerts,
  onCreateAlert,
}: {
  industryData: IndustryDeltaResponse["newAssets"] | undefined;
  alertsDelta: AlertsDeltaResponse | undefined;
  alertsDeltaLoading: boolean;
  hasAlerts: boolean;
  onCreateAlert: () => void;
}) {
  const hasMatchedAlerts = !!(alertsDelta && alertsDelta.byAlert.length > 0);
  const totalUnfiltered = industryData?.total ?? 0;

  const flatAssets: Array<{ id: number; name: string; institution: string }> =
    (industryData?.byInstitution ?? []).flatMap((inst) =>
      inst.sampleAssets.map((a) => ({ id: a.id, name: a.name, institution: inst.institution }))
    );
  const flatVisible = flatAssets.slice(0, FLAT_LIST_MAX);
  const flatHidden = flatAssets.length - flatVisible.length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Package className="w-4 h-4 text-emerald-500" />
          New TTO Assets
          {hasMatchedAlerts && (
            <Badge variant="secondary" className="text-[11px] tabular-nums bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              +{alertsDelta!.total}
            </Badge>
          )}
          {!hasMatchedAlerts && totalUnfiltered > 0 && (
            <Badge variant="secondary" className="text-[11px] tabular-nums">+{totalUnfiltered}</Badge>
          )}
        </h2>
      </div>

      {!hasAlerts && (
        <div className="rounded-md border border-dashed border-primary/30 bg-primary/5 px-4 py-3 flex items-start gap-3" data-testid="alerts-setup-prompt">
          <Bell className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-foreground">Set up an alert to personalise this feed</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">All new assets are shown below — create a saved alert to filter by modality, stage, or institution.</p>
            <button onClick={onCreateAlert} className="text-xs text-primary hover:underline mt-1" data-testid="button-create-alert-from-tto">
              + Create an alert →
            </button>
          </div>
        </div>
      )}

      {alertsDeltaLoading ? (
        <div className="space-y-1">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full rounded-md" />)}
        </div>
      ) : hasMatchedAlerts ? (
        <div className="space-y-4" data-testid="alert-matched-buckets">
          {alertsDelta!.byAlert.map((bucket) => (
            <AlertBucketRows key={bucket.alertId} bucket={bucket} />
          ))}
          {!hasAlerts && flatVisible.length > 0 && (
            <div className="space-y-0.5 pt-2 border-t border-border/40">
              <p className="text-[10px] text-muted-foreground/70 px-1 pb-1">All new assets</p>
              {flatVisible.map((asset, i) => (
                <AssetRow key={asset.id} id={asset.id} name={asset.name} institution={asset.institution} index={i} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          {hasAlerts && (
            <p className="text-xs text-muted-foreground py-1 px-1" data-testid="no-alert-matches">
              No new assets match your saved alert criteria. All new assets are shown below.
            </p>
          )}
          {flatVisible.length > 0 ? (
            <div className="space-y-0.5" data-testid="flat-asset-list">
              {flatVisible.map((asset, i) => (
                <AssetRow key={asset.id} id={asset.id} name={asset.name} institution={asset.institution} index={i} />
              ))}
              {flatHidden > 0 && (
                <p className="text-[10px] text-muted-foreground px-3 pt-1">
                  +{flatHidden} more · <Link href="/scout" className="text-primary hover:underline">search in Scout</Link>
                </p>
              )}
              {totalUnfiltered > flatAssets.length && (
                <p className="text-[10px] text-muted-foreground px-3">
                  {totalUnfiltered - flatAssets.length} additional assets not sampled · <Link href="/scout" className="text-primary hover:underline">search in Scout</Link>
                </p>
              )}
            </div>
          ) : !alertsDeltaLoading && (
            <p className="text-xs text-muted-foreground py-3 px-1" data-testid="no-new-assets">
              No new TTO assets since your last visit. Check back soon.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function OtherActivitySection({
  concepts,
  projects,
}: {
  concepts: IndustryDeltaResponse["newConcepts"];
  projects: IndustryDeltaResponse["newProjects"];
}) {
  const [expanded, setExpanded] = useState(false);
  const totalActivity = concepts.total + projects.total;

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <button
        className="w-full flex items-center gap-3 text-left px-4 py-3 hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded((v) => !v)}
        data-testid="other-activity-toggle"
      >
        <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center shrink-0">
          <Lightbulb className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold text-foreground">Other Activity</span>
          <p className="text-[10px] text-muted-foreground/70">Platform-wide concepts &amp; research projects</p>
        </div>
        <Badge variant="secondary" className="shrink-0 text-[11px] tabular-nums">
          {totalActivity} new
        </Badge>
        {expanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
      </button>

      {expanded && (
        <div className="border-t border-border px-4 py-4 space-y-5">
          {concepts.total > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-xs font-semibold text-foreground">New Concepts</span>
                <Badge variant="secondary" className="text-[11px] tabular-nums">{concepts.total}</Badge>
              </div>
              <div className="space-y-0.5">
                {concepts.items.map((concept) => (
                  <Link href={`/discovery/concept/${concept.id}`} key={concept.id}>
                    <div
                      className="flex items-start gap-2 px-2 py-2 rounded-md hover:bg-muted/50 transition-colors cursor-pointer"
                      data-testid={`alert-concept-${concept.id}`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0 mt-1" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{concept.title}</p>
                        {concept.oneLiner && (
                          <p className="text-[10px] text-muted-foreground truncate">{concept.oneLiner}</p>
                        )}
                        {(concept.therapeuticArea || concept.submitterAffiliation) && (
                          <p className="text-[10px] text-muted-foreground/70 truncate">
                            {[concept.therapeuticArea, concept.submitterAffiliation].filter(Boolean).join(" · ")}
                          </p>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
              {concepts.total > concepts.items.length && (
                <Link href="/industry/concepts">
                  <p className="text-xs text-primary hover:underline cursor-pointer px-2">
                    +{concepts.total - concepts.items.length} more — view all concepts
                  </p>
                </Link>
              )}
            </div>
          )}

          {concepts.total === 0 && (
            <p className="text-xs text-muted-foreground">No new concepts since your last visit.</p>
          )}

          {projects.total > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <FlaskConical className="w-3.5 h-3.5 text-violet-500" />
                <span className="text-xs font-semibold text-foreground">Research Projects</span>
                <Badge variant="secondary" className="text-[11px] tabular-nums">{projects.total}</Badge>
              </div>
              <div className="space-y-0.5">
                {projects.items.map((proj) => (
                  <Link href="/industry/projects" key={proj.id}>
                    <div
                      className="flex items-start gap-2 px-2 py-2 rounded-md hover:bg-muted/50 transition-colors cursor-pointer"
                      data-testid={`alert-project-${proj.id}`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0 mt-1" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{proj.discoveryTitle || proj.title}</p>
                        {(proj.discoverySummary || proj.description) && (
                          <p className="text-[10px] text-muted-foreground line-clamp-1">
                            {proj.discoverySummary || proj.description}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-0.5">
                          {proj.researchArea && (
                            <span className="text-[10px] text-violet-500">{proj.researchArea}</span>
                          )}
                          {(proj.projectContributors ?? [])[0]?.institution && (
                            <span className="text-[10px] text-muted-foreground truncate">
                              {(proj.projectContributors ?? [])[0].institution}
                            </span>
                          )}
                          {proj.projectUrl && (
                            <a
                              href={proj.projectUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-[10px] text-violet-500 hover:underline flex items-center gap-0.5"
                              data-testid={`alert-project-source-${proj.id}`}
                            >
                              <ExternalLink className="w-2.5 h-2.5" /> Source
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
              {projects.total > projects.items.length && (
                <Link href="/industry/projects">
                  <p className="text-xs text-primary hover:underline cursor-pointer px-2">
                    +{projects.total - projects.items.length} more — view all projects
                  </p>
                </Link>
              )}
            </div>
          )}

          {projects.total === 0 && (
            <p className="text-xs text-muted-foreground">No new research projects since your last visit.</p>
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
  const filtered = options.filter((o) => o.toLowerCase().includes(search.toLowerCase()));
  const label = selected.length === 0 ? placeholder : selected.length === 1 ? selected[0] : `${selected.length} selected`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm text-left hover:bg-accent/20 transition-colors"
          data-testid={testId}
        >
          <span className={selected.length === 0 ? "text-muted-foreground" : "text-foreground truncate"}>{label}</span>
          <ChevronsUpDown className="w-3.5 h-3.5 text-muted-foreground shrink-0 ml-2" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>No options found.</CommandEmpty>
            <CommandGroup>
              {filtered.map((opt) => (
                <CommandItem key={opt} onSelect={() => onToggle(opt)} className="flex items-center gap-2">
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

function InstitutionCombobox({ selected, onToggle }: { selected: string[]; onToggle: (val: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data: allInstitutions = [] } = useQuery<string[]>({
    queryKey: ["/api/ingest/institutions/names"],
    staleTime: 10 * 60 * 1000,
  });
  const filtered = allInstitutions.filter((inst) => inst.toLowerCase().includes(search.toLowerCase())).slice(0, 100);
  const label = selected.length === 0 ? "All institutions" : selected.length === 1 ? selected[0] : `${selected.length} selected`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm text-left hover:bg-accent/20 transition-colors"
          data-testid="select-alert-institutions"
        >
          <span className={selected.length === 0 ? "text-muted-foreground" : "text-foreground truncate"}>{label}</span>
          <ChevronsUpDown className="w-3.5 h-3.5 text-muted-foreground shrink-0 ml-2" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Type to search institutions..." value={search} onValueChange={setSearch} />
          <CommandList className="max-h-60">
            <CommandEmpty>No institutions found.</CommandEmpty>
            <CommandGroup>
              {filtered.map((inst) => (
                <CommandItem key={inst} onSelect={() => onToggle(inst)} className="flex items-center gap-2">
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

function AlertPreviewSection({ query, modalities, stages, institutions }: {
  query: string; modalities: string[]; stages: string[]; institutions: string[];
}) {
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const hasAnyFilter = !!(query.trim()) || modalities.length > 0 || stages.length > 0 || institutions.length > 0;

  useEffect(() => {
    if (!hasAnyFilter) { setPreview(null); return; }
    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const res = await apiRequest("POST", "/api/alerts/preview", {
          query: query.trim() || null,
          modalities: modalities.map(normalizeModality),
          stages: stages.map(normalizeStage),
          institutions,
        });
        const data = await res.json();
        setPreview(data);
      } catch { setPreview(null); }
      finally { setIsLoading(false); }
    }, 500);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, modalities.join(","), stages.join(","), institutions.join(","), hasAnyFilter]);

  if (!hasAnyFilter) return null;

  return (
    <div className="rounded-md border border-card-border bg-muted/30 p-3 space-y-1.5" data-testid="alert-preview">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold text-foreground">Preview matches</span>
        {isLoading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
        {!isLoading && preview && (
          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium" data-testid="preview-count">
            ~{preview.count} existing asset{preview.count === 1 ? "" : "s"}
          </span>
        )}
      </div>
      {!isLoading && preview && preview.samples.length > 0 && (
        <div className="space-y-1">
          {preview.samples.map((s) => (
            <div key={s.id} className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
              <span className="text-[11px] text-muted-foreground truncate">{s.assetName}</span>
              <span className="text-[10px] text-muted-foreground/60 shrink-0">— {s.institution}</span>
            </div>
          ))}
        </div>
      )}
      {!isLoading && preview && preview.count === 0 && (
        <p className="text-[11px] text-muted-foreground">No existing assets match these criteria yet.</p>
      )}
    </div>
  );
}

function AlertFormFields({
  query, setQuery,
  modalities, stages, institutions,
  toggleModality, toggleStage, toggleInstitution,
  idPrefix,
}: {
  query: string; setQuery: (v: string) => void;
  modalities: string[]; stages: string[]; institutions: string[];
  toggleModality: (v: string) => void; toggleStage: (v: string) => void; toggleInstitution: (v: string) => void;
  idPrefix: string;
}) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-query`}>Query</Label>
        <Input
          id={`${idPrefix}-query`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. CAR-T solid tumor preclinical"
          data-testid={`input-${idPrefix}-query`}
        />
      </div>
      <div className="space-y-2">
        <Label>Modality</Label>
        <MultiSelectCombobox options={MODALITY_OPTIONS} selected={modalities} onToggle={toggleModality} placeholder="Any modality" searchPlaceholder="Search modalities..." testId={`select-${idPrefix}-modality`} />
        {modalities.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {modalities.map((m) => (
              <span key={m} className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 flex items-center gap-1">
                {m}<button onClick={() => toggleModality(m)} className="hover:text-destructive">×</button>
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="space-y-2">
        <Label>Stage</Label>
        <MultiSelectCombobox options={STAGE_OPTIONS} selected={stages} onToggle={toggleStage} placeholder="Any stage" searchPlaceholder="Search stages..." testId={`select-${idPrefix}-stage`} />
        {stages.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {stages.map((s) => (
              <span key={s} className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-500 border border-violet-500/20 flex items-center gap-1">
                {s}<button onClick={() => toggleStage(s)} className="hover:text-destructive">×</button>
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="space-y-2">
        <Label>Institutions</Label>
        <InstitutionCombobox selected={institutions} onToggle={toggleInstitution} />
        {institutions.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {institutions.map((inst) => (
              <span key={inst} className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20 flex items-center gap-1 max-w-[150px]">
                <span className="truncate">{inst}</span>
                <button onClick={() => toggleInstitution(inst)} className="hover:text-destructive shrink-0">×</button>
              </span>
            ))}
          </div>
        )}
      </div>
      <AlertPreviewSection query={query} modalities={modalities} stages={stages} institutions={institutions} />
    </>
  );
}

function EditAlertSheet({ alert, onClose }: { alert: UserAlert; onClose: () => void }) {
  const { toast } = useToast();
  const [query, setQuery] = useState(alert.query ?? "");
  const [modalities, setModalities] = useState<string[]>((alert.modalities ?? []).map(toDisplayModality));
  const [stages, setStages] = useState<string[]>((alert.stages ?? []).map(toDisplayStage));
  const [institutions, setInstitutions] = useState<string[]>(alert.institutions ?? []);

  function toggle<T>(arr: T[], setArr: (v: T[]) => void, val: T) {
    setArr(arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val]);
  }

  const editMutation = useMutation({
    mutationFn: () =>
      apiRequest("PUT", `/api/alerts/${alert.id}`, {
        query: query.trim() || null,
        modalities: modalities.map(normalizeModality),
        stages: stages.map(normalizeStage),
        institutions,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/alerts/delta"] });
      toast({ title: "Alert updated" });
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Error updating alert", description: err.message, variant: "destructive" });
    },
  });

  function handleSave() {
    if (!query.trim() && modalities.length === 0 && stages.length === 0 && institutions.length === 0) {
      toast({ title: "Set at least one filter", variant: "destructive" });
      return;
    }
    editMutation.mutate();
  }

  return (
    <Sheet open onOpenChange={onClose}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Edit Alert</SheetTitle>
          <SheetDescription>Update your saved alert criteria.</SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-5">
          <AlertFormFields
            query={query} setQuery={setQuery}
            modalities={modalities} stages={stages} institutions={institutions}
            toggleModality={(v) => toggle(modalities, setModalities, v)}
            toggleStage={(v) => toggle(stages, setStages, v)}
            toggleInstitution={(v) => toggle(institutions, setInstitutions, v)}
            idPrefix="edit-alert"
          />
          <div className="pt-2 flex gap-3">
            <Button className="flex-1" onClick={handleSave} disabled={editMutation.isPending} data-testid="button-update-alert">
              {editMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
            <Button variant="outline" onClick={onClose} data-testid="button-cancel-edit-alert">Cancel</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function CreateAlertSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [modalities, setModalities] = useState<string[]>([]);
  const [stages, setStages] = useState<string[]>([]);
  const [institutions, setInstitutions] = useState<string[]>([]);

  function toggle<T>(arr: T[], setArr: (v: T[]) => void, val: T) {
    setArr(arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val]);
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/alerts", {
        query: query.trim() || null,
        modalities: modalities.map(normalizeModality),
        stages: stages.map(normalizeStage),
        institutions,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/alerts/delta"] });
      toast({ title: "Alert saved", description: "You'll see it in My Saved Alerts." });
      setQuery(""); setModalities([]); setStages([]); setInstitutions([]);
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
          <SheetDescription>Set up a saved search that notifies you when new matching assets are found.</SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-5">
          <AlertFormFields
            query={query} setQuery={setQuery}
            modalities={modalities} stages={stages} institutions={institutions}
            toggleModality={(v) => toggle(modalities, setModalities, v)}
            toggleStage={(v) => toggle(stages, setStages, v)}
            toggleInstitution={(v) => toggle(institutions, setInstitutions, v)}
            idPrefix="alert"
          />
          <div className="pt-2 flex gap-3">
            <Button className="flex-1" onClick={handleSave} disabled={saveMutation.isPending} data-testid="button-save-alert">
              {saveMutation.isPending ? "Saving..." : "Save Alert"}
            </Button>
            <Button variant="outline" onClick={onClose} data-testid="button-cancel-alert">Cancel</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function Alerts() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sinceParam, setSinceParam] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(STORAGE_KEY) ?? defaultSince();
    }
    return defaultSince();
  });

  const { data: alerts = [] } = useQuery<UserAlert[]>({ queryKey: ["/api/alerts"] });

  useEffect(() => {
    apiRequest("POST", "/api/alerts/mark-read").then(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/alerts/unread-count"] });
    }).catch(() => {});
  }, []);

  const deltaUrl = `/api/industry/alerts/delta?since=${encodeURIComponent(sinceParam)}`;
  const alertsDeltaUrl = `/api/alerts/delta?since=${encodeURIComponent(sinceParam)}`;

  const { data, isLoading } = useQuery<IndustryDeltaResponse>({
    queryKey: [deltaUrl],
    staleTime: 5 * 60 * 1000,
  });

  const { data: alertsDelta, isLoading: alertsDeltaLoading } = useQuery<AlertsDeltaResponse>({
    queryKey: ["/api/alerts/delta", sinceParam],
    queryFn: async () => {
      const authHeaders = await getAuthHeaders();
      const r = await fetch(alertsDeltaUrl, { credentials: "include", headers: authHeaders });
      if (!r.ok) return { byAlert: [], total: 0 } as AlertsDeltaResponse;
      const json = await r.json();
      // Guard: ensure shape is correct even if server returns unexpected payload
      if (!Array.isArray(json?.byAlert)) return { byAlert: [], total: 0 } as AlertsDeltaResponse;
      return json as AlertsDeltaResponse;
    },
    staleTime: 5 * 60 * 1000,
  });

  const hasAlerts = alerts.length > 0;
  const matchedTtoCount = alertsDelta?.total ?? 0;
  const alertMatchCounts: Record<number, number> = Object.fromEntries(
    (alertsDelta?.byAlert ?? []).map((b) => [b.alertId, b.matchCount])
  );
  const sidebarTtoCount = hasAlerts ? matchedTtoCount : (data?.newAssets.total ?? 0);
  const totalNew = sidebarTtoCount + (data?.newConcepts.total ?? 0) + (data?.newProjects.total ?? 0);

  const sinceLabel = formatSinceLabel(sinceParam);

  function handleMarkAllSeen() {
    const now = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, now);
    window.dispatchEvent(new CustomEvent("eden-alerts-seen"));
    setSinceParam(now);
  }

  return (
    <div className="min-h-full">
      <div className="border-b border-border bg-card/30">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-foreground">Alerts</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                New TTO assets, concepts, and research activity since {sinceLabel}.
              </p>
            </div>
            <Button className="gap-2 shrink-0" onClick={() => setSheetOpen(true)} data-testid="button-create-alert">
              <Plus className="w-4 h-4" />
              Create Alert
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-8">
        {isLoading && alertsDeltaLoading ? (
          <div className="space-y-3 max-w-2xl">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
          </div>
        ) : !data ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Bell className="w-10 h-10 text-muted-foreground/30" />
            <p className="text-sm font-medium text-muted-foreground">Could not load alerts</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            <div className="lg:col-span-2 space-y-6">
              <MyAlertsSection onCreateAlert={() => setSheetOpen(true)} matchCounts={alertMatchCounts} />

              <div className="border-t border-border/40" />

              <NewTtoAssetsSection
                industryData={data.newAssets}
                alertsDelta={alertsDelta}
                alertsDeltaLoading={alertsDeltaLoading}
                hasAlerts={hasAlerts}
                onCreateAlert={() => setSheetOpen(true)}
              />

              <OtherActivitySection
                concepts={data.newConcepts}
                projects={data.newProjects}
              />
            </div>

            <div className="lg:col-span-1">
              <div className="rounded-lg border border-border bg-card p-5 space-y-3 sticky top-6">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="w-4 h-4" />
                  <span className="text-xs font-medium">Since last visit</span>
                </div>
                <p className="text-[10px] text-muted-foreground/70 -mt-1" data-testid="text-since-label">
                  Showing activity since {sinceLabel}
                </p>
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">TTO Assets</span>
                    <span className="font-semibold text-foreground tabular-nums" data-testid="sidebar-tto-count">+{sidebarTtoCount}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Concepts</span>
                    <span className="font-semibold text-foreground tabular-nums" data-testid="sidebar-concepts-count">+{data.newConcepts.total}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Research Projects</span>
                    <span className="font-semibold text-foreground tabular-nums" data-testid="sidebar-projects-count">+{data.newProjects.total}</span>
                  </div>
                </div>
                <div className="border-t border-border/60 pt-3 flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Total</span>
                  <span className="text-xl font-bold text-primary tabular-nums" data-testid="sidebar-total-count">+{totalNew}</span>
                </div>
                {totalNew > 0 && (
                  <button
                    onClick={handleMarkAllSeen}
                    className="w-full text-[11px] text-muted-foreground hover:text-foreground border border-border rounded-md py-1.5 transition-colors flex items-center justify-center gap-1.5"
                    data-testid="button-mark-all-seen"
                  >
                    <Check className="w-3 h-3" />
                    Mark all as seen
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <CreateAlertSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </div>
  );
}
