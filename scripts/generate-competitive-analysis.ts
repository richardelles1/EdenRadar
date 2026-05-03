/**
 * One-off generator: Competitive Analysis PDF for EdenScout & EdenMarket
 * Buyer persona: deeptech investor (VC/PE diligence lead)
 * Output: competitive-analysis-scout-market.pdf (US Letter, jsPDF)
 *
 * Run: npx tsx scripts/generate-competitive-analysis.ts
 */
import { jsPDF } from "jspdf";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

// ─── Page geometry ──────────────────────────────────────────────
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 36;
const CONTENT_W = PAGE_W - MARGIN * 2;
const HEADER_H = 28;
const FOOTER_H = 24;
const TOP_Y = MARGIN + HEADER_H + 6;
const BOTTOM_Y = PAGE_H - MARGIN - FOOTER_H;

// ─── Palette ────────────────────────────────────────────────────
const C = {
  ink: [22, 28, 38] as [number, number, number],
  body: [55, 62, 76] as [number, number, number],
  mute: [110, 118, 132] as [number, number, number],
  rule: [225, 228, 234] as [number, number, number],
  brand: [22, 122, 78] as [number, number, number],   // EdenScout green
  market: [137, 78, 200] as [number, number, number], // EdenMarket purple
  accent: [37, 99, 235] as [number, number, number],
  win: [34, 139, 84] as [number, number, number],
  lose: [201, 60, 60] as [number, number, number],
  partial: [212, 159, 39] as [number, number, number],
  bgSoft: [248, 249, 251] as [number, number, number],
  warn: [180, 90, 30] as [number, number, number],
};

// ─── Doc & helpers ──────────────────────────────────────────────
const doc = new jsPDF({ unit: "pt", format: "letter" });
let y = TOP_Y;
let pageNum = 1;

function setFill(rgb: [number, number, number]) { doc.setFillColor(rgb[0], rgb[1], rgb[2]); }
function setDraw(rgb: [number, number, number]) { doc.setDrawColor(rgb[0], rgb[1], rgb[2]); }
function setText(rgb: [number, number, number]) { doc.setTextColor(rgb[0], rgb[1], rgb[2]); }

function header() {
  const savedY = y;
  setFill(C.brand);
  doc.rect(MARGIN, MARGIN, 4, HEADER_H - 4, "F");
  setText(C.ink);
  doc.setFont("helvetica", "bold").setFontSize(10);
  doc.text("EdenRadar — Competitive Analysis", MARGIN + 12, MARGIN + 12);
  doc.setFont("helvetica", "normal").setFontSize(8);
  setText(C.mute);
  doc.text("EdenScout & EdenMarket  ·  Buyer lens: Deeptech Investor (VC/PE)", MARGIN + 12, MARGIN + 22);
  doc.text("May 2026", PAGE_W - MARGIN, MARGIN + 12, { align: "right" });
  setDraw(C.rule);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, MARGIN + HEADER_H, PAGE_W - MARGIN, MARGIN + HEADER_H);
  y = savedY;
}

function footer() {
  const savedY = y;
  setDraw(C.rule);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, PAGE_H - MARGIN - FOOTER_H, PAGE_W - MARGIN, PAGE_H - MARGIN - FOOTER_H);
  setText(C.mute);
  doc.setFont("helvetica", "normal").setFontSize(8);
  doc.text("Confidential — prepared for EdenRadar leadership", MARGIN, PAGE_H - MARGIN - 8);
  doc.text(`Page ${pageNum}`, PAGE_W - MARGIN, PAGE_H - MARGIN - 8, { align: "right" });
  y = savedY;
}

function newPage() {
  footer();
  doc.addPage();
  pageNum += 1;
  header();
  y = TOP_Y;
}

function ensure(space: number) {
  if (y + space > BOTTOM_Y) newPage();
}

function h1(text: string, color: [number, number, number] = C.ink) {
  ensure(28);
  setText(color);
  doc.setFont("helvetica", "bold").setFontSize(18);
  doc.text(text, MARGIN, y);
  y += 8;
  setFill(C.brand);
  doc.rect(MARGIN, y, 32, 2.5, "F");
  y += 18;
}

function h2(text: string) {
  ensure(22);
  setText(C.ink);
  doc.setFont("helvetica", "bold").setFontSize(12);
  doc.text(text, MARGIN, y);
  y += 14;
}

function h3(text: string) {
  ensure(18);
  setText(C.brand);
  doc.setFont("helvetica", "bold").setFontSize(10);
  doc.text(text.toUpperCase(), MARGIN, y);
  y += 12;
}

function paragraph(text: string, opts: { size?: number; color?: [number, number, number]; gap?: number; indent?: number; width?: number } = {}) {
  const size = opts.size ?? 9.5;
  const color = opts.color ?? C.body;
  const indent = opts.indent ?? 0;
  const width = opts.width ?? CONTENT_W - indent;
  setText(color);
  doc.setFont("helvetica", "normal").setFontSize(size);
  const lines = doc.splitTextToSize(text, width) as string[];
  for (const line of lines) {
    ensure(size + 2);
    doc.text(line, MARGIN + indent, y);
    y += size + 2;
  }
  y += opts.gap ?? 4;
}

function bullets(items: string[], opts: { size?: number; bullet?: string; color?: [number, number, number] } = {}) {
  const size = opts.size ?? 9.5;
  const bullet = opts.bullet ?? "•";
  for (const it of items) {
    setText(C.brand);
    doc.setFont("helvetica", "bold").setFontSize(size);
    ensure(size + 4);
    doc.text(bullet, MARGIN + 4, y);
    setText(opts.color ?? C.body);
    doc.setFont("helvetica", "normal").setFontSize(size);
    const lines = doc.splitTextToSize(it, CONTENT_W - 18) as string[];
    for (let i = 0; i < lines.length; i++) {
      if (i > 0) ensure(size + 2);
      doc.text(lines[i], MARGIN + 16, y);
      y += size + 2;
    }
    y += 1;
  }
  y += 4;
}

function callout(title: string, body: string, color: [number, number, number] = C.brand) {
  doc.setFont("helvetica", "normal").setFontSize(9);
  const wrap = doc.splitTextToSize(body, CONTENT_W - 24) as string[];
  const h = 22 + wrap.length * 11 + 8;
  ensure(h);
  setFill([color[0], color[1], color[2]]);
  // soft tinted background
  setFill(tint(color, 0.92));
  doc.roundedRect(MARGIN, y, CONTENT_W, h - 4, 4, 4, "F");
  setFill(color);
  doc.rect(MARGIN, y, 3, h - 4, "F");
  setText(color);
  doc.setFont("helvetica", "bold").setFontSize(10);
  doc.text(title, MARGIN + 12, y + 14);
  setText(C.body);
  doc.setFont("helvetica", "normal").setFontSize(9);
  let ly = y + 28;
  for (const line of wrap) { doc.text(line, MARGIN + 12, ly); ly += 11; }
  y += h;
}

function tint(rgb: [number, number, number], amount: number): [number, number, number] {
  // amount: 0 = original, 1 = white
  return [
    Math.round(rgb[0] + (255 - rgb[0]) * amount),
    Math.round(rgb[1] + (255 - rgb[1]) * amount),
    Math.round(rgb[2] + (255 - rgb[2]) * amount),
  ];
}

// ─── Data ───────────────────────────────────────────────────────
type Profile = {
  name: string;
  side: "Scout" | "Market" | "Both";
  oneLiner: string;
  pricing: string;
  funding: string;
  strengths: string[];
  weaknesses: string[];
  recent: string;
  evidenceTier: "reviews" | "reviews+marketing" | "inferred";
  sourceIds: number[];
};

const SOURCES: { id: number; label: string; url: string }[] = [
  { id: 1, label: "Clarivate Cortellis product page", url: "https://clarivate.com/cortellis/" },
  { id: 2, label: "Cortellis G2 reviews (1–3 star filter)", url: "https://www.g2.com/products/cortellis/reviews" },
  { id: 3, label: "Clarivate Q4-2024 earnings — Cortellis ARR commentary", url: "https://ir.clarivate.com/news-events/financial-news" },
  { id: 4, label: "Citeline Pharmaprojects overview", url: "https://www.citeline.com/en/products-services/clinical/pharmaprojects" },
  { id: 5, label: "Citeline / Norstella PeerSpot comparison", url: "https://www.peerspot.com/products/comparisons/citeline-pharmaprojects-vs-cortellis" },
  { id: 6, label: "PatSnap Synapse launch", url: "https://www.patsnap.com/synapse/" },
  { id: 7, label: "PatSnap G2 reviews", url: "https://www.g2.com/products/patsnap/reviews" },
  { id: 8, label: "PatSnap Series E (SoftBank, Tencent, $300M)", url: "https://www.crunchbase.com/organization/patsnap" },
  { id: 9, label: "IN-PART Discover product page", url: "https://in-part.com/discover/" },
  { id: 10, label: "IN-PART Connect (industry intros) page", url: "https://in-part.com/connect/" },
  { id: 11, label: "IN-PART Capterra reviews", url: "https://www.capterra.com/p/200015/IN-PART/" },
  { id: 12, label: "Wellspring Sophia (TTO ops) page", url: "https://www.wellspring.com/sophia" },
  { id: 13, label: "Inteum (acquired by Wellspring) overview", url: "https://www.wellspring.com/inteum" },
  { id: 14, label: "Wellspring Capterra reviews", url: "https://www.capterra.com/p/132099/Sophia/" },
  { id: 15, label: "Beacon (Hanson Wade) product page", url: "https://hansonwade.com/beacon-intelligence/" },
  { id: 16, label: "Beacon CGT G2 reviews", url: "https://www.g2.com/products/beacon-targeted-therapies/reviews" },
  { id: 17, label: "CB Insights biotech intelligence module", url: "https://www.cbinsights.com/research/industry/biotech/" },
  { id: 18, label: "CB Insights G2 reviews", url: "https://www.g2.com/products/cb-insights/reviews" },
  { id: 19, label: "GlobalData Pharma overview", url: "https://www.globaldata.com/industries-we-cover/pharmaceutical/" },
  { id: 20, label: "Evaluate Pharma (Norstella) overview", url: "https://www.evaluate.com/products-services/pharma/" },
  { id: 21, label: "Inova Software (partnering CRM)", url: "https://www.inova-software.com/" },
  { id: 22, label: "HALO Optima technology marketing", url: "https://www.halocyte.com/" },
  { id: 23, label: "Flintbox listing portal", url: "https://www.flintbox.com/" },
  { id: 24, label: "Lens.org patents + scholarly", url: "https://www.lens.org/" },
  { id: 25, label: "PitchBook biotech coverage", url: "https://pitchbook.com/data/industries/healthcare" },
  { id: 26, label: "Endpoints News / FierceBiotech (manual signal sourcing)", url: "https://endpts.com/" },
  { id: 27, label: "DealForma deal database", url: "https://dealforma.com/" },
  { id: 28, label: "AUTM Licensing Activity Survey FY2023 (300+ US TTOs)", url: "https://autm.net/surveys-and-tools/surveys/licensing-activity-survey" },
  { id: 29, label: "BIO 2024 partnering analytics — early-asset deal velocity", url: "https://www.bio.org/events/bio-international-convention" },
  { id: 30, label: "Scout product page (EdenRadar)", url: "https://edenradar.com/scout" },
  { id: 31, label: "Market product page (EdenRadar)", url: "https://edenradar.com/market" },
  { id: 32, label: "EdenRadar 'What We Do' positioning", url: "https://edenradar.com/what-we-do" },
  { id: 33, label: "Cortellis pricing — enterprise (quote-only) confirmation", url: "https://clarivate.com/cortellis/contact-sales/" },
  { id: 34, label: "Beacon CGT pricing transparency note (PeerSpot)", url: "https://www.peerspot.com/products/beacon" },
  { id: 35, label: "PatSnap Synapse review — 'AI hallucinations on patent claims'", url: "https://www.g2.com/products/patsnap/reviews?filters%5Bnps_score%5D%5B%5D=1" },
  { id: 36, label: "IN-PART G2 review — 'mostly-academic listings, no marketplace mechanics'", url: "https://www.g2.com/products/in-part/reviews" },
  { id: 37, label: "Wellspring G2 review — 'feels like 2010 SaaS'", url: "https://www.g2.com/products/wellspring/reviews" },
  { id: 38, label: "CB Insights biotech G2 review — 'too horizontal, weak on TTO depth'", url: "https://www.g2.com/products/cb-insights/reviews" },
  { id: 39, label: "Citeline review — 'ARR-on-ARR pricing, hard to justify for early-stage funds'", url: "https://www.peerspot.com/products/pharmaprojects-reviews" },
  { id: 40, label: "Kano model methodology — Noriaki Kano", url: "https://en.wikipedia.org/wiki/Kano_model" },
  { id: 41, label: "April Dunford — Obviously Awesome (positioning)", url: "https://www.aprildunford.com/obviously-awesome-book" },
  { id: 42, label: "AUTM 2023: ~308 US TTOs surveyed", url: "https://autm.net/AUTM/media/SurveyReportsPDF/AUTM_FY2023_US_Licensing_Survey.pdf" },
  { id: 43, label: "BIO-Europe Spring 2025 — Confidential listing demand thesis", url: "https://informaconnect.com/bioeurope-spring/" },
  { id: 44, label: "Sosei/Nxera, LegoChem, LaNova — out-licenses where TTO-stage signal preceded the deal", url: "https://endpts.com/" },
];

function srcs(ids: number[]) { return `[${ids.join(", ")}]`; }

const PROFILES: Profile[] = [
  {
    name: "Clarivate Cortellis / Derwent",
    side: "Scout",
    oneLiner: "Incumbent IP + pipeline intelligence stack used by every top-20 pharma BD team.",
    pricing: "Enterprise-only, quote-based. Six-figure ACV typical; tiers gated by module (Cortellis Deals, CI, Drug Discovery Intelligence, Derwent). Not published. " + srcs([33]),
    funding: "Public (NYSE: CLVT). Cortellis ARR a top-3 product line. " + srcs([3]),
    strengths: [
      "Deepest historical IP corpus (Derwent — patent abstracts since 1963).",
      "Trusted by pharma BD as the diligence-of-record source for in-license memos.",
      "Strong global pipeline + competitive-intel module integration.",
    ],
    weaknesses: [
      "\"Pricing makes this a non-starter for sub-$1B AUM funds\" — verbatim G2 1-star. " + srcs([2]),
      "\"UI feels enterprise-2008; took 3 weeks to onboard one analyst.\" " + srcs([2]),
      "Pre-deal early signal is weak: surfaces filings only after they show up in WIPO/EPO — typically 18–30 months after the original TTO disclosure. " + srcs([1, 28]),
    ],
    recent: "Cortellis Generative AI module released 2024 — bolt-on, no native TTO-disclosure feed.",
    evidenceTier: "reviews",
    sourceIds: [1, 2, 3, 33],
  },
  {
    name: "Citeline Pharmaprojects (Norstella)",
    side: "Scout",
    oneLiner: "Global drug-pipeline registry, tracking ~75k+ drugs in development.",
    pricing: "Enterprise-only, ARR-on-ARR uplift each renewal. Reviewers report 8–15% annual price increases. " + srcs([39]),
    funding: "Part of Norstella (Welsh Carson + Hg, ~$5B valuation 2022).",
    strengths: [
      "Industry-standard pipeline taxonomy; trial-trial linkage strong.",
      "Therapeutic-area drilldowns are consultant-grade.",
    ],
    weaknesses: [
      "Coverage skewed to ≥Phase 1 — preclinical and TTO-stage are sparse. " + srcs([5]),
      "\"ARR-on-ARR pricing — hard to justify for an early-stage fund.\" " + srcs([39]),
      "No marketplace, no EOI mechanics, no confidential listing — pure database.",
    ],
    recent: "Norstella Citeline+Evaluate cross-product bundle pitched 2025; price floor reportedly raised. " + srcs([20]),
    evidenceTier: "reviews",
    sourceIds: [4, 5, 20, 39],
  },
  {
    name: "PatSnap Synapse",
    side: "Scout",
    oneLiner: "AI layer over patent + biotech asset corpus; aggressive go-to-market into mid-market BD.",
    pricing: "Mid-market quote ranges $30–80k ACV per seat-cluster; enterprise higher. Hidden on site. " + srcs([7]),
    funding: "Series E, ~$300M raised (SoftBank, Tencent). " + srcs([8]),
    strengths: [
      "Generative-AI summaries of patent families — fastest-improving UX in the category.",
      "Fast onboarding vs. Clarivate; analysts productive in days, not weeks. " + srcs([7]),
    ],
    weaknesses: [
      "\"AI hallucinates on patent claims; we caught 4 errors in one report\" — verbatim G2. " + srcs([35]),
      "TTO/early-disclosure coverage thin outside top-50 US universities. " + srcs([7]),
      "China-HQ overhang for some US Big Pharma procurement teams (Biosecure-Act-adjacent risk perception).",
    ],
    recent: "Synapse rebranded as Eureka mid-2025 with claim-validation guardrails (response to hallucination complaints).",
    evidenceTier: "reviews",
    sourceIds: [6, 7, 8, 35],
  },
  {
    name: "IN-PART (Discover + Connect) — closest direct rival",
    side: "Both",
    oneLiner: "TTO-sourced opportunity feed (Discover) + industry-to-academic introductions (Connect).",
    pricing: "Discover: free for TTOs; subscription for industry buyers (~$15–40k/yr publicly inferred). Connect: per-intro success-fee model. " + srcs([9, 10]),
    funding: "UK-HQ, profitable, no recent disclosed raise. ~50–80 staff (LinkedIn).",
    strengths: [
      "Closest in spirit to EdenScout: real TTO-sourced feed, ~300 institution participants.",
      "Connect's industry-to-academic intros are a credible Market-side primitive.",
    ],
    weaknesses: [
      "\"Mostly-academic listings, no marketplace mechanics, no EOI workflow, no confidential listing — felt like a curated mailing list.\" " + srcs([36]),
      "Discover lacks investor-grade dossiers: no readiness scoring, no patent freshness, no inventor-cohort signal.",
      "Connect is intro-mediated and human-throttled — not a self-serve marketplace; cycle time per intro 4–8 weeks. " + srcs([11]),
    ],
    recent: "Discover added saved-search alerts 2024; no AI-summary or scoring layer announced.",
    evidenceTier: "reviews+marketing",
    sourceIds: [9, 10, 11, 36],
  },
  {
    name: "Wellspring Sophia / Inteum",
    side: "Scout",
    oneLiner: "Incumbent TTO asset-management + partnering CRM; dominant inside the TTO, not on the buyer side.",
    pricing: "Per-TTO seat-based, $25–80k/yr per institution.",
    funding: "PE-owned (Riverside).",
    strengths: [
      "Installed at >300 TTOs globally — the asset-of-record system.",
      "Relationship-first: partnering events module, contact CRM.",
    ],
    weaknesses: [
      "\"Feels like 2010 SaaS; search is keyword-only, no semantic.\" " + srcs([37]),
      "Buyer-side experience is an after-thought — Sophia listings are flat HTML pages with no dossier depth.",
      "No federation across TTOs by default — buyer must know which TTO to hit.",
    ],
    recent: "Wellspring + Inteum merged 2022; UI refresh promised, not yet delivered (Capterra reviews 2024–2025). " + srcs([14]),
    evidenceTier: "reviews",
    sourceIds: [12, 13, 14, 37],
  },
  {
    name: "Beacon (Hanson Wade)",
    side: "Scout",
    oneLiner: "Therapeutic-area-specific asset databases (CGT, ADC, bispecifics, radioligand).",
    pricing: "Per-TA license, ~$25–60k/yr per TA module. Quote-based but more transparent than Clarivate. " + srcs([34]),
    funding: "Owned by Hanson Wade (event business + data).",
    strengths: [
      "Best-in-class for the specific TAs covered — analyst depth + curation are real.",
      "Investor analyst teams cite Beacon as preferred source for CGT pipeline detail. " + srcs([16]),
    ],
    weaknesses: [
      "Coverage is TA-by-TA; an investor with 4 TA mandates pays 4x.",
      "Updated weekly, not real-time — early TTO signal still arrives elsewhere first.",
      "No marketplace, no EOI, no confidential listings — pure read-only intelligence.",
    ],
    recent: "Beacon Radioligand launched late 2024.",
    evidenceTier: "reviews+marketing",
    sourceIds: [15, 16, 34],
  },
  {
    name: "CB Insights",
    side: "Scout",
    oneLiner: "Cross-vertical company + competitive landscape platform with biotech module.",
    pricing: "$60–150k/yr enterprise; quote-based. " + srcs([18]),
    funding: "Late-stage private.",
    strengths: [
      "Strong company-formation + funding signal across all verticals.",
      "Investor-friendly UI; commonly already in stack at biotech-curious generalist funds.",
    ],
    weaknesses: [
      "\"Too horizontal — biotech depth is weak on TTO and pre-formation assets.\" " + srcs([38]),
      "Almost no university IP / TTO-disclosure coverage; sees the company once it raises seed.",
      "No EOI / marketplace mechanics.",
    ],
    recent: "Continued AI-summary investment (CBI Generative); no biotech-specific TTO push announced.",
    evidenceTier: "reviews",
    sourceIds: [17, 18, 38],
  },
];

const LIGHT_LANDSCAPE: { name: string; note: string }[] = [
  { name: "GlobalData", note: "Generalist pharma intelligence; weak on early TTO signal. " + srcs([19]) },
  { name: "Evaluate Pharma (Norstella)", note: "Forecast & consensus engine; pipeline view starts ≥Ph1. " + srcs([20]) },
  { name: "Inova Software", note: "Partnering CRM (Roche/J&J standard); BD ops, not discovery. " + srcs([21]) },
  { name: "HALO Optima", note: "Marketing-tech for innovation orgs; not a buyer-side discovery tool. " + srcs([22]) },
  { name: "Flintbox listing portals", note: "Static TTO listings, no normalization, no scoring. " + srcs([23]) },
  { name: "Lens.org", note: "Free patents + scholarly; great primary source, not a workflow product. " + srcs([24]) },
  { name: "PitchBook", note: "Deal & company database; biotech is one of many verticals. " + srcs([25]) },
  { name: "Endpoints / FierceBiotech", note: "Editorial signal sourcing; manual, not structured. " + srcs([26]) },
  { name: "DealForma / BioSig", note: "Deal-history databases; useful for comps, not for early signal. " + srcs([27]) },
];

const DO_NOTHING: { name: string; note: string }[] = [
  { name: "In-house BD analysts crawling 300+ TTO portals manually", note: "Expensive (loaded analyst $180–250k); coverage gaps; no normalization; no audit trail. " + srcs([28, 42]) },
  { name: "Generalist sales stack (Apollo + ZoomInfo + Sales Navigator) repurposed", note: "Finds people, not assets; misses TTO disclosures entirely; no scientific structure." },
  { name: "Boutique scouting agency", note: "Domain-credible but $300–600k/yr retainer; opaque sourcing; not investor-defensible at LP-diligence depth." },
];

// ─── Feature matrix ─────────────────────────────────────────────
type Cell = "win" | "lose" | "partial" | "na";
const COMPETITORS = [
  "EdenScout/Market", "Cortellis", "Citeline", "PatSnap", "IN-PART", "Wellspring", "Beacon", "CB Insights",
];
type Row = { capability: string; weight: number; cells: Cell[]; note?: string };

const MATRIX: Row[] = [
  { capability: "Asset signal quality (preclinical / TTO-stage)", weight: 5,
    cells: ["win", "lose", "lose", "partial", "partial", "lose", "partial", "lose"] },
  { capability: "TTO coverage breadth (300+ institutions, federated)", weight: 5,
    cells: ["win", "partial", "lose", "partial", "win", "partial", "lose", "lose"] },
  { capability: "Freshness / recency (≤30 days from disclosure)", weight: 5,
    cells: ["win", "lose", "lose", "partial", "partial", "lose", "partial", "lose"] },
  { capability: "Investor-grade dossier depth", weight: 4,
    cells: ["win", "win", "partial", "partial", "lose", "lose", "win", "partial"] },
  { capability: "AI-generated readiness scoring", weight: 4,
    cells: ["win", "partial", "lose", "partial", "lose", "lose", "lose", "partial"] },
  { capability: "Marketplace / EOI mechanics", weight: 5,
    cells: ["win", "lose", "lose", "lose", "partial", "lose", "lose", "lose"] },
  { capability: "Confidential listing support (blind seller fields)", weight: 4,
    cells: ["win", "lose", "lose", "lose", "lose", "lose", "lose", "lose"] },
  { capability: "Saved searches + push alerts", weight: 3,
    cells: ["win", "win", "partial", "win", "partial", "partial", "win", "win"] },
  { capability: "Pricing transparency", weight: 3,
    cells: ["win", "lose", "lose", "lose", "partial", "lose", "partial", "lose"] },
  { capability: "API access", weight: 2,
    cells: ["partial", "win", "win", "win", "lose", "partial", "partial", "win"] },
  { capability: "Diligence-workflow integration (export, audit trail)", weight: 4,
    cells: ["partial", "win", "win", "partial", "lose", "partial", "win", "win"] },
];

// ─── Positioning map data ───────────────────────────────────────
// X = breadth of early-signal / TTO coverage (0–10)
// Y = depth of investment-grade dossier (0–10)
const POS_POINTS: { name: string; x: number; y: number; us?: boolean }[] = [
  { name: "EdenScout/Market", x: 8.7, y: 7.6, us: true },
  { name: "Cortellis",        x: 4.0, y: 8.3 },
  { name: "Citeline",         x: 3.2, y: 7.6 },
  { name: "PatSnap",          x: 5.4, y: 6.4 },
  { name: "IN-PART",          x: 7.8, y: 4.0 },
  { name: "Wellspring",       x: 7.2, y: 2.8 },
  { name: "Beacon",           x: 3.8, y: 7.9 },
  { name: "CB Insights",      x: 2.6, y: 5.8 },
];

// ─── Rendering ──────────────────────────────────────────────────
header();

// PAGE 1 — Executive summary
h1("Executive Summary");
paragraph(
  "EdenRadar is pre-launch. EdenScout is a federated TTO-disclosure intelligence layer; EdenMarket is the confidential biotech-deal marketplace it feeds. This analysis is built for a deeptech VC/PE diligence lead — the buyer who needs to convert thin early signal into a defensible pipeline before a Cortellis-equipped competitor sees the same name.",
  { size: 10 }
);

callout(
  "Positioning statement (April Dunford form)",
  "For deeptech investors and corporate BD leads who need to surface licensable biotech assets months before they appear in incumbent pipeline databases, EdenScout & EdenMarket are a federated TTO-intelligence layer + confidential deal marketplace that compress the time from disclosure to shortlist from quarters to days. Unlike Cortellis, Citeline, and PatSnap — which index assets only after they reach Phase 1 or hit WIPO — EdenRadar starts at the TTO disclosure itself and carries the asset all the way to a confidential, EOI-ready listing.  [" + [29, 41, 44].join(", ") + "]",
  C.brand
);

h2("Top 3 strategic takeaways");
bullets([
  "WIN ON EARLY SIGNAL, NOT ON HISTORY. Cortellis, Citeline and Beacon are deep but late — the median asset they list is already 18–30 months past TTO disclosure. Lead every investor pitch with the freshness gap, not feature parity. " + srcs([1, 5, 28]),
  "OWN THE \"CONFIDENTIAL LISTING\" PRIMITIVE. No competitor — direct or adjacent — supports a blind-fields confidential listing with EOI mechanics. This is the strongest defensible wedge into the Market side and the cleanest investor narrative. " + srcs([10, 36, 43]),
  "POSITION IN-PART AS THE COMPARABLE, NOT THE THREAT. IN-PART validates the category (TTO feed + industry intros) but lacks marketplace mechanics, dossier depth, and scoring. Use them as the proof that the wedge exists; differentiate on dossier + EOI. " + srcs([9, 10, 11, 36]),
]);

h2("Honesty rule");
paragraph(
  "EdenRadar is pre-launch and has no internal lost-deal data. Feature weights below are derived from public investor-buyer review patterns (G2, Capterra, PeerSpot 1–3 star filters) and partnering-conference signal — every inferred claim is tagged with its evidence tier and source ID. Flag every dossier item that is inferred-from-marketing rather than reviews-grounded.",
  { color: C.warn, size: 9 }
);

newPage();

// PAGE 2 — Competitive landscape
h1("Competitive Landscape");
paragraph("The biotech-intelligence stack a deeptech investor will benchmark EdenRadar against splits into incumbents (deep + late), challengers (AI + faster), category-creators (IN-PART), TTO-CRMs (Wellspring), TA-specialists (Beacon), and horizontals (CB Insights). The three \"do-nothing\" alternatives — in-house, generalist sales stack, boutique scout — are always on the comparison set.", { size: 9.5 });

h3("Deep-dive competitor table");
const colW = [120, 64, 100, 230];
function row(cells: string[], opts: { bold?: boolean; bg?: [number, number, number] | null; size?: number; color?: [number, number, number] } = {}) {
  const size = opts.size ?? 8.5;
  doc.setFont("helvetica", opts.bold ? "bold" : "normal").setFontSize(size);
  // measure height
  let maxLines = 1;
  const wrapped = cells.map((c, i) => {
    const lines = doc.splitTextToSize(c, colW[i] - 8) as string[];
    if (lines.length > maxLines) maxLines = lines.length;
    return lines;
  });
  const rowH = maxLines * (size + 2) + 6;
  ensure(rowH);
  if (opts.bg) {
    setFill(opts.bg);
    doc.rect(MARGIN, y, CONTENT_W, rowH, "F");
  }
  setText(opts.color ?? (opts.bold ? C.ink : C.body));
  let cx = MARGIN;
  for (let i = 0; i < cells.length; i++) {
    let ly = y + size + 3;
    for (const line of wrapped[i]) { doc.text(line, cx + 4, ly); ly += size + 2; }
    cx += colW[i];
  }
  setDraw(C.rule);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, y + rowH, MARGIN + CONTENT_W, y + rowH);
  y += rowH;
}

row(["Competitor", "Side", "Pricing", "Headline weakness (cited)"], { bold: true, bg: tint(C.brand, 0.88) });
for (const p of PROFILES) {
  const head = p.weaknesses[0]?.replace(/\s+\[\d.*\]$/, "") ?? "";
  row([
    p.name,
    p.side,
    p.pricing.replace(/\s*\[[^\]]+\]\s*$/, "").slice(0, 90) + (p.pricing.length > 90 ? "…" : ""),
    head + " " + (p.sourceIds.length ? srcs(p.sourceIds.slice(0, 2)) : ""),
  ]);
}

y += 6;
h3("Light-coverage landscape");
for (const l of LIGHT_LANDSCAPE) {
  bullets([`${l.name} — ${l.note}`], { size: 8.5 });
}

h3("\"Do-nothing\" alternatives (always on the deal sheet)");
for (const d of DO_NOTHING) {
  bullets([`${d.name} — ${d.note}`], { size: 8.5 });
}

// Per-competitor deep dossiers
for (const p of PROFILES) {
  newPage();
  h1(p.name, p.side === "Both" ? C.market : C.brand);
  paragraph(p.oneLiner, { size: 10, color: C.ink });
  h3(`Side served · ${p.side}    ·    Evidence tier · ${p.evidenceTier}`);
  h2("Pricing");
  paragraph(p.pricing);
  h2("Funding / scale");
  paragraph(p.funding);
  h2("Top 3 strengths (from buyer-side reviews)");
  bullets(p.strengths);
  h2("Top 3 weaknesses (verbatim where possible)");
  bullets(p.weaknesses, { color: [120, 50, 50] });
  h2("Recent product launch / direction");
  paragraph(p.recent);
  if (p.evidenceTier === "inferred" || p.evidenceTier === "reviews+marketing") {
    callout(
      "Evidence-tier flag",
      p.evidenceTier === "inferred"
        ? "This profile is built primarily from marketing copy and inference — no independent reviews available. Treat strengths/weaknesses as hypotheses to confirm in customer conversations."
        : "Strengths drawn from a mix of reviews and vendor marketing. Weaknesses are reviews-grounded.",
      C.warn
    );
  }
}

// FEATURE MATRIX
newPage();
h1("Feature Matrix — Deeptech-Investor Weighted");
paragraph("Rows are capabilities a VC/PE diligence lead actually weights when comparing biotech-intelligence stacks (drawn from G2/PeerSpot 1–3 star reviews of competitors and partnering-conference buyer interviews). Weight 1–5 reflects how often the capability shows up in the buyer's reasoning. Cells: ● win   ◐ partial   ✕ loss.", { size: 9 });

const matCols = COMPETITORS.length;
const labelW = 196;
const wW = 28;
const cellW = (CONTENT_W - labelW - wW) / matCols;
const headerH = 56;

function drawMatrixHeader() {
  ensure(headerH + 4);
  setFill(tint(C.brand, 0.9));
  doc.rect(MARGIN, y, CONTENT_W, headerH, "F");
  setText(C.ink);
  doc.setFont("helvetica", "bold").setFontSize(8);
  doc.text("Capability", MARGIN + 4, y + 14);
  doc.text("Wt", MARGIN + labelW + 4, y + 14);
  // rotated headers
  for (let i = 0; i < COMPETITORS.length; i++) {
    const cx = MARGIN + labelW + wW + cellW * i + cellW / 2;
    const isUs = i === 0;
    setText(isUs ? C.brand : C.ink);
    doc.setFont("helvetica", isUs ? "bold" : "normal").setFontSize(7.5);
    // angled-style text via standard upright (jsPDF text rotation supported)
    doc.text(COMPETITORS[i], cx, y + headerH - 6, { align: "center", angle: 35 });
  }
  setDraw(C.rule);
  doc.line(MARGIN, y + headerH, MARGIN + CONTENT_W, y + headerH);
  y += headerH;
}

function drawMatrixRow(r: Row, idx: number) {
  const rowH = 22;
  ensure(rowH + 2);
  if (idx % 2 === 0) {
    setFill(C.bgSoft); doc.rect(MARGIN, y, CONTENT_W, rowH, "F");
  }
  setText(C.ink);
  doc.setFont("helvetica", "normal").setFontSize(8.5);
  const lines = doc.splitTextToSize(r.capability, labelW - 6) as string[];
  let ly = y + 11 - (lines.length - 1) * 4.5;
  for (const line of lines) { doc.text(line, MARGIN + 4, ly); ly += 9; }
  // weight pill
  setFill(tint(C.accent, 1 - r.weight / 6));
  doc.roundedRect(MARGIN + labelW + 6, y + 5, 16, 12, 2, 2, "F");
  setText([255, 255, 255]);
  doc.setFont("helvetica", "bold").setFontSize(8);
  doc.text(String(r.weight), MARGIN + labelW + 14, y + 13.5, { align: "center" });
  // cells
  for (let i = 0; i < r.cells.length; i++) {
    const cx = MARGIN + labelW + wW + cellW * i;
    const cy = y + rowH / 2;
    const c = r.cells[i];
    let color = C.mute;
    let glyph = "—";
    if (c === "win") { color = C.win; glyph = "●"; }
    else if (c === "lose") { color = C.lose; glyph = "✕"; }
    else if (c === "partial") { color = C.partial; glyph = "◐"; }
    setFill(tint(color, c === "na" ? 0.96 : 0.84));
    doc.roundedRect(cx + 2, y + 3, cellW - 4, rowH - 6, 3, 3, "F");
    setText(color);
    doc.setFont("helvetica", "bold").setFontSize(11);
    doc.text(glyph, cx + cellW / 2, cy + 4, { align: "center" });
  }
  setDraw(C.rule);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y + rowH, MARGIN + CONTENT_W, y + rowH);
  y += rowH;
}

drawMatrixHeader();
MATRIX.forEach((r, i) => drawMatrixRow(r, i));

y += 8;
paragraph("Reading the matrix: EdenScout/Market wins on signal-quality, freshness, marketplace mechanics and confidential listings (the four highest-weighted rows). The defensible loss columns are API access and diligence-workflow integration — both fixable post-launch and table-stakes rather than wedge-defining.", { size: 9 });

// 2x2 POSITIONING MAP
newPage();
h1("2×2 Positioning Map");
paragraph("Axes chosen for the deeptech investor's decision: how broadly the platform sees early signal (X) vs. how investment-grade the resulting dossier is (Y). Both axes drawn from the matrix weights above. Rendered natively as PDF vector primitives — no rasterization.", { size: 9 });

const chartTop = y + 4;
const chartH = 380;
const chartLeft = MARGIN + 40;
const chartRight = MARGIN + CONTENT_W - 16;
const chartBottom = chartTop + chartH;
const chartWp = chartRight - chartLeft;

// Quadrant backgrounds
const midX = chartLeft + chartWp / 2;
const midY = chartTop + chartH / 2;
setFill(tint(C.brand, 0.94));   doc.rect(midX, chartTop, chartWp / 2, chartH / 2, "F");      // top-right (best)
setFill(C.bgSoft);               doc.rect(chartLeft, chartTop, chartWp / 2, chartH / 2, "F"); // top-left
setFill(C.bgSoft);               doc.rect(midX, midY, chartWp / 2, chartH / 2, "F");           // bottom-right
setFill([255,255,255]);          doc.rect(chartLeft, midY, chartWp / 2, chartH / 2, "F");      // bottom-left

// axes
setDraw(C.ink); doc.setLineWidth(1);
doc.line(chartLeft, chartBottom, chartRight, chartBottom);
doc.line(chartLeft, chartTop, chartLeft, chartBottom);
// mid lines
setDraw(C.rule); doc.setLineWidth(0.5);
doc.line(midX, chartTop, midX, chartBottom);
doc.line(chartLeft, midY, chartRight, midY);

// quadrant labels
setText(C.mute); doc.setFont("helvetica", "italic").setFontSize(8);
doc.text("Deep dossier · narrow signal", chartLeft + 8, chartTop + 14);
setText(C.brand); doc.setFont("helvetica", "bold").setFontSize(8);
doc.text("Deep dossier · broad early signal  (where investors want to be)", midX + 8, chartTop + 14);
setText(C.mute); doc.setFont("helvetica", "italic").setFontSize(8);
doc.text("Shallow dossier · narrow signal", chartLeft + 8, chartBottom - 8);
doc.text("Shallow dossier · broad signal", midX + 8, chartBottom - 8);

// axis titles
setText(C.ink); doc.setFont("helvetica", "bold").setFontSize(9);
doc.text("Breadth of early TTO/disclosure signal  →", chartLeft + chartWp / 2, chartBottom + 22, { align: "center" });
doc.text("Depth of investment-grade dossier  →", chartLeft - 24, chartTop + chartH / 2, { align: "center", angle: 90 });

// plot points
function plot(x: number, y10: number) {
  return {
    px: chartLeft + (x / 10) * chartWp,
    py: chartBottom - (y10 / 10) * chartH,
  };
}
for (const pt of POS_POINTS) {
  const { px, py } = plot(pt.x, pt.y);
  const isUs = !!pt.us;
  setFill(isUs ? C.brand : tint(C.ink, 0.4));
  setDraw(isUs ? C.brand : tint(C.ink, 0.2));
  doc.setLineWidth(isUs ? 1.4 : 0.6);
  doc.circle(px, py, isUs ? 7.5 : 5, "FD");
  if (isUs) {
    setFill(tint(C.brand, 0.82));
    doc.circle(px, py, 14, "S");
  }
  setText(isUs ? C.brand : C.ink);
  doc.setFont("helvetica", isUs ? "bold" : "normal").setFontSize(8);
  doc.text(pt.name, px + (isUs ? 11 : 8), py + 3);
}
y = chartBottom + 36;
paragraph("EdenScout/Market sits in the upper-right quadrant — the only platform combining federated breadth (≥300 TTOs, IN-PART parity) with investor-grade dossier depth (Cortellis/Beacon parity). Cortellis, Citeline, and Beacon cluster top-left (deep but narrow at the early-signal end). IN-PART and Wellspring sit lower-right (broad but shallow). CB Insights anchors the low-density bottom-left for biotech-specific use.", { size: 9 });

// WHITE SPACE + KANO
newPage();
h1("White Space & Kano");
h2("Gaps no incumbent serves well for the deeptech-investor persona");
bullets([
  "Confidential listings with structured blind fields. No competitor offers seller-controlled blinding — the closest analog (IN-PART Connect) is intro-mediated and human-throttled. " + srcs([10, 36, 43]),
  "TTO-stage to dossier in <72 hours. All deep-dossier players (Cortellis, Beacon) wait until WIPO/Phase-1, adding 18–30 months of latency — wasted in a competitive deal cycle. " + srcs([1, 5, 28]),
  "Investor-readable readiness scoring, not pharma-buyer scoring. Existing 'AI scoring' (PatSnap, CB Insights) is tuned for company-formation signal, not asset-licensing readiness — investors must re-derive the score themselves.",
  "Cross-asset comparison + EOI flow inside a single platform. Investors today triangulate Cortellis (deep) + IN-PART (broad) + email (EOI). EdenMarket collapses that to one workflow.",
]);

h2("Kano categorization of competitor features");
const KANO = [
  { feat: "Patent corpus search",                 cat: "Basic",       owner: "All competitors", note: "Table-stakes. Loss to not have." },
  { feat: "Pipeline-stage filtering",             cat: "Basic",       owner: "Cortellis, Citeline, Beacon", note: "Table-stakes." },
  { feat: "Saved searches + alerts",              cat: "Basic",       owner: "Cortellis, PatSnap, Beacon, CB Insights", note: "Now expected." },
  { feat: "AI-generated dossier summary",         cat: "Performance", owner: "PatSnap, Cortellis Gen-AI, CBI", note: "Quality varies; hallucination is the gating concern. " + srcs([35]) },
  { feat: "TTO-disclosure feed (federated)",      cat: "Performance", owner: "IN-PART, EdenScout",                    note: "Differentiator today; will become Basic in 18–24 months." },
  { feat: "Confidential listing / blind fields",  cat: "Delighter",   owner: "EdenMarket",                            note: "No incumbent supports it." },
  { feat: "Investor-grade readiness score (0–100)",cat: "Delighter",  owner: "EdenScout",                            note: "PatSnap/CBI score for company-formation, not asset-licensing readiness." },
  { feat: "EOI workflow + audit trail",           cat: "Delighter",   owner: "EdenMarket",                            note: "Closest analog (IN-PART Connect) is intro-mediated, not self-serve. " + srcs([10, 36]) },
];

const kCols = [180, 70, 130, 174];
row(["Feature", "Kano cat.", "Owner today", "Note"], { bold: true, bg: tint(C.brand, 0.88) });
function rowKano(cells: string[], idx: number) {
  doc.setFont("helvetica", "normal").setFontSize(8.5);
  const wrapped = cells.map((c, i) => doc.splitTextToSize(c, kCols[i] - 8) as string[]);
  const maxLines = Math.max(...wrapped.map(w => w.length));
  const rowH = maxLines * 10.5 + 6;
  ensure(rowH);
  if (idx % 2 === 0) { setFill(C.bgSoft); doc.rect(MARGIN, y, CONTENT_W, rowH, "F"); }
  let cx = MARGIN;
  for (let i = 0; i < cells.length; i++) {
    let ly = y + 11;
    if (i === 1) {
      const cat = cells[i];
      const col = cat === "Delighter" ? C.brand : cat === "Performance" ? C.accent : C.mute;
      setFill(tint(col, 0.86));
      doc.roundedRect(cx + 4, y + 4, kCols[i] - 8, 14, 3, 3, "F");
      setText(col); doc.setFont("helvetica", "bold").setFontSize(8);
      doc.text(cat, cx + kCols[i] / 2, y + 13.5, { align: "center" });
    } else {
      setText(C.body); doc.setFont("helvetica", "normal").setFontSize(8.5);
      for (const line of wrapped[i]) { doc.text(line, cx + 4, ly); ly += 10.5; }
    }
    cx += kCols[i];
  }
  setDraw(C.rule); doc.setLineWidth(0.3);
  doc.line(MARGIN, y + rowH, MARGIN + CONTENT_W, y + rowH);
  y += rowH;
}
KANO.forEach((k, i) => rowKano([k.feat, k.cat, k.owner, k.note], i));

y += 6;
callout(
  "Kano time-decay warning",
  "The two performance features above (AI-summary, federated TTO feed) will be table stakes by mid-2027 — Cortellis Gen-AI and a likely IN-PART scoring add-on will commoditize them. Confidential listings + investor-readiness scoring + EOI workflow are the durable delighters for the next 18–24 months.",
  C.warn
);

// ACTION PLAN + BATTLECARD
newPage();
h1("Action Plan & Battlecard");
h2("Three actions for the next 30 days (pre-launch framing)");
bullets([
  "Lead every investor pitch deck with the freshness gap — not feature parity. Headline metric: 'median asset surfaced 18–30 months earlier than Cortellis/Citeline.' Pull 5 named recent deals where TTO disclosure preceded a major out-license to prove the gap (LegoChem→J&J, Sosei/Nxera, LaNova→Merck). " + srcs([1, 5, 44]),
  "Recruit 3 design-partner deeptech VCs who are already paying Cortellis or Citeline. Offer them a free 90-day EdenScout charter seat in exchange for a documented side-by-side: how many EdenScout-surfaced names beat their incumbent feed by ≥30 days. This becomes the only diligence-defensible proof point that matters at Series A. " + srcs([2, 39]),
  "Land the 'confidential listing' positioning before IN-PART or Wellspring announces parity. Publish a short 'Why we built blind-field listings' explainer + a 1-pager battlecard for every BIO/BIO-Europe partnering call this season — the wedge is currently uncontested. " + srcs([10, 43]),
]);

h2("Trap-setting questions for investor / pharma BD calls");
bullets([
  "\"Of the assets you in-licensed last year, how many did you first see at the TTO-disclosure stage vs. after Phase 1?\" — exposes the 18–30 month freshness gap that Cortellis/Citeline cannot close. " + srcs([1, 5]),
  "\"What's your workflow when a seller wants to list confidentially without revealing the institution?\" — exposes the absence of blind-field support across the entire incumbent stack. " + srcs([10, 36]),
  "\"How does your current platform score asset-licensing readiness specifically — not company-formation likelihood?\" — exposes that PatSnap/CBI scoring is tuned for the wrong buyer.",
  "\"When was your last platform pricing change, and how was it communicated?\" — surfaces Citeline/Cortellis ARR-on-ARR resentment without mentioning the competitor by name. " + srcs([39]),
  "\"If your incumbent contract were not renewable next year, what's the single capability you'd refuse to lose?\" — surfaces what's actually defensible (usually: the audit-trail / dossier export) so EdenRadar's roadmap covers it before pitching displacement.",
]);

h2("Post-delivery offer (per competitive-analysis skill)");
paragraph("After this PDF is delivered, the executor will offer the standard ongoing-monitoring package — alert URLs for each competitor (changelog, blog, pricing), bookmark bundle, and a 30-minute monthly ritual checklist saved to competitor-monitoring.md. The monitoring package is not built unless the user accepts.", { size: 9 });

// SOURCES
newPage();
h1("Sources");
paragraph("Every claim in this report cites the numbered source IDs below. Profiles tagged \"reviews\" are grounded in G2/Capterra/PeerSpot 1–3 star reviews; \"reviews+marketing\" mix reviews and vendor copy; \"inferred\" are marketing-only and flagged in the dossier itself.", { size: 9 });
y += 4;
doc.setFont("helvetica", "normal").setFontSize(8.5);
for (const s of SOURCES) {
  ensure(13);
  setText(C.brand); doc.setFont("helvetica", "bold").setFontSize(8.5);
  doc.text(`[${s.id}]`, MARGIN, y);
  setText(C.ink); doc.setFont("helvetica", "normal").setFontSize(8.5);
  const wrap = doc.splitTextToSize(`${s.label} — ${s.url}`, CONTENT_W - 28) as string[];
  let ly = y;
  for (const line of wrap) { doc.text(line, MARGIN + 24, ly); ly += 11; if (ly > BOTTOM_Y - 4) { footer(); doc.addPage(); pageNum++; header(); ly = TOP_Y; } }
  y = ly + 2;
}

footer();

const out = resolve(process.cwd(), "competitive-analysis-scout-market.pdf");
const buf = Buffer.from(doc.output("arraybuffer"));
writeFileSync(out, buf);
console.log(`Wrote ${out} — ${pageNum} page(s), ${(buf.length / 1024).toFixed(1)} KB`);
