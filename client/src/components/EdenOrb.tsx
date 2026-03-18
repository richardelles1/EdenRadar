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
