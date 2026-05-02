import { useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { ChevronLeft, Save } from "lucide-react";
import type { MarketListing } from "@shared/schema";

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

const editSchema = z.object({
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

type EditFormData = z.infer<typeof editSchema>;

export default function MarketEditListing() {
  const { id } = useParams<{ id: string }>();
  const { session } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: listing, isLoading } = useQuery<MarketListing>({
    queryKey: ["/api/market/listing", id],
    queryFn: async () => {
      const res = await fetch(`/api/market/listings/${id}`, {
        headers: { Authorization: `Bearer ${session!.access_token}`, "x-user-id": session!.user.id },
      });
      if (!res.ok) throw new Error("Failed to load listing");
      return res.json();
    },
    enabled: !!id && !!session,
  });

  const form = useForm<EditFormData>({
    resolver: zodResolver(editSchema),
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

  useEffect(() => {
    if (listing) {
      form.reset({
        therapeuticArea: listing.therapeuticArea ?? "",
        modality: listing.modality ?? "",
        stage: listing.stage ?? "",
        mechanism: listing.mechanism ?? "",
        milestoneHistory: listing.milestoneHistory ?? "",
        ipStatus: listing.ipStatus ?? "",
        ipSummary: listing.ipSummary ?? "",
        priceRangeMin: listing.priceRangeMin != null ? String(listing.priceRangeMin) : "",
        priceRangeMax: listing.priceRangeMax != null ? String(listing.priceRangeMax) : "",
        askingPrice: listing.askingPrice ?? "",
        engagementStatus: listing.engagementStatus ?? "actively_seeking",
        blind: listing.blind ?? false,
        assetName: listing.assetName ?? "",
      });
    }
  }, [listing]);

  const { mutate, isPending } = useMutation({
    mutationFn: async (data: EditFormData) => {
      const payload = {
        ...data,
        priceRangeMin: data.priceRangeMin ? parseInt(data.priceRangeMin, 10) : undefined,
        priceRangeMax: data.priceRangeMax ? parseInt(data.priceRangeMax, 10) : undefined,
      };
      const res = await fetch(`/api/market/listings/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session!.access_token}`,
          "x-user-id": session!.user.id,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/market/my-listings"] });
      qc.invalidateQueries({ queryKey: ["/api/market/listing", id] });
      toast({ title: "Listing updated", description: "Your changes have been saved." });
      navigate("/market/seller");
    },
    onError: (err: Error) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  const blind = form.watch("blind");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="px-6 py-10 text-center">
        <p className="text-sm text-muted-foreground">Listing not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/market/seller")}>Back to Dashboard</Button>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 py-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate("/market/seller")} className="p-1.5 rounded-md hover:bg-accent/60 text-muted-foreground">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-foreground">Edit Listing</h1>
          <p className="text-sm text-muted-foreground">Update your listing details</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(d => mutate(d))} className="space-y-4">
          <div className="rounded-xl border border-card-border bg-card p-6 space-y-4">
            <h2 className="text-sm font-bold text-foreground">Basic Info</h2>
            <FormField control={form.control} name="therapeuticArea" render={({ field }) => (
              <FormItem>
                <FormLabel>Therapeutic Area</FormLabel>
                <FormControl>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger data-testid="edit-listing-ta"><SelectValue placeholder="Select area" /></SelectTrigger>
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
                    <SelectTrigger data-testid="edit-listing-modality"><SelectValue placeholder="Select modality" /></SelectTrigger>
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
                    <SelectTrigger data-testid="edit-listing-stage"><SelectValue placeholder="Select stage" /></SelectTrigger>
                    <SelectContent>{STAGES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </div>

          <div className="rounded-xl border border-card-border bg-card p-6 space-y-4">
            <h2 className="text-sm font-bold text-foreground">Asset Details</h2>
            <FormField control={form.control} name="mechanism" render={({ field }) => (
              <FormItem>
                <FormLabel>Mechanism / Science Behind the Asset</FormLabel>
                <FormControl>
                  <Textarea placeholder="Describe the mechanism of action…" rows={4} {...field} data-testid="edit-listing-mechanism" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="milestoneHistory" render={({ field }) => (
              <FormItem>
                <FormLabel>Milestone History <span className="text-muted-foreground text-[10px]">(optional)</span></FormLabel>
                <FormControl>
                  <Textarea placeholder="Key development milestones…" rows={3} {...field} data-testid="edit-listing-milestones" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <div className="grid sm:grid-cols-2 gap-4">
              <FormField control={form.control} name="ipStatus" render={({ field }) => (
                <FormItem>
                  <FormLabel>IP Status <span className="text-muted-foreground text-[10px]">(optional)</span></FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. 3 granted patents" {...field} data-testid="edit-listing-ip-status" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="ipSummary" render={({ field }) => (
                <FormItem>
                  <FormLabel>IP Summary <span className="text-muted-foreground text-[10px]">(optional)</span></FormLabel>
                  <FormControl>
                    <Input placeholder="Key claims or coverage" {...field} data-testid="edit-listing-ip-summary" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
          </div>

          <div className="rounded-xl border border-card-border bg-card p-6 space-y-4">
            <h2 className="text-sm font-bold text-foreground">Commercial Terms</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <FormField control={form.control} name="priceRangeMin" render={({ field }) => (
                <FormItem>
                  <FormLabel>Min Price (USD millions) <span className="text-muted-foreground text-[10px]">(optional)</span></FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="e.g. 10" {...field} data-testid="edit-listing-price-min" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="priceRangeMax" render={({ field }) => (
                <FormItem>
                  <FormLabel>Max Price (USD millions)</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="e.g. 50" {...field} data-testid="edit-listing-price-max" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="askingPrice" render={({ field }) => (
              <FormItem>
                <FormLabel>Asking Price / Notes <span className="text-muted-foreground text-[10px]">(optional)</span></FormLabel>
                <FormControl>
                  <Input placeholder="e.g. Negotiable" {...field} data-testid="edit-listing-asking-price" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="engagementStatus" render={({ field }) => (
              <FormItem>
                <FormLabel>Engagement Status</FormLabel>
                <FormControl>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger data-testid="edit-listing-engagement"><SelectValue /></SelectTrigger>
                    <SelectContent>{ENGAGEMENT_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                  </Select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </div>

          <div className="rounded-xl border border-card-border bg-card p-6 space-y-4">
            <h2 className="text-sm font-bold text-foreground">Confidentiality</h2>
            <FormField control={form.control} name="blind" render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between rounded-lg border border-border p-4">
                  <div>
                    <FormLabel className="text-sm font-medium text-foreground cursor-pointer">Blind Listing</FormLabel>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Hide your company identity and asset name from buyers.
                    </p>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="edit-listing-blind-toggle" />
                  </FormControl>
                </div>
              </FormItem>
            )} />
            {!blind && (
              <FormField control={form.control} name="assetName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Asset Name <span className="text-muted-foreground text-[10px]">(optional)</span></FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Compound X, Program ABC" {...field} data-testid="edit-listing-asset-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            )}
          </div>

          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={() => navigate("/market/seller")} className="flex-1">
              <ChevronLeft className="w-4 h-4 mr-1" /> Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="flex-1 text-white gap-2"
              style={{ background: ACCENT }}
              data-testid="edit-listing-save"
            >
              <Save className="w-4 h-4" />
              {isPending ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
