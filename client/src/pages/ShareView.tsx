import { useState } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Lock, Clock, ExternalLink, AlertTriangle, FlaskConical, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

const GREEN = "#22c55e";

type ShareApiError = Error & { status?: number; passwordRequired?: boolean };

function isShareApiError(err: unknown): err is ShareApiError {
  return err instanceof Error;
}

type ShareResponse = {
  type: "dossier" | "pipeline_brief";
  entityId: string | null;
  payload: unknown;
  expiresAt: string;
  createdAt: string;
};

type DossierPayload = {
  assetName: string;
  target: string;
  modality: string;
  developmentStage: string;
  institution: string;
  indication: string;
  narrative: string;
  score?: number;
  licensingStatus?: string;
  generated_at: string;
};

type BriefPayload = {
  brief: string;
  pipelineName: string;
  assetCount: number;
};

type Section = { heading: string | null; lines: string[] };

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
      const body = colonInlineMatch[2].trim();
      const full = restLines ? `${body}\n${restLines}` : body;
      sections.push({ heading: colonInlineMatch[1], lines: [full] });
    } else if (firstLine.endsWith(":") && firstLine.length < 70) {
      sections.push({ heading: firstLine.replace(/:$/, ""), lines: restLines ? [restLines] : [] });
    } else {
      sections.push({ heading: null, lines: [trimmed] });
    }
  }
  return sections;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function formatExpiry(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / 86400000);
  if (diffDays <= 0) return "Expired";
  if (diffDays === 1) return "Expires tomorrow";
  if (diffDays <= 7) return `Expires in ${diffDays} days`;
  return `Expires ${formatDate(iso)}`;
}

function EdenLogo({ headingColor }: { headingColor: string }) {
  return (
    <div>
      <div style={{ fontSize: "1.25rem", fontWeight: 800, letterSpacing: "-0.02em" }}>
        <span style={{ color: headingColor }}>Eden</span>
        <span style={{ color: GREEN }}>Radar</span>
      </div>
      <div style={{ fontSize: "0.65rem", color: "#6b9e82", marginTop: "2px", letterSpacing: "0.08em", textTransform: "uppercase" }}>
        AI-Powered Biotech Asset Intelligence
      </div>
    </div>
  );
}

function PasswordGate({ onSubmit }: { onSubmit: (password: string) => void }) {
  const [pw, setPw] = useState("");
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8f9fa", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ maxWidth: "380px", width: "100%", padding: "2rem", background: "#fff", border: "1px solid #d1e8db", borderRadius: "12px", textAlign: "center" }}>
        <Lock size={32} style={{ color: GREEN, margin: "0 auto 1rem" }} />
        <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#1a2b24", marginBottom: "0.5rem" }}>Password Protected</h2>
        <p style={{ fontSize: "0.875rem", color: "#5a8a72", marginBottom: "1.25rem" }}>This link requires a password to view.</p>
        <input
          type="password"
          value={pw}
          onChange={e => setPw(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && pw) onSubmit(pw); }}
          placeholder="Enter password"
          style={{ width: "100%", padding: "0.6rem 0.75rem", border: "1px solid #d1e8db", borderRadius: "6px", fontSize: "0.875rem", outline: "none", boxSizing: "border-box", marginBottom: "0.75rem" }}
          data-testid="input-share-password"
        />
        <button
          onClick={() => pw && onSubmit(pw)}
          style={{ width: "100%", padding: "0.65rem", background: GREEN, border: "none", borderRadius: "6px", color: "#fff", fontWeight: 600, fontSize: "0.875rem", cursor: "pointer" }}
          data-testid="button-share-password-submit"
        >
          View Content
        </button>
      </div>
    </div>
  );
}

function DossierView({ payload, expiresAt, createdAt }: { payload: DossierPayload; expiresAt: string; createdAt: string }) {
  const sections = parseSections(payload.narrative ?? "");
  const headingColor = "#1a6b44";
  const mutedColor = "#5a8a72";
  const cardBorder = "#d1e8db";
  const fg = "#1a2b24";
  const cardBg = "#ffffff";
  const bg = "#f8f9fa";

  return (
    <div style={{ fontFamily: "'Open Sans', system-ui, sans-serif", background: bg, minHeight: "100vh", color: fg }}>
      <div style={{ maxWidth: "760px", margin: "0 auto", padding: "3rem 1.5rem 5rem" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", marginBottom: "2rem", flexWrap: "wrap" }}>
          <EdenLogo headingColor={headingColor} />
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.75rem", color: mutedColor }}>
            <Clock size={13} />
            {formatExpiry(expiresAt)}
          </div>
        </div>

        <div style={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: "10px", padding: "1.5rem 2rem", marginBottom: "1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
            <FlaskConical size={18} style={{ color: GREEN }} />
            <span style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.1em", color: mutedColor, fontWeight: 700 }}>Asset Intelligence Brief</span>
          </div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: fg, lineHeight: 1.2, margin: "0 0 0.5rem" }} data-testid="share-dossier-asset-name">
            {payload.assetName || "Unnamed Asset"}
          </h1>
          {payload.indication && <p style={{ fontSize: "0.9rem", color: mutedColor, margin: "0 0 1rem" }}>{payload.indication}</p>}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            {[
              { label: "Target", value: payload.target },
              { label: "Modality", value: payload.modality },
              { label: "Stage", value: payload.developmentStage },
              { label: "Institution", value: payload.institution },
              { label: "Licensing", value: payload.licensingStatus },
            ].filter(f => f.value && f.value !== "unknown").map(f => (
              <span key={f.label} style={{ fontSize: "0.75rem", padding: "0.25rem 0.625rem", background: "#e8f5ee", border: "1px solid #c3e0d0", borderRadius: "6px", color: headingColor, fontWeight: 600 }}>
                {f.label}: {f.value}
              </span>
            ))}
          </div>
          <div style={{ marginTop: "1rem", paddingTop: "0.75rem", borderTop: `1px solid ${cardBorder}`, fontSize: "0.75rem", color: mutedColor }}>
            Generated {formatDate(payload.generated_at)} &nbsp;·&nbsp; Shared via EdenRadar
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {sections.map((sec, i) => (
            <div key={i} style={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: "8px", padding: "1.1rem 1.4rem" }}>
              {sec.heading && (
                <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.1em", color: headingColor, fontWeight: 700, marginBottom: "0.5rem" }}>
                  {sec.heading}
                </div>
              )}
              {sec.lines.map((line, j) => (
                <p key={j} style={{ margin: 0, marginTop: j > 0 ? "0.5rem" : 0, fontSize: "0.875rem", lineHeight: 1.75, color: fg }}>
                  {line}
                </p>
              ))}
            </div>
          ))}
        </div>

        <SignUpCta />
      </div>
    </div>
  );
}

function BriefView({ payload, expiresAt }: { payload: BriefPayload; expiresAt: string }) {
  const sections = parseSections(payload.brief ?? "");
  const headingColor = "#1a6b44";
  const mutedColor = "#5a8a72";
  const cardBorder = "#d1e8db";
  const fg = "#1a2b24";
  const cardBg = "#ffffff";
  const bg = "#f8f9fa";

  return (
    <div style={{ fontFamily: "'Open Sans', system-ui, sans-serif", background: bg, minHeight: "100vh", color: fg }}>
      <div style={{ maxWidth: "760px", margin: "0 auto", padding: "3rem 1.5rem 5rem" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", marginBottom: "2rem", flexWrap: "wrap" }}>
          <EdenLogo headingColor={headingColor} />
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.75rem", color: mutedColor }}>
            <Clock size={13} />
            {formatExpiry(expiresAt)}
          </div>
        </div>

        <div style={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: "10px", padding: "1.5rem 2rem", marginBottom: "1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <FileText size={18} style={{ color: GREEN }} />
            <span style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.1em", color: mutedColor, fontWeight: 700 }}>Pipeline Intelligence Brief</span>
          </div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: fg, lineHeight: 1.2, margin: "0 0 0.5rem" }} data-testid="share-brief-pipeline-name">
            {payload.pipelineName}
          </h1>
          <p style={{ fontSize: "0.85rem", color: mutedColor, margin: 0 }}>
            {payload.assetCount} asset{payload.assetCount !== 1 ? "s" : ""} &nbsp;·&nbsp; Shared via EdenRadar
          </p>
          <div style={{ marginTop: "1rem", paddingTop: "0.75rem", borderTop: `1px solid ${cardBorder}`, fontSize: "0.75rem", color: mutedColor }}>
            {formatExpiry(expiresAt)}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {sections.map((sec, i) => (
            <div key={i} style={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: "8px", padding: "1.1rem 1.4rem" }}>
              {sec.heading && (
                <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.1em", color: headingColor, fontWeight: 700, marginBottom: "0.5rem" }}>
                  {sec.heading}
                </div>
              )}
              {sec.lines.map((line, j) => (
                <p key={j} style={{ margin: 0, marginTop: j > 0 ? "0.5rem" : 0, fontSize: "0.875rem", lineHeight: 1.75, color: fg }}>
                  {line}
                </p>
              ))}
            </div>
          ))}
        </div>

        <SignUpCta />
      </div>
    </div>
  );
}

function SignUpCta() {
  return (
    <div style={{ marginTop: "3rem", padding: "2rem", background: "#e8f5ee", border: "1px solid #c3e0d0", borderRadius: "12px", textAlign: "center" }}>
      <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "#1a6b44", fontWeight: 700, marginBottom: "0.5rem" }}>
        Powered by EdenRadar
      </div>
      <h3 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#1a2b24", margin: "0 0 0.5rem" }}>
        Discover more biotech assets like this
      </h3>
      <p style={{ fontSize: "0.875rem", color: "#5a8a72", margin: "0 0 1.25rem" }}>
        EdenRadar surfaces the most promising drug development opportunities from across academia and industry.
      </p>
      <a
        href="/"
        style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", padding: "0.65rem 1.5rem", background: GREEN, color: "#fff", borderRadius: "8px", fontWeight: 600, fontSize: "0.875rem", textDecoration: "none" }}
        data-testid="link-share-signup"
      >
        <ExternalLink size={14} />
        Explore EdenRadar
      </a>
    </div>
  );
}

export default function ShareView() {
  const { token } = useParams<{ token: string }>();
  const [password, setPassword] = useState<string | undefined>(undefined);
  const [pendingPassword, setPendingPassword] = useState<string | undefined>(undefined);

  const queryKey = ["/api/share", token, password];

  const { data, isLoading, error, isError } = useQuery<ShareResponse>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(`/api/share/${token}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(password !== undefined ? { password } : {}),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const apiErr = new Error(
          (body as { error?: string }).error ?? "Failed to load shared content"
        ) as ShareApiError;
        apiErr.status = res.status;
        apiErr.passwordRequired = (body as { passwordRequired?: boolean }).passwordRequired === true;
        throw apiErr;
      }
      return res.json();
    },
    retry: false,
    enabled: pendingPassword === password,
  });

  const apiError = isError && isShareApiError(error) ? error : null;
  const needsPassword = apiError?.passwordRequired === true;
  const wrongPassword = needsPassword && password !== undefined;
  const isExpired = apiError?.status === 410;
  const isNotFound = apiError?.status === 404;

  if (isLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8f9fa", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: "32px", height: "32px", border: `3px solid ${GREEN}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 1rem" }} />
          <p style={{ color: "#5a8a72", fontSize: "0.875rem" }}>Loading shared content...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  if (isExpired) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8f9fa", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ maxWidth: "420px", textAlign: "center", padding: "2rem" }}>
          <Clock size={40} style={{ color: "#5a8a72", margin: "0 auto 1rem" }} />
          <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#1a2b24", marginBottom: "0.5rem" }}>This link has expired</h2>
          <p style={{ color: "#5a8a72", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
            Shareable links are time-limited. Please ask the sender to generate a new link.
          </p>
          <a href="/" style={{ color: GREEN, fontWeight: 600, fontSize: "0.875rem", textDecoration: "none" }}>Visit EdenRadar →</a>
        </div>
      </div>
    );
  }

  if (isNotFound) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8f9fa", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ maxWidth: "420px", textAlign: "center", padding: "2rem" }}>
          <AlertTriangle size={40} style={{ color: "#f59e0b", margin: "0 auto 1rem" }} />
          <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#1a2b24", marginBottom: "0.5rem" }}>Link not found</h2>
          <p style={{ color: "#5a8a72", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
            This shared link does not exist. It may have been removed or the URL is incorrect.
          </p>
          <a href="/" style={{ color: GREEN, fontWeight: 600, fontSize: "0.875rem", textDecoration: "none" }}>Visit EdenRadar →</a>
        </div>
      </div>
    );
  }

  if (needsPassword) {
    return (
      <div>
        {wrongPassword && (
          <div style={{ position: "fixed", top: "1rem", left: "50%", transform: "translateX(-50%)", zIndex: 10, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "0.5rem 1rem", fontSize: "0.8rem", color: "#b91c1c" }}>
            Incorrect password — try again
          </div>
        )}
        <PasswordGate onSubmit={(pw) => { setPassword(pw); setPendingPassword(pw); }} />
      </div>
    );
  }

  if (!data) return null;

  if (data.type === "dossier") {
    return <DossierView payload={data.payload as DossierPayload} expiresAt={data.expiresAt} createdAt={data.createdAt} />;
  }

  if (data.type === "pipeline_brief") {
    return <BriefView payload={data.payload as BriefPayload} expiresAt={data.expiresAt} />;
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif" }}>
      <p style={{ color: "#5a8a72" }}>Unknown content type.</p>
    </div>
  );
}
