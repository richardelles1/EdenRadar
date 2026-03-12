import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Nav } from "@/components/Nav";
import {
  ArrowRight,
  FlaskConical,
  Layers,
  Download,
  Zap,
  Database,
  BrainCircuit,
  ChevronRight,
  LogIn,
} from "lucide-react";

function EdenSVG() {
  const branches = [
    { y: 52,  dir: -1, ox: 80, tipX: 14,  tipY: 40,  r: 5.5, delay: "0s" },
    { y: 102, dir:  1, ox: 80, tipX: 148, tipY: 90,  r: 4.5, delay: "0.45s" },
    { y: 157, dir: -1, ox: 80, tipX: 12,  tipY: 145, r: 6.0, delay: "0.9s" },
    { y: 210, dir:  1, ox: 80, tipX: 150, tipY: 198, r: 4.0, delay: "1.35s" },
    { y: 262, dir: -1, ox: 80, tipX: 18,  tipY: 250, r: 5.0, delay: "1.8s" },
    { y: 310, dir:  1, ox: 80, tipX: 147, tipY: 298, r: 4.5, delay: "2.25s" },
    { y: 358, dir: -1, ox: 80, tipX: 22,  tipY: 347, r: 3.5, delay: "2.7s" },
  ];

  return (
    <svg viewBox="0 0 160 380" className="w-full h-full" style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id="stemGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%"   stopColor="hsl(142 70% 55%)" stopOpacity="0.15" />
          <stop offset="20%"  stopColor="hsl(142 65% 52%)" stopOpacity="0.88" />
          <stop offset="80%"  stopColor="hsl(155 60% 46%)" stopOpacity="0.88" />
          <stop offset="100%" stopColor="hsl(155 55% 42%)" stopOpacity="0.15" />
        </linearGradient>
        <radialGradient id="nodeGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="hsl(142 80% 72%)" stopOpacity="1" />
          <stop offset="60%"  stopColor="hsl(142 68% 52%)" stopOpacity="0.95" />
          <stop offset="100%" stopColor="hsl(142 58% 40%)" stopOpacity="0.55" />
        </radialGradient>
        <filter id="leafGlow">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="stemGlow">
          <feGaussianBlur stdDeviation="1" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      <circle cx="80" cy="190" r="75"  fill="none" stroke="hsl(142 55% 45%)" strokeOpacity="0.07" strokeWidth="1" />
      <circle cx="80" cy="190" r="145" fill="none" stroke="hsl(142 55% 45%)" strokeOpacity="0.04" strokeWidth="1" />

      <path
        d="M 80 378 C 73 348, 87 318, 80 288 C 73 258, 87 228, 80 198 C 73 168, 87 138, 80 108 C 73 78, 87 48, 80 18"
        fill="none"
        stroke="url(#stemGrad)"
        strokeWidth="2.5"
        filter="url(#stemGlow)"
      />

      {branches.map((b, i) => (
        <path
          key={`branch-${i}`}
          d={`M ${b.ox} ${b.y} C ${b.ox + b.dir * 22} ${b.y - 4}, ${b.tipX + b.dir * -18} ${b.tipY + 4}, ${b.tipX} ${b.tipY}`}
          fill="none"
          stroke="hsl(142 62% 48%)"
          strokeWidth="1.5"
          strokeOpacity={i % 2 === 0 ? 0.75 : 0.68}
        />
      ))}

      {branches.map((b, i) => (
        <circle key={`junc-${i}`} cx={b.ox} cy={b.y} r={2} fill="hsl(142 65% 58%)" fillOpacity="0.55" />
      ))}

      {branches.map((b, i) => (
        <circle
          key={`node-${i}`}
          cx={b.tipX}
          cy={b.tipY}
          r={b.r}
          fill="url(#nodeGrad)"
          filter="url(#leafGlow)"
          className="eden-node"
          style={{ animationDelay: b.delay }}
        />
      ))}

      <circle cx={8}   cy={44}  r={1.8} fill="hsl(142 65% 62%)" fillOpacity="0.38" />
      <circle cx={144} cy={96}  r={1.5} fill="hsl(142 65% 62%)" fillOpacity="0.32" />
      <circle cx={6}   cy={150} r={2.0} fill="hsl(142 65% 62%)" fillOpacity="0.38" />
      <circle cx={146} cy={204} r={1.5} fill="hsl(142 65% 62%)" fillOpacity="0.30" />
      <circle cx={12}  cy={255} r={1.8} fill="hsl(142 65% 62%)" fillOpacity="0.35" />
      <circle cx={143} cy={304} r={1.5} fill="hsl(142 65% 62%)" fillOpacity="0.28" />
    </svg>
  );
}

function RadarGraphic() {
  return (
    <div className="relative w-64 h-64 flex items-center justify-center">
      {[1, 0.75, 0.5, 0.3].map((scale, i) => (
        <div
          key={i}
          className="absolute rounded-full border border-primary/20"
          style={{
            width: `${scale * 100}%`,
            height: `${scale * 100}%`,
          }}
        />
      ))}
      <div
        className="absolute inset-0 rounded-full overflow-hidden radar-sweep"
        style={{ transformOrigin: "center center" }}
      >
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "conic-gradient(from 0deg, transparent 260deg, hsl(142 65% 48% / 0.08) 300deg, hsl(142 65% 48% / 0.35) 360deg)",
          }}
        />
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className="w-0.5 h-1/2 origin-bottom"
          style={{
            background: "linear-gradient(to top, hsl(142 65% 55% / 0.9), transparent)",
          }}
        />
      </div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="w-2.5 h-2.5 rounded-full bg-primary glow-pulse" />
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-full h-px bg-primary/10" />
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-px h-full bg-primary/10" />
      </div>
    </div>
  );
}

const FEATURES = [
  {
    icon: BrainCircuit,
    title: "AI-Powered Extraction",
    description:
      "GPT-4o-mini reads each abstract and structures asset name, target, modality, stage, and indication automatically.",
  },
  {
    icon: Database,
    title: "Multi-Source Intelligence",
    description:
      "Ingests PubMed, ClinicalTrials.gov, bioRxiv, medRxiv, patents, NIH Reporter, OpenAlex, and 138 tech transfer offices.",
  },
  {
    icon: Download,
    title: "Export-Ready Data",
    description:
      "Save assets to your pipeline and export structured JSON or CSV for downstream analysis, CRMs, or spreadsheets.",
  },
];

const STEPS = [
  {
    num: "01",
    title: "Type a search query",
    description: "Enter any biomedical topic — a target, disease, modality, or combination.",
  },
  {
    num: "02",
    title: "AI reads the literature",
    description:
      "EdenRadar fetches signals from 8 live sources and runs each through GPT-4o-mini to extract structured drug asset data.",
  },
  {
    num: "03",
    title: "Build your pipeline",
    description:
      "Save promising assets, filter by stage or modality, and export when you're ready to act.",
  },
];

export default function Landing() {
  const [, navigate] = useLocation();

  function handleEnterPortal() {
    localStorage.setItem("eden-portal", "true");
    navigate("/scout");
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Nav />

      <main className="flex-1">
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none">
            <div
              className="absolute top-0 right-0 w-1/2 h-full opacity-5"
              style={{
                background:
                  "radial-gradient(ellipse at 80% 20%, hsl(142 65% 48%) 0%, transparent 60%)",
              }}
            />
            <div
              className="absolute bottom-0 left-0 w-1/3 h-1/2 opacity-5"
              style={{
                background:
                  "radial-gradient(ellipse at 20% 80%, hsl(90 60% 55%) 0%, transparent 60%)",
              }}
            />
          </div>

          <div className="max-w-screen-xl mx-auto px-6 pt-20 pb-16">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <div className="space-y-8">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/30 bg-primary/5">
                  <Zap className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-semibold text-primary tracking-wide uppercase">
                    AI-Powered Biotech Intelligence
                  </span>
                </div>

                <div className="space-y-4">
                  <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.08]">
                    <span className="text-foreground">Turn Research Into</span>
                    <br />
                    <span className="gradient-text dark:gradient-text gradient-text-light">
                      Pipeline Intelligence
                    </span>
                  </h1>
                  <p className="text-lg text-muted-foreground max-w-lg leading-relaxed">
                    EdenRadar scans the biotech research landscape and uses AI to extract structured drug
                    asset intelligence — target, modality, stage, and indication — in seconds.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex flex-col gap-1">
                    <Button
                      size="lg"
                      className="gap-2 text-base font-semibold h-12 px-7"
                      onClick={handleEnterPortal}
                      data-testid="button-cta-enter-portal"
                    >
                      <LogIn className="w-4 h-4" />
                      Enter Portal
                    </Button>
                    <p className="text-[11px] text-muted-foreground text-center">Scout · Reports · Saved Assets · Alerts</p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Button
                      size="lg"
                      variant="outline"
                      className="gap-2 text-base h-12 px-7 border-border"
                      onClick={() => {
                        localStorage.setItem("eden-portal", "true");
                        window.location.href = "/scout";
                      }}
                      data-testid="button-cta-launch"
                    >
                      Launch Scout
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                    <p className="text-[11px] text-muted-foreground text-center">Jump straight to asset discovery</p>
                  </div>
                </div>

                <div className="flex items-center gap-6 pt-2">
                  {[
                    { value: "10M+", label: "Papers indexed" },
                    { value: "8", label: "Data sources" },
                    { value: "138", label: "TTOs covered" },
                  ].map((stat) => (
                    <div key={stat.label} className="text-center sm:text-left">
                      <div
                        className="text-2xl font-bold gradient-text dark:gradient-text gradient-text-light"
                        data-testid={`stat-${stat.label.replace(" ", "-")}`}
                      >
                        {stat.value}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">{stat.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="hidden lg:flex items-center justify-center relative">
                <div className="absolute inset-0 flex items-center justify-center opacity-60">
                  <RadarGraphic />
                </div>
                <div className="relative z-10 w-44 h-96">
                  <div className="w-full h-full garden-scroll" style={{ height: "200%" }}>
                    <EdenSVG />
                    <EdenSVG />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-border bg-card/40">
          <div className="max-w-screen-xl mx-auto px-6 py-10">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
              {FEATURES.map((f) => (
                <div
                  key={f.title}
                  className="flex flex-col gap-4 p-6 rounded-lg border border-card-border bg-card hover:border-primary/30 transition-colors duration-200"
                  data-testid={`feature-card-${f.title.replace(/\s+/g, "-").toLowerCase()}`}
                >
                  <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
                    <f.icon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground mb-1.5">{f.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{f.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="max-w-screen-xl mx-auto px-6 py-20">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-foreground mb-3">How it works</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              From query to structured pipeline intelligence in three steps.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            <div className="hidden md:block absolute top-8 left-1/3 right-1/3 h-px bg-border" />
            {STEPS.map((step, i) => (
              <div key={step.num} className="flex flex-col items-center text-center gap-4">
                <div className="relative">
                  <div className="w-16 h-16 rounded-full border-2 border-primary/40 bg-primary/5 flex items-center justify-center">
                    <span className="text-xl font-bold text-primary">{step.num}</span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <ChevronRight className="w-4 h-4 text-primary/30 absolute -right-6 top-1/2 -translate-y-1/2 hidden md:block" />
                  )}
                </div>
                <div>
                  <h3 className="font-semibold text-foreground mb-2">{step.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-border bg-card/40">
          <div className="max-w-screen-xl mx-auto px-6 py-16 text-center">
            <div className="max-w-xl mx-auto space-y-6">
              <FlaskConical className="w-10 h-10 text-primary mx-auto" />
              <h2 className="text-3xl font-bold text-foreground">
                Ready to scan the literature?
              </h2>
              <p className="text-muted-foreground">
                Start discovering drug assets from thousands of research papers — structured,
                filtered, and ready to export.
              </p>
              <Button
                size="lg"
                className="gap-2 font-semibold h-12 px-8"
                onClick={handleEnterPortal}
                data-testid="button-footer-cta"
              >
                <LogIn className="w-4 h-4" />
                Enter Portal
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-6">
        <div className="max-w-screen-xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-bold text-foreground text-sm">
              Eden<span className="text-primary">Radar</span>
            </span>
            <span className="text-muted-foreground text-xs">· AI Biotech Asset Intelligence</span>
          </div>
          <nav className="flex items-center gap-4">
            <button
              onClick={handleEnterPortal}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              data-testid="footer-link-portal"
            >
              Enter Portal
            </button>
          </nav>
        </div>
      </footer>
    </div>
  );
}
