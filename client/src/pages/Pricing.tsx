import { Link, useLocation } from "wouter";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { Check, ArrowRight, Building2, FlaskConical, Lightbulb, Mail, Loader2, Users, Settings, ShoppingBag, Lock, Handshake } from "lucide-react";
import { useMarketSubscribe } from "@/hooks/use-market-subscribe";
import { Button } from "@/components/ui/button";
import { Nav } from "@/components/Nav";
import { useAuth } from "@/hooks/use-auth";
import { useOrg } from "@/hooks/use-org";
import type { OrgContext } from "@/hooks/use-org";
import { useToast } from "@/hooks/use-toast";
import { PLAN_PRICES, formatPrice } from "@/lib/pricing";
import { useDocumentMeta } from "@/hooks/use-document-meta";

const CONTACT_SALES = "sales@edenradar.com";

const SCOUT_PLANS = [
  {
    id: "individual",
    name: "Individual",
    price: formatPrice(PLAN_PRICES.individual),
    period: "/mo",
    seats: "1 seat",
    isTeam: false,
    tagline: "For solo BD professionals and licensing executives.",
    teamCallout: null as string | null,
    features: [
      "Market intelligence feed from 300+ TTOs",
      "EDEN semantic search across full asset catalog",
      "Asset dossiers with full AI enrichment",
      "Pipeline tracking and saved asset lists",
      "Therapy area, stage, and modality filters",
      "PDF and CSV pipeline export",
    ],
    highlighted: false,
  },
  {
    id: "team5",
    name: "Team",
    price: formatPrice(PLAN_PRICES.team5),
    period: "/mo",
    seats: "5 seats",
    isTeam: true,
    tagline: "For BD teams that share pipeline and move fast.",
    teamCallout: "Share access across your BD team — invite up to 4 colleagues after checkout.",
    features: [
      "Everything in Individual",
      "5 shared team seats",
      "Shared pipeline lists and watchlists",
      "Member attribution on pipeline actions",
      "Org-level dashboard and team view",
      "Priority email support",
    ],
    highlighted: true,
  },
  {
    id: "team10",
    name: "Team",
    price: formatPrice(PLAN_PRICES.team10),
    period: "/mo",
    seats: "10 seats",
    isTeam: true,
    tagline: "For larger BD divisions running multiple workstreams.",
    teamCallout: "Share access across your division — invite up to 9 colleagues after checkout.",
    features: [
      "Everything in Team (5-seat)",
      "10 shared team seats",
      "Advanced org reporting",
      "Dedicated account manager",
      "Custom alert configurations",
      "Quarterly platform review calls",
    ],
    highlighted: false,
  },
];

const ENTERPRISE = {
  tagline: "For enterprise pharma, life science funds, and organizations with custom data and compliance requirements.",
  bullets: [
    "Custom seat count",
    "Dedicated onboarding and account management",
    "SLA guarantees",
    "Custom data integrations",
    "Volume and annual contract pricing",
    "Legal and compliance review support",
  ],
};

const FREE_TIERS = [
  {
    id: "discovery",
    name: "EdenDiscovery",
    icon: Lightbulb,
    color: "hsl(38 92% 50%)",
    colorDim: "hsl(38 92% 50% / 0.08)",
    borderColor: "hsl(38 92% 50% / 0.3)",
    tagline: "For concept creators and early-stage innovators.",
    features: [
      "Submit early-stage hypotheses before research begins",
      "EDEN credibility scoring on a 0-100 scale",
      "Browse the public concept community feed",
      "Surface concepts to industry scouts and collaborators",
    ],
  },
  {
    id: "lab",
    name: "EdenLab",
    icon: FlaskConical,
    color: "hsl(265 60% 60%)",
    colorDim: "hsl(265 60% 60% / 0.08)",
    borderColor: "hsl(265 60% 60% / 0.3)",
    tagline: "For academic researchers, lab leaders, and PhD teams.",
    features: [
      "11-section structured research project workspace",
      "Literature synthesis across 40+ academic sources",
      "Evidence extraction and citation management",
      "Grants discovery matched to your research profile",
    ],
  },
];

// Plan ordering for upgrade/downgrade detection
const PLAN_ORDER: Record<string, number> = { individual: 1, team5: 2, team10: 3 };

function PlanCTA({
  plan,
  session,
  org,
}: {
  plan: typeof SCOUT_PLANS[number];
  session: Session | null;
  org: OrgContext | null | undefined;
}) {
  const [loading, setLoading] = useState(false);
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const currentStatus = org?.stripeStatus;
  const currentPlan = org?.planTier;
  const isActiveOrTrialing = currentStatus === "active" || currentStatus === "trialing";
  const isPastDue = currentStatus === "past_due";
  const isThisPlan = currentPlan === plan.id;

  // ── Active or trialing subscriber ───────────────────────────────────────────
  if (isActiveOrTrialing) {
    if (isThisPlan) {
      return (
        <div className="space-y-1.5">
          <div
            className="w-full h-9 rounded-md flex items-center justify-center gap-1.5 text-sm font-semibold"
            style={{ background: "hsl(142 52% 36% / 0.10)", color: "hsl(142 52% 36%)" }}
            data-testid={`status-current-plan-${plan.id}`}
          >
            <Check className="w-3.5 h-3.5" />
            Current plan
          </div>
          <Link href="/industry/settings">
            <p className="text-center text-[10px] text-muted-foreground hover:text-foreground cursor-pointer transition-colors flex items-center justify-center gap-1">
              <Settings className="w-2.5 h-2.5" />
              Manage billing in Settings
            </p>
          </Link>
        </div>
      );
    }

    // Upgrade path: team5 → team10 (self-service via upgrade route in Settings)
    const currentOrder = PLAN_ORDER[currentPlan ?? ""] ?? 0;
    const thisOrder = PLAN_ORDER[plan.id] ?? 0;
    if (thisOrder > currentOrder) {
      return (
        <div className="space-y-1.5">
          <Link href="/industry/settings">
            <Button
              className="w-full font-semibold h-9 text-sm"
              variant={plan.highlighted ? "default" : "outline"}
              style={plan.highlighted ? { background: "hsl(142 52% 36%)", color: "white", border: "none" } : undefined}
              data-testid={`button-pricing-upgrade-${plan.id}`}
            >
              Upgrade plan
              <ArrowRight className="w-3.5 h-3.5 ml-1 order-last" />
            </Button>
          </Link>
          <p className="text-center text-[10px] text-muted-foreground">Upgrade or switch plans in Settings</p>
        </div>
      );
    }

    // Downgrade or cross-tier: direct to Settings / billing portal
    return (
      <div className="space-y-1.5">
        <Link href="/industry/settings">
          <Button
            className="w-full font-semibold h-9 text-sm"
            variant="outline"
            data-testid={`button-pricing-manage-${plan.id}`}
          >
            <Settings className="w-3.5 h-3.5 mr-1" />
            Manage billing
          </Button>
        </Link>
        <p className="text-center text-[10px] text-muted-foreground">Change or cancel your plan in Settings</p>
      </div>
    );
  }

  // ── Past-due subscriber ──────────────────────────────────────────────────────
  if (isPastDue && isThisPlan) {
    return (
      <div className="space-y-1.5">
        <Link href="/industry/settings">
          <Button
            className="w-full font-semibold h-9 text-sm"
            variant="outline"
            style={{ borderColor: "hsl(38 92% 50% / 0.5)", color: "hsl(38 92% 50%)" }}
            data-testid={`button-pricing-pastdue-${plan.id}`}
          >
            Update payment method
            <ArrowRight className="w-3.5 h-3.5 ml-1 order-last" />
          </Button>
        </Link>
        <p className="text-center text-[10px] text-muted-foreground">Your last payment failed — update billing in Settings</p>
      </div>
    );
  }

  // ── Default: standard checkout CTA ──────────────────────────────────────────
  async function handleSubscribe() {
    if (!session?.access_token) {
      navigate(`/login?mode=signup&redirect=/pricing`);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ planId: plan.id }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409 && data.redirect) {
          navigate(data.redirect);
        }
        toast({
          title: res.status === 409 ? "Already subscribed" : "Could not start checkout",
          description: data.error ?? "Something went wrong. Please try again.",
          variant: res.status === 409 ? "default" : "destructive",
        });
        return;
      }

      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      toast({
        title: "Network error",
        description: "Failed to connect to the server. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  const buttonLabel = plan.isTeam ? "Start team trial" : "Start 3-day free trial";

  return (
    <div className="space-y-1.5">
      <Button
        className="w-full font-semibold h-9 text-sm"
        variant={plan.highlighted ? "default" : "outline"}
        style={plan.highlighted ? { background: "hsl(142 52% 36%)", color: "white", border: "none" } : undefined}
        onClick={handleSubscribe}
        disabled={loading}
        data-testid={`button-pricing-${plan.id}`}
      >
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
        ) : (
          <ArrowRight className="w-3.5 h-3.5 mr-1 order-last" />
        )}
        {loading ? "Redirecting to checkout…" : buttonLabel}
      </Button>
      <p className="text-center text-[10px] text-muted-foreground">No charge for 3 days · Cancel anytime</p>
    </div>
  );
}

function EdenMarketTier({ session }: { session: Session | null }) {
  const [, navigate] = useLocation();
  const { subscribe, isLoading } = useMarketSubscribe();
  const INDIGO = "hsl(234 80% 58%)";

  const { data: access } = useQuery<{ access: boolean; orgId: number | null }>({
    queryKey: ["/api/market/access"],
    enabled: Boolean(session?.access_token),
    staleTime: 60 * 1000,
  });
  const hasAccess = Boolean(access?.access);

  function handleClick() {
    if (!session?.access_token) {
      navigate("/login?mode=signup&redirect=/market");
      return;
    }
    void subscribe();
  }

  return (
    <div className="space-y-4" data-testid="pricing-edenmarket">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold text-foreground">EdenMarket</h2>
        <span
          className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
          style={{ background: "hsl(234 80% 58% / 0.12)", color: INDIGO }}
        >
          Marketplace
        </span>
      </div>
      <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
        The blind marketplace for licensable biotech assets. Buyers see structured listings; identities reveal only after both sides sign an NDA inside the deal room.
      </p>

      <div
        className="rounded-xl overflow-hidden grid grid-cols-1 md:grid-cols-3"
        style={{ border: "1px solid hsl(234 80% 58% / 0.25)", background: "linear-gradient(135deg, hsl(234 80% 58% / 0.05), hsl(234 80% 58% / 0.01))" }}
      >
        {/* Left: subscription */}
        <div className="p-6 md:col-span-1 flex flex-col gap-4 md:border-r" style={{ borderColor: "hsl(234 80% 58% / 0.18)" }}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md flex items-center justify-center" style={{ background: "hsl(234 80% 58% / 0.15)" }}>
              <ShoppingBag className="w-4 h-4" style={{ color: INDIGO }} />
            </div>
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: INDIGO }}>Access</span>
          </div>
          <div>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-black text-foreground">$1,000</span>
              <span className="text-sm text-muted-foreground">/mo</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Org-wide marketplace access</p>
          </div>
          <ul className="space-y-2 text-xs text-foreground/90">
            <li className="flex items-start gap-2">
              <Check className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: INDIGO }} />
              <span>Browse all live blind listings</span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: INDIGO }} />
              <span>Submit unlimited Expressions of Interest</span>
            </li>
            <li className="flex items-start gap-2">
              <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: INDIGO }} />
              <span>NDA-gated deal rooms with audit trail</span>
            </li>
            <li className="flex items-start gap-2">
              <Handshake className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: INDIGO }} />
              <span>Document exchange + secure messaging</span>
            </li>
          </ul>
          {hasAccess ? (
            <Button
              className="w-full font-semibold h-9 text-sm gap-1.5"
              style={{ background: INDIGO, color: "white", border: "none" }}
              onClick={() => navigate("/market")}
              data-testid="button-pricing-edenmarket-active"
            >
              <Check className="w-3.5 h-3.5" />
              Active — Open EdenMarket
            </Button>
          ) : (
            <Button
              className="w-full font-semibold h-9 text-sm gap-1.5"
              style={{ background: INDIGO, color: "white", border: "none" }}
              onClick={handleClick}
              disabled={isLoading}
              data-testid="button-pricing-edenmarket-subscribe"
            >
              {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShoppingBag className="w-3.5 h-3.5" />}
              {isLoading ? "Redirecting…" : "Subscribe to EdenMarket"}
            </Button>
          )}
          <p className="text-center text-[10px] text-muted-foreground">
            {hasAccess ? "Your org has marketplace access." : "Free to list · success fees only on close"}
          </p>
        </div>

        {/* Right: success fee table */}
        <div className="p-6 md:col-span-2 space-y-4 bg-card/30">
          <div className="flex items-center gap-2">
            <Handshake className="w-4 h-4" style={{ color: INDIGO }} />
            <p className="text-xs font-semibold uppercase tracking-widest text-foreground">Success fees — paid only when a deal closes</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { label: "Pre-clinical", fee: "$10,000", desc: "On a closed pre-clinical license or option" },
              { label: "Clinical", fee: "$30,000", desc: "On a closed Phase I–II asset transaction" },
              { label: "Late-stage", fee: "$50,000", desc: "On a closed Phase III or commercial-stage deal" },
            ].map((t) => (
              <div
                key={t.label}
                className="rounded-lg p-4"
                style={{ background: "hsl(var(--background))", border: "1px solid hsl(234 80% 58% / 0.15)" }}
                data-testid={`edenmarket-fee-${t.label.toLowerCase().replace(/\s+/g, "-")}`}
              >
                <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: INDIGO }}>{t.label}</p>
                <p className="text-xl font-black text-foreground tabular-nums">{t.fee}</p>
                <p className="text-[11px] text-muted-foreground mt-1.5 leading-snug">{t.desc}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-3 border-t" style={{ borderColor: "hsl(234 80% 58% / 0.15)" }}>
            <p className="text-xs text-muted-foreground flex-1">
              Listing assets is free for sellers. EdenMarket only earns when you close — incentives stay aligned with you.
            </p>
            <Link href="/market/list">
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-3 text-xs gap-1.5 whitespace-nowrap"
                style={{ borderColor: "hsl(234 80% 58% / 0.4)", color: INDIGO }}
                data-testid="button-pricing-edenmarket-list"
              >
                List your assets
                <ArrowRight className="w-3 h-3" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Pricing() {
  useDocumentMeta({
    title: "Pricing — EdenRadar Plans for Industry, Research & Discovery",
    description:
      "Transparent pricing for EdenScout, EdenLab, EdenDiscovery and EdenMarket. Start free, upgrade for unlimited assets, alerts, custom dashboards, and confidential deal flow.",
  });
  const { session } = useAuth();
  const { data: org } = useOrg();

  const isSubscribed = org?.stripeStatus === "active" || org?.stripeStatus === "trialing";
  const isPastDue = org?.stripeStatus === "past_due";

  const [view, setView] = useState<"scout" | "market">(() => {
    if (typeof window !== "undefined" && window.location.hash === "#market") return "market";
    return "scout";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => {
      const h = window.location.hash;
      if (h === "#market") setView("market");
      else if (h === "#scout") setView("scout");
    };
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  function selectView(next: "scout" | "market") {
    setView(next);
    if (typeof window !== "undefined") {
      const newHash = `#${next}`;
      if (window.location.hash !== newHash) {
        history.replaceState(null, "", `${window.location.pathname}${window.location.search}${newHash}`);
      }
    }
  }

  const SCOUT_INDIGO = "hsl(142 52% 36%)";
  const MARKET_INDIGO = "hsl(234 80% 58%)";

  const scoutGrid = (
    <div className="space-y-4" data-testid="pricing-section-scout">
      <h2 className="text-lg font-semibold text-foreground">EdenScout (Paid)</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {SCOUT_PLANS.map((plan) => {
          const isCurrentPlan = org?.planTier === plan.id && (isSubscribed || isPastDue);
          return (
            <div
              key={plan.id + plan.seats}
              className="relative flex flex-col rounded-xl overflow-hidden"
              style={{
                border: isCurrentPlan
                  ? "2px solid hsl(142 52% 36%)"
                  : plan.highlighted
                    ? "2px solid hsl(142 52% 36%)"
                    : "1px solid hsl(var(--border))",
                boxShadow: isCurrentPlan || plan.highlighted ? "0 0 0 4px hsl(142 52% 36% / 0.08)" : undefined,
              }}
              data-testid={`pricing-card-${plan.id}`}
            >
              {(isCurrentPlan || plan.highlighted) && (
                <div
                  className="absolute top-0 left-0 right-0 h-0.5"
                  style={{ background: "hsl(142 52% 36%)" }}
                />
              )}
              <div
                className="px-5 py-5"
                style={{
                  background: isCurrentPlan || plan.highlighted
                    ? "linear-gradient(135deg, hsl(142 52% 36% / 0.08), hsl(142 52% 36% / 0.03))"
                    : "hsl(var(--card))",
                  borderBottom: "1px solid hsl(var(--border))",
                }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-3xl font-black text-foreground">{plan.price}</span>
                  <span className="text-sm text-muted-foreground">{plan.period}</span>
                  {isCurrentPlan ? (
                    <span
                      className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full"
                      style={{ background: "hsl(142 52% 36% / 0.15)", color: "hsl(142 52% 36%)" }}
                      data-testid={`badge-current-plan-${plan.id}`}
                    >
                      Your plan
                    </span>
                  ) : plan.highlighted ? (
                    <span
                      className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full"
                      style={{ background: "hsl(142 52% 36% / 0.12)", color: "hsl(142 52% 36%)" }}
                    >
                      Most popular
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <span
                    className="text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1"
                    style={{ background: "hsl(142 52% 36% / 0.10)", color: "hsl(142 52% 36%)" }}
                  >
                    {plan.isTeam && <Users className="w-3 h-3" />}
                    {plan.seats}
                  </span>
                  <span className="text-xs font-semibold text-foreground">{plan.name}</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{plan.tagline}</p>
                {plan.teamCallout && (
                  <p
                    className="text-[10px] leading-relaxed mt-2 pt-2 border-t"
                    style={{ borderColor: "hsl(142 52% 36% / 0.2)", color: "hsl(142 52% 36%)" }}
                  >
                    {plan.teamCallout}
                  </p>
                )}
              </div>
              <div className="flex-1 px-5 py-4 bg-card space-y-2.5">
                {plan.features.map((f) => {
                  const isEscalator = f.startsWith("Everything in");
                  return (
                    <div key={f} className="flex items-start gap-2.5">
                      <div
                        className="flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center mt-0.5"
                        style={{
                          background: isEscalator
                            ? "hsl(var(--muted))"
                            : "hsl(142 52% 36% / 0.12)",
                        }}
                      >
                        {isEscalator
                          ? <ArrowRight className="w-2 h-2 text-muted-foreground" />
                          : <Check className="w-2.5 h-2.5" style={{ color: "hsl(142 52% 36%)" }} />}
                      </div>
                      <span className={`text-xs leading-relaxed ${isEscalator ? "text-muted-foreground italic font-medium" : "text-foreground"}`}>
                        {f}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="px-5 py-4 bg-card border-t border-border">
                <PlanCTA plan={plan} session={session} org={org} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const marketBlock = <EdenMarketTier session={session} />;

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <div className="max-w-5xl mx-auto px-6 py-12 space-y-16">

        {/* Header */}
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "hsl(142 52% 36%)" }}>
              EdenScout + EdenMarket
            </p>
            <h1 className="text-3xl sm:text-4xl font-bold text-foreground" data-testid="text-pricing-title">
              Two ways to source your next deal
            </h1>
            <p className="text-base text-muted-foreground max-w-xl leading-relaxed">
              EdenScout surfaces licensable signals from 300+ TTOs, patents, and papers. EdenMarket is the confidential marketplace where biotech deals close. Pick where you want to start — both are available, and free tiers for researchers are always included.
            </p>
          </div>

          {/* Product pill toggle */}
          <div
            className="inline-flex items-center gap-1 p-1 rounded-full border border-border bg-card"
            role="tablist"
            aria-label="Product"
            data-testid="toggle-pricing-product"
          >
            <button
              role="tab"
              aria-selected={view === "scout"}
              onClick={() => selectView("scout")}
              className="px-4 h-8 rounded-full text-xs font-semibold transition-colors inline-flex items-center gap-1.5"
              style={
                view === "scout"
                  ? { background: SCOUT_INDIGO, color: "white" }
                  : { color: "hsl(var(--muted-foreground))" }
              }
              data-testid="button-toggle-scout"
            >
              EdenScout
            </button>
            <button
              role="tab"
              aria-selected={view === "market"}
              onClick={() => selectView("market")}
              className="px-4 h-8 rounded-full text-xs font-semibold transition-colors inline-flex items-center gap-1.5"
              style={
                view === "market"
                  ? { background: MARKET_INDIGO, color: "white" }
                  : { color: "hsl(var(--muted-foreground))" }
              }
              data-testid="button-toggle-market"
            >
              EdenMarket
            </button>
          </div>
        </div>

        {/* Active subscription banner */}
        {(isSubscribed || isPastDue) && (
          <div
            className="rounded-lg px-4 py-3 flex items-start gap-3"
            style={
              isPastDue
                ? { background: "hsl(38 92% 50% / 0.06)", border: "1px solid hsl(38 92% 50% / 0.2)" }
                : { background: "hsl(142 52% 36% / 0.06)", border: "1px solid hsl(142 52% 36% / 0.2)" }
            }
            data-testid="banner-subscription-status"
          >
            <div
              className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5"
              style={
                isPastDue
                  ? { background: "hsl(38 92% 50% / 0.15)" }
                  : { background: "hsl(142 52% 36% / 0.15)" }
              }
            >
              {isPastDue
                ? <Settings className="w-3 h-3" style={{ color: "hsl(38 92% 50%)" }} />
                : <Check className="w-3 h-3" style={{ color: "hsl(142 52% 36%)" }} />
              }
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground leading-relaxed">
                {isPastDue ? (
                  <>
                    <span className="font-semibold text-foreground">Payment issue on your account.</span>{" "}
                    Your last payment failed. Update your payment method to restore full access.{" "}
                    <Link href="/industry/settings">
                      <span className="underline cursor-pointer" style={{ color: "hsl(38 92% 50%)" }}>Go to Settings →</span>
                    </Link>
                  </>
                ) : (
                  <>
                    <span className="font-semibold text-foreground">You have an active EdenScout subscription.</span>{" "}
                    Your current plan is highlighted below. Manage billing, upgrade, or cancel from{" "}
                    <Link href="/industry/settings">
                      <span className="underline cursor-pointer" style={{ color: "hsl(142 52% 36%)" }}>Settings →</span>
                    </Link>
                  </>
                )}
              </p>
            </div>
          </div>
        )}

        {/* ACH payment notice */}
        {!isSubscribed && !isPastDue && (
          <div
            className="rounded-lg px-4 py-3 flex items-start gap-3"
            style={{ background: "hsl(142 52% 36% / 0.06)", border: "1px solid hsl(142 52% 36% / 0.2)" }}
          >
            <div
              className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5"
              style={{ background: "hsl(142 52% 36% / 0.15)" }}
            >
              <Check className="w-3 h-3" style={{ color: "hsl(142 52% 36%)" }} />
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              <span className="font-semibold text-foreground">ACH bank transfer accepted.</span>{" "}
              Pay by bank account (ACH) or credit card at checkout — bank transfer is the default. No card required.
            </p>
          </div>
        )}

        {/* Primary product (driven by pill toggle) */}
        {view === "scout" ? scoutGrid : marketBlock}

        {/* Secondary product */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <p
              className="text-[10px] font-bold uppercase tracking-widest"
              style={{ color: view === "scout" ? MARKET_INDIGO : SCOUT_INDIGO }}
            >
              Also available
            </p>
            <div className="flex-1 h-px bg-border" />
            <button
              onClick={() => selectView(view === "scout" ? "market" : "scout")}
              className="text-[10px] font-semibold text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
              data-testid="link-toggle-secondary"
            >
              View as primary
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          {view === "scout" ? marketBlock : scoutGrid}
        </div>

        {/* Enterprise */}
        <div
          className="rounded-xl p-7 sm:p-9"
          style={{
            background: "linear-gradient(135deg, hsl(155 25% 6%) 0%, hsl(142 45% 8%) 60%, hsl(155 40% 10%) 100%)",
            border: "1px solid hsl(142 52% 36% / 0.25)",
          }}
          data-testid="pricing-card-enterprise"
        >
          <div className="flex flex-col sm:flex-row sm:items-start gap-6">
            <div className="flex-1 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "hsl(142 52% 36% / 0.2)" }}>
                  <Building2 className="w-4.5 h-4.5" style={{ color: "hsl(142 65% 60%)" }} />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "hsl(142 65% 60%)" }}>Enterprise</p>
                  <h3 className="text-lg font-bold text-white">Custom pricing</h3>
                </div>
              </div>
              <p className="text-sm leading-relaxed" style={{ color: "hsl(210 15% 70%)" }}>
                {ENTERPRISE.tagline}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                {ENTERPRISE.bullets.map((b) => (
                  <div key={b} className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: "hsl(142 65% 60%)" }} />
                    <span className="text-xs" style={{ color: "hsl(210 15% 70%)" }}>{b}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="sm:self-center flex-shrink-0">
              <a href={`mailto:${CONTACT_SALES}`} data-testid="button-pricing-enterprise">
                <Button
                  className="h-10 px-6 font-semibold text-sm gap-2 whitespace-nowrap"
                  style={{ background: "hsl(142 52% 36%)", color: "white", border: "none" }}
                >
                  <Mail className="w-3.5 h-3.5" />
                  Contact sales
                </Button>
              </a>
              <p className="text-[10px] text-center mt-2" style={{ color: "hsl(210 15% 50%)" }}>{CONTACT_SALES}</p>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-4">
          <div className="flex-1 h-px bg-border" />
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest whitespace-nowrap">Always free</p>
          <div className="flex-1 h-px bg-border" />
        </div>

        {/* Free Tiers */}
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            EdenDiscovery and EdenLab are free for researchers, concept creators, and academic teams. No payment required.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {FREE_TIERS.map((tier) => (
              <div
                key={tier.id}
                className="rounded-xl flex flex-col overflow-hidden"
                style={{ border: `1px solid ${tier.borderColor}`, borderTop: `3px solid ${tier.color}` }}
                data-testid={`pricing-card-${tier.id}`}
              >
                <div className="px-5 py-4 bg-card border-b border-border">
                  <div className="flex items-center gap-3 mb-1">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: tier.colorDim }}
                    >
                      <tier.icon className="w-4 h-4" style={{ color: tier.color }} />
                    </div>
                    <div>
                      <h3 className="font-bold text-foreground text-sm">{tier.name}</h3>
                      <span className="text-lg font-black" style={{ color: tier.color }}>Free</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{tier.tagline}</p>
                </div>
                <div className="flex-1 px-5 py-4 bg-card space-y-2.5">
                  {tier.features.map((f) => (
                    <div key={f} className="flex items-start gap-2.5">
                      <div
                        className="flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center mt-0.5"
                        style={{ background: tier.colorDim }}
                      >
                        <Check className="w-2.5 h-2.5" style={{ color: tier.color }} />
                      </div>
                      <span className="text-xs text-foreground leading-relaxed">{f}</span>
                    </div>
                  ))}
                </div>
                <div className="px-5 py-4 bg-card border-t border-border">
                  <Link href="/login">
                    <Button
                      className="w-full font-semibold h-9 text-sm"
                      variant="outline"
                      style={{ borderColor: tier.colorDim, color: tier.color }}
                      data-testid={`button-pricing-${tier.id}`}
                    >
                      Get started free
                      <ArrowRight className="w-3.5 h-3.5 ml-1" />
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer note */}
        <div className="border-t border-border pt-6 text-xs text-muted-foreground space-y-1">
          <p>All plans are billed monthly. Annual contracts available for Team and Enterprise plans with volume discounts. Prices are in USD.</p>
          <p>
            Questions?{" "}
            <a href={`mailto:${CONTACT_SALES}`} className="text-emerald-600 hover:text-emerald-500 underline">
              {CONTACT_SALES}
            </a>
          </p>
        </div>

      </div>
    </div>
  );
}
