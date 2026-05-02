import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import {
  EyeOff, ChevronLeft, Send, Lock, Check,
  Building2, Beaker, Activity, DollarSign, FileText, Shield
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { MarketListing, MarketEoi } from "@shared/schema";

type ListingDetail = MarketListing & { eoiCount: number; myEoi: MarketEoi | null };

const ACCENT = "hsl(271 81% 55%)";

const ENGAGEMENT_LABELS: Record<string, string> = {
  actively_seeking: "Actively Seeking",
  quietly_inbound: "Quietly Inbound",
  under_loi: "Under LOI",
  closed: "Closed",
};

const eoiSchema = z.object({
  company: z.string().min(1, "Company name is required"),
  role: z.string().min(1, "Your role is required"),
  rationale: z.string().min(20, "Please provide a brief deal rationale (min 20 characters)"),
  budgetRange: z.string().optional(),
  timeline: z.string().optional(),
});
type EoiFormData = z.infer<typeof eoiSchema>;

function EoiSheet({
  listingId,
  onClose,
  onSuccess,
}: {
  listingId: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { session } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const form = useForm<EoiFormData>({
    resolver: zodResolver(eoiSchema),
    defaultValues: { company: "", role: "", rationale: "", budgetRange: "", timeline: "" },
  });

  const { mutate, isPending } = useMutation({
    mutationFn: async (data: EoiFormData) => {
      const res = await fetch("/api/market/eois", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session!.access_token}`,
          "x-user-id": session!.user.id,
        },
        body: JSON.stringify({ listingId, ...data }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/market/listings"] });
      qc.invalidateQueries({ queryKey: ["/api/market/listing", String(listingId)] });
      qc.invalidateQueries({ queryKey: ["/api/market/my-eois"] });
      toast({ title: "EOI submitted", description: "The seller will be notified. Your identity is kept confidential until mutual agreement." });
      onSuccess();
    },
    onError: (err: Error) => {
      toast({ title: "Submission failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4">
      <div className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-base font-bold text-foreground">Submit Expression of Interest</h2>
          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
            <Lock className="w-3 h-3" /> Your identity is confidential until both parties agree to connect
          </p>
        </div>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(d => mutate(d))} className="p-6 space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <FormField control={form.control} name="company" render={({ field }) => (
                <FormItem>
                  <FormLabel>Company</FormLabel>
                  <FormControl><Input placeholder="Acme Pharma" {...field} data-testid="eoi-company" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="role" render={({ field }) => (
                <FormItem>
                  <FormLabel>Your Role</FormLabel>
                  <FormControl><Input placeholder="VP Business Development" {...field} data-testid="eoi-role" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="rationale" render={({ field }) => (
              <FormItem>
                <FormLabel>Deal Rationale</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Describe your strategic interest in this asset and how it fits your portfolio…"
                    rows={4}
                    {...field}
                    data-testid="eoi-rationale"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <div className="grid sm:grid-cols-2 gap-4">
              <FormField control={form.control} name="budgetRange" render={({ field }) => (
                <FormItem>
                  <FormLabel>Budget Range <span className="text-muted-foreground text-[10px]">(optional)</span></FormLabel>
                  <FormControl><Input placeholder="e.g. $20M–$50M" {...field} data-testid="eoi-budget" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="timeline" render={({ field }) => (
                <FormItem>
                  <FormLabel>Timeline <span className="text-muted-foreground text-[10px]">(optional)</span></FormLabel>
                  <FormControl><Input placeholder="e.g. Q3 2026" {...field} data-testid="eoi-timeline" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
              <Button
                type="submit"
                disabled={isPending}
                className="flex-1 text-white gap-2"
                style={{ background: ACCENT }}
                data-testid="eoi-submit-btn"
              >
                {isPending ? "Submitting…" : <><Send className="w-3.5 h-3.5" /> Submit EOI</>}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}

function DetailRow({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="w-3.5 h-3.5 text-violet-500" />
      </div>
      <div>
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-sm text-foreground mt-0.5 leading-relaxed">{value}</p>
      </div>
    </div>
  );
}

export default function MarketListingDetail() {
  const { id } = useParams<{ id: string }>();
  const { session } = useAuth();
  const [, navigate] = useLocation();
  const [showEoi, setShowEoi] = useState(false);

  const { data: listing, isLoading, refetch } = useQuery<ListingDetail>({
    queryKey: ["/api/market/listing", id],
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const res = await fetch(`/api/market/listings/${id}`, {
        headers: { Authorization: `Bearer ${session!.access_token}`, "x-user-id": session!.user.id },
      });
      if (!res.ok) throw new Error("Failed to load listing");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="px-6 py-16 text-center text-muted-foreground">
        <p className="text-sm">Listing not found.</p>
        <button onClick={() => navigate("/market")} className="text-xs text-violet-500 hover:underline mt-2">← Back to listings</button>
      </div>
    );
  }

  const priceLabel = listing.priceRangeMin && listing.priceRangeMax
    ? `$${listing.priceRangeMin}M – $${listing.priceRangeMax}M`
    : listing.askingPrice ?? "Price on request";

  const isSeller = listing.sellerId === session?.user.id;

  return (
    <div className="px-4 sm:px-6 py-6 max-w-3xl mx-auto space-y-6">
      <button
        onClick={() => navigate("/market")}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        data-testid="market-listing-back"
      >
        <ChevronLeft className="w-3.5 h-3.5" /> Back to listings
      </button>

      <div className="rounded-xl border border-card-border bg-card p-6 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            {listing.blind && !isSeller ? (
              <div className="flex items-center gap-2 mb-2">
                <EyeOff className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-semibold text-muted-foreground italic">Confidential Listing</span>
              </div>
            ) : listing.assetName ? (
              <h1 className="text-xl font-bold text-foreground mb-2">{listing.assetName}</h1>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="border-border">{listing.therapeuticArea}</Badge>
              <Badge variant="outline" className="border-border">{listing.modality}</Badge>
              <Badge variant="outline" className="border-border">{listing.stage}</Badge>
              <Badge
                variant="outline"
                className={cn(
                  "border",
                  listing.engagementStatus === "actively_seeking" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "border-border"
                )}
              >
                {ENGAGEMENT_LABELS[listing.engagementStatus] ?? listing.engagementStatus}
              </Badge>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-lg font-bold text-foreground">{priceLabel}</p>
            {listing.eoiCount > 0 && (
              <p className="text-xs text-muted-foreground">{listing.eoiCount} EOI{listing.eoiCount !== 1 ? "s" : ""} submitted</p>
            )}
          </div>
        </div>

        {/* AI Summary */}
        {listing.aiSummary && (
          <div className="rounded-lg bg-violet-500/5 border border-violet-500/15 p-4">
            <p className="text-xs font-semibold text-violet-600 dark:text-violet-400 mb-1.5 uppercase tracking-wide">AI Summary</p>
            <p className="text-sm text-foreground leading-relaxed">{listing.aiSummary}</p>
          </div>
        )}

        {/* Detail fields */}
        <div className="space-y-4">
          <DetailRow icon={Activity} label="Mechanism / Science" value={listing.mechanism} />
          <DetailRow icon={FileText} label="Milestone History" value={listing.milestoneHistory} />
          <DetailRow icon={Shield} label="IP Status" value={listing.ipStatus} />
          {listing.ipSummary && <DetailRow icon={Shield} label="IP Summary" value={listing.ipSummary} />}
        </div>

        {/* EOI section */}
        {!isSeller && (
          <div className="pt-4 border-t border-border">
            {listing.myEoi ? (
              <div className="flex items-center gap-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20 p-4">
                <Check className="w-5 h-5 text-emerald-600" />
                <div>
                  <p className="text-sm font-semibold text-foreground">EOI Submitted</p>
                  <p className="text-xs text-muted-foreground">Status: <span className="capitalize">{listing.myEoi.status}</span></p>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-foreground">Interested in this asset?</p>
                  <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                    <Lock className="w-3 h-3" /> Your identity stays confidential until both parties agree
                  </p>
                </div>
                <Button
                  className="text-white gap-2 shrink-0"
                  style={{ background: ACCENT }}
                  onClick={() => setShowEoi(true)}
                  data-testid="market-listing-submit-eoi"
                >
                  <Send className="w-3.5 h-3.5" /> Submit EOI
                </Button>
              </div>
            )}
          </div>
        )}

        {isSeller && (
          <div className="pt-4 border-t border-border">
            <p className="text-xs text-muted-foreground">This is your listing. View it from your <button onClick={() => navigate("/market/seller")} className="text-violet-500 hover:underline">Seller Dashboard</button>.</p>
          </div>
        )}
      </div>

      {showEoi && (
        <EoiSheet
          listingId={listing.id}
          onClose={() => setShowEoi(false)}
          onSuccess={() => { setShowEoi(false); refetch(); }}
        />
      )}
    </div>
  );
}
