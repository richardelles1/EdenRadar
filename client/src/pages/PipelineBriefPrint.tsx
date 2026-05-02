import { useEffect, useState } from "react";
import { ArrowLeft, Moon, Printer, Sun, Share2, Eye, EyeOff, Copy, Check, Lock, Loader2 } from "lucide-react";
import { PRINT_STYLES, PrintFooter, formatDate, GREEN, BG_DARK } from "@/lib/print-shared";
import { ExportMenu } from "@/components/ExportMenu";

type BriefData = {
  brief: string;
  pipelineName: string;
  assetCount: number;
};

type Section = {
  heading: string | null;
  lines: string[];
};

function parseSections(text: string): Section[] {
  const paragraphs = text.split(/\n{2,}/);
  const sections: Section[] = [];
  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;
    const firstLine = trimmed.split("\n")[0];
    const restLines = trimmed.split("\n").slice(1).join("\n").trim();

    const colonOnlyMatch = firstLine.match(/^([A-Z][A-Za-z\s/&(),-]{2,50}):\s*$/);
    const colonInlineMatch = firstLine.match(/^([A-Z][A-Za-z\s/&(),-]{2,50}):\s+(.+)$/);

    if (colonOnlyMatch) {
      sections.push({ heading: colonOnlyMatch[1], lines: restLines ? [restLines] : [] });
    } else if (colonInlineMatch) {
      const bodyFromFirstLine = colonInlineMatch[2].trim();
      const fullBody = restLines ? `${bodyFromFirstLine}\n${restLines}` : bodyFromFirstLine;
      sections.push({ heading: colonInlineMatch[1], lines: [fullBody] });
    } else if (firstLine.endsWith(":") && firstLine.length < 70) {
      sections.push({ heading: firstLine.replace(/:$/, ""), lines: restLines ? [restLines] : [] });
    } else {
      sections.push({ heading: null, lines: [trimmed] });
    }
  }
  return sections;
}

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
    } catch {
    }
  }, []);

  async function handleCreateShareLink() {
    if (!data) return;
    setShareCreating(true);
    setShareError(null);
    try {
      const payload = { brief: data.brief, pipelineName: data.pipelineName, assetCount: data.assetCount };
      const body: Record<string, unknown> = { type: "pipeline_brief", payload };
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
        No brief data found. Please generate a pipeline brief and click Print from the dialog.
      </div>
    );
  }

  const sections = parseSections(data.brief);
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

  return (
    <div
      className="pbp-root"
      style={{ fontFamily: "'Open Sans', sans-serif", background: bg, minHeight: "100vh", color: fg, transition: "background 0.2s, color 0.2s" }}
    >
      <style>{PRINT_STYLES}</style>
      <style>{PRINT_LIGHT_OVERRIDE}</style>

      <div className="no-print" style={{
        position: "fixed", top: "1rem", left: "1.25rem", zIndex: 100,
      }}>
        <button
          onClick={() => window.close()}
          style={btnBase}
          data-testid="button-back"
        >
          <ArrowLeft size={13} />
          Back
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
              readOnly
              value={shareUrl}
              onClick={(e) => (e.target as HTMLInputElement).select()}
              style={{
                border: `1px solid ${cardBorder}`, borderRadius: "6px", padding: "0.3rem 0.5rem",
                fontSize: "0.72rem", fontFamily: "monospace", background: cardBg, color: fg, width: "240px",
              }}
              data-testid="input-print-share-url"
            />
            <button
              onClick={() => {
                navigator.clipboard.writeText(shareUrl).then(() => {
                  setShareCopied(true);
                  setTimeout(() => setShareCopied(false), 2000);
                });
              }}
              style={btnBase}
              data-testid="button-copy-print-share-url"
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
                style={{
                  border: `1px solid ${cardBorder}`, borderRadius: "6px", padding: "0.3rem 1.8rem 0.3rem 0.5rem",
                  fontSize: "0.75rem", background: cardBg, color: fg, width: "160px",
                }}
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
              onClick={handleCreateShareLink}
              disabled={shareCreating}
              style={{ ...btnBase, background: GREEN, border: "none", color: "#fff", fontWeight: 600 }}
              data-testid="button-create-print-share-link"
            >
              {shareCreating ? <Loader2 size={12} /> : <Share2 size={12} />}
              {shareCreating ? "..." : "Create Link"}
            </button>
            <button
              onClick={() => { setShowShareForm(false); setShareError(null); }}
              style={btnBase}
              data-testid="button-cancel-print-share"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => { setShowShareForm(true); setShareUrl(null); setSharePassword(""); setSharePasswordVisible(false); setShareError(null); }}
            style={btnBase}
            data-testid="button-print-share"
          >
            <Share2 size={13} />
            Share
          </button>
        )}
        <button
          onClick={() => setDark(d => !d)}
          style={btnBase}
          data-testid="button-toggle-dark"
        >
          {dark ? <Sun size={13} /> : <Moon size={13} />}
          {dark ? "Light" : "Dark"}
        </button>
        <button
          onClick={() => window.print()}
          style={{
            background: GREEN, border: "none", borderRadius: "6px",
            padding: "0.35rem 0.9rem", cursor: "pointer", color: "#fff",
            display: "flex", alignItems: "center", gap: "0.4rem",
            fontSize: "0.8rem", fontWeight: 600,
          }}
          data-testid="button-print"
        >
          <Printer size={13} />
          Print / Save PDF
        </button>
        <ExportMenu
          label="Cloud"
          getContent={async () => {
            const { captureCurrentPageAsHtml, utf8ToBase64 } = await import("@/components/ExportMenu");
            const html = captureCurrentPageAsHtml();
            return {
              content: utf8ToBase64(html),
              filename: `EdenRadar_Pipeline_Brief_${new Date().toISOString().slice(0, 10)}.html`,
              fileType: "html",
            };
          }}
        />
      </div>

      <div style={{ maxWidth: "760px", margin: "0 auto", padding: "3rem 2rem 4rem" }}>
        <div style={{ marginBottom: "0.25rem" }}>
          <div style={{ fontSize: "1.25rem", fontWeight: 800, letterSpacing: "-0.02em" }}>
            <span style={{ color: headingColor }}>Eden</span>
            <span style={{ color: GREEN }}>Radar</span>
          </div>
          <div style={{ fontSize: "0.68rem", color: mutedColor, marginTop: "2px", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            Pipeline Intelligence Brief
          </div>
        </div>

        <div
          className="pbp-card"
          style={{
            background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: "10px",
            padding: "1.5rem 2rem", marginTop: "2rem", marginBottom: "2rem",
          }}
        >
          <div className="pbp-muted" style={{ fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.1em", color: mutedColor, marginBottom: "0.35rem" }}>
            Pipeline
          </div>
          <div className="pbp-heading" style={{ fontSize: "1.35rem", fontWeight: 700, color: headingColor, lineHeight: 1.25 }}>
            {data.pipelineName}
          </div>
          <div className="pbp-muted" style={{ marginTop: "0.5rem", fontSize: "0.82rem", color: mutedColor }}>
            {data.assetCount} asset{data.assetCount !== 1 ? "s" : ""} &nbsp;&middot;&nbsp; Generated {today}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {sections.map((sec, i) => (
            <div
              key={i}
              className="pbp-card print-para"
              style={{
                background: cardBg,
                border: `1px solid ${cardBorder}`,
                borderRadius: "8px",
                padding: "1.1rem 1.4rem",
              }}
            >
              {sec.heading && (
                <div
                  className="pbp-heading"
                  style={{
                    fontSize: "0.68rem", textTransform: "uppercase",
                    letterSpacing: "0.1em", color: headingColor,
                    fontWeight: 700, marginBottom: "0.5rem",
                  }}
                >
                  {sec.heading}
                </div>
              )}
              {sec.lines.map((line, j) => (
                <p key={j} className="pbp-body" style={{ margin: 0, marginTop: j > 0 ? "0.5rem" : 0, fontSize: "0.875rem", lineHeight: 1.7, color: fg }}>
                  {line}
                </p>
              ))}
            </div>
          ))}
        </div>

        <PrintFooter
          date={today}
          right={`${data.pipelineName} Pipeline Brief`}
        />
      </div>
    </div>
  );
}
