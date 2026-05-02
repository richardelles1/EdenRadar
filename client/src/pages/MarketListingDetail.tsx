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
  Building2, Beaker, Activity, DollarSign, FileText, Shield,
  Sparkles, ChevronDown, ChevronUp, FlaskConical, BookOpen, ExternalLink,
  Microscope, Lightbulb, TrendingUp, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { MarketListing, MarketEoi } from "@shared/schema";

type ListingDetail = MarketListing & { eoiCount: number; myEoi: MarketEoi | null };

type IntelligenceData = {
  relatedTtoAssets: Array<{
    id: number; assetName: string; institution: string | null;
    modality: string; developmentStage: string; indication: string | null; completenessScore: number | null;
  }>;
  activeTrials: Array<{
    title: string; url: string; date: string; stage: string | null; sponsor: string | null;
  }>;
  relatedPatents: Array<{
    title: string; url: string; date: string; owner: string | null;
  }>;
  comparableDeals: Array<{
    id: number; assetName: string; institution: string | null;
    modality: string; developmentStage: string; licensingReadiness: string | null;
  }>;
  edenEnrichment: {
    assetName: string; institution: string | null; target: string | null;
    mechanismOfAction: string | null; innovationClaim: string | null; unmetNeed: string | null;
    comparableDrugs: string | null; licensingReadiness: string | null;
    completenessScore: number | null; ipType: string | null; sourceUrl: string | null;
  } | null;
  linkedAssetId: number | null;
};

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

function IntelligenceItem({ title, subtitle, meta, href }: { title: string; subtitle?: string | null; meta?: string | null; href?: string | null }) {
  return (
    <div className="flex items-start gap-2 py-2 border-b border-border/50 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground leading-snug line-clamp-2">{title}</p>
        {subtitle && <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{subtitle}</p>}
        {meta && <p className="text-[10px] text-violet-500/80 mt-0.5">{meta}</p>}
      </div>
      {href && (
        <a href={href} target="_blank" rel="noopener noreferrer" className="shrink-0 mt-0.5 text-muted-foreground hover:text-foreground" onClick={e => e.stopPropagation()}>
          <ExternalLink className="w-3 h-3" />
        </a>
      )}
    </div>
  );
}

function IntelSection({ icon: Icon, title, children, count }: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
  count?: number;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-border/60 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-accent/30 hover:bg-accent/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Icon className="w-3.5 h-3.5 text-violet-500" />
          <span className="text-xs font-semibold text-foreground">{title}</span>
          {count !== undefined && <span className="text-[10px] text-muted-foreground">({count})</span>}
        </div>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
      </button>
      {open && <div className="px-3 py-1">{children}</div>}
    </div>
  );
}

function EdenIntelligenceSidebar({ listingId }: { listingId: number }) {
  const { session } = useAuth();
  const [open, setOpen] = useState(true);

  const { data: intel, isLoading } = useQuery<IntelligenceData>({
    queryKey: ["/api/market/listings/intelligence", listingId],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await fetch(`/api/market/listings/${listingId}/intelligence`, {
        headers: { Authorization: `Bearer ${session!.access_token}`, "x-user-id": session!.user.id },
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  return (
    <div className="rounded-xl border border-violet-500/20 bg-card overflow-hidden" data-testid="eden-intelligence-sidebar">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 px-4 py-3 bg-violet-500/5 hover:bg-violet-500/10 transition-colors border-b border-violet-500/15"
      >
        <Sparkles className="w-4 h-4 text-violet-500 shrink-0" />
        <div className="flex-1 text-left">
          <p className="text-xs font-bold text-foreground">Eden Intelligence</p>
          <p className="text-[10px] text-muted-foreground">EdenScout-powered market signals</p>
        </div>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
      </button>

      {open && (
        <div className="p-3 space-y-2.5">
          {isLoading && (
            <div className="flex items-center gap-2 py-4 justify-center">
              <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-muted-foreground">Loading intelligence…</span>
            </div>
          )}

          {intel && (
            <>
              {/* EDEN Enrichment */}
              {intel.edenEnrichment && (
                <IntelSection icon={Sparkles} title="EDEN Enrichment" count={1}>
                  <div className="py-2 space-y-2">
                    {intel.edenEnrichment.institution && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Institution</p>
                        <p className="text-xs text-foreground">{intel.edenEnrichment.institution}</p>
                      </div>
                    )}
                    {intel.edenEnrichment.mechanismOfAction && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Mechanism</p>
                        <p className="text-xs text-foreground leading-relaxed line-clamp-3">{intel.edenEnrichment.mechanismOfAction}</p>
                      </div>
                    )}
                    {intel.edenEnrichment.innovationClaim && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Innovation Claim</p>
                        <p className="text-xs text-foreground leading-relaxed line-clamp-3">{intel.edenEnrichment.innovationClaim}</p>
                      </div>
                    )}
                    {intel.edenEnrichment.unmetNeed && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Unmet Need</p>
                        <p className="text-xs text-foreground leading-relaxed line-clamp-3">{intel.edenEnrichment.unmetNeed}</p>
                      </div>
                    )}
                    {intel.edenEnrichment.licensingReadiness && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Licensing Readiness</p>
                        <p className="text-xs font-medium text-violet-600 dark:text-violet-400">{intel.edenEnrichment.licensingReadiness}</p>
                      </div>
                    )}
                    {intel.edenEnrichment.completenessScore != null && (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-border overflow-hidden">
                          <div className="h-full rounded-full bg-violet-500 transition-all" style={{ width: `${intel.edenEnrichment.completenessScore}%` }} />
                        </div>
                        <span className="text-[10px] text-muted-foreground shrink-0">{intel.edenEnrichment.completenessScore}% complete</span>
                      </div>
                    )}
                    {intel.edenEnrichment.sourceUrl && (
                      <a href={intel.edenEnrichment.sourceUrl} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[10px] text-violet-500 hover:underline"
                        onClick={e => e.stopPropagation()}>
                        <ExternalLink className="w-3 h-3" /> Source
                      </a>
                    )}
                  </div>
                </IntelSection>
              )}

              {/* Related TTO Assets */}
              {intel.relatedTtoAssets.length > 0 && (
                <IntelSection icon={Microscope} title="Related TTO Assets" count={intel.relatedTtoAssets.length}>
                  {intel.relatedTtoAssets.map(a => (
                    <IntelligenceItem
                      key={a.id}
                      title={a.assetName}
                      subtitle={a.institution ? `${a.institution} · ${a.developmentStage}` : a.developmentStage}
                      meta={a.modality}
                    />
                  ))}
                </IntelSection>
              )}

              {/* Active Clinical Trials */}
              {intel.activeTrials.length > 0 && (
                <IntelSection icon={FlaskConical} title="Active Clinical Trials" count={intel.activeTrials.length}>
                  {intel.activeTrials.map((t, i) => (
                    <IntelligenceItem
                      key={i}
                      title={t.title}
                      subtitle={t.sponsor ?? undefined}
                      meta={[t.stage, t.date].filter(Boolean).join(" · ")}
                      href={t.url}
                    />
                  ))}
                </IntelSection>
              )}

              {/* Related Patents */}
              {intel.relatedPatents.length > 0 && (
                <IntelSection icon={Shield} title="Related Patents" count={intel.relatedPatents.length}>
                  {intel.relatedPatents.map((p, i) => (
                    <IntelligenceItem
                      key={i}
                      title={p.title}
                      subtitle={p.owner ?? undefined}
                      meta={p.date}
                      href={p.url}
                    />
                  ))}
                </IntelSection>
              )}

              {/* Comparable Deals */}
              {intel.comparableDeals.length > 0 && (
                <IntelSection icon={TrendingUp} title="Comparable Deals" count={intel.comparableDeals.length}>
                  {intel.comparableDeals.map(d => (
                    <IntelligenceItem
                      key={d.id}
                      title={d.assetName}
                      subtitle={d.institution ? `${d.institution} · ${d.developmentStage}` : d.developmentStage}
                      meta={d.licensingReadiness ?? undefined}
                    />
                  ))}
                </IntelSection>
              )}

              {!intel.edenEnrichment &&
               !intel.relatedTtoAssets.length &&
               !intel.activeTrials.length &&
               !intel.relatedPatents.length &&
               !intel.comparableDeals.length && (
                <p className="text-xs text-muted-foreground text-center py-3">No intelligence signals found for this listing.</p>
              )}
            </>
          )}
        </div>
      )}
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
    <div className="px-4 sm:px-6 py-6 max-w-6xl mx-auto space-y-6">
      <button
        onClick={() => navigate("/market")}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        data-testid="market-listing-back"
      >
        <ChevronLeft className="w-3.5 h-3.5" /> Back to listings
      </button>

      <div className="grid lg:grid-cols-[1fr_320px] gap-6 items-start">
        {/* Main listing card */}
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

        {/* Eden Intelligence sidebar */}
        <div className="space-y-3">
          <EdenIntelligenceSidebar listingId={listing.id} />
        </div>
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
