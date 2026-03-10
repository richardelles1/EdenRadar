import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Bell, Plus, Edit2, Pause, Play, Trash2, BellOff } from "lucide-react";

const MOCK_ALERTS = [
  {
    id: "a1",
    modality: "CAR-T",
    indication: "Solid Tumors",
    stage: "Preclinical",
    status: "active" as const,
    matchText: "14 new matches this week",
    institutions: ["Stanford University", "MIT", "UCSF"],
  },
  {
    id: "a2",
    modality: "Gene Therapy",
    indication: "CNS",
    stage: "Phase 1–2",
    status: "active" as const,
    matchText: "3 new matches this week",
    institutions: ["Harvard University", "Johns Hopkins University"],
  },
  {
    id: "a3",
    modality: "PROTAC Degraders",
    indication: "Oncology",
    stage: "Any Stage",
    status: "paused" as const,
    matchText: "Paused",
    institutions: ["All institutions"],
  },
];

function AlertCard({ alert }: { alert: typeof MOCK_ALERTS[number] }) {
  return (
    <div
      className="flex flex-col gap-3 p-5 rounded-lg border border-card-border bg-card hover:border-primary/20 transition-colors duration-200"
      data-testid={`alert-card-${alert.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className={`w-9 h-9 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${
            alert.status === "active" ? "bg-primary/10" : "bg-muted"
          }`}>
            {alert.status === "active"
              ? <Bell className="w-4 h-4 text-primary" />
              : <BellOff className="w-4 h-4 text-muted-foreground" />
            }
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-sm font-semibold text-foreground">{alert.modality}</span>
              <span className="text-muted-foreground text-sm">·</span>
              <span className="text-sm text-foreground">{alert.indication}</span>
              <span className="text-muted-foreground text-sm">·</span>
              <span className="text-sm text-muted-foreground">{alert.stage}</span>
            </div>
            <p className={`text-xs mt-1 font-medium ${
              alert.status === "active" ? "text-primary" : "text-muted-foreground"
            }`}>
              {alert.matchText}
            </p>
          </div>
        </div>
        <Badge
          variant="secondary"
          className={`shrink-0 text-[11px] font-semibold border-0 ${
            alert.status === "active"
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "bg-muted text-muted-foreground"
          }`}
          data-testid={`badge-alert-status-${alert.id}`}
        >
          {alert.status === "active" ? "Active" : "Paused"}
        </Badge>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {alert.institutions.map((inst) => (
          <span
            key={inst}
            className="text-[10px] px-2 py-0.5 rounded-full border border-card-border bg-muted/30 text-muted-foreground"
          >
            {inst}
          </span>
        ))}
      </div>

      <div className="flex items-center gap-2 pt-1 border-t border-card-border">
        <Button
          size="sm"
          variant="ghost"
          className="gap-1.5 h-7 text-xs text-muted-foreground hover:text-foreground"
          data-testid={`button-edit-alert-${alert.id}`}
        >
          <Edit2 className="w-3 h-3" />
          Edit
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="gap-1.5 h-7 text-xs text-muted-foreground hover:text-foreground"
          data-testid={`button-pause-alert-${alert.id}`}
        >
          {alert.status === "active"
            ? <><Pause className="w-3 h-3" />Pause</>
            : <><Play className="w-3 h-3" />Resume</>
          }
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="gap-1.5 h-7 text-xs text-muted-foreground hover:text-destructive ml-auto"
          data-testid={`button-delete-alert-${alert.id}`}
        >
          <Trash2 className="w-3 h-3" />
          Delete
        </Button>
      </div>
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

  return (
    <div className="min-h-full bg-background">
      <div className="border-b border-border bg-card/30">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Alerts</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Saved searches that monitor for new matching assets across all sources.
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

      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {MOCK_ALERTS.map((alert) => (
            <AlertCard key={alert.id} alert={alert} />
          ))}
        </div>
      </div>

      <CreateAlertSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </div>
  );
}
