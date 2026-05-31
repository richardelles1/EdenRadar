import { useRef, useEffect, useState } from "react";
import { Link } from "wouter";
import { Nav } from "@/components/Nav";
import { useMarketSubscribe } from "@/hooks/use-market-subscribe";
import { useDocumentMeta } from "@/hooks/use-document-meta";
import {
  EyeOff, Lock, ArrowRight, Loader2, CheckCircle2,
  FileText, Search, Layers, Activity, Heart, Zap, Send,
} from "lucide-react";

const C = {
  bg:        "hsl(36 30% 98%)",
  card:      "hsl(0 0% 100%)",
  fg:        "hsl(230 25% 10%)",
  muted:     "hsl(230 15% 30%)",
  border:    "hsl(230 18% 90%)",
  borderDim: "hsl(230 18% 93%)",
  indigo:    "hsl(234 80% 58%)",
  indigoDk:  "hsl(234 70% 44%)",
  emerald:   "hsl(142 52% 36%)",
};

const LISTINGS = [
  {
    id: "1", name: "BCMA-targeting CAR-T (preclinical)", confidential: false, verified: true,
    badges: ["Oncology", "Cell Therapy", "Preclinical"],
    engagement: "Actively Seeking",
    engStyle: { background: "hsl(142 50% 50% / 0.1)", color: "hsl(142 52% 32%)", borderColor: "hsl(142 52% 36% / 0.25)" },
    summary: "Autologous CAR-T candidate with novel binder showing 100% tumor regression in MM xenografts. IND-enabling tox underway. Composition-of-matter IP filed.",
    price: "$5M – $12M", eois: 4, score: 86,
    scoreStyle: { background: "hsl(142 50% 50% / 0.08)", color: "hsl(142 52% 32%)", borderColor: "hsl(142 52% 36% / 0.3)" },
  },
  {
    id: "2", name: null, confidential: true, verified: false,
    badges: ["Neurology", "Small Molecule", "Phase 1"],
    engagement: "Quietly Inbound",
    engStyle: { background: "hsl(38 85% 48% / 0.1)", color: "hsl(38 75% 34%)", borderColor: "hsl(38 85% 44% / 0.25)" },
    summary: "Orally bioavailable, brain-penetrant kinase inhibitor for rare neurodegenerative indication. Phase 1 SAD complete with clean safety profile and favorable PK.",
    price: "Price on request", eois: 2, score: 72,
    scoreStyle: { background: "hsl(38 85% 48% / 0.08)", color: "hsl(38 75% 34%)", borderColor: "hsl(38 85% 44% / 0.3)" },
  },
  {
    id: "3", name: "Anti-PD-L1 / VEGF bispecific", confidential: false, verified: true,
    badges: ["Oncology", "Bispecific Antibody", "IND-Ready"],
    engagement: "Under LOI",
    engStyle: { background: "hsl(234 80% 58% / 0.1)", color: "hsl(234 70% 44%)", borderColor: "hsl(234 80% 58% / 0.25)" },
    summary: "Composition-of-matter IP, manufacturable construct, strong PK in NHP. TTO seeks exclusive global license. 7 EOIs received within 30 days of listing.",
    price: "$2M – $6M", eois: 7, score: 91,
    scoreStyle: { background: "hsl(142 50% 50% / 0.08)", color: "hsl(142 52% 32%)", borderColor: "hsl(142 52% 36% / 0.3)" },
  },
];

const SCORE_FACTORS = [
  { label: "EdenRadar asset linked",     pct: 100, pts: "+30" },
  { label: "Enrichment completeness",    pct: 90,  pts: "+18" },
  { label: "Patent filed (COM)",         pct: 100, pts: "+10" },
  { label: "Clinical stage (IND-Ready)", pct: 100, pts: "+10" },
  { label: "Scientific specificity",     pct: 100, pts: "+10" },
  { label: "Price range stated",         pct: 100, pts: "+10" },
  { label: "Active engagement status",   pct: 60,  pts: "+3"  },
];

const BLIND_FIELDS = [
  { name: "Asset name",                hidden: true  },
  { name: "Institution / organization", hidden: true  },
  { name: "Inventor names",            hidden: true  },
  { name: "Mechanism detail",          hidden: false },
  { name: "Patent numbers",            hidden: true  },
];

const SELLER_TYPES = [
  { Icon: Layers,   title: "TTOs and University Labs",          body: "Purpose-built for technology transfer. TRL fields, patent number tracking, inventor affiliation, and TTO reference numbers included. Admin-reviewed before going live." },
  { Icon: Activity, title: "Biotechs with Deprioritized Assets", body: "Quietly list a paused program without triggering competitive signals. Blind mode keeps your institution and asset identity hidden until you choose to reveal them." },
  { Icon: Heart,    title: "Independent Inventors",              body: "Your EDEN credibility score from EdenDiscovery carries into EdenMarket. High-scoring concepts surface to the same BD teams browsing licensed programs." },
];

const LISTING_STEPS = [
  { num: "01", title: "Create your listing", body: "Fill out the 4-step wizard: TA, modality, stage, mechanism, price range, and blind field controls. Link to an EdenRadar asset to unlock intelligence features." },
  { num: "02", title: "Eden reviews it",     body: "Our team reviews every submission within 1 to 2 business days. We verify seller authority and confirm the listing meets quality standards before it goes live." },
  { num: "03", title: "EOIs come to you",    body: "Receive structured EOIs: company, role, rationale, budget, timeline. Accept or decline. No cold outreach from us, no unwanted introductions." },
  { num: "04", title: "Close with Eden",     body: "Deal room handles the rest. Success fee only when terms are executed. Nothing owed for browsing, listing, or receiving EOIs that don't close." },
];

const MESSAGES = [
  { side: "theirs", initials: "NB", color: "hsl(234 60% 55%)", text: "Thanks for accepting our EOI. We've uploaded the full data package; let us know if you need the NHP PK breakdown separately.", time: "Novartis BD · 2 days ago" },
  { side: "mine",   initials: "UM", color: "hsl(38 85% 44%)",  text: "Downloaded and reviewing now. IP summary looks clean. We'll have questions on the exclusivity scope by end of week.", time: "U of M TTO · 1 day ago" },
  { side: "theirs", initials: "NB", color: "hsl(234 60% 55%)", text: "Sounds good. We're flexible on geography: US+EU exclusive, ROW non-exclusive is our preferred structure but open to discussion.", time: "Novartis BD · 18 hours ago" },
  { side: "mine",   initials: "UM", color: "hsl(38 85% 44%)",  text: "That works as a starting point. I'll update the term sheet with those fields; check back in a few hours.", time: "U of M TTO · 12 hours ago" },
];

const BLIND_ROWS = [
  { key: "Asset",            val: "KRAS G12D Degrader IND-Ready",       blurred: true  },
  { key: "Institution",      val: "University of Michigan TTO",          blurred: true  },
  { key: "Therapeutic Area", val: "Oncology",                            blurred: false },
  { key: "Modality",         val: "Small Molecule",                      blurred: false },
  { key: "Stage",            val: "IND-Ready",                           blurred: false },
  { key: "Mechanism",        val: "Targeted protein degradation via PROTAC", blurred: false },
  { key: "Asking Price",     val: "$8M – $20M upfront",                  blurred: false },
  { key: "Inventors",        val: "Dr. Sarah Kwan et al.",               blurred: true  },
  { key: "Patent #",         val: "US 11,234,567 B2",                    blurred: true  },
];

export default function MarketPreview() {
  useDocumentMeta({
    title: "EdenMarket — Confidential Biopharma Deal Marketplace | EdenRadar",
    description:
      "EdenMarket is the confidential biopharma deal marketplace. Browse licensable TTO spin-outs and deprioritized programs, submit EOIs, and close inside NDA-gated deal rooms.",
  });
  const { subscribe, isLoading } = useMarketSubscribe();

  const pageRef   = useRef<HTMLDivElement>(null);
  const scoreRef  = useRef<HTMLDivElement>(null);
  const arcRef    = useRef<SVGCircleElement>(null);
  const barRefs   = useRef<(HTMLDivElement | null)[]>([]);
  const [scoreCount, setScoreCount] = useState(0);
  const scoreFiredRef = useRef(false);

  useEffect(() => {
    const root = pageRef.current;
    if (!root) return;
    const obs = new IntersectionObserver(
      (entries) => entries.forEach(e => { if (e.isIntersecting) (e.target as HTMLElement).classList.add("is-visible"); }),
      { threshold: 0.1 }
    );
    root.querySelectorAll(".mkt-reveal").forEach(n => obs.observe(n));
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const el = scoreRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => entries.forEach(e => {
        if (!e.isIntersecting || scoreFiredRef.current) return;
        scoreFiredRef.current = true;
        obs.disconnect();
        barRefs.current.forEach((bar, i) => {
          if (!bar) return;
          setTimeout(() => bar.classList.add("go"), i * 110);
        });
        const arc = arcRef.current;
        if (arc) setTimeout(() => arc.classList.add("go"), 200);
        const target = 91, dur = 1800, t0 = performance.now();
        const tick = (now: number) => {
          const p = Math.min((now - t0) / dur, 1);
          setScoreCount(Math.round((1 - Math.pow(1 - p, 4)) * target));
          if (p < 1) requestAnimationFrame(tick);
        };
        setTimeout(() => requestAnimationFrame(tick), 300);
      }),
      { threshold: 0.2 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const badge = (label: string, style: React.CSSProperties) => (
    <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 5, border: "1px solid", ...style }}>{label}</span>
  );

  return (
    <div ref={pageRef} style={{ background: C.bg, color: C.fg }}>
      <Nav />

      {/* ── Hero ── */}
      <div style={{ position: "relative", overflow: "hidden" }}>
        <div className="market-aurora" aria-hidden />
        <div className="mkt-hero-grid" style={{ position: "relative", maxWidth: 1200, margin: "0 auto", padding: "88px 48px 80px" }}>

          {/* Copy */}
          <div className="mkt-reveal">
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 500, color: C.muted, marginBottom: 24 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.indigo, display: "inline-block", flexShrink: 0 }} />
              EdenMarket · Confidential Deal Marketplace
            </div>
            <h1 style={{ fontSize: "clamp(38px, 4.8vw, 56px)", fontWeight: 800, lineHeight: 1.07, letterSpacing: "-0.035em", color: C.fg, marginBottom: 24 }}>
              Curated biotech deals.<br />
              <span style={{ color: C.indigo }}>Confidential</span> by design.
            </h1>
            <p style={{ fontSize: 17, color: C.muted, lineHeight: 1.7, maxWidth: 480, marginBottom: 36 }}>
              EdenMarket connects TTOs, university labs, and biotechs with qualified industry buyers inside private, NDA-gated deal rooms. No brokers. No cold outreach.
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button
                onClick={() => subscribe({ redirectTo: "/market" })}
                disabled={isLoading}
                data-testid="market-preview-subscribe-hero"
                style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 24px", borderRadius: 9, border: "none", background: C.indigo, color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 20px hsl(234 80% 58% / 0.28)" }}
              >
                {isLoading ? <Loader2 size={15} className="animate-spin" /> : null}
                {isLoading ? "Redirecting…" : "Browse Listings"}
              </button>
              <Link href="/market/list">
                <button
                  data-testid="market-preview-list-cta"
                  style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 24px", borderRadius: 9, border: "1.5px solid hsl(234 80% 58% / 0.35)", background: "hsl(234 80% 58% / 0.06)", color: C.indigoDk, fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                >
                  List an Asset <ArrowRight size={13} />
                </button>
              </Link>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 36 }}>
              {["NDA before any identity is shared", "No broker fees", "Admin-reviewed", "Free to browse"].map((s, i) => (
                <span key={s} style={{ fontSize: 12, fontWeight: 500, color: C.muted }}>
                  {i > 0 && <span style={{ color: "hsl(230 15% 78%)", marginRight: 6 }}>·</span>}
                  {s}
                </span>
              ))}
            </div>
          </div>

          {/* Floating cards */}
          <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ position: "absolute", top: -18, right: -16, background: "hsl(142 50% 50% / 0.1)", border: "1px solid hsl(142 52% 36% / 0.3)", borderRadius: 8, padding: "6px 10px", display: "flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 700, color: "hsl(142 52% 30%)", boxShadow: "0 2px 12px hsl(142 40% 30% / 0.12)", whiteSpace: "nowrap", zIndex: 2 }}>
              <Zap size={10} /> High Signal · 91
            </div>
            <div className="market-hero-card-1" style={{ background: C.card, border: "1px solid hsl(230 18% 88%)", borderRadius: 13, padding: "18px 20px", boxShadow: "0 8px 40px hsl(234 40% 20% / 0.10), 0 2px 8px hsl(234 40% 20% / 0.06)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.fg, lineHeight: 1.3, maxWidth: 200 }}>Anti-PD-L1 / VEGF Bispecific Antibody</div>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 5, background: "hsl(234 80% 58% / 0.1)", color: C.indigoDk, border: "1px solid hsl(234 80% 58% / 0.25)" }}>
                  <CheckCircle2 size={9} /> Verified
                </span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
                {["Oncology", "Bispecific Antibody", "IND-Ready"].map(b => (
                  <span key={b} style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 5, border: `1px solid ${C.border}`, color: C.muted }}>{b}</span>
                ))}
              </div>
              <p style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.55, marginBottom: 12, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" } as React.CSSProperties}>
                Composition-of-matter IP, manufacturable construct, strong PK in NHP. TTO seeks exclusive global license. 7 EOIs received within 30 days.
              </p>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 10, borderTop: `1px solid ${C.borderDim}` }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.fg }}>$2M – $6M</div>
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 1 }}>7 EOIs · Under LOI</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "hsl(142 50% 50% / 0.08)", color: "hsl(142 52% 32%)", border: "1px solid hsl(142 52% 36% / 0.3)" }}><Zap size={9} /> 91</span>
                  <button style={{ fontSize: 10, fontWeight: 700, padding: "4px 10px", borderRadius: 6, border: "none", background: C.indigo, color: "white", cursor: "default" }}>Submit EOI</button>
                </div>
              </div>
            </div>
            <div className="market-hero-card-2" style={{ marginLeft: 24, background: "hsl(234 50% 98%)", border: "1px solid hsl(234 40% 88%)", borderRadius: 13, padding: "18px 20px", boxShadow: "0 4px 20px hsl(234 40% 20% / 0.07)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: C.muted, fontStyle: "italic" }}><EyeOff size={12} /> Confidential Listing</div>
                <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 5, background: "hsl(38 85% 48% / 0.1)", color: "hsl(38 75% 34%)", border: "1px solid hsl(38 85% 44% / 0.25)" }}>Quietly Inbound</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
                {["Neurology", "Small Molecule", "Phase 1"].map(b => (
                  <span key={b} style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 5, border: `1px solid ${C.border}`, color: C.muted }}>{b}</span>
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 10, borderTop: `1px solid ${C.borderDim}` }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.fg }}>Price on request</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "hsl(38 85% 48% / 0.08)", color: "hsl(38 75% 34%)", border: "1px solid hsl(38 85% 44% / 0.3)" }}><Zap size={9} /> 72</span>
                  <button style={{ fontSize: 10, fontWeight: 700, padding: "4px 10px", borderRadius: 6, border: "none", background: C.indigo, color: "white", cursor: "default" }}>Submit EOI</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Listings ── */}
      <div style={{ background: C.card, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ padding: "72px 48px" }}>
          <div style={{ maxWidth: 1100, margin: "0 auto" }}>
            <div className="mkt-reveal" style={{ textAlign: "center", maxWidth: 600, margin: "0 auto 48px" }}>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: C.muted, marginBottom: 10 }}>Sample listings</p>
              <h2 style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-0.025em", color: C.fg, marginBottom: 12, lineHeight: 1.2 }}>The quality we curate for.</h2>
              <p style={{ fontSize: 15, color: C.muted, lineHeight: 1.65 }}>Every asset on EdenMarket is admin-reviewed and scored by EDEN before going live. This is what qualified deal flow looks like.</p>
            </div>

            {/* Filter bar (decorative) */}
            <div className="mkt-reveal" style={{ display: "flex", alignItems: "center", gap: 8, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 16px", marginBottom: 24 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: C.muted, whiteSpace: "nowrap" }}>Filter:</span>
              {["All", "Oncology", "Neurology", "Cell Therapy", "Phase 1+"].map((label, i) => (
                <button key={label} style={{ fontSize: 11, fontWeight: 600, padding: "4px 12px", borderRadius: 100, border: `1px solid ${i === 0 ? C.indigo : C.border}`, background: i === 0 ? C.indigo : "transparent", color: i === 0 ? "white" : C.muted, cursor: "default" }}>{label}</button>
              ))}
              <div style={{ width: 1, height: 20, background: C.border, flexShrink: 0 }} />
              <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.muted }}>
                <Search size={14} style={{ color: "hsl(230 15% 60%)", flexShrink: 0 }} />
                <span>Search by keyword, mechanism, target…</span>
              </div>
            </div>

            <div className="mkt-seller-grid" style={{ gap: 16 }}>
              {LISTINGS.map((l, li) => (
                <div key={l.id} className={`mkt-reveal${li > 0 ? ` d${li}` : ""}`} data-testid={`market-preview-card-${l.id}`} style={{ background: C.card, border: "1px solid hsl(230 18% 90%)", borderRadius: 12, padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {l.confidential
                        ? <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: C.muted, fontStyle: "italic", marginBottom: 6 }}><EyeOff size={13} /> Confidential Listing</div>
                        : <div style={{ fontSize: 13, fontWeight: 700, color: C.fg, marginBottom: 6, lineHeight: 1.3 }}>{l.name}</div>
                      }
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                        {l.badges.map(b => <span key={b} style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 5, border: `1px solid ${C.border}`, color: C.muted }}>{b}</span>)}
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5, flexShrink: 0 }}>
                      {l.verified && badge("Verified Seller", { background: "hsl(234 80% 58% / 0.1)", color: C.indigoDk, borderColor: "hsl(234 80% 58% / 0.25)" })}
                      {badge(l.engagement, { background: l.engStyle.background, color: l.engStyle.color, borderColor: l.engStyle.borderColor })}
                    </div>
                  </div>
                  <p style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.62, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" } as React.CSSProperties}>{l.summary}</p>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, paddingTop: 12, borderTop: "1px solid hsl(230 18% 92%)", marginTop: "auto" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: C.fg }}>{l.price}</span>
                      <span style={{ fontSize: 10, color: C.muted }}>{l.eois} EOIs</span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4, border: `1px solid ${l.scoreStyle.borderColor}`, background: l.scoreStyle.background, color: l.scoreStyle.color }}><Zap size={9} /> {l.score}</span>
                    </div>
                    <button data-testid={`market-preview-eoi-btn-${l.id}`} style={{ fontSize: 11, fontWeight: 700, padding: "5px 12px", borderRadius: 7, border: "none", background: C.indigo, color: "white", cursor: "default", display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <Send size={11} /> Submit EOI
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Blind listing ── */}
      <div style={{ background: "hsl(234 60% 97%)", borderTop: "1px solid hsl(234 40% 90%)", borderBottom: "1px solid hsl(234 40% 90%)" }}>
        <div style={{ padding: "88px 48px" }}>
          <div className="mkt-section-grid" style={{ maxWidth: 1080, margin: "0 auto" }}>
            <div className="mkt-reveal">
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: C.indigo, marginBottom: 14 }}>Privacy by default</p>
              <h2 style={{ fontSize: 34, fontWeight: 700, lineHeight: 1.18, letterSpacing: "-0.025em", color: C.fg, marginBottom: 20 }}>
                Your identity is yours.<br />
                <strong style={{ color: C.indigo, fontWeight: 800 }}>Reveal it on your terms.</strong>
              </h2>
              <p style={{ fontSize: 15, color: C.muted, lineHeight: 1.72, marginBottom: 32 }}>
                Every listing is blind by default. You control which fields are visible before an NDA is signed. Asset name, institution, inventors, exact patent numbers, and mechanism detail can each be toggled independently. Your competitors see only what a deal requires: therapeutic area, modality, stage, and price.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {BLIND_FIELDS.map(f => (
                  <div key={f.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: C.card, border: `1px solid ${C.border}`, borderRadius: 9, padding: "12px 16px" }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.fg }}>{f.name}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 28, height: 16, borderRadius: 100, background: f.hidden ? C.indigo : "hsl(230 15% 88%)", display: "flex", alignItems: "center", padding: 2, justifyContent: f.hidden ? "flex-end" : "flex-start" }}>
                        <div style={{ width: 12, height: 12, borderRadius: "50%", background: "white" }} />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: f.hidden ? C.indigo : C.muted }}>{f.hidden ? "Hidden" : "Visible"}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mkt-reveal d1">
              <div style={{ background: C.card, border: "1px solid hsl(234 30% 86%)", borderRadius: 16, padding: 28, boxShadow: "0 4px 24px hsl(234 40% 20% / 0.08)" }}>
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: C.muted, marginBottom: 14 }}>What buyers see before NDA</p>
                <div style={{ background: "hsl(234 50% 99%)", border: "1px solid hsl(234 25% 90%)", borderRadius: 11, padding: 18, marginBottom: 12 }}>
                  {BLIND_ROWS.map((row, ri) => (
                    <div key={row.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: ri < BLIND_ROWS.length - 1 ? "1px solid hsl(234 20% 94%)" : "none" }}>
                      <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, color: C.muted }}>{row.key}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: C.fg, filter: row.blurred ? "blur(4px)" : "none", userSelect: row.blurred ? "none" : "auto" } as React.CSSProperties}>{row.val}</span>
                    </div>
                  ))}
                </div>
                <div style={{ background: "hsl(234 80% 58% / 0.08)", border: "1px solid hsl(234 80% 58% / 0.2)", borderRadius: 8, padding: "10px 14px", display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: C.indigoDk, fontWeight: 600 }}>
                  <Lock size={13} /> Blurred fields unlock after mutual NDA execution
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Deal Room ── */}
      <div style={{ background: C.card, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ padding: "88px 48px" }}>
          <div className="mkt-reveal" style={{ textAlign: "center", maxWidth: 760, margin: "0 auto 52px" }}>
            <h2 style={{ fontSize: 34, fontWeight: 700, letterSpacing: "-0.025em", color: C.fg, marginBottom: 14, lineHeight: 1.2 }}>One room. Every stage of the deal.</h2>
            <p style={{ fontSize: 15, color: C.muted, lineHeight: 1.65, maxWidth: 560, margin: "0 auto" }}>
              Documents, messages, and a collaborative term sheet: all in a single workspace. No scattered email threads. No version confusion. Every action logged.
            </p>
          </div>
          <div className="mkt-reveal" style={{ maxWidth: 760, margin: "0 auto", background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden", boxShadow: "0 4px 32px hsl(234 30% 15% / 0.08)" }}>
            <div style={{ background: "hsl(234 40% 97%)", borderBottom: `1px solid ${C.border}`, padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.fg, display: "flex", alignItems: "center", gap: 8 }}>
                  <Lock size={15} style={{ color: C.indigo }} /> KRAS G12D Degrader / Deal #14
                </div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>University of Michigan TTO · Novartis BD · Started May 2026</div>
              </div>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, background: "hsl(234 80% 58% / 0.1)", color: C.indigoDk, border: "1px solid hsl(234 80% 58% / 0.25)", borderRadius: 100, padding: "4px 12px" }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: C.indigo, display: "inline-block" }} /> NDA Signed
              </span>
            </div>
            <div className="mkt-deal-body">
              <div style={{ padding: 20, borderRight: `1px solid ${C.border}`, maxHeight: 380, overflow: "hidden", position: "relative" }}>
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: C.muted, marginBottom: 14 }}>Messages</p>
                {MESSAGES.map((m, i) => (
                  <div key={i} className="market-msg" style={{ display: "flex", gap: 10, marginBottom: 10, flexDirection: m.side === "mine" ? "row-reverse" : "row", animationDelay: `${i * 0.2}s` }}>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: m.color, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: "white" }}>{m.initials}</div>
                    <div>
                      <div style={{ maxWidth: 260, fontSize: 12, lineHeight: 1.55, padding: "10px 13px", ...(m.side === "mine" ? { background: C.indigo, color: "white", borderRadius: "11px 3px 11px 11px" } : { background: "hsl(230 15% 96%)", color: C.fg, borderRadius: "3px 11px 11px 11px" }) }}>{m.text}</div>
                      <div style={{ fontSize: 10, color: C.muted, marginTop: 4, textAlign: m.side === "mine" ? "right" : "left" }}>{m.time}</div>
                    </div>
                  </div>
                ))}
                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 60, background: "linear-gradient(to bottom, transparent, white)", pointerEvents: "none" }} />
              </div>
              <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 20 }}>
                <div>
                  <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: C.muted, marginBottom: 12 }}>Documents</p>
                  {[
                    { name: "Executed NDA.pdf",     date: "May 18", note: "Opened by both parties",    noteColor: C.emerald },
                    { name: "Full Data Package.zip", date: "May 20", note: "Viewed 3× by counterparty", noteColor: C.emerald },
                    { name: "IP Summary.pdf",         date: "May 21", note: "Not yet viewed",            noteColor: C.muted   },
                  ].map((doc, di) => (
                    <div key={di} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: di < 2 ? "1px solid hsl(230 15% 94%)" : "none" }}>
                      <div style={{ width: 28, height: 28, borderRadius: 6, background: "hsl(234 40% 96%)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <FileText size={13} style={{ color: C.indigo }} />
                      </div>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: C.fg }}>{doc.name}</div>
                        <div style={{ fontSize: 10, color: C.muted }}>{doc.date} · <span style={{ color: doc.noteColor, fontWeight: 600 }}>{doc.note}</span></div>
                      </div>
                    </div>
                  ))}
                </div>
                <div>
                  <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: C.muted, marginBottom: 12 }}>Term Sheet: Draft</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {[{ k: "Upfront", v: "$8M", accent: true }, { k: "Milestones", v: "$15M", accent: true }, { k: "Royalty", v: "4.5%", accent: true }, { k: "Territory", v: "US + EU excl.", accent: false }].map(t => (
                      <div key={t.k} style={{ background: "hsl(234 30% 97%)", border: "1px solid hsl(234 25% 90%)", borderRadius: 7, padding: "8px 10px" }}>
                        <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, color: C.muted, marginBottom: 3 }}>{t.k}</div>
                        <div style={{ fontSize: t.k === "Territory" ? 11 : 13, fontWeight: 700, color: t.accent ? C.indigoDk : C.fg }}>{t.v}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700, color: "hsl(142 52% 32%)", marginTop: 10 }}>
                    <CheckCircle2 size={12} /> Seller agreed · Buyer review pending
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Signal Score ── */}
      <div ref={scoreRef} style={{ background: C.card, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ padding: "88px 48px" }}>
          <div className="mkt-section-grid" style={{ maxWidth: 1080, margin: "0 auto" }}>
            <div className="mkt-reveal">
              <h2 style={{ fontSize: 34, fontWeight: 700, letterSpacing: "-0.025em", color: C.fg, marginBottom: 18, lineHeight: 1.18 }}>
                Know the deal quality<br />
                <strong style={{ color: C.indigo }}>before you engage.</strong>
              </h2>
              <p style={{ fontSize: 15, color: C.muted, lineHeight: 1.72, marginBottom: 28 }}>
                Every listing is scored by EDEN on a 0 to 100 scale. The Eden Signal Score combines intelligence signals from the linked EdenRadar asset: enrichment completeness, patent signals, clinical-stage data, and listing quality, so you spend time on the deals worth pursuing.
              </p>
              <div style={{ borderTop: `1px solid ${C.border}` }}>
                {SCORE_FACTORS.map((f, fi) => (
                  <div key={f.label} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 0", borderBottom: `1px solid ${C.border}` }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: C.fg, minWidth: 170 }}>{f.label}</span>
                    <div style={{ flex: 1, height: 6, background: "hsl(234 30% 92%)", borderRadius: 100, overflow: "hidden" }}>
                      <div ref={el => { barRefs.current[fi] = el; }} className="market-score-bar" style={{ "--mw": `${f.pct}%` } as React.CSSProperties} />
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: C.indigoDk, minWidth: 32, textAlign: "right" }}>{f.pts}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mkt-reveal d1">
              <div style={{ background: "hsl(234 40% 97%)", border: "1px solid hsl(234 30% 88%)", borderRadius: 16, padding: 28 }}>
                <div style={{ position: "relative", width: 128, height: 128, margin: "0 auto 24px" }}>
                  <svg viewBox="0 0 128 128" fill="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
                    <circle cx="64" cy="64" r="52" stroke="hsl(234 30% 88%)" strokeWidth="9" />
                    <circle ref={arcRef} className="market-score-arc" cx="64" cy="64" r="52" stroke={C.indigo} strokeWidth="9" strokeLinecap="round" transform="rotate(-90 64 64)" />
                  </svg>
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
                    <span style={{ fontSize: 28, fontWeight: 800, color: C.fg, letterSpacing: "-0.03em", lineHeight: 1 }}>{scoreCount}</span>
                    <span style={{ fontSize: 11, color: C.muted, fontWeight: 500 }}>/ 100</span>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {SCORE_FACTORS.map(f => (
                    <div key={f.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12 }}>
                      <span style={{ color: C.muted }}>{f.label}</span>
                      <span style={{ fontWeight: 700, color: "hsl(142 52% 32%)" }}>{f.pts}</span>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid hsl(234 25% 90%)" }}>
                  <div style={{ fontSize: 11, color: C.muted, marginBottom: 6, fontWeight: 600 }}>Signal tier</div>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 700, padding: "4px 12px", borderRadius: 4, background: "hsl(142 50% 50% / 0.08)", color: "hsl(142 52% 32%)", border: "1px solid hsl(142 52% 36% / 0.3)" }}>
                    <Zap size={11} /> High Signal
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── For Sellers ── */}
      <div style={{ background: "hsl(234 60% 97%)", borderTop: "1px solid hsl(234 40% 90%)", borderBottom: "1px solid hsl(234 40% 90%)" }}>
        <div style={{ padding: "88px 48px" }}>
          <div style={{ maxWidth: 1080, margin: "0 auto" }}>
            <div className="mkt-reveal" style={{ textAlign: "center", marginBottom: 56 }}>
              <h2 style={{ fontSize: 34, fontWeight: 700, letterSpacing: "-0.025em", color: C.fg, marginBottom: 14, lineHeight: 1.2 }}>Built for every kind of seller.</h2>
              <p style={{ fontSize: 15, color: C.muted, lineHeight: 1.65, maxWidth: 560, margin: "0 auto" }}>
                Whether you're licensing out of a TTO, spinning out a deprioritized program, or a solo inventor with a validated idea: EdenMarket is free to list and curated to qualify buyers before they reach you.
              </p>
            </div>
            <div className="mkt-seller-grid" style={{ marginBottom: 56 }}>
              {SELLER_TYPES.map((s, i) => (
                <div key={i} className={`mkt-reveal${i > 0 ? ` d${i}` : ""}`} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 13, padding: 24 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: "hsl(234 80% 58% / 0.1)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
                    <s.Icon size={20} style={{ color: C.indigo }} />
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: C.fg, marginBottom: 8 }}>{s.title}</div>
                  <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6 }}>{s.body}</div>
                </div>
              ))}
            </div>
            <div className="mkt-reveal mkt-steps-grid" style={{ border: `1px solid ${C.border}`, borderRadius: 13, overflow: "hidden" }}>
              {LISTING_STEPS.map((s, si) => (
                <div key={si} style={{ padding: 24, borderRight: si < 3 ? `1px solid ${C.border}` : "none", background: C.card }}>
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: C.indigo, marginBottom: 10 }}>{s.num}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.fg, marginBottom: 8 }}>{s.title}</div>
                  <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>{s.body}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Bottom CTA ── */}
      <div style={{ padding: "100px 48px", background: C.indigo, textAlign: "center" }}>
        <h2 className="mkt-reveal" style={{ fontSize: 38, fontWeight: 800, letterSpacing: "-0.03em", color: "white", marginBottom: 16, lineHeight: 1.1 }}>
          The <span style={{ color: "hsl(234 80% 82%)" }}>quiet room</span><br />
          where biotech deals happen.
        </h2>
        <p className="mkt-reveal" style={{ fontSize: 16, color: "hsl(234 50% 78%)", marginBottom: 44, lineHeight: 1.65, maxWidth: 480, marginLeft: "auto", marginRight: "auto" }}>
          Both sides of every deal are protected from first click to signed term sheet.
        </p>
        <div className="mkt-reveal mkt-cta-grid" style={{ maxWidth: 640, margin: "0 auto" }}>
          {[
            {
              title: "Find your next program",
              body: "Search curated deal flow by modality, stage, and TA. Eden Signal Scores tell you where to focus before you submit a single EOI.",
              action: () => subscribe({ redirectTo: "/market" }),
              label: isLoading ? "Redirecting…" : "Browse Listings",
              testId: "market-preview-subscribe-footer",
              btnStyle: { background: "white", color: C.indigoDk, border: "none" },
            },
            {
              title: "List your asset",
              body: "Submit in minutes. We review it within two business days. Your identity stays blind until you say otherwise. No broker, no cold intros.",
              href: "/market/list",
              label: "List an Asset",
              testId: "market-preview-list-footer",
              btnStyle: { background: "hsl(234 65% 62%)", color: "white", border: "1.5px solid hsl(234 65% 68%)" },
            },
          ].map((card, ci) => (
            <div key={ci} style={{ background: "hsl(234 72% 52%)", border: "1px solid hsl(234 65% 62%)", borderRadius: 13, padding: "28px 24px", textAlign: "left" }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: "white", marginBottom: 8 }}>{card.title}</div>
              <div style={{ fontSize: 13, color: "hsl(234 40% 78%)", lineHeight: 1.6, marginBottom: 20 }}>{card.body}</div>
              {card.href ? (
                <Link href={card.href}>
                  <button data-testid={card.testId} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, padding: "10px 20px", borderRadius: 8, cursor: "pointer", ...card.btnStyle }}>
                    {card.label} <ArrowRight size={12} />
                  </button>
                </Link>
              ) : (
                <button onClick={card.action} disabled={isLoading} data-testid={card.testId} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, padding: "10px 20px", borderRadius: 8, cursor: "pointer", ...card.btnStyle }}>
                  {isLoading && <Loader2 size={12} className="animate-spin" />}
                  {card.label} <ArrowRight size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
