import { useState } from "react";
import DOMPurify from "dompurify";
import { useRoute, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Nav } from "@/components/Nav";
import { useDocumentMeta } from "@/hooks/use-document-meta";
import type { BriefContent, BriefTagType } from "@shared/schema";

// ── Types ─────────────────────────────────────────────────────────────────────

type BriefIssue = {
  id: number;
  slug: string;
  issueNumber: number;
  title: string;
  publishedAt: string | null;
  content: BriefContent;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const EMERALD = "#2d7a52";
const EMERALD_LIGHT = "#e8f5ee";
const EMERALD_BORDER = "#b8dfc8";
const PAPER = "#faf9f6";
const PAPER_WARM = "#f3f0e9";
const INK = "#1a1e23";
const INK_MID = "#4a5260";
const INK_FAINT = "#8a9199";
const RULE = "#dddad4";

const TAG_STYLES: Record<BriefTagType, { color: string; background: string }> = {
  default:  { color: INK_FAINT,  background: "rgba(0,0,0,0.05)" },
  oncology: { color: "#b05010",  background: "rgba(176,80,16,0.08)" },
  cns:      { color: "#5050b0",  background: "rgba(80,80,176,0.08)" },
  rare:     { color: "#8a6b10",  background: "rgba(138,107,16,0.08)" },
  gene:     { color: EMERALD,    background: EMERALD_LIGHT },
};

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <span
        className="text-xs font-semibold tracking-widest uppercase flex-shrink-0"
        style={{ fontFamily: "'JetBrains Mono', monospace", color: EMERALD }}
      >
        {children}
      </span>
      <div className="flex-1 h-px" style={{ background: RULE }} />
    </div>
  );
}

function AssetTag({ label, type }: { label: string; type: BriefTagType }) {
  const s = TAG_STYLES[type] ?? TAG_STYLES.default;
  return (
    <span
      className="text-xs px-1.5 py-0.5 rounded-sm"
      style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: "10px",
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: s.color,
        background: s.background,
      }}
    >
      {label}
    </span>
  );
}

function MolecularLattice() {
  const hexes: React.ReactNode[] = [];
  const rows = 4;
  const cols = 18;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const offset = r % 2 === 1 ? 20 : 0;
      const cx = offset + c * 40 + 20;
      const cy = r * 36 + 20;
      const pts = [0, 60, 120, 180, 240, 300].map((deg) => {
        const rad = (deg * Math.PI) / 180;
        return `${cx + 14 * Math.cos(rad)},${cy + 14 * Math.sin(rad)}`;
      }).join(" ");
      hexes.push(<polygon key={`${r}-${c}`} points={pts} />);
      if (r < rows - 1 && c < cols - 1) {
        hexes.push(<circle key={`d-${r}-${c}`} cx={cx + 20} cy={cy + 18} r="2.5" fill="white" />);
      }
    }
  }
  return (
    <svg
      className="absolute inset-0 w-full h-full"
      viewBox="0 0 740 160"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <g fill="none" stroke="white" strokeWidth="0.8" opacity="0.1">
        {hexes}
      </g>
    </svg>
  );
}

function SubscribeInline() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setState("loading");
    try {
      const res = await fetch("/api/brief/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error();
      setState("done");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <p
        className="text-xs tracking-widest uppercase"
        style={{ fontFamily: "'JetBrains Mono', monospace", color: EMERALD }}
      >
        Subscribed. Next issue comes directly to you.
      </p>
    );
  }

  return (
    <div>
      <div
        className="text-xs tracking-widest uppercase mb-2"
        style={{ fontFamily: "'JetBrains Mono', monospace", color: EMERALD, fontSize: "10px" }}
      >
        Subscribe
      </div>
      <form onSubmit={handleSubmit} className="flex gap-0 w-full sm:w-auto">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          required
          className="flex-1 sm:w-48 border border-r-0 px-3 py-2 text-sm outline-none min-w-0"
          style={{
            fontFamily: "inherit",
            borderColor: RULE,
            background: PAPER,
            color: INK,
          }}
        />
        <button
          type="submit"
          disabled={state === "loading"}
          className="px-4 py-2 text-xs tracking-widest uppercase transition-colors disabled:opacity-60 flex-shrink-0 font-semibold"
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            background: EMERALD,
            color: "#fff",
            border: `1px solid ${EMERALD}`,
          }}
        >
          {state === "loading" ? "..." : "Subscribe"}
        </button>
      </form>
      {state === "error" && (
        <p className="text-xs mt-1" style={{ color: "#b05010" }}>Something went wrong. Please try again.</p>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BriefIssue() {
  const [copied, setCopied] = useState(false);
  const [, params] = useRoute("/brief/:slug");
  const slug = params?.slug ?? "";

  const { data: issue, isLoading, isError } = useQuery<BriefIssue>({
    queryKey: ["brief-issue", slug],
    queryFn: () => fetch(`/api/brief/${slug}`).then((r) => {
      if (!r.ok) throw new Error("Not found");
      return r.json();
    }),
    enabled: Boolean(slug),
  });

  useDocumentMeta({
    title: issue
      ? `The Eden Brief - Issue ${issue.issueNumber}: ${issue.title}`
      : "The Eden Brief",
    description: "Monthly intelligence on the biotech asset licensing market from Eden NX.",
  });

  const briefUrl = typeof window !== "undefined" ? window.location.href : "";

  function handleShare() {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(briefUrl).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
    }
  }

  function handlePrint() {
    window.print();
  }

  if (isLoading) {
    return (
      <div className="min-h-screen" style={{ background: "#e8e6e1" }}>
        <Nav />
        <div className="flex items-center justify-center py-32">
          <div className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (isError || !issue) {
    return (
      <div className="min-h-screen" style={{ background: "#e8e6e1" }}>
        <Nav />
        <div className="max-w-3xl mx-auto px-6 py-32 text-center">
          <p className="text-stone-500">This issue could not be found.</p>
          <Link href="/brief">
            <a className="text-sm mt-4 inline-block" style={{ color: EMERALD }}>
              Back to archive
            </a>
          </Link>
        </div>
      </div>
    );
  }

  const c = issue.content;

  return (
    <div className="min-h-screen print:bg-white" style={{ background: "#e8e6e1" }}>
      <div className="print:hidden">
        <Nav />
      </div>

      {/* Utility bar */}
      <div
        className="max-w-3xl mx-auto px-6 pt-6 pb-3 print:hidden"
        style={{ maxWidth: "760px" }}
      >
        <div className="flex items-center justify-between gap-2">
          <Link href="/brief">
            <a
              className="hidden sm:block text-xs tracking-widest uppercase"
              style={{ fontFamily: "'JetBrains Mono', monospace", color: "#7a7570", textDecoration: "none" }}
            >
              edenradar.com/brief
            </a>
          </Link>
          <div className="flex gap-2 sm:ml-auto">
            <button
              onClick={handlePrint}
              title="Opens your browser's print dialog — choose 'Save as PDF' to download"
              className="text-xs tracking-widest uppercase px-3 py-1.5 border transition-colors hover:text-emerald-700 hover:border-emerald-600"
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                color: "#5a5550",
                borderColor: "rgba(0,0,0,0.15)",
                background: "rgba(255,255,255,0.7)",
              }}
            >
              <span className="sm:hidden">PDF</span>
              <span className="hidden sm:inline">Print / Save PDF</span>
            </button>
            <button
              onClick={handleShare}
              className="text-xs tracking-widest uppercase px-3 py-1.5 border transition-colors hover:text-emerald-700 hover:border-emerald-600"
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                color: copied ? EMERALD : "#5a5550",
                borderColor: copied ? EMERALD_BORDER : "rgba(0,0,0,0.15)",
                background: copied ? EMERALD_LIGHT : "rgba(255,255,255,0.7)",
                transition: "color 0.15s, border-color 0.15s, background 0.15s",
              }}
            >
              {copied ? "Copied!" : "Share"}
            </button>
          </div>
        </div>
      </div>

      {/* Document */}
      <div
        className="max-w-3xl mx-auto print:max-w-full print:shadow-none"
        style={{
          background: PAPER,
          boxShadow: "0 4px 40px rgba(0,0,0,0.18), 0 1px 4px rgba(0,0,0,0.08)",
          marginBottom: "64px",
          maxWidth: "760px",
        }}
      >

        {/* Hero band */}
        <div className="relative overflow-hidden" style={{ background: EMERALD }}>
          <MolecularLattice />
          <div className="relative px-5 sm:px-12 py-8 sm:py-10">
            <div
              className="flex items-center gap-3 mb-3"
              style={{ color: "rgba(255,255,255,0.55)" }}
            >
              <span
                className="text-xs tracking-widest uppercase"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                Eden NX &middot; Intelligence Brief
              </span>
              <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.15)" }} />
            </div>
            <h1
              className="text-3xl sm:text-5xl text-white mb-2"
              style={{ fontFamily: "'DM Serif Display', Georgia, serif", lineHeight: 1.05 }}
            >
              The Eden <em>Brief</em>
            </h1>
            <p className="text-sm mb-7" style={{ color: "rgba(255,255,255,0.65)" }}>
              Signal from the licensing frontier
            </p>
            <div className="flex flex-wrap gap-x-8 gap-y-3">
              {[
                ["Issue",    `No. ${issue.issueNumber}`],
                ["Published", issue.publishedAt
                  ? new Date(issue.publishedAt).toLocaleDateString("en-US", { month: "long", year: "numeric" })
                  : ""],
                ["Coverage", "400+ TTO portfolios"],
              ].map(([label, value]) => (
                <div key={label} className="flex flex-col gap-0.5">
                  <span
                    className="text-xs tracking-widest uppercase"
                    style={{ fontFamily: "'JetBrains Mono', monospace", color: "rgba(255,255,255,0.45)", fontSize: "10px" }}
                  >
                    {label}
                  </span>
                  <span
                    className="text-xs"
                    style={{ fontFamily: "'JetBrains Mono', monospace", color: "rgba(255,255,255,0.85)", fontSize: "11px" }}
                  >
                    {value}
                  </span>
                </div>
              ))}
              <div className="flex flex-col gap-0.5">
                <span
                  className="text-xs tracking-widest uppercase"
                  style={{ fontFamily: "'JetBrains Mono', monospace", color: "rgba(255,255,255,0.45)", fontSize: "10px" }}
                >
                  Permalink
                </span>
                <a
                  href={`/brief/${issue.slug}`}
                  className="text-xs hover:underline"
                  style={{ fontFamily: "'JetBrains Mono', monospace", color: "rgba(255,255,255,0.85)", fontSize: "11px", textDecoration: "none" }}
                >
                  edenradar.com/brief/{issue.slug}
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 sm:px-12 py-8 sm:py-11">

          {/* 01 - THE NUMBER */}
          <section className="mb-11">
            <SectionLabel>01 &middot; The Number</SectionLabel>
            <div
              className="flex gap-8 items-start p-7 relative"
              style={{
                background: EMERALD_LIGHT,
                border: `1px solid ${EMERALD_BORDER}`,
              }}
            >
              <div className="flex-shrink-0 text-center pt-1">
                <div
                  className="leading-none block"
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: "60px",
                    fontWeight: 600,
                    color: EMERALD,
                    letterSpacing: "-0.03em",
                  }}
                >
                  {c.the_number.figure}
                </div>
                <span
                  className="inline-block mt-1.5 px-2 py-0.5 text-xs rounded-sm"
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: "10px",
                    color: EMERALD,
                    background: "rgba(45,122,82,0.12)",
                  }}
                >
                  {c.the_number.delta}
                </span>
              </div>
              <div>
                <h2
                  className="text-xl mb-2.5 leading-snug"
                  style={{ fontFamily: "'DM Serif Display', Georgia, serif", color: INK }}
                >
                  {c.the_number.headline}
                </h2>
                <p className="text-sm leading-relaxed" style={{ color: INK_MID }}>
                  {c.the_number.body}
                </p>
              </div>
            </div>
          </section>

          {/* 02 - WHAT'S MOVING */}
          <section className="mb-11">
            <SectionLabel>02 &middot; What&apos;s Moving</SectionLabel>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {c.whats_moving.map((item, i) => {
                const isLast = i === c.whats_moving.length - 1;
                const hasChart = Boolean(item.chart?.length);
                return (
                  <div
                    key={i}
                    className={`p-4 ${isLast && hasChart ? "sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-5 items-center" : isLast ? "sm:col-span-2" : ""}`}
                    style={{ background: PAPER_WARM, border: `1px solid ${RULE}` }}
                  >
                    <div>
                      <div
                        className="text-xs mb-2.5"
                        style={{
                          fontFamily: "'JetBrains Mono', monospace",
                          letterSpacing: "0.16em",
                          textTransform: "uppercase",
                          color: EMERALD,
                          fontSize: "10px",
                        }}
                      >
                        Observation {String(i + 1).padStart(2, "0")}
                      </div>
                      <p
                        className="text-sm font-normal leading-relaxed"
                        style={{ color: INK_MID }}
                        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(item.text) }}
                      />
                    </div>
                    {hasChart && item.chart && (
                      <div>
                        <div
                          className="mb-2.5"
                          style={{
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: "10px",
                            letterSpacing: "0.1em",
                            textTransform: "uppercase",
                            color: INK_FAINT,
                          }}
                        >
                          New filings by area
                        </div>
                        {item.chart.map((bar) => (
                          <div key={bar.label} className="flex items-center gap-2 mb-1.5">
                            <span
                              className="text-right flex-shrink-0"
                              style={{
                                fontFamily: "'JetBrains Mono', monospace",
                                fontSize: "9px",
                                color: INK_MID,
                                width: "56px",
                              }}
                            >
                              {bar.label}
                            </span>
                            <div
                              className="flex-1 h-2 overflow-hidden"
                              style={{ background: "rgba(0,0,0,0.08)" }}
                            >
                              <div
                                className="h-full"
                                style={{
                                  width: `${Math.round((bar.value / bar.maxValue) * 100)}%`,
                                  background: bar.label === "Oncology" || bar.label === "CNS"
                                    ? EMERALD
                                    : EMERALD_BORDER,
                                }}
                              />
                            </div>
                            <span
                              style={{
                                fontFamily: "'JetBrains Mono', monospace",
                                fontSize: "9px",
                                color: INK_MID,
                                width: "28px",
                                flexShrink: 0,
                              }}
                            >
                              {bar.value}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* 03 - THERAPEUTIC SPOTLIGHT */}
          <section className="mb-11">
            <SectionLabel>03 &middot; Therapeutic Spotlight</SectionLabel>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8 items-start">
              <div className="sm:col-span-2">
                <p
                  className="text-xs mb-1.5"
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    letterSpacing: "0.15em",
                    textTransform: "uppercase",
                    color: INK_FAINT,
                    fontSize: "10px",
                  }}
                >
                  This month&apos;s focus area
                </p>
                <h2
                  className="text-3xl mb-4"
                  style={{
                    fontFamily: "'DM Serif Display', Georgia, serif",
                    color: INK,
                    lineHeight: 1.15,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {c.therapeutic_spotlight.area}
                </h2>
                <div className="space-y-3">
                  {c.therapeutic_spotlight.body.map((para, i) => (
                    <p key={i} className="text-sm leading-relaxed" style={{ color: INK_MID }}>
                      {para}
                    </p>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-3">
                {c.therapeutic_spotlight.stats.map((stat) => (
                  <div
                    key={stat.label}
                    className="px-4 py-3.5"
                    style={{ border: `1px solid ${RULE}`, background: PAPER_WARM }}
                  >
                    <div
                      className="mb-1"
                      style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: "26px",
                        fontWeight: 600,
                        color: EMERALD,
                        letterSpacing: "-0.02em",
                        lineHeight: 1,
                      }}
                    >
                      {stat.figure}
                    </div>
                    <div
                      style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: "10px",
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        color: INK_FAINT,
                        lineHeight: 1.5,
                      }}
                    >
                      {stat.label}
                    </div>
                  </div>
                ))}
                {c.therapeutic_spotlight.ring && (
                  <div
                    className="flex items-center gap-3 px-4 py-3"
                    style={{ border: `1px solid ${RULE}`, background: PAPER_WARM }}
                  >
                    <svg width="44" height="44" viewBox="0 0 44 44" className="flex-shrink-0">
                      <circle cx="22" cy="22" r="18" fill="none" stroke={EMERALD_LIGHT} strokeWidth="5" />
                      <circle
                        cx="22" cy="22" r="18"
                        fill="none" stroke={EMERALD} strokeWidth="5"
                        strokeDasharray="113"
                        strokeDashoffset={113 - Math.round((c.therapeutic_spotlight.ring.pct / 100) * 113)}
                        strokeLinecap="round"
                        transform="rotate(-90 22 22)"
                      />
                      <text
                        x="22" y="27"
                        textAnchor="middle"
                        style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "10px", fontWeight: 600, fill: EMERALD }}
                      >
                        {c.therapeutic_spotlight.ring.pct}%
                      </text>
                    </svg>
                    <div className="text-xs leading-relaxed" style={{ color: INK_MID }}>
                      <strong className="block mb-0.5" style={{ color: INK }}>
                        {c.therapeutic_spotlight.ring.label}
                      </strong>
                      {c.therapeutic_spotlight.ring.detail}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          <hr style={{ border: "none", borderTop: `1px solid ${RULE}`, margin: "0 0 44px" }} />

          {/* 04 - THE BRIEF TAKE */}
          <section className="mb-11">
            <SectionLabel>04 &middot; The Brief Take</SectionLabel>
            <div
              className="-mx-5 sm:-mx-12 px-5 sm:px-10 py-8 relative"
              style={{ background: EMERALD }}
            >
              <span
                className="absolute top-3 left-6 leading-none select-none"
                aria-hidden="true"
                style={{
                  fontFamily: "'DM Serif Display', Georgia, serif",
                  fontSize: "100px",
                  lineHeight: 0.65,
                  color: "rgba(255,255,255,0.1)",
                }}
              >
                &ldquo;
              </span>
              <blockquote
                className="text-lg italic text-white leading-relaxed mb-4 relative"
                style={{ fontFamily: "'DM Serif Display', Georgia, serif" }}
              >
                {c.brief_take.quote}
              </blockquote>
              <cite
                className="not-italic"
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: "9px",
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.5)",
                }}
              >
                {c.brief_take.attribution}
              </cite>
            </div>
          </section>

          {/* 05 - FROM THE PIPELINE */}
          <section className="mb-4">
            <SectionLabel>05 &middot; From the Pipeline</SectionLabel>
            <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${EMERALD}` }}>
                  {["Asset", "Stage", "Tier", "Status"].map((h, i) => (
                    <th
                      key={h}
                      className="pb-2.5"
                      style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: "10px",
                        letterSpacing: "0.16em",
                        textTransform: "uppercase",
                        color: EMERALD,
                        textAlign: i === 3 ? "right" : "left",
                        paddingRight: i < 3 ? "12px" : "0",
                        fontWeight: 600,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {c.pipeline.map((asset, i) => (
                  <tr
                    key={i}
                    style={{ borderBottom: `1px solid ${RULE}` }}
                    className="group"
                  >
                    <td className="py-3 pr-3 align-top" style={{ width: "55%" }}>
                      <div className="font-medium text-sm mb-1.5" style={{ color: INK }}>
                        {asset.mechanism}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {asset.tags.map((tag) => (
                          <AssetTag key={tag.label} label={tag.label} type={tag.type} />
                        ))}
                      </div>
                    </td>
                    <td
                      className="py-3 pr-3 align-top text-xs"
                      style={{ fontFamily: "'JetBrains Mono', monospace", color: INK_MID, fontSize: "11px" }}
                    >
                      {asset.stage}
                    </td>
                    <td
                      className="py-3 pr-3 align-top text-xs"
                      style={{ fontFamily: "'JetBrains Mono', monospace", color: INK_MID, fontSize: "11px" }}
                    >
                      {asset.tier}
                    </td>
                    <td className="py-3 align-top text-right">
                      <span
                        className="inline-block px-2 py-0.5 text-xs rounded-sm"
                        style={{
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: "10px",
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                          ...(asset.status === "available"
                            ? { color: EMERALD, background: EMERALD_LIGHT, border: `1px solid ${EMERALD_BORDER}` }
                            : { color: "#8a6b10", background: "rgba(138,107,16,0.08)", border: "1px solid rgba(138,107,16,0.2)" }),
                        }}
                      >
                        {asset.status === "available" ? "Available" : "In Discussion"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            <div
              className="mt-6 px-6 py-5"
              style={{
                background: EMERALD_LIGHT,
                border: `1px solid ${EMERALD_BORDER}`,
              }}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div
                    className="text-sm font-medium mb-1"
                    style={{ color: INK }}
                  >
                    Full dossiers and match reports on every asset above.
                  </div>
                  <div
                    className="text-xs"
                    style={{ color: INK_MID }}
                  >
                    Scout searches 400+ TTO portfolios in real time. Results ranked by your therapeutic focus.
                  </div>
                </div>
                <a
                  href="/scout"
                  className="sm:flex-shrink-0 px-5 py-2.5 text-xs tracking-widest uppercase font-semibold transition-colors hover:opacity-90 text-center"
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    background: EMERALD,
                    color: "#fff",
                    textDecoration: "none",
                  }}
                >
                  Access EdenRadar &rarr;
                </a>
              </div>
            </div>
          </section>

        </div>{/* /body */}

        {/* Footer band */}
        <div
          className="px-5 sm:px-12 py-8 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6"
          style={{ background: PAPER_WARM, borderTop: `1px solid ${RULE}` }}
        >
          <div>
            <h3
              className="text-xl mb-1"
              style={{ fontFamily: "'DM Serif Display', Georgia, serif", color: INK }}
            >
              Eden <em style={{ color: EMERALD }}>Brief</em>
            </h3>
            <div className="text-xs leading-relaxed" style={{ color: INK_FAINT, lineHeight: 1.8 }}>
              Published monthly by Eden NX &middot;{" "}
              <a href="https://edenradar.com" style={{ color: INK_MID, textDecoration: "none" }}>
                edenradar.com
              </a>
              <br />
              2026 Eden NX. All rights reserved.
            </div>
          </div>
          <SubscribeInline />
        </div>

      </div>{/* /document */}

      {/* Print styles */}
      <style>{`
        @media print {
          nav, .print\\:hidden { display: none !important; }
          body { background: white !important; }
          .print\\:max-w-full { max-width: 100% !important; }
          .print\\:shadow-none { box-shadow: none !important; }
        }
      `}</style>
    </div>
  );
}
