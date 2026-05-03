#!/usr/bin/env node
// Render LinkedIn light-mode ads for EdenScout + EdenMarket.
// 8 angles x 2 LinkedIn sizes = 16 PNGs + manifest.md.
// Output: build/ads/edenscout-edenmarket-linkedin-light-2026-05/
import { chromium } from "playwright";
import { mkdir, writeFile, readFile, stat, rename } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "artifacts/mockup-sandbox/public");
const SLUG = "edenscout-edenmarket-linkedin-light-2026-05";
const OUT_DIR = path.join(ROOT, "build/ads", SLUG);

const ANGLES = [
  // ---------------- EdenScout (4) ----------------
  {
    id: "edenscout-atlas", surface: "EdenScout", file: "li-light-edenscout-atlas.html",
    audience: "Biotech BD leads, in-licensing scouts",
    linkedin: {
      intro: "Stop chasing 300+ tech transfer portals one by one. EdenScout is an atlas of every TTO on a single canvas.",
      headline: "An atlas of every tech transfer office",
    },
  },
  {
    id: "edenscout-daily", surface: "EdenScout", file: "li-light-edenscout-daily.html",
    audience: "TTO directors, BD analysts tracking new disclosures",
    linkedin: {
      intro: "Fresh science, every morning. EdenScout re-indexes 300+ tech transfer offices daily so nothing licensable slips past.",
      headline: "300+ TTOs, indexed every single day",
    },
  },
  {
    id: "edenscout-shortlist", surface: "EdenScout", file: "li-light-edenscout-shortlist.html",
    audience: "Biotech in-licensing teams, scouting analysts",
    linkedin: {
      intro: "From ten thousand listings to ten worth opening. EdenScout scores every TTO asset against your thesis so the shortlist writes itself.",
      headline: "Score and shortlist licensable science",
    },
  },
  {
    id: "edenscout-bd", surface: "EdenScout", file: "li-light-edenscout-bd.html",
    audience: "Biotech BD leads, search and evaluation teams",
    linkedin: {
      intro: "A BD workflow built for tech transfer. Search, score, save, and route licensable assets without leaving one canvas.",
      headline: "A BD workflow built for tech transfer",
    },
  },
  // ---------------- EdenMarket (4) ----------------
  {
    id: "edenmarket-free", surface: "EdenMarket", file: "li-light-edenmarket-free.html",
    audience: "TTO directors, university licensing officers",
    linkedin: {
      intro: "EdenMarket is a success-fee marketplace for licensable science. Free to list. You only pay when an asset finds its buyer.",
      headline: "Free to list. Pay when you close.",
    },
  },
  {
    id: "edenmarket-successfee", surface: "EdenMarket", file: "li-light-edenmarket-successfee.html",
    audience: "TTO leadership, university IP commercialization",
    linkedin: {
      intro: "No listing fees, no subscriptions, no minimums. EdenMarket gets paid only when your licensable asset closes.",
      headline: "A marketplace that gets paid only when you do",
    },
  },
  {
    id: "edenmarket-confidential", surface: "EdenMarket", file: "li-light-edenmarket-confidential.html",
    audience: "TTO licensing officers, in-house licensing counsel",
    linkedin: {
      intro: "List confidentially. Match privately. Show what matters to qualified buyers and keep the rest under NDA.",
      headline: "List confidentially. Match privately.",
    },
  },
  {
    id: "edenmarket-twosided", surface: "EdenMarket", file: "li-light-edenmarket-twosided.html",
    audience: "TTO directors and biotech BD leaders",
    linkedin: {
      intro: "EdenMarket is the place where licensors and licensees finally meet. Universities list. Biotechs discover. Deals close on shared terms.",
      headline: "Where licensors and licensees finally meet",
    },
  },
];

const SIZES = [
  { name: "li-1200x627",  w: 1200, h: 627  }, // LinkedIn Single Image (1.91:1)
  { name: "li-1200x1200", w: 1200, h: 1200 }, // LinkedIn Square (1:1)
];

const MIME = { html: "text/html", css: "text/css", png: "image/png", svg: "image/svg+xml", js: "text/javascript", jpg: "image/jpeg", jpeg: "image/jpeg" };

function startServer() {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      const safe = path.normalize(url.pathname).replace(/^\/+/, "");
      const filePath = path.join(PUBLIC_DIR, safe);
      if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); res.end(); return; }
      const buf = await readFile(filePath);
      const ext = path.extname(filePath).slice(1);
      res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
      res.end(buf);
    } catch (err) {
      res.writeHead(404); res.end(String(err.message || err));
    }
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => {
    resolve({ server, port: server.address().port });
  }));
}

// Token-level WCAG contrast guard. Catches any future regression where a
// portal accent gets re-applied to text without the >=4.5:1 safe variant.
function relLum(hex) {
  const v = hex.replace("#", "");
  const r = parseInt(v.slice(0, 2), 16) / 255;
  const g = parseInt(v.slice(2, 4), 16) / 255;
  const b = parseInt(v.slice(4, 6), 16) / 255;
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrast(fg, bg) {
  const a = relLum(fg), b = relLum(bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}
function assertContrast() {
  const tokens = {
    "--ink-strong":         "#050709",
    "--ink":                "#0b0f14",
    "--ink-muted":          "#3a4452",
    "--accent-scout-text":  "#1a6a38",
    "--accent-market-text": "#3e4fea",
  };
  const failures = [];
  for (const [name, hex] of Object.entries(tokens)) {
    const ratio = contrast(hex, "#ffffff");
    if (ratio < 4.5) failures.push(`${name} ${hex} -> ${ratio.toFixed(2)}:1 on white (need >=4.5:1)`);
    else console.log(`contrast OK  ${name.padEnd(22)} ${hex}  ${ratio.toFixed(2)}:1`);
  }
  if (failures.length) {
    throw new Error("WCAG contrast guard failed:\n  " + failures.join("\n  "));
  }
}

// On-image word-count guard. Reads each angle HTML and confirms the
// headline (<=8 words), subline (<=14 words), and total (<=20) all stay
// within the spec. Catches future copy regressions.
async function assertOnImageWordCounts() {
  const failures = [];
  for (const angle of ANGLES) {
    const html = await readFile(path.join(PUBLIC_DIR, "ads", angle.file), "utf8");
    const stripTags = (s) => s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
    const wordCount = (s) => (s ? s.split(/\s+/).filter(Boolean).length : 0);
    const grab = (cls) => {
      const m = html.match(new RegExp(`<div class="${cls}">([\\s\\S]*?)</div>`));
      return m ? stripTags(m[1]) : "";
    };
    const headline = grab("headline");
    const subline = grab("subline");
    const hWords = wordCount(headline);
    const sWords = wordCount(subline);
    const tWords = hWords + sWords;
    const issues = [];
    if (hWords > 8)  issues.push(`headline ${hWords}>8 words`);
    if (sWords > 14) issues.push(`subline ${sWords}>14 words`);
    if (tWords > 20) issues.push(`total ${tWords}>20 words`);
    if (issues.length) failures.push(`  ${angle.id}: ${issues.join("; ")}`);
    else console.log(`copy OK     ${angle.id.padEnd(28)} headline=${hWords}/8  subline=${sWords}/14  total=${tWords}/20`);
  }
  if (failures.length) throw new Error("On-image word-count guard failed:\n" + failures.join("\n"));
}

async function main() {
  assertContrast();
  await assertOnImageWordCounts();
  await mkdir(OUT_DIR, { recursive: true });
  const { server, port } = await startServer();
  const browser = await chromium.launch();
  const oversized = [];
  try {
    for (const angle of ANGLES) {
      for (const size of SIZES) {
        const ctx = await browser.newContext({
          viewport: { width: size.w, height: size.h },
          deviceScaleFactor: 1,
        });
        const page = await ctx.newPage();
        const url = `http://127.0.0.1:${port}/ads/${angle.file}`;
        await page.goto(url, { waitUntil: "networkidle" });
        await page.evaluate(() => (document.fonts && document.fonts.ready) || Promise.resolve());
        await page.waitForTimeout(400);
        const outPath = path.join(OUT_DIR, `li-light-${angle.id}-${size.name}.png`);
        await page.screenshot({ path: outPath, type: "png", fullPage: false, omitBackground: false });
        const s = await stat(outPath);
        let finalSize = s.size;
        if (s.size > 1024 * 1024) {
          const tmp = outPath + ".q.png";
          const r = spawnSync("magick", [outPath, "-strip", "-define", "png:compression-level=9", "-colors", "200", tmp], { stdio: "inherit" });
          if (r.status === 0) {
            await rename(tmp, outPath);
            const s2 = await stat(outPath);
            finalSize = s2.size;
          }
          if (finalSize > 1024 * 1024) oversized.push({ outPath, bytes: finalSize });
        }
        const kb = (finalSize / 1024).toFixed(0);
        const flag = finalSize > 1024 * 1024 ? "  [>1MB]" : "";
        console.log(`rendered ${size.name.padEnd(15)} ${angle.id.padEnd(28)} ${kb}KB${flag}`);
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
    server.close();
  }

  await writeFile(path.join(OUT_DIR, "manifest.md"), buildManifest(), "utf8");
  console.log("manifest written");

  if (oversized.length) {
    console.warn(`\n${oversized.length} file(s) exceed 1MB:`);
    for (const o of oversized) console.warn(`  ${o.outPath} (${(o.bytes/1024/1024).toFixed(2)}MB)`);
    process.exitCode = 1;
  }
}

function validateLi(intro, headline) {
  const issues = [];
  if (intro.length > 600) issues.push(`intro ${intro.length}>600 hard cap`);
  if (headline.length > 200) issues.push(`headline ${headline.length}>200 hard cap`);
  return issues;
}

function buildManifest() {
  const L = [];
  L.push("# EdenScout & EdenMarket — LinkedIn light-mode ads (2026-05)");
  L.push("");
  L.push("LinkedIn-only awareness round. White surfaces, near-black type, with each product's portal color used only as a thin accent (top hairline rule, eyebrow, one underline highlight, a small accent slab, and the footer URL).");
  L.push("");
  L.push("**Portal accents (sourced from `client/src/index.css`):**");
  L.push("");
  L.push("- EdenScout — emerald `hsl(142 52% 36%)` -> `#2c8c4f`");
  L.push("- EdenMarket — indigo `hsl(234 80% 58%)` -> `#3e4fea`");
  L.push("");
  L.push("**Sizes shipped per angle (2 sizes x 8 angles = 16 PNGs):**");
  L.push("");
  L.push("- LinkedIn Single Image — 1200x627 (1.91:1)");
  L.push("- LinkedIn Square — 1200x1200 (1:1)");
  L.push("");
  L.push("**Notes**");
  L.push("");
  L.push("- Awareness layout: no on-image CTA button. Footer URL `edenradar.com` only.");
  L.push("- All copy is em-dash free. Evergreen — no dates or launch language on the artwork.");
  L.push("- Inter (400/600/700/800/900) loaded from Google Fonts in every HTML file.");
  L.push("- WCAG 4.5:1 contrast verified: near-black type on pure white, accent reserved for thin treatments.");
  L.push("");
  L.push("---");
  L.push("");

  for (const surface of ["EdenScout", "EdenMarket"]) {
    L.push(`# ${surface}`);
    L.push("");
    for (const a of ANGLES.filter((x) => x.surface === surface)) {
      const issues = validateLi(a.linkedin.intro, a.linkedin.headline);
      L.push(`## ${a.id}`);
      L.push("");
      L.push(`**Source:** \`artifacts/mockup-sandbox/public/ads/${a.file}\``);
      L.push("");
      L.push("**Files:**");
      for (const s of SIZES) {
        L.push(`- \`li-light-${a.id}-${s.name}.png\` (${s.w}x${s.h})`);
      }
      L.push("");
      L.push("### LinkedIn copy");
      L.push("");
      L.push(`- **Intro text** (${a.linkedin.intro.length} chars; rec <=150, hard cap 600): ${a.linkedin.intro}`);
      L.push(`- **Headline** (${a.linkedin.headline.length} chars; rec <=70, hard cap 200): ${a.linkedin.headline}`);
      L.push(`- **Target audience:** ${a.audience}`);
      if (issues.length) {
        L.push("");
        L.push(`> WARNING — limit issues: ${issues.join("; ")}`);
      }
      L.push("");
      L.push("---");
      L.push("");
    }
  }
  return L.join("\n");
}

main().catch((err) => { console.error(err); process.exit(1); });
