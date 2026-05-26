import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ChevronRight, ChevronLeft, Search, Bell, Layers, ArrowRight, Sparkles } from "lucide-react";
import { getIndustryProfile, saveIndustryProfile, type IndustryProfile } from "@/hooks/use-industry";

interface Props {
  open: boolean;
  onClose: () => void;
  initialCompanyName?: string;
  onSave?: (profile: Pick<IndustryProfile, "therapeuticAreas" | "modalities" | "dealStages">) => void;
}

const THERAPEUTIC_AREAS = [
  { label: "Oncology",         color: "rose" },
  { label: "CNS / Neurology",  color: "violet" },
  { label: "Immunology",       color: "amber" },
  { label: "Cardiovascular",   color: "red" },
  { label: "Rare Disease",     color: "purple" },
  { label: "Metabolic",        color: "orange" },
  { label: "Infectious Dz",    color: "teal" },
  { label: "Pulmonology",      color: "sky" },
  { label: "Ophthalmology",    color: "indigo" },
  { label: "Hematology",       color: "rose" },
  { label: "Dermatology",      color: "amber" },
  { label: "Pain / Analgesic", color: "violet" },
];

const MODALITIES = [
  "Small Molecule", "mAb / Antibody", "CAR-T",
  "Gene Therapy",   "mRNA",           "ADC",
  "PROTAC",         "Cell Therapy",   "Bispecific Ab",
  "CRISPR",         "RNAi / siRNA",   "Peptide",
];

const STAGE_OPTIONS = [
  { key: "discovery",    label: "Discovery",   desc: "Early IP, pre-animal studies" },
  { key: "preclinical",  label: "Preclinical", desc: "Animal studies underway" },
  { key: "phase 1",      label: "Phase 1",     desc: "First-in-human dosing" },
  { key: "phase 2",      label: "Phase 2",     desc: "Proof-of-concept efficacy" },
  { key: "phase 3",      label: "Phase 3",     desc: "Pivotal trials" },
  { key: "approved",     label: "Approved",    desc: "On-market licensing" },
];

const COLOR_MAP: Record<string, string> = {
  rose:   "border-rose-300 dark:border-rose-700/60 bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300",
  violet: "border-violet-300 dark:border-violet-700/60 bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300",
  amber:  "border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300",
  red:    "border-red-300 dark:border-red-700/60 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300",
  purple: "border-purple-300 dark:border-purple-700/60 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300",
  orange: "border-orange-300 dark:border-orange-700/60 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300",
  teal:   "border-teal-300 dark:border-teal-700/60 bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-300",
  sky:    "border-sky-300 dark:border-sky-700/60 bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-300",
  indigo: "border-indigo-300 dark:border-indigo-700/60 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300",
};

const ACTIVE_COLOR_MAP: Record<string, string> = {
  rose:   "border-rose-500 bg-rose-500 text-white shadow-rose-500/25",
  violet: "border-violet-500 bg-violet-500 text-white shadow-violet-500/25",
  amber:  "border-amber-500 bg-amber-500 text-white shadow-amber-500/25",
  red:    "border-red-500 bg-red-500 text-white shadow-red-500/25",
  purple: "border-purple-500 bg-purple-500 text-white shadow-purple-500/25",
  orange: "border-orange-500 bg-orange-500 text-white shadow-orange-500/25",
  teal:   "border-teal-500 bg-teal-500 text-white shadow-teal-500/25",
  sky:    "border-sky-500 bg-sky-500 text-white shadow-sky-500/25",
  indigo: "border-indigo-500 bg-indigo-500 text-white shadow-indigo-500/25",
};

function toggle<T>(arr: T[], item: T): T[] {
  return arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];
}

function ProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-1 rounded-full flex-1 transition-all duration-300 ${
            i < step ? "bg-primary" : i === step ? "bg-primary/50" : "bg-border"
          }`}
        />
      ))}
    </div>
  );
}

export function IndustryOnboarding({ open, onClose, initialCompanyName, onSave }: Props) {
  const saved = getIndustryProfile();
  const [step, setStep] = useState(0);
  const [areas, setAreas]       = useState<string[]>(saved.therapeuticAreas ?? []);
  const [modalities, setMods]   = useState<string[]>(saved.modalities ?? []);
  const [stages, setStages]     = useState<string[]>(saved.dealStages ?? []);

  if (!open) return null;

  function handleFinish() {
    saveIndustryProfile({ therapeuticAreas: areas, modalities, dealStages: stages, onboardingDone: true });
    onSave?.({ therapeuticAreas: areas, modalities, dealStages: stages });
    onClose();
  }

  function handleSkip() {
    saveIndustryProfile({ onboardingDone: true });
    onClose();
  }

  const STEPS = [
    { label: "Therapy Focus" },
    { label: "Deal Stages" },
    { label: "Launch" },
  ];

  // Derived suggestion for the launchpad step
  const firstArea = areas[0] ?? "oncology";
  const queryHint = areas.slice(0, 2).join(" OR ") || "KRAS inhibitor";

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" }}
    >
      <div
        className="relative w-full max-w-xl rounded-2xl overflow-hidden shadow-2xl"
        style={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))" }}
      >
        {/* Decorative gradient strip at top */}
        <div
          className="h-1 w-full"
          style={{ background: "linear-gradient(90deg, hsl(142 71% 45%), hsl(220 91% 60%), hsl(280 80% 65%))" }}
        />

        <div className="p-7 pb-6 space-y-6">
          {/* Header */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: "hsl(142 71% 45% / 0.12)" }}
                >
                  <Sparkles className="w-4 h-4" style={{ color: "hsl(142 71% 45%)" }} />
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                    Step {step + 1} of {STEPS.length}
                  </p>
                  <p className="text-xs text-primary font-medium">{STEPS[step].label}</p>
                </div>
              </div>
              <button
                onClick={handleSkip}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Skip setup
              </button>
            </div>
            <ProgressBar step={step} total={STEPS.length} />
          </div>

          {/* ── Step 0: Therapeutic Focus ── */}
          {step === 0 && (
            <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
              <div>
                <h2 className="text-xl font-bold text-foreground">What does your portfolio focus on?</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Select all that apply — we pre-score every result against your thesis.
                </p>
              </div>

              <div className="space-y-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Therapeutic Areas</p>
                <div className="grid grid-cols-3 gap-2">
                  {THERAPEUTIC_AREAS.map(({ label, color }) => {
                    const active = areas.includes(label);
                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() => setAreas((prev) => toggle(prev, label))}
                        className={`relative px-2.5 py-2 rounded-lg border text-xs font-medium transition-all duration-150 text-left leading-tight ${
                          active
                            ? `${ACTIVE_COLOR_MAP[color]} shadow-sm`
                            : `${COLOR_MAP[color]} hover:opacity-80`
                        }`}
                      >
                        {active && (
                          <CheckCircle2 className="absolute top-1.5 right-1.5 w-3 h-3 opacity-80" />
                        )}
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Modalities of Interest</p>
                <div className="flex flex-wrap gap-1.5">
                  {MODALITIES.map((m) => {
                    const active = modalities.includes(m);
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMods((prev) => toggle(prev, m))}
                        className={`text-xs px-3 py-1.5 rounded-full border transition-all duration-150 font-medium ${
                          active
                            ? "border-primary bg-primary text-primary-foreground shadow-sm"
                            : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground bg-background"
                        }`}
                      >
                        {m}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── Step 1: Deal Stages ── */}
          {step === 1 && (
            <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
              <div>
                <h2 className="text-xl font-bold text-foreground">Which stages are you licensing at?</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Helps us rank assets at the right point in development for you.
                </p>
              </div>

              <div className="space-y-2">
                {STAGE_OPTIONS.map(({ key, label, desc }, idx) => {
                  const active = stages.includes(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setStages((prev) => toggle(prev, key))}
                      className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl border transition-all duration-150 text-left group ${
                        active
                          ? "border-primary/60 bg-primary/5 ring-1 ring-primary/20"
                          : "border-border hover:border-primary/30 hover:bg-muted/30"
                      }`}
                    >
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold transition-colors ${
                          active
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"
                        }`}
                      >
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold transition-colors ${active ? "text-foreground" : "text-foreground/80"}`}>
                          {label}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                      </div>
                      {active && (
                        <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Step 2: Launchpad ── */}
          {step === 2 && (
            <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
              <div>
                <h2 className="text-xl font-bold text-foreground">Your Scout is ready</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Results are now scored against your focus. Here's where to start.
                </p>
              </div>

              {/* Summary chips */}
              {(areas.length > 0 || modalities.length > 0) && (
                <div className="p-4 rounded-xl border border-border bg-muted/30 space-y-2">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Your focus</p>
                  <div className="flex flex-wrap gap-1.5">
                    {[...areas, ...modalities].slice(0, 8).map((chip) => (
                      <span
                        key={chip}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium"
                      >
                        {chip}
                      </span>
                    ))}
                    {areas.length + modalities.length > 8 && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                        +{areas.length + modalities.length - 8} more
                      </span>
                    )}
                    {areas.length === 0 && modalities.length === 0 && (
                      <span className="text-xs text-muted-foreground">No focus set — all assets will be shown</span>
                    )}
                  </div>
                </div>
              )}

              {/* CTA cards */}
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleFinish}
                  className="group w-full flex items-center gap-4 p-4 rounded-xl border border-primary/40 bg-primary/5 hover:bg-primary/10 transition-all duration-150 text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0 group-hover:bg-primary/25 transition-colors">
                    <Search className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">Search Scout</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Try <span className="text-primary font-medium">"{queryHint}"</span> — scored for your thesis
                    </p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-primary shrink-0 group-hover:translate-x-0.5 transition-transform" />
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      saveIndustryProfile({ therapeuticAreas: areas, modalities, dealStages: stages, onboardingDone: true });
                      onClose();
                      // Navigate handled externally — just close and let them explore
                    }}
                    className="group flex items-center gap-3 p-3.5 rounded-xl border border-border hover:border-primary/30 bg-background hover:bg-muted/30 transition-all duration-150 text-left"
                  >
                    <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0 group-hover:bg-primary/10 transition-colors">
                      <Layers className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-foreground">Pipelines</p>
                      <p className="text-[10px] text-muted-foreground">Save & organise assets</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      saveIndustryProfile({ therapeuticAreas: areas, modalities, dealStages: stages, onboardingDone: true });
                      onClose();
                    }}
                    className="group flex items-center gap-3 p-3.5 rounded-xl border border-border hover:border-primary/30 bg-background hover:bg-muted/30 transition-all duration-150 text-left"
                  >
                    <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0 group-hover:bg-primary/10 transition-colors">
                      <Bell className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-foreground">Alerts</p>
                      <p className="text-[10px] text-muted-foreground">Monitor new assets</p>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Footer nav */}
          <div className="flex items-center justify-between pt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground"
              onClick={() => (step === 0 ? handleSkip() : setStep((s) => s - 1))}
            >
              {step === 0 ? (
                "Skip"
              ) : (
                <><ChevronLeft className="w-3.5 h-3.5" /> Back</>
              )}
            </Button>

            {step < 2 ? (
              <Button
                type="button"
                size="sm"
                className="gap-1.5"
                onClick={() => setStep((s) => s + 1)}
              >
                Continue <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
