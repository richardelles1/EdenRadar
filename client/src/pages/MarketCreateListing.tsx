import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ChevronLeft, ChevronRight, Check, Sparkles, Building2, Link2, X } from "lucide-react";
import { cn } from "@/lib/utils";

const ACCENT = "hsl(271 81% 55%)";

const THERAPEUTIC_AREAS = [
  "Oncology", "Immunology", "Neurology", "Cardiology", "Rare Diseases",
  "Infectious Disease", "Metabolic", "Ophthalmology", "Dermatology",
  "Respiratory", "Gastroenterology", "Hematology", "Musculoskeletal", "Psychiatry", "Other",
];

const MODALITIES = [
  "Small Molecule", "Biologic", "Gene Therapy", "Cell Therapy",
  "Antibody", "mRNA", "Vaccine", "Diagnostic", "Medical Device", "Other",
];

const STAGES = [
  "Discovery", "Preclinical", "Phase 1", "Phase 1/2", "Phase 2",
  "Phase 2/3", "Phase 3", "Approved", "Post-Market",
];

const ENGAGEMENT_OPTIONS = [
  { value: "actively_seeking", label: "Actively Seeking" },
  { value: "quietly_inbound", label: "Quietly Inbound" },
  { value: "under_loi", label: "Under LOI" },
  { value: "closed", label: "Closed" },
];

const listingSchema = z.object({
  therapeuticArea: z.string().min(1, "Required"),
  modality: z.string().min(1, "Required"),
  stage: z.string().min(1, "Required"),
  mechanism: z.string().optional(),
  milestoneHistory: z.string().optional(),
  ipStatus: z.string().optional(),
  ipSummary: z.string().optional(),
  priceRangeMin: z.string().optional(),
  priceRangeMax: z.string().optional(),
  askingPrice: z.string().optional(),
  engagementStatus: z.string().default("actively_seeking"),
  blind: z.boolean().default(false),
  assetName: z.string().optional(),
});

type ListingFormData = z.infer<typeof listingSchema>;

type SuggestedAsset = {
  id: number;
  assetName: string;
  institution: string | null;
  modality: string | null;
  developmentStage: string | null;
  indication: string | null;
  target: string | null;
  innovationClaim: string | null;
  mechanismOfAction: string | null;
  ipType: string | null;
  completenessScore: number | null;
};

const STEPS = [
  { title: "Basic Info", desc: "Therapeutic area, modality & stage" },
  { title: "Asset Details", desc: "Mechanism, milestones & IP" },
  { title: "Commercial Terms", desc: "Price range & engagement status" },
  { title: "Blind Listing", desc: "Asset name & confidentiality options" },
];

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div
            className={cn(
              "w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold border transition-all",
              i < current ? "text-white border-transparent" : i === current ? "border-violet-500 text-violet-600 dark:text-violet-400" : "border-border text-muted-foreground"
            )}
            style={i < current ? { background: ACCENT, borderColor: ACCENT } : i === current ? { borderColor: ACCENT } : {}}
          >
            {i < current ? <Check className="w-3 h-3" /> : i + 1}
          </div>
          {i < total - 1 && (
            <div className={cn("h-px w-6 transition-all", i < current ? "bg-violet-500" : "bg-border")} />
          )}
        </div>
      ))}
    </div>
  );
}

function IntelligenceAssist({
  ta,
  linkedAsset,
  onLink,
  onClear,
  session,
}: {
  ta: string;
  linkedAsset: SuggestedAsset | null;
  onLink: (a: SuggestedAsset) => void;
  onClear: () => void;
  session: { access_token: string; user: { id: string } } | null;
}) {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 500);
    return () => clearTimeout(t);
  }, [q]);

  const searchQuery = [debouncedQ, ta].filter(Boolean).join(" ");

  const { data: suggestions = [], isFetching } = useQuery<SuggestedAsset[]>({
    queryKey: ["/api/market/listings/suggest-asset", searchQuery],
    queryFn: async () => {
      if (!searchQuery || searchQuery.trim().length < 2) return [];
      const params = new URLSearchParams();
      if (debouncedQ) params.set("q", debouncedQ);
      if (ta) params.set("ta", ta);
      const res = await fetch(`/api/market/listings/suggest-asset?${params}`, {
        headers: {
          Authorization: `Bearer ${session!.access_token}`,
          "x-user-id": session!.user.id,
        },
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!session && searchQuery.trim().length >= 2,
    staleTime: 30 * 1000,
  });

  if (linkedAsset) {
    return (
      <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-3" data-testid="intel-assist-linked">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <Sparkles className="w-3.5 h-3.5 text-violet-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-foreground">{linkedAsset.assetName}</p>
              {linkedAsset.institution && <p className="text-[10px] text-muted-foreground">{linkedAsset.institution}</p>}
              <p className="text-[10px] text-violet-500/80 mt-0.5">Linked to EdenScout record — intelligence enabled</p>
            </div>
          </div>
          <button onClick={onClear} className="p-1 rounded text-muted-foreground hover:text-foreground" data-testid="intel-assist-unlink">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        {linkedAsset.completenessScore != null && (
          <div className="flex items-center gap-2 mt-2">
            <div className="flex-1 h-1 rounded-full bg-violet-500/20 overflow-hidden">
              <div className="h-full rounded-full bg-violet-500" style={{ width: `${linkedAsset.completenessScore}%` }} />
            </div>
            <span className="text-[10px] text-muted-foreground shrink-0">{linkedAsset.completenessScore}% data complete</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid="intel-assist-panel">
      <div className="flex items-center gap-2">
        <Sparkles className="w-3.5 h-3.5 text-violet-500 shrink-0" />
        <p className="text-xs font-semibold text-foreground">Link to EdenScout</p>
        <span className="text-[10px] text-muted-foreground">(optional — unlocks Eden Intelligence for buyers)</span>
      </div>
      <Input
        placeholder="Search EdenScout for this asset…"
        value={q}
        onChange={e => setQ(e.target.value)}
        className="h-8 text-xs"
        data-testid="intel-assist-search"
      />
      {isFetching && (
        <p className="text-[10px] text-muted-foreground pl-1">Searching…</p>
      )}
      {suggestions.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden divide-y divide-border/50">
          {suggestions.map(a => (
            <button
              key={a.id}
              type="button"
              onClick={() => onLink(a)}
              className="w-full flex items-start gap-2 px-3 py-2.5 text-left hover:bg-accent/50 transition-colors"
              data-testid={`intel-assist-result-${a.id}`}
            >
              <Building2 className="w-3.5 h-3.5 text-violet-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate">{a.assetName}</p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {[a.institution, a.developmentStage, a.modality].filter(Boolean).join(" · ")}
                </p>
                {a.indication && <p className="text-[10px] text-muted-foreground/70 truncate">{a.indication}</p>}
              </div>
              {a.completenessScore != null && (
                <span className="text-[10px] text-violet-500 font-semibold shrink-0">{a.completenessScore}%</span>
              )}
            </button>
          ))}
        </div>
      )}
      {!isFetching && debouncedQ.length >= 2 && suggestions.length === 0 && (
        <p className="text-[10px] text-muted-foreground pl-1">No EdenScout records found. You can still proceed without linking.</p>
      )}
    </div>
  );
}

export default function MarketCreateListing() {
  const { session } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [linkedAsset, setLinkedAsset] = useState<SuggestedAsset | null>(null);
  const [prefilledFields, setPrefilledFields] = useState<string[]>([]);

  const form = useForm<ListingFormData>({
    resolver: zodResolver(listingSchema),
    defaultValues: {
      therapeuticArea: "",
      modality: "",
      stage: "",
      mechanism: "",
      milestoneHistory: "",
      ipStatus: "",
      ipSummary: "",
      priceRangeMin: "",
      priceRangeMax: "",
      askingPrice: "",
      engagementStatus: "actively_seeking",
      blind: false,
      assetName: "",
    },
  });

  const { mutate, isPending } = useMutation({
    mutationFn: async ({ data, asDraft }: { data: ListingFormData; asDraft?: boolean }) => {
      const payload = {
        ...data,
        priceRangeMin: data.priceRangeMin ? parseInt(data.priceRangeMin, 10) : undefined,
        priceRangeMax: data.priceRangeMax ? parseInt(data.priceRangeMax, 10) : undefined,
        ingestedAssetId: linkedAsset?.id ?? undefined,
        ...(asDraft ? { status: "draft" } : {}),
      };
      const res = await fetch("/api/market/listings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session!.access_token}`,
          "x-user-id": session!.user.id,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      return { result: await res.json(), asDraft };
    },
    onSuccess: ({ asDraft }) => {
      qc.invalidateQueries({ queryKey: ["/api/market/my-listings"] });
      if (asDraft) {
        toast({ title: "Draft saved", description: "Your listing has been saved as a draft. Submit it for review when ready." });
      } else {
        toast({ title: "Listing submitted for review", description: "Our team will review your listing and publish it shortly." });
      }
      navigate("/market/seller");
    },
    onError: (err: Error) => {
      toast({ title: "Submission failed", description: err.message, variant: "destructive" });
    },
  });

  async function handleNext() {
    let valid = false;
    if (step === 0) valid = await form.trigger(["therapeuticArea", "modality", "stage"]);
    else if (step === 1) valid = true;
    else if (step === 2) valid = true;
    else valid = true;
    if (valid) setStep(s => s + 1);
  }

  function handleBack() {
    if (step === 0) navigate("/market/seller");
    else setStep(s => s - 1);
  }

  // Auto-fill form fields from linked EdenScout asset, tracking which were prefilled
  function handleLinkAsset(a: SuggestedAsset) {
    setLinkedAsset(a);
    const filled: string[] = [];
    // Mechanism: combine target + mechanismOfAction
    if (!form.getValues("mechanism")) {
      const parts: string[] = [];
      if (a.target) parts.push(`Target: ${a.target}`);
      if (a.mechanismOfAction) parts.push(a.mechanismOfAction);
      if (parts.length) { form.setValue("mechanism", parts.join("\n")); filled.push("Mechanism"); }
    }
    // IP status from ipType
    if (a.ipType && !form.getValues("ipStatus")) {
      form.setValue("ipStatus", a.ipType);
      filled.push("IP Status");
    }
    // IP summary from innovationClaim
    if (a.innovationClaim && !form.getValues("ipSummary")) {
      form.setValue("ipSummary", a.innovationClaim);
      filled.push("IP Summary");
    }
    // Modality
    if (a.modality && !form.getValues("modality")) {
      const match = MODALITIES.find(m => m.toLowerCase() === a.modality!.toLowerCase());
      if (match) { form.setValue("modality", match); filled.push("Modality"); }
    }
    // Stage
    if (a.developmentStage && !form.getValues("stage")) {
      const stageMap: Record<string, string> = {
        discovery: "Discovery", preclinical: "Preclinical",
        "phase 1": "Phase 1", "phase 2": "Phase 2", "phase 3": "Phase 3",
        approved: "Approved",
      };
      const mapped = stageMap[a.developmentStage.toLowerCase()];
      if (mapped) { form.setValue("stage", mapped); filled.push("Stage"); }
    }
    setPrefilledFields(filled);
  }

  const blind = form.watch("blind");
  const ta = form.watch("therapeuticArea");

  return (
    <div className="px-4 sm:px-6 py-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate("/market/seller")} className="p-1.5 rounded-md hover:bg-accent/60 text-muted-foreground">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-foreground">Create Listing</h1>
          <p className="text-sm text-muted-foreground">{STEPS[step].desc}</p>
        </div>
      </div>

      <StepIndicator current={step} total={STEPS.length} />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(d => mutate({ data: d }))} className="space-y-4">
          {step === 0 && (
            <div className="rounded-xl border border-card-border bg-card p-6 space-y-4">
              <h2 className="text-sm font-bold text-foreground">{STEPS[0].title}</h2>
              <FormField control={form.control} name="therapeuticArea" render={({ field }) => (
                <FormItem>
                  <FormLabel>Therapeutic Area</FormLabel>
                  <FormControl>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger data-testid="create-listing-ta"><SelectValue placeholder="Select area" /></SelectTrigger>
                      <SelectContent>{THERAPEUTIC_AREAS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="modality" render={({ field }) => (
                <FormItem>
                  <FormLabel>Modality</FormLabel>
                  <FormControl>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger data-testid="create-listing-modality"><SelectValue placeholder="Select modality" /></SelectTrigger>
                      <SelectContent>{MODALITIES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="stage" render={({ field }) => (
                <FormItem>
                  <FormLabel>Clinical Stage</FormLabel>
                  <FormControl>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger data-testid="create-listing-stage"><SelectValue placeholder="Select stage" /></SelectTrigger>
                      <SelectContent>{STAGES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              {/* Intelligence Assist — appears once TA is selected */}
              {ta && (
                <div className="pt-2 border-t border-border/60">
                  <IntelligenceAssist
                    ta={ta}
                    linkedAsset={linkedAsset}
                    onLink={handleLinkAsset}
                    onClear={() => setLinkedAsset(null)}
                    session={session}
                  />
                </div>
              )}
            </div>
          )}

          {step === 1 && (
            <div className="rounded-xl border border-card-border bg-card p-6 space-y-4">
              <h2 className="text-sm font-bold text-foreground">{STEPS[1].title}</h2>
              {linkedAsset && (
                <div className="rounded-md border border-violet-500/20 bg-violet-500/5 px-3 py-2 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Link2 className="w-3 h-3 text-violet-500 shrink-0" />
                    <span className="text-[10px] text-muted-foreground">Linked to EdenScout: <strong className="text-foreground">{linkedAsset.assetName}</strong></span>
                  </div>
                  {prefilledFields.length > 0 && (
                    <p className="text-[10px] text-violet-600 dark:text-violet-400 pl-4.5">
                      Pre-filled: {prefilledFields.join(", ")} — edit any field to override.
                    </p>
                  )}
                </div>
              )}
              <FormField control={form.control} name="mechanism" render={({ field }) => (
                <FormItem>
                  <FormLabel>Mechanism / Science Behind the Asset</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Describe the mechanism of action and key scientific rationale…" rows={4} {...field} data-testid="create-listing-mechanism" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="milestoneHistory" render={({ field }) => (
                <FormItem>
                  <FormLabel>Milestone History <span className="text-muted-foreground text-[10px]">(optional)</span></FormLabel>
                  <FormControl>
                    <Textarea placeholder="Key development milestones, clinical results, regulatory interactions…" rows={3} {...field} data-testid="create-listing-milestones" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid sm:grid-cols-2 gap-4">
                <FormField control={form.control} name="ipStatus" render={({ field }) => (
                  <FormItem>
                    <FormLabel>IP Status <span className="text-muted-foreground text-[10px]">(optional)</span></FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. 3 granted patents, PCT pending" {...field} data-testid="create-listing-ip-status" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="ipSummary" render={({ field }) => (
                  <FormItem>
                    <FormLabel>IP Summary <span className="text-muted-foreground text-[10px]">(optional)</span></FormLabel>
                    <FormControl>
                      <Input placeholder="Key claims or coverage" {...field} data-testid="create-listing-ip-summary" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="rounded-xl border border-card-border bg-card p-6 space-y-4">
              <h2 className="text-sm font-bold text-foreground">{STEPS[2].title}</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <FormField control={form.control} name="priceRangeMin" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Min Price (USD millions) <span className="text-muted-foreground text-[10px]">(optional)</span></FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="e.g. 10" {...field} data-testid="create-listing-price-min" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="priceRangeMax" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Max Price (USD millions)</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="e.g. 50" {...field} data-testid="create-listing-price-max" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="askingPrice" render={({ field }) => (
                <FormItem>
                  <FormLabel>Asking Price / Notes <span className="text-muted-foreground text-[10px]">(optional)</span></FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Negotiable, or specific structure preferred" {...field} data-testid="create-listing-asking-price" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="engagementStatus" render={({ field }) => (
                <FormItem>
                  <FormLabel>Engagement Status</FormLabel>
                  <FormControl>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger data-testid="create-listing-engagement"><SelectValue /></SelectTrigger>
                      <SelectContent>{ENGAGEMENT_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
          )}

          {step === 3 && (
            <div className="rounded-xl border border-card-border bg-card p-6 space-y-5">
              <h2 className="text-sm font-bold text-foreground">{STEPS[3].title}</h2>
              <FormField control={form.control} name="blind" render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between rounded-lg border border-border p-4">
                    <div>
                      <FormLabel className="text-sm font-medium text-foreground cursor-pointer">Blind Listing</FormLabel>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Hide your company identity and asset name. Only TA, modality, stage, and mechanism are shown until NDA is signed.
                      </p>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="create-listing-blind-toggle" />
                    </FormControl>
                  </div>
                </FormItem>
              )} />
              {!blind && (
                <FormField control={form.control} name="assetName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Asset Name <span className="text-muted-foreground text-[10px]">(optional)</span></FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Compound X, Program ABC" {...field} data-testid="create-listing-asset-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              )}
              <div className="rounded-lg bg-violet-500/5 border border-violet-500/15 p-4 flex items-start gap-3">
                <Sparkles className="w-4 h-4 text-violet-500 shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  An AI-generated one-paragraph summary will be created from your listing details and shown to buyers in the feed. It focuses on strategic value and deal fit.
                  {linkedAsset && " Because you've linked an EdenScout record, buyers will also see an Eden Intelligence panel with market signals, related trials, and comparable deals."}
                </p>
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={handleBack} className="flex-1">
              <ChevronLeft className="w-4 h-4 mr-1" /> {step === 0 ? "Cancel" : "Back"}
            </Button>
            {step < STEPS.length - 1 ? (
              <Button
                type="button"
                className="flex-1 text-white gap-2"
                style={{ background: ACCENT }}
                onClick={handleNext}
                data-testid="create-listing-next"
              >
                Next <ChevronRight className="w-4 h-4" />
              </Button>
            ) : (
              <div className="flex flex-col sm:flex-row gap-2 flex-1">
                <Button
                  type="button"
                  variant="outline"
                  disabled={isPending}
                  className="flex-1"
                  onClick={() => form.handleSubmit(d => mutate({ data: d, asDraft: true }))()}
                  data-testid="create-listing-save-draft"
                >
                  Save as Draft
                </Button>
                <Button
                  type="button"
                  disabled={isPending}
                  className="flex-1 text-white"
                  style={{ background: ACCENT }}
                  onClick={() => form.handleSubmit(d => mutate({ data: d, asDraft: false }))()}
                  data-testid="create-listing-submit"
                >
                  {isPending ? "Submitting…" : "Submit for Review"}
                </Button>
              </div>
            )}
          </div>
        </form>
      </Form>
    </div>
  );
}
