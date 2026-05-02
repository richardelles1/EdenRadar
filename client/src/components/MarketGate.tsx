import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { ShoppingBag, CheckCircle2, Lock, ArrowRight, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";

const MARKET_FEATURES = [
  "Curated feed of biopharma assets available for licensing and acquisition",
  "Blind listings — confidential seller identity until mutual NDA",
  "Submit Expressions of Interest directly to sellers",
  "Side-by-side comparison of up to 3 listings",
  "List your own assets for sale or out-licensing",
  "Admin-curated quality review on every listing",
];

type AccessResponse = { access: boolean; orgId: number | null };

export function MarketGate({ children }: { children: React.ReactNode }) {
  const { session, loading: authLoading } = useAuth();
  const [location] = useLocation();

  const { data, isLoading, isError, refetch } = useQuery<AccessResponse>({
    queryKey: ["/api/market/access"],
    staleTime: 5 * 60 * 1000,
    enabled: !authLoading && !!session?.access_token,
    queryFn: async () => {
      const res = await fetch("/api/market/access", {
        headers: { Authorization: `Bearer ${session!.access_token}` },
      });
      if (!res.ok) throw new Error("Failed to check access");
      return res.json();
    },
  });

  // Check for market_session_id in URL to auto-activate after Stripe checkout
  const { mutate: verifySession, isPending: verifying } = {
    mutate: async (sessionId: string) => {
      try {
        await fetch(`/api/market/verify-session?market_session_id=${sessionId}`, {
          headers: { Authorization: `Bearer ${session!.access_token}` },
        });
        refetch();
        // Remove the param from URL
        const url = new URL(window.location.href);
        url.searchParams.delete("market_session_id");
        window.history.replaceState({}, "", url.toString());
      } catch {}
    },
    isPending: false,
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sid = params.get("market_session_id");
    if (sid && session?.access_token && !authLoading) {
      verifySession(sid);
    }
  }, [session, authLoading]);

  if (authLoading || isLoading || verifying) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center px-4">
          <AlertCircle className="w-8 h-8 text-muted-foreground/60" />
          <p className="text-sm font-medium text-foreground">Unable to verify access</p>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => refetch()}>
            <RefreshCw className="w-3.5 h-3.5" /> Retry
          </Button>
        </div>
      </div>
    );
  }

  if (data?.access) return <>{children}</>;

  return <MarketPaywall />;
}

function MarketPaywall() {
  const { session } = useAuth();

  async function handleSubscribe() {
    if (!session?.access_token) {
      window.location.href = "/login?redirectTo=/market";
      return;
    }
    try {
      const res = await fetch("/api/market/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          "x-user-id": session.user.id,
        },
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {}
  }

  return (
    <div className="min-h-full bg-gradient-to-b from-background via-background to-muted/20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 space-y-12">

        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20 mb-2">
            <Lock className="w-3.5 h-3.5 text-violet-500" />
            <span className="text-xs font-semibold text-violet-600 dark:text-violet-400 tracking-wide uppercase">
              EdenMarket subscription required
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground tracking-tight">
            The confidential biopharma<br />
            <span className="text-violet-600 dark:text-violet-400">deal marketplace</span>
          </h1>
          <p className="text-muted-foreground text-base max-w-xl mx-auto">
            EdenMarket connects BD/licensing teams with sellers of deprioritized programs, TTO spin-outs, and non-core biotech assets — all in a curated, NDA-protected environment.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-6">
          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
                <ShoppingBag className="w-4 h-4 text-violet-500" />
              </div>
              <h2 className="text-sm font-bold text-foreground">What you get with EdenMarket</h2>
            </div>
            <ul className="space-y-2.5">
              {MARKET_FEATURES.map(f => (
                <li key={f} className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-violet-500 shrink-0 mt-0.5" />
                  <span className="text-sm text-muted-foreground">{f}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-6 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">EdenMarket Access</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Full buy-side and sell-side access</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-2xl font-bold text-foreground tabular-nums">$1,000</p>
                  <p className="text-xs text-muted-foreground">/month</p>
                </div>
              </div>
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                <li className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-violet-500 shrink-0" /> Unlimited listing browsing</li>
                <li className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-violet-500 shrink-0" /> Submit up to 10 EOIs/month</li>
                <li className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-violet-500 shrink-0" /> Create and manage your own listings</li>
                <li className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-violet-500 shrink-0" /> Admin-reviewed listing quality</li>
              </ul>
              <Button
                className="w-full gap-2 text-white"
                style={{ background: "hsl(271 81% 55%)" }}
                onClick={handleSubscribe}
                data-testid="market-gate-subscribe"
              >
                Subscribe to EdenMarket
                <ArrowRight className="w-4 h-4" />
              </Button>
              <p className="text-[10px] text-muted-foreground text-center">
                + Success fee on closed deals: $10k ({"<"}$10M), $30k ($10–50M), $50k ({">"}$50M)
              </p>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 text-center space-y-1">
              <p className="text-xs font-semibold text-foreground">Already subscribed?</p>
              <p className="text-[11px] text-muted-foreground">
                Contact{" "}
                <a href="mailto:support@edenradar.com" className="text-violet-500 hover:underline">
                  support@edenradar.com
                </a>{" "}
                to connect your organization.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
