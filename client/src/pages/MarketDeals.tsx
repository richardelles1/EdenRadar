import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Shield, ArrowRight, Lock, Unlock } from "lucide-react";
import type { MarketDeal } from "@shared/schema";

const ACCENT = "hsl(234 80% 58%)";

const STATUS_LABELS: Record<string, string> = {
  nda_pending: "NDA Pending",
  nda_signed: "NDA Signed",
  due_diligence: "Due Diligence",
  term_sheet: "Term Sheet",
  loi: "Letter of Intent",
  closed: "Closed",
  paused: "Paused",
};

const STATUS_COLORS: Record<string, string> = {
  nda_pending: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  nda_signed: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  due_diligence: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/20",
  term_sheet: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20",
  loi: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  closed: "bg-emerald-600/10 text-emerald-800 dark:text-emerald-300 border-emerald-600/20",
  paused: "bg-muted text-muted-foreground border-border",
};

export default function MarketDeals() {
  const { session } = useAuth();
  const [, navigate] = useLocation();
  const userId = session?.user.id ?? "";

  const authHeaders = {
    Authorization: `Bearer ${session!.access_token}`,
    "x-user-id": userId,
  };

  const { data: deals = [], isLoading } = useQuery<MarketDeal[]>({
    queryKey: ["/api/market/deals"],
    queryFn: async () => {
      const res = await fetch("/api/market/deals", { headers: authHeaders });
      if (!res.ok) throw new Error("Failed to load deals");
      return res.json();
    },
    staleTime: 30000,
  });

  return (
    <div className="px-4 sm:px-6 py-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">My Deals</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Active deal rooms where you are a party</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : deals.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <Shield className="w-10 h-10 mx-auto text-muted-foreground/30" />
          <div>
            <p className="text-sm font-medium text-foreground">No active deals</p>
            <p className="text-xs text-muted-foreground mt-1">
              Deals appear here when a seller accepts your EOI or a buyer accepts your listing EOI.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/market")}
          >
            Browse Listings
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {deals.map(deal => {
            const isSeller = deal.sellerId === userId;
            const ndaUnlocked = !!deal.ndaSignedAt;
            return (
              <div
                key={deal.id}
                className="rounded-xl border border-card-border bg-card p-5 flex items-center gap-4"
                data-testid={`deal-card-${deal.id}`}
              >
                <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: `${ACCENT}20` }}>
                  <Shield className="w-4 h-4" style={{ color: ACCENT }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-foreground">Deal #{deal.id}</span>
                    <Badge variant="outline" className={cn("text-[10px]", STATUS_COLORS[deal.status] ?? "border-border text-muted-foreground")}>
                      {STATUS_LABELS[deal.status] ?? deal.status}
                    </Badge>
                    {ndaUnlocked ? (
                      <span className="flex items-center gap-0.5 text-[10px] text-emerald-600">
                        <Unlock className="w-2.5 h-2.5" /> Unlocked
                      </span>
                    ) : (
                      <span className="flex items-center gap-0.5 text-[10px] text-amber-600">
                        <Lock className="w-2.5 h-2.5" /> NDA pending
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {isSeller ? "You are the seller" : "You are the buyer"} · Created {new Date(deal.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1 shrink-0"
                  onClick={() => navigate(`/market/deals/${deal.id}`)}
                  data-testid={`deal-open-${deal.id}`}
                >
                  Open <ArrowRight className="w-3 h-3" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
