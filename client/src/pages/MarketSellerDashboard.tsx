import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Pause, Play, Trash2, Eye, EyeOff, FileText, ShoppingBag } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MarketListing } from "@shared/schema";

type ListingWithEoi = MarketListing & { eoiCount: number };

const ACCENT = "hsl(271 81% 55%)";

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  pending: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  active: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  paused: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  closed: "bg-muted text-muted-foreground border-border",
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

  const { data: listings = [], isLoading } = useQuery<ListingWithEoi[]>({
    queryKey: ["/api/market/my-listings"],
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const res = await fetch("/api/market/my-listings", {
        headers: { Authorization: `Bearer ${session!.access_token}`, "x-user-id": session!.user.id },
      });
      if (!res.ok) throw new Error("Failed to load listings");
      return res.json();
    },
  });

  const { mutate: updateStatus, isPending: updatingId } = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await fetch(`/api/market/listings/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session!.access_token}`,
          "x-user-id": session!.user.id,
        },
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
        headers: { Authorization: `Bearer ${session!.access_token}`, "x-user-id": session!.user.id },
      });
      if (!res.ok) throw new Error("Delete failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/market/my-listings"] });
      toast({ title: "Listing deleted" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const active = listings.filter(l => l.status === "active");
  const pending = listings.filter(l => l.status === "pending");
  const paused = listings.filter(l => l.status === "paused");

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
          { label: "Total EOIs", value: listings.reduce((s, l) => s + l.eoiCount, 0), color: "text-violet-600" },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-card-border bg-card p-4 text-center">
            <p className={cn("text-2xl font-bold", s.color)}>{s.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
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
          {listings.map(l => (
            <div
              key={l.id}
              className="rounded-xl border border-card-border bg-card p-5 flex flex-col sm:flex-row sm:items-center gap-4"
              data-testid={`seller-listing-card-${l.id}`}
            >
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
                  <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                    <FileText className="w-3 h-3" /> {l.eoiCount} EOI{l.eoiCount !== 1 ? "s" : ""}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{priceLabel(l)}</p>
                {l.adminNote && (
                  <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                    Admin note: {l.adminNote}
                  </p>
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
                {l.status === "active" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => updateStatus({ id: l.id, status: "paused" })}
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
          ))}
        </div>
      )}
    </div>
  );
}
