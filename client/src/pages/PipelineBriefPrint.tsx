import { useEffect, useState } from "react";
import { ArrowLeft, Moon, Printer, Sun } from "lucide-react";
import { PRINT_STYLES, PrintFooter, formatDate, GREEN, BG_DARK } from "@/lib/print-shared";

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

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("pipeline-brief-print");
      if (raw) setData(JSON.parse(raw));
    } catch {
    }
  }, []);

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
        display: "flex", gap: "0.5rem", alignItems: "center",
      }}>
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
