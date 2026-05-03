import { useEffect, useRef } from "react";
import { useLocation, Link } from "wouter";
import { Nav } from "@/components/Nav";
import { EdenNXBadge } from "@/components/EdenNXBadge";
import { Button } from "@/components/ui/button";
import { useDocumentMeta } from "@/hooks/use-document-meta";
import {
  ArrowRight,
  Sprout,
  Database,
  Brain,
  Search,
  FileText,
  Zap,
  Building2,
  FlaskConical,
  Lightbulb,
  Globe,
  Shield,
  TrendingUp,
  Users,
  Star,
  CheckCircle,
} from "lucide-react";

function useReveal(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("is-visible");
          obs.disconnect();
        }
      },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return ref;
}

function PageBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden>
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{
          width: "min(80vw, 800px)",
          height: "min(80vw, 800px)",
          animation: "radar-bg-slow 28s linear infinite",
          transformOrigin: "center center",
          background:
            "conic-gradient(from 0deg, transparent 260deg, hsl(142 65% 48% / 0.03) 310deg, hsl(142 65% 48% / 0.08) 360deg)",
          borderRadius: "50%",
        }}
      />
      {[300, 450, 600].map((r, i) => (
        <div
          key={r}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border"
          style={{
            width: r,
            height: r,
            borderColor: `hsl(142 55% 45% / ${0.04 - i * 0.006})`,
          }}
        />
      ))}
    </div>
  );
}

const PIPELINE_STEPS = [
  {
    icon: Globe,
    color: "hsl(142 65% 48%)",
    colorDim: "hsl(142 65% 48% / 0.1)",
    step: "01",
    title: "Continuous Monitoring",
    desc: "EdenRadar's automated scrapers continuously crawl 300+ university tech transfer offices, government databases, and academic publication feeds. Every asset is collected, timestamped, and queued for analysis the moment it appears.",
    bullets: [
      "300+ TTO portals monitored",
      "Daily refresh on all sources",
      "Patent filing alerts included",
    ],
  },
  {
    icon: Brain,
    color: "hsl(265 60% 60%)",
    colorDim: "hsl(265 60% 60% / 0.1)",
    step: "02",
    title: "EDEN Classification and Enrichment",
    desc: "Each asset passes through EDEN, which classifies therapy area, disease target, development stage, and modality. EDEN scores each asset 0 to 100 for licensing readiness, scientific credibility, and commercial potential.",
    bullets: [
      "Therapy area classification",
      "Modality and target extraction",
      "0-100 EDEN readiness score",
    ],
  },
  {
    icon: Database,
    color: "hsl(35 90% 55%)",
    colorDim: "hsl(35 90% 55% / 0.1)",
    step: "03",
    title: "Semantic Search Index",
    desc: "Enriched assets are embedded into our vector search index, enabling natural language queries that match by meaning, not just keyword. Ask EDEN a question in plain English and surface relevant assets instantly from across the full dataset.",
    bullets: [
      "Vector embedding search",
      "Natural language queries",
      "Cross-institution matching",
    ],
  },
  {
    icon: FileText,
    color: "hsl(142 65% 48%)",
    colorDim: "hsl(142 65% 48% / 0.1)",
    step: "04",
    title: "Dossier Generation",
    desc: "For each asset you want to explore, EdenRadar auto-generates a structured intelligence dossier: competitive landscape, key scientific claims, patent coverage, inventor details, and a deal-readiness summary, formatted for BD review.",
    bullets: [
      "Full EDEN-compiled dossier",
      "Competitive cross-reference",
      "Export to PDF or CSV",
    ],
  },
];

const PORTALS = [
  {
    icon: Lightbulb,
    title: "EdenDiscovery",
    tier: "Tier 1",
    tagline: "Creative concept community",
    color: "hsl(38 92% 50%)",
    colorDim: "hsl(38 92% 50% / 0.08)",
    borderColor: "hsl(38 92% 50% / 0.25)",
    forLabel: "For: Concept Creators, Early-Stage Innovators",
    features: [
      "Submit early-stage hypotheses before research begins",
      "EDEN credibility scoring on a 0-100 scale",
      "Surface to industry scouts and collaborators",
      "Graduate promising concepts into EdenLab projects",
      "Concept registry with timestamped provenance",
    ],
    vision:
      "The spark of discovery is often the hardest thing to protect and communicate. EdenDiscovery gives every innovator a structured place to plant their idea, date-stamp it, and let the world know it exists.",
  },
  {
    icon: FlaskConical,
    title: "EdenLab",
    tier: "Tier 2",
    tagline: "Project-based research workspace",
    color: "hsl(265 60% 60%)",
    colorDim: "hsl(265 60% 60% / 0.08)",
    borderColor: "hsl(265 60% 60% / 0.25)",
    forLabel: "For: Academic Researchers, Lab Leaders, PhD Teams",
    features: [
      "Structured 11-section project canvas",
      "Literature synthesis across 40+ data sources",
      "Evidence extraction and citation management",
      "Visibility to industry partners and collaborators",
      "Grants discovery matched to your research profile",
    ],
    vision:
      "EdenLab is built for the scientist who needs to move from hypothesis to publication without losing the thread. A workspace that organizes the complexity of research while making your work visible to the world.",
  },
  {
    icon: TrendingUp,
    title: "EdenScout",
    tier: "Tier 3",
    tagline: "Industry intelligence platform",
    color: "hsl(142 65% 48%)",
    colorDim: "hsl(142 65% 48% / 0.08)",
    borderColor: "hsl(142 65% 48% / 0.25)",
    forLabel: "For: BD Teams, Licensing Executives, Pharma Strategy",
    features: [
      "Continuously refreshed catalog of licensable biotech assets",
      "Natural language queries via EDEN chat",
      "Competing asset cross-reference by target and modality",
      "Institution intelligence and researcher profiles",
      "EDEN-compiled dossiers and board-ready reports",
    ],
    vision:
      "EdenScout is the platform your BD team has always needed. Instead of cold calls and conference hallways, you get a continuously enriched window into every major TTO on the planet.",
  },
];

const WHO_ITS_FOR = [
  {
    icon: Building2,
    title: "Pharma and Biotech BD Teams",
    desc: "Replace manual TTO outreach and fragmented databases with a single platform that surfaces the assets you actually need.",
  },
  {
    icon: Users,
    title: "University Tech Transfer Offices",
    desc: "Your assets are automatically monitored, enriched, and made discoverable to the industry teams actively searching for what you've developed.",
  },
  {
    icon: FlaskConical,
    title: "Academic Research Labs",
    desc: "Organize your science, make it visible to collaborators and funders, and track grants all from within a single structured workspace.",
  },
  {
    icon: Shield,
    title: "Life Science Investors and Funds",
    desc: "Surface early-stage assets before they reach the market. Use EDEN scoring to prioritize your deal flow and focus your diligence time.",
  },
];

const STATS = [
  { value: "10,000+", label: "Biotech Assets Covered" },
  { value: "300+", label: "TTO Sources Monitored" },
  { value: "0-100", label: "EDEN Score" },
  { value: "Real-Time", label: "Continuous Data Refresh" },
];

export default function WhatWeDo() {
  useDocumentMeta({
    title: "What We Do — Biotech Asset Discovery & Marketplace | EdenRadar",
    description:
      "EdenRadar surfaces licensable biotech assets from 300+ tech transfer offices, scores them with our EDEN signal stack, and connects industry, researchers, and entrepreneurs in a confidential deal marketplace.",
  });
  const [, navigate] = useLocation();
  const pipelineRef = useReveal();
  const portalsRef = useReveal();
  const whoRef = useReveal();
  const statsRef = useReveal();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Nav />
      <PageBackground />

      <main className="relative z-10 flex-1">

        {/* Hero */}
        <section className="relative overflow-hidden pt-24 pb-20 px-4 sm:px-6 text-center max-w-screen-xl mx-auto">
          <div
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border mb-8"
            style={{ background: "hsl(142 52% 36% / 0.08)", borderColor: "hsl(142 52% 36% / 0.25)" }}
          >
            <Zap className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold text-primary tracking-widest uppercase">
              EDEN Asset Discovery
            </span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground mb-6 leading-tight">
            We connect university science{" "}
            <span className="gradient-text">to the industry ready to build it.</span>
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed mb-10">
            EdenRadar is a three-portal intelligence platform that monitors tech transfer offices, EDEN-enriches every asset, and delivers them directly to the business development teams that need them.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              size="lg"
              onClick={() => navigate("/login")}
              data-testid="whatwedo-cta-top"
              className="h-12 px-8 font-semibold text-base"
              style={{ background: "hsl(142 52% 36%)", color: "white", border: "none" }}
            >
              Get Started
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => navigate("/pricing")}
              data-testid="whatwedo-cta-pricing"
              className="h-12 px-8 font-semibold text-base"
            >
              See Pricing
            </Button>
          </div>
        </section>

        {/* Stats bar */}
        <section
          ref={statsRef}
          className="reveal-section max-w-screen-xl mx-auto px-4 sm:px-6 py-8 mb-8"
        >
          <div
            className="rounded-2xl grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-border"
            style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
          >
            {STATS.map((stat, i) => (
              <div key={i} className="flex flex-col items-center py-8 px-4 text-center">
                <span className="text-2xl sm:text-3xl font-bold text-primary mb-1">{stat.value}</span>
                <span className="text-xs text-muted-foreground font-medium">{stat.label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Data Pipeline */}
        <section
          ref={pipelineRef}
          className="reveal-section max-w-screen-xl mx-auto px-4 sm:px-6 py-16"
        >
          <div className="text-center mb-14">
            <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-3">The Data Pipeline</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              How EDEN processes the world's research
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Four stages. Fully automated. Running around the clock.
            </p>
          </div>

          <div className="space-y-6">
            {PIPELINE_STEPS.map((step, i) => (
              <div
                key={i}
                className="flex flex-col sm:flex-row gap-6 p-7 rounded-2xl"
                style={{
                  background: step.colorDim,
                  border: `1px solid ${step.color.replace(")", " / 0.2)")}`,
                }}
              >
                <div className="flex items-start gap-5 flex-1">
                  <div
                    className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center"
                    style={{ background: step.color.replace(")", " / 0.15)"), border: `1px solid ${step.color.replace(")", " / 0.3)")}` }}
                  >
                    <step.icon className="w-6 h-6" style={{ color: step.color }} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-xs font-bold uppercase tracking-widest" style={{ color: step.color }}>
                        Step {step.step}
                      </span>
                    </div>
                    <h3 className="text-lg sm:text-xl font-bold text-foreground mb-2">{step.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed mb-4">{step.desc}</p>
                    <ul className="space-y-1.5">
                      {step.bullets.map((b) => (
                        <li key={b} className="flex items-center gap-2 text-sm">
                          <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: step.color }} />
                          <span className="text-foreground">{b}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Three Portals */}
        <section
          ref={portalsRef}
          className="reveal-section max-w-screen-xl mx-auto px-4 sm:px-6 py-16"
        >
          <div className="text-center mb-14">
            <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-3">Three Portals</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              One platform. Purpose-built for every user.
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Whether you are planting the seed of a concept or closing a licensing deal, EdenRadar has a portal built for your workflow.
            </p>
          </div>

          <div className="space-y-8">
            {PORTALS.map((portal, i) => (
              <div
                key={i}
                className="rounded-2xl overflow-hidden"
                style={{ border: `1px solid ${portal.borderColor}`, borderTop: `3px solid ${portal.color}` }}
              >
                <div className="p-7 sm:p-9">
                  <div className="flex flex-col sm:flex-row sm:items-start gap-6">
                    {/* Header */}
                    <div className="flex items-center gap-4 flex-shrink-0">
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center"
                        style={{ background: portal.colorDim }}
                      >
                        <portal.icon className="w-6 h-6" style={{ color: portal.color }} />
                      </div>
                      <div>
                        <span
                          className="text-[10px] font-bold uppercase tracking-widest block mb-0.5"
                          style={{ color: portal.color }}
                        >
                          {portal.tier}
                        </span>
                        <h3 className="text-xl font-bold text-foreground">{portal.title}</h3>
                        <p className="text-xs text-muted-foreground">{portal.tagline}</p>
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold mb-4"
                        style={{ background: portal.colorDim, color: portal.color }}
                      >
                        <Users className="w-3 h-3" />
                        {portal.forLabel}
                      </div>

                      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-5">
                        {portal.features.map((f) => (
                          <li key={f} className="flex items-start gap-2 text-sm">
                            <ArrowRight className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: portal.color }} />
                            <span className="text-foreground">{f}</span>
                          </li>
                        ))}
                      </ul>

                      <blockquote
                        className="text-xs italic leading-relaxed"
                        style={{ color: portal.color.replace(")", " / 0.8)") }}
                      >
                        "{portal.vision}"
                      </blockquote>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Who it's for */}
        <section
          ref={whoRef}
          className="reveal-section max-w-screen-xl mx-auto px-4 sm:px-6 py-16"
        >
          <div className="text-center mb-12">
            <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-3">Who It's For</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
              Built for every stakeholder in biotech innovation
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {WHO_ITS_FOR.map((w, i) => (
              <div
                key={i}
                className="flex gap-4 p-6 rounded-xl border border-border bg-card hover:border-primary/30 transition-colors duration-200"
              >
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <w.icon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground mb-1.5">{w.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{w.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="max-w-screen-xl mx-auto px-4 sm:px-6 py-16">
          <div
            className="rounded-2xl p-10 text-center"
            style={{
              background: "linear-gradient(135deg, hsl(222 47% 7%) 0%, hsl(142 45% 8%) 60%, hsl(155 40% 10%) 100%)",
              border: "1px solid hsl(142 52% 36% / 0.2)",
            }}
          >
            <Star className="w-8 h-8 text-primary mx-auto mb-4" />
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
              Start discovering assets that move the needle.
            </h2>
            <p className="text-muted-foreground mb-8 max-w-md mx-auto">
              Join the biotech teams using EdenRadar to find, evaluate, and close licensing deals faster than ever.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                size="lg"
                onClick={() => navigate("/login")}
                data-testid="whatwedo-cta-bottom"
                className="h-11 px-7 font-semibold"
                style={{ background: "hsl(142 52% 36%)", color: "white", border: "none" }}
              >
                Get Started
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => navigate("/pricing")}
                data-testid="whatwedo-cta-how"
                className="h-11 px-7 font-semibold"
              >
                See Pricing
              </Button>
            </div>
          </div>
        </section>

      </main>

      <footer className="relative z-10 border-t border-border py-8 px-4 sm:px-6 text-xs text-muted-foreground">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-6">
          <p>© {new Date().getFullYear()} EdenRadar. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <Link href="/pricing" className="hover:text-foreground transition-colors" data-testid="footer-link-pricing">Pricing</Link>
            <Link href="/privacy" className="hover:text-foreground transition-colors" data-testid="footer-link-privacy">Privacy Policy</Link>
            <Link href="/tos" className="hover:text-foreground transition-colors" data-testid="footer-link-tos">Terms of Service</Link>
            <EdenNXBadge />
          </div>
        </div>
      </footer>
    </div>
  );
}
