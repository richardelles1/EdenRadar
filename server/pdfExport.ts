import type { Browser } from "playwright";

const GREEN = "#3fb950";
const BG_DARK = "#0a0f0d";
const GREEN_TEXT = "#2d6a45";

let _browser: Browser | null = null;
let _launching: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (_browser?.isConnected()) return _browser;
  if (_launching) return _launching;
  _launching = (async () => {
    const { chromium } = await import("playwright");
    _browser = await chromium.launch({ headless: true });
    _browser.on("disconnected", () => { _browser = null; _launching = null; });
    _launching = null;
    return _browser!;
  })();
  return _launching;
}

function val(v: string | null | undefined): string | null {
  return v && v !== "unknown" && v.trim() !== "" ? v : null;
}

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function scoreColor(n: number): { bg: string; border: string; text: string } {
  if (n >= 75) return { bg: "#dcfce7", border: "#86efac", text: "#15803d" };
  if (n >= 55) return { bg: "#fef9c3", border: "#fde68a", text: "#b45309" };
  return { bg: "#fee2e2", border: "#fca5a5", text: "#dc2626" };
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  } catch { return iso; }
}

function sourceLabel(st: string): string {
  const map: Record<string, string> = {
    paper: "PubMed", preprint: "bioRxiv", clinical_trial: "ClinicalTrials.gov",
    patent: "Patent", tech_transfer: "TTO", researcher: "Lab Published",
    grant: "Grant", dataset: "Dataset",
  };
  return map[st] ?? st;
}

function parseMarkdownToHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

export type PdfDossierData = {
  fingerprint: string;
  assetName: string;
  institution: string | null;
  indication: string | null;
  target: string | null;
  modality: string | null;
  stage: string | null;
  patentStatus: string | null;
  licensingStatus: string | null;
  contactEmail: string | null;
  sourceTypes: string[];
  evidenceCount: number;
  sourceUrls: string[];
  score: number;
  scoreBreakdown: {
    novelty: number; freshness: number; readiness: number;
    licensability: number; fit: number; competition: number;
    total: number; signal_coverage: number; scored_dimensions: string[];
  } | null;
  mechanismOfAction: string | null;
  abstract: string | null;
  ipType: string | null;
  licensingReadiness: string | null;
  inventors: string[] | null;
  innovationClaim: string | null;
  unmetNeed: string | null;
  comparableDrugs: string | null;
  whyItMatters: string | null;
  literature: Array<{ title: string; url: string; date: string; source_type: string }>;
  competingAssets: Array<{ assetName: string; target: string; modality: string; developmentStage: string; institution: string }>;
  narrative: string | null;
  narrativeGeneratedAt: string | null;
};

function buildHtml(d: PdfDossierData): string {
  const dateStr = fmtDate(new Date().toISOString());
  const scoredCount = d.scoreBreakdown?.scored_dimensions?.length ?? 0;
  const coverage = d.scoreBreakdown?.signal_coverage ?? 0;
  const footerRight = scoredCount > 0 ? `Scored on ${scoredCount} of 6 signal dimensions` : "";
  const licensingAvailable = d.licensingStatus?.toLowerCase().includes("available") ?? false;

  const hasSci = !!(val(d.mechanismOfAction) || val(d.abstract) || (d.inventors?.length ?? 0) > 0 || val(d.ipType));
  const hasCommercial = !!(val(d.innovationClaim) || val(d.whyItMatters) || val(d.unmetNeed) || val(d.comparableDrugs));

  const pill = (label: string, accent = false) =>
    `<span style="display:inline-flex;align-items:center;padding:4px 12px;border-radius:6px;background:${accent ? GREEN + "30" : "rgba(255,255,255,0.07)"};border:1px solid ${accent ? GREEN + "70" : "rgba(255,255,255,0.12)"};color:${accent ? GREEN : "rgba(255,255,255,0.80)"};font-size:12px;font-weight:${accent ? 700 : 500};white-space:nowrap;margin:0 4px 4px 0">${esc(label)}</span>`;

  const lightPill = (label: string) =>
    `<span style="display:inline-flex;align-items:center;padding:3px 10px;border-radius:4px;background:#f3f4f6;border:1px solid #e5e7eb;color:#374151;font-size:12px;font-weight:500;margin:0 4px 4px 0">${esc(label)}</span>`;

  const sectionHeader = (title: string) =>
    `<div style="display:flex;align-items:center;gap:8px;margin-bottom:16px">
       <div style="width:3px;height:20px;border-radius:2px;background:${GREEN_TEXT};flex-shrink:0"></div>
       <h2 style="font-size:15px;font-weight:700;color:#111;margin:0">${esc(title)}</h2>
     </div>`;

  const footer = () =>
    `<div style="margin-top:48px;padding-top:16px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center">
       <span style="font-size:10px;color:#9ca3af;letter-spacing:0.04em">
         <span style="font-weight:700;color:#374151">Eden</span><span style="font-weight:700;color:${GREEN_TEXT}">Scout</span> · Confidential · ${esc(dateStr)}
       </span>
       ${footerRight ? `<span style="font-size:10px;color:#9ca3af">${esc(footerRight)}</span>` : ""}
     </div>`;

  const callout = (color: string, borderColor: string, textColor: string, label: string, content: string) =>
    `<div style="margin-bottom:24px;padding:16px 20px;border-radius:8px;background:${color};border:1px solid ${borderColor}">
       <div style="font-size:11px;font-weight:700;color:${textColor};text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px">${esc(label)}</div>
       <p style="font-size:13px;color:#374151;line-height:1.65;margin:0">${parseMarkdownToHtml(content)}</p>
     </div>`;

  // ── COVER ────────────────────────────────────────────────────────────────────
  const cover = `
<div style="position:relative;background:${BG_DARK};min-height:100vh;display:flex;flex-direction:column;overflow:hidden;page-break-after:always;-webkit-print-color-adjust:exact;print-color-adjust:exact">

  <!-- Radar rings -->
  <div style="position:absolute;inset:0;overflow:hidden;pointer-events:none">
    ${[590, 470, 340, 200].map((r, i) => {
      const opacity = (0.10 - i * 0.018).toFixed(3);
      return `<div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:${r}px;height:${r}px;border-radius:50%;border:1px solid rgba(63,185,80,${opacity})"></div>`;
    }).join("")}
  </div>

  <!-- Logo -->
  <div style="position:relative;z-index:10;padding:28px 40px 0">
    <div style="font-size:22px;font-weight:800;letter-spacing:-0.02em">
      <span style="color:#ffffff">Eden</span><span style="color:${GREEN}">Scout</span>
    </div>
    <div style="font-size:11px;color:rgba(255,255,255,0.35);margin-top:3px;letter-spacing:0.04em;text-transform:uppercase">
      EDEN Intelligence Platform · ${esc(dateStr)}
    </div>
  </div>

  <!-- Main content -->
  <div style="position:relative;z-index:10;flex:1;display:flex;flex-direction:column;justify-content:center;padding:40px 80px">
    <div style="display:inline-flex;align-items:center;padding:4px 12px;border-radius:20px;background:${GREEN}22;border:1px solid ${GREEN}44;color:${GREEN};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:20px;width:fit-content">
      Asset Intelligence Dossier
    </div>

    <h1 style="font-size:40px;font-weight:800;color:#ffffff;line-height:1.15;margin:0 0 12px;letter-spacing:-0.02em;max-width:740px">
      ${esc(d.assetName)}
    </h1>

    ${val(d.institution) ? `<p style="font-size:16px;color:rgba(255,255,255,0.55);margin-bottom:28px;font-weight:500">${esc(d.institution!)}</p>` : ""}

    <div style="display:flex;flex-wrap:wrap;margin-bottom:32px">
      ${val(d.indication) ? pill(d.indication!) : ""}
      ${val(d.target) && d.target !== d.indication ? pill(`Target: ${d.target!}`) : ""}
      ${val(d.modality) ? pill(d.modality!) : ""}
      ${val(d.stage) ? pill(d.stage!) : ""}
      ${val(d.patentStatus) ? pill(`Patent: ${d.patentStatus!}`) : ""}
      ${val(d.licensingStatus) && !licensingAvailable ? pill(`Licensing: ${d.licensingStatus!}`) : ""}
      ${licensingAvailable ? pill("Available for Licensing", true) : ""}
    </div>

    ${scoredCount > 0 ? `<div style="font-size:12px;color:rgba(255,255,255,0.35)">${scoredCount} of 6 signal dimensions scored · ${Math.round(coverage)}% signal coverage</div>` : ""}
  </div>

  <!-- Bottom strip -->
  <div style="position:relative;z-index:10;padding:20px 40px;border-top:1px solid rgba(255,255,255,0.07);display:flex;justify-content:space-between;align-items:center">
    <div style="display:flex;align-items:center;gap:12px">
      ${d.sourceTypes.map((st) =>
        `<span style="font-size:10px;padding:3px 8px;border-radius:4px;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);color:rgba(255,255,255,0.55);font-weight:600;text-transform:uppercase;letter-spacing:0.06em">${esc(sourceLabel(st))}</span>`
      ).join("")}
      ${d.evidenceCount > 0 ? `<span style="font-size:11px;color:rgba(255,255,255,0.30)">${d.evidenceCount} signal${d.evidenceCount !== 1 ? "s" : ""}</span>` : ""}
    </div>
    ${val(d.contactEmail) ? `
    <div style="text-align:right">
      <div style="font-size:10px;color:rgba(255,255,255,0.30);margin-bottom:2px;text-transform:uppercase;letter-spacing:0.05em">TTO Contact</div>
      <span style="font-size:12px;color:${GREEN};font-weight:600">${esc(d.contactEmail!)}</span>
    </div>` : ""}
  </div>
</div>`;

  // ── PAGE 2: SCIENTIFIC OVERVIEW ───────────────────────────────────────────
  const sciPage = hasSci ? `
<div style="background:#ffffff;padding:48px 56px 40px;min-height:100vh;page-break-before:always">
  ${sectionHeader("Scientific Overview")}

  ${val(d.mechanismOfAction) ? `
  <div style="margin-bottom:24px">
    <div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px">Mechanism of Action</div>
    <p style="font-size:14px;color:#111;line-height:1.65;margin:0">${parseMarkdownToHtml(d.mechanismOfAction!)}</p>
  </div>` : ""}

  ${val(d.abstract) ? `
  <div style="margin-bottom:24px">
    <div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px">Abstract</div>
    <p style="font-size:13px;color:#374151;line-height:1.7;margin:0">${parseMarkdownToHtml(d.abstract!)}</p>
  </div>` : ""}

  ${(val(d.ipType) || val(d.licensingReadiness) || val(d.patentStatus)) ? `
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;margin-bottom:24px">
    ${val(d.ipType) ? `<div><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px">IP Type</div><div style="font-size:13px;color:#111;font-weight:600">${esc(d.ipType!)}</div></div>` : ""}
    ${val(d.licensingReadiness) ? `<div><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px">Licensing Readiness</div><div style="font-size:13px;color:#111;font-weight:600">${esc(d.licensingReadiness!)}</div></div>` : ""}
    ${val(d.patentStatus) ? `<div><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px">Patent Status</div><div style="font-size:13px;color:#111;font-weight:600">${esc(d.patentStatus!)}</div></div>` : ""}
  </div>` : ""}

  ${(d.inventors?.length ?? 0) > 0 ? `
  <div style="margin-bottom:24px">
    <div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px">Inventors</div>
    <div style="display:flex;flex-wrap:wrap">${d.inventors!.map((inv) => lightPill(inv)).join("")}</div>
  </div>` : ""}

  ${d.sourceUrls.length > 0 ? `
  <div>
    <div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px">Source References</div>
    <div style="display:flex;flex-direction:column;gap:4px">
      ${d.sourceUrls.slice(0, 3).map((url) => `<span style="font-size:12px;color:${GREEN_TEXT};word-break:break-all">${esc(url)}</span>`).join("")}
    </div>
  </div>` : ""}

  ${footer()}
</div>` : "";

  // ── PAGE 3: COMMERCIAL INTELLIGENCE ──────────────────────────────────────
  const commercialPage = hasCommercial ? `
<div style="background:#ffffff;padding:48px 56px 40px;min-height:100vh;page-break-before:always">
  ${sectionHeader("Commercial Intelligence")}

  ${val(d.innovationClaim) ? callout("#fffbeb", "#fde68a", "#92400e", "Innovation Claim", d.innovationClaim!) : ""}
  ${val(d.whyItMatters) ? callout("#f0fdf4", "#bbf7d0", "#14532d", "Commercial Opportunity Signal", `"${d.whyItMatters!}"`) : ""}
  ${val(d.unmetNeed) ? callout("#fff1f2", "#fecdd3", "#881337", "Unmet Need", d.unmetNeed!) : ""}

  ${val(d.comparableDrugs) ? `
  <div style="margin-bottom:24px">
    <div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px">Comparable Assets</div>
    <p style="font-size:13px;color:#374151;line-height:1.65;margin:0">${parseMarkdownToHtml(d.comparableDrugs!)}</p>
  </div>` : ""}

  ${footer()}
</div>` : "";

  // ── PAGE 4: EDEN ANALYSIS ─────────────────────────────────────────────────
  const analysisPage = `
<div style="background:#ffffff;padding:48px 56px 40px;min-height:100vh;page-break-before:always">
  ${sectionHeader("EDEN Analysis")}

  ${d.narrative ? `
  ${d.narrativeGeneratedAt ? `<div style="font-size:11px;color:#9ca3af;margin-bottom:20px">Generated ${esc(fmtDate(d.narrativeGeneratedAt))}</div>` : ""}
  <div style="font-size:13.5px;color:#374151;line-height:1.8">
    ${d.narrative.split(/\n{2,}/).filter(Boolean).map((p) =>
      `<p style="margin-bottom:16px">${parseMarkdownToHtml(p)}</p>`
    ).join("")}
  </div>` : `
  <div style="padding:32px 24px;border-radius:10px;text-align:center;background:#f9fafb;border:2px dashed #d1d5db">
    <p style="font-size:14px;font-weight:600;color:#374151;margin-bottom:8px">EDEN Analysis Not Yet Generated</p>
    <p style="font-size:13px;color:#9ca3af;line-height:1.6">Return to the asset dossier and click "Generate Dossier" to produce an EDEN-powered analysis before exporting.</p>
  </div>`}

  ${footer()}
</div>`;

  // ── PAGE 5: SIGNAL PROFILE & EVIDENCE ────────────────────────────────────
  const hasSignalPage = scoredCount > 0 || d.literature.length > 0 || d.competingAssets.length > 0;

  const scoreGrid = (d.scoreBreakdown && scoredCount > 0) ? (() => {
    const dims: Array<[string, number]> = [
      ["Novelty", d.scoreBreakdown!.novelty],
      ["Freshness", d.scoreBreakdown!.freshness],
      ["Readiness", d.scoreBreakdown!.readiness],
      ["Licensability", d.scoreBreakdown!.licensability],
      ["Fit", d.scoreBreakdown!.fit],
      ["Competition", d.scoreBreakdown!.competition],
    ];
    return `
    <div style="margin-bottom:32px">
      <div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:12px">Signal Score Breakdown</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px">
        ${dims.map(([name, score]) => {
          const c = scoreColor(score);
          return `<div style="padding:12px 14px;border-radius:8px;background:${c.bg};border:1px solid ${c.border}">
            <div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px">${esc(name)}</div>
            <div style="font-size:22px;font-weight:800;color:${c.text}">${Math.round(score)}</div>
          </div>`;
        }).join("")}
      </div>
      <div style="padding:10px 14px;border-radius:6px;background:#f3f4f6;border:1px solid #e5e7eb;font-size:12px;color:#374151">
        <strong>Total Score:</strong> ${Math.round(d.scoreBreakdown!.total)} · <strong>Signal Coverage:</strong> ${Math.round(coverage)}%
      </div>
    </div>`;
  })() : "";

  const litSection = d.literature.length > 0 ? `
  <div style="margin-bottom:28px">
    <div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:12px">
      Supporting Literature (${d.literature.length})
    </div>
    <div style="display:flex;flex-direction:column;gap:8px">
      ${d.literature.map((lit) => `
      <div style="display:flex;gap:12px;padding:10px 14px;border-radius:6px;background:#f9fafb;border:1px solid #e5e7eb;align-items:flex-start">
        <span style="font-size:10px;padding:2px 7px;border-radius:3px;background:#e5e7eb;color:#374151;font-weight:600;text-transform:uppercase;flex-shrink:0;margin-top:2px">${esc(sourceLabel(lit.source_type))}</span>
        <div style="flex:1;min-width:0">
          <p style="font-size:12px;font-weight:600;color:#111;margin:0;line-height:1.4">${esc(lit.title)}</p>
          ${lit.date ? `<p style="font-size:11px;color:#9ca3af;margin:4px 0 0">${esc(lit.date)}</p>` : ""}
        </div>
      </div>`).join("")}
    </div>
  </div>` : "";

  const competingSection = d.competingAssets.length > 0 ? `
  <div style="margin-bottom:28px">
    <div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:12px">
      Competing Assets (${d.competingAssets.length})
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead>
        <tr style="background:#f3f4f6">
          ${["Asset", "Target", "Modality", "Stage", "Institution"].map((h) =>
            `<th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e5e7eb">${h}</th>`
          ).join("")}
        </tr>
      </thead>
      <tbody>
        ${d.competingAssets.map((comp, i) => `
        <tr style="background:${i % 2 === 0 ? "#fff" : "#f9fafb"}">
          <td style="padding:8px 10px;font-weight:600;color:#111;border-bottom:1px solid #f3f4f6">${esc(comp.assetName)}</td>
          <td style="padding:8px 10px;color:#374151;border-bottom:1px solid #f3f4f6">${esc(val(comp.target) ?? "—")}</td>
          <td style="padding:8px 10px;color:#374151;border-bottom:1px solid #f3f4f6">${esc(val(comp.modality) ?? "—")}</td>
          <td style="padding:8px 10px;color:#374151;border-bottom:1px solid #f3f4f6">${esc(val(comp.developmentStage) ?? "—")}</td>
          <td style="padding:8px 10px;color:#374151;border-bottom:1px solid #f3f4f6">${esc(val(comp.institution) ?? "—")}</td>
        </tr>`).join("")}
      </tbody>
    </table>
  </div>` : "";

  const signalPage = hasSignalPage ? `
<div style="background:#ffffff;padding:48px 56px 40px;min-height:100vh;page-break-before:always">
  ${sectionHeader("Signal Profile & Evidence")}
  ${scoreGrid}
  ${litSection}
  ${competingSection}
  ${footer()}
</div>` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Open Sans', sans-serif; background: #f8f9fa; }
    @page { size: A4; margin: 0; }
    @media print {
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; forced-color-adjust: none !important; }
    }
  </style>
</head>
<body>
  ${cover}
  ${sciPage}
  ${commercialPage}
  ${analysisPage}
  ${signalPage}
</body>
</html>`;
}

export async function generateDossierPdf(data: PdfDossierData): Promise<Buffer> {
  const html = buildHtml(data);
  const browser = await getBrowser();
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.setContent(html, { waitUntil: "networkidle", timeout: 15000 });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
    return Buffer.from(pdf);
  } finally {
    await context.close();
  }
}
