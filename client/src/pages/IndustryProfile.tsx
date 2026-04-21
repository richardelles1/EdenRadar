import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Building2, Bell, CheckCircle2, Save } from "lucide-react";
import { getIndustryProfile, saveIndustryProfile } from "@/hooks/use-industry";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

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

const THERAPEUTIC_AREA_OPTIONS = [
  "Oncology", "Immunology", "Neurology", "Rare Disease", "Cardiology",
  "Infectious Disease", "Metabolic Disease", "Ophthalmology", "Dermatology",
  "Respiratory", "Hematology", "Gastroenterology", "Musculoskeletal",
  "Endocrinology", "Psychiatry",
];

const MODALITY_OPTIONS = [
  "Small Molecule", "Antibody", "ADC", "CAR-T", "Gene Therapy",
  "mRNA Therapy", "Peptide", "Bispecific Antibody", "Cell Therapy",
];

const STAGE_OPTIONS = ["Discovery", "Preclinical", "Phase 1", "Phase 2", "Phase 3", "Approved"];

const formSchema = z.object({
  userName: z.string().optional(),
  companyName: z.string().min(1, "Required"),
  companyType: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

function ToggleChip({
  label,
  active,
  onClick,
  testId,
  color = "emerald",
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  testId?: string;
  color?: "emerald" | "blue" | "violet";
}) {
  const activeClass = {
    emerald: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40",
    blue: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/40",
    violet: "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/40",
  }[color];

  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId ?? `chip-${label.toLowerCase().replace(/\s+/g, "-")}`}
      className={cn(
        "px-2.5 py-1 rounded-full text-xs font-medium border transition-all duration-150 select-none flex items-center gap-1",
        active
          ? activeClass
          : "bg-transparent text-muted-foreground border-border hover:border-primary/30 hover:text-foreground"
      )}
    >
      {active && <CheckCircle2 className="w-3 h-3 shrink-0" />}
      {label}
    </button>
  );
}

function ChipGroup({
  label,
  description,
  options,
  selected,
  onToggle,
  color = "emerald",
  testIdPrefix,
}: {
  label: string;
  description?: string;
  options: string[];
  selected: string[];
  onToggle: (item: string) => void;
  color?: "emerald" | "blue" | "violet";
  testIdPrefix: string;
}) {
  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <div className="flex flex-wrap gap-1.5 pt-0.5">
        {options.map((opt) => (
          <ToggleChip
            key={opt}
            label={opt}
            active={selected.includes(opt)}
            onClick={() => onToggle(opt)}
            color={color}
            testId={`chip-${testIdPrefix}-${opt.toLowerCase().replace(/\s+/g, "-")}`}
          />
        ))}
      </div>
    </div>
  );
}

function formatRelativeTime(date: string | Date | null): string {
  if (!date) return "never";
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = Date.now() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString();
}

export default function IndustryProfile() {
  const { toast } = useToast();
  const { session } = useAuth();
  const qc = useQueryClient();
  const profile = getIndustryProfile();
  const [therapeuticAreas, setTherapeuticAreas] = useState<string[]>(profile.therapeuticAreas);
  const [modalities, setModalities] = useState<string[]>(profile.modalities);
  const [dealStages, setDealStages] = useState<string[]>(profile.dealStages);
  const [saved, setSaved] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      userName: profile.userName ?? "",
      companyName: profile.companyName,
      companyType: profile.companyType || "",
    },
  });

  const token = session?.access_token;

  const { data: serverProfile } = useQuery({
    queryKey: ["/api/industry/profile", token],
    enabled: !!token,
    queryFn: async () => {
      const res = await fetch("/api/industry/profile", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      const body = await res.json();
      return body.profile as {
        subscribedToDigest: boolean;
        notificationPrefs: { frequency: string } | null;
        lastAlertSentAt: string | null;
      } | null;
    },
    staleTime: 30000,
  });

  const subscribedToDigest = serverProfile?.subscribedToDigest ?? false;
  const frequency = serverProfile?.notificationPrefs?.frequency ?? "daily";
  const lastAlertSentAt = serverProfile?.lastAlertSentAt ?? null;

  const subscriptionMutation = useMutation({
    mutationFn: async (value: boolean) => {
      const res = await fetch("/api/users/subscribe", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ subscribedToDigest: value }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/industry/profile"] });
    },
    onError: (err: any) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  const frequencyMutation = useMutation({
    mutationFn: async (freq: string) => {
      const res = await fetch("/api/users/notification-prefs", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ frequency: freq }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/industry/profile"] });
    },
    onError: (err: any) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  function toggleArea(item: string, setter: (fn: (prev: string[]) => string[]) => void) {
    setter((prev) => prev.includes(item) ? prev.filter((a) => a !== item) : [...prev, item]);
    setSaved(false);
  }

  function onSubmit(values: FormValues) {
    saveIndustryProfile({
      userName: values.userName ?? "",
      companyName: values.companyName,
      companyType: values.companyType ?? "",
      therapeuticAreas,
      dealStages,
      modalities,
    });
    setSaved(true);
    toast({ title: "Profile saved" });
    setTimeout(() => setSaved(false), 2500);
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
            Your interests here power the dashboard, alerts, and Scout recommendations.
          </p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

          <div className="rounded-xl border border-card-border bg-card p-5 space-y-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Company</p>

            <FormField
              control={form.control}
              name="userName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Your Name <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Alex" {...field} data-testid="input-user-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

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
          </div>

          <div className="rounded-xl border border-card-border bg-card p-5 space-y-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Interests</p>
            <p className="text-xs text-muted-foreground -mt-3">
              These drive your "Explore for You" panel, alert scoring, and email digest content.
            </p>

            <ChipGroup
              label="Therapeutic Focus Areas"
              description="Areas you actively watch for new assets."
              options={THERAPEUTIC_AREA_OPTIONS}
              selected={therapeuticAreas}
              onToggle={(item) => toggleArea(item, setTherapeuticAreas)}
              color="emerald"
              testIdPrefix="ta"
            />

            <ChipGroup
              label="Modalities of Interest"
              description="Drug modality types you actively evaluate."
              options={MODALITY_OPTIONS}
              selected={modalities}
              onToggle={(item) => toggleArea(item, setModalities)}
              color="blue"
              testIdPrefix="modality"
            />

            <ChipGroup
              label="Preferred Deal Stages"
              description="Development stages you actively pursue."
              options={STAGE_OPTIONS}
              selected={dealStages}
              onToggle={(item) => toggleArea(item, setDealStages)}
              color="violet"
              testIdPrefix="stage"
            />
          </div>

          <Button
            type="submit"
            className="w-full gap-2"
            data-testid="button-save-industry-profile"
          >
            {saved ? (
              <><CheckCircle2 className="w-4 h-4" /> Saved</>
            ) : (
              <><Save className="w-4 h-4" /> Save Profile</>
            )}
          </Button>
        </form>
      </Form>

      {token && (
        <div className="mt-6 rounded-xl border border-card-border bg-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-muted-foreground" />
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notifications</p>
          </div>

          <div className="flex items-start justify-between gap-4">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-foreground">Asset match alerts</p>
              <p className="text-xs text-muted-foreground">
                Email me when new assets match my therapeutic areas and modalities.
              </p>
              {lastAlertSentAt && (
                <p className="text-xs text-muted-foreground mt-1">
                  Last sent: <span className="text-foreground">{formatRelativeTime(lastAlertSentAt)}</span>
                </p>
              )}
            </div>
            <Switch
              checked={subscribedToDigest}
              onCheckedChange={(v) => subscriptionMutation.mutate(v)}
              disabled={subscriptionMutation.isPending}
              data-testid="toggle-alert-subscription"
              aria-label="Toggle asset match email alerts"
            />
          </div>

          {subscribedToDigest && (
            <div className="flex items-center gap-3 pt-1 border-t border-card-border">
              <p className="text-sm text-muted-foreground">Send at most:</p>
              <Select
                value={frequency}
                onValueChange={(v) => frequencyMutation.mutate(v)}
                disabled={frequencyMutation.isPending}
              >
                <SelectTrigger className="w-28 h-8 text-sm" data-testid="select-alert-frequency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Once daily</SelectItem>
                  <SelectItem value="weekly">Once weekly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
