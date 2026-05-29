import { chromium } from "playwright";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ACCENT = "hsl(142, 71%, 38%)";
const ACCENT_LIGHT = "rgba(16,185,129,0.1)";
const ACCENT_BORDER = "rgba(16,185,129,0.2)";

const STAGE_COLORS = {
  "Discovery":    "#9dbea6",
  "Early Stage":  "#74aa84",
  "Preclinical":  "#4d9464",
  "Phase 1":      "#2f7d4a",
  "Phase 2":      "#1a6636",
  "Phase 3":      "#0e5027",
};

const BIOLOGY_DATA = [
  { name: "Oncology", count: 4821, pct: 100 },
  { name: "Immunology", count: 3104, pct: 64 },
  { name: "Neuroscience", count: 2856, pct: 59 },
  { name: "Infectious Disease", count: 2201, pct: 46 },
  { name: "Metabolic", count: 1782, pct: 37 },
  { name: "Cardiovascular", count: 1445, pct: 30 },
  { name: "Rare Disease", count: 1203, pct: 25 },
  { name: "Gene Therapy", count: 987, pct: 20 },
];

const MODALITY_DATA = [
  { name: "Small Molecule", count: 5841, delta: "+182" },
  { name: "Biologic", count: 4203, delta: "+96" },
  { name: "Cell Therapy", count: 2107, delta: "+214" },
  { name: "Gene Therapy", count: 1832, delta: "+311" },
  { name: "ADC", count: 1204, delta: "+88" },
  { name: "RNA Therapy", count: 987, delta: "+143" },
];

const STAGE_DATA = [
  { stage: "Discovery", count: 9842, pct: 31 },
  { stage: "Early Stage", count: 7621, pct: 24 },
  { stage: "Preclinical", count: 7104, pct: 22 },
  { stage: "Phase 1", count: 3984, pct: 13 },
  { stage: "Phase 2", count: 2107, pct: 7 },
  { stage: "Phase 3", count: 893, pct: 3 },
];

const WHITESPACE_ROWS = ["Oncology", "Immunology", "Neuroscience", "Rare Disease", "Cardiovascular"];
const WHITESPACE_COLS = ["Small Mol", "Biologic", "Cell Ther", "Gene Ther", "ADC"];
const WHITESPACE_CELLS = [
  [100, 82, 41, 18, 55],
  [74, 90, 38, 8, 22],
  [61, 47, 12, 30, 6],
  [22, 18, 5, 42, 3],
  [55, 31, 7, 12, 9],
];

const RISING_ASSETS = [
  { title: "CRISPR-Based Correction of CFTR Mutations", inst: "MIT", bio: "rare disease", score: 84 },
  { title: "Bispecific CD3/EGFR CAR-T Construct", inst: "Stanford", bio: "oncology", score: 79 },
  { title: "GLP-1/GIP Dual Agonist Peptide", inst: "Harvard", bio: "metabolic", score: 73 },
  { title: "AAV9-Mediated SOD1 Knockdown", inst: "UCSF", bio: "neuroscience", score: 71 },
  { title: "PD-L1 × TIM-3 Checkpoint Inhibitor", inst: "Hopkins", bio: "oncology", score: 68 },
];

const INSTITUTIONS = [
  { name: "MIT", total: 412, bars: [30, 28, 22, 12, 6, 2] },
  { name: "Stanford", total: 387, bars: [28, 25, 24, 14, 7, 2] },
  { name: "Harvard", total: 341, bars: [32, 27, 21, 11, 7, 2] },
  { name: "UCSF", total: 298, bars: [29, 26, 22, 13, 8, 2] },
  { name: "UC Berkeley", total: 276, bars: [31, 28, 20, 12, 7, 2] },
];

const WEEKLY_DATA = [12, 18, 14, 22, 31, 19, 25, 28, 15, 20, 34, 27, 22, 29];

function cellColor(pct) {
  if (pct === 0) return "transparent";
  if (pct < 10) return "rgba(16,185,129,0.08)";
  if (pct < 25) return "rgba(16,185,129,0.18)";
  if (pct < 50) return "rgba(16,185,129,0.32)";
  if (pct < 75) return "rgba(16,185,129,0.52)";
  return "rgba(16,185,129,0.78)";
}

function cellTextColor(pct) {
  return pct >= 50 ? "#ffffff" : (pct >= 25 ? "#065f46" : "#374151");
}

const barMaxH = 48;

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Landscape Intelligence</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #f9fafb;
    color: #111827;
    font-size: 13px;
    line-height: 1.4;
    width: 1200px;
  }
  .page { max-width: 1200px; margin: 0 auto; padding: 24px; display: flex; flex-direction: column; gap: 16px; }

  /* Header */
  .page-header {
    background: linear-gradient(135deg, rgba(16,185,129,0.04) 0%, #fff 60%);
    border: 1px solid rgba(16,185,129,0.18);
    border-radius: 14px;
    padding: 18px 20px;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
  }
  .header-left { display: flex; align-items: center; gap: 12px; }
  .header-icon {
    width: 36px; height: 36px; border-radius: 8px;
    background: rgba(16,185,129,0.12);
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .header-icon svg { width: 18px; height: 18px; color: ${ACCENT}; }
  .header-title { display: flex; align-items: center; gap: 8px; }
  .header-title h1 { font-size: 22px; font-weight: 800; letter-spacing: -0.025em; color: #111827; }
  .live-badge {
    font-size: 9px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase;
    background: rgba(16,185,129,0.12); color: ${ACCENT};
    border-radius: 999px; padding: 2px 7px; border: 1px solid rgba(16,185,129,0.2);
  }
  .header-sub { font-size: 11px; color: #6b7280; margin-top: 2px; }
  .header-right { display: flex; align-items: center; gap: 8px; }
  .stat-pill {
    display: flex; align-items: center; gap: 6px;
    background: rgba(16,185,129,0.08); border: 1px solid rgba(16,185,129,0.15);
    border-radius: 8px; padding: 6px 10px; font-size: 11px;
  }
  .stat-pill .num { font-weight: 900; color: #111827; font-variant-numeric: tabular-nums; }
  .stat-pill .lbl { color: #6b7280; }
  .range-toggle {
    display: flex; gap: 2px; background: #f3f4f6; border: 1px solid #e5e7eb;
    border-radius: 10px; padding: 3px;
  }
  .range-btn {
    padding: 4px 12px; border-radius: 7px; font-size: 11px; font-weight: 600;
    color: #6b7280; cursor: default;
  }
  .range-btn.active { background: #fff; color: ${ACCENT}; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }

  /* Bento ring */
  .bento {
    border: 1px solid rgba(16,185,129,0.15);
    background: rgba(16,185,129,0.03);
    border-radius: 18px; padding: 16px; display: flex; flex-direction: column; gap: 14px;
  }

  /* Section panel */
  .panel {
    background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 18px;
    display: flex; flex-direction: column; gap: 12px;
  }
  .panel-header { display: flex; align-items: flex-start; gap: 10px; }
  .panel-icon {
    width: 34px; height: 34px; border-radius: 7px; flex-shrink: 0;
    background: rgba(16,185,129,0.1); display: flex; align-items: center; justify-content: center;
  }
  .panel-icon svg { width: 15px; height: 15px; }
  .panel-title { font-size: 14px; font-weight: 700; color: #111827; line-height: 1.2; }
  .panel-sub { font-size: 10px; color: #9ca3af; margin-top: 2px; line-height: 1.3; }
  .panel-body { flex: 1; }

  /* Grid layouts */
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .full-width { }

  /* Stage funnel */
  .funnel-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
  .funnel-label { width: 76px; text-align: right; font-size: 11px; font-weight: 600; color: #374151; flex-shrink: 0; }
  .funnel-bar-track { flex: 1; height: 26px; border-radius: 6px; background: rgba(0,0,0,0.04); overflow: hidden; }
  .funnel-bar { height: 100%; border-radius: 6px; display: flex; align-items: center; padding: 0 8px; }
  .funnel-bar-num { font-size: 10px; font-weight: 700; color: rgba(255,255,255,0.92); font-variant-numeric: tabular-nums; }
  .funnel-pct { width: 26px; text-align: right; font-size: 10px; color: #9ca3af; flex-shrink: 0; }

  /* Biology landscape */
  .bio-row { display: flex; align-items: center; gap: 8px; margin-bottom: 7px; }
  .bio-rank { width: 16px; font-size: 10px; color: #9ca3af; text-align: right; flex-shrink: 0; font-weight: 600; }
  .bio-label { width: 120px; font-size: 11px; font-weight: 600; color: #374151; flex-shrink: 0; }
  .bio-track { flex: 1; height: 22px; border-radius: 5px; background: rgba(0,0,0,0.04); overflow: hidden; cursor: default; }
  .bio-fill { height: 100%; border-radius: 5px; background: rgba(16,185,129,0.55); display: flex; align-items: center; padding: 0 7px; }
  .bio-fill-num { font-size: 10px; font-weight: 700; color: rgba(255,255,255,0.9); font-variant-numeric: tabular-nums; }

  /* Modality momentum */
  .mod-row { display: flex; align-items: center; gap: 8px; margin-bottom: 7px; }
  .mod-label { width: 100px; font-size: 11px; font-weight: 600; color: #374151; flex-shrink: 0; }
  .mod-track { flex: 1; height: 22px; border-radius: 5px; background: rgba(0,0,0,0.04); overflow: hidden; }
  .mod-fill { height: 100%; border-radius: 5px; background: rgba(16,185,129,0.45); display: flex; align-items: center; padding: 0 7px; }
  .mod-fill-num { font-size: 10px; font-weight: 700; color: rgba(255,255,255,0.9); font-variant-numeric: tabular-nums; }
  .mod-delta { width: 42px; text-align: right; font-size: 10px; font-weight: 600; color: ${ACCENT}; flex-shrink: 0; }

  /* Whitespace matrix */
  .matrix-wrap { overflow-x: auto; }
  .matrix { border-collapse: separate; border-spacing: 3px; width: 100%; }
  .matrix th { font-size: 9.5px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.06em; padding: 4px 6px; text-align: center; }
  .matrix th.row-header { text-align: right; width: 130px; font-size: 10px; font-weight: 700; color: #374151; }
  .matrix td.row-label { text-align: right; font-size: 11px; font-weight: 600; color: #374151; padding: 4px 8px 4px 0; white-space: nowrap; }
  .matrix td.cell {
    width: 100px; height: 34px; border-radius: 6px; text-align: center; vertical-align: middle;
    font-size: 11px; font-weight: 700; cursor: default;
    border: 1px solid rgba(16,185,129,0.12);
    font-variant-numeric: tabular-nums;
  }
  .matrix td.empty {
    border: 1px dashed rgba(16,185,129,0.25); background: rgba(16,185,129,0.02);
    color: #d1fae5; font-size: 10px;
  }

  /* Rising assets */
  .rising-item { display: flex; align-items: flex-start; gap: 10px; padding: 9px 0; border-bottom: 1px solid #f3f4f6; }
  .rising-item:last-child { border-bottom: none; }
  .rising-score {
    width: 32px; height: 32px; border-radius: 50%; flex-shrink: 0;
    background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.25);
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 800; color: ${ACCENT};
  }
  .rising-body { flex: 1; min-width: 0; }
  .rising-title { font-size: 11.5px; font-weight: 600; color: #111827; line-height: 1.3; }
  .rising-meta { display: flex; align-items: center; gap: 6px; margin-top: 3px; flex-wrap: wrap; }
  .rising-inst { font-size: 10px; color: #6b7280; }
  .rising-bio-pill {
    font-size: 9px; font-weight: 600; padding: 2px 6px; border-radius: 999px;
    background: rgba(16,185,129,0.1); color: ${ACCENT}; border: 1px solid rgba(16,185,129,0.2);
  }

  /* Institution pipeline */
  .inst-row { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid #f3f4f6; }
  .inst-row:last-child { border-bottom: none; }
  .inst-name { width: 90px; font-size: 11px; font-weight: 700; color: #374151; flex-shrink: 0; }
  .inst-total { width: 36px; text-align: right; font-size: 11px; font-weight: 800; color: #111827; flex-shrink: 0; }
  .inst-bars { flex: 1; display: flex; gap: 2px; height: 18px; }
  .inst-bar { border-radius: 3px; }

  /* Weekly velocity */
  .velocity-wrap { display: flex; gap: 20px; align-items: flex-end; }
  .velocity-chart { flex: 1; display: flex; align-items: flex-end; gap: 3px; height: ${barMaxH + 20}px; padding-bottom: 20px; position: relative; }
  .velocity-bar { flex: 1; border-radius: 4px 4px 0 0; background: rgba(16,185,129,0.55); min-width: 18px; position: relative; }
  .velocity-bar:hover { background: rgba(16,185,129,0.75); }
  .velocity-stats { display: flex; flex-direction: column; gap: 10px; flex-shrink: 0; }
  .vel-stat { text-align: right; }
  .vel-stat-num { font-size: 18px; font-weight: 900; color: #111827; letter-spacing: -0.02em; }
  .vel-stat-label { font-size: 9px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.08em; margin-top: 1px; }
  .axis-labels { display: flex; justify-content: space-between; margin-top: 2px; }
  .axis-label { font-size: 9px; color: #9ca3af; }

  /* Whitespace opportunity table */
  .opp-table { width: 100%; }
  .opp-header { display: grid; grid-template-columns: 1fr 80px 60px 70px; font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em; color: #9ca3af; font-weight: 700; padding: 0 4px 8px; border-bottom: 1px solid #f3f4f6; }
  .opp-row { display: grid; grid-template-columns: 1fr 80px 60px 70px; padding: 8px 4px; border-bottom: 1px solid #f9fafb; align-items: center; }
  .opp-row:last-child { border-bottom: none; }
  .opp-bio { font-size: 11px; font-weight: 600; color: #374151; }
  .opp-need-dots { display: flex; gap: 2px; }
  .dot { width: 7px; height: 7px; border-radius: 50%; }
  .dot-filled { background: ${ACCENT}; }
  .dot-empty { background: #e5e7eb; }
  .opp-count { font-size: 11px; color: #374151; font-variant-numeric: tabular-nums; }
  .opp-badge { font-size: 9px; font-weight: 700; padding: 2px 7px; border-radius: 999px; display: inline-block; }
  .badge-high { background: rgba(16,185,129,0.12); color: ${ACCENT}; }
  .badge-growing { background: rgba(59,130,246,0.1); color: #3b82f6; }
  .badge-monitor { background: #f3f4f6; color: #6b7280; }
</style>
</head>
<body>
<div class="page">

  <!-- Page header -->
  <div class="page-header">
    <div class="header-left">
      <div class="header-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:hsl(142,71%,38%)">
          <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
          <line x1="6" y1="20" x2="6" y2="14"/>
        </svg>
      </div>
      <div>
        <div class="header-title">
          <h1>Landscape Intelligence</h1>
          <span class="live-badge">Live</span>
        </div>
        <div class="header-sub">Signal-level view of the pre-commercial TTO asset index.</div>
      </div>
    </div>
    <div class="header-right">
      <div class="stat-pill"><span class="num">33,241</span><span class="lbl">indexed</span></div>
      <div class="stat-pill">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="hsl(142,71%,38%)" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
        <span class="num">147</span><span class="lbl">rising</span>
      </div>
      <div class="stat-pill" style="background:#f3f4f6;border-color:#e5e7eb;"><span style="color:#9ca3af">Top:</span>&nbsp;<span style="font-weight:700;color:#111827">Oncology</span></div>
      <div class="range-toggle">
        <span class="range-btn">30d</span>
        <span class="range-btn">60d</span>
        <span class="range-btn">90d</span>
        <span class="range-btn active">All time</span>
      </div>
    </div>
  </div>

  <!-- Bento ring -->
  <div class="bento">

    <!-- Row 1: Stage funnel | Whitespace opportunity -->
    <div class="grid-2">

      <!-- Stage Funnel -->
      <div class="panel">
        <div class="panel-header">
          <div class="panel-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="hsl(142,71%,38%)" stroke-width="2">
              <line x1="6" y1="3" x2="6" y2="15"/><circle cx="6" cy="18" r="3"/><line x1="18" y1="3" x2="18" y2="9"/>
              <circle cx="18" cy="12" r="3"/><line x1="12" y1="3" x2="12" y2="6"/><circle cx="12" cy="9" r="3"/>
            </svg>
          </div>
          <div>
            <div class="panel-title">Pre-Commercial Pipeline</div>
            <div class="panel-sub">Stage distribution across all relevant TTO assets.</div>
          </div>
        </div>
        <div class="panel-body">
          ${STAGE_DATA.map(({ stage, count, pct }) => `
          <div class="funnel-row">
            <div class="funnel-label">${stage}</div>
            <div class="funnel-bar-track">
              <div class="funnel-bar" style="width:${Math.max(4, Math.sqrt(count / 9842) * 100)}%;background:${STAGE_COLORS[stage]};">
                <span class="funnel-bar-num">${count.toLocaleString()}</span>
              </div>
            </div>
            <div class="funnel-pct">${pct}%</div>
          </div>`).join("")}
        </div>
      </div>

      <!-- Whitespace Opportunity -->
      <div class="panel">
        <div class="panel-header">
          <div class="panel-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="hsl(142,71%,38%)" stroke-width="2">
              <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
              <line x1="22" y1="12" x2="18" y2="12"/><line x1="6" y1="12" x2="2" y2="12"/>
              <line x1="12" y1="6" x2="12" y2="2"/><line x1="12" y1="22" x2="12" y2="18"/>
            </svg>
          </div>
          <div>
            <div class="panel-title">White Space Finder</div>
            <div class="panel-sub">High unmet need with low asset density signals an opportunity.</div>
          </div>
        </div>
        <div class="panel-body">
          <div class="opp-table">
            <div class="opp-header">
              <span>Biology</span><span>Unmet Need</span><span>Assets</span><span>Signal</span>
            </div>
            ${[
              { bio: "Rare Disease", dots: 5, count: 203, badge: "badge-high", label: "High Opp" },
              { bio: "Neuroscience", dots: 4, count: 387, badge: "badge-high", label: "High Opp" },
              { bio: "Gene Therapy", dots: 4, count: 512, badge: "badge-growing", label: "Growing" },
              { bio: "Cardiovascular", dots: 3, count: 721, badge: "badge-growing", label: "Growing" },
              { bio: "Metabolic", dots: 3, count: 944, badge: "badge-monitor", label: "Monitor" },
              { bio: "Oncology", dots: 2, count: 4821, badge: "badge-monitor", label: "Monitor" },
            ].map(row => `
            <div class="opp-row">
              <div class="opp-bio">${row.bio}</div>
              <div class="opp-need-dots">
                ${Array.from({ length: 5 }, (_, i) => `<div class="dot ${i < row.dots ? 'dot-filled' : 'dot-empty'}"></div>`).join("")}
              </div>
              <div class="opp-count">${row.count.toLocaleString()}</div>
              <div><span class="opp-badge ${row.badge}">${row.label}</span></div>
            </div>`).join("")}
          </div>
        </div>
      </div>
    </div>

    <!-- Row 2: Therapeutic Whitespace matrix (full width) -->
    <div class="panel full-width">
      <div class="panel-header">
        <div class="panel-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="hsl(142,71%,38%)" stroke-width="2">
            <rect x="2" y="3" width="7" height="7"/><rect x="9" y="3" width="7" height="7"/>
            <rect x="16" y="3" width="6" height="7"/><rect x="2" y="10" width="7" height="7"/>
            <rect x="9" y="10" width="7" height="7"/><rect x="16" y="10" width="6" height="7"/>
            <rect x="2" y="17" width="7" height="7"/><rect x="9" y="17" width="7" height="7"/>
            <rect x="16" y="17" width="6" height="7"/>
          </svg>
        </div>
        <div>
          <div class="panel-title">Therapeutic Whitespace</div>
          <div class="panel-sub">Biology × modality density for all time. Darker cells = more assets, dashed borders = gap opportunities.</div>
        </div>
      </div>
      <div class="panel-body matrix-wrap">
        <table class="matrix">
          <thead>
            <tr>
              <th class="row-header"></th>
              ${WHITESPACE_COLS.map(c => `<th>${c}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${WHITESPACE_ROWS.map((row, ri) => `
            <tr>
              <td class="row-label">${row}</td>
              ${WHITESPACE_COLS.map((col, ci) => {
                const pct = WHITESPACE_CELLS[ri][ci];
                const count = Math.round(pct * 48);
                const bg = cellColor(pct);
                const color = cellTextColor(pct);
                if (pct < 8) {
                  return `<td class="cell empty" style="background:rgba(16,185,129,0.02);">–</td>`;
                }
                return `<td class="cell" style="background:${bg};color:${color};">${count}</td>`;
              }).join("")}
            </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Row 3: Rising Assets | Institution Pipeline -->
    <div class="grid-2">

      <!-- Rising Assets -->
      <div class="panel">
        <div class="panel-header">
          <div class="panel-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="hsl(142,71%,38%)" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          </div>
          <div>
            <div class="panel-title">Rising Assets</div>
            <div class="panel-sub">Top assets by momentum signal: stage changes, content updates, new discoveries.</div>
          </div>
        </div>
        <div class="panel-body">
          ${RISING_ASSETS.map(a => `
          <div class="rising-item">
            <div class="rising-score">${a.score}</div>
            <div class="rising-body">
              <div class="rising-title">${a.title}</div>
              <div class="rising-meta">
                <span class="rising-inst">${a.inst}</span>
                <span class="rising-bio-pill">${a.bio}</span>
              </div>
            </div>
          </div>`).join("")}
        </div>
      </div>

      <!-- Institution Pipeline -->
      <div class="panel">
        <div class="panel-header">
          <div class="panel-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="hsl(142,71%,38%)" stroke-width="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
          </div>
          <div>
            <div class="panel-title">Institution Pipeline Depth</div>
            <div class="panel-sub">Top 10 institutions by total assets. Stage distribution shows pipeline maturity.</div>
          </div>
        </div>
        <div class="panel-body">
          ${INSTITUTIONS.map(inst => {
            const total = inst.total;
            const stages = ["#9dbea6", "#74aa84", "#4d9464", "#2f7d4a", "#1a6636", "#0e5027"];
            return `
          <div class="inst-row">
            <div class="inst-name">${inst.name}</div>
            <div class="inst-total">${total}</div>
            <div class="inst-bars">
              ${inst.bars.map((pct, i) => `
              <div class="inst-bar" style="width:${pct}%;background:${stages[i]};height:18px;border-radius:3px;"></div>`).join("")}
            </div>
          </div>`;
          }).join("")}
        </div>
      </div>
    </div>

    <!-- Row 4: Biology | Modality -->
    <div class="grid-2">

      <!-- Biology Landscape -->
      <div class="panel">
        <div class="panel-header">
          <div class="panel-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="hsl(142,71%,38%)" stroke-width="2">
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>
            </svg>
          </div>
          <div>
            <div class="panel-title">Biology Landscape</div>
            <div class="panel-sub">Top biology drivers for all time.</div>
          </div>
        </div>
        <div class="panel-body">
          ${BIOLOGY_DATA.map((b, i) => `
          <div class="bio-row">
            <div class="bio-rank">${i + 1}</div>
            <div class="bio-label">${b.name}</div>
            <div class="bio-track">
              <div class="bio-fill" style="width:${b.pct}%">
                <span class="bio-fill-num">${b.count.toLocaleString()}</span>
              </div>
            </div>
          </div>`).join("")}
        </div>
      </div>

      <!-- Modality Momentum -->
      <div class="panel">
        <div class="panel-header">
          <div class="panel-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="hsl(142,71%,38%)" stroke-width="2">
              <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
            </svg>
          </div>
          <div>
            <div class="panel-title">Modality Momentum</div>
            <div class="panel-sub">All assets by modality. Non-therapeutic categories excluded.</div>
          </div>
        </div>
        <div class="panel-body">
          ${MODALITY_DATA.map(m => `
          <div class="mod-row">
            <div class="mod-label">${m.name}</div>
            <div class="mod-track">
              <div class="mod-fill" style="width:${Math.round((m.count / 5841) * 100)}%">
                <span class="mod-fill-num">${m.count.toLocaleString()}</span>
              </div>
            </div>
            <div class="mod-delta">${m.delta}</div>
          </div>`).join("")}
        </div>
      </div>
    </div>

    <!-- Row 5: Weekly Velocity (full width) -->
    <div class="panel full-width">
      <div class="panel-header">
        <div class="panel-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="hsl(142,71%,38%)" stroke-width="2">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
          </svg>
        </div>
        <div>
          <div class="panel-title">Weekly Velocity</div>
          <div class="panel-sub">New assets indexed per week. Click any bar to explore that week's additions.</div>
        </div>
      </div>
      <div class="panel-body">
        <div class="velocity-wrap">
          <div style="flex:1">
            <div class="velocity-chart">
              ${WEEKLY_DATA.map((v, i) => {
                const h = Math.round((v / 34) * barMaxH);
                const isRecent = i >= WEEKLY_DATA.length - 3;
                return `<div class="velocity-bar" style="height:${h}px;opacity:${isRecent ? 1 : 0.65 + (i / WEEKLY_DATA.length) * 0.35};background:rgba(16,185,129,${isRecent ? 0.7 : 0.45});"></div>`;
              }).join("")}
            </div>
            <div class="axis-labels">
              <span class="axis-label">Feb 3</span>
              <span class="axis-label">May 12</span>
            </div>
          </div>
          <div class="velocity-stats">
            <div class="vel-stat">
              <div class="vel-stat-num">33,241</div>
              <div class="vel-stat-label">Total indexed</div>
            </div>
            <div class="vel-stat">
              <div class="vel-stat-num">23</div>
              <div class="vel-stat-label">Avg/week</div>
            </div>
          </div>
        </div>
      </div>
    </div>

  </div><!-- /bento -->
</div><!-- /page -->
</body>
</html>`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 1200, height: 900 });
await page.setContent(html, { waitUntil: "networkidle" });

const fullHeight = await page.evaluate(() => document.body.scrollHeight);
await page.setViewportSize({ width: 1200, height: fullHeight });

const screenshotPath = path.join(__dirname, "screenshot-intelligence.png");
await page.screenshot({ path: screenshotPath, fullPage: true });
await browser.close();

console.log(`Saved: ${screenshotPath}`);
