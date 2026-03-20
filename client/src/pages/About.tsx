import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Nav } from "@/components/Nav";
import { Button } from "@/components/ui/button";
import { ArrowRight, Award, Sprout, Globe, Users } from "lucide-react";
import wafickPhoto from "@assets/WM_phot_1774028682960.jpg";
import richardPhoto from "@assets/Headshot1_1774028710682.jpg";

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
            "conic-gradient(from 0deg, transparent 260deg, hsl(142 65% 48% / 0.03) 310deg, hsl(142 65% 48% / 0.10) 360deg)",
          borderRadius: "50%",
        }}
      />
      {[280, 420, 560, 700].map((r, i) => (
        <div
          key={r}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border"
          style={{
            width: r,
            height: r,
            borderColor: `hsl(142 55% 45% / ${0.05 - i * 0.008})`,
          }}
        />
      ))}
    </div>
  );
}

const FOUNDERS = [
  {
    name: "Wafick Mohamed",
    title: "Co-Founder & Chief Executive Officer",
    photo: wafickPhoto,
    credentials: ["D.Sc.", "M.S.", "CQA", "PMP", "CLSSBB"],
    bio: [
      "Dr. Wafick Mohamed is a biotech executive, entrepreneur, and educator dedicated to advancing science for patient impact. With extensive experience across global pharma and emerging biotech, he specializes in building quality systems, scaling operations, and leading organizations from the ground up.",
      "As Founder and CEO of WKM Consulting Services LLC, Dr. Mohamed has launched and shaped multiple innovative companies. He also serves as a professor of research and entrepreneurship, mentoring the next generation of scientific and business leaders.",
    ],
    quote:
      "We are extremely proud to be part of an industry that is pushing the boundaries of science to enhance patients' lives. We will help our clients identify gaps and generate new ideas and solutions to improve their processes and products.",
  },
  {
    name: "Richard Elles",
    title: "Co-Founder & Chief Operating Officer",
    photo: richardPhoto,
    credentials: ["M.P.A.", "B.S. Business", "PMP", "Drexel", "Villanova"],
    bio: [
      "Richard Elles is a dynamic healthcare leader with a diverse background in strategy development, corporate leadership, patient advocacy, and process improvement. A dedicated and PMP-certified Project Manager, Rich has deployed extensive management systems across consulting firms, healthtech startups, academic institutions, and research teams.",
      "As the founder of Oriva, Inc., Rich has harnessed the power of cutting-edge technology to redefine philanthropic development. He is a two-time Ironman and leverages his experience in endurance sports to connect with corporate wellness initiatives to power new giving trends. Rich completed his Bachelor's Degree in Business at Drexel University before earning a Master's Degree in Public Administration from Villanova University.",
    ],
    quote:
      "We are thrilled to bring new energy and laser focus to an industry in need of organization as it drives innovation. The opportunity to create in biotech and research spaces is matched only by the promise of what success will unlock for patients and consumers worldwide.",
  },
];

const VALUES = [
  {
    icon: Sprout,
    title: "Science First",
    desc: "Every decision at EdenRadar traces back to one question: does this advance the science that helps patients?",
  },
  {
    icon: Globe,
    title: "Built to Scale",
    desc: "From 150 tech transfer offices to global research ecosystems, we architect platforms that grow with the industry.",
  },
  {
    icon: Users,
    title: "People Behind the Science",
    desc: "We believe the best deals start with relationships. EdenRadar connects the humans behind the discoveries with the teams that can bring them to market.",
  },
  {
    icon: Award,
    title: "Uncompromising Quality",
    desc: "Grounded in pharmaceutical-grade operational discipline, our team brings rigorous standards to every layer of the platform.",
  },
];

export default function About() {
  const [, navigate] = useLocation();
  const missionRef = useReveal();
  const foundersRef = useReveal();
  const valuesRef = useReveal();

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
            <Sprout className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold text-primary tracking-widest uppercase">
              Founded Early 2026
            </span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground mb-6 leading-tight">
            Built by industry insiders,{" "}
            <span className="gradient-text">for the industry.</span>
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed mb-10">
            EdenRadar was founded on a single conviction: the world's most important biotech assets are locked inside university technology transfer offices, and the industry teams that need them have no efficient way to find them.
          </p>
          <Button
            size="lg"
            onClick={() => navigate("/login")}
            data-testid="about-cta-main"
            className="h-12 px-8 font-semibold text-base"
            style={{ background: "hsl(142 52% 36%)", color: "white", border: "none" }}
          >
            Get Started
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </section>

        {/* Mission */}
        <section
          ref={missionRef}
          className="reveal-section max-w-screen-xl mx-auto px-4 sm:px-6 py-16"
        >
          <div
            className="rounded-2xl p-8 sm:p-12 text-center"
            style={{
              background: "linear-gradient(135deg, hsl(222 47% 7%) 0%, hsl(142 45% 8%) 60%, hsl(155 40% 10%) 100%)",
              border: "1px solid hsl(142 52% 36% / 0.2)",
            }}
          >
            <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-4">Our Mission</p>
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-6 leading-tight max-w-3xl mx-auto">
              Accelerate science to patient impact by eliminating the discovery gap between university research and industry development.
            </h2>
            <p className="text-muted-foreground text-base leading-relaxed max-w-2xl mx-auto">
              Every year, thousands of licensable technologies sit quietly inside research institutions while industry teams spend months and millions searching through fragmented databases and cold calls. EdenRadar changes that with AI-powered discovery, enriched intelligence, and a connected ecosystem designed for the modern biotech deal.
            </p>
          </div>
        </section>

        {/* Founders */}
        <section
          ref={foundersRef}
          className="reveal-section max-w-screen-xl mx-auto px-4 sm:px-6 py-16"
        >
          <div className="text-center mb-14">
            <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-3">Leadership</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
              The founders
            </h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 sm:gap-14">
            {FOUNDERS.map((founder, fi) => (
              <div key={fi} className="flex flex-col gap-6">
                {/* Card */}
                <div
                  className="rounded-2xl p-7 sm:p-9 flex flex-col sm:flex-row gap-7 items-start"
                  style={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                  }}
                >
                  {/* Photo circle */}
                  <div className="flex-shrink-0 flex flex-col items-center gap-3 mx-auto sm:mx-0">
                    <div
                      className="overflow-hidden"
                      style={{
                        width: 128,
                        height: 128,
                        borderRadius: "50%",
                        border: "3px solid hsl(142 52% 36% / 0.5)",
                        boxShadow: "0 0 0 4px hsl(142 52% 36% / 0.1)",
                      }}
                    >
                      <img
                        src={founder.photo}
                        alt={founder.name}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          objectPosition: "center top",
                          display: "block",
                        }}
                      />
                    </div>
                    {/* Credential pills */}
                    <div className="flex flex-wrap gap-1.5 justify-center max-w-[150px]">
                      {founder.credentials.map((c) => (
                        <span
                          key={c}
                          className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                          style={{
                            background: "hsl(142 52% 36% / 0.12)",
                            color: "hsl(142 65% 55%)",
                            border: "1px solid hsl(142 52% 36% / 0.2)",
                          }}
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Bio text */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xl font-bold text-foreground mb-0.5">{founder.name}</h3>
                    <p className="text-sm font-semibold text-primary mb-4">{founder.title}</p>
                    <div className="space-y-3">
                      {founder.bio.map((paragraph, pi) => (
                        <p key={pi} className="text-sm text-muted-foreground leading-relaxed">
                          {paragraph}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Founder quote */}
                <div
                  className="rounded-xl px-7 py-5"
                  style={{
                    background: "hsl(142 52% 36% / 0.06)",
                    border: "1px solid hsl(142 52% 36% / 0.18)",
                    borderLeft: "3px solid hsl(142 52% 36%)",
                  }}
                >
                  <p className="text-sm italic text-foreground leading-relaxed">
                    "{founder.quote}"
                  </p>
                  <p className="mt-3 text-xs font-semibold text-primary">{founder.name}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Values */}
        <section
          ref={valuesRef}
          className="reveal-section max-w-screen-xl mx-auto px-4 sm:px-6 py-16"
        >
          <div className="text-center mb-12">
            <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-3">What Drives Us</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
              Our values
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {VALUES.map((v, i) => (
              <div
                key={i}
                className="flex gap-4 p-6 rounded-xl border border-border bg-card hover:border-primary/30 transition-colors duration-200"
              >
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <v.icon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground mb-1.5">{v.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{v.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="max-w-screen-xl mx-auto px-4 sm:px-6 py-16 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-4">
            Ready to see what EdenRadar can do?
          </h2>
          <p className="text-muted-foreground mb-8 max-w-md mx-auto">
            Join the growing community of biotech professionals using AI to find the next generation of assets.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              size="lg"
              onClick={() => navigate("/login")}
              data-testid="about-cta-bottom"
              className="h-11 px-7 font-semibold"
              style={{ background: "hsl(142 52% 36%)", color: "white", border: "none" }}
            >
              Get Started
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => navigate("/how-it-works")}
              data-testid="about-cta-pricing"
              className="h-11 px-7 font-semibold"
            >
              See Pricing
            </Button>
          </div>
        </section>

      </main>

      <footer className="relative z-10 border-t border-border py-8 px-4 sm:px-6 text-center text-xs text-muted-foreground">
        <p>2026 EdenRadar. All rights reserved.</p>
      </footer>
    </div>
  );
}
