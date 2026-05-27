import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ArrowLeft, BarChart3, TrendingUp, CheckCircle2, Clock, XCircle, DollarSign } from "lucide-react";

const ACCENT = "hsl(234 80% 58%)";

type PerListing = {
  listing: { id: number; therapeuticArea: string; modality: string; stage: string; assetName: string | null; blind: boolean; status: string };
  eoiCount: number;
  eoiByStatus: { submitted: number; accepted: number; declined: number };
  dealCount: number;
  activeDealCount: number;
  closedDealCount: number;
  avgDaysToEoi: number | null;
};

type AnalyticsData = {
  perListing: PerListing[];
  totals: {
    listings: number;
    eois: number;
    eoiByStatus: { submitted: number; viewed: number; accepted: number; declined: number };
    deals: number;
    closed: number;
  };
  taInterest: Record<string, number>;
  successFeeCollected: number;
};

function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-card-border bg-card p-4">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
      <p className={cn("text-2xl font-bold", accent ? "text-indigo-600 dark:text-indigo-400" : "text-foreground")}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

export default function MarketSellerAnalytics() {
  const { session } = useAuth();
  const [, navigate] = useLocation();

  const authHeaders = {
    Authorization: `Bearer ${session!.access_token}`,
    "x-user-id": session!.user.id,
  };

  const { data, isLoading } = useQuery<AnalyticsData>({
    queryKey: ["/api/market/seller/analytics"],
    queryFn: async () => {
      const res = await fetch("/api/market/seller/analytics", { headers: authHeaders });
      if (!res.ok) throw new Error("Failed to load analytics");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) return null;

  const { totals, perListing, taInterest, successFeeCollected } = data;
  const conversionRate = totals.eois > 0 ? Math.round((totals.eoiByStatus.accepted / totals.eois) * 100) : 0;

  // Sort TA interest descending
  const taEntries = Object.entries(taInterest).sort((a, b) => b[1] - a[1]);
  const maxTa = taEntries.length > 0 ? taEntries[0][1] : 1;

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur px-4 sm:px-6 py-3 flex items-center gap-3">
        <button onClick={() => navigate("/market/seller")} className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4" style={{ color: ACCENT }} />
          <span className="font-semibold text-foreground text-sm">Seller Analytics</span>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* Summary stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Total Listings" value={totals.listings} />
          <StatCard label="Total EOIs" value={totals.eois} sub="expressions of interest received" />
          <StatCard label="Acceptance Rate" value={`${conversionRate}%`} sub={`${totals.eoiByStatus.accepted} of ${totals.eois} EOIs accepted`} accent />
          <StatCard label="Deals Closed" value={totals.closed} sub={successFeeCollected > 0 ? `$${(successFeeCollected / 1000).toFixed(0)}k in fees collected` : "No closed deals yet"} />
        </div>

        {/* EOI funnel */}
        <div className="rounded-xl border border-card-border bg-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">EOI Funnel</span>
          </div>
          <div className="space-y-2">
            {[
              { label: "Received", count: totals.eois, icon: <Clock className="w-3 h-3" />, color: "bg-muted-foreground/30" },
              { label: "Accepted", count: totals.eoiByStatus.accepted, icon: <CheckCircle2 className="w-3 h-3 text-emerald-600" />, color: "bg-emerald-500" },
              { label: "Declined", count: totals.eoiByStatus.declined, icon: <XCircle className="w-3 h-3 text-destructive" />, color: "bg-destructive/70" },
              { label: "Deals Active", count: totals.deals - totals.closed, icon: <TrendingUp className="w-3 h-3" style={{ color: ACCENT }} />, color: "bg-indigo-500" },
              { label: "Deals Closed", count: totals.closed, icon: <CheckCircle2 className="w-3 h-3 text-emerald-700" />, color: "bg-emerald-700" },
            ].map(({ label, count, icon, color }) => (
              <div key={label} className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 w-28 shrink-0 text-xs text-muted-foreground">
                  {icon}
                  <span>{label}</span>
                </div>
                <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                  <div className={cn("h-2 rounded-full transition-all", color)} style={{ width: totals.eois > 0 ? `${(count / totals.eois) * 100}%` : "0%" }} />
                </div>
                <span className="text-xs font-semibold text-foreground w-6 text-right">{count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* TA Interest heatmap */}
        {taEntries.length > 0 && (
          <div className="rounded-xl border border-card-border bg-card p-5 space-y-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">Interest by Therapeutic Area</span>
            </div>
            <div className="space-y-2">
              {taEntries.map(([ta, count]) => (
                <div key={ta} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-40 truncate shrink-0">{ta}</span>
                  <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                    <div className="h-2 rounded-full transition-all" style={{ width: `${(count / maxTa) * 100}%`, background: ACCENT }} />
                  </div>
                  <span className="text-xs font-semibold text-foreground w-6 text-right">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Per-listing breakdown */}
        {perListing.length > 0 && (
          <div className="rounded-xl border border-card-border bg-card p-5 space-y-4">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">Per-Listing Performance</span>
            </div>
            <div className="space-y-3">
              {perListing.map(({ listing: l, eoiCount, eoiByStatus, dealCount, activeDealCount, closedDealCount, avgDaysToEoi }) => (
                <div key={l.id} className="rounded-lg border border-border p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">
                        {l.blind ? `[Blind] ${l.therapeuticArea} · ${l.modality}` : (l.assetName || `${l.therapeuticArea} · ${l.modality}`)}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        <Badge variant="outline" className="text-[9px] px-1 py-0">{l.stage}</Badge>
                        <Badge variant="outline" className={cn("text-[9px] px-1 py-0",
                          l.status === "active" ? "border-emerald-500/30 text-emerald-700 dark:text-emerald-400" :
                          l.status === "pending" ? "border-amber-500/30 text-amber-700" :
                          "border-border text-muted-foreground"
                        )}>{l.status}</Badge>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={() => navigate(`/market/listing/${l.id}`)}>
                      View
                    </Button>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    {[
                      { label: "EOIs", value: eoiCount },
                      { label: "Accepted", value: eoiByStatus.accepted },
                      { label: "Active Deals", value: activeDealCount },
                      { label: "Closed", value: closedDealCount },
                    ].map(({ label, value }) => (
                      <div key={label} className="rounded bg-muted/40 px-1.5 py-1">
                        <p className="text-sm font-bold text-foreground">{value}</p>
                        <p className="text-[9px] text-muted-foreground">{label}</p>
                      </div>
                    ))}
                  </div>
                  {avgDaysToEoi != null && (
                    <p className="text-[10px] text-muted-foreground">Avg {avgDaysToEoi} days from listing to first EOI</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {totals.listings === 0 && (
          <div className="text-center py-12">
            <BarChart3 className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">No listings yet. Create your first listing to see analytics.</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate("/market/create")}>Create Listing</Button>
          </div>
        )}
      </div>
    </div>
  );
}
