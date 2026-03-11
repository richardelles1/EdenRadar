import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Bell, Plus, ChevronDown, ChevronUp, Building2, Sparkles, Clock,
} from "lucide-react";

interface DeltaInstitution {
  institution: string;
  count: number;
  sampleAssets: string[];
}

interface DeltaResponse {
  runId: number | null;
  ranAt: string | null;
  totalNew: number;
  byInstitution: DeltaInstitution[];
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

function DeltaCard({ inst, index }: { inst: DeltaInstitution; index: number }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      className="rounded-lg border border-card-border bg-card hover:border-primary/20 transition-colors"
      data-testid={`delta-card-${index}`}
    >
      <div
        className="flex items-center gap-3 p-4 cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
          <Building2 className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{inst.institution}</p>
          <p className="text-xs text-primary font-medium mt-0.5">
            +{inst.count} new asset{inst.count !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="secondary" className="text-[11px] bg-primary/10 text-primary border-0 tabular-nums">
            +{inst.count}
          </Badge>
          {expanded
            ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
            : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          }
        </div>
      </div>

      {expanded && inst.sampleAssets.length > 0 && (
        <div className="px-4 pb-4 pt-0 border-t border-card-border/60">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide pt-3 mb-2">
            Sample new listings
          </p>
          <ul className="space-y-1.5">
            {inst.sampleAssets.map((name, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-xs text-foreground"
                data-testid={`delta-asset-${index}-${i}`}
              >
                <span className="w-1 h-1 rounded-full bg-primary/60 mt-1.5 shrink-0" />
                <span className="truncate">{name}</span>
              </li>
            ))}
          </ul>
          {inst.count > inst.sampleAssets.length && (
            <p className="text-[10px] text-muted-foreground mt-2">
              +{inst.count - inst.sampleAssets.length} more not shown
            </p>
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
            Set up a saved search that notifies you when new matching assets are found.
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
            <Button className="flex-1" onClick={onClose} data-testid="button-save-alert">
              Save Alert
            </Button>
            <Button variant="outline" onClick={onClose} data-testid="button-cancel-alert">
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

  const { data, isLoading } = useQuery<DeltaResponse>({
    queryKey: ["/api/ingest/delta"],
    staleTime: 5 * 60 * 1000,
  });

  const hasData = !isLoading && data && data.totalNew > 0;
  const noRun = !isLoading && (!data || !data.ranAt);

  return (
    <div className="min-h-full bg-background">
      <div className="border-b border-border bg-card/30">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Alerts</h1>
              <p className="text-sm text-muted-foreground mt-1">
                New asset discoveries from the latest TTO scan, broken down by institution.
              </p>
            </div>
            <Button
              className="gap-2"
              onClick={() => setSheetOpen(true)}
              data-testid="button-create-alert"
            >
              <Plus className="w-4 h-4" />
              Create Alert
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
          </div>
        ) : noRun ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Bell className="w-10 h-10 text-muted-foreground/30" />
            <p className="text-sm font-medium text-muted-foreground">No scans have been run yet</p>
            <p className="text-xs text-muted-foreground/70">
              Run a full scan from the Scout page to start seeing new asset discoveries here.
            </p>
          </div>
        ) : (
          <>
            <div
              className="flex flex-col sm:flex-row sm:items-center gap-4 p-5 rounded-lg border border-primary/20 bg-primary/5"
              data-testid="delta-summary-card"
            >
              <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-2xl font-bold text-primary tabular-nums">{data?.totalNew ?? 0}</span>
                  <span className="text-sm text-foreground font-medium">new assets found</span>
                  <span className="text-xs text-muted-foreground">
                    across {data?.byInstitution.length ?? 0} institution{(data?.byInstitution.length ?? 0) !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  <span>
                    Run #{data?.runId} · {formatRelative(data?.ranAt ?? null)}
                  </span>
                </div>
              </div>
            </div>

            {hasData && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  By Institution
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {data!.byInstitution.map((inst, i) => (
                    <DeltaCard key={inst.institution} inst={inst} index={i} />
                  ))}
                </div>
              </div>
            )}

            {!hasData && data?.ranAt && (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <Bell className="w-8 h-8 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">No new assets in the last scan</p>
                <p className="text-xs text-muted-foreground/70">All known assets were already indexed.</p>
              </div>
            )}
          </>
        )}
      </div>

      <CreateAlertSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </div>
  );
}
