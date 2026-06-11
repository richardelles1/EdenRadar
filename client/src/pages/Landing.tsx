import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Nav } from "@/components/Nav";
import { EdenNXBadge } from "@/components/EdenNXBadge";
import { useAuth } from "@/hooks/use-auth";
import { useDocumentMeta } from "@/hooks/use-document-meta";
import { NumberTicker } from "@/components/ui/number-ticker";
import { MovingBorder } from "@/components/ui/moving-border";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  TrendingUp,
  ArrowRight,
  Bookmark,
  BookmarkCheck,
} from "lucide-react";

/* ─────────────────────────── helpers ─────────────────────────── */

function useReveal(threshold = 0.18) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { el.classList.add("is-visible"); obs.disconnect(); } },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return ref;
}

/* ─────────────────────────── RadarBackground ─────────────────── */

const BLIPS: { ring: number; a: number; label: string | null }[] = [
  { ring: 2, a: 0.40, label: "MIT TTO" },
  { ring: 4, a: 1.10, label: "Stanford OTL" },
  { ring: 1, a: 2.30, label: null },
  { ring: 5, a: 3.00, label: "Max Planck" },
  { ring: 3, a: 3.80, label: "UCSF QB3" },
  { ring: 6, a: 4.50, label: null },
  { ring: 2, a: 5.10, label: "Oxford TT" },
  { ring: 4, a: 5.80, label: null },
  { ring: 1, a: 0.90, label: null },
  { ring: 5, a: 2.00, label: "Harvard OTD" },
  { ring: 3, a: 2.90, label: null },
  { ring: 6, a: 1.70, label: "Broad Inst." },
  { ring: 2, a: 4.10, label: null },
  { ring: 4, a: 3.30, label: "CNRS TTT" },
  { ring: 1, a: 5.50, label: null },
];
const BLIP_LIFETIME = 4800;

function RadarBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let angle = 0;
    let lastTime = performance.now();
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const blipTimes = new Array(BLIPS.length).fill(-BLIP_LIFETIME);
    let isDark = document.documentElement.classList.contains("dark");

    const mo = new MutationObserver(() => {
      isDark = document.documentElement.classList.contains("dark");
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    function resize() {
      if (!canvas) return;
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    }

    function draw(now: number) {
      if (!canvas || !ctx) return;
      const dt = now - lastTime;
      lastTime = now;
      const W = canvas.width;
      const H = canvas.height;
      const cx = W / 2;
      const cy = H / 2;
      const maxR = Math.sqrt(cx * cx + cy * cy) * 1.05;
      const ringCount = 7;
      const ringSpacing = maxR / ringCount;
      const ringAlpha = isDark ? 0.10 : 0.06;
      const sweepPeak = isDark ? 0.18 : 0.10;
      const sweepAngle = Math.PI / 2;
      const sweepSteps = 24;
      const TWO_PI = Math.PI * 2;
      const delta = TWO_PI * (dt / 25000);

      ctx.fillStyle = isDark ? "#060a06" : "#f3fef6";
      ctx.fillRect(0, 0, W, H);

      // rings
      ctx.strokeStyle = "#065f46";
      ctx.lineWidth = 1;
      for (let i = 1; i <= ringCount; i++) {
        ctx.beginPath();
        ctx.arc(cx, cy, ringSpacing * i, 0, TWO_PI);
        ctx.globalAlpha = ringAlpha;
        ctx.stroke();
      }

      // crosshairs
      ctx.globalAlpha = isDark ? 0.045 : 0.022;
      ctx.strokeStyle = "#065f46";
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, cy);
      ctx.lineTo(W, cy);
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx, H);
      ctx.stroke();

      // sweep
      for (let i = 0; i < sweepSteps; i++) {
        const t = (i + 1) / sweepSteps;
        const startA = angle - sweepAngle + (i / sweepSteps) * sweepAngle;
        const endA = angle - sweepAngle + ((i + 1) / sweepSteps) * sweepAngle;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, maxR, startA, endA);
        ctx.closePath();
        ctx.fillStyle = "#c47d1a";
        ctx.globalAlpha = t * sweepPeak;
        ctx.fill();
      }

      // leading edge sweep arm
      ctx.globalAlpha = isDark ? 0.60 : 0.45;
      ctx.strokeStyle = "#c47d1a";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + maxR * Math.cos(angle), cy + maxR * Math.sin(angle));
      ctx.stroke();

      // detect sweep crossings then advance angle
      for (let i = 0; i < BLIPS.length; i++) {
        const ba = ((BLIPS[i].a % TWO_PI) + TWO_PI) % TWO_PI;
        const normCur = ((angle % TWO_PI) + TWO_PI) % TWO_PI;
        const normNext = (((angle + delta) % TWO_PI) + TWO_PI) % TWO_PI;
        const crosses =
          normNext >= normCur
            ? ba >= normCur && ba < normNext
            : ba >= normCur || ba < normNext;
        if (crosses) blipTimes[i] = now;
      }
      angle += delta;

      // blips
      for (let i = 0; i < BLIPS.length; i++) {
        const age = now - blipTimes[i];
        if (age >= BLIP_LIFETIME) continue;

        let alpha: number;
        const fadeIn = 300;
        const fadeOut = 700;
        if (age < fadeIn) {
          alpha = age / fadeIn;
        } else if (age < BLIP_LIFETIME - fadeOut) {
          alpha = 0.82 + 0.18 * Math.sin((age - fadeIn) / 380);
        } else {
          alpha = Math.max(0, 1 - (age - (BLIP_LIFETIME - fadeOut)) / fadeOut);
        }

        const r = ringSpacing * BLIPS[i].ring;
        const bx = cx + r * Math.cos(BLIPS[i].a);
        const by = cy + r * Math.sin(BLIPS[i].a);

        // glow halo
        const grd = ctx.createRadialGradient(bx, by, 0, bx, by, 11);
        grd.addColorStop(0, "rgba(52,211,153,0.55)");
        grd.addColorStop(1, "rgba(52,211,153,0)");
        ctx.globalAlpha = alpha * (isDark ? 0.75 : 0.45);
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(bx, by, 11, 0, TWO_PI);
        ctx.fill();

        // core dot
        ctx.globalAlpha = alpha * (isDark ? 0.95 : 0.65);
        ctx.fillStyle = "#34d399";
        ctx.beginPath();
        ctx.arc(bx, by, 2.5, 0, TWO_PI);
        ctx.fill();

        // institution label
        if (BLIPS[i].label && alpha > 0.35) {
          ctx.globalAlpha = alpha * 0.65 * (isDark ? 1 : 0.65);
          ctx.fillStyle = "#34d399";
          ctx.font = "9px ui-monospace, 'SF Mono', monospace";
          ctx.textAlign = "left";
          ctx.fillText(BLIPS[i].label!, bx + 7, by + 3);
        }
      }

      ctx.globalAlpha = 1;
      if (!prefersReducedMotion) animId = requestAnimationFrame(draw);
    }

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    draw(performance.now());

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
      mo.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full block"
      aria-hidden
    />
  );
}

/* ─────────────────────────── RecentFeed ─────────────────────── */

type FeedAsset = {
  id: number;
  institution: string;
  modality: string | null;
  indication: string | null;
  developmentStage: string | null;
  summary: string | null;
  mechanismOfAction: string | null;
  firstSeenAt: string;
};

const FEED_FALLBACK: FeedAsset[] = [
  { id: 1,  institution: "MIT",                               modality: "PROTAC",              indication: "Oncology",           developmentStage: "Pre-clinical",  summary: null, mechanismOfAction: "BRD4 protein degradation via targeted ubiquitination",          firstSeenAt: new Date(Date.now() - 2  * 3600000).toISOString() },
  { id: 2,  institution: "University of Pennsylvania",        modality: "Gene Therapy",        indication: "Rare Disease",       developmentStage: "IND-enabling",  summary: null, mechanismOfAction: "AAV9 dystrophin construct delivery to muscle tissue",           firstSeenAt: new Date(Date.now() - 4  * 3600000).toISOString() },
  { id: 3,  institution: "Stanford University",               modality: "Bispecific Antibody", indication: "Oncology",           developmentStage: "IND-enabling",  summary: null, mechanismOfAction: "HER2 × CD3 T-cell redirection in solid tumours",               firstSeenAt: new Date(Date.now() - 6  * 3600000).toISOString() },
  { id: 4,  institution: "University of Guelph",              modality: "Peptide",             indication: "Metabolic Disease",  developmentStage: "Pre-clinical",  summary: null, mechanismOfAction: "GLP-1 receptor agonism with PEGylated half-life extension",    firstSeenAt: new Date(Date.now() - 8  * 3600000).toISOString() },
  { id: 5,  institution: "Johns Hopkins University",          modality: "mRNA",                indication: "Infectious Disease", developmentStage: "Discovery",     summary: null, mechanismOfAction: "LNP-formulated spike antigen encoding for broad coronavirus coverage", firstSeenAt: new Date(Date.now() - 10 * 3600000).toISOString() },
  { id: 6,  institution: "Indiana University",                modality: "CAR-T",               indication: "Hematology",         developmentStage: "Phase 1",       summary: null, mechanismOfAction: "Logic-gated CAR construct with integrated safety switch for AML", firstSeenAt: new Date(Date.now() - 13 * 3600000).toISOString() },
  { id: 7,  institution: "Yale University",                   modality: "Small Molecule",      indication: "Oncology",           developmentStage: "Pre-clinical",  summary: null, mechanismOfAction: "Covalent KRAS G12C inhibition with >200-fold wild-type selectivity", firstSeenAt: new Date(Date.now() - 15 * 3600000).toISOString() },
  { id: 8,  institution: "Duke University",                   modality: "siRNA",               indication: "Cardiovascular",     developmentStage: "Pre-clinical",  summary: null, mechanismOfAction: "GalNAc-conjugated PCSK9 hepatocyte silencing",                  firstSeenAt: new Date(Date.now() - 18 * 3600000).toISOString() },
  { id: 9,  institution: "University of Pittsburgh",          modality: "Cell Therapy",        indication: "Neurology",          developmentStage: "Discovery",     summary: null, mechanismOfAction: "iPSC-derived dopaminergic neuron replacement with HLA silencing", firstSeenAt: new Date(Date.now() - 21 * 3600000).toISOString() },
  { id: 10, institution: "MD Anderson Cancer Center",         modality: "ADC",                 indication: "Oncology",           developmentStage: "IND-enabling",  summary: null, mechanismOfAction: "TROP2-targeting ADC with topoisomerase I inhibitor payload",    firstSeenAt: new Date(Date.now() - 24 * 3600000).toISOString() },
  { id: 11, institution: "Northwestern University",           modality: "Bispecific Antibody", indication: "Oncology",           developmentStage: "IND-enabling",  summary: null, mechanismOfAction: "PD-1 × TIGIT dual checkpoint co-blockade for NSCLC",           firstSeenAt: new Date(Date.now() - 27 * 3600000).toISOString() },
  { id: 12, institution: "Boston Children's Hospital",        modality: "Gene Therapy",        indication: "Hematology",         developmentStage: "IND-enabling",  summary: null, mechanismOfAction: "CRISPR base-editing of E6V sickle cell mutation in autologous HSCs", firstSeenAt: new Date(Date.now() - 31 * 3600000).toISOString() },
  { id: 13, institution: "Washington Univ. in St. Louis",     modality: "Small Molecule",      indication: "Immunology",         developmentStage: "Discovery",     summary: null, mechanismOfAction: "Oral IL-17A inhibition with biologic-comparable efficacy in plaque psoriasis", firstSeenAt: new Date(Date.now() - 34 * 3600000).toISOString() },
  { id: 14, institution: "University of Pennsylvania",        modality: "ASO",                 indication: "Neurology",          developmentStage: "Pre-clinical",  summary: null, mechanismOfAction: "Intrathecal tau aggregation silencing for frontotemporal dementia", firstSeenAt: new Date(Date.now() - 37 * 3600000).toISOString() },
  { id: 15, institution: "Vanderbilt University",             modality: "Cell Therapy",        indication: "Hematology",         developmentStage: "Phase 1",       summary: null, mechanismOfAction: "Off-the-shelf CAR-NK cells targeting BCMA in multiple myeloma", firstSeenAt: new Date(Date.now() - 40 * 3600000).toISOString() },
  { id: 16, institution: "Cornell University",                modality: "Small Molecule",      indication: "Cardiovascular",     developmentStage: "Discovery",     summary: null, mechanismOfAction: "Factor XIa inhibition for thromboembolism with improved bleeding safety", firstSeenAt: new Date(Date.now() - 43 * 3600000).toISOString() },
];

function pickConnector(mod: string | null): string {
  if (!mod) return "for";
  const m = mod.toLowerCase();
  if (m.includes("bispecific") || m.includes("antibody")) return "against";
  if (m.includes("car-t") || m.includes("car t") || m.includes("nk cell") || m.includes("cell therapy")) return "in";
  if (m.includes("adc")) return "targeting";
  if (m.includes("vaccine")) return "against";
  return "for";
}

function buildNarrative(asset: FeedAsset): Array<{ text: string; bold: boolean }> {
  const stage = asset.developmentStage && asset.developmentStage !== "unknown" ? asset.developmentStage : null;
  const mod   = asset.modality && asset.modality !== "unknown" ? asset.modality : null;
  const ind   = asset.indication && asset.indication !== "unknown" ? asset.indication : null;
  const moa   = asset.mechanismOfAction && asset.mechanismOfAction !== "unknown" ? asset.mechanismOfAction : null;

  const parts: Array<{ text: string; bold: boolean }> = [];
  const article = mod && /^[aeiou]/i.test(mod) ? "An " : "A ";
  const connector = pickConnector(mod);

  parts.push({ text: article, bold: false });
  if (stage) parts.push({ text: stage.toLowerCase(), bold: true });
  if (mod)   parts.push({ text: (stage ? " " : "") + mod, bold: true });
  if (ind)   parts.push({ text: ` ${connector} `, bold: false }, { text: ind, bold: true });
  parts.push({ text: ".", bold: false });

  if (moa) {
    const trimmed = moa.length > 80 ? moa.slice(0, 77).trimEnd() + "…" : moa;
    parts.push({ text: " " + trimmed.charAt(0).toUpperCase() + trimmed.slice(1) + ".", bold: false });
  }

  return parts;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  if (h >= 48) return `${Math.floor(h / 24)}d ago`;
  if (h >= 1) return `${h}h ago`;
  const m = Math.floor(diff / 60000);
  return m <= 1 ? "just now" : `${m}m ago`;
}

const FEED_FLIP_HALF = 270;
const FEED_EASE_IN  = `transform ${FEED_FLIP_HALF}ms cubic-bezier(0.4,0,1,1)`;
const FEED_EASE_OUT = `transform ${FEED_FLIP_HALF}ms cubic-bezier(0,0,0.2,1)`;

function FeedCard({
  asset,
  slotRef,
}: {
  asset: FeedAsset;
  slotRef: (el: HTMLDivElement | null) => void;
}) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0, on: false });
  const [hovered, setHovered] = useState(false);

  const inst  = asset.institution && asset.institution !== "unknown" ? asset.institution : "Unknown Institution";
  const parts = buildNarrative(asset);

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = innerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const rx = (e.clientX - r.left) / r.width;
    const ry = (e.clientY - r.top)  / r.height;
    setTilt({ x: Math.max(-2, Math.min(2, (ry - 0.5) * -3.5)), y: Math.max(-2, Math.min(2, (rx - 0.5) * 3.5)), on: true });
  };

  const onLeave = () => { setHovered(false); setTilt({ x: 0, y: 0, on: false }); };

  return (
    <div ref={slotRef} style={{ perspective: "900px" }}>
      <div
        ref={innerRef}
        className="relative flex flex-col overflow-hidden"
        style={{
          height: "182px",
          borderRadius: "14px",
          border: `1px solid ${hovered ? "rgba(45,122,82,0.28)" : "rgba(0,0,0,0.09)"}`,
          background: "linear-gradient(175deg, rgba(45,122,82,0.032) 0%, #ffffff 48%)",
          willChange: "transform",
          transformStyle: "preserve-3d",
          transform: tilt.on
            ? `perspective(900px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`
            : "perspective(900px) rotateX(0deg) rotateY(0deg)",
          transition: tilt.on
            ? "transform 0.08s ease-out, box-shadow 0.2s, border-color 0.2s"
            : "transform 0.5s cubic-bezier(0.23,1,0.32,1), box-shadow 0.4s, border-color 0.3s",
          boxShadow: hovered
            ? "0 14px 40px rgba(0,0,0,0.13), 0 3px 10px rgba(0,0,0,0.07)"
            : "0 2px 10px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)",
        }}
        onMouseMove={onMove}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={onLeave}
      >
        {/* Bloom — erupts from top-left on hover, clipped by overflow-hidden */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            width: 60, height: 60, borderRadius: "50%",
            background: "rgba(45,122,82,0.55)",
            top: -30, left: -30,
            transform: hovered ? "scale(24)" : "scale(1)",
            opacity: hovered ? 0.11 : 0,
            transition: "transform 0.45s cubic-bezier(0.4,0,0.2,1), opacity 0.3s ease",
            pointerEvents: "none",
            zIndex: 0,
          }}
        />

        {/* Header strip — institution identity, no chip */}
        <div
          className="relative flex items-center justify-between px-4 py-3 shrink-0"
          style={{
            zIndex: 1,
            background: "rgba(45,122,82,0.055)",
            borderBottom: "1px solid rgba(45,122,82,0.11)",
          }}
        >
          <span className="text-[12px] font-semibold leading-tight truncate pr-3" style={{ color: "#2d7a52" }}>
            {inst}
          </span>
          <span className="text-[10px] tabular-nums shrink-0" style={{ color: "#b0aaa4" }}>
            {relativeTime(asset.firstSeenAt)}
          </span>
        </div>

        {/* Narrative body */}
        <div className="relative px-4 py-4 flex-1" style={{ zIndex: 1 }}>
          <p className="text-[13px] leading-[1.7] text-muted-foreground line-clamp-4">
            {parts.map((p, i) =>
              p.bold
                ? <strong key={i} style={{ fontWeight: 600, color: "#2d7a52" }}>{p.text}</strong>
                : <span key={i}>{p.text}</span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

function shuffleDedupe(raw: FeedAsset[]): FeedAsset[] {
  const arr = [...raw];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  const result: FeedAsset[] = [];
  const pool = [...arr];
  while (pool.length > 0) {
    const lastInst = result.at(-1)?.institution ?? null;
    const idx = pool.findIndex(a => a.institution !== lastInst);
    result.push(...pool.splice(idx === -1 ? 0 : idx, 1));
  }
  return result;
}

const FEED_SLOTS = 6;

function RecentFeed() {
  const sectionRef = useReveal();
  const { data } = useQuery<{ assets: FeedAsset[]; total: number }>({
    queryKey: ["/api/browse/new-arrivals?window=30d&limit=30"],
    staleTime: 10 * 60 * 1000,
    retry: false,
  });

  const all = useMemo(
    () => shuffleDedupe(data?.assets?.length ? data.assets : FEED_FALLBACK),
    [data]
  );

  const [visible, setVisible] = useState<FeedAsset[]>([]);
  const slotRefs = useRef<(HTMLDivElement | null)[]>(Array(FEED_SLOTS).fill(null));
  const allRef   = useRef<FeedAsset[]>([]);
  const poolIdx  = useRef(FEED_SLOTS);
  const flipQ    = useRef<number[]>([]);

  useEffect(() => {
    allRef.current = all;
    setVisible(all.slice(0, FEED_SLOTS));
    poolIdx.current = FEED_SLOTS;
  }, [all]);

  useEffect(() => {
    if (visible.length < FEED_SLOTS) return;

    const nextPos = () => {
      if (!flipQ.current.length) {
        const q = Array.from({ length: FEED_SLOTS }, (_, i) => i);
        for (let i = q.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [q[i], q[j]] = [q[j], q[i]];
        }
        flipQ.current = q;
      }
      return flipQ.current.pop()!;
    };

    const id = setInterval(() => {
      const pos  = nextPos();
      const slot = slotRefs.current[pos];
      if (!slot) return;
      const pool = allRef.current;
      if (!pool.length) return;
      const next = pool[poolIdx.current % pool.length];
      poolIdx.current++;

      slot.style.transition = FEED_EASE_IN;
      slot.style.transform  = "rotateY(90deg)";

      setTimeout(() => {
        setVisible(prev => { const u = [...prev]; u[pos] = next; return u; });
        slot.style.transition = "none";
        slot.style.transform  = "rotateY(-90deg)";
        requestAnimationFrame(() => requestAnimationFrame(() => {
          slot.style.transition = FEED_EASE_OUT;
          slot.style.transform  = "rotateY(0deg)";
        }));
      }, FEED_FLIP_HALF + 12);
    }, 2400);

    return () => clearInterval(id);
  }, [visible.length]);

  return (
    <section ref={sectionRef} id="explore" className="reveal-section border-b border-border bg-background">
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-12 sm:py-16">

        <h2 className="text-3xl sm:text-4xl font-bold text-foreground leading-tight mb-6">
          Surfaced in the last 48 hours.{" "}
          <span className="text-muted-foreground font-normal sm:text-3xl">Most BD teams won't find these for weeks.</span>
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visible.map((asset, i) => (
            <FeedCard
              key={i}
              asset={asset}
              slotRef={(el) => { slotRefs.current[i] = el; }}
            />
          ))}
        </div>

        <div className="mt-8 pt-6 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            A sample of what's indexed. Thousands more across 350+ institutions.
          </p>
          <a href="/demo" className="text-sm font-medium text-primary hover:underline shrink-0">
            Search and filter the full dataset →
          </a>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── IntelligenceSection ─────────────── */

function IntelligenceSection({ onLogin }: { onLogin: () => void }) {
  const ref = useReveal();
  return (
    <section ref={ref} className="reveal-section border-t border-border bg-background">
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">

          {/* Copy */}
          <div className="space-y-6">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground leading-tight max-w-md">
              See the{" "}
              <span style={{ color: "hsl(142 52% 36%)" }}>full field</span>{" "}
              before your first move.
            </h2>
            <p className="text-base leading-relaxed" style={{ color: "hsl(220 18% 32%)" }}>
              EdenRadar doesn't just surface assets. It maps the landscape around them: how crowded each indication is, which modalities are gaining traction, and where the field is still open.
            </p>
            <div className="space-y-0 pt-1 border-t border-border">
              {[
                { n: "01", title: "Pre-commercial pipeline map", desc: "Every asset plotted by stage, modality, and therapeutic area across the full university pipeline." },
                { n: "02", title: "White space finder", desc: "Indication areas with limited competing assets, where first-mover advantage is still available." },
                { n: "03", title: "Modality momentum", desc: "The technology platforms accelerating across institutions right now, so you can follow the science." },
              ].map(({ n, title, desc }) => (
                <div key={n} className="flex gap-5 py-5 border-b border-border">
                  <span className="text-2xl font-bold shrink-0 leading-none mt-0.5" style={{ color: "hsl(142 52% 36% / 0.25)", fontVariantNumeric: "tabular-nums" }}>{n}</span>
                  <div>
                    <p className="text-sm font-semibold text-foreground mb-1">{title}</p>
                    <p className="text-[13px] leading-relaxed" style={{ color: "hsl(220 15% 42%)" }}>{desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="pt-2">
              <button
                onClick={onLogin}
                className="inline-flex items-center gap-2 h-10 px-5 rounded-lg font-semibold text-sm text-primary border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors duration-150"
                data-testid="button-landing-intelligence"
              >
                Explore the intelligence layer
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Staggered screenshot panels */}
          <div className="relative" style={{ height: "480px" }}>
            {/* Top panel — left-aligned, upper half of screenshot */}
            <div
              className="intel-panel-top absolute top-0 left-0 rounded-xl overflow-hidden"
              style={{
                width: "82%",
                height: "52%",
                boxShadow: "0 6px 32px hsl(142 52% 36% / 0.12), 0 2px 8px hsl(0 0% 0% / 0.08)",
                border: "1px solid hsl(var(--border))",
                zIndex: 1,
              }}
            >
              <img
                src="/images/screenshot-intelligence.png"
                alt="EdenRadar pipeline map and white space finder"
                className="w-full block"
                style={{ objectFit: "cover", objectPosition: "top", height: "200%" }}
                loading="lazy"
              />
            </div>
            {/* Bottom panel — right-aligned, lower half of screenshot */}
            <div
              className="intel-panel-bottom absolute bottom-0 right-0 rounded-xl overflow-hidden"
              style={{
                width: "82%",
                height: "52%",
                boxShadow: "0 6px 32px hsl(142 52% 36% / 0.10), 0 2px 8px hsl(0 0% 0% / 0.08)",
                border: "1px solid hsl(var(--border))",
                zIndex: 2,
              }}
            >
              <img
                src="/images/screenshot-intelligence.png"
                alt="EdenRadar modality momentum and biology landscape"
                className="w-full block"
                style={{ objectFit: "cover", objectPosition: "bottom", height: "200%" }}
                loading="lazy"
              />
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── BottomCTA ──────────────────────── */

function BottomCTA({ onLogin }: { onLogin: () => void }) {
  const ref = useReveal();
  return (
    <section
      ref={ref}
      className="reveal-section relative overflow-hidden"
      style={{ background: "hsl(33 55% 95%)" }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: [
            "radial-gradient(ellipse 65% 60% at 50% 0%, hsl(33 70% 90%) 0%, transparent 65%)",
            "radial-gradient(ellipse 40% 30% at 90% 110%, hsl(33 60% 88%) 0%, transparent 55%)",
          ].join(", "),
        }}
        aria-hidden
      />
      <div className="relative max-w-screen-xl mx-auto px-4 sm:px-6 py-20 sm:py-28 text-center">
        <p
          className="text-xs font-mono font-semibold uppercase tracking-[0.15em] mb-6"
          style={{ color: "hsl(33 65% 40%)" }}
        >
          Start for free. No credit card.
        </p>
        <h2
          className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-5 leading-tight"
          style={{ color: "hsl(220 30% 12%)" }}
        >
          The intelligence layer for{" "}
          <span style={{ color: "hsl(33 70% 38%)" }}>biotech deal flow.</span>
        </h2>
        <p
          className="text-base sm:text-lg mb-10 max-w-xl mx-auto leading-relaxed"
          style={{ color: "hsl(220 18% 34%)" }}
        >
          EdenRadar tracks pre-clinical and clinical assets across hundreds of research institutions. Know what's available before your competitors do.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link href="/demo" className="w-full sm:w-auto">
            <Button
              size="lg"
              data-testid="cta-bottom-demo"
              className="w-full sm:w-auto h-11 px-7 font-semibold text-base gap-2"
              style={{ background: "linear-gradient(148deg, hsl(33 70% 46%) 0%, hsl(33 62% 38%) 100%)", color: "hsl(33 40% 94%)", border: "none" }}
            >
              See the demo
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
          <Link href="/one-pager" className="w-full sm:w-auto">
            <Button
              size="lg"
              variant="outline"
              data-testid="cta-bottom-onepager"
              className="w-full sm:w-auto h-11 px-7 font-semibold text-base gap-2"
              style={{
                borderColor: "hsl(33 55% 60%)",
                color: "hsl(33 65% 35%)",
                background: "hsl(33 60% 90%)",
              }}
            >
              Download one-pager
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── InstitutionMarquee ──────────────── */

const INSTITUTION_ROWS = [
  [
    "MIT", "Stanford", "Harvard", "Johns Hopkins", "UCSF", "UCLA", "Columbia", "Yale",
    "Cornell", "Penn", "Duke", "Princeton", "Caltech", "UC Berkeley", "Northwestern",
    "NYU", "Dartmouth", "Brown", "Tufts", "Georgetown", "Oxford", "Cambridge",
    "ETH Zurich", "EPFL", "Karolinska", "Max Planck", "Imperial College", "UCL",
    "Edinburgh", "Toronto", "McGill", "UBC", "Melbourne", "Monash", "Tokyo",
    "Seoul National", "NUS Singapore", "Peking University", "HKU", "Zurich",
    "Helsinki", "Copenhagen", "Oslo", "Uppsala", "Aarhus",
  ],
  [
    "Mayo Clinic", "Mass General Hospital", "Brigham and Women's", "Memorial Sloan Kettering",
    "MD Anderson", "Cleveland Clinic", "Mount Sinai", "CHOP", "Boston Children's",
    "Dana-Farber", "Fred Hutchinson", "Roswell Park", "City of Hope", "Moffitt",
    "Cedars-Sinai", "OHSU", "Houston Methodist", "Vanderbilt", "Emory", "Pittsburgh",
    "Michigan", "Wisconsin-Madison", "UNC Chapel Hill", "Wash U St. Louis", "Virginia",
    "Michigan State", "Case Western", "Rochester", "Cincinnati", "Wake Forest",
    "Indiana", "Iowa", "Rutgers", "Maryland", "Florida", "Utah", "Nebraska",
    "Oklahoma", "Tennessee", "Alabama", "Scripps Research", "Salk Institute",
    "Cold Spring Harbor", "Jackson Laboratory", "NIH",
  ],
  [
    "Ohio State", "Penn State", "Texas", "USC", "UCSD", "UC Davis", "Georgia Tech",
    "Purdue", "Illinois", "Minnesota", "Texas A&M", "Arizona State", "Colorado", "Oregon",
    "Washington", "Virginia Tech", "Delaware", "South Carolina", "Kentucky", "Louisville",
    "BU", "Northeastern", "GWU", "Drexel", "Temple", "Miami", "Rice", "Baylor",
    "Lawrence Berkeley Lab", "Argonne", "Oak Ridge", "Sandia", "PNNL", "Brookhaven",
    "Alberta", "Calgary", "McMaster", "Queen's", "Dalhousie", "UNSW", "Sydney",
    "Queensland", "ANU", "KU Leuven", "Ghent", "Amsterdam UMC", "Erasmus MC",
    "Heidelberg", "Charité Berlin", "NKI Amsterdam",
  ],
  [
    "UCSB", "UC Irvine", "UC Santa Cruz", "Stony Brook", "UMass Medical", "UConn",
    "UMass Amherst", "Buffalo", "Pittsburgh", "Penn State Hershey", "Florida State",
    "USF", "Georgia", "Tulane", "Missouri", "Kansas", "Iowa State", "Arizona",
    "New Mexico", "Hawaii", "Nevada", "Colorado State", "Oregon State",
    "Institut Pasteur", "Curie Institute", "INSERM", "CNRS", "Ghent", "Basel",
    "Lausanne", "Leiden", "Utrecht", "Munich LMU", "TU Munich", "Freiburg",
    "Lund", "Stockholm", "Gothenburg", "Bristol", "Manchester", "Nottingham",
    "Sheffield", "Leeds", "Birmingham", "Liverpool", "Cardiff", "Newcastle",
    "Glasgow", "Tsinghua", "Fudan", "Osaka",
  ],
];

function InstitutionMarquee() {
  const speeds = [34, 42, 50, 38];
  const directions = ["marquee-left", "marquee-right", "marquee-left", "marquee-right"] as const;

  return (
    <section className="py-10 overflow-hidden border-y border-border/40">
      <div className="space-y-2.5">
        {INSTITUTION_ROWS.map((row, ri) => {
          const doubled = [...row, ...row];
          return (
            <div
              key={ri}
              className="relative overflow-hidden"
              style={{
                maskImage: "linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)",
                WebkitMaskImage: "linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)",
              }}
            >
              <div
                className="flex w-max"
                style={{ animation: `${directions[ri]} ${speeds[ri]}s linear infinite` }}
              >
                {doubled.map((name, i) => (
                  <span
                    key={i}
                    className="flex-shrink-0 whitespace-nowrap text-[11px] font-semibold tracking-wider"
                    style={{ color: "hsl(var(--foreground) / 0.50)" }}
                  >
                    {name}
                    <span
                      className="mx-4"
                      style={{ color: "hsl(var(--foreground) / 0.18)" }}
                    >
                      ·
                    </span>
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ─────────────────────────── HeroCardDeck ────────────────────── */

const HERO_CARDS: Array<{
  type: "intro" | "tto" | "trial" | "patent" | "research";
  score: number;
  name: string;
  indication: string;
  summary: string;
  stage: string;
  modality: string;
  rising: boolean;
  sources: number;
  institution: string;
}> = [
  {
    type: "intro",
    score: 0, name: "", indication: "", summary: "",
    stage: "", modality: "", rising: false, sources: 0, institution: "",
  },
  {
    type: "tto",
    score: 9,
    name: "GLP-1/GIP dual receptor agonist with enhanced CNS penetration for obesity and metabolic syndrome",
    indication: "Obesity · Metabolic syndrome",
    summary: "Dual agonism achieves 40% greater weight reduction than semaglutide in HFD mouse models. CNS penetration confirmed by PET imaging. Exclusive licensing available; Phase 1 IND submission in preparation.",
    stage: "Pre-clinical",
    modality: "Peptide",
    rising: true,
    sources: 3,
    institution: "UT Southwestern Medical Center",
  },
  {
    type: "trial",
    score: 0,
    name: "Phase I safety and dose-finding study of dual GLP-1/GIP receptor agonist in adults with obesity",
    indication: "Obesity · BMI ≥ 30 · NCT05891432",
    summary: "Open-label, dose-escalation study across 6 cohorts (n=48). Primary endpoint: MTD and 12-week PK profile. Secondary endpoints include neuroinflammatory biomarkers and HOMA-IR.",
    stage: "Phase 1",
    modality: "Peptide",
    rising: false,
    sources: 2,
    institution: "UT Southwestern Medical Center",
  },
  {
    type: "patent",
    score: 0,
    name: "Modified GLP-1/GIP co-agonist peptides with improved metabolic half-life and CNS bioavailability",
    indication: "Obesity · Type 2 diabetes",
    summary: "PCT/US2024/038291 covers 23 fatty acid-modified variants with 96h plasma half-life. National phase entry across 42 jurisdictions in Q1 2025. Sub-licensing discussions open.",
    stage: "Pre-clinical",
    modality: "Peptide",
    rising: false,
    sources: 1,
    institution: "UT Southwestern Medical Center",
  },
  {
    type: "research",
    score: 0,
    name: "CNS-penetrant GLP-1/GIP co-agonism drives weight loss and reduces neuroinflammation in diet-induced obese mice",
    indication: "Obesity · Neuroinflammation",
    summary: "Hypothalamic co-stimulation cut body weight 28% and NLRP3 inflammasome activation 67% in HFD mice (n=24, p<0.001). Open access. Nature Metabolism, March 2024.",
    stage: "Pre-clinical",
    modality: "Peptide",
    rising: true,
    sources: 2,
    institution: "PubMed · Nature Metabolism",
  },
];

const DECK_TINTS: Record<"intro" | "tto" | "trial" | "patent" | "research", {
  bg: string; border: string; strip: string;
  scoreColor: string; badgeBg: string; badgeBorderColor: string;
}> = {
  intro:    { bg: "linear-gradient(148deg, hsl(142 60% 38%) 0%, hsl(142 54% 30%) 100%)", border: "rgba(255,255,255,0.15)", strip: "#10b981", scoreColor: "#10b981", badgeBg: "transparent", badgeBorderColor: "transparent" },
  tto:      { bg: "#f0fdf4", border: "#a7f3d0", strip: "#10b981", scoreColor: "#059669", badgeBg: "white", badgeBorderColor: "rgba(16,185,129,0.4)" },
  trial:    { bg: "#f0fdfa", border: "#99f6e4", strip: "#0d9488", scoreColor: "#059669", badgeBg: "white", badgeBorderColor: "rgba(16,185,129,0.4)" },
  patent:   { bg: "#fffbeb", border: "#fde68a", strip: "#d97706", scoreColor: "#059669", badgeBg: "white", badgeBorderColor: "rgba(16,185,129,0.4)" },
  research: { bg: "#f0f9ff", border: "#bae6fd", strip: "#0ea5e9", scoreColor: "#059669", badgeBg: "white", badgeBorderColor: "rgba(16,185,129,0.4)" },
};

const DECK_STACK = [
  { tx: 0,  ty: 0,  scale: 1.00, opacity: 1.00 },
  { tx: 18, ty: 18, scale: 0.97, opacity: 0.88 },
  { tx: 36, ty: 36, scale: 0.94, opacity: 0.72 },
  { tx: 54, ty: 54, scale: 0.91, opacity: 0.50 },
  { tx: 72, ty: 72, scale: 0.88, opacity: 0.30 },
];

function deckStagePillClass(stage: string): string {
  const s = stage.toLowerCase();
  if (s.includes("phase 1") || s.includes("phase i/ii")) return "bg-sky-50 border border-sky-200/70 border-l-sky-400/90 text-sky-700";
  if (s.includes("phase 2") || s.includes("phase ii")) return "bg-violet-50 border border-violet-200/70 border-l-violet-400/90 text-violet-700";
  if (s.includes("phase 3") || s.includes("approved")) return "bg-emerald-50 border border-emerald-300/70 border-l-emerald-600 text-emerald-700";
  return "bg-emerald-50 border border-emerald-200/60 border-l-emerald-400/80 text-emerald-700";
}

function HeroCardDeck() {
  const [activeIdx, setActiveIdx] = useState(0);
  const [bookmarked, setBookmarked] = useState<Set<number>>(new Set());
  const [frontHovered, setFrontHovered] = useState(false);
  const paused = useRef(false);
  const [deckWidth, setDeckWidth] = useState(() =>
    typeof window !== "undefined" ? Math.min(500, window.innerWidth - 48) : 500
  );

  useEffect(() => {
    const iv = setInterval(() => {
      if (!paused.current) setActiveIdx(i => (i + 1) % HERO_CARDS.length);
    }, 4000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    function onResize() { setDeckWidth(Math.min(500, window.innerWidth - 48)); }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const deckScale = deckWidth / 500;

  return (
    <div
      className="select-none"
      style={{
        position: "relative",
        width: `${deckWidth}px`,
        height: `${Math.round(deckWidth * 480 / 500)}px`,
        margin: "0 auto",
      }}
      onMouseEnter={() => { paused.current = true; }}
      onMouseLeave={() => { paused.current = false; }}
    >
      <div style={{
        position: "absolute",
        top: 0, left: 0,
        width: "500px",
        height: "480px",
        transformOrigin: "top left",
        transform: `scale(${deckScale})`,
      }}>
        {HERO_CARDS.map((card, cardIdx) => {
          const pos = (cardIdx - activeIdx + HERO_CARDS.length) % HERO_CARDS.length;
          if (pos >= DECK_STACK.length) return null;
          const isFront = pos === 0;
          const tint = DECK_TINTS[card.type];
          const sp = DECK_STACK[pos];
          const isBookmarked = bookmarked.has(cardIdx);

          return (
            <div
              key={cardIdx}
              className="absolute rounded-[17px] overflow-hidden"
              style={{
                top: 0, left: 0,
                width: "480px", height: "445px",
                transform: `translate(${sp.tx}px, ${sp.ty + (isFront && frontHovered ? -7 : 0)}px) scale(${isFront && frontHovered ? 1.015 : sp.scale})`,
                transformOrigin: "top left",
                zIndex: 4 - pos,
                opacity: sp.opacity,
                background: tint.bg,
                border: `1px solid ${tint.border}`,
                boxShadow: isFront
                  ? frontHovered
                    ? "0 28px 60px rgba(0,0,0,0.22), 0 8px 24px rgba(0,0,0,0.10)"
                    : "0 20px 48px rgba(0,0,0,0.16), 0 4px 12px rgba(0,0,0,0.08)"
                  : "0 4px 12px rgba(0,0,0,0.06)",
                transition: "transform 0.38s cubic-bezier(0.23,1,0.32,1), opacity 0.35s ease, box-shadow 0.35s ease",
                cursor: isFront ? "pointer" : "default",
              }}
              onMouseEnter={() => { if (isFront) setFrontHovered(true); }}
              onMouseLeave={() => { if (isFront) setFrontHovered(false); }}
              onClick={isFront ? () => setActiveIdx(i => (i + 1) % HERO_CARDS.length) : undefined}
            >
              {card.type === "intro" ? (
                /* ── Branded intro card ── */
                <div className="absolute inset-0 flex flex-col" style={{ padding: "28px 28px 24px" }}>
                  {/* Radar ring watermark */}
                  <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ opacity: 0.09 }}>
                    <svg width="100%" height="100%" viewBox="0 0 480 445" xmlns="http://www.w3.org/2000/svg">
                      {[70, 130, 190, 260, 330, 400].map(r => (
                        <circle key={r} cx="420" cy="50" r={r} fill="none" stroke="white" strokeWidth="1.2"/>
                      ))}
                    </svg>
                  </div>

                  {/* Header */}
                  <div className="relative flex items-center gap-2">
                    <svg width="16" height="16" viewBox="0 0 28 28" fill="none" aria-hidden style={{ flexShrink: 0 }}>
                      <circle cx="14" cy="14" r="12" stroke="rgba(255,255,255,0.45)" strokeWidth="1.4"/>
                      <circle cx="14" cy="14" r="7.5" stroke="rgba(255,255,255,0.45)" strokeWidth="1.2" strokeOpacity="0.55"/>
                      <circle cx="14" cy="14" r="3" stroke="rgba(255,255,255,0.45)" strokeWidth="1.2" strokeOpacity="0.35"/>
                      <line x1="2" y1="14" x2="5" y2="14" stroke="rgba(255,255,255,0.45)" strokeWidth="1.2"/>
                      <line x1="23" y1="14" x2="26" y2="14" stroke="rgba(255,255,255,0.45)" strokeWidth="1.2"/>
                      <line x1="14" y1="2" x2="14" y2="5" stroke="rgba(255,255,255,0.45)" strokeWidth="1.2"/>
                      <line x1="14" y1="23" x2="14" y2="26" stroke="rgba(255,255,255,0.45)" strokeWidth="1.2"/>
                    </svg>
                    <span style={{ fontSize: "12px", fontWeight: 600, color: "rgba(255,255,255,0.40)", letterSpacing: "-0.01em" }}>EdenRadar</span>
                  </div>

                  {/* Headline */}
                  <div className="relative" style={{ marginTop: "24px" }}>
                    <div style={{ fontSize: "38px", fontWeight: 800, lineHeight: 1.15, color: "rgba(255,255,255,0.97)", letterSpacing: "-0.02em" }}>
                      The biotech landscape, scored daily.
                    </div>
                    <p style={{ fontSize: "15px", fontWeight: 400, color: "rgba(255,255,255,0.68)", lineHeight: 1.55, marginTop: "14px" }}>
                      EDEN monitors 350+ research institutions and surfaces what's worth your attention.
                    </p>
                  </div>

                  {/* Divider */}
                  <div style={{ height: "1px", background: "rgba(255,255,255,0.15)", marginTop: "24px", marginBottom: "20px" }} />

                  {/* 2×2 category grid */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                    {[
                      { label: "TTO Assets",       dot: "#6ee7b7" },
                      { label: "Clinical Trials",  dot: "#5eead4" },
                      { label: "Patents & IP",      dot: "#fcd34d" },
                      { label: "Research Papers",   dot: "#7dd3fc" },
                    ].map(({ label, dot }) => (
                      <div key={label} style={{
                        display: "flex", alignItems: "center", gap: "8px",
                        padding: "8px 12px",
                        borderRadius: "8px",
                        background: "rgba(255,255,255,0.08)",
                        border: "1px solid rgba(255,255,255,0.10)",
                      }}>
                        <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: dot, flexShrink: 0 }} />
                        <span style={{ fontSize: "13px", fontWeight: 500, color: "rgba(255,255,255,0.85)" }}>{label}</span>
                      </div>
                    ))}
                  </div>

                  {/* Divider */}
                  <div style={{ height: "1px", background: "rgba(255,255,255,0.15)", marginTop: "20px" }} />

                  {/* Footer */}
                  <div className="relative" style={{ paddingTop: "14px" }}>
                    <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.40)" }}>33K+ scored assets</span>
                  </div>
                </div>
              ) : (
                /* ── Data cards (TTO, trial, patent, research) ── */
                <>
                  {/* Left strip */}
                  <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: tint.strip }} />

                  {/* Tinted header zone */}
                  <div
                    className="absolute top-0 left-0 right-0 z-[3]"
                    style={{
                      height: "80px",
                      background: `${tint.strip}0d`,
                      borderBottom: `1px solid ${tint.strip}26`,
                    }}
                  />

                  {/* Score badge — TTO only */}
                  {card.type === "tto" && (
                    <div
                      className="absolute top-0 left-0 z-[5] flex flex-col items-center justify-center px-3 py-1.5"
                      style={{
                        borderRadius: "17px 0 10px 0",
                        minWidth: "80px",
                        background: tint.badgeBg,
                        borderBottom: `1px solid ${tint.badgeBorderColor}`,
                        borderRight: `1px solid ${tint.badgeBorderColor}`,
                        boxShadow: isFront ? `0 4px 20px ${tint.strip}40` : "none",
                      }}
                    >
                      <span className="text-[11px] font-bold tracking-[0.15em] uppercase leading-none" style={{ color: "#71717a" }}>Score</span>
                      <span className="font-mono text-[40px] font-bold leading-tight tabular-nums mt-0.5" style={{ color: tint.scoreColor }}>
                        {card.score}
                      </span>
                    </div>
                  )}

                  {/* Type label */}
                  <div
                    className="absolute z-[4] flex items-center justify-center pointer-events-none"
                    style={{
                      top: 0,
                      left: card.type === "tto" ? "80px" : 0,
                      right: "68px",
                      height: "80px",
                    }}
                  >
                    <span className="text-[22px] font-bold uppercase tracking-[0.06em]" style={{ color: tint.strip }}>
                      {card.type === "tto" ? "TTO Asset" : card.type === "trial" ? "Clinical Trial" : card.type === "patent" ? "Patent" : "Research"}
                    </span>
                  </div>

                  {/* Bookmark — front card only */}
                  {isFront && (
                    <div
                      className="absolute top-2 right-2 z-[5]"
                      onClick={(e) => {
                        e.stopPropagation();
                        setBookmarked(prev => {
                          const next = new Set(prev);
                          next.has(cardIdx) ? next.delete(cardIdx) : next.add(cardIdx);
                          return next;
                        });
                      }}
                    >
                      <button
                        className={`w-14 h-14 rounded-lg flex items-center justify-center transition-all duration-200 ${
                          isBookmarked
                            ? "text-emerald-600 bg-emerald-500/10"
                            : "text-zinc-400 hover:text-emerald-600 hover:bg-emerald-500/10"
                        }`}
                      >
                        {isBookmarked ? <BookmarkCheck className="w-8 h-8" /> : <Bookmark className="w-8 h-8" />}
                      </button>
                    </div>
                  )}

                  {/* Content */}
                  <div className="absolute inset-0 z-[4] flex flex-col pl-6 pr-5 pt-[84px] pb-5">
                    <h3 className="text-[20px] font-semibold text-zinc-900 leading-snug line-clamp-3 mt-2">
                      {card.name}
                    </h3>
                    <p className="text-[15px] text-zinc-500 leading-snug mt-3 line-clamp-1">
                      {card.indication}
                    </p>
                    <p className="text-[14px] text-zinc-600 leading-relaxed mt-3 line-clamp-3">
                      {card.summary}
                    </p>
                    <div className="flex flex-wrap gap-2.5 mt-4">
                      <span className={`text-[13px] font-medium px-3 py-1.5 rounded border-l-2 ${deckStagePillClass(card.stage)}`}>
                        {card.stage}
                      </span>
                      <span className="text-[13px] font-medium px-3 py-1.5 rounded text-emerald-700 bg-emerald-50 border border-emerald-200/70">
                        {card.modality}
                      </span>
                      {card.rising && (
                        <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold px-3 py-1.5 rounded bg-emerald-50 border border-emerald-200/70 text-emerald-600">
                          <TrendingUp className="w-3.5 h-3.5" /> Rising
                        </span>
                      )}
                      {card.sources >= 2 && (
                        <span className="text-[13px] font-semibold px-3 py-1.5 rounded bg-sky-50 border border-sky-200/70 text-sky-600">
                          {card.sources} sources
                        </span>
                      )}
                    </div>
                    <div className="flex-1" />
                    <p className="flex items-center gap-2 text-[14px] text-zinc-700 font-medium leading-snug mb-4 line-clamp-1">
                      <Building2 className="w-3.5 h-3.5 shrink-0 opacity-50" />
                      {card.institution}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        className="flex-1 h-11 rounded-md text-[14px] font-semibold tracking-wide bg-emerald-600 text-white"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Asset Dossier
                      </button>
                      <button
                        className="h-11 px-4 rounded-md text-[12px] font-medium text-zinc-400"
                        onClick={(e) => e.stopPropagation()}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────────── Main Landing ────────────────────── */

const STATS = [
  { value: "350+",  label: "Tech Transfer Offices" },
  { value: "33K+",  label: "Scored Assets" },
  { value: "40+",   label: "Live Data Sources" },
  { value: "Daily", label: "Updates & Alerts", raw: true },
];

export default function Landing() {
  useDocumentMeta({
    title: "EdenRadar — Where Biotech Research Meets Industry Intelligence",
    description:
      "AI-powered biotech asset discovery across 350+ tech transfer offices. EDEN queries 40+ live data sources (patents, clinical trials, literature) to score and surface licensable assets for industry BD teams.",
  });
  const [, navigate] = useLocation();
  const { session, role, loading } = useAuth();
  const statsRef = useReveal();

  useEffect(() => {
    if (!loading && session && role) {
      const dest = role === "industry" ? "/scout" : role === "researcher" ? "/research" : "/discovery";
      navigate(dest, { replace: true });
    }
  }, [loading, session, role, navigate]);

  if (!loading && session && role) return null;

  function handleLogin() { navigate("/demo"); }
  function handleGetStarted() {
    document.getElementById("explore")?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Nav />

      <main className="flex-1">
        {/* ── Hero ── */}
        <section className="relative overflow-hidden" style={{ minHeight: "92vh" }}>
          <RadarBackground />

          <div className="relative z-10 max-w-screen-xl mx-auto px-4 sm:px-6"
            style={{ minHeight: "92vh", paddingTop: "6rem", paddingBottom: "5rem", display: "flex", flexDirection: "column", justifyContent: "center" }}>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
              {/* Left: copy + stats */}
              <div className="flex flex-col items-start text-left">
                <h1 className="mb-6 font-black tracking-tight leading-[1.0] text-foreground"
                  style={{ fontSize: "clamp(2.25rem, 5vw, 4.5rem)", textWrap: "balance" } as React.CSSProperties}>
                  The next biotech breakthrough is{" "}
                  <span className="text-emerald-600">already published.</span>
                </h1>
                <p className="text-base sm:text-lg max-w-lg leading-relaxed mb-10 text-foreground/65 dark:text-white/65">
                  Published assets sit undiscovered for months. Being first isn't about searching harder. Real-time institutional monitoring means the right assets find you first.
                </p>
                <Button
                  size="lg"
                  onClick={handleGetStarted}
                  data-testid="button-cta-get-started"
                  className="h-11 px-8 font-semibold gap-2"
                  style={{ background: "hsl(33 85% 44%)", border: "none", color: "white" }}
                >
                  Get started
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>
                <div ref={statsRef} className="reveal-section grid grid-cols-2 gap-x-10 gap-y-5 mt-12 w-full max-w-sm">
                  {STATS.map((s) => (
                    <div key={s.label} data-testid={`stat-${s.label.replace(/\s+/g, "-").toLowerCase()}`}>
                      <div className="text-2xl font-bold mb-0.5" style={{ color: s.value === "350+" ? "hsl(33 85% 42%)" : "hsl(var(--primary))" }}>
                        {(s as { raw?: boolean }).raw ? s.value : <NumberTicker value={s.value} />}
                      </div>
                      <div className="text-[11px] tracking-wide font-semibold text-foreground/60 dark:text-white/60">{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right: interactive card deck */}
              <HeroCardDeck />
            </div>
          </div>

          <div
            className="absolute bottom-0 left-0 right-0 h-24 pointer-events-none"
            style={{ background: "linear-gradient(to bottom, transparent, hsl(var(--background)))" }}
          />
        </section>

        {/* ── Institution marquee ── */}
        <InstitutionMarquee />

        <RecentFeed />
        <IntelligenceSection onLogin={handleLogin} />
        <BottomCTA onLogin={handleLogin} />
      </main>

      <footer className="border-t border-border py-10 bg-background">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 mb-8">
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">For Researchers</h4>
              <ul className="space-y-2">
                <li>
                  <Link href="/research" className="text-xs text-foreground hover:text-primary transition-colors" data-testid="footer-link-edenlab">
                    EdenLab
                  </Link>
                </li>
                <li>
                  <Link href="/discovery" className="text-xs text-foreground hover:text-primary transition-colors" data-testid="footer-link-edendiscovery">
                    EdenDiscovery
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">For Industry</h4>
              <ul className="space-y-2">
                <li>
                  <Link href="/scout" className="text-xs text-foreground hover:text-primary transition-colors" data-testid="footer-link-EdenRadar">
                    EdenRadar
                  </Link>
                </li>
                <li>
                  <Link href="/market" className="text-xs text-foreground hover:text-primary transition-colors" data-testid="footer-link-edenmarket">
                    EdenMarket
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Company</h4>
              <ul className="space-y-2">
                <li>
                  <Link href="/about" className="text-xs text-foreground hover:text-primary transition-colors" data-testid="footer-link-about">
                    About
                  </Link>
                </li>
                <li>
                  <Link href="/how-it-works" className="text-xs text-foreground hover:text-primary transition-colors" data-testid="footer-link-how-it-works">
                    How It Works
                  </Link>
                </li>
                <li>
                  <Link href="/pricing" className="text-xs text-foreground hover:text-primary transition-colors" data-testid="footer-link-pricing">
                    Pricing
                  </Link>
                </li>
                <li>
                  <Link href="/demo" className="text-xs text-foreground hover:text-primary transition-colors" data-testid="footer-link-demo">
                    Request Access
                  </Link>
                </li>
                <li>
                  <Link href="/one-pager" className="text-xs text-foreground hover:text-primary transition-colors" data-testid="footer-link-one-pager">
                    EdenRadar One-Pager
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Legal</h4>
              <ul className="space-y-2">
                <li>
                  <Link href="/privacy" className="text-xs text-foreground hover:text-primary transition-colors" data-testid="footer-link-privacy">
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link href="/tos" className="text-xs text-foreground hover:text-primary transition-colors" data-testid="footer-link-tos">
                    Terms of Service
                  </Link>
                </li>
                <li>
                  <Link href="/dpa" className="text-xs text-foreground hover:text-primary transition-colors" data-testid="footer-link-dpa">
                    Data Processing Agreement
                  </Link>
                </li>
                <li>
                  <Link href="/status" className="text-xs text-foreground hover:text-primary transition-colors" data-testid="footer-link-status">
                    System Status
                  </Link>
                </li>
                <li>
                  <button
                    onClick={() => navigate("/login")}
                    className="text-xs text-foreground hover:text-primary transition-colors text-left"
                    data-testid="footer-link-login"
                  >
                    Log In
                  </button>
                </li>
              </ul>
            </div>
          </div>
          <div className="pt-6 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="font-bold text-foreground text-sm">
                Eden<span className="text-primary">Radar</span>
              </span>
              <span className="text-muted-foreground text-xs">· AI Biotech Asset Intelligence</span>
              <span className="text-muted-foreground text-xs">· © {new Date().getFullYear()}</span>
            </div>
            <EdenNXBadge />
          </div>
        </div>
      </footer>
    </div>
  );
}
