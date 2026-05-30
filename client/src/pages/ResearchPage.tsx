import { useEffect, useRef } from "react";
import { useLocation, Link } from "wouter";
import { Nav } from "@/components/Nav";
import { useDocumentMeta } from "@/hooks/use-document-meta";
import { useAuth } from "@/hooks/use-auth";
import {
  Lightbulb, FlaskConical, Sprout, ShoppingBag,
  ArrowRight,
} from "lucide-react";

/* ── Scroll-reveal hook ─────────────────────────────────────────── */
function useScrollReveal(ref: React.RefObject<HTMLElement>) {
  useEffect(() => {
    if (!ref.current) return;
    const els = ref.current.querySelectorAll<HTMLElement>(".reveal");
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("is-visible");
            // Trigger bar animations when the visual panels appear
            const scoreBar = (e.target as HTMLElement).querySelector<HTMLElement>(".score-bar-fill");
            if (scoreBar) setTimeout(() => scoreBar.classList.add("animated"), 400);
            const progressBar = (e.target as HTMLElement).querySelector<HTMLElement>(".progress-bar-fill");
            if (progressBar) setTimeout(() => progressBar.classList.add("animated"), 400);
          }
        });
      },
      { threshold: 0.12 }
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [ref]);
}

export default function ResearchPage() {
  const [, navigate] = useLocation();
  const { session, role, loading } = useAuth();
  const pageRef = useRef<HTMLDivElement>(null);
  useScrollReveal(pageRef);

  useDocumentMeta({
    title: "Research Tools — EdenRadar",
    description:
      "EdenDiscovery and EdenLab: free tools for researchers to score ideas, build projects, and get discovered by industry.",
  });

  // Redirect logged-in users to their portal
  useEffect(() => {
    if (loading) return;
    if (session && role) {
      if (role === "researcher") navigate("/research/dashboard", { replace: true });
    }
  }, [loading, session, role, navigate]);

  return (
    <div ref={pageRef} className="min-h-screen research-page-bg font-sans antialiased">
      <Nav />

      {/* ── Hero ──────────────────────────────────────────────────── */}
      <div className="research-hero-wrap">
        <div className="research-aurora" aria-hidden />
        <div className="research-hero reveal">
          <h1 className="research-hero-h1">
            The tools researchers use<br />
            to{" "}
            <span style={{ color: "hsl(262 65% 52%)" }}>build</span>
            {" "}and be{" "}
            <span style={{ color: "hsl(38 85% 44%)" }}>discovered.</span>
          </h1>
          <p className="research-hero-sub">
            Two free tools for every stage of your research journey. From first idea through active project to industry partnership.
          </p>
          <div className="research-hero-ctas">
            <Link href="/discovery/submit">
              <button className="btn-discovery-lg">
                <Lightbulb className="w-4 h-4" />
                Submit a concept
              </button>
            </Link>
            <Link href="/research/projects">
              <button className="btn-lab-lg">
                <FlaskConical className="w-4 h-4" />
                Start a project
              </button>
            </Link>
          </div>
        </div>
      </div>

      {/* ── Pathway ───────────────────────────────────────────────── */}
      <div className="research-pathway">
        <p className="pathway-label reveal">How your research reaches industry</p>
        <div className="pathway-grid reveal">

          <div className="pathway-step">
            <div className="step-icon-wrap" style={{ background: "hsl(38 85% 48% / 0.12)" }}>
              <Lightbulb className="w-6 h-6" style={{ color: "hsl(38 85% 40%)" }} />
            </div>
            <div className="step-num" style={{ color: "hsl(38 85% 40%)" }}>Step 01</div>
            <div className="step-title">Register your idea</div>
            <div className="step-desc">Score your concept before the science starts. Timestamp your idea and put it on the map.</div>
            <Link href="/discovery">
              <a className="step-chip" style={{ background: "hsl(38 85% 48% / 0.12)", color: "hsl(38 75% 32%)" }}>
                EdenDiscovery
              </a>
            </Link>
          </div>

          <div className="pathway-arrow" aria-hidden>
            <ArrowRight className="w-5 h-5" style={{ color: "hsl(30 15% 72%)" }} />
          </div>

          <div className="pathway-step">
            <div className="step-icon-wrap" style={{ background: "hsl(262 65% 58% / 0.12)" }}>
              <FlaskConical className="w-6 h-6" style={{ color: "hsl(262 65% 46%)" }} />
            </div>
            <div className="step-num" style={{ color: "hsl(262 65% 46%)" }}>Step 02</div>
            <div className="step-title">Build your project</div>
            <div className="step-desc">Structured workspace for translational research. Hypothesis, grants, and IP all in one place.</div>
            <Link href="/research">
              <a className="step-chip" style={{ background: "hsl(262 65% 58% / 0.12)", color: "hsl(262 55% 36%)" }}>
                EdenLab
              </a>
            </Link>
          </div>

          <div className="pathway-arrow" aria-hidden>
            <ArrowRight className="w-5 h-5" style={{ color: "hsl(30 15% 72%)" }} />
          </div>

          <div className="pathway-step">
            <div className="step-icon-wrap" style={{ background: "hsl(142 52% 36% / 0.12)" }}>
              <Sprout className="w-6 h-6" style={{ color: "hsl(142 52% 32%)" }} />
            </div>
            <div className="step-num" style={{ color: "hsl(142 45% 32%)" }}>Step 03</div>
            <div className="step-title">Get discovered</div>
            <div className="step-desc">Your asset surfaces to BD teams searching in your indication and modality. No pitch required.</div>
            <Link href="/">
              <a className="step-chip" style={{ background: "hsl(142 52% 36% / 0.12)", color: "hsl(142 45% 28%)" }}>
                EdenRadar
              </a>
            </Link>
          </div>

          <div className="pathway-arrow" aria-hidden>
            <ArrowRight className="w-5 h-5" style={{ color: "hsl(30 15% 72%)" }} />
          </div>

          <div className="pathway-step">
            <div className="step-icon-wrap" style={{ background: "hsl(234 80% 58% / 0.12)" }}>
              <ShoppingBag className="w-6 h-6" style={{ color: "hsl(234 70% 48%)" }} />
            </div>
            <div className="step-num" style={{ color: "hsl(234 70% 46%)" }}>Step 04</div>
            <div className="step-title">Control the deal</div>
            <div className="step-desc">List on EdenMarket when ready. Blind by default, identity revealed only when you agree.</div>
            <Link href="/market">
              <a className="step-chip" style={{ background: "hsl(234 80% 58% / 0.12)", color: "hsl(234 65% 38%)" }}>
                EdenMarket
              </a>
            </Link>
          </div>

        </div>
      </div>

      {/* ── EdenDiscovery section ─────────────────────────────────── */}
      <div className="research-section-wrap">
        <div className="research-section">
          <div className="reveal">
            <div className="product-badge">
              <div className="product-badge-icon" style={{ background: "hsl(38 85% 44%)" }}>
                <Lightbulb className="w-4 h-4 text-white" />
              </div>
              <span className="product-badge-text">
                Eden<span style={{ color: "hsl(38 85% 40%)" }}>Discovery</span>
              </span>
            </div>
            <h2 className="section-h2">
              Score your <span style={{ color: "hsl(38 85% 44%)" }}>idea</span> before the science starts.
            </h2>
            <p className="section-body">
              Most research begins long before there is funding, a lab, or a team. EdenDiscovery gives your concept a home from day one. EDEN evaluates scientific plausibility and surfaces strong concepts to the industry teams looking for exactly your kind of science.
            </p>
            <div className="feature-list">
              {[
                { n: "01", title: "Concept registry", desc: "Submit and timestamp your idea before formal research begins. Establishes priority without filing a patent." },
                { n: "02", title: "EDEN credibility score", desc: "Every concept is evaluated on scientific plausibility, feasibility, and biotech relevance on a 0 to 100 scale." },
                { n: "03", title: "Signal to industry", desc: "High-scoring concepts surface to industry scouts and research labs before the science even begins." },
              ].map((f) => (
                <div key={f.n} className="feature-row">
                  <div className="feature-num" style={{ color: "hsl(38 85% 48% / 0.3)" }}>{f.n}</div>
                  <div>
                    <div className="feature-title">{f.title}</div>
                    <div className="feature-desc">{f.desc}</div>
                  </div>
                </div>
              ))}
            </div>
            <Link href="/discovery/submit">
              <button className="btn-discovery-lg mt-7">
                Submit a concept
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </Link>
          </div>

          {/* Discovery mock visual */}
          <div className="reveal discovery-visual-wrap">
            <div className="mock-card discovery-mock">
              <div className="mock-tag" style={{ color: "hsl(38 85% 36%)" }}>Concept #247 · Oncology</div>
              <div className="mock-title">Orally bioavailable KRAS G12D degrader for pancreatic adenocarcinoma</div>
              <div className="mock-score-row">
                <div>
                  <div className="mock-label">EDEN Score</div>
                  <div className="mock-score-num" style={{ color: "hsl(38 85% 44%)" }}>78 <span className="mock-score-denom">/ 100</span></div>
                  <div className="score-bar-track">
                    <div className="score-bar-fill" />
                  </div>
                </div>
                <div className="text-right">
                  <div className="mock-label mb-1.5">Dimensions</div>
                  <div className="mock-dims">
                    Novelty <span style={{ color: "hsl(38 85% 36%)", fontWeight: 600 }}>High</span><br />
                    Feasibility <span style={{ color: "hsl(38 85% 36%)", fontWeight: 600 }}>Moderate</span><br />
                    Relevance <span style={{ color: "hsl(38 85% 36%)", fontWeight: 600 }}>High</span>
                  </div>
                </div>
              </div>
              <div className="signal-row">
                <span className="signal-dot" />
                Surfaced to 14 industry scouts this week
              </div>
            </div>
            <div className="mock-queue">
              {[
                { name: "AAV-delivered CRISPR for Friedreich's ataxia", score: "84" },
                { name: "Bispecific NK engager targeting GD2", score: "71" },
                { name: "mRNA encoding anti-inflammatory cytokines", score: null },
              ].map((row) => (
                <div key={row.name} className={`mock-queue-row ${!row.score ? "opacity-50" : ""}`}>
                  <span className="mock-queue-name">{row.name}</span>
                  {row.score
                    ? <span className="mock-queue-score" style={{ background: "hsl(38 85% 48% / 0.12)", color: "hsl(38 75% 34%)" }}>{row.score}</span>
                    : <span className="mock-queue-score" style={{ background: "hsl(220 10% 93%)", color: "hsl(25 18% 42%)" }}>Scoring</span>
                  }
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── EdenLab section ───────────────────────────────────────── */}
      <div className="research-section-wrap research-section-alt">
        <div className="research-section research-section-flipped">

          {/* Lab mock visual */}
          <div className="reveal lab-visual-wrap">
            <div className="mock-project-name">KRAS G12D Degrader Project</div>
            <div className="mock-project-meta">EdenLab · Started March 2026 · 5 of 11 sections complete</div>
            <div className="canvas-grid">
              {[
                { n: "01", label: "Hypothesis", filled: true },
                { n: "02", label: "Prior Art", filled: true },
                { n: "03", label: "Mechanism", filled: true },
                { n: "04", label: "Study Design", filled: true },
                { n: "05", label: "Literature", filled: true },
                { n: "06", label: "IP Strategy", filled: false },
                { n: "07", label: "Grants", filled: false },
                { n: "08", label: "Collaborators", filled: false },
                { n: "09", label: "Timeline", filled: false },
                { n: "10", label: "Industry Signal", filled: false },
                { n: "11", label: "Licensing Notes", filled: false },
              ].map((cell) => (
                <div key={cell.n} className={`canvas-cell ${cell.filled ? "canvas-cell-filled" : ""}`}>
                  <div className="canvas-cell-num" style={{ color: cell.filled ? "hsl(262 55% 50%)" : "hsl(262 25% 65%)" }}>{cell.n}</div>
                  <div className="canvas-cell-label" style={{ color: cell.filled ? "hsl(262 50% 36%)" : "hsl(25 18% 40%)" }}>{cell.label}</div>
                </div>
              ))}
              <div className="canvas-cell canvas-cell-add">
                <span className="canvas-add-icon">+</span>
              </div>
            </div>
            <div className="progress-row">
              <span className="progress-label">Project completeness</span>
              <div className="progress-track">
                <div className="progress-bar-fill" />
              </div>
              <span className="progress-pct" style={{ color: "hsl(262 60% 46%)" }}>45%</span>
            </div>
          </div>

          <div className="reveal">
            <div className="product-badge">
              <div className="product-badge-icon" style={{ background: "hsl(262 65% 52%)" }}>
                <FlaskConical className="w-4 h-4 text-white" />
              </div>
              <span className="product-badge-text">
                Eden<span style={{ color: "hsl(262 65% 46%)" }}>Lab</span>
              </span>
            </div>
            <h2 className="section-h2">
              The workspace built for <span style={{ color: "hsl(262 65% 52%)" }}>translational science.</span>
            </h2>
            <p className="section-body">
              Research is non-linear but funding is not. EdenLab gives you a structured canvas for everything a translational project needs to track, from hypothesis through licensing. As your project matures, it builds visibility with industry teams looking for what you are building.
            </p>
            <div className="feature-list">
              {[
                { n: "01", title: "11-section project canvas", desc: "Hypothesis through licensing notes. Structured, versioned, and shareable with collaborators." },
                { n: "02", title: "Literature and grants", desc: "Query millions of papers and track NIH, NSF, SBIR, and foundation opportunities matched to your research profile." },
                { n: "03", title: "Industry visibility as you build", desc: "Your project score rises with completeness. Strong projects surface to industry scouts without you having to pitch." },
              ].map((f) => (
                <div key={f.n} className="feature-row">
                  <div className="feature-num" style={{ color: "hsl(262 65% 58% / 0.3)" }}>{f.n}</div>
                  <div>
                    <div className="feature-title">{f.title}</div>
                    <div className="feature-desc">{f.desc}</div>
                  </div>
                </div>
              ))}
            </div>
            <Link href="/research/projects">
              <button className="btn-lab-lg mt-7">
                Start a project
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </Link>
          </div>

        </div>
      </div>

      {/* ── Closing loop ──────────────────────────────────────────── */}
      <div className="research-loop">
        <div className="loop-inner reveal">
          <h3 className="loop-h3">You build. EdenRadar makes sure<br />the right people notice.</h3>
          <p className="loop-body">
            Every project and concept on the platform is scored, structured, and surfaced to the industry BD teams who are actively searching for licensable science. You do not need to pitch. You do not need a broker. You just need to build.
          </p>
          <div className="loop-chain">
            <span className="chain-chip" style={{ background: "hsl(38 85% 48% / 0.12)", color: "hsl(38 75% 32%)" }}>EdenDiscovery</span>
            <span className="chain-arrow">&#8594;</span>
            <span className="chain-chip" style={{ background: "hsl(262 65% 52% / 0.12)", color: "hsl(262 55% 38%)" }}>EdenLab</span>
            <span className="chain-arrow">&#8594;</span>
            <span className="chain-chip" style={{ background: "hsl(142 52% 36% / 0.12)", color: "hsl(142 45% 28%)" }}>EdenRadar</span>
            <span className="chain-arrow">&#8594;</span>
            <span className="chain-chip" style={{ background: "hsl(234 80% 55% / 0.12)", color: "hsl(234 65% 38%)" }}>EdenMarket</span>
          </div>
        </div>
      </div>

      {/* ── Bottom CTA ────────────────────────────────────────────── */}
      <div className="research-bottom-cta">
        <h2 className="bottom-cta-h2 reveal">
          Start with an <span style={{ color: "hsl(38 85% 44%)" }}>idea.</span>
          <br />
          End with a <span style={{ color: "hsl(262 65% 52%)" }}>partnership.</span>
        </h2>
        <p className="bottom-cta-sub reveal">
          Both tools are free. No credit card, no institution sign-off. Just your science and a place to build it.
        </p>
        <div className="bottom-cta-ctas reveal">
          <Link href="/discovery/submit">
            <button className="btn-discovery-lg">
              <Lightbulb className="w-4 h-4" />
              Submit a concept
            </button>
          </Link>
          <Link href="/research/projects">
            <button className="btn-lab-lg">
              <FlaskConical className="w-4 h-4" />
              Start a project
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}
