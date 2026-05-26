import { useEffect, useState } from "react";
import { ArrowLeft, Moon, Printer, Sun, Share2, Eye, EyeOff, Copy, Check, Lock, Loader2 } from "lucide-react";
import { PRINT_STYLES, PrintFooter, formatDate, GREEN, BG_DARK } from "@/lib/print-shared";
import { ExportMenu } from "@/components/ExportMenu";
import type { BriefData, BriefAsset } from "@/components/PipelineBriefDialog";

const SIGNAL_COLORS: Record<string, { bg: string; border: string; color: string }> = {
  Patent: { bg: "rgba(217,119,6,0.1)", border: "rgba(217,119,6,0.3)", color: "#92400e" },
  "Clinical Trial": { bg: "rgba(20,184,166,0.1)", border: "rgba(20,184,166,0.3)", color: "#0f766e" },
  Paper: { bg: "rgba(124,58,237,0.1)", border: "rgba(124,58,237,0.3)", color: "#6d28d9" },
  Preprint: { bg: "rgba(124,58,237,0.1)", border: "rgba(124,58,237,0.3)", color: "#6d28d9" },
};

const PRINT_LIGHT_OVERRIDE = `
  @media print {
    .pbp-root { background: #f8f9fa !important; color: #1a2b24 !important; }
    .pbp-card { background: #ffffff !important; border-color: #d1e8db !important; }
    .pbp-heading { color: #1a6b44 !important; }
    .pbp-muted { color: #5a8a72 !important; }
    .pbp-body { color: #1a2b24 !important; }
  }
`;

export default function PipelineBriefPrint() {
  const [data, setData] = useState<BriefData | null>(null);
  const [dark, setDark] = useState(false);
  const today = formatDate(new Date().toISOString());

  const [showShareForm, setShowShareForm] = useState(false);
  const [sharePassword, setSharePassword] = useState("");
  const [sharePasswordVisible, setSharePasswordVisible] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareCreating, setShareCreating] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("pipeline-brief-print");
      if (raw) setData(JSON.parse(raw));
    } catch {}
  }, []);

  async function handleCreateShareLink() {
    if (!data) return;
    setShareCreating(true);
    setShareError(null);
    try {
      const body: Record<string, unknown> = { type: "pipeline_brief", payload: data };
      if (sharePassword) body.password = sharePassword;
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed to create share link");
      }
      const result = await res.json() as { url: string };
      setShareUrl(result.url);
      setShowShareForm(false);
    } catch (err: unknown) {
      setShareError(err instanceof Error ? err.message : "Failed to create share link");
    } finally {
      setShareCreating(false);
    }
  }

  if (!data) {
    return (
      <div style={{ fontFamily: "sans-serif", padding: "3rem", textAlign: "center", color: "#888" }}>
        No brief data found. Please generate a pipeline brief and click Full Report from the dialog.
      </div>
    );
  }

  const bg = dark ? BG_DARK : "#f8f9fa";
  const fg = dark ? "#e6f0ea" : "#1a2b24";
  const cardBg = dark ? "#111a14" : "#ffffff";
  const cardBorder = dark ? "#1e3329" : "#d1e8db";
  const headingColor = dark ? GREEN : "#1a6b44";
  const mutedColor = dark ? "#6b9e82" : "#5a8a72";

  const btnBase: React.CSSProperties = {
    border: `1px solid ${cardBorder}`, borderRadius: "6px",
    padding: "0.35rem 0.75rem", cursor: "pointer", color: fg,
    display: "flex", alignItems: "center", gap: "0.4rem",
    fontSize: "0.8rem", background: cardBg,
  };

  const sectionLabel: React.CSSProperties = {
    fontSize: "0.68rem", textTransform: "uppercase",
    letterSpacing: "0.1em", color: headingColor,
    fontWeight: 700, marginBottom: "0.5rem",
  };

  return (
    <div
      className="pbp-root"
      style={{ fontFamily: "'Open Sans', sans-serif", background: bg, minHeight: "100vh", color: fg, transition: "background 0.2s, color 0.2s" }}
    >
      <style>{PRINT_STYLES}</style>
      <style>{PRINT_LIGHT_OVERRIDE}</style>

      <div className="no-print" style={{ position: "fixed", top: "1rem", left: "1.25rem", zIndex: 100 }}>
        <button onClick={() => window.close()} style={btnBase} data-testid="button-back">
          <ArrowLeft size={13} />Back
        </button>
      </div>

      <div className="no-print" style={{
        position: "fixed", top: "1rem", right: "1.25rem", zIndex: 100,
        display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end",
      }}>
        {shareUrl ? (
          <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
            {sharePassword && <Lock size={11} color="#d97706" />}
            <input
              readOnly value={shareUrl}
              onClick={(e) => (e.target as HTMLInputElement).select()}
              style={{ border: `1px solid ${cardBorder}`, borderRadius: "6px", padding: "0.3rem 0.5rem", fontSize: "0.72rem", fontFamily: "monospace", background: cardBg, color: fg, width: "240px" }}
              data-testid="input-print-share-url"
            />
            <button
              onClick={() => { navigator.clipboard.writeText(shareUrl).then(() => { setShareCopied(true); setTimeout(() => setShareCopied(false), 2000); }); }}
              style={btnBase} data-testid="button-copy-print-share-url"
            >
              {shareCopied ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
              {shareCopied ? "Copied!" : "Copy"}
            </button>
          </div>
        ) : showShareForm ? (
          <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
              <input
                type={sharePasswordVisible ? "text" : "password"}
                placeholder="Password (optional)"
                value={sharePassword}
                onChange={(e) => setSharePassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleCreateShareLink(); }}
                style={{ border: `1px solid ${cardBorder}`, borderRadius: "6px", padding: "0.3rem 1.8rem 0.3rem 0.5rem", fontSize: "0.75rem", background: cardBg, color: fg, width: "160px" }}
                data-testid="input-print-share-password"
              />
              <button
                onClick={() => setSharePasswordVisible(v => !v)}
                style={{ position: "absolute", right: "0.3rem", background: "none", border: "none", cursor: "pointer", color: mutedColor, padding: 0 }}
                data-testid="button-print-toggle-password"
              >
                {sharePasswordVisible ? <EyeOff size={12} /> : <Eye size={12} />}
              </button>
            </div>
            {shareError && <span style={{ fontSize: "0.7rem", color: "#ef4444" }}>{shareError}</span>}
            <button
              onClick={handleCreateShareLink} disabled={shareCreating}
              style={{ ...btnBase, background: GREEN, border: "none", color: "#fff", fontWeight: 600 }}
              data-testid="button-create-print-share-link"
            >
              {shareCreating ? <Loader2 size={12} /> : <Share2 size={12} />}
              {shareCreating ? "..." : "Create Link"}
            </button>
            <button onClick={() => { setShowShareForm(false); setShareError(null); }} style={btnBase} data-testid="button-cancel-print-share">
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => { setShowShareForm(true); setShareUrl(null); setSharePassword(""); setSharePasswordVisible(false); setShareError(null); }}
            style={btnBase} data-testid="button-print-share"
          >
            <Share2 size={13} />Share
          </button>
        )}
        <button onClick={() => setDark(d => !d)} style={btnBase} data-testid="button-toggle-dark">
          {dark ? <Sun size={13} /> : <Moon size={13} />}
          {dark ? "Light" : "Dark"}
        </button>
        <button
          onClick={() => window.print()}
          style={{ background: GREEN, border: "none", borderRadius: "6px", padding: "0.35rem 0.9rem", cursor: "pointer", color: "#fff", display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8rem", fontWeight: 600 }}
          data-testid="button-print"
        >
          <Printer size={13} />Print / Save PDF
        </button>
        <ExportMenu
          label="Cloud"
          getContent={async () => {
            const { captureCurrentPageAsHtml, utf8ToBase64 } = await import("@/components/ExportMenu");
            const html = captureCurrentPageAsHtml();
            return { content: utf8ToBase64(html), filename: `EdenRadar_Pipeline_Brief_${new Date().toISOString().slice(0, 10)}.html`, fileType: "html" };
          }}
        />
      </div>

      <div style={{ maxWidth: "760px", margin: "0 auto", padding: "3rem 2rem 4rem" }}>
        {/* Wordmark */}
        <div style={{ marginBottom: "0.25rem" }}>
          <div style={{ fontSize: "1.25rem", fontWeight: 800, letterSpacing: "-0.02em" }}>
            <span style={{ color: headingColor }}>Eden</span>
            <span style={{ color: GREEN }}>Radar</span>
          </div>
          <div style={{ fontSize: "0.68rem", color: mutedColor, marginTop: "2px", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            Pipeline Intelligence Brief
          </div>
        </div>

        {/* Pipeline identity card */}
        <div className="pbp-card" style={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: "10px", padding: "1.5rem 2rem", marginTop: "2rem", marginBottom: "2rem" }}>
          <div className="pbp-muted" style={{ fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.1em", color: mutedColor, marginBottom: "0.35rem" }}>Pipeline</div>
          <div className="pbp-heading" style={{ fontSize: "1.35rem", fontWeight: 700, color: headingColor, lineHeight: 1.25 }}>{data.pipelineName}</div>
          <div className="pbp-muted" style={{ marginTop: "0.5rem", fontSize: "0.82rem", color: mutedColor }}>
            {data.assetCount} asset{data.assetCount !== 1 ? "s" : ""}&nbsp;&middot;&nbsp;Generated {data.generatedAt ? formatDate(data.generatedAt) : today}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {data.strategicThesis && (
            <div className="pbp-card print-para" style={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: "8px", padding: "1.1rem 1.4rem" }}>
              <div className="pbp-heading" style={sectionLabel}>Strategic Thesis</div>
              <p className="pbp-body" style={{ margin: 0, fontSize: "0.875rem", lineHeight: 1.7, color: fg }}>{data.strategicThesis}</p>
            </div>
          )}

          {data.bdStatusOverview && (
            <div className="pbp-card print-para" style={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: "8px", padding: "1.1rem 1.4rem" }}>
              <div className="pbp-heading" style={sectionLabel}>BD Status</div>
              <p className="pbp-body" style={{ margin: 0, fontSize: "0.875rem", lineHeight: 1.7, color: fg }}>{data.bdStatusOverview}</p>
            </div>
          )}

          {data.assets && data.assets.length > 0 && (
            <div>
              <div className="pbp-heading" style={{ ...sectionLabel, marginBottom: "0.75rem" }}>Asset Roster</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
                {data.assets.map((asset, i) => (
                  <PrintAssetCard
                    key={asset.id}
                    asset={asset}
                    index={i}
                    cardBg={cardBg}
                    cardBorder={cardBorder}
                    headingColor={headingColor}
                    mutedColor={mutedColor}
                    fg={fg}
                    dark={dark}
                  />
                ))}
              </div>
            </div>
          )}

          {data.standaloneSignals && data.standaloneSignals.length > 0 && (
            <div className="pbp-card print-para" style={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: "8px", padding: "1.1rem 1.4rem" }}>
              <div className="pbp-heading" style={sectionLabel}>Unlinked Signals</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", marginTop: "0.25rem" }}>
                {data.standaloneSignals.map((s, i) => (
                  <PrintSignalRow key={i} signal={s} mutedColor={mutedColor} dark={dark} cardBorder={cardBorder} />
                ))}
              </div>
            </div>
          )}

          {data.strategicAssessment && (
            <div className="pbp-card print-para" style={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: "8px", padding: "1.1rem 1.4rem" }}>
              <div className="pbp-heading" style={sectionLabel}>Strategic Assessment</div>
              <p className="pbp-body" style={{ margin: 0, fontSize: "0.875rem", lineHeight: 1.7, color: fg }}>{data.strategicAssessment}</p>
            </div>
          )}
        </div>

        <PrintFooter date={today} right={`${data.pipelineName} Pipeline Brief`} />
      </div>
    </div>
  );
}

function PrintAssetCard({ asset, index, cardBg, cardBorder, headingColor, mutedColor, fg, dark }: {
  asset: BriefAsset; index: number;
  cardBg: string; cardBorder: string; headingColor: string; mutedColor: string; fg: string; dark: boolean;
}) {
  const meta = [
    asset.target !== "—" && `Target: ${asset.target}`,
    asset.modality !== "—" && asset.modality,
    asset.indication !== "—" && asset.indication,
    asset.institution !== "—" && asset.institution,
  ].filter(Boolean).join(" · ");

  return (
    <div className="pbp-card print-para" style={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: "8px", padding: "1rem 1.25rem" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem" }}>
        <span style={{ fontSize: "0.7rem", fontWeight: 700, color: mutedColor, minWidth: "1.25rem", textAlign: "right", marginTop: "0.15rem", flexShrink: 0 }}>
          {index + 1}.
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.4rem", marginBottom: "0.3rem" }}>
            <span style={{ fontWeight: 700, fontSize: "0.9rem", color: fg }}>{asset.name}</span>
            {asset.stage && asset.stage !== "—" && (
              <span style={{ fontSize: "0.65rem", padding: "0.15rem 0.5rem", borderRadius: "999px", background: `${headingColor}18`, border: `1px solid ${headingColor}30`, color: headingColor, fontWeight: 600 }}>
                {asset.stage}
              </span>
            )}
            {asset.status && (
              <span style={{ fontSize: "0.65rem", padding: "0.15rem 0.5rem", borderRadius: "999px", background: dark ? "#ffffff0f" : "#f1f5f9", border: `1px solid ${cardBorder}`, color: mutedColor, fontWeight: 600 }}>
                {asset.status.replace(/_/g, " ")}
              </span>
            )}
          </div>
          {meta && (
            <p style={{ fontSize: "0.78rem", color: mutedColor, margin: "0 0 0.5rem" }}>{meta}</p>
          )}
          {asset.insight && (
            <p style={{ fontSize: "0.8rem", color: fg, lineHeight: 1.65, margin: "0 0 0.5rem", paddingLeft: "0.65rem", borderLeft: `2px solid ${headingColor}50`, fontStyle: "italic" }}>
              {asset.insight}
            </p>
          )}
          {asset.signals.length > 0 && (
            <div style={{ borderTop: `1px solid ${cardBorder}60`, paddingTop: "0.5rem", marginTop: "0.25rem" }}>
              <p style={{ fontSize: "0.65rem", fontWeight: 600, color: mutedColor, margin: "0 0 0.35rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Supporting Evidence
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                {asset.signals.map((s, i) => (
                  <PrintSignalRow key={i} signal={s} mutedColor={mutedColor} dark={dark} cardBorder={cardBorder} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PrintSignalRow({ signal, mutedColor, dark, cardBorder }: {
  signal: { type: string; title: string; year: string };
  mutedColor: string; dark: boolean; cardBorder: string;
}) {
  const c = SIGNAL_COLORS[signal.type];
  const badgeBg = c ? c.bg : (dark ? "#ffffff12" : "#f1f5f9");
  const badgeBorder = c ? c.border : (dark ? "#ffffff20" : cardBorder);
  const badgeColor = c ? c.color : mutedColor;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.78rem" }}>
      <span style={{ padding: "0.1rem 0.4rem", borderRadius: "4px", background: badgeBg, border: `1px solid ${badgeBorder}`, color: badgeColor, fontSize: "0.65rem", fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0 }}>
        {signal.type}
      </span>
      <span style={{ color: mutedColor, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{signal.title}</span>
      <span style={{ color: mutedColor, opacity: 0.6, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{signal.year}</span>
    </div>
  );
}
