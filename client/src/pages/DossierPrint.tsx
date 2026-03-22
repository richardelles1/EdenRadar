import { useState, useEffect } from "react";
import type { ReactNode } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ScoreBreakdownCard } from "@/components/ScoreBreakdownCard";
import {
  ArrowLeft, Printer, Key, ExternalLink, BookOpen,
  Lightbulb, Sparkles, FlaskConical, Beaker, GraduationCap, Swords,
} from "lucide-react";
import type { ScoredAsset, DossierPayload } from "@/lib/types";
import {
  GREEN, BG_DARK,
  PrintRadar, PrintLogo, PrintFooter, SectionHeader, DarkPill, CoverBottomStrip,
  PRINT_STYLES, formatDate, parseMarkdown, val,
} from "@/lib/print-shared";

type IntelligenceData = {
  assetRecord: {
    id: number;
    fingerprint: string;
    assetName: string;
    target: string;
    modality: string;
    indication: string;
    developmentStage: string;
    institution: string;
    summary: string;
    sourceUrl: string | null;
  } | null;
  enriched: {
    mechanismOfAction: string | null;
    abstract: string | null;
    categories: string[] | null;
    completenessScore: number | null;
    innovationClaim: string | null;
    ipType: string | null;
    unmetNeed: string | null;
    comparableDrugs: string | null;
    licensingReadiness: string | null;
    patentStatus: string | null;
    licensingStatus: string | null;
    inventors: string[] | null;
    contactEmail: string | null;
  } | null;
  competingAssets: Array<{
    fingerprint: string;
    assetName: string;
    target: string;
    modality: string;
    indication: string;
    developmentStage: string;
    institution: string;
    completenessScore: number | null;
  }>;
  literature: Array<{
    title: string;
    url: string;
    date: string;
    source_type: string;
  }>;
};

function sourceLabel(st: string): string {
  const map: Record<string, string> = {
    paper: "PubMed", preprint: "bioRxiv", clinical_trial: "ClinicalTrials.gov",
    patent: "Patent", tech_transfer: "TTO", researcher: "Lab Published",
    grant: "Grant", dataset: "Dataset",
  };
  return map[st] ?? st;
}

function PrintSection({ children }: { children: ReactNode }) {
  return (
    <div className="print-section" style={{ background: "#ffffff", padding: "48px 56px 40px", minHeight: "60vh" }}>
      {children}
    </div>
  );
}

export default function DossierPrint() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const [asset, setAsset] = useState<ScoredAsset | null>(null);
  const [dossier, setDossier] = useState<DossierPayload | null>(null);

  const fingerprint = (typeof window !== "undefined"
    ? sessionStorage.getItem(`asset-fingerprint-${id}`)
    : null) ?? id;

  const { data: intelligence } = useQuery<IntelligenceData>({
    queryKey: ["/api/assets", fingerprint, "intelligence"],
    queryFn: () =>
      fetch(`/api/assets/${encodeURIComponent(fingerprint ?? "")}/intelligence`).then((r) => {
        if (!r.ok) throw new Error("Failed");
        return r.json();
      }),
    enabled: !!fingerprint,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    const stored = sessionStorage.getItem(`asset-${id}`);
    if (stored) { try { setAsset(JSON.parse(stored)); } catch {} }
    const storedDossier = sessionStorage.getItem(`dossier-${id}`);
    if (storedDossier) { try { setDossier(JSON.parse(storedDossier)); } catch {} }
  }, [id]);

  useEffect(() => {
    if (!intelligence?.assetRecord || asset) return;
    const rec = intelligence.assetRecord;
    const enr = intelligence.enriched;
    setAsset({
      id: rec.fingerprint ?? String(rec.id),
      asset_name: rec.assetName ?? "Unnamed Asset",
      target: rec.target ?? "unknown",
      modality: rec.modality ?? "unknown",
      indication: rec.indication ?? "unknown",
      development_stage: rec.developmentStage ?? "unknown",
      owner_name: rec.institution ?? "unknown",
      owner_type: "university",
      institution: rec.institution ?? "unknown",
      patent_status: enr?.patentStatus ?? "unknown",
      licensing_status: enr?.licensingStatus ?? "unknown",
      summary: rec.summary ?? "",
      why_it_matters: "",
      evidence_count: 0,
      source_types: ["tech_transfer"],
      source_urls: rec.sourceUrl ? [rec.sourceUrl] : [],
      latest_signal_date: "",
      score: 0,
      score_breakdown: { novelty: 0, freshness: 0, readiness: 0, licensability: 0, fit: 0, competition: 0, total: 0 },
      matching_tags: [],
      confidence: "low",
      signals: [],
    });
  }, [intelligence, asset]);

  const enriched = intelligence?.enriched ?? null;
  const assetName = asset?.asset_name && asset.asset_name !== "unknown" ? asset.asset_name : "Asset Dossier";
  const institution = val(asset?.institution) ?? val(asset?.owner_name);
  const indication = val(asset?.indication);
  const target = val(asset?.target);
  const modality = val(asset?.modality);
  const stage = val(asset?.development_stage);
  const patentStatus = val(enriched?.patentStatus) ?? val(asset?.patent_status);
  const licensingStatus = val(enriched?.licensingStatus) ?? val(asset?.licensing_status);
  const licensingAvailable = licensingStatus?.toLowerCase().includes("available") ?? false;
  const contactEmail = val(enriched?.contactEmail) ?? val(asset?.contact_office);
  const scoredCount = asset?.score_breakdown?.scored_dimensions?.length ?? 0;
  const coverage = asset?.score_breakdown?.signal_coverage ?? 0;
  const dateStr = formatDate(new Date().toISOString());
  const generatedStr = dossier ? formatDate(dossier.generated_at) : null;

  const hasSciContent = !!(
    val(enriched?.mechanismOfAction) || val(enriched?.abstract) || val(asset?.summary) ||
    (enriched?.inventors?.length ?? 0) > 0 || val(enriched?.ipType) || val(enriched?.licensingReadiness)
  );
  const hasCommercialContent = !!(
    val(enriched?.innovationClaim) || val(asset?.why_it_matters) ||
    val(enriched?.unmetNeed) || val(enriched?.comparableDrugs)
  );
  const footerRight = scoredCount > 0
    ? `Scored on ${scoredCount} of 6 signal dimensions`
    : `Signal coverage: ${Math.round(coverage)}%`;

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
            onClick={() => setLocation(`/asset/${id}`)}
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

        <PrintLogo subtitle={`EDEN Intelligence Platform · ${dateStr}`} />

        {/* Center content */}
        <div style={{
          position: "relative", zIndex: 10, flex: 1,
          display: "flex", flexDirection: "column", justifyContent: "center",
          padding: "40px 80px",
        }}>
          <div style={{
            display: "inline-flex", alignItems: "center",
            padding: "4px 12px", borderRadius: 20,
            background: `${GREEN}22`, border: `1px solid ${GREEN}44`,
            color: GREEN, fontSize: 11, fontWeight: 700,
            letterSpacing: "0.08em", textTransform: "uppercase",
            marginBottom: 20, width: "fit-content",
          }}>
            Asset Intelligence Dossier
          </div>

          <h1 style={{
            fontSize: "clamp(28px, 5vw, 46px)", fontWeight: 800,
            color: "#ffffff", lineHeight: 1.15, margin: 0, marginBottom: 12,
            letterSpacing: "-0.02em", maxWidth: 740,
          }}>
            {assetName}
          </h1>

          {institution && (
            <p style={{ fontSize: 16, color: "rgba(255,255,255,0.55)", marginBottom: 28, fontWeight: 500 }}>
              {institution}
            </p>
          )}

          {/* Identifier pills — all non-unknown values */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 32 }}>
            {indication && <DarkPill label={indication} />}
            {target && target !== indication && <DarkPill label={`Target: ${target}`} />}
            {modality && <DarkPill label={modality} />}
            {stage && <DarkPill label={stage} />}
            {patentStatus && <DarkPill label={`Patent: ${patentStatus}`} />}
            {licensingStatus && !licensingAvailable && <DarkPill label={`Licensing: ${licensingStatus}`} />}
            {licensingAvailable && (
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                padding: "4px 12px", borderRadius: 6,
                background: `${GREEN}30`, border: `1px solid ${GREEN}70`,
                color: GREEN, fontSize: 12, fontWeight: 700,
                whiteSpace: "nowrap",
              }}>
                <Key style={{ width: 11, height: 11 }} />
                Available for Licensing
              </span>
            )}
          </div>

          {scoredCount > 0 && (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>
              {scoredCount} of 6 signal dimensions scored · {Math.round(coverage)}% signal coverage
            </div>
          )}
        </div>

        <CoverBottomStrip>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {asset?.source_types?.map((st) => (
              <span key={st} style={{
                fontSize: 10, padding: "3px 8px", borderRadius: 4,
                background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)",
                color: "rgba(255,255,255,0.55)", fontWeight: 600, textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}>
                {sourceLabel(st)}
              </span>
            ))}
            {(asset?.evidence_count ?? 0) > 0 && (
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.30)" }}>
                {asset!.evidence_count} signal{asset!.evidence_count !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          {contactEmail && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.30)", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>TTO Contact</div>
              <span style={{ fontSize: 12, color: GREEN, fontWeight: 600 }}>{contactEmail}</span>
            </div>
          )}
        </CoverBottomStrip>
      </div>

      {/* ── PAGE 2: SCIENTIFIC OVERVIEW ── */}
      {hasSciContent && (
        <PrintSection>
          <SectionHeader icon={BookOpen} title="Scientific Overview" />

          {val(enriched?.mechanismOfAction) && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Mechanism of Action</div>
              <p style={{ fontSize: 14, color: "#111", lineHeight: 1.65, margin: 0 }}>{enriched!.mechanismOfAction}</p>
            </div>
          )}

          {(val(enriched?.abstract) || val(asset?.summary)) && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                {val(enriched?.abstract) ? "Abstract" : "Summary"}
              </div>
              <p style={{ fontSize: 13, color: "#374151", lineHeight: 1.7, margin: 0 }}>
                {val(enriched?.abstract) ?? val(asset?.summary)}
              </p>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20, marginBottom: 24 }}>
            {val(enriched?.ipType) && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>IP Type</div>
                <div style={{ fontSize: 13, color: "#111", fontWeight: 600 }}>{enriched!.ipType}</div>
              </div>
            )}
            {val(enriched?.licensingReadiness) && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Licensing Readiness</div>
                <div style={{ fontSize: 13, color: "#111", fontWeight: 600 }}>{enriched!.licensingReadiness}</div>
              </div>
            )}
            {patentStatus && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Patent Status</div>
                <div style={{ fontSize: 13, color: "#111", fontWeight: 600 }}>{patentStatus}</div>
              </div>
            )}
          </div>

          {(enriched?.inventors?.length ?? 0) > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Inventors</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {enriched!.inventors!.map((inv, i) => (
                  <span key={i} style={{
                    fontSize: 12, padding: "3px 10px", borderRadius: 4,
                    background: "#f3f4f6", border: "1px solid #e5e7eb", color: "#374151",
                  }}>{inv}</span>
                ))}
              </div>
            </div>
          )}

          {(asset?.source_urls?.length ?? 0) > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Source References</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {asset!.source_urls!.slice(0, 3).map((url, i) => (
                  <a key={i} href={url} style={{ fontSize: 12, color: "#2d6a45", wordBreak: "break-all" }}>
                    <ExternalLink style={{ width: 11, height: 11, display: "inline", marginRight: 4 }} />
                    {url}
                  </a>
                ))}
              </div>
            </div>
          )}

          <PrintFooter date={dateStr} right={footerRight} />
        </PrintSection>
      )}

      {/* ── PAGE 3: COMMERCIAL INTELLIGENCE ── */}
      {hasCommercialContent && (
        <PrintSection>
          <SectionHeader icon={Sparkles} title="Commercial Intelligence" />

          {val(enriched?.innovationClaim) && (
            <div style={{ marginBottom: 24, padding: "16px 20px", borderRadius: 8, background: "#fffbeb", border: "1px solid #fde68a" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <Lightbulb style={{ width: 14, height: 14, color: "#d97706" }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: "#92400e", textTransform: "uppercase", letterSpacing: "0.06em" }}>Innovation Claim</span>
              </div>
              <p style={{ fontSize: 13, color: "#374151", lineHeight: 1.65, margin: 0 }}>{enriched!.innovationClaim}</p>
            </div>
          )}

          {val(asset?.why_it_matters) && (
            <div style={{ marginBottom: 24, padding: "16px 20px", borderRadius: 8, background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <Sparkles style={{ width: 14, height: 14, color: "#16a34a" }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: "#14532d", textTransform: "uppercase", letterSpacing: "0.06em" }}>Commercial Opportunity Signal</span>
              </div>
              <p style={{ fontSize: 13, color: "#374151", lineHeight: 1.65, margin: 0, fontStyle: "italic" }}>
                "{asset!.why_it_matters}"
              </p>
            </div>
          )}

          {val(enriched?.unmetNeed) && (
            <div style={{ marginBottom: 24, padding: "16px 20px", borderRadius: 8, background: "#fff1f2", border: "1px solid #fecdd3" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <FlaskConical style={{ width: 14, height: 14, color: "#e11d48" }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: "#881337", textTransform: "uppercase", letterSpacing: "0.06em" }}>Unmet Need</span>
              </div>
              <p style={{ fontSize: 13, color: "#374151", lineHeight: 1.65, margin: 0 }}>{enriched!.unmetNeed}</p>
            </div>
          )}

          {val(enriched?.comparableDrugs) && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <Beaker style={{ width: 14, height: 14, color: "#6b7280" }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em" }}>Comparable Assets</span>
              </div>
              <p style={{ fontSize: 13, color: "#374151", lineHeight: 1.65, margin: 0 }}>{enriched!.comparableDrugs}</p>
            </div>
          )}

          <PrintFooter date={dateStr} right={footerRight} />
        </PrintSection>
      )}

      {/* ── PAGE 4: EDEN ANALYSIS ── */}
      <PrintSection>
        <SectionHeader icon={BookOpen} title="EDEN Analysis" />

        {dossier ? (
          <>
            {generatedStr && (
              <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 20 }}>
                Generated {generatedStr}
              </div>
            )}
            <div style={{ fontSize: 13.5, color: "#374151", lineHeight: 1.8 }}>
              {dossier.narrative.split(/\n{2,}/).filter(Boolean).map((p, i) => (
                <p key={i} style={{ marginBottom: 16 }}>{parseMarkdown(p)}</p>
              ))}
            </div>
          </>
        ) : (
          <div style={{ padding: "32px 24px", borderRadius: 10, textAlign: "center", background: "#f9fafb", border: "2px dashed #d1d5db" }}>
            <BookOpen style={{ width: 32, height: 32, color: "#d1d5db", margin: "0 auto 12px" }} />
            <p style={{ fontSize: 14, fontWeight: 600, color: "#374151", marginBottom: 8 }}>
              EDEN Analysis Not Yet Generated
            </p>
            <p style={{ fontSize: 13, color: "#9ca3af", lineHeight: 1.6 }}>
              Return to the asset dossier page and click "Generate Dossier" to produce an
              EDEN-powered analysis before printing.
            </p>
          </div>
        )}

        <PrintFooter date={dateStr} right={footerRight} />
      </PrintSection>

      {/* ── PAGE 5: SIGNAL PROFILE & EVIDENCE ── */}
      <PrintSection>
        <SectionHeader icon={Sparkles} title="Signal Profile & Evidence" />

        {asset?.score_breakdown && (
          <div style={{ marginBottom: 32 }}>
            <ScoreBreakdownCard breakdown={asset.score_breakdown} />
          </div>
        )}

        {(intelligence?.literature?.length ?? 0) > 0 && (
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <GraduationCap style={{ width: 14, height: 14, color: "#6b7280" }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Supporting Literature ({intelligence!.literature.length})
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {intelligence!.literature.map((lit, i) => (
                <div key={i} style={{
                  display: "flex", gap: 12, padding: "10px 14px", borderRadius: 6,
                  background: "#f9fafb", border: "1px solid #e5e7eb", alignItems: "flex-start",
                }}>
                  <span style={{
                    fontSize: 10, padding: "2px 7px", borderRadius: 3,
                    background: "#e5e7eb", color: "#374151", fontWeight: 600,
                    textTransform: "uppercase", flexShrink: 0, marginTop: 2,
                  }}>
                    {sourceLabel(lit.source_type)}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: "#111", margin: 0, lineHeight: 1.4 }}>{lit.title}</p>
                    {lit.date && <p style={{ fontSize: 11, color: "#9ca3af", margin: "4px 0 0" }}>{lit.date}</p>}
                  </div>
                  {lit.url && (
                    <a href={lit.url} style={{ fontSize: 11, color: "#2d6a45", flexShrink: 0, marginTop: 2 }}>
                      <ExternalLink style={{ width: 12, height: 12 }} />
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {(intelligence?.competingAssets?.length ?? 0) > 0 && (
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Swords style={{ width: 14, height: 14, color: "#6b7280" }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Competing Assets ({intelligence!.competingAssets.length})
              </span>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#f3f4f6" }}>
                  {["Asset", "Target", "Modality", "Stage", "Institution"].map((h) => (
                    <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #e5e7eb" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {intelligence!.competingAssets.map((comp, i) => (
                  <tr key={comp.fingerprint} style={{ background: i % 2 === 0 ? "#fff" : "#f9fafb" }}>
                    <td style={{ padding: "8px 10px", fontWeight: 600, color: "#111", borderBottom: "1px solid #f3f4f6" }}>{comp.assetName}</td>
                    <td style={{ padding: "8px 10px", color: "#374151", borderBottom: "1px solid #f3f4f6" }}>{comp.target !== "unknown" ? comp.target : "—"}</td>
                    <td style={{ padding: "8px 10px", color: "#374151", borderBottom: "1px solid #f3f4f6" }}>{comp.modality !== "unknown" ? comp.modality : "—"}</td>
                    <td style={{ padding: "8px 10px", color: "#374151", borderBottom: "1px solid #f3f4f6" }}>{comp.developmentStage !== "unknown" ? comp.developmentStage : "—"}</td>
                    <td style={{ padding: "8px 10px", color: "#374151", borderBottom: "1px solid #f3f4f6" }}>{comp.institution !== "unknown" ? comp.institution : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <PrintFooter date={dateStr} right={footerRight} />
      </PrintSection>
    </div>
  );
}
