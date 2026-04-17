import { Link } from "wouter";
import { Sprout, ArrowLeft, Check, ArrowRight, Building2, FlaskConical, Lightbulb, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";

const CONTACT_SALES = "sales@edenradar.com";

const SCOUT_PLANS = [
  {
    id: "individual",
    name: "Individual",
    price: "$1,999",
    period: "/mo",
    seats: "1 seat",
    tagline: "For solo BD professionals and licensing executives.",
    cta: "Request access",
    ctaHref: "/login?mode=signup",
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
    price: "$8,999",
    period: "/mo",
    seats: "5 seats",
    tagline: "For BD teams that share pipeline and move fast.",
    cta: "Request access",
    ctaHref: "/login?mode=signup",
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
    price: "$16,999",
    period: "/mo",
    seats: "10 seats",
    tagline: "For larger BD divisions running multiple workstreams.",
    cta: "Request access",
    ctaHref: "/login?mode=signup",
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

export default function Pricing() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-6 py-12 space-y-16">

        {/* Header */}
        <div className="space-y-4">
          <Link href="/">
            <div className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground cursor-pointer transition-colors mb-2" data-testid="link-back-pricing">
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to EdenRadar
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-emerald-600 flex items-center justify-center">
              <Sprout className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-lg text-foreground">
              Eden<span className="text-emerald-600">Radar</span>
            </span>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-emerald-600 uppercase tracking-widest">EdenScout Intelligence Platform</p>
            <h1 className="text-3xl sm:text-4xl font-bold text-foreground" data-testid="text-pricing-title">
              Plans for every team
            </h1>
            <p className="text-base text-muted-foreground max-w-xl leading-relaxed">
              EdenScout gives industry buyers continuous access to licensable biotech assets from 300+ tech transfer offices, enriched and scored by EDEN. Free tiers for researchers and concept creators are always included.
            </p>
          </div>
        </div>

        {/* EdenScout Paid Plans */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">EdenScout (Paid)</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {SCOUT_PLANS.map((plan) => (
              <div
                key={plan.id + plan.seats}
                className="relative flex flex-col rounded-xl overflow-hidden"
                style={{
                  border: plan.highlighted
                    ? "2px solid hsl(142 52% 36%)"
                    : "1px solid hsl(var(--border))",
                  boxShadow: plan.highlighted ? "0 0 0 4px hsl(142 52% 36% / 0.08)" : undefined,
                }}
                data-testid={`pricing-card-${plan.id}`}
              >
                {plan.highlighted && (
                  <div
                    className="absolute top-0 left-0 right-0 h-0.5"
                    style={{ background: "hsl(142 52% 36%)" }}
                  />
                )}

                {/* Card header */}
                <div
                  className="px-5 py-5"
                  style={{
                    background: plan.highlighted
                      ? "linear-gradient(135deg, hsl(142 52% 36% / 0.08), hsl(142 52% 36% / 0.03))"
                      : "hsl(var(--card))",
                    borderBottom: "1px solid hsl(var(--border))",
                  }}
                >
                  {plan.highlighted && (
                    <div className="mb-3">
                      <span
                        className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
                        style={{ background: "hsl(142 52% 36% / 0.12)", color: "hsl(142 52% 36%)" }}
                      >
                        Most popular
                      </span>
                    </div>
                  )}
                  <div className="flex items-baseline gap-1 mb-1">
                    <span className="text-3xl font-black text-foreground">{plan.price}</span>
                    <span className="text-sm text-muted-foreground">{plan.period}</span>
                  </div>
                  <div className="flex items-center gap-2 mb-3">
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: "hsl(142 52% 36% / 0.10)", color: "hsl(142 52% 36%)" }}
                    >
                      {plan.seats}
                    </span>
                    <span className="text-xs font-semibold text-foreground">{plan.name}</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{plan.tagline}</p>
                </div>

                {/* Features */}
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

                {/* CTA */}
                <div className="px-5 py-4 bg-card border-t border-border">
                  <Link href={plan.ctaHref}>
                    <Button
                      className="w-full font-semibold h-9 text-sm"
                      variant={plan.highlighted ? "default" : "outline"}
                      style={plan.highlighted ? { background: "hsl(142 52% 36%)", color: "white", border: "none" } : undefined}
                      data-testid={`button-pricing-${plan.id}`}
                    >
                      {plan.cta}
                      <ArrowRight className="w-3.5 h-3.5 ml-1" />
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
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
