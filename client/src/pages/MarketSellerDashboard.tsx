import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Pause, Play, Trash2, Eye, EyeOff, FileText, ShoppingBag, ChevronDown, ChevronRight, CheckCircle2, XCircle, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MarketListing } from "@shared/schema";

type ListingWithEoi = MarketListing & { eoiCount: number };

type EoiEntry = {
  id: number;
  buyerId: string | null;
  company: string | null;
  role: string | null;
  rationale: string | null;
  budgetRange: string | null;
  timeline: string | null;
  status: string;
  createdAt: string;
};

type SellerEoiGroup = {
  listingId: number;
  eois: EoiEntry[];
};

const ACCENT = "hsl(234 80% 58%)";

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  pending: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  active: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  paused: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  closed: "bg-muted text-muted-foreground border-border",
};

const EOI_STATUS_COLORS: Record<string, string> = {
  submitted: "border-border text-muted-foreground",
  viewed: "border-blue-500/30 text-blue-700 dark:text-blue-400",
  accepted: "border-emerald-500/30 text-emerald-700 dark:text-emerald-400",
  declined: "border-destructive/30 text-destructive",
};

function priceLabel(l: ListingWithEoi) {
  if (l.priceRangeMin && l.priceRangeMax) return `$${l.priceRangeMin}M – $${l.priceRangeMax}M`;
  if (l.askingPrice) return l.askingPrice;
  return "Price on request";
}

export default function MarketSellerDashboard() {
  const { session } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [expandedEois, setExpandedEois] = useState<Record<number, boolean>>({});
  const [acceptingId, setAcceptingId] = useState<number | null>(null);

  const authHeaders = {
    Authorization: `Bearer ${session!.access_token}`,
    "x-user-id": session!.user.id,
  };

  const { data: listings = [], isLoading } = useQuery<ListingWithEoi[]>({
    queryKey: ["/api/market/my-listings"],
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const res = await fetch("/api/market/my-listings", { headers: authHeaders });
      if (!res.ok) throw new Error("Failed to load listings");
      return res.json();
    },
  });

  const { data: eoiGroups = [] } = useQuery<SellerEoiGroup[]>({
    queryKey: ["/api/market/seller/eois"],
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const res = await fetch("/api/market/seller/eois", { headers: authHeaders });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const eoiMap = Object.fromEntries(eoiGroups.map(g => [g.listingId, g.eois]));

  const { mutate: updateStatus, isPending: updatingId } = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await fetch(`/api/market/listings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/market/my-listings"] }),
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const { mutate: deleteListing } = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/market/listings/${id}`, {
        method: "DELETE",
        headers: authHeaders,
      });
      if (!res.ok) throw new Error("Delete failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/market/my-listings"] });
      toast({ title: "Listing deleted" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const { mutate: acceptEoi } = useMutation({
    mutationFn: async (eoiId: number) => {
      const res = await fetch(`/api/market/eois/${eoiId}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      return res.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/market/seller/eois"] });
      qc.invalidateQueries({ queryKey: ["/api/market/deals"] });
      toast({ title: "EOI accepted", description: "Deal room created. Both parties have been notified." });
      if (data?.deal?.id) {
        navigate(`/market/deals/${data.deal.id}`);
      }
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
    onSettled: () => setAcceptingId(null),
  });

  const { mutate: declineEoi } = useMutation({
    mutationFn: async (eoiId: number) => {
      const res = await fetch(`/api/market/eois/${eoiId}/decline`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/market/seller/eois"] });
      toast({ title: "EOI declined" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const active = listings.filter(l => l.status === "active");
  const pending = listings.filter(l => l.status === "pending");

  function toggleEois(id: number) {
    setExpandedEois(prev => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <div className="px-4 sm:px-6 py-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">Seller Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage your listings and track buyer interest</p>
        </div>
        <Button
          className="gap-2 text-white shrink-0"
          style={{ background: ACCENT }}
          onClick={() => navigate("/market/create-listing")}
          data-testid="seller-dashboard-new-listing"
        >
          <Plus className="w-4 h-4" /> New Listing
        </Button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Active", value: active.length, color: "text-emerald-600" },
          { label: "Pending Review", value: pending.length, color: "text-amber-600" },
          { label: "Total EOIs", value: listings.reduce((s, l) => s + l.eoiCount, 0), color: "text-indigo-600" },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-card-border bg-card p-4 text-center">
            <p className={cn("text-2xl font-bold", s.color)}>{s.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : listings.length === 0 ? (
        <div className="text-center py-16 space-y-4">
          <ShoppingBag className="w-10 h-10 mx-auto text-muted-foreground/30" />
          <div>
            <p className="text-sm font-medium text-foreground">No listings yet</p>
            <p className="text-xs text-muted-foreground mt-1">Create your first listing to reach qualified buyers</p>
          </div>
          <Button
            className="gap-2 text-white"
            style={{ background: ACCENT }}
            onClick={() => navigate("/market/create-listing")}
            data-testid="seller-dashboard-create-first"
          >
            <Plus className="w-4 h-4" /> Create Listing
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {listings.map(l => {
            const eois = eoiMap[l.id] ?? [];
            const expanded = expandedEois[l.id] ?? false;
            return (
              <div
                key={l.id}
                className="rounded-xl border border-card-border bg-card overflow-hidden"
                data-testid={`seller-listing-card-${l.id}`}
              >
                <div className="p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {l.blind ? (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground italic">
                          <EyeOff className="w-3 h-3" /> Blind
                        </span>
                      ) : (
                        l.assetName && <span className="text-sm font-semibold text-foreground truncate">{l.assetName}</span>
                      )}
                      <Badge variant="outline" className={cn("text-[10px]", STATUS_BADGE[l.status])}>
                        {l.status.charAt(0).toUpperCase() + l.status.slice(1)}
                      </Badge>
                      {l.status === "pending" && (
                        <span className="text-[10px] text-amber-600 font-medium">Awaiting admin review</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="outline" className="text-[10px] border-border">{l.therapeuticArea}</Badge>
                      <Badge variant="outline" className="text-[10px] border-border">{l.modality}</Badge>
                      <Badge variant="outline" className="text-[10px] border-border">{l.stage}</Badge>
                      <button
                        onClick={() => toggleEois(l.id)}
                        className="flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                        data-testid={`seller-listing-eoi-toggle-${l.id}`}
                      >
                        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        <FileText className="w-3 h-3" /> {l.eoiCount} EOI{l.eoiCount !== 1 ? "s" : ""}
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{priceLabel(l)}</p>
                    {l.adminNote && (
                      <p className="text-xs text-destructive mt-1">Admin note: {l.adminNote}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={() => navigate(`/market/listing/${l.id}`)}
                      data-testid={`seller-listing-view-${l.id}`}
                    >
                      <Eye className="w-3 h-3" /> View
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={() => navigate(`/market/edit-listing/${l.id}`)}
                      data-testid={`seller-listing-edit-${l.id}`}
                    >
                      <Edit className="w-3 h-3" /> Edit
                    </Button>
                    {l.status === "draft" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1 text-indigo-600 border-indigo-500/30"
                        onClick={() => updateStatus({ id: l.id, status: "pending" })}
                        disabled={updatingId}
                        data-testid={`seller-listing-submit-${l.id}`}
                      >
                        <Play className="w-3 h-3" /> Submit for Review
                      </Button>
                    )}
                    {l.status === "active" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={() => updateStatus({ id: l.id, status: "paused" })}
                        disabled={updatingId}
                        data-testid={`seller-listing-pause-${l.id}`}
                      >
                        <Pause className="w-3 h-3" /> Pause
                      </Button>
                    )}
                    {l.status === "paused" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={() => updateStatus({ id: l.id, status: "active" })}
                        disabled={updatingId}
                        data-testid={`seller-listing-resume-${l.id}`}
                      >
                        <Play className="w-3 h-3" /> Resume
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1 text-destructive hover:text-destructive"
                      onClick={() => {
                        if (confirm("Delete this listing? This cannot be undone.")) deleteListing(l.id);
                      }}
                      data-testid={`seller-listing-delete-${l.id}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>

                {/* EOI summaries — expandable */}
                {expanded && (
                  <div className="border-t border-border">
                    {eois.length === 0 ? (
                      <p className="px-5 py-3 text-xs text-muted-foreground">No EOIs yet for this listing.</p>
                    ) : (
                      <div className="divide-y divide-border">
                        {eois.map(eoi => (
                          <div key={eoi.id} className="px-5 py-3 text-xs space-y-1 bg-muted/10" data-testid={`seller-eoi-row-${eoi.id}`}>
                            <div className="flex items-center gap-2">
                              {eoi.company && (
                                <>
                                  <span className="font-semibold text-foreground">{eoi.company}</span>
                                  <span className="text-muted-foreground">·</span>
                                  <span className="text-muted-foreground">{eoi.role}</span>
                                </>
                              )}
                              <Badge variant="outline" className={cn("text-[10px] ml-auto", EOI_STATUS_COLORS[eoi.status] ?? "border-border text-muted-foreground")}>
                                {eoi.status.charAt(0).toUpperCase() + eoi.status.slice(1)}
                              </Badge>
                            </div>
                            {eoi.rationale && (
                              <p className="text-muted-foreground line-clamp-2">{eoi.rationale}</p>
                            )}
                            <div className="flex gap-4 text-muted-foreground/70 flex-wrap">
                              {eoi.budgetRange && <span>Budget: <span className="text-foreground">{eoi.budgetRange}</span></span>}
                              {eoi.timeline && <span>Timeline: <span className="text-foreground">{eoi.timeline}</span></span>}
                              <span className="ml-auto">{new Date(eoi.createdAt).toLocaleDateString()}</span>
                            </div>
                            {/* Accept / Decline — only for submitted/viewed EOIs */}
                            {(eoi.status === "submitted" || eoi.status === "viewed") && (
                              <div className="flex gap-2 pt-1">
                                <Button
                                  size="sm"
                                  className="h-6 text-[10px] gap-1 text-white px-2"
                                  style={{ background: "hsl(142 71% 45%)" }}
                                  onClick={() => {
                                    setAcceptingId(eoi.id);
                                    acceptEoi(eoi.id);
                                  }}
                                  disabled={acceptingId === eoi.id}
                                  data-testid={`seller-eoi-accept-${eoi.id}`}
                                >
                                  <CheckCircle2 className="w-3 h-3" />
                                  {acceptingId === eoi.id ? "Accepting…" : "Accept & Create Deal Room"}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 text-[10px] gap-1 text-destructive hover:text-destructive px-2"
                                  onClick={() => {
                                    if (confirm("Decline this EOI?")) declineEoi(eoi.id);
                                  }}
                                  data-testid={`seller-eoi-decline-${eoi.id}`}
                                >
                                  <XCircle className="w-3 h-3" /> Decline
                                </Button>
                              </div>
                            )}
                            {eoi.status === "accepted" && (
                              <div className="pt-1">
                                <button
                                  className="flex items-center gap-1 text-[10px] text-indigo-600 hover:underline"
                                  onClick={() => navigate("/market/deals")}
                                  data-testid={`seller-eoi-view-deal-${eoi.id}`}
                                >
                                  <Shield className="w-3 h-3" /> View deal room →
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
