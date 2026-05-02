#!/usr/bin/env node
// Render EdenScout LinkedIn awareness ads at LinkedIn's two static sizes.
// Outputs PNGs to build/ads/edenscout-linkedin-awareness-2026-05/.
import { chromium } from "playwright";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "artifacts/mockup-sandbox/public");
const OUT_DIR = path.join(ROOT, "build/ads/edenscout-linkedin-awareness-2026-05");

const ANGLES = [
  { id: "angle1-lab",          file: "edenscout-angle1-lab.html" },
  { id: "angle2-signal",       file: "edenscout-angle2-signal.html" },
  { id: "angle3-architecture", file: "edenscout-angle3-architecture.html" },
  { id: "angle4-instrument",   file: "edenscout-angle4-instrument.html" },
];

const SIZES = [
  { name: "1200x627",  w: 1200, h: 627  },
  { name: "1200x1200", w: 1200, h: 1200 },
];

function startServer() {
  const mime = { html: "text/html", css: "text/css", png: "image/png", svg: "image/svg+xml" };
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      const safe = path.normalize(url.pathname).replace(/^\/+/, "");
      const filePath = path.join(PUBLIC_DIR, safe);
      if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); res.end(); return; }
      const buf = await readFile(filePath);
      const ext = path.extname(filePath).slice(1);
      res.writeHead(200, { "Content-Type": mime[ext] || "application/octet-stream" });
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
        // Ensure web fonts are loaded before screenshot.
        await page.evaluate(() => (document.fonts && document.fonts.ready) || Promise.resolve());
        await page.waitForTimeout(300);
        const outPath = path.join(OUT_DIR, `edenscout-${angle.id}-${size.name}.png`);
        await page.screenshot({ path: outPath, type: "png", fullPage: false, omitBackground: false });
        console.log("rendered", outPath);
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
  // Manifest for the human reviewer.
  const manifest = buildManifest();
  await writeFile(path.join(OUT_DIR, "manifest.md"), manifest, "utf8");
  console.log("manifest written");
}

function buildManifest() {
  const lines = [];
  lines.push("# EdenScout — LinkedIn Awareness Campaign (2026-05)");
  lines.push("");
  lines.push("Brand-building launch ads for EdenScout. Awareness mode: hero image, no CTA button on the creative — CTA lives in the post copy.");
  lines.push("");
  lines.push("**Sizes shipped per angle:**");
  lines.push("- LinkedIn Single Image — 1200×627 (1.91:1 landscape)");
  lines.push("- LinkedIn Square — 1200×1200 (1:1)");
  lines.push("");
  lines.push("**Suggested target audience for all angles:** Biotech BD / search & evaluation, TTO directors, pharma licensing & alliance management. Job titles: VP/Director of BD, Head of External Innovation, Director of Tech Transfer.");
  lines.push("");
  lines.push("---");
  for (const angle of ANGLE_COPY) {
    lines.push(`## ${angle.title}`);
    lines.push("");
    lines.push(`**Files:**`);
    lines.push(`- \`edenscout-${angle.id}-1200x627.png\``);
    lines.push(`- \`edenscout-${angle.id}-1200x1200.png\``);
    lines.push("");
    lines.push(`**Visual:** ${angle.visual}`);
    lines.push("");
    lines.push(`**Intro text** (${angle.intro.length}/150 chars):`);
    lines.push(`> ${angle.intro}`);
    lines.push("");
    lines.push(`**Headline** (${angle.headline.length}/70 chars):`);
    lines.push(`> ${angle.headline}`);
    lines.push("");
    lines.push(`**Audience suggestion:** ${angle.audience}`);
    lines.push("");
    lines.push("---");
  }
  return lines.join("\n");
}

const ANGLE_COPY = [
  {
    id: "angle1-lab",
    title: "Angle 1 — The Pre-Clinical Pipeline",
    visual: "Editorial laboratory imagery — emerald-lit beakers, dark steel, cinematic depth.",
    intro: "300+ tech transfer offices, scored and enriched. See licensable biotech assets before your competition does.",
    headline: "EdenScout: pre-clinical intelligence for biotech BD",
    audience: "Biotech BD / S&E, pharma licensing teams",
  },
  {
    id: "angle2-signal",
    title: "Angle 2 — Signal from Noise",
    visual: "Abstract data visualization — single emerald signal cutting through grey static.",
    intro: "Stop sifting through hundreds of TTO portals. EdenScout surfaces only the science that maps to your pipeline.",
    headline: "Cut through 300+ TTOs. Surface what matters.",
    audience: "Search & evaluation, scientific scouts, BD analysts",
  },
  {
    id: "angle3-architecture",
    title: "Angle 3 — Premium Identity",
    visual: "Architectural premium mood — modern research institution at dusk, glowing emerald interiors.",
    intro: "The intelligence platform built with the rigor your pipeline decisions deserve. Now in early access.",
    headline: "Premium intelligence on every licensable pre-clinical asset",
    audience: "VP/Director of BD, Head of External Innovation",
  },
  {
    id: "angle4-instrument",
    title: "Angle 4 — Precision Sourcing",
    visual: "Macro of precision scientific instrument — engineered, museum-quality detail.",
    intro: "Engineered to surface the next license deal — before the rest of the field catches up. Meet EdenScout.",
    headline: "Engineered to surface the next license deal",
    audience: "TTO directors, alliance management, biotech BD",
  },
];

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
