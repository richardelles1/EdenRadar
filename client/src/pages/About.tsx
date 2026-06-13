import { useEffect, useRef } from "react";
import { Link } from "wouter";
import { Nav } from "@/components/Nav";
import { EdenNXBadge } from "@/components/EdenNXBadge";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useDocumentMeta } from "@/hooks/use-document-meta";
import { RadarBackground } from "@/components/RadarBackground";
import wafickPhoto from "@assets/WM_phot_1774028682960.jpg";
import richardPhoto from "@assets/Headshot1_1774028710682.jpg";

// Amber is the EdenRadar CTA / accent color, used across all brand surfaces.
const AMBER = "hsl(33 85% 44%)";
const AMBER_MARK = "hsl(33 85% 44% / 0.28)";
const AMBER_BORDER = "hsl(33 85% 44% / 0.25)";
const AMBER_BORDER_LIGHT = "hsl(33 85% 44% / 0.30)";

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
      "He holds a Doctorate in Science, a Master of Science, and certifications including CQA, PMP, and CLSSBB.",
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
      "As the founder of Oriva, Inc., Rich has harnessed the power of cutting-edge technology to redefine philanthropic development. He is a two-time Ironman and leverages his experience in endurance sports to connect with corporate wellness initiatives to power new giving trends.",
      "Rich completed his Bachelor's Degree in Business at Drexel University before earning a Master's Degree in Public Administration from Villanova University.",
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

// Quote breaks are intentionally always-dark contrast bands regardless of page theme.
function QuoteBreak({ quote, name, title }: { quote: string; name: string; title: string }) {
  const ref = useReveal(0.1);
  return (
    <section
      ref={ref}
      className="reveal-section py-20 sm:py-28"
      style={{ background: "hsl(152 40% 96%)" }}
    >
      <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
        <div
          className="text-8xl leading-none mb-2 select-none"
          style={{ color: AMBER_MARK, fontFamily: "Georgia, serif" }}
          aria-hidden="true"
        >
          &ldquo;
        </div>
        <blockquote className="text-xl sm:text-2xl font-medium text-foreground leading-relaxed">
          {quote}
        </blockquote>
        <div
          className="mt-8 pt-6"
          style={{ borderTop: "1px solid hsl(0 0% 0% / 0.1)" }}
        >
          <p className="text-sm font-semibold" style={{ color: AMBER }}>
            {name}
          </p>
          <p className="text-xs mt-0.5" style={{ color: "hsl(155 12% 38%)" }}>{title}</p>
        </div>
      </div>
    </section>
  );
}

export default function About() {
  useDocumentMeta({
    title: "About EdenRadar — Bridging Biotech Research and Industry",
    description:
      "Meet the team behind EdenRadar. We're building the connective tissue between university research, industry BD, and biotech entrepreneurs to accelerate translation of breakthrough science.",
  });
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
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground mb-6 leading-tight max-w-3xl text-balance">
              Most breakthrough science never leaves the university.{" "}
              <span style={{ color: AMBER }}>That's the gap we came to close.</span>
            </h1>
            <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed mb-10">
              EdenRadar was built by two people who've worked the problem from both sides: the research infrastructure that produces the science, and the industry teams that need it.
            </p>
            <Button
              asChild
              size="lg"
              data-testid="about-cta-main"
              className="h-11 px-8 font-semibold text-base border-0"
              style={{ background: AMBER, color: "white" }}
            >
              <Link href="/demo">
                Request Access
                <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
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
          className="reveal-section max-w-screen-xl mx-auto px-4 sm:px-6 py-20 sm:py-28"
        >
          <div
            className="rounded-2xl p-8 sm:p-12 text-center relative overflow-hidden"
            style={{
              background: "linear-gradient(135deg, hsl(152 45% 96%) 0%, hsl(150 38% 92%) 100%)",
              border: "1px solid hsl(var(--portal-scout) / 0.3)",
            }}
          >
            <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at 50% 0%, hsl(142 65% 45% / 0.08) 0%, transparent 60%)" }} aria-hidden="true" />
            <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-4">Our Mission</p>
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-6 leading-tight max-w-3xl mx-auto">
              Accelerate science to patient impact by eliminating the discovery gap between university research and industry development.
            </h2>
            <p className="text-base leading-relaxed max-w-2xl mx-auto" style={{ color: "hsl(155 12% 32%)" }}>
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
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              The founders
            </h2>
            <p className="text-base text-muted-foreground max-w-xl mx-auto leading-relaxed">
              Two professionals who worked across pharma, biotech, and research infrastructure, and saw the same discovery gap from different vantage points.
            </p>
          </div>

          <div className="space-y-16 sm:space-y-20">
            {FOUNDERS.map((founder, fi) => (
              <div
                key={fi}
                className="flex flex-col sm:flex-row gap-8 sm:gap-12 items-start"
              >
                {/* Photo */}
                <div className="flex-shrink-0 mx-auto sm:mx-0">
                  <div
                    style={{
                      width: "clamp(120px, 30vw, 172px)",
                      aspectRatio: "172 / 216",
                      borderRadius: "0.875rem",
                      overflow: "hidden",
                      border: "2px solid hsl(var(--portal-scout) / 0.35)",
                      boxShadow: "0 0 0 5px hsl(var(--portal-scout) / 0.07)",
                    }}
                  >
                    <img
                      src={founder.photo}
                      alt={`${founder.name}, ${founder.title}`}
                      loading="lazy"
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

                {/* Bio */}
                <div className="flex-1 min-w-0">
                  <h3 className="text-2xl font-bold text-foreground mb-1">{founder.name}</h3>
                  <p className="text-sm font-semibold text-primary mb-5">{founder.title}</p>
                  <div className="space-y-3">
                    {founder.bio.map((paragraph, pi) => (
                      <p
                        key={pi}
                        className="leading-relaxed"
                        style={{
                          fontSize: pi === founder.bio.length - 1 ? "0.8125rem" : "0.875rem",
                          color: pi === founder.bio.length - 1
                            ? "hsl(var(--muted-foreground) / 0.7)"
                            : "hsl(var(--muted-foreground))",
                        }}
                      >
                        {paragraph}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Quote — Richard */}
        <QuoteBreak
          quote={FOUNDERS[1].quote}
          name={FOUNDERS[1].name}
          title={FOUNDERS[1].title}
        />

        {/* Values */}
        <section
          ref={valuesRef}
          className="reveal-section max-w-screen-xl mx-auto px-4 sm:px-6 py-24 sm:py-32"
        >
          <div className="text-center mb-12">
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
                  aria-hidden="true"
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

        {/* Quote — Wafick */}
        <QuoteBreak
          quote={FOUNDERS[0].quote}
          name={FOUNDERS[0].name}
          title={FOUNDERS[0].title}
        />

        {/* Bottom CTA */}
        <section className="max-w-screen-xl mx-auto px-4 sm:px-6 py-24 sm:py-32">
          <div
            className="rounded-2xl p-10 sm:p-14 text-center relative overflow-hidden"
            style={{
              background: "linear-gradient(135deg, hsl(38 80% 96%) 0%, hsl(33 65% 90%) 100%)",
              border: `1px solid ${AMBER_BORDER}`,
            }}
          >
            <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at 50% 0%, hsl(33 85% 50% / 0.08) 0%, transparent 60%)" }} aria-hidden="true" />
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-4">
              The discovery gap is a solvable problem.
            </h2>
            <p className="mb-8 max-w-md mx-auto" style={{ color: "hsl(25 35% 32%)" }}>
              EdenRadar was built to close it: systematically, at scale, starting with the first search you run.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                asChild
                size="lg"
                data-testid="about-cta-bottom"
                className="h-11 px-7 font-semibold"
                style={{ background: AMBER, color: "white", border: "none" }}
              >
                <Link href="/demo">
                  Request Access
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                data-testid="about-cta-pricing"
                className="h-11 px-7 font-semibold"
                style={{ background: "transparent", border: `1px solid ${AMBER_BORDER}`, color: "hsl(25 70% 32%)" }}
              >
                <Link href="/pricing">See Pricing</Link>
              </Button>
            </div>
          </div>
        </section>

      </main>

      <footer className="relative z-10 border-t border-border py-8 px-4 sm:px-6 text-xs text-muted-foreground">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-6">
          <p>© {new Date().getFullYear()} EdenRadar. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <Link href="/demo" className="hover:text-foreground transition-colors" data-testid="footer-link-demo">Request Access</Link>
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
