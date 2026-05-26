import React, { useState } from "react";
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

type BriefSignal = { type: string; title: string; year: string };
type BriefAsset = {
  id: number; name: string; target: string; modality: string; stage: string;
  indication: string; status: string | null; institution: string;
  insight: string | null; signals: BriefSignal[];
};
type BriefPayload = {
  brief: string;
  pipelineName: string;
  assetCount: number;
  generatedAt?: string;
  strategicThesis?: string;
  bdStatusOverview?: string;
  strategicAssessment?: string;
  assets?: BriefAsset[];
  standaloneSignals?: BriefSignal[];
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

const SIGNAL_COLORS: Record<string, { bg: string; border: string; color: string }> = {
  Patent: { bg: "rgba(217,119,6,0.1)", border: "rgba(217,119,6,0.3)", color: "#92400e" },
  "Clinical Trial": { bg: "rgba(20,184,166,0.1)", border: "rgba(20,184,166,0.3)", color: "#0f766e" },
  Paper: { bg: "rgba(124,58,237,0.1)", border: "rgba(124,58,237,0.3)", color: "#6d28d9" },
  Preprint: { bg: "rgba(124,58,237,0.1)", border: "rgba(124,58,237,0.3)", color: "#6d28d9" },
};

function ShareSignalRow({ signal, mutedColor, cardBorder }: { signal: BriefSignal; mutedColor: string; cardBorder: string }) {
  const c = SIGNAL_COLORS[signal.type];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.78rem" }}>
      <span style={{ padding: "0.1rem 0.4rem", borderRadius: "4px", background: c?.bg ?? "#f1f5f9", border: `1px solid ${c?.border ?? cardBorder}`, color: c?.color ?? mutedColor, fontSize: "0.65rem", fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0 }}>
        {signal.type}
      </span>
      <span style={{ color: mutedColor, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{signal.title}</span>
      <span style={{ color: mutedColor, opacity: 0.6, flexShrink: 0 }}>{signal.year}</span>
    </div>
  );
}

function BriefView({ payload, expiresAt }: { payload: BriefPayload; expiresAt: string }) {
  const isStructured = !!(payload.strategicThesis || payload.assets?.length);
  const sections = isStructured ? [] : parseSections(payload.brief ?? "");

  const headingColor = "#1a6b44";
  const mutedColor = "#5a8a72";
  const cardBorder = "#d1e8db";
  const fg = "#1a2b24";
  const cardBg = "#ffffff";
  const bg = "#f8f9fa";

  const sectionLabel: React.CSSProperties = {
    fontSize: "0.65rem", textTransform: "uppercase",
    letterSpacing: "0.1em", color: headingColor,
    fontWeight: 700, marginBottom: "0.5rem",
  };

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
          {isStructured ? (
            <>
              {payload.strategicThesis && (
                <div style={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: "8px", padding: "1.1rem 1.4rem" }}>
                  <div style={sectionLabel}>Strategic Thesis</div>
                  <p style={{ margin: 0, fontSize: "0.875rem", lineHeight: 1.75, color: fg }}>{payload.strategicThesis}</p>
                </div>
              )}
              {payload.bdStatusOverview && (
                <div style={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: "8px", padding: "1.1rem 1.4rem" }}>
                  <div style={sectionLabel}>BD Status</div>
                  <p style={{ margin: 0, fontSize: "0.875rem", lineHeight: 1.75, color: fg }}>{payload.bdStatusOverview}</p>
                </div>
              )}
              {payload.assets && payload.assets.length > 0 && (
                <div>
                  <div style={{ ...sectionLabel, marginBottom: "0.625rem" }}>Asset Roster</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    {payload.assets.map((asset, i) => {
                      const meta = [
                        asset.target !== "—" && `Target: ${asset.target}`,
                        asset.modality !== "—" && asset.modality,
                        asset.indication !== "—" && asset.indication,
                        asset.institution !== "—" && asset.institution,
                      ].filter(Boolean).join(" · ");
                      return (
                        <div key={asset.id} style={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: "8px", padding: "1rem 1.25rem" }}>
                          <div style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem" }}>
                            <span style={{ fontSize: "0.7rem", fontWeight: 700, color: mutedColor, minWidth: "1.25rem", textAlign: "right", marginTop: "0.15rem", flexShrink: 0 }}>{i + 1}.</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.4rem", marginBottom: "0.3rem" }}>
                                <span style={{ fontWeight: 700, fontSize: "0.9rem", color: fg }}>{asset.name}</span>
                                {asset.stage && asset.stage !== "—" && (
                                  <span style={{ fontSize: "0.65rem", padding: "0.15rem 0.5rem", borderRadius: "999px", background: `${headingColor}18`, border: `1px solid ${headingColor}30`, color: headingColor, fontWeight: 600 }}>{asset.stage}</span>
                                )}
                                {asset.status && (
                                  <span style={{ fontSize: "0.65rem", padding: "0.15rem 0.5rem", borderRadius: "999px", background: "#f1f5f9", border: `1px solid ${cardBorder}`, color: mutedColor, fontWeight: 600 }}>{asset.status.replace(/_/g, " ")}</span>
                                )}
                              </div>
                              {meta && <p style={{ fontSize: "0.78rem", color: mutedColor, margin: "0 0 0.5rem" }}>{meta}</p>}
                              {asset.insight && (
                                <p style={{ fontSize: "0.8rem", color: fg, lineHeight: 1.65, margin: "0 0 0.5rem", paddingLeft: "0.65rem", borderLeft: `2px solid ${headingColor}50`, fontStyle: "italic" }}>{asset.insight}</p>
                              )}
                              {asset.signals.length > 0 && (
                                <div style={{ borderTop: `1px solid ${cardBorder}60`, paddingTop: "0.5rem", marginTop: "0.25rem" }}>
                                  <p style={{ fontSize: "0.65rem", fontWeight: 600, color: mutedColor, margin: "0 0 0.35rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Supporting Evidence</p>
                                  <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                                    {asset.signals.map((s, j) => <ShareSignalRow key={j} signal={s} mutedColor={mutedColor} cardBorder={cardBorder} />)}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {payload.standaloneSignals && payload.standaloneSignals.length > 0 && (
                <div style={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: "8px", padding: "1.1rem 1.4rem" }}>
                  <div style={sectionLabel}>Unlinked Signals</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", marginTop: "0.25rem" }}>
                    {payload.standaloneSignals.map((s, i) => <ShareSignalRow key={i} signal={s} mutedColor={mutedColor} cardBorder={cardBorder} />)}
                  </div>
                </div>
              )}
              {payload.strategicAssessment && (
                <div style={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: "8px", padding: "1.1rem 1.4rem" }}>
                  <div style={sectionLabel}>Strategic Assessment</div>
                  <p style={{ margin: 0, fontSize: "0.875rem", lineHeight: 1.75, color: fg }}>{payload.strategicAssessment}</p>
                </div>
              )}
            </>
          ) : (
            sections.map((sec, i) => (
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
            ))
          )}
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
