import { useEffect, useRef } from "react";
import { useLocation, Link } from "wouter";
import { Nav } from "@/components/Nav";
import { EdenNXBadge } from "@/components/EdenNXBadge";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useDocumentMeta } from "@/hooks/use-document-meta";
import { RadarBackground } from "@/components/RadarBackground";
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


const FOUNDERS = [
  {
    name: "Wafick Mohamed",
    title: "Co-Founder & Chief Executive Officer",
    photo: wafickPhoto,
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
    title: "Science First",
    desc: "Every decision at EdenRadar traces back to one question: does this advance the science that helps patients?",
  },
  {
    title: "Built to Scale",
    desc: "From 350+ tech transfer offices to global research ecosystems, we architect platforms that grow with the industry.",
  },
  {
    title: "People Behind the Science",
    desc: "We believe the best deals start with relationships. EdenRadar connects the humans behind the discoveries with the teams that can bring them to market.",
  },
  {
    title: "Uncompromising Quality",
    desc: "Grounded in pharmaceutical-grade operational discipline, our team brings rigorous standards to every layer of the platform.",
  },
];

export default function About() {
  useDocumentMeta({
    title: "About EdenRadar — Bridging Biotech Research and Industry",
    description:
      "Meet the team behind EdenRadar. We're building the connective tissue between university research, industry BD, and biotech entrepreneurs to accelerate translation of breakthrough science.",
  });
  const [, navigate] = useLocation();
  const missionRef = useReveal();
  const foundersRef = useReveal();
  const valuesRef = useReveal();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Nav />

      <main className="relative z-10 flex-1">

        {/* Hero */}
        <section className="relative overflow-hidden" style={{ minHeight: "52vh" }}>
          <RadarBackground />
          <div
            className="relative z-10 flex flex-col items-center justify-center text-center px-4 sm:px-6"
            style={{ minHeight: "52vh", paddingTop: "7rem", paddingBottom: "5rem" }}
          >
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground mb-6 leading-tight max-w-3xl">
              Built by industry insiders,{" "}
              <span style={{ color: "hsl(33 85% 44%)" }}>for the industry.</span>
            </h1>
            <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed mb-10">
              EdenRadar was founded on a single conviction: the world's most important biotech assets are locked inside university technology transfer offices, and the industry teams that need them have no efficient way to find them.
            </p>
            <Button
              size="lg"
              onClick={() => navigate("/login")}
              data-testid="about-cta-main"
              className="h-11 px-8 font-semibold text-base border-0"
              style={{ background: "hsl(33 85% 44%)", color: "white" }}
            >
              Get Started
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
          <div
            className="absolute bottom-0 left-0 right-0 h-20 pointer-events-none"
            style={{ background: "linear-gradient(to bottom, transparent, hsl(var(--background)))" }}
          />
        </section>

        {/* Mission */}
        <section
          ref={missionRef}
          className="reveal-section max-w-screen-xl mx-auto px-4 sm:px-6 py-16"
        >
          <div
            className="rounded-2xl p-8 sm:p-12 text-center relative overflow-hidden"
            style={{
              background: "linear-gradient(135deg, hsl(222 47% 7%) 0%, hsl(142 45% 8%) 60%, hsl(155 40% 10%) 100%)",
              border: "1px solid hsl(var(--portal-scout) / 0.2)",
            }}
          >
            <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at 50% 0%, hsl(142 65% 55% / 0.15) 0%, transparent 60%)" }} aria-hidden />
            <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-4">Our Mission</p>
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-6 leading-tight max-w-3xl mx-auto">
              Accelerate science to patient impact by eliminating the discovery gap between university research and industry development.
            </h2>
            <p className="text-muted-foreground text-base leading-relaxed max-w-2xl mx-auto">
              Every year, thousands of licensable technologies sit quietly inside research institutions while industry teams spend months and millions searching through fragmented databases and cold calls. EdenRadar changes that with EDEN-enriched discovery, structured intelligence, and a connected ecosystem designed for the modern biotech deal.
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
                        border: "3px solid hsl(var(--portal-scout) / 0.5)",
                        boxShadow: "0 0 0 4px hsl(var(--portal-scout) / 0.1)",
                      }}
                    >
                      <img
                        src={founder.photo}
                        alt={`${founder.name}, ${founder.title}`}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          objectPosition: "center top",
                          display: "block",
                        }}
                      />
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
                    background: "hsl(var(--portal-scout) / 0.08)",
                    border: "1px solid hsl(var(--portal-scout) / 0.18)",
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
          <div className="divide-y divide-border/60">
            {VALUES.map((v, i) => (
              <div
                key={i}
                className="stagger-item grid grid-cols-[3rem_1fr] sm:grid-cols-[5rem_1fr] gap-6 py-8 items-start"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <span
                  className="text-5xl sm:text-6xl font-bold tabular-nums leading-none select-none font-mono mt-0.5"
                  style={{ color: "hsl(var(--primary) / 0.20)" }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 className="font-bold text-foreground text-base mb-2">{v.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{v.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="max-w-screen-xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <div
            className="rounded-2xl p-10 sm:p-14 text-center relative overflow-hidden"
            style={{
              background: "linear-gradient(135deg, hsl(25 80% 6%) 0%, hsl(33 75% 9%) 60%, hsl(38 70% 7%) 100%)",
              border: "1px solid hsl(33 85% 44% / 0.25)",
            }}
          >
            <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at 50% 0%, hsl(33 85% 44% / 0.12) 0%, transparent 60%)" }} aria-hidden />
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
              The discovery gap is a solvable problem.
            </h2>
            <p className="mb-8 max-w-md mx-auto" style={{ color: "hsl(33 40% 68%)" }}>
              EdenRadar was built to close it — systematically, at scale, starting with the first search you run.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                size="lg"
                onClick={() => navigate("/login")}
                data-testid="about-cta-bottom"
                className="h-11 px-7 font-semibold"
                style={{ background: "hsl(38 25% 91%)", color: "hsl(25 80% 12%)", border: "none" }}
              >
                Get Started
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              <Button
                size="lg"
                onClick={() => navigate("/pricing")}
                data-testid="about-cta-pricing"
                className="h-11 px-7 font-semibold"
                style={{ background: "transparent", border: "1px solid hsl(33 85% 44% / 0.3)", color: "hsl(33 60% 68%)" }}
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
