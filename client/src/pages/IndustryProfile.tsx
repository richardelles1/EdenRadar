import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Building2, Plus, X, CheckCircle2 } from "lucide-react";
import { getIndustryProfile, saveIndustryProfile } from "@/hooks/use-industry";
import { useToast } from "@/hooks/use-toast";

const COMPANY_TYPES = [
  "Large Pharma",
  "Mid-size Pharma",
  "Biotech Startup",
  "Venture Capital / Investment",
  "Private Equity",
  "Corporate Venture",
  "Contract Research Organization",
  "Academic / Non-profit",
  "Other",
];

const DEAL_STAGES = [
  "Discovery",
  "Preclinical",
  "Phase 1",
  "Phase 2",
  "Phase 3",
  "Approved",
];

const formSchema = z.object({
  companyName: z.string().min(1, "Required"),
  companyType: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

function TagInput({
  label,
  description,
  items,
  setItems,
  placeholder,
  testIdPrefix,
  badgeClass,
}: {
  label: string;
  description?: string;
  items: string[];
  setItems: (fn: (prev: string[]) => string[]) => void;
  placeholder: string;
  testIdPrefix: string;
  badgeClass?: string;
}) {
  const [value, setValue] = useState("");

  function add() {
    const trimmed = value.trim();
    if (trimmed && !items.includes(trimmed)) {
      setItems((prev) => [...prev, trimmed]);
      setValue("");
    }
  }

  function remove(item: string) {
    setItems((prev) => prev.filter((a) => a !== item));
  }

  return (
    <div className="space-y-2">
      <FormLabel>{label}</FormLabel>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      <div className="flex gap-2">
        <Input
          placeholder={placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          data-testid={`input-${testIdPrefix}-new`}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={add}
          data-testid={`button-add-${testIdPrefix}`}
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {items.map((item) => (
            <Badge
              key={item}
              variant="secondary"
              className={`gap-1.5 pr-1.5 ${badgeClass ?? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"}`}
              data-testid={`badge-${testIdPrefix}-${item}`}
            >
              {item}
              <button
                type="button"
                onClick={() => remove(item)}
                className="hover:text-red-500 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function StageCheckboxes({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (stages: string[]) => void;
}) {
  function toggle(stage: string) {
    if (selected.includes(stage)) {
      onChange(selected.filter((s) => s !== stage));
    } else {
      onChange([...selected, stage]);
    }
  }

  return (
    <div className="space-y-2">
      <FormLabel>Preferred Deal Stages</FormLabel>
      <p className="text-xs text-muted-foreground">Select all stages you actively pursue.</p>
      <div className="flex flex-wrap gap-2 pt-1">
        {DEAL_STAGES.map((stage) => {
          const active = selected.includes(stage);
          return (
            <button
              key={stage}
              type="button"
              onClick={() => toggle(stage)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-all duration-150 ${
                active
                  ? "border-emerald-500 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-medium"
                  : "border-card-border bg-card text-muted-foreground hover:text-foreground hover:border-emerald-500/40"
              }`}
              data-testid={`toggle-deal-stage-${stage}`}
            >
              {active && <CheckCircle2 className="w-3 h-3 inline mr-1" />}
              {stage}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function IndustryProfile() {
  const { toast } = useToast();
  const profile = getIndustryProfile();
  const [therapeuticAreas, setTherapeuticAreas] = useState<string[]>(profile.therapeuticAreas);
  const [modalities, setModalities] = useState<string[]>(profile.modalities);
  const [dealStages, setDealStages] = useState<string[]>(profile.dealStages);
  const [, forceUpdate] = useState(0);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      companyName: profile.companyName,
      companyType: profile.companyType || "",
    },
  });

  function onSubmit(values: FormValues) {
    saveIndustryProfile({
      companyName: values.companyName,
      companyType: values.companyType ?? "",
      therapeuticAreas,
      dealStages,
      modalities,
    });
    forceUpdate((n) => n + 1);
    toast({ title: "Profile saved" });
  }

  return (
    <div className="p-6 max-w-xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-lg bg-emerald-600/10 flex items-center justify-center">
          <Building2 className="w-5 h-5 text-emerald-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Company Profile</h1>
          <p className="text-sm text-muted-foreground">
            Personalize your dashboard, alerts, and Eden recommendations.
          </p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          <FormField
            control={form.control}
            name="companyName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Company Name</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., Acme Therapeutics" {...field} data-testid="input-company-name" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="companyType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Company Type <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid="select-company-type">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {COMPANY_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <TagInput
            label="Therapeutic Focus Areas"
            description="Primary areas of interest. Used to personalize Scout results and Eden responses."
            items={therapeuticAreas}
            setItems={setTherapeuticAreas}
            placeholder="e.g., Oncology, CRISPR, mRNA"
            testIdPrefix="therapeutic-area"
          />

          <TagInput
            label="Modalities of Interest"
            description="Drug modality types you actively pursue."
            items={modalities}
            setItems={setModalities}
            placeholder="e.g., Small molecule, CAR-T, ADC"
            testIdPrefix="modality"
            badgeClass="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30"
          />

          <StageCheckboxes selected={dealStages} onChange={setDealStages} />

          <Button
            type="submit"
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
            data-testid="button-save-industry-profile"
          >
            Save Profile
          </Button>
        </form>
      </Form>
    </div>
  );
}
