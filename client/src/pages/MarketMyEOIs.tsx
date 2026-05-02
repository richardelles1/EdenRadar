import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronRight, EyeOff, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MarketEoi, MarketListing } from "@shared/schema";

type EoiWithListing = MarketEoi & { listing: MarketListing | null };

const STATUS_COLORS: Record<string, string> = {
  submitted: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  viewed: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  accepted: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  declined: "bg-destructive/10 text-destructive border-destructive/20",
};

export default function MarketMyEOIs() {
  const { session } = useAuth();
  const [, navigate] = useLocation();

  const { data: eois = [], isLoading } = useQuery<EoiWithListing[]>({
    queryKey: ["/api/market/my-eois"],
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const res = await fetch("/api/market/my-eois", {
        headers: { Authorization: `Bearer ${session!.access_token}`, "x-user-id": session!.user.id },
      });
      if (!res.ok) throw new Error("Failed to load EOIs");
      return res.json();
    },
  });

  return (
    <div className="px-4 sm:px-6 py-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">My Expressions of Interest</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Track your submitted EOIs and their status</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : eois.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <FileText className="w-10 h-10 mx-auto text-muted-foreground/30" />
          <div>
            <p className="text-sm font-medium text-foreground">No EOIs submitted yet</p>
            <p className="text-xs text-muted-foreground mt-1">Browse listings and submit your first EOI</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/market")}
            data-testid="my-eois-browse-cta"
          >
            Browse Listings
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {eois.map(eoi => {
            const l = eoi.listing;
            return (
              <div
                key={eoi.id}
                className="rounded-xl border border-card-border bg-card p-5 flex flex-col sm:flex-row sm:items-center gap-4"
                data-testid={`my-eoi-card-${eoi.id}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {l ? (
                      l.blind ? (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground italic">
                          <EyeOff className="w-3 h-3" /> Confidential Listing
                        </span>
                      ) : (
                        <span className="text-sm font-semibold text-foreground truncate">
                          {l.assetName ?? `Listing #${l.id}`}
                        </span>
                      )
                    ) : (
                      <span className="text-sm text-muted-foreground">Listing removed</span>
                    )}
                    <Badge variant="outline" className={cn("text-[10px] capitalize", STATUS_COLORS[eoi.status])}>
                      {eoi.status}
                    </Badge>
                  </div>
                  {l && (
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="outline" className="text-[10px] border-border">{l.therapeuticArea}</Badge>
                      <Badge variant="outline" className="text-[10px] border-border">{l.modality}</Badge>
                      <Badge variant="outline" className="text-[10px] border-border">{l.stage}</Badge>
                    </div>
                  )}
                  <div className="mt-2 text-xs text-muted-foreground space-y-0.5">
                    <p><span className="font-medium text-foreground">Company:</span> {eoi.company}</p>
                    <p><span className="font-medium text-foreground">Rationale:</span> {eoi.rationale.slice(0, 100)}{eoi.rationale.length > 100 ? "…" : ""}</p>
                    {eoi.budgetRange && <p><span className="font-medium text-foreground">Budget:</span> {eoi.budgetRange}</p>}
                    {eoi.timeline && <p><span className="font-medium text-foreground">Timeline:</span> {eoi.timeline}</p>}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1.5">
                    Submitted {new Date(eoi.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                </div>
                {l && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1 shrink-0"
                    onClick={() => navigate(`/market/listing/${l.id}`)}
                    data-testid={`my-eoi-view-listing-${eoi.id}`}
                  >
                    View Listing <ChevronRight className="w-3 h-3" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
