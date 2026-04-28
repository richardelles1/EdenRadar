import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Radar, CheckCircle2, ArrowRight, Lock, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type PlanResponse = { plan: string | null; orgName: string | null; stripeStatus: string | null; stripeCurrentPeriodEnd: string | null };

const PAID_PLANS = ["individual", "team5", "team10", "enterprise"] as const;

const SCOUT_FEATURES = [
  "Semantic search across 300+ TTO asset catalogs",
  "Match Report generation with AI enrichment",
  "Pipeline lists and saved asset tracking",
  "New arrivals feed with weekly institution updates",
  "Research signal overlay from PubMed, patents, and trials",
  "Therapy area convergence and hot-area intelligence",
];

const PLANS = [
  { tier: "Individual", seats: "1 seat", price: "$1,999", desc: "Solo BD professionals and licensing executives." },
  { tier: "Team-5", seats: "5 seats", price: "$8,999", desc: "BD teams sharing pipeline and moving fast.", popular: true },
  { tier: "Team-10", seats: "10 seats", price: "$16,999", desc: "Larger BD divisions running multiple workstreams." },
];

export function ScoutGate({ children }: { children: React.ReactNode }) {
  const { session, loading: authLoading } = useAuth();
  const qc = useQueryClient();
  const userId = session?.user?.id ?? null;

  useEffect(() => {
    if (!authLoading && !userId) {
      qc.removeQueries({ queryKey: ["/api/me/plan"] });
    }
  }, [userId, authLoading, qc]);

  const { data, isLoading, isError, refetch } = useQuery<PlanResponse>({
    queryKey: ["/api/me/plan", userId],
    staleTime: 5 * 60 * 1000,
    enabled: !authLoading && !!session?.access_token,
    queryFn: async () => {
      const res = await fetch("/api/me/plan", {
        headers: {
          Authorization: `Bearer ${session!.access_token}`,
        },
      });
      if (!res.ok) throw new Error("Failed to load plan");
      return res.json() as Promise<PlanResponse>;
    },
  });

  if (authLoading || isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center px-4">
          <AlertCircle className="w-8 h-8 text-muted-foreground/60" />
          <div>
            <p className="text-sm font-medium text-foreground mb-1">Unable to verify your plan</p>
            <p className="text-xs text-muted-foreground">Check your connection and try again.</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => refetch()}
            data-testid="scout-gate-retry"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const hasAccess = data?.plan != null && (PAID_PLANS as readonly string[]).includes(data.plan);

  if (hasAccess) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-full bg-gradient-to-b from-background via-background to-muted/20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 space-y-12">

        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-600/10 border border-emerald-600/20 mb-2">
            <Lock className="w-3.5 h-3.5 text-emerald-600" />
            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 tracking-wide uppercase">
              EdenScout subscription required
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground tracking-tight">
            Unlock the full<br />
            <span className="text-emerald-600">EdenScout</span> platform
          </h1>
          <p className="text-muted-foreground text-base max-w-xl mx-auto">
            EdenScout gives your BD team continuous access to licensable biotech assets from 300+ tech transfer offices, enriched and scored by EDEN.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-6">
          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-600/10 flex items-center justify-center">
                <Radar className="w-4 h-4 text-emerald-600" />
              </div>
              <h2 className="text-sm font-bold text-foreground">What you get with EdenScout</h2>
            </div>
            <ul className="space-y-2.5">
              {SCOUT_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span className="text-sm text-muted-foreground">{f}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-3">
            {PLANS.map((plan) => (
              <div
                key={plan.tier}
                className={`rounded-xl border p-4 flex items-center justify-between gap-4 ${
                  plan.popular
                    ? "border-emerald-600/40 bg-emerald-600/5"
                    : "border-border bg-card"
                }`}
                data-testid={`scout-gate-plan-${plan.tier.toLowerCase()}`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-foreground">{plan.tier}</span>
                    <span className="text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5">
                      {plan.seats}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{plan.desc}</p>
                </div>
                <div className="shrink-0 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    {plan.popular && (
                      <span className="text-[9px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-600/10 border border-emerald-600/20 rounded px-1.5 py-0.5">
                        Most popular
                      </span>
                    )}
                    <p className="text-lg font-bold text-foreground tabular-nums">{plan.price}</p>
                    <p className="text-[10px] text-muted-foreground">/mo</p>
                  </div>
                </div>
              </div>
            ))}

            <div className="rounded-xl border border-border bg-card p-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <span className="text-sm font-bold text-foreground">Enterprise</span>
                <p className="text-[11px] text-muted-foreground mt-0.5">Custom seats, SLA, and contract terms.</p>
              </div>
              <a
                href="mailto:sales@edenradar.com"
                className="shrink-0 text-sm font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
                data-testid="scout-gate-enterprise-contact"
              >
                Contact sales
              </a>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center gap-2">
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <Link href="/pricing">
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 h-11 px-6"
                data-testid="scout-gate-see-plans"
              >
                Start 3-day free trial
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <a
              href="mailto:sales@edenradar.com"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              data-testid="scout-gate-contact-sales"
            >
              Talk to sales instead
            </a>
          </div>
          <p className="text-[11px] text-muted-foreground">No charge for 3 days · Cancel anytime</p>
        </div>

        <p className="text-center text-[11px] text-muted-foreground">
          Already have a subscription?{" "}
          <Link href="/settings">
            <span className="text-emerald-600 hover:underline cursor-pointer">
              Connect your organization
            </span>
          </Link>{" "}
          or contact{" "}
          <a href="mailto:support@edenradar.com" className="text-emerald-600 hover:underline">
            support@edenradar.com
          </a>
          .
        </p>
      </div>
    </div>
  );
}
