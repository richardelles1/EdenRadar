#!/usr/bin/env node
// Render EdenScout round-2 awareness ads at 4 sizes per angle.
// Output: build/ads/edenscout-awareness-2026-05-round-2/  (16 PNGs + manifest.md)
import { chromium } from "playwright";
import { mkdir, writeFile, readFile, stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "artifacts/mockup-sandbox/public");
const SLUG = "edenscout-awareness-2026-05-round-2";
const OUT_DIR = path.join(ROOT, "build/ads", SLUG);

const ANGLES = [
  { id: "angle1-lab",          file: "edenscout-r2-angle1-lab.html" },
  { id: "angle2-signal",       file: "edenscout-r2-angle2-signal.html" },
  { id: "angle3-architecture", file: "edenscout-r2-angle3-architecture.html" },
  { id: "angle4-instrument",   file: "edenscout-r2-angle4-instrument.html" },
];

const SIZES = [
  { name: "li-1200x627",   w: 1200, h: 627  }, // LinkedIn Single Image
  { name: "li-1200x1200",  w: 1200, h: 1200 }, // LinkedIn Square
  { name: "meta-1080x1350",w: 1080, h: 1350 }, // Meta portrait 4:5
  { name: "x-1200x675",    w: 1200, h: 675  }, // X landscape 1.91:1
];

const MIME = { html: "text/html", css: "text/css", png: "image/png", svg: "image/svg+xml", js: "text/javascript" };

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

async function main() {
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
        const outPath = path.join(OUT_DIR, `edenscout-${angle.id}-${size.name}.png`);
        await page.screenshot({ path: outPath, type: "png", fullPage: false, omitBackground: false });
        const s = await stat(outPath);
        const kb = (s.size / 1024).toFixed(0);
        const flag = s.size > 1024 * 1024 ? "  [>1MB]" : "";
        if (s.size > 1024 * 1024) oversized.push({ outPath, bytes: s.size });
        console.log(`rendered ${size.name.padEnd(16)} ${angle.id.padEnd(20)} ${kb}KB${flag}`);
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
    server.close();
  }

  // Write manifest.
  const manifest = buildManifest();
  await writeFile(path.join(OUT_DIR, "manifest.md"), manifest, "utf8");
  console.log("manifest written");

  if (oversized.length) {
    console.warn(`\n${oversized.length} file(s) exceed 1MB:`);
    for (const o of oversized) console.warn(`  ${o.outPath} (${(o.bytes/1024/1024).toFixed(2)}MB)`);
    process.exitCode = 1;
  }
}

const ANGLE_COPY = [
  {
    id: "angle1-lab",
    title: "Angle 1 — The Pre-Clinical Pipeline",
    visual: "Editorial laboratory imagery: emerald-lit glassware, dark steel, cinematic depth, deep shadowed foreground.",
    audience: "Biotech BD and S&E, pharma licensing teams",
    linkedin: {
      intro: "300+ tech transfer offices, scored and enriched. See licensable biotech assets before your competition does.",
      headline: "EdenScout: pre-clinical intelligence for biotech BD",
    },
    meta: {
      // 72 char visible target
      primary: "See pre-clinical biotech assets before the rest of the field does.",
      headline: "Pre-clinical pipeline, surfaced",
      description: "EdenScout for biotech BD",
    },
    x: {
      tweet: "EdenScout: see the pre-clinical pipeline before the rest of the field does.",
      card: "EdenScout: pre-clinical intelligence for biotech BD",
    },
  },
  {
    id: "angle2-signal",
    title: "Angle 2 — Signal from Noise",
    visual: "Single emerald signal beam piercing dense grey noise, pitch-black backdrop, hyper-minimal premium tech aesthetic.",
    audience: "Search and evaluation, scientific scouts, BD analysts",
    linkedin: {
      intro: "Stop sifting through hundreds of TTO portals. EdenScout surfaces only the science that maps to your pipeline.",
      headline: "Cut through 300+ TTOs. Surface what matters.",
    },
    meta: {
      primary: "Skip the TTO portal grind. Surface only the science that fits.",
      headline: "Signal, not noise",
      description: "Cut through 300+ TTOs",
    },
    x: {
      tweet: "Cut through 300+ TTO portals. EdenScout surfaces only the science that maps to your pipeline.",
      card: "Signal, not noise: licensable science for biotech BD",
    },
  },
  {
    id: "angle3-architecture",
    title: "Angle 3 — Premium Identity",
    visual: "Architectural premium mood: modern research institution at dusk, glowing emerald interiors, deep concrete shadows.",
    audience: "VP and Director of BD, Head of External Innovation",
    linkedin: {
      intro: "The intelligence platform built with the rigor your pipeline decisions deserve. Now in early access.",
      headline: "Premium intelligence on every licensable pre-clinical asset",
    },
    meta: {
      primary: "Built with the rigor your pipeline decisions deserve.",
      headline: "Premium pipeline intelligence",
      description: "Now in early access",
    },
    x: {
      tweet: "Built with the rigor your pipeline decisions deserve. EdenScout is in early access.",
      card: "Premium pre-clinical intelligence, in early access",
    },
  },
  {
    id: "angle4-instrument",
    title: "Angle 4 — Precision Sourcing",
    visual: "Macro of a precision scientific instrument, brushed steel, single emerald LED, museum-quality engineering detail.",
    audience: "TTO directors, alliance management, biotech BD",
    linkedin: {
      intro: "Engineered to surface the next license deal before the rest of the field catches up. Meet EdenScout.",
      headline: "Engineered to surface the next license deal",
    },
    meta: {
      primary: "Surface the next license deal before the field catches up.",
      headline: "Precision deal sourcing",
      description: "EdenScout for biotech BD",
    },
    x: {
      tweet: "Engineered to surface the next license deal before the rest of the field catches up. Meet EdenScout.",
      card: "EdenScout: precision deal sourcing for biotech",
    },
  },
];

function len(s) { return s.length; }

function buildManifest() {
  const L = [];
  L.push("# EdenScout — Awareness Campaign (2026-05, round 2)");
  L.push("");
  L.push("Round-2 refresh of the EdenScout awareness ad batch under the EdenRadar banner. Two corrections from round 1:");
  L.push("");
  L.push("1. Every visible URL now reads `edenradar.com` (round 1 shipped `.bio`).");
  L.push("2. Headline legibility fixed across all renders: deeper bottom scrim (0 to 0.92 alpha covering 60vh), weight-900 headline at 8-9vmin, text-shadow safety net, and re-prompted hero imagery with intentionally dark, low-detail bottom thirds.");
  L.push("");
  L.push("All on-image and post copy is em-dash free.");
  L.push("");
  L.push("**Sizes shipped per angle (4 sizes x 4 angles = 16 PNGs):**");
  L.push("");
  L.push("- LinkedIn Single Image — 1200x627 (1.91:1 landscape)");
  L.push("- LinkedIn Square — 1200x1200 (1:1)");
  L.push("- Meta portrait — 1080x1350 (4:5)");
  L.push("- X landscape — 1200x675 (1.91:1)");
  L.push("");
  L.push("**Suggested target audience (all angles):** Biotech BD / search and evaluation, TTO directors, pharma licensing and alliance management. Job titles: VP/Director of BD, Head of External Innovation, Director of Tech Transfer.");
  L.push("");
  L.push("---");
  L.push("");
  for (const a of ANGLE_COPY) {
    L.push(`## ${a.title}`);
    L.push("");
    L.push(`**Visual:** ${a.visual}`);
    L.push("");
    L.push(`**Audience suggestion:** ${a.audience}`);
    L.push("");
    L.push("**Files:**");
    for (const s of SIZES) {
      L.push(`- \`edenscout-${a.id}-${s.name}.png\` (${s.w}x${s.h})`);
    }
    L.push("");
    L.push("### LinkedIn");
    L.push("");
    L.push(`- **Intro text** (${len(a.linkedin.intro)}/150 char rec): ${a.linkedin.intro}`);
    L.push(`- **Headline** (${len(a.linkedin.headline)}/70 char rec): ${a.linkedin.headline}`);
    L.push("");
    L.push("### Meta (Facebook / Instagram)");
    L.push("");
    L.push(`- **Primary text** (${len(a.meta.primary)}/72 char visible): ${a.meta.primary}`);
    L.push(`- **Headline** (${len(a.meta.headline)}/40 char rec): ${a.meta.headline}`);
    L.push(`- **Description** (${len(a.meta.description)}/30 char rec): ${a.meta.description}`);
    L.push("");
    L.push("### X");
    L.push("");
    L.push(`- **Tweet text** (${len(a.x.tweet)}/100 char visible): ${a.x.tweet}`);
    L.push(`- **Card headline** (${len(a.x.card)}/70 char): ${a.x.card}`);
    L.push("");
    L.push("---");
    L.push("");
  }
  return L.join("\n");
}

main().catch((err) => { console.error(err); process.exit(1); });
