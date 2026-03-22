import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, Printer, FileText, Building2, Key, ExternalLink,
  BookOpen, User, Calendar, BarChart2,
} from "lucide-react";
import type { ReportPayload, ScoredAsset, BuyerProfile } from "@/lib/types";
import {
  GREEN, BG_DARK,
  PrintRadar, PrintLogo, PrintFooter, SectionHeader, DarkPill, CoverBottomStrip,
  PRINT_STYLES, formatDate, formatDateTime, parseMarkdown, val, scoreColor,
} from "@/lib/print-shared";

function RankedAssetRow({ asset, rank }: { asset: ScoredAsset; rank: number }) {
  const licensingAvailable = (asset.licensing_status ?? "").toLowerCase().includes("available");
  const { bg, border, text } = scoreColor(asset.score);
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
            <div style={{ fontSize: 14, fontWeight: 700, color: "#111", marginBottom: 3 }}>
              {val(asset.asset_name) ?? "Unnamed Asset"}
            </div>
            {val(asset.indication) && (
              <div style={{ fontSize: 12, color: "#6b7280" }}>{asset.indication}</div>
            )}
          </div>
          <div style={{
            padding: "4px 10px", borderRadius: 6,
            background: bg, border: `1px solid ${border}`,
            color: text, fontSize: 14, fontWeight: 800, flexShrink: 0,
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

        {/* Signal coverage */}
        {(asset.score_breakdown?.signal_coverage ?? 0) > 0 && (
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, height: 3, borderRadius: 2, background: "#e5e7eb", overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: 2,
                width: `${Math.round(asset.score_breakdown.signal_coverage ?? 0)}%`,
                background: (asset.score_breakdown.signal_coverage ?? 0) >= 75 ? "#22c55e"
                  : (asset.score_breakdown.signal_coverage ?? 0) >= 50 ? "#f59e0b"
                  : "#ef4444",
              }} />
            </div>
            <span style={{ fontSize: 10, color: "#9ca3af", whiteSpace: "nowrap" }}>
              {Math.round(asset.score_breakdown.signal_coverage ?? 0)}% signal coverage
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ReportPrint() {
  const [, setLocation] = useLocation();
  const [report, setReport] = useState<ReportPayload | null>(null);
  const [buyerProfile, setBuyerProfile] = useState<BuyerProfile | null>(null);

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

    const bp = (() => {
      try {
        const stored = sessionStorage.getItem("buyer-profile");
        return stored ? JSON.parse(stored) as BuyerProfile : null;
      } catch { return null; }
    })();
    setBuyerProfile(bp);
  }, []);

  const dateStr = formatDate(new Date().toISOString());

  const thesisPills: string[] = [];
  if (buyerProfile) {
    (buyerProfile.therapeutic_areas ?? []).forEach((t) => thesisPills.push(t));
    (buyerProfile.modalities ?? []).forEach((m) => thesisPills.push(m));
    (buyerProfile.preferred_stages ?? []).forEach((s) => thesisPills.push(s));
  }

  const maxScoredDims = report?.top_assets?.reduce((max, a) => {
    const n = a.score_breakdown?.scored_dimensions?.length ?? 0;
    return n > max ? n : max;
  }, 0) ?? 0;

  const footerRight = `Scored on ${maxScoredDims} of 6 signal dimensions`;

  if (!report) {
    return (
      <div style={{ fontFamily: "'Open Sans', sans-serif", minHeight: "100vh", background: "#f8f9fa", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <style>{PRINT_STYLES}</style>
        <div style={{ textAlign: "center" }}>
          <FileText style={{ width: 40, height: 40, color: "#d1d5db", margin: "0 auto 12px" }} />
          <p style={{ fontSize: 16, fontWeight: 600, color: "#374151", marginBottom: 8 }}>No Report Available</p>
          <p style={{ fontSize: 14, color: "#9ca3af", marginBottom: 20 }}>Return to Scout and generate a report first.</p>
          <button
            onClick={() => setLocation("/scout")}
            style={{ padding: "8px 20px", borderRadius: 8, cursor: "pointer", background: GREEN, border: "none", color: "#fff", fontWeight: 600, fontSize: 14 }}
          >
            Go to Scout
          </button>
        </div>
      </div>
    );
  }

  const licensableCount = report.top_assets.filter((a) =>
    (a.licensing_status ?? "").toLowerCase().includes("available")
  ).length;

  return (
    <div style={{ fontFamily: "'Open Sans', sans-serif", background: "#f8f9fa" }}>
      <style>{PRINT_STYLES}</style>

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

        <PrintLogo subtitle={`Buyer Intelligence Platform · ${dateStr}`} />

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
            marginBottom: 16, width: "fit-content",
          }}>
            Intelligence Report
          </div>

          {/* Report title */}
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.40)", margin: "0 0 8px", fontWeight: 500 }}>
            {report.title}
          </p>

          {/* Primary: search query as cover hero */}
          <h1 style={{
            fontSize: "clamp(22px, 4vw, 38px)", fontWeight: 800,
            color: "#ffffff", lineHeight: 1.2, margin: 0, marginBottom: 24,
            letterSpacing: "-0.02em", maxWidth: 680,
          }}>
            "{report.query}"
          </h1>

          {/* Buyer thesis pills (from profile or derived from query) */}
          {thesisPills.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 28 }}>
              {thesisPills.slice(0, 8).map((pill, i) => (
                <DarkPill key={i} label={pill} />
              ))}
            </div>
          ) : report.buyer_profile_summary ? (
            <div style={{
              marginBottom: 28, padding: "12px 16px", borderRadius: 8,
              background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)",
              maxWidth: 640,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <User style={{ width: 12, height: 12, color: "rgba(255,255,255,0.35)" }} />
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>Buyer Thesis</span>
              </div>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.60)", lineHeight: 1.6, margin: 0 }}>
                {report.buyer_profile_summary}
              </p>
            </div>
          ) : null}

          {/* Stats row */}
          <div style={{ display: "flex", gap: 32 }}>
            <div>
              <div style={{ fontSize: 28, fontWeight: 800, color: "#ffffff" }}>{report.top_assets.length}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.40)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Assets Ranked</div>
            </div>
            {report.top_assets[0] && (
              <div>
                <div style={{ fontSize: 28, fontWeight: 800, color: GREEN }}>
                  {Math.round(report.top_assets[0].score)}
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.40)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Top Score</div>
              </div>
            )}
            <div>
              <div style={{ fontSize: 28, fontWeight: 800, color: "#ffffff" }}>{licensableCount}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.40)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Licensable</div>
            </div>
          </div>
        </div>

        <CoverBottomStrip>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Calendar style={{ width: 12, height: 12, color: "rgba(255,255,255,0.30)" }} />
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
              Generated {formatDateTime(report.generated_at)}
            </span>
          </div>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.20)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Confidential · For Research Purposes Only
          </span>
        </CoverBottomStrip>
      </div>

      {/* ── PAGE 2: BUYER THESIS + EXECUTIVE SUMMARY ── */}
      <div className="print-section" style={{ background: "#ffffff", padding: "48px 56px 40px" }}>
        {report.buyer_profile_summary && (
          <div style={{ marginBottom: 32 }}>
            <SectionHeader icon={User} title="Buyer Thesis" />
            <div style={{ padding: "16px 20px", borderRadius: 8, background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
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

        <PrintFooter date={dateStr} right={footerRight} />
      </div>

      {/* ── PAGE 3: RANKED ASSETS ── */}
      {report.top_assets.length > 0 && (
        <div className="print-section" style={{ background: "#ffffff", padding: "48px 56px 40px" }}>
          <SectionHeader icon={BarChart2} title={`Top Ranked Opportunities (${report.top_assets.length})`} />
          {report.top_assets.map((asset, i) => (
            <RankedAssetRow key={asset.id} asset={asset} rank={i + 1} />
          ))}
          <PrintFooter date={dateStr} right={footerRight} />
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
          <PrintFooter date={dateStr} right={footerRight} />
        </div>
      )}
    </div>
  );
}
