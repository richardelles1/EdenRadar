import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import QRCode from "qrcode";
import { ExportMenu } from "@/components/ExportMenu";
import { useDocumentMeta } from "@/hooks/use-document-meta";

function useQrSvg(url: string) {
  const [svg, setSvg] = useState<string>("");
  useEffect(() => {
    QRCode.toString(url, {
      type: "svg",
      margin: 1,
      color: { dark: "#0d1625", light: "#ffffff" },
    })
      .then(setSvg)
      .catch(() => setSvg(""));
  }, [url]);
  return svg;
}

export default function OnePager() {
  useDocumentMeta({
    title: "EdenRadar: BD Intelligence Platform",
    description:
      "EdenRadar monitors 350+ technology transfer offices in real time, scoring and enriching every asset before it reaches a patent database.",
  });

  const qrSvg = useQrSvg("https://edenradar.com/demo");

  useEffect(() => {
    const id = "barlow-font-op";
    if (!document.getElementById(id)) {
      const link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      link.href =
        "https://fonts.googleapis.com/css2?family=Barlow:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400&family=Barlow+Semi+Condensed:wght@600;700;800&display=swap";
      document.head.appendChild(link);
    }
  }, []);

  function handlePrint() {
    window.print();
  }

  return (
    <>
      <style>{`
        /* ── Shell ─────────────────────────────────────────────────── */
        .op-shell {
          min-height: 100vh;
          background: hsl(210 25% 88%);
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 36px 16px 56px;
          font-family: 'Barlow', system-ui, sans-serif;
        }

        .op-controls {
          position: fixed;
          top: 20px;
          right: 24px;
          display: flex;
          align-items: center;
          gap: 8px;
          z-index: 100;
        }

        .op-dl-btn {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 9px 20px;
          background: hsl(33 85% 44%);
          color: #fff;
          font-family: 'Barlow', system-ui, sans-serif;
          font-size: 13px;
          font-weight: 600;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          transition: background 0.15s;
        }
        .op-dl-btn:hover { background: hsl(33 85% 38%); }

        .op-hint {
          margin-top: 16px;
          font-size: 11px;
          color: hsl(215 20% 42%);
          text-align: center;
          font-family: 'Barlow', system-ui, sans-serif;
        }

        /* ── Document ──────────────────────────────────────────────── */
        .op-doc {
          width: 794px;
          max-width: 100%;
          background: hsl(210 25% 97%);
          box-shadow: 0 12px 48px hsl(222 40% 10% / 0.22);
          overflow: hidden;
        }

        /* ── Header (light, emerald rule) ─────────────────────────── */
        .op-hd {
          background: hsl(210 25% 97%);
          padding: 14px 40px;
          border-bottom: 2px solid hsl(142 52% 36%);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
        }

        .op-wordmark {
          display: flex;
          align-items: center;
          gap: 9px;
        }

        .op-wordmark-text {
          font-family: 'Barlow Semi Condensed', system-ui, sans-serif;
          font-size: 16px;
          font-weight: 700;
          letter-spacing: -0.02em;
          color: hsl(222 40% 14%);
        }

        .op-wordmark-text em {
          font-style: normal;
          color: hsl(142 52% 36%);
        }

        .op-hd-right {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 3px;
        }

        .op-hd-url {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.03em;
          color: hsl(222 40% 22%);
        }

        .op-hd-date {
          font-size: 9px;
          color: hsl(215 18% 52%);
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        /* ── Hero (light, emerald headline) ───────────────────────── */
        .op-hero {
          background: hsl(210 25% 97%);
          padding: 36px 40px 34px;
          border-bottom: 1px solid hsl(142 28% 89%);
          position: relative;
          overflow: hidden;
        }

        /* Subtle emerald radial glow top-right — echoes landing page RadarBackground */
        .op-hero::before {
          content: '';
          position: absolute;
          top: -60px;
          right: -60px;
          width: 380px;
          height: 380px;
          background: radial-gradient(circle, hsl(142 55% 48% / 0.07) 0%, transparent 65%);
          pointer-events: none;
        }

        .op-hero-hed {
          position: relative;
          font-family: 'Barlow Semi Condensed', system-ui, sans-serif;
          font-size: 32px;
          line-height: 1.08;
          letter-spacing: -0.025em;
          color: hsl(142 52% 30%);
          margin-bottom: 13px;
          max-width: 590px;
        }

        .op-hero-hed-setup { font-weight: 600; }
        .op-hero-hed-punch { font-weight: 800; }

        .op-hero-kicker {
          position: relative;
          font-size: 13px;
          font-weight: 600;
          color: hsl(33 85% 40%);
          margin-bottom: 14px;
          letter-spacing: 0.01em;
        }

        .op-hero-body {
          position: relative;
          font-size: 13px;
          font-weight: 400;
          line-height: 1.72;
          color: hsl(222 30% 32%);
          max-width: 560px;
        }

        /* ── Numbered sections ─────────────────────────────────────── */
        .op-body {
          background: hsl(210 25% 97%);
          padding: 0 40px;
          border-bottom: 1px solid hsl(142 28% 89%);
        }

        .op-section {
          display: grid;
          grid-template-columns: 64px 1fr;
          gap: 0 20px;
          padding: 26px 0;
          border-bottom: 1px solid hsl(142 28% 90%);
        }

        .op-section:last-child { border-bottom: none; }

        .op-sec-num {
          font-family: 'Barlow Semi Condensed', system-ui, sans-serif;
          font-size: 48px;
          font-weight: 800;
          letter-spacing: -0.04em;
          color: hsl(142 52% 36%);
          line-height: 1;
          padding-top: 1px;
        }

        .op-sec-hed {
          font-family: 'Barlow Semi Condensed', system-ui, sans-serif;
          font-size: 15px;
          font-weight: 700;
          letter-spacing: -0.01em;
          color: hsl(222 47% 12%);
          margin-bottom: 8px;
          line-height: 1.2;
        }

        .op-sec-body {
          font-size: 12px;
          font-weight: 400;
          line-height: 1.74;
          color: hsl(222 30% 24%);
          margin: 0;
        }

        .op-sec-body strong {
          font-weight: 600;
          color: hsl(33 85% 38%);
        }

        /* ── Coverage strip (dark forest green) ────────────────────── */
        .op-cov {
          background: hsl(142 38% 11%);
          display: grid;
          grid-template-columns: 1fr 1px 1fr 1px 1fr 1px 1fr;
        }

        .op-cov-divider {
          background: hsl(142 40% 20% / 0.5);
        }

        .op-cov-cell {
          padding: 20px 16px;
          text-align: center;
        }

        .op-cov-num {
          display: block;
          font-family: 'Barlow Semi Condensed', system-ui, sans-serif;
          font-size: 26px;
          font-weight: 800;
          letter-spacing: -0.03em;
          line-height: 1;
          margin-bottom: 3px;
        }

        .op-cov-num.amber { color: hsl(33 85% 58%); }
        .op-cov-num.emerald { color: hsl(142 65% 58%); }

        .op-cov-label {
          display: block;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: hsl(142 32% 62%);
          margin-bottom: 7px;
        }

        .op-cov-ex {
          display: block;
          font-size: 10.5px;
          color: hsl(142 18% 58%);
          line-height: 1.55;
        }

        /* ── Pricing ───────────────────────────────────────────────── */
        .op-pricing {
          background: hsl(142 15% 96%);
          padding: 22px 40px;
          border-bottom: 1px solid hsl(142 28% 89%);
        }

        .op-pricing-hed {
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: hsl(215 20% 48%);
          margin-bottom: 13px;
        }

        .op-pricing-table {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          border: 1px solid hsl(142 28% 87%);
          background: hsl(142 28% 87%);
          gap: 1px;
        }

        .op-tier {
          padding: 15px 17px;
          background: hsl(210 25% 97%);
        }

        .op-tier-featured {
          background: hsl(142 42% 10%);
        }

        .op-tier-name {
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: hsl(142 52% 36%);
          margin-bottom: 7px;
        }

        .op-tier-featured .op-tier-name {
          color: hsl(142 65% 55%);
        }

        .op-tier-price {
          font-family: 'Barlow Semi Condensed', system-ui, sans-serif;
          font-size: 22px;
          font-weight: 800;
          letter-spacing: -0.03em;
          color: hsl(222 47% 12%);
          line-height: 1;
          margin-bottom: 8px;
        }

        .op-tier-price span {
          font-size: 12px;
          font-weight: 500;
          color: hsl(215 18% 52%);
          letter-spacing: 0;
        }

        .op-tier-featured .op-tier-price { color: hsl(210 25% 95%); }
        .op-tier-featured .op-tier-price span { color: hsl(142 22% 60%); }

        .op-tier-desc {
          font-size: 11px;
          line-height: 1.6;
          color: hsl(215 18% 44%);
        }

        .op-tier-featured .op-tier-desc { color: hsl(142 20% 64%); }

        /* ── Footer ────────────────────────────────────────────────── */
        .op-ft {
          background: hsl(142 15% 95%);
          border-top: 1px solid hsl(142 28% 88%);
          padding: 22px 40px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
        }

        .op-cta-btn {
          display: inline-block;
          padding: 10px 22px;
          background: hsl(33 85% 44%);
          color: #fff;
          font-family: 'Barlow Semi Condensed', system-ui, sans-serif;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-decoration: none;
          border-radius: 3px;
          margin-bottom: 10px;
          cursor: pointer;
          border: none;
          transition: background 0.15s;
        }
        .op-cta-btn:hover { background: hsl(33 85% 38%); }

        .op-ft-contact {
          font-size: 10px;
          color: hsl(215 20% 44%);
          line-height: 1.7;
        }

        .op-ft-right {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 5px;
          flex-shrink: 0;
        }

        .op-qr-wrap {
          width: 66px;
          height: 66px;
          background: #fff;
          border-radius: 4px;
          padding: 3px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .op-qr-wrap svg { width: 100%; height: 100%; }

        .op-qr-label {
          font-size: 9px;
          letter-spacing: 0.06em;
          color: hsl(215 16% 44%);
          text-transform: uppercase;
        }

        /* ── Responsive ────────────────────────────────────────────── */
        @media (max-width: 640px) {
          .op-shell { padding: 16px 0 40px; }
          .op-hd { padding: 14px 20px; }
          .op-hd-right .op-badge { display: none; }
          .op-hero { padding: 26px 20px 28px; }
          .op-hero-hed { font-size: 23px; }
          .op-body { padding: 0 20px; }
          .op-section { grid-template-columns: 36px 1fr; gap: 0 14px; padding: 22px 0; }
          .op-cov { grid-template-columns: 1fr 1fr; }
          .op-cov-divider { display: none; }
          .op-cov-cell { padding: 16px 20px; }
          .op-pricing { padding: 18px 20px; }
          .op-pricing-table { grid-template-columns: 1fr; }
          .op-ft { padding: 20px 20px; flex-direction: column; align-items: flex-start; gap: 16px; }
        }

        /* ── Print ─────────────────────────────────────────────────── */
        @media print {
          .op-shell {
            background: #fff !important;
            padding: 0 !important;
            min-height: unset !important;
            display: block !important;
          }
          .op-doc {
            width: 100% !important;
            max-width: 100% !important;
            box-shadow: none !important;
          }
          .op-cov { grid-template-columns: 1fr 1px 1fr 1px 1fr 1px 1fr !important; }
          .op-pricing-table { grid-template-columns: 1fr 1fr 1fr !important; }
          .op-hd-right { display: flex !important; }
        }
      `}</style>

      <div className="op-shell">
        {/* ── Export controls (screen only) ── */}
        <div className="no-print op-controls" data-export-control>
          <ExportMenu
            label="Save to Cloud"
            getContent={async () => {
              const { captureCurrentPageAsHtml, utf8ToBase64 } = await import("@/components/ExportMenu");
              const html = captureCurrentPageAsHtml();
              return {
                content: utf8ToBase64(html),
                filename: `EdenRadar_One_Pager_${new Date().toISOString().slice(0, 10)}.html`,
                fileType: "html",
              };
            }}
          />
          <button
            onClick={handlePrint}
            data-testid="button-download-pdf"
            className="op-dl-btn"
          >
            <Printer size={14} />
            Download as PDF
          </button>
        </div>

        {/* ── Document ── */}
        <div className="op-doc" data-testid="one-pager-document">

          {/* HEADER */}
          <div className="op-hd">
            <div className="op-wordmark">
              <svg width="26" height="26" viewBox="0 0 28 28" fill="none" style={{ color: "hsl(142 52% 36%)" }}>
                <circle cx="14" cy="14" r="12" stroke="currentColor" strokeWidth="1.4" />
                <circle cx="14" cy="14" r="7.5" stroke="currentColor" strokeWidth="1.2" strokeOpacity="0.55" />
                <circle cx="14" cy="14" r="3" stroke="currentColor" strokeWidth="1.2" strokeOpacity="0.35" />
                <line x1="2" y1="14" x2="5" y2="14" stroke="currentColor" strokeWidth="1.2" />
                <line x1="23" y1="14" x2="26" y2="14" stroke="currentColor" strokeWidth="1.2" />
                <line x1="14" y1="2" x2="14" y2="5" stroke="currentColor" strokeWidth="1.2" />
                <line x1="14" y1="23" x2="14" y2="26" stroke="currentColor" strokeWidth="1.2" />
              </svg>
              <span className="op-wordmark-text">Eden<em>Radar</em></span>
            </div>
            <div className="op-hd-right">
              <span className="op-hd-url">edenradar.com</span>
              <span className="op-hd-date">May 2026</span>
            </div>
          </div>

          {/* HERO */}
          <div className="op-hero">
            <h1 className="op-hero-hed">
              <span className="op-hero-hed-setup">By the time an asset appears in a public filing,</span><br />
              <span className="op-hero-hed-punch">the licensing window is already closing.</span>
            </h1>
            <p className="op-hero-kicker">Before the patent. Before the competition.</p>
            <p className="op-hero-body">
              EdenRadar monitors 350+ technology transfer offices in real time, surfacing
              pre-clinical and discovery-stage assets before they reach patent databases.
              Every result is scored, enriched by EDEN AI with 12 structured fields, and
              delivered with the context your BD team needs to evaluate, engage, and move first.
            </p>
          </div>

          {/* NUMBERED SECTIONS */}
          <div className="op-body">

            <div className="op-section">
              <div className="op-sec-num">01</div>
              <div>
                <h2 className="op-sec-hed">Monitor 350+ tech transfer offices in real time, scored against your deal profile.</h2>
                <p className="op-sec-body">
                  A single query scans <strong>350+ technology transfer office portals</strong> for pre-commercial,
                  pre-patent assets alongside <strong>active clinical trial registries</strong>,{" "}
                  <strong>published literature</strong>, and <strong>patent filings</strong>. Every TTO result
                  is scored 1–100 against your saved deal profile: therapeutic area, modality, and development
                  stage. Set your profile once; EdenRadar applies it to every search automatically. Filter by
                  indication, stage, institution, or date, and sort by score or momentum to surface assets with
                  the strongest and most recent signal.
                </p>
              </div>
            </div>

            <div className="op-section">
              <div className="op-sec-num">02</div>
              <div>
                <h2 className="op-sec-hed">Track every asset from first signal to term sheet.</h2>
                <p className="op-sec-body">
                  Save any result to a private pipeline and move it across five tracked statuses:{" "}
                  <strong>Watching, Evaluating, In Discussion, On Hold,</strong> and <strong>Passed</strong>.
                  The kanban board updates in real time. Add <strong>timestamped team notes</strong>, generate
                  a <strong>one-click executive brief</strong>, and export the full pipeline as a structured{" "}
                  <strong>CSV</strong> for BD review. Set saved search alerts; when new assets match your
                  criteria, EdenRadar surfaces them at the top of your feed.
                </p>
              </div>
            </div>

            <div className="op-section">
              <div className="op-sec-num">03</div>
              <div>
                <h2 className="op-sec-hed">A complete intelligence brief, not a database record.</h2>
                <p className="op-sec-body">
                  Every asset generates a structured dossier: target, modality, indication, development stage,{" "}
                  <strong>mechanism of action</strong>, <strong>innovation claim</strong>,{" "}
                  <strong>unmet need</strong>, <strong>comparable drugs</strong>,{" "}
                  <strong>patent status</strong>, <strong>licensing readiness</strong>, and TTO contact.
                  A streamed AI narrative synthesises the science, commercial rationale, and competitive
                  landscape, closing with a <strong>suggested BD next step</strong>. Competing assets,
                  active clinical trials, and supporting literature are included automatically. Share via{" "}
                  <strong>permanent link</strong> or print for board presentation.
                </p>
              </div>
            </div>

            <div className="op-section">
              <div className="op-sec-num">04</div>
              <div>
                <h2 className="op-sec-hed">Map the research landscape before targeting a single asset.</h2>
                <p className="op-sec-body">
                  The <strong>Intelligence</strong> tab provides a real-time view of the entire indexed corpus
                  across all 350+ TTO portals. See which <strong>therapeutic mechanisms</strong> have the
                  highest research activity, identify <strong>supply gaps</strong> where unmet need is high and
                  competing assets are scarce, and monitor <strong>modality momentum</strong> to see which
                  delivery platforms are gaining ground. <strong>Institution velocity</strong> shows which TTOs
                  are adding assets fastest. Every data point is clickable: select a mechanism, modality, or
                  institution and EdenRadar runs a pre-filtered search directly from the landscape view.
                </p>
              </div>
            </div>

          </div>

          {/* COVERAGE STRIP */}
          <div className="op-cov">
            <div className="op-cov-cell">
              <span className="op-cov-num amber">350+</span>
              <span className="op-cov-label">TTO Portals</span>
              <span className="op-cov-ex">
                MIT &middot; Stanford &middot; Harvard &middot; Johns Hopkins &middot; UCSF &middot; Oxford &middot; Max Planck &middot; Broad Institute
              </span>
            </div>
            <div className="op-cov-divider" />
            <div className="op-cov-cell">
              <span className="op-cov-num emerald">33,000+</span>
              <span className="op-cov-label">Scored Assets</span>
              <span className="op-cov-ex">
                Pre-clinical &middot; Discovery &middot; Phase I/II &middot; Available for licensing
              </span>
            </div>
            <div className="op-cov-divider" />
            <div className="op-cov-cell">
              <span className="op-cov-num emerald">12</span>
              <span className="op-cov-label">Data Intelligence Layers</span>
              <span className="op-cov-ex">Per asset &middot; Structured &middot; AI-synthesised</span>
            </div>
            <div className="op-cov-divider" />
            <div className="op-cov-cell">
              <span className="op-cov-num emerald">40+</span>
              <span className="op-cov-label">Live Data Sources</span>
              <span className="op-cov-ex">
                Patents &middot; Clinical Trials &middot; Research
              </span>
            </div>
          </div>

          {/* PRICING */}
          <div className="op-pricing">
            <div className="op-pricing-hed">Pricing: Early Access Tiers</div>
            <div className="op-pricing-table">
              <div className="op-tier">
                <div className="op-tier-name">Individual</div>
                <div className="op-tier-price">$1,999<span>/mo</span></div>
                <div className="op-tier-desc">Single seat. Pipeline tracking and saved asset lists. PDF and CSV export.</div>
              </div>
              <div className="op-tier op-tier-featured">
                <div className="op-tier-name">Team</div>
                <div className="op-tier-price">$8,999<span>/mo</span></div>
                <div className="op-tier-desc">5 seats. Shared pipeline and watchlists. Org dashboard. Priority support.</div>
              </div>
              <div className="op-tier">
                <div className="op-tier-name">Enterprise</div>
                <div className="op-tier-price">$16,999<span>/mo</span></div>
                <div className="op-tier-desc">10 seats. Dedicated account manager. Custom alert configurations.</div>
              </div>
            </div>
          </div>

          {/* FOOTER */}
          <div className="op-ft">
            <div>
              <a href="/demo" className="op-cta-btn">
                Request early access at edenradar.com
              </a>
              <div className="op-ft-contact">
                &copy; {new Date().getFullYear()} EdenRadar &middot; All rights reserved
              </div>
            </div>
            <div className="op-ft-right">
              {qrSvg ? (
                <div className="op-qr-wrap" dangerouslySetInnerHTML={{ __html: qrSvg }} />
              ) : (
                <div className="op-qr-wrap" />
              )}
              <span className="op-qr-label">Scan to apply</span>
            </div>
          </div>

        </div>

        <p className="no-print op-hint">
          Use "Download as PDF" above, or press{" "}
          <kbd style={{ background: "#fff", border: "1px solid #c0c8d4", padding: "1px 5px", borderRadius: "3px", fontFamily: "monospace" }}>
            Ctrl+P
          </kbd>
          {" / "}
          <kbd style={{ background: "#fff", border: "1px solid #c0c8d4", padding: "1px 5px", borderRadius: "3px", fontFamily: "monospace" }}>
            {"⌘"}P
          </kbd>
          {" "}and choose "Save as PDF".
        </p>
      </div>
    </>
  );
}
