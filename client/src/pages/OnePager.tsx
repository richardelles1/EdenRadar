import { useEffect, useState } from "react";
import { Printer, Search, BarChart3, GitBranch, Shield, Bell, FileText, CheckCircle2, Globe, ShoppingBag, Lock, Handshake } from "lucide-react";
import QRCode from "qrcode";

const NAVY = "#0f1e35";
const EMERALD = "#1e7a4a";
const EMERALD_LIGHT = "#22c55e";
const SLATE = "#334155";
const SLATE_LIGHT = "#64748b";
const WHITE = "#ffffff";
const CREAM = "#f8fafc";
const BORDER = "#e2e8f0";

const VALUE_PROPS = [
  {
    icon: Search,
    label: "Discovery",
    headline: "Find Assets Before the Market Does",
    body: "Surface pre-clinical and discovery-stage assets from 300+ university TTOs the moment they go live — EDEN-enriched with target, modality, indication, and development stage.",
  },
  {
    icon: BarChart3,
    label: "Intelligence",
    headline: "Scored, Structured BD Intelligence",
    body: "Every asset is automatically scored for commercial potential, IP quality, and clinical viability. Stop reading through raw TTO pages — get pipeline-ready signals straight to your desk.",
  },
  {
    icon: GitBranch,
    label: "Pipeline",
    headline: "Build Your Watchlist & Track Deals",
    body: "Save assets to a private pipeline, set threshold alerts, generate portfolio dossiers, and export board-ready reports. Everything your BD team needs in one place.",
  },
];

const STATS = [
  { value: "300+", label: "Institutions" },
  { value: "33,000+", label: "Assets Indexed" },
  { value: "50+", label: "Live Sources" },
  { value: "Daily", label: "Data Refresh" },
];

const FEATURES = [
  { icon: Search, text: "Semantic full-text search across all TTO listings" },
  { icon: BarChart3, text: "EDEN AI enrichment: target, modality, stage, IPC codes" },
  { icon: Bell, text: "Threshold alerts for new assets matching your criteria" },
  { icon: FileText, text: "One-click portfolio dossiers & pipeline CSV exports" },
  { icon: Shield, text: "Institution profiles with deal history and researcher contacts" },
  { icon: Globe, text: "Coverage across top-50 US research universities + key global TTOs" },
  { icon: GitBranch, text: "Asset comparison and side-by-side scoring" },
  { icon: CheckCircle2, text: "Share-ready reports formatted for BD and board review" },
];

const PRICING = [
  {
    tier: "Scout",
    price: "$1,999",
    period: "/mo",
    desc: "Single user. Up to 500 saved assets. Monthly dossier exports.",
    highlight: false,
  },
  {
    tier: "Intelligence",
    price: "$8,999",
    period: "/mo",
    desc: "Up to 5 seats. Unlimited pipeline. Custom alerts. API access.",
    highlight: true,
  },
  {
    tier: "Enterprise",
    price: "$16,999",
    period: "/mo",
    desc: "Unlimited seats. White-glove onboarding. Dedicated account manager.",
    highlight: false,
  },
];

function useQrSvg(url: string) {
  const [svg, setSvg] = useState<string>("");
  useEffect(() => {
    QRCode.toString(url, { type: "svg", margin: 1, color: { dark: NAVY, light: WHITE } })
      .then(setSvg)
      .catch(() => setSvg(""));
  }, [url]);
  return svg;
}

export default function OnePager() {
  const qrSvg = useQrSvg("https://edenradar.com");

  function handlePrint() {
    window.print();
  }

  return (
    <>
      <style>{`
        .op-shell {
          min-height: 100vh;
          background: #dde3ea;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding-top: 32px;
          padding-bottom: 48px;
          font-family: 'Open Sans', sans-serif;
        }

        .op-document {
          width: 794px;
          max-width: 100%;
          background: #ffffff;
          box-shadow: 0 8px 40px rgba(0,0,0,0.18);
          border-radius: 4px;
          overflow: hidden;
        }

        .op-header {
          background: ${NAVY};
          padding: 28px 40px 24px;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 24px;
        }

        .op-hero {
          padding: 32px 40px 26px;
          background: linear-gradient(135deg, #0f1e35 0%, #112d1c 100%);
          border-bottom: 3px solid ${EMERALD};
        }

        .op-hero h1 {
          color: ${WHITE};
          font-size: 26px;
          font-weight: 800;
          line-height: 1.18;
          letter-spacing: -0.4px;
          margin-bottom: 10px;
          max-width: 560px;
        }

        .op-hero p {
          color: rgba(255,255,255,0.72);
          font-size: 13px;
          line-height: 1.65;
          max-width: 540px;
          margin: 0;
        }

        .op-value-grid {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          background: ${CREAM};
          border-bottom: 1px solid ${BORDER};
        }

        .op-value-cell {
          padding: 22px 22px 20px;
        }

        .op-value-cell + .op-value-cell {
          border-left: 1px solid ${BORDER};
        }

        .op-stats-bar {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr 1fr;
          background: ${NAVY};
        }

        .op-stat-cell {
          padding: 16px 20px;
          text-align: center;
        }

        .op-stat-cell + .op-stat-cell {
          border-left: 1px solid rgba(255,255,255,0.08);
        }

        .op-features-section {
          padding: 26px 40px 22px;
          background: ${WHITE};
          border-bottom: 1px solid ${BORDER};
        }

        .op-features-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px 28px;
        }

        .op-pricing-section {
          padding: 22px 40px 22px;
          background: ${CREAM};
          border-bottom: 1px solid ${BORDER};
        }

        .op-pricing-grid {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 10px;
        }

        .op-footer {
          padding: 18px 40px;
          background: ${NAVY};
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
        }

        .op-section-label {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: ${SLATE_LIGHT};
          margin-bottom: 14px;
        }

        /* ── MOBILE RESPONSIVE ── */
        @media (max-width: 640px) {
          .op-shell {
            padding-top: 16px;
            padding-bottom: 32px;
          }

          .op-header {
            padding: 20px 20px 18px;
            flex-direction: column;
            gap: 10px;
          }

          .op-header-right {
            display: none;
          }

          .op-hero {
            padding: 24px 20px 20px;
          }

          .op-hero h1 {
            font-size: 18px;
          }

          .op-hero p {
            font-size: 12px;
          }

          .op-value-grid {
            grid-template-columns: 1fr;
          }

          .op-value-cell + .op-value-cell {
            border-left: none;
            border-top: 1px solid ${BORDER};
          }

          .op-value-cell {
            padding: 18px 20px;
          }

          .op-stats-bar {
            grid-template-columns: 1fr 1fr;
          }

          .op-stat-cell:nth-child(2) {
            border-right: none;
          }

          .op-stat-cell:nth-child(3) {
            border-left: none;
            border-top: 1px solid rgba(255,255,255,0.08);
          }

          .op-stat-cell:nth-child(4) {
            border-top: 1px solid rgba(255,255,255,0.08);
          }

          .op-features-section {
            padding: 20px 20px 18px;
          }

          .op-features-grid {
            grid-template-columns: 1fr;
          }

          .op-pricing-section {
            padding: 18px 20px;
          }

          .op-pricing-grid {
            grid-template-columns: 1fr;
          }

          .op-footer {
            padding: 16px 20px;
            flex-direction: column;
            align-items: flex-start;
            gap: 16px;
          }

          .op-section-label {
            font-size: 9px;
          }
        }

        /* ── PRINT STYLES ── */
        @media print {
          .op-shell {
            background: #ffffff !important;
            padding: 0 !important;
            min-height: unset !important;
            display: block !important;
          }

          .op-document {
            width: 100% !important;
            max-width: 100% !important;
            box-shadow: none !important;
            border-radius: 0 !important;
          }

          .op-value-grid {
            grid-template-columns: 1fr 1fr 1fr !important;
          }

          .op-stats-bar {
            grid-template-columns: 1fr 1fr 1fr 1fr !important;
          }

          .op-features-grid {
            grid-template-columns: 1fr 1fr !important;
          }

          .op-pricing-grid {
            grid-template-columns: 1fr 1fr 1fr !important;
          }

          .op-header-right {
            display: block !important;
          }

          .op-stat-cell:nth-child(3) {
            border-left: 1px solid rgba(255,255,255,0.08) !important;
            border-top: none !important;
          }

          .op-value-cell + .op-value-cell {
            border-left: 1px solid ${BORDER} !important;
            border-top: none !important;
          }
        }
      `}</style>

      <div className="op-shell">
        <button
          onClick={handlePrint}
          data-testid="button-download-pdf"
          className="no-print"
          style={{
            position: "fixed",
            top: "20px",
            right: "24px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "10px 22px",
            borderRadius: "8px",
            background: EMERALD,
            color: WHITE,
            fontFamily: "'Open Sans', sans-serif",
            fontSize: "14px",
            fontWeight: 600,
            border: "none",
            cursor: "pointer",
            boxShadow: "0 4px 14px rgba(30,122,74,0.35)",
            zIndex: 100,
          }}
          onMouseEnter={(e) => { (e.currentTarget.style.background = "#185e39"); }}
          onMouseLeave={(e) => { (e.currentTarget.style.background = EMERALD); }}
        >
          <Printer size={15} />
          Download as PDF
        </button>

        <div className="op-document" data-testid="one-pager-document">

          {/* ── HEADER ── */}
          <div className="op-header">
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                <div style={{
                  width: "34px", height: "34px", borderRadius: "7px", background: EMERALD,
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <circle cx="12" cy="12" r="6" />
                    <circle cx="12" cy="12" r="2" />
                    <line x1="2" y1="12" x2="4" y2="12" />
                    <line x1="20" y1="12" x2="22" y2="12" />
                    <line x1="12" y1="2" x2="12" y2="4" />
                    <line x1="12" y1="20" x2="12" y2="22" />
                  </svg>
                </div>
                <span style={{ color: WHITE, fontWeight: 700, fontSize: "19px", letterSpacing: "-0.3px" }}>
                  Eden<span style={{ color: EMERALD_LIGHT }}>Radar</span>
                </span>
              </div>
              <div style={{
                display: "inline-block",
                background: "rgba(34,197,94,0.12)",
                border: "1px solid rgba(34,197,94,0.3)",
                borderRadius: "4px",
                padding: "3px 10px",
                color: EMERALD_LIGHT,
                fontSize: "10px",
                fontWeight: 700,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}>
                EdenScout Intelligence Platform
              </div>
            </div>

            <div className="op-header-right" style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "10px", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "2px" }}>
                For BD Teams
              </div>
              <div style={{ color: "rgba(255,255,255,0.75)", fontSize: "10px" }}>
                edenradar.com
              </div>
            </div>
          </div>

          {/* ── HERO ── */}
          <div className="op-hero">
            <h1>
              The BD Intelligence Platform Built for{" "}
              <span style={{ color: EMERALD_LIGHT }}>Pharma & Biotech</span>
            </h1>
            <p>
              EdenScout aggregates, enriches, and scores every technology transfer opportunity from 300+ leading research institutions — giving your BD team a structured, searchable, always-fresh view of the pre-clinical innovation landscape.
            </p>
          </div>

          {/* ── VALUE PROPS ── */}
          <div className="op-value-grid">
            {VALUE_PROPS.map((vp) => (
              <div key={vp.label} className="op-value-cell">
                <div style={{
                  width: "30px", height: "30px", borderRadius: "6px",
                  background: "rgba(30,122,74,0.1)", display: "flex",
                  alignItems: "center", justifyContent: "center", marginBottom: "10px",
                }}>
                  <vp.icon size={15} color={EMERALD} />
                </div>
                <div style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: EMERALD, marginBottom: "5px" }}>
                  {vp.label}
                </div>
                <div style={{ fontSize: "12px", fontWeight: 700, color: NAVY, marginBottom: "6px", lineHeight: 1.3 }}>
                  {vp.headline}
                </div>
                <p style={{ fontSize: "11.5px", color: SLATE_LIGHT, lineHeight: 1.6, margin: 0 }}>
                  {vp.body}
                </p>
              </div>
            ))}
          </div>

          {/* ── STATS BAR ── */}
          <div className="op-stats-bar">
            {STATS.map((s) => (
              <div key={s.label} className="op-stat-cell">
                <div style={{ fontSize: "22px", fontWeight: 800, color: EMERALD_LIGHT, letterSpacing: "-0.5px", lineHeight: 1, marginBottom: "4px" }}>
                  {s.value}
                </div>
                <div style={{ fontSize: "10px", fontWeight: 600, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>

          {/* ── FEATURES ── */}
          <div className="op-features-section">
            <div className="op-section-label">What's Included</div>
            <div className="op-features-grid">
              {FEATURES.map((f) => (
                <div key={f.text} style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                  <div style={{
                    flexShrink: 0, marginTop: "2px", width: "16px", height: "16px",
                    borderRadius: "50%", background: "rgba(30,122,74,0.1)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <f.icon size={9} color={EMERALD} />
                  </div>
                  <span style={{ fontSize: "11.5px", color: SLATE, lineHeight: 1.5 }}>{f.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── PRICING ── */}
          <div className="op-pricing-section">
            <div className="op-section-label">Pricing — Start with a Free Trial</div>
            <div className="op-pricing-grid">
              {PRICING.map((p) => (
                <div
                  key={p.tier}
                  style={{
                    padding: "14px 16px",
                    borderRadius: "6px",
                    background: p.highlight ? NAVY : WHITE,
                    border: p.highlight ? `2px solid ${EMERALD}` : `1px solid ${BORDER}`,
                    position: "relative",
                  }}
                >
                  {p.highlight && (
                    <div style={{
                      position: "absolute", top: "-1px", right: "12px",
                      background: EMERALD, color: WHITE,
                      fontSize: "8px", fontWeight: 700, padding: "2px 7px",
                      borderRadius: "0 0 4px 4px", letterSpacing: "0.08em", textTransform: "uppercase",
                    }}>
                      Most Popular
                    </div>
                  )}
                  <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: p.highlight ? EMERALD_LIGHT : EMERALD, marginBottom: "5px" }}>
                    {p.tier}
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "2px", marginBottom: "7px" }}>
                    <span style={{ fontSize: "21px", fontWeight: 800, color: p.highlight ? WHITE : NAVY, letterSpacing: "-0.5px" }}>{p.price}</span>
                    <span style={{ fontSize: "11px", color: p.highlight ? "rgba(255,255,255,0.5)" : SLATE_LIGHT, fontWeight: 500 }}>{p.period}</span>
                  </div>
                  <p style={{ fontSize: "10.5px", color: p.highlight ? "rgba(255,255,255,0.65)" : SLATE_LIGHT, lineHeight: 1.55, margin: 0 }}>
                    {p.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* ── EDENMARKET ── */}
          <div className="op-pricing-section" style={{ marginTop: "0", paddingTop: "0" }}>
            <div className="op-section-label" style={{ color: "#7c3aed" }}>EdenMarket — The Blind Marketplace</div>
            <div style={{
              padding: "16px 18px",
              borderRadius: "8px",
              background: "linear-gradient(135deg, rgba(124,58,237,0.06), rgba(124,58,237,0.02))",
              border: "1px solid rgba(124,58,237,0.25)",
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "16px",
              alignItems: "start",
            }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                  <ShoppingBag size={13} color="#7c3aed" />
                  <span style={{ fontSize: "10.5px", fontWeight: 800, color: "#7c3aed", letterSpacing: "0.08em", textTransform: "uppercase" }}>Buyers</span>
                </div>
                <p style={{ fontSize: "11.5px", color: SLATE, lineHeight: 1.55, margin: "0 0 8px 0" }}>
                  Browse blind biotech listings — TA, modality, stage, IP — without seller identities. Engage anonymously and unlock the full asset only after NDA.
                </p>
                <div style={{ display: "flex", alignItems: "baseline", gap: "3px", marginTop: "8px" }}>
                  <span style={{ fontSize: "18px", fontWeight: 800, color: NAVY, letterSpacing: "-0.5px" }}>$1,000</span>
                  <span style={{ fontSize: "11px", color: SLATE_LIGHT }}>/mo · org-wide access</span>
                </div>
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                  <Handshake size={13} color="#7c3aed" />
                  <span style={{ fontSize: "10.5px", fontWeight: 800, color: "#7c3aed", letterSpacing: "0.08em", textTransform: "uppercase" }}>Sellers</span>
                </div>
                <p style={{ fontSize: "11.5px", color: SLATE, lineHeight: 1.55, margin: "0 0 8px 0" }}>
                  Free to list. Success fees only when a deal closes — incentives stay aligned with you from first listing to signed term sheet.
                </p>
                <div style={{ display: "flex", gap: "10px", marginTop: "8px", flexWrap: "wrap" }}>
                  {[
                    { label: "Pre-clin", fee: "$10k" },
                    { label: "Clinical", fee: "$30k" },
                    { label: "Late-stage", fee: "$50k" },
                  ].map((t) => (
                    <div key={t.label} style={{ flex: "1 1 0", minWidth: "60px" }}>
                      <div style={{ fontSize: "9px", fontWeight: 700, color: "#7c3aed", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "2px" }}>{t.label}</div>
                      <div style={{ fontSize: "13px", fontWeight: 800, color: NAVY }}>{t.fee}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── FOOTER ── */}
          <div className="op-footer">
            <div style={{ flex: 1 }}>
              <div style={{
                display: "inline-block", background: EMERALD, color: WHITE,
                fontWeight: 700, fontSize: "12px", padding: "8px 18px",
                borderRadius: "5px", letterSpacing: "0.02em", marginBottom: "12px",
              }}>
                Start your free trial → edenradar.com
              </div>
              <div style={{ color: "rgba(255,255,255,0.45)", fontSize: "10px", lineHeight: 1.6 }}>
                <div>hello@edenradar.com</div>
                <div style={{ marginTop: "2px" }}>© {new Date().getFullYear()} EdenRadar · All rights reserved</div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", flexShrink: 0 }}>
              {qrSvg ? (
                <div style={{
                  width: "70px", height: "70px", background: WHITE, borderRadius: "6px",
                  padding: "4px", display: "flex", alignItems: "center", justifyContent: "center",
                }}
                  dangerouslySetInnerHTML={{ __html: qrSvg }}
                />
              ) : (
                <div style={{
                  width: "70px", height: "70px", background: WHITE, borderRadius: "6px",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Globe size={26} color={NAVY} />
                </div>
              )}
              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "9px", textAlign: "center", letterSpacing: "0.05em" }}>
                Scan to visit
              </div>
            </div>
          </div>

        </div>

        <p className="no-print" style={{ marginTop: "18px", fontSize: "12px", color: "#64748b", textAlign: "center" }}>
          Use the "Download as PDF" button above — or press{" "}
          <kbd style={{ background: "#fff", border: "1px solid #cbd5e1", padding: "1px 5px", borderRadius: "3px" }}>Ctrl+P</kbd>
          {" / "}
          <kbd style={{ background: "#fff", border: "1px solid #cbd5e1", padding: "1px 5px", borderRadius: "3px" }}>⌘P</kbd>
          {" "}and choose "Save as PDF".
        </p>
      </div>
    </>
  );
}
