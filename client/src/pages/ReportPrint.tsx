import { useState, useEffect } from "react";
import type { ElementType } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, Printer, FileText, Building2, Key, ExternalLink,
  BookOpen, User, Calendar, BarChart2,
} from "lucide-react";
import type { ReportPayload, ScoredAsset } from "@/lib/types";

const GREEN = "#3fb950";
const BG_DARK = "#0a0f0d";

function val(v: string | null | undefined): string | null {
  if (!v || v === "unknown" || v.trim() === "") return null;
  return v;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric", month: "long", day: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function parseMarkdown(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} style={{ fontWeight: 700, color: "#111" }}>{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

function PrintRadar() {
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0 }} aria-hidden>
      <div style={{
        position: "absolute", left: "50%", top: "50%",
        transform: "translate(-50%, -50%)",
        width: "min(70vw, 600px)", height: "min(70vw, 600px)",
        animation: "radar-bg-slow 22s linear infinite",
        transformOrigin: "center center",
        background: `conic-gradient(from 0deg, transparent 260deg, ${GREEN}09 310deg, ${GREEN}1e 360deg)`,
        borderRadius: "50%",
      }} />
      {[180, 310, 430, 540].map((r, i) => (
        <div key={r} style={{
          position: "absolute", left: "50%", top: "50%",
          transform: "translate(-50%, -50%)",
          width: r, height: r, borderRadius: "50%",
          border: `1px solid ${GREEN}${Math.round((0.10 - i * 0.018) * 255).toString(16).padStart(2, "0")}`,
        }} />
      ))}
    </div>
  );
}

function PrintFooter({ date }: { date: string }) {
  return (
    <div style={{
      marginTop: 48, paddingTop: 16,
      borderTop: "1px solid #e5e7eb",
      display: "flex", justifyContent: "space-between", alignItems: "center",
    }}>
      <span style={{ fontSize: 10, color: "#9ca3af", letterSpacing: "0.05em" }}>
        <span style={{ fontWeight: 700, color: "#374151" }}>Eden</span>
        <span style={{ fontWeight: 700, color: "#2d6a45" }}>Radar</span>
        {" "}· Buyer Intelligence Report · {date}
      </span>
      <span style={{ fontSize: 10, color: "#9ca3af" }}>For research purposes only.</span>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, color = "#2d6a45" }: {
  icon: ElementType; title: string; color?: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
      <div style={{ width: 3, height: 20, borderRadius: 2, background: color, flexShrink: 0 }} />
      <Icon style={{ width: 16, height: 16, color, flexShrink: 0 }} />
      <h2 style={{ fontSize: 15, fontWeight: 700, color: "#111", margin: 0 }}>{title}</h2>
    </div>
  );
}

function RankedAssetRow({ asset, rank }: { asset: ScoredAsset; rank: number }) {
  const licensingAvailable = (asset.licensing_status ?? "").toLowerCase().includes("available");
  return (
    <div style={{
      display: "flex", gap: 16, padding: "16px 18px",
      borderRadius: 8, border: "1px solid #e5e7eb",
      background: "#f9fafb", marginBottom: 12,
    }}>
      <div style={{
        fontSize: 20, fontWeight: 800, color: "#d1d5db",
        width: 28, textAlign: "right", flexShrink: 0, marginTop: 2,
      }}>
        #{rank}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 6 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#111", marginBottom: 3 }}>{asset.asset_name}</div>
            {val(asset.indication) && (
              <div style={{ fontSize: 12, color: "#6b7280" }}>{asset.indication}</div>
            )}
          </div>
          <div style={{
            padding: "4px 10px", borderRadius: 6,
            background: asset.score >= 75 ? "#dcfce7" : asset.score >= 55 ? "#fef9c3" : "#fee2e2",
            border: `1px solid ${asset.score >= 75 ? "#86efac" : asset.score >= 55 ? "#fde68a" : "#fca5a5"}`,
            color: asset.score >= 75 ? "#15803d" : asset.score >= 55 ? "#b45309" : "#dc2626",
            fontSize: 14, fontWeight: 800, flexShrink: 0,
          }}>
            {Math.round(asset.score)}
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {val(asset.modality) && (
            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: "#e5e7eb", color: "#374151", textTransform: "capitalize" }}>
              {asset.modality}
            </span>
          )}
          {val(asset.development_stage) && (
            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: "#e5e7eb", color: "#374151", textTransform: "capitalize" }}>
              {asset.development_stage}
            </span>
          )}
          {licensingAvailable && (
            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: "#dcfce7", color: "#15803d", display: "flex", alignItems: "center", gap: 3, fontWeight: 600 }}>
              <Key style={{ width: 9, height: 9 }} />
              Available
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {val(asset.owner_name) && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#6b7280" }}>
              <Building2 style={{ width: 11, height: 11 }} />
              {asset.owner_name}
            </div>
          )}
          {(asset.source_urls?.[0]) && (
            <a href={asset.source_urls[0]} style={{ fontSize: 11, color: "#2d6a45", display: "flex", alignItems: "center", gap: 3 }}>
              <ExternalLink style={{ width: 11, height: 11 }} />
              Source
            </a>
          )}
        </div>

        {val(asset.why_it_matters) && (
          <p style={{ fontSize: 12, color: "#6b7280", fontStyle: "italic", marginTop: 8, marginBottom: 0, lineHeight: 1.5 }}>
            "{asset.why_it_matters}"
          </p>
        )}
      </div>
    </div>
  );
}

export default function ReportPrint() {
  const [, setLocation] = useLocation();
  const [report, setReport] = useState<ReportPayload | null>(null);

  useEffect(() => {
    const fromSession = (() => {
      try {
        const stored = sessionStorage.getItem("current-report");
        return stored ? JSON.parse(stored) as ReportPayload : null;
      } catch { return null; }
    })();
    const fromHistory = typeof window !== "undefined" && window.history.state?.report
      ? window.history.state.report as ReportPayload
      : null;
    setReport(fromHistory ?? fromSession);
  }, []);

  const dateStr = formatDate(new Date().toISOString());

  if (!report) {
    return (
      <div style={{ fontFamily: "'Open Sans', sans-serif", minHeight: "100vh", background: "#f8f9fa", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <FileText style={{ width: 40, height: 40, color: "#d1d5db", margin: "0 auto 12px" }} />
          <p style={{ fontSize: 16, fontWeight: 600, color: "#374151", marginBottom: 8 }}>No Report Available</p>
          <p style={{ fontSize: 14, color: "#9ca3af", marginBottom: 20 }}>Return to Scout and generate a report first.</p>
          <button
            onClick={() => setLocation("/scout")}
            style={{
              padding: "8px 20px", borderRadius: 8, cursor: "pointer",
              background: GREEN, border: "none", color: "#fff", fontWeight: 600, fontSize: 14,
            }}
          >
            Go to Scout
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "'Open Sans', sans-serif", background: "#f8f9fa" }}>
      <style>{`
        @media print {
          .print-cover { page-break-after: always; break-after: page; }
          .print-section { page-break-before: always; break-before: page; page-break-inside: avoid; break-inside: avoid; }
          .no-print { display: none !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          @page { margin: 12mm 14mm; size: A4; }
          body { background: #ffffff !important; }
        }
        @keyframes radar-bg-slow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      {/* ── COVER PAGE ── */}
      <div className="print-cover" style={{
        position: "relative", background: BG_DARK, minHeight: "100vh",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        <PrintRadar />

        {/* Screen-only controls */}
        <div className="no-print" style={{
          position: "absolute", top: 20, right: 24,
          display: "flex", gap: 12, zIndex: 20,
        }}>
          <button
            onClick={() => setLocation("/report")}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "7px 14px", borderRadius: 8, cursor: "pointer",
              background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
              color: "rgba(255,255,255,0.70)", fontSize: 13, fontWeight: 500,
            }}
          >
            <ArrowLeft style={{ width: 14, height: 14 }} />
            Back
          </button>
          <button
            onClick={() => window.print()}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "7px 16px", borderRadius: 8, cursor: "pointer",
              background: GREEN, border: "none",
              color: "#fff", fontSize: 13, fontWeight: 600,
            }}
          >
            <Printer style={{ width: 14, height: 14 }} />
            Print / Download PDF
          </button>
        </div>

        {/* Top-left logo */}
        <div style={{ position: "relative", zIndex: 10, padding: "28px 40px 0" }}>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em" }}>
            <span style={{ color: "#ffffff" }}>Eden</span>
            <span style={{ color: GREEN }}>Radar</span>
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 3, letterSpacing: "0.04em", textTransform: "uppercase" }}>
            Buyer Intelligence Platform · {dateStr}
          </div>
        </div>

        {/* Center content */}
        <div style={{
          position: "relative", zIndex: 10, flex: 1,
          display: "flex", flexDirection: "column", justifyContent: "center",
          padding: "40px 80px",
        }}>
          {/* Label */}
          <div style={{
            display: "inline-flex", alignItems: "center",
            padding: "4px 12px", borderRadius: 20,
            background: `${GREEN}22`, border: `1px solid ${GREEN}44`,
            color: GREEN, fontSize: 11, fontWeight: 700,
            letterSpacing: "0.08em", textTransform: "uppercase",
            marginBottom: 20, width: "fit-content",
          }}>
            Intelligence Report
          </div>

          {/* Title */}
          <h1 style={{
            fontSize: "clamp(24px, 4vw, 40px)", fontWeight: 800,
            color: "#ffffff", lineHeight: 1.2, margin: 0, marginBottom: 16,
            letterSpacing: "-0.02em", maxWidth: 700,
          }}>
            {report.title}
          </h1>

          {/* Query pill */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "6px 14px", borderRadius: 8, marginBottom: 28,
            background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)",
            width: "fit-content",
          }}>
            <BookOpen style={{ width: 13, height: 13, color: "rgba(255,255,255,0.40)" }} />
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.60)", fontStyle: "italic" }}>
              "{report.query}"
            </span>
          </div>

          {/* Stats row */}
          <div style={{ display: "flex", gap: 32 }}>
            <div>
              <div style={{ fontSize: 28, fontWeight: 800, color: "#ffffff" }}>{report.top_assets.length}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.40)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Assets Ranked</div>
            </div>
            <div>
              <div style={{ fontSize: 28, fontWeight: 800, color: GREEN }}>
                {report.top_assets[0] ? Math.round(report.top_assets[0].score) : "—"}
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.40)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Top Score</div>
            </div>
            <div>
              <div style={{ fontSize: 28, fontWeight: 800, color: "#ffffff" }}>
                {report.top_assets.filter((a) => (a.licensing_status ?? "").toLowerCase().includes("available")).length}
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.40)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Licensable</div>
            </div>
          </div>
        </div>

        {/* Bottom strip */}
        <div style={{
          position: "relative", zIndex: 10,
          padding: "20px 40px",
          borderTop: "1px solid rgba(255,255,255,0.07)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Calendar style={{ width: 12, height: 12, color: "rgba(255,255,255,0.30)" }} />
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
              Generated {formatDateTime(report.generated_at)}
            </span>
          </div>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.20)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            For Research Purposes Only
          </span>
        </div>
      </div>

      {/* ── PAGE 2: BUYER THESIS + EXECUTIVE SUMMARY ── */}
      <div className="print-section" style={{ background: "#ffffff", padding: "48px 56px 40px" }}>
        {report.buyer_profile_summary && (
          <div style={{ marginBottom: 32 }}>
            <SectionHeader icon={User} title="Buyer Thesis" />
            <div style={{
              padding: "16px 20px", borderRadius: 8,
              background: "#f0fdf4", border: "1px solid #bbf7d0",
            }}>
              <p style={{ fontSize: 13.5, color: "#374151", lineHeight: 1.7, margin: 0 }}>
                {report.buyer_profile_summary}
              </p>
            </div>
          </div>
        )}

        <div style={{ marginBottom: 32 }}>
          <SectionHeader icon={FileText} title="Executive Summary" />
          <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.8, margin: 0 }}>
            {report.executive_summary}
          </p>
        </div>

        <PrintFooter date={dateStr} />
      </div>

      {/* ── PAGE 3: RANKED ASSETS ── */}
      {report.top_assets.length > 0 && (
        <div className="print-section" style={{ background: "#ffffff", padding: "48px 56px 40px" }}>
          <SectionHeader icon={BarChart2} title={`Top Ranked Opportunities (${report.top_assets.length})`} />

          {report.top_assets.map((asset, i) => (
            <RankedAssetRow key={asset.id} asset={asset} rank={i + 1} />
          ))}

          <PrintFooter date={dateStr} />
        </div>
      )}

      {/* ── PAGE 4: NARRATIVE ANALYSIS ── */}
      {report.narrative && (
        <div className="print-section" style={{ background: "#ffffff", padding: "48px 56px 40px" }}>
          <SectionHeader icon={BookOpen} title="Intelligence Analysis" />

          <div style={{ fontSize: 13.5, color: "#374151", lineHeight: 1.8 }}>
            {report.narrative.split(/\n{2,}/).filter(Boolean).map((p, i) => (
              <p key={i} style={{ marginBottom: 16 }}>{parseMarkdown(p)}</p>
            ))}
          </div>

          <PrintFooter date={dateStr} />
        </div>
      )}
    </div>
  );
}
