import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, X, CheckCircle2, Building2 } from "lucide-react";
import { getIndustryProfile, saveIndustryProfile } from "@/hooks/use-industry";

const DEAL_STAGES = [
  "Discovery",
  "Preclinical",
  "Phase 1",
  "Phase 2",
  "Phase 3",
  "Approved",
];

interface Props {
  open: boolean;
  onClose: () => void;
  initialCompanyName?: string;
}

const MODALITIES = [
  "Small Molecule",
  "Biologic",
  "Cell Therapy",
  "Gene Therapy",
  "RNA/siRNA",
  "Antibody",
  "Diagnostic",
  "Medical Device",
  "Vaccine",
  "CRISPR",
];

export function IndustryOnboarding({ open, onClose, initialCompanyName }: Props) {
  const saved = getIndustryProfile();
  const [companyName, setCompanyName] = useState(saved.companyName || initialCompanyName || "");

  // Backfill if org data arrives asynchronously after mount
  useEffect(() => {
    if (!companyName && !saved.companyName && initialCompanyName) {
      setCompanyName(initialCompanyName);
    }
  }, [initialCompanyName]);
  const [therapeuticAreas, setTherapeuticAreas] = useState<string[]>(
    saved.therapeuticAreas
  );
  const [dealStages, setDealStages] = useState<string[]>(saved.dealStages);
  const [modalities, setModalities] = useState<string[]>(saved.modalities ?? []);
  const [areaInput, setAreaInput] = useState("");

  function addArea() {
    const t = areaInput.trim();
    if (t && !therapeuticAreas.includes(t)) {
      setTherapeuticAreas((prev) => [...prev, t]);
      setAreaInput("");
    }
  }

  function removeArea(a: string) {
    setTherapeuticAreas((prev) => prev.filter((x) => x !== a));
  }

  function toggleStage(s: string) {
    setDealStages((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  }

  function toggleModality(m: string) {
    setModalities((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]
    );
  }

  function handleSave() {
    saveIndustryProfile({
      companyName,
      therapeuticAreas,
      dealStages,
      modalities,
      onboardingDone: true,
    });
    onClose();
  }

  function handleSkip() {
    saveIndustryProfile({ onboardingDone: true });
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleSkip()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <Building2 className="w-4 h-4 text-emerald-500" />
            </div>
            <DialogTitle className="text-base">
              Welcome to Industry Portal
            </DialogTitle>
          </div>
          <DialogDescription className="text-sm">
            Tell us about your company so we can personalize Scout results,
            alerts, and Eden recommendations.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="onboarding-company">Company Name</Label>
            <Input
              id="onboarding-company"
              placeholder="e.g., Acme Therapeutics"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              data-testid="input-onboarding-company-name"
            />
          </div>

          <div className="space-y-2">
            <Label>Therapeutic Focus Areas</Label>
            <div className="flex gap-2">
              <Input
                placeholder="e.g., Oncology, CRISPR"
                value={areaInput}
                onChange={(e) => setAreaInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addArea();
                  }
                }}
                data-testid="input-onboarding-therapeutic-area"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={addArea}
                data-testid="button-onboarding-add-area"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            {therapeuticAreas.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {therapeuticAreas.map((a) => (
                  <Badge
                    key={a}
                    variant="secondary"
                    className="gap-1.5 pr-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                    data-testid={`badge-onboarding-area-${a}`}
                  >
                    {a}
                    <button
                      type="button"
                      onClick={() => removeArea(a)}
                      className="hover:text-red-500 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Preferred Deal Stages</Label>
            <div className="flex flex-wrap gap-2">
              {DEAL_STAGES.map((s) => {
                const active = dealStages.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleStage(s)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                      active
                        ? "border-emerald-500 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-medium"
                        : "border-card-border text-muted-foreground hover:border-emerald-500/40"
                    }`}
                    data-testid={`toggle-onboarding-stage-${s}`}
                  >
                    {active && <CheckCircle2 className="w-3 h-3 inline mr-1" />}
                    {s}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Modalities of Interest</Label>
            <div className="flex flex-wrap gap-2">
              {MODALITIES.map((m) => {
                const active = modalities.includes(m);
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => toggleModality(m)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                      active
                        ? "border-blue-500 bg-blue-500/15 text-blue-600 dark:text-blue-400 font-medium"
                        : "border-card-border text-muted-foreground hover:border-blue-500/40"
                    }`}
                    data-testid={`toggle-onboarding-modality-${m.replace(/\s+/g, "-").toLowerCase()}`}
                  >
                    {active && <CheckCircle2 className="w-3 h-3 inline mr-1" />}
                    {m}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleSave}
              data-testid="button-onboarding-save"
            >
              Save & Continue
            </Button>
            <Button
              variant="ghost"
              onClick={handleSkip}
              className="text-muted-foreground"
              data-testid="button-onboarding-skip"
            >
              Skip
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
