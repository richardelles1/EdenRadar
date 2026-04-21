import { useState } from "react";
import { ChevronDown, ChevronUp, Target, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface BuyerProfile {
  therapeutic_areas: string[];
  modalities: string[];
  preferred_stages: string[];
  excluded_stages: string[];
  owner_type_preference: "university" | "company" | "any";
  freshness_days: number;
  indication_keywords: string[];
  target_keywords: string[];
  notes: string;
}

interface BuyerProfileFormProps {
  value: BuyerProfile;
  onChange: (profile: BuyerProfile) => void;
}

const THERAPEUTIC_AREAS = [
  "Oncology", "Immunology", "Neurology", "Cardiology", "Rare Disease",
  "Infectious Disease", "Metabolic", "CNS", "Pulmonology", "Ophthalmology",
];

const MODALITY_OPTIONS = [
  "Small Molecule", "Antibody", "CAR-T", "Gene Therapy", "mRNA Therapy",
  "Peptide", "Bispecific Antibody", "ADC", "Cell Therapy", "PROTAC",
];

const STAGE_OPTIONS = ["discovery", "preclinical", "phase 1", "phase 2", "phase 3"];

function ToggleChip({
  label, active, onClick,
}: {
  label: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-xs px-2.5 py-1 rounded-full border transition-all duration-150 capitalize ${
        active
          ? "border-primary bg-primary/15 text-primary font-medium"
          : "border-card-border bg-card text-muted-foreground hover:text-foreground hover:border-primary/40"
      }`}
    >
      {label}
    </button>
  );
}

function toggle<T>(arr: T[], item: T): T[] {
  return arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];
}

function KeywordInput({
  values, onChange, placeholder,
}: {
  values: string[]; onChange: (v: string[]) => void; placeholder: string;
}) {
  const [input, setInput] = useState("");
  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder}
          className="h-7 text-xs"
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              const kw = input.trim().toLowerCase();
              if (kw && !values.includes(kw)) onChange([...values, kw]);
              setInput("");
            }
          }}
          data-testid={`input-keyword-${placeholder.replace(/\s+/g, "-").toLowerCase()}`}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs px-2"
          onClick={() => {
            const kw = input.trim().toLowerCase();
            if (kw && !values.includes(kw)) onChange([...values, kw]);
            setInput("");
          }}
        >
          Add
        </Button>
      </div>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {values.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20"
            >
              {v}
              <button type="button" onClick={() => onChange(values.filter((x) => x !== v))}>
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

const CHIP_LIMIT = 5;

function CollapsedSummary({ value }: { value: BuyerProfile }) {
  const chips = [
    ...value.therapeutic_areas,
    ...value.modalities,
    ...value.preferred_stages,
  ];
  if (chips.length === 0) return null;
  const visible = chips.slice(0, CHIP_LIMIT);
  const overflow = chips.length - visible.length;
  return (
    <div className="flex flex-wrap gap-1 mt-1.5 px-0.5" data-testid="deal-focus-summary">
      {visible.map((chip) => (
        <span
          key={chip}
          data-testid={`chip-focus-${chip.replace(/\s+/g, "-").toLowerCase()}`}
          className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 capitalize font-medium"
        >
          {chip}
        </span>
      ))}
      {overflow > 0 && (
        <span
          className="text-[10px] px-2 py-0.5 rounded-full bg-card border border-card-border text-muted-foreground"
          data-testid="chip-focus-overflow"
        >
          +{overflow} more
        </span>
      )}
    </div>
  );
}

export function BuyerProfileForm({ value, onChange }: BuyerProfileFormProps) {
  const [open, setOpen] = useState(false);

  const set = <K extends keyof BuyerProfile>(key: K, val: BuyerProfile[K]) =>
    onChange({ ...value, [key]: val });

  const hasProfile =
    value.therapeutic_areas.length > 0 ||
    value.modalities.length > 0 ||
    value.preferred_stages.length > 0 ||
    value.indication_keywords.length > 0 ||
    value.target_keywords.length > 0;

  return (
    <div className="max-w-3xl mx-auto w-full">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-sm transition-all duration-150 ${
          hasProfile
            ? "border-primary/40 bg-primary/5 text-primary"
            : "border-card-border bg-card text-muted-foreground hover:text-foreground hover:border-primary/40"
        }`}
        data-testid="button-toggle-buyer-profile"
        aria-expanded={open}
        aria-label={open ? "Collapse deal focus panel" : "Expand deal focus panel"}
      >
        <div className="flex items-center gap-2">
          <Target className="w-3.5 h-3.5" />
          <span className="font-medium">
            {hasProfile ? "Deal Focus Active" : "Your Deal Focus"}
          </span>
          {hasProfile && (
            <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full font-semibold">
              Active
            </span>
          )}
        </div>
        {open ? <ChevronUp className="w-3.5 h-3.5 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 shrink-0" />}
      </button>

      {!open && hasProfile && <CollapsedSummary value={value} />}

      {open && (
        <div className="mt-2 p-4 rounded-lg border border-card-border bg-card space-y-4">
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block mb-2">
              Therapeutic Areas
            </label>
            <div className="flex flex-wrap gap-1.5">
              {THERAPEUTIC_AREAS.map((ta) => (
                <ToggleChip
                  key={ta}
                  label={ta}
                  active={value.therapeutic_areas.includes(ta)}
                  onClick={() => set("therapeutic_areas", toggle(value.therapeutic_areas, ta))}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block mb-2">
              Modalities
            </label>
            <div className="flex flex-wrap gap-1.5">
              {MODALITY_OPTIONS.map((m) => (
                <ToggleChip
                  key={m}
                  label={m}
                  active={value.modalities.includes(m)}
                  onClick={() => set("modalities", toggle(value.modalities, m))}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block mb-2">
              Development Stages
            </label>
            <div className="flex flex-wrap gap-1.5">
              {STAGE_OPTIONS.map((s) => (
                <ToggleChip
                  key={s}
                  label={s}
                  active={value.preferred_stages.includes(s)}
                  onClick={() => set("preferred_stages", toggle(value.preferred_stages, s))}
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">
                Indication Keywords
              </label>
              <KeywordInput
                values={value.indication_keywords}
                onChange={(v) => set("indication_keywords", v)}
                placeholder="e.g. NSCLC, diabetes"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">
                Target Keywords
              </label>
              <KeywordInput
                values={value.target_keywords}
                onChange={(v) => set("target_keywords", v)}
                placeholder="e.g. KRAS, PD-L1"
              />
            </div>
          </div>

          {hasProfile && (
            <div className="pt-1 border-t border-card-border">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-xs h-7 text-muted-foreground hover:text-foreground"
                onClick={() =>
                  onChange({
                    therapeutic_areas: [],
                    modalities: [],
                    preferred_stages: [],
                    excluded_stages: [],
                    owner_type_preference: "any",
                    freshness_days: 365,
                    indication_keywords: [],
                    target_keywords: [],
                    notes: "",
                  })
                }
                data-testid="button-clear-buyer-profile"
              >
                <X className="w-3 h-3 mr-1" />
                Clear focus
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export type { BuyerProfile };
