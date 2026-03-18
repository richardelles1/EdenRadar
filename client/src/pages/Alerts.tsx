import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
} from "lucide-react";

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
    items: Array<{ id: number; title: string; therapeuticArea: string; submitterAffiliation?: string }>;
  };
  newProjects: {
    total: number;
    items: Array<{ id: number; title: string; discoveryTitle?: string; researchArea?: string; status: string }>;
  };
  windowHours: number;
}

function formatRelative(dateStr: string | null): string {
  if (!dateStr) return "";
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}

function SectionHeader({
  icon: Icon,
  label,
  count,
  color,
  expanded,
  onToggle,
}: {
  icon: React.ElementType;
  label: string;
  count: number;
  color: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      className="w-full flex items-center gap-3 text-left select-none"
      onClick={onToggle}
      data-testid={`alerts-section-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${color}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-sm font-semibold text-foreground">{label}</span>
      </div>
      <Badge
        variant="secondary"
        className="shrink-0 text-[11px] tabular-nums"
      >
        {count} new
      </Badge>
      {expanded ? (
        <ChevronUp className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      ) : (
        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      )}
    </button>
  );
}

function TtoAssetsSection({ data }: { data: IndustryDeltaResponse["newAssets"] }) {
  const [expanded, setExpanded] = useState(true);

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
        />
      </div>
      {expanded && (
        <div className="border-t border-card-border/60 px-4 pb-4">
          {data.total === 0 ? (
            <p className="text-xs text-muted-foreground pt-3">
              No new TTO assets in the last {48}h scan window.
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
            Search Scout for {inst.institution} assets →
          </Link>
        </div>
      )}
    </div>
  );
}

function ConceptsSection({ data }: { data: IndustryDeltaResponse["newConcepts"] }) {
  const [expanded, setExpanded] = useState(true);

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
        />
      </div>
      {expanded && (
        <div className="border-t border-card-border/60 px-4 pb-4">
          {data.total === 0 ? (
            <p className="text-xs text-muted-foreground pt-3">
              No new concepts published in the last 48h.
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
                    <div className="flex items-center gap-2 mt-1">
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
                    +{data.total - data.items.length} more — view all concepts →
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
  const [expanded, setExpanded] = useState(true);

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
        />
      </div>
      {expanded && (
        <div className="border-t border-card-border/60 px-4 pb-4">
          {data.total === 0 ? (
            <p className="text-xs text-muted-foreground pt-3">
              No new research projects published in the last 48h.
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
                    <div className="flex items-center gap-2 mt-1">
                      {proj.researchArea && (
                        <span className="text-[10px] text-violet-500">{proj.researchArea}</span>
                      )}
                      <span className="text-[10px] text-muted-foreground capitalize">{proj.status}</span>
                    </div>
                  </div>
                </Link>
              ))}
              {data.total > data.items.length && (
                <Link href="/industry/projects">
                  <p className="text-xs text-primary hover:underline cursor-pointer">
                    +{data.total - data.items.length} more — view all projects →
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

function CreateAlertSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Create Alert</SheetTitle>
          <SheetDescription>
            Set up a saved search that notifies you when new matching assets
            are found.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="alert-query">Query</Label>
            <Input
              id="alert-query"
              placeholder="e.g. CAR-T solid tumor preclinical"
              data-testid="input-alert-query"
            />
          </div>

          <div className="space-y-2">
            <Label>Modality</Label>
            <Select>
              <SelectTrigger data-testid="select-alert-modality">
                <SelectValue placeholder="Any modality" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any modality</SelectItem>
                <SelectItem value="small-molecule">Small Molecule</SelectItem>
                <SelectItem value="antibody">Antibody</SelectItem>
                <SelectItem value="car-t">CAR-T</SelectItem>
                <SelectItem value="gene-therapy">Gene Therapy</SelectItem>
                <SelectItem value="mrna">mRNA Therapy</SelectItem>
                <SelectItem value="peptide">Peptide</SelectItem>
                <SelectItem value="bispecific">Bispecific Antibody</SelectItem>
                <SelectItem value="adc">ADC</SelectItem>
                <SelectItem value="protac">PROTAC</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Stage</Label>
            <Select>
              <SelectTrigger data-testid="select-alert-stage">
                <SelectValue placeholder="Any stage" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any stage</SelectItem>
                <SelectItem value="discovery">Discovery</SelectItem>
                <SelectItem value="preclinical">Preclinical</SelectItem>
                <SelectItem value="phase-1">Phase 1</SelectItem>
                <SelectItem value="phase-2">Phase 2</SelectItem>
                <SelectItem value="phase-3">Phase 3</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Institutions</Label>
            <Select>
              <SelectTrigger data-testid="select-alert-institutions">
                <SelectValue placeholder="All institutions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All institutions</SelectItem>
                <SelectItem value="stanford">Stanford University</SelectItem>
                <SelectItem value="mit">MIT</SelectItem>
                <SelectItem value="harvard">Harvard University</SelectItem>
                <SelectItem value="jhu">Johns Hopkins University</SelectItem>
                <SelectItem value="ucsf">UCSF</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Frequency</Label>
            <Select>
              <SelectTrigger data-testid="select-alert-frequency">
                <SelectValue placeholder="Weekly digest" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly digest</SelectItem>
                <SelectItem value="instant">Instant</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="pt-4 flex gap-3">
            <Button
              className="flex-1"
              onClick={onClose}
              data-testid="button-save-alert"
            >
              Save Alert
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

  const { data, isLoading } = useQuery<IndustryDeltaResponse>({
    queryKey: ["/api/industry/alerts/delta"],
    staleTime: 5 * 60 * 1000,
  });

  const totalNew =
    (data?.newAssets.total ?? 0) +
    (data?.newConcepts.total ?? 0) +
    (data?.newProjects.total ?? 0);

  return (
    <div className="min-h-full bg-background">
      <div className="border-b border-border bg-card/30">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-foreground">Alerts</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                New discoveries across TTO assets, concepts, and research
                projects — last 48 hours.
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
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        ) : !data ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Bell className="w-10 h-10 text-muted-foreground/30" />
            <p className="text-sm font-medium text-muted-foreground">
              Could not load alerts
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            <div className="lg:col-span-2 space-y-4">
              <TtoAssetsSection data={data.newAssets} />
              <ConceptsSection data={data.newConcepts} />
              <ProjectsSection data={data.newProjects} />
            </div>

            <div className="lg:col-span-1">
              <div className="rounded-lg border border-card-border bg-card p-5 space-y-3 sticky top-6">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="w-4 h-4" />
                  <span className="text-xs font-medium">48-hour window</span>
                </div>
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
