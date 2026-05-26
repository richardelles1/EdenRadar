import { useEffect } from "react";
import { Dna, FlaskConical, Brain, Shield, TrendingUp, Building2, Microscope, Pill, Zap, Globe, BarChart2, Layers, FileSearch, BookOpen, Clock, Flame, MapPin, Search } from "lucide-react";

export function EdenAvatar({ isThinking = false, size = 36 }: { isThinking?: boolean; size?: number }) {
  const r = size / 2;
  const innerR = r * 0.52;
  const ring1R = r * 0.72;
  const ring2R = r * 0.92;
  const gradId = `ea-grad-${size}`;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" className="shrink-0" aria-hidden="true">
      <defs>
        <radialGradient id={gradId} cx="50%" cy="38%" r="62%">
          <stop offset="0%" stopColor="#6ee7b7" stopOpacity="0.55"/>
          <stop offset="55%" stopColor="#10b981" stopOpacity="0.22"/>
          <stop offset="100%" stopColor="#10b981" stopOpacity="0.04"/>
        </radialGradient>
      </defs>
      <style>{`
        @keyframes eden-ring1 { 0%,100%{opacity:.18;r:${ring1R}px} 50%{opacity:.38;r:${ring1R * 1.06}px} }
        @keyframes eden-ring2 { 0%,100%{opacity:.08;r:${ring2R}px} 50%{opacity:.22;r:${ring2R * 1.04}px} }
        @keyframes eden-think1 { 0%,100%{opacity:.35;r:${ring1R}px} 50%{opacity:.6;r:${ring1R * 1.1}px} }
        @keyframes eden-think2 { 0%,100%{opacity:.18;r:${ring2R}px} 50%{opacity:.4;r:${ring2R * 1.07}px} }
        @keyframes eden-core { 0%,100%{opacity:.85} 50%{opacity:1} }
      `}</style>
      <circle cx={r} cy={r} r={ring2R} fill="none" stroke="#10b981"
        style={{ animation: isThinking ? `eden-think2 1s ease-in-out infinite` : `eden-ring2 2.8s ease-in-out infinite` }} />
      <circle cx={r} cy={r} r={ring1R} fill="none" stroke="#10b981" strokeWidth="1.2"
        style={{ animation: isThinking ? `eden-think1 0.8s ease-in-out infinite` : `eden-ring1 2.2s ease-in-out infinite` }} />
      <circle cx={r} cy={r} r={innerR} fill={`url(#${gradId})`} />
      <circle cx={r} cy={r} r={innerR * 0.6} fill="#10b981"
        style={{ animation: `eden-core ${isThinking ? "0.7s" : "2s"} ease-in-out infinite` }} />
      <circle cx={r} cy={r} r={innerR * 0.28} fill="#ecfdf5" />
    </svg>
  );
}

export function EdenOrb({ isThinking = false }: { isThinking?: boolean }) {
  const W = 560, H = 600;
  const cx = W / 2, cy = H / 2;

  const HAL = { rx: 248, ry: 84 };
  const R1  = { rx: 210, ry: 71 };
  const R2  = { rx: 160, ry: 54 };
  const R3  = { rx: 112, ry: 38 };

  function makePts(count: number, ring: { rx: number; ry: number }, offset = 0) {
    return Array.from({ length: count }, (_, i) => {
      const t = (i / count) * Math.PI * 2 + offset;
      const depth = (Math.sin(t) + 1) / 2;
      return {
        x: cx + ring.rx * Math.cos(t),
        y: cy + ring.ry * Math.sin(t),
        r: 0.8 + 3.4 * depth,
        op: 0.09 + 0.76 * depth,
        dur: isThinking ? 0.55 + (i % 4) * 0.14 : 1.6 + (i % 6) * 0.32,
        delay: (i / count) * (isThinking ? 1.1 : 3.2),
      };
    });
  }

  const outerPts = makePts(48, R1, 0);
  const midPts   = makePts(22, R2, 0.28);
  const innerPts = makePts(12, R3, 0.55);

  const rotDur = isThinking ? "8s"  : "22s";
  const revDur = isThinking ? "14s" : "36s";
  const orbDur = isThinking ? "2s"  : "7s";
  const midDur = isThinking ? "3s"  : "9s";
  const halDur = isThinking ? "5s"  : "14s";

  const makePath = (ring: { rx: number; ry: number }, sweep: 0 | 1) =>
    `M ${cx + ring.rx},${cy} A ${ring.rx},${ring.ry} 0 1,${sweep} ${cx - ring.rx},${cy} A ${ring.rx},${ring.ry} 0 1,${sweep} ${cx + ring.rx},${cy} Z`;

  const p1 = makePath(R1, 0);
  const p2 = makePath(R2, 1);
  const p3 = makePath(HAL, 1);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} fill="none" aria-hidden="true"
      className="mx-auto w-full max-w-[560px]" style={{ height: "auto" }}>
      <defs>
        <filter id="eo-glow-i" x="-120%" y="-120%" width="340%" height="340%">
          <feGaussianBlur stdDeviation="2.8" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="eo-halo-i" x="-200%" y="-200%" width="500%" height="500%">
          <feGaussianBlur stdDeviation="7" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="eo-ambient-i" x="-200%" y="-200%" width="500%" height="500%">
          <feGaussianBlur stdDeviation="28"/>
        </filter>
        <radialGradient id="eo-bg1-i" cx="50%" cy="52%" r="44%">
          <stop offset="0%"   stopColor="#10b981" stopOpacity="0.13"/>
          <stop offset="60%"  stopColor="#10b981" stopOpacity="0.04"/>
          <stop offset="100%" stopColor="#10b981" stopOpacity="0"/>
        </radialGradient>
        <radialGradient id="eo-bg2-i" cx="50%" cy="54%" r="26%">
          <stop offset="0%"   stopColor="#6ee7b7" stopOpacity="0.09"/>
          <stop offset="100%" stopColor="#6ee7b7" stopOpacity="0"/>
        </radialGradient>
      </defs>
      <style>{`
        @keyframes eden-orb-rotate  { from { transform: rotate(0deg);    } to { transform: rotate(360deg);   } }
        @keyframes eden-orb-counter { from { transform: rotate(0deg);    } to { transform: rotate(-360deg);  } }
        @keyframes eden-nuc-rotate  { from { transform: rotate(0deg);    } to { transform: rotate(360deg);   } }
        @keyframes eden-nuc-counter { from { transform: rotate(0deg);    } to { transform: rotate(-360deg);  } }
      `}</style>

      <ellipse cx={cx} cy={cy} rx="240" ry="240" fill="url(#eo-bg1-i)"/>
      <ellipse cx={cx} cy={cy} rx="140" ry="140" fill="url(#eo-bg2-i)"/>
      <circle  cx={cx} cy={cy + 30} r="100" fill="#10b981" fillOpacity="0.03" filter="url(#eo-ambient-i)"/>

      <g style={{ transformOrigin: `${cx}px ${cy}px`, animation: `eden-orb-counter ${revDur} linear infinite` }}>
        <path d={p3} fill="none" stroke="#10b981" strokeWidth="0.5" strokeOpacity="0.06"
          filter="url(#eo-halo-i)" style={{ animation: `eden-orb-counter ${halDur} ease-in-out infinite alternate` }} />
      </g>

      <g style={{ transformOrigin: `${cx}px ${cy}px`, animation: `eden-orb-rotate ${rotDur} linear infinite` }}>
        {outerPts.map((pt, i) => (
          <circle key={i} cx={pt.x} cy={pt.y} r={pt.r} fill="#10b981" fillOpacity={pt.op}
            filter="url(#eo-glow-i)"
            style={{ animation: `eden-orb-counter ${pt.dur}s ease-in-out infinite`, animationDelay: `${pt.delay}s` }} />
        ))}
        <path d={p1} fill="none" stroke="#10b981" strokeWidth="0.6" strokeOpacity="0.14"
          style={{ animation: `eden-orb-counter ${orbDur} ease-in-out infinite alternate` }} />
      </g>

      <g style={{ transformOrigin: `${cx}px ${cy}px`, animation: `eden-orb-counter ${rotDur} linear infinite` }}>
        {midPts.map((pt, i) => (
          <circle key={i} cx={pt.x} cy={pt.y} r={pt.r * 0.9} fill="#6ee7b7" fillOpacity={pt.op * 0.85}
            filter="url(#eo-glow-i)"
            style={{ animation: `eden-orb-rotate ${pt.dur}s ease-in-out infinite`, animationDelay: `${pt.delay}s` }} />
        ))}
        <path d={p2} fill="none" stroke="#6ee7b7" strokeWidth="0.5" strokeOpacity="0.12"
          style={{ animation: `eden-orb-rotate ${midDur} ease-in-out infinite alternate` }} />
      </g>

      <g style={{ transformOrigin: `${cx}px ${cy}px`, animation: `eden-orb-rotate ${isThinking ? "6s" : "16s"} linear infinite` }}>
        {innerPts.map((pt, i) => (
          <circle key={i} cx={pt.x} cy={pt.y} r={pt.r * 1.1} fill="#a7f3d0" fillOpacity={pt.op * 0.7}
            filter="url(#eo-glow-i)"
            style={{ animation: `eden-orb-counter ${pt.dur * 0.7}s ease-in-out infinite`, animationDelay: `${pt.delay}s` }} />
        ))}
      </g>

      {/* ── Nucleus floating rings — small tilted ellipses orbiting the center ── */}
      {[
        { rx: 48, ry: 12, tilt: 0,   anim: "eden-nuc-rotate",   dur: isThinking ? "3.2s" : "8.0s",  op: 0.35, stroke: "#10b981", sw: 0.9 },
        { rx: 40, ry: 10, tilt: 40,  anim: "eden-nuc-counter",  dur: isThinking ? "4.8s" : "12.0s", op: 0.28, stroke: "#6ee7b7", sw: 0.8 },
        { rx: 32, ry: 8,  tilt: 80,  anim: "eden-nuc-rotate",   dur: isThinking ? "2.4s" : "6.0s",  op: 0.40, stroke: "#10b981", sw: 0.8 },
        { rx: 24, ry: 6,  tilt: 120, anim: "eden-nuc-counter",  dur: isThinking ? "3.8s" : "9.5s",  op: 0.32, stroke: "#6ee7b7", sw: 0.7 },
        { rx: 20, ry: 6,  tilt: 160, anim: "eden-nuc-rotate",   dur: isThinking ? "5.0s" : "13.0s", op: 0.44, stroke: "#a7f3d0", sw: 0.7 },
      ].map((nr, i) => (
        <g key={i} style={{ transformOrigin: `${cx}px ${cy}px`, animation: `${nr.anim} ${nr.dur} linear infinite` }}>
          <g transform={`rotate(${nr.tilt}, ${cx}, ${cy})`}>
            <ellipse cx={cx} cy={cy} rx={nr.rx} ry={nr.ry}
              fill="none" stroke={nr.stroke} strokeWidth={nr.sw} strokeOpacity={nr.op}
              filter="url(#eo-glow-i)" />
          </g>
        </g>
      ))}

      <circle cx={cx} cy={cy} r="14" fill="#10b981" fillOpacity="0.18" filter="url(#eo-halo-i)"/>
      <circle cx={cx} cy={cy} r="8"  fill="#10b981" fillOpacity="0.55" filter="url(#eo-glow-i)"/>
      <circle cx={cx} cy={cy} r="4"  fill="#ecfdf5" fillOpacity="0.9"/>
    </svg>
  );
}

function renderMdInline(text: string): (string | JSX.Element)[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\[[^\]]*\]\([^)]+\)|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
    }
    const link = part.match(/^\[([^\]]*)\]\(([^)]+)\)$/);
    if (link) {
      return <a key={i} href={link[2]} target="_blank" rel="noopener noreferrer" className="underline text-primary hover:text-primary/80">{link[1]}</a>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={i} className="font-mono text-[11px] bg-muted px-1 rounded">{part.slice(1, -1)}</code>;
    }
    return part;
  });
}

export function MarkdownContent({ text, isStreaming }: { text: string; isStreaming?: boolean }) {
  const lines = text.split("\n");
  const nodes: JSX.Element[] = [];
  lines.forEach((line, i) => {
    if (line.startsWith("## ")) {
      nodes.push(<h2 key={i} className="font-bold text-sm mt-3 mb-0.5 text-foreground">{renderMdInline(line.slice(3))}</h2>);
    } else if (line.startsWith("### ")) {
      nodes.push(<h3 key={i} className="font-semibold text-sm mt-2 mb-0.5 text-foreground">{renderMdInline(line.slice(4))}</h3>);
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      nodes.push(
        <div key={i} className="flex gap-1.5 text-sm leading-relaxed">
          <span className="mt-0.5 shrink-0 text-muted-foreground">•</span>
          <span>{renderMdInline(line.slice(2))}</span>
        </div>
      );
    } else if (/^\d+\.\s/.test(line)) {
      const match = line.match(/^(\d+)\.\s(.*)$/);
      if (match) {
        nodes.push(
          <div key={i} className="flex gap-1.5 text-sm leading-relaxed">
            <span className="shrink-0 text-muted-foreground">{match[1]}.</span>
            <span>{renderMdInline(match[2])}</span>
          </div>
        );
      }
    } else if (line.trim() === "") {
      nodes.push(<div key={i} className="h-1.5" />);
    } else {
      nodes.push(<p key={i} className="text-sm leading-relaxed">{renderMdInline(line)}</p>);
    }
  });
  return (
    <div className="space-y-0.5">
      {nodes}
      {isStreaming && <span className="animate-pulse text-muted-foreground">▌</span>}
    </div>
  );
}

// ── Shared prompt cards ───────────────────────────────────────────────────
export const PROMPT_CARDS = [
  {
    icon: Dna,
    label: "CRISPR opportunities",
    q: "Which CRISPR or base editing technologies are available for licensing from top research universities?",
    color: "from-emerald-500/10 to-emerald-600/5 border-emerald-500/20 hover:border-emerald-500/40",
    iconColor: "text-emerald-500",
    tags: ["crispr", "gene editing", "base editing"],
  },
  {
    icon: FlaskConical,
    label: "Oncology pipeline now",
    q: "What are the most compelling oncology assets I should know about right now?",
    color: "from-sky-500/10 to-sky-600/5 border-sky-500/20 hover:border-sky-500/40",
    iconColor: "text-sky-500",
    tags: ["oncology", "cancer", "tumor"],
  },
  {
    icon: TrendingUp,
    label: "Gene therapy leaders",
    q: "Who's leading in gene therapy — show me the top university programs available for partnership",
    color: "from-violet-500/10 to-violet-600/5 border-violet-500/20 hover:border-violet-500/40",
    iconColor: "text-violet-500",
    tags: ["gene therapy", "aav", "viral vector"],
  },
  {
    icon: Shield,
    label: "Early autoimmune assets",
    q: "Show me early-stage autoimmune or inflammatory disease assets available for partnership",
    color: "from-amber-500/10 to-amber-600/5 border-amber-500/20 hover:border-amber-500/40",
    iconColor: "text-amber-500",
    tags: ["autoimmune", "immunology", "inflammation"],
  },
  {
    icon: Brain,
    label: "CNS platform tech",
    q: "Find CNS platform technologies with clear mechanisms of action available for licensing",
    color: "from-rose-500/10 to-rose-600/5 border-rose-500/20 hover:border-rose-500/40",
    iconColor: "text-rose-500",
    tags: ["cns", "neurology", "brain"],
  },
  {
    icon: Building2,
    label: "Most active TTOs",
    q: "Which university TTOs have the largest and most active licensing portfolios — and what areas are they strongest in?",
    color: "from-teal-500/10 to-teal-600/5 border-teal-500/20 hover:border-teal-500/40",
    iconColor: "text-teal-500",
    tags: [],
  },
  {
    icon: Microscope,
    label: "Antibody Phase 2+",
    q: "Show me the most advanced antibody and bispecific programs available for licensing — anything approaching or at clinical stage?",
    color: "from-indigo-500/10 to-indigo-600/5 border-indigo-500/20 hover:border-indigo-500/40",
    iconColor: "text-indigo-500",
    tags: ["antibody", "bispecific", "biologics", "mab"],
  },
  {
    icon: Pill,
    label: "Metabolic small mol.",
    q: "Find small molecule assets for metabolic diseases like obesity or diabetes",
    color: "from-orange-500/10 to-orange-600/5 border-orange-500/20 hover:border-orange-500/40",
    iconColor: "text-orange-500",
    tags: ["small molecule", "metabolic", "diabetes", "obesity"],
  },
  {
    icon: Zap,
    label: "mRNA platforms",
    q: "What mRNA or RNA therapeutic platforms are out there for licensing?",
    color: "from-pink-500/10 to-pink-600/5 border-pink-500/20 hover:border-pink-500/40",
    iconColor: "text-pink-500",
    tags: ["mrna", "rna", "nucleotide", "oligonucleotide"],
  },
  {
    icon: Globe,
    label: "Rare disease assets",
    q: "Find orphan drug or rare disease assets with strong unmet medical need",
    color: "from-cyan-500/10 to-cyan-600/5 border-cyan-500/20 hover:border-cyan-500/40",
    iconColor: "text-cyan-500",
    tags: ["rare disease", "orphan"],
  },
  {
    icon: BarChart2,
    label: "Compare top TTOs",
    q: "Compare the oncology pipelines at Stanford, MIT, and Johns Hopkins",
    color: "from-purple-500/10 to-purple-600/5 border-purple-500/20 hover:border-purple-500/40",
    iconColor: "text-purple-500",
    tags: ["oncology", "cancer"],
  },
  {
    icon: Layers,
    label: "Platform technologies",
    q: "Find platform technologies from university TTOs that apply across multiple therapeutic areas — delivery platforms, chemistry platforms, anything cross-cutting",
    color: "from-lime-500/10 to-lime-600/5 border-lime-500/20 hover:border-lime-500/40",
    iconColor: "text-lime-600",
    tags: ["platform"],
  },
  {
    icon: FileSearch,
    label: "Trials enrolling now",
    q: "What clinical trials are actively enrolling in oncology or rare disease right now?",
    color: "from-blue-500/10 to-blue-600/5 border-blue-500/20 hover:border-blue-500/40",
    iconColor: "text-blue-500",
    tags: ["oncology", "rare disease", "clinical trial"],
  },
  {
    icon: BookOpen,
    label: "CRISPR patent map",
    q: "Who holds the key patents in CRISPR and gene editing right now?",
    color: "from-fuchsia-500/10 to-fuchsia-600/5 border-fuchsia-500/20 hover:border-fuchsia-500/40",
    iconColor: "text-fuchsia-500",
    tags: ["crispr", "gene editing", "patents"],
  },
  {
    icon: Clock,
    label: "New this month",
    q: "What new TTO assets have been added to the corpus in the last 30 days?",
    color: "from-green-500/10 to-green-600/5 border-green-500/20 hover:border-green-500/40",
    iconColor: "text-green-500",
    tags: ["oncology", "gene therapy", "autoimmune", "cns", "rare disease", "new"],
  },
  {
    icon: Flame,
    label: "Trending in BD right now",
    q: "What's generating the most interest in university tech transfer right now — what's trending?",
    color: "from-orange-600/10 to-red-600/5 border-orange-600/20 hover:border-orange-600/40",
    iconColor: "text-orange-600",
    tags: ["oncology", "cancer", "gene therapy", "trending", "hot"],
  },
  {
    icon: MapPin,
    label: "European TTO assets",
    q: "Show me oncology and rare disease assets from European university technology transfer offices",
    color: "from-sky-600/10 to-sky-700/5 border-sky-600/20 hover:border-sky-600/40",
    iconColor: "text-sky-600",
    tags: ["eu", "europe", "oxford", "cambridge", "international"],
  },
  {
    icon: Search,
    label: "Where are the gaps?",
    q: "Where is the white space in the TTO corpus — which therapeutic areas are underrepresented given current BD trends?",
    color: "from-slate-500/10 to-slate-600/5 border-slate-500/20 hover:border-slate-500/40",
    iconColor: "text-slate-500",
    tags: [],
  },
];

// ── Personalized card selection based on user profile ────────────────────
export function getPersonalizedCards(
  profile: { therapeuticAreas?: string[]; modalities?: string[] },
  count = 6
): typeof PROMPT_CARDS {
  const profileTerms = [
    ...(profile.therapeuticAreas ?? []),
    ...(profile.modalities ?? []),
  ].map((t) => t.toLowerCase());

  if (profileTerms.length === 0) return PROMPT_CARDS.slice(0, count);

  const scored = PROMPT_CARDS.map((card) => ({
    card,
    score: card.tags.filter((tag) =>
      profileTerms.some((term) => term.includes(tag) || tag.includes(term))
    ).length,
  }));

  scored.sort((a, b) => b.score - a.score || PROMPT_CARDS.indexOf(a.card) - PROMPT_CARDS.indexOf(b.card));
  return scored.slice(0, count).map((s) => s.card);
}

// ── Conversational search labels ─────────────────────────────────────────
const SEARCH_INSTITUTION_MAP: Array<[RegExp, string]> = [
  [/\bstanford\b/i, "Stanford's pipeline"],
  [/\bmit\b/i, "MIT's pipeline"],
  [/\bharvard\b/i, "Harvard's pipeline"],
  [/\bjohns\s+hopkins\b/i, "Johns Hopkins"],
  [/\byale\b/i, "Yale's programs"],
  [/\bcolumbia\b/i, "Columbia's pipeline"],
  [/\bucsf\b/i, "UCSF's pipeline"],
  [/\bduke\b/i, "Duke's programs"],
  [/\bupenn\b|\bbpenn\b/i, "Penn's pipeline"],
  [/\boxford\b/i, "Oxford's programs"],
  [/\bcambridge\b/i, "Cambridge's pipeline"],
];

const SEARCH_INDICATION_MAP: Array<[RegExp, string]> = [
  [/oncolog|cancer|tumor/i, "oncology assets"],
  [/gene therapy|crispr|aav|base edit/i, "gene therapy programs"],
  [/autoimmune|rheumat|inflam/i, "autoimmune assets"],
  [/\bcns\b|neuro|alzheimer|parkinson/i, "CNS programs"],
  [/metabol|diabetes|obesity|nash|fatty liver/i, "metabolic assets"],
  [/rare disease|orphan/i, "rare disease assets"],
  [/antibod|bispecific|\bmab\b|monoclonal/i, "antibody programs"],
  [/mrna|rna therapeutic|oligonucleotide/i, "RNA platforms"],
  [/immuno.oncol|checkpoint|car.t/i, "immuno-oncology assets"],
  [/cardio|cardiac|\bheart\b/i, "cardiovascular assets"],
  [/platform/i, "platform technologies"],
];

const SEARCH_EXTERNAL_MAP: Array<[RegExp, string]> = [
  [/clinical trial|enrolling|NCT\d|\bIND\b|phase [123]/i, "ClinicalTrials.gov…"],
  [/patent|prior art|\bPCT\b|\bUSPTO\b|\bWIPO\b/i, "patent filings…"],
  [/harvard.*library|dataverse|research.*repository/i, "Harvard research…"],
];

const SEARCH_POOL = [
  "Scanning the corpus…",
  "Mapping the space…",
  "Checking university pipelines…",
  "Digging through recent assets…",
  "Searching institutional programs…",
  "Scanning licensed technologies…",
  "Combing through the pipeline…",
  "Reviewing available assets…",
];

export function getSearchLabel(query: string, poolIndex: number): string {
  if (!query) return SEARCH_POOL[poolIndex % SEARCH_POOL.length];
  for (const [regex, label] of SEARCH_EXTERNAL_MAP) {
    if (regex.test(query)) return `Checking ${label}`;
  }
  for (const [regex, name] of SEARCH_INSTITUTION_MAP) {
    if (regex.test(query)) return `Scanning ${name}…`;
  }
  for (const [regex, label] of SEARCH_INDICATION_MAP) {
    if (regex.test(query)) return `Digging into ${label}…`;
  }
  return SEARCH_POOL[poolIndex % SEARCH_POOL.length];
}

// ── Shared follow-up pill logic ───────────────────────────────────────────
export const FOLLOW_UP_RULES: Array<{ test: (text: string) => boolean; pills: string[] }> = [
  {
    test: (t) => /oncolog|cancer|tumor/i.test(t),
    pills: ["Filter to Phase 1 oncology only", "Show oncology antibody programs"],
  },
  {
    test: (t) => /gene therapy|crispr|aav|viral vector/i.test(t),
    pills: ["Show ex-vivo gene therapy assets", "Compare delivery modalities"],
  },
  {
    test: (t) => /autoimmune|rheumat|inflam/i.test(t),
    pills: ["Show antibody-based options only", "Filter to Phase 2+"],
  },
  {
    test: (t) => /cns|neuro|brain|alzheimer|parkinson/i.test(t),
    pills: ["Show CNS small molecules only", "Which have clinical data?"],
  },
  {
    test: (t) => /stanford|mit|harvard|columbia|johns Hopkins/i.test(t),
    pills: ["Compare these institutions", "What's their most active area?"],
  },
  {
    test: (t) => /licens|available|partnership|deal/i.test(t),
    pills: ["Show exclusive licensing opportunities", "Filter by readiness stage"],
  },
  {
    test: (t) => /antibod|bispecific|mab|monoclonal/i.test(t),
    pills: ["Show bispecific antibody programs", "Filter antibodies to oncology"],
  },
  {
    test: (t) => /how many|count|number|how much/i.test(t),
    pills: ["Break this down by stage", "Show the top institutions"],
  },
  {
    test: (t) => /NCT\d|clinical trial|enrolling|phase [123]|IND\b/i.test(t),
    pills: ["Show TTO assets in this indication", "Filter to Phase 2+ trials"],
  },
  {
    test: (t) => /patent|prior art|PCT|claim|WIPO|USPTO/i.test(t),
    pills: ["Find TTO assets in this space", "Who holds these patents?"],
  },
  {
    test: (t) => /new|recent|latest|just added|this month|this quarter|trending|hot right now|what's new/i.test(t),
    pills: ["Show what's new in oncology", "What's trending in gene therapy?"],
  },
  {
    test: (t) => /europe|european|\bEU\b|\bUK\b|oxford|cambridge|germany|france|switzerland|netherlands|sweden|danish|nordic/i.test(t),
    pills: ["Show more European assets", "Filter to UK institutions only"],
  },
  {
    test: (t) => /white.?space|gap|under.?represent|missing|thin|blind spot|not covered|what.*lacking/i.test(t),
    pills: ["What's thin in gene therapy?", "Which modalities are underrepresented?"],
  },
];

export function getFollowUpPills(responseText: string, hasAssets: boolean): string[] {
  // hasAssets is true when TTO corpus assets OR external results are present
  if (!hasAssets) return [];
  for (const rule of FOLLOW_UP_RULES) {
    if (rule.test(responseText)) {
      return rule.pills.slice(0, 2);
    }
  }
  return [];
}

// ── EDEN acronym intro animation ──────────────────────────────────────────
export function EdenIntro({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1800);
    return () => clearTimeout(t);
  }, [onDone]);

  const LETTERS = ["E", "D", "E", "N"];

  return (
    <div className="flex flex-col items-center justify-center flex-1 px-4 select-none pointer-events-none">
      <style>{`
        @keyframes eden-letter-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div className="flex gap-1 sm:gap-2">
        {LETTERS.map((letter, i) => (
          <span
            key={i}
            className="font-black tracking-tight leading-none"
            style={{
              fontSize: "clamp(72px, 18vw, 160px)",
              opacity: 0,
              animation: `eden-letter-in 0.55s cubic-bezier(0.16, 1, 0.3, 1) ${i * 150}ms both`,
              background: "linear-gradient(135deg, hsl(var(--foreground)) 0%, #10b981 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            {letter}
          </span>
        ))}
      </div>
    </div>
  );
}
