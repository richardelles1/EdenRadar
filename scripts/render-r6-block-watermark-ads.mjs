#!/usr/bin/env node
// Render round-6 block-with-watermark ads at 4 sizes per angle.
// 12 angles (6 products x white + green) x 4 sizes = 48 PNGs.
// Output: build/ads/block-watermark-round-6-2026-05/
import { chromium } from "playwright";
import { mkdir, writeFile, readFile, stat, rename } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "artifacts/mockup-sandbox/public");
const SLUG = "block-watermark-round-6-2026-05";
const OUT_DIR = path.join(ROOT, "build/ads", SLUG);

const ANGLES = [
  { id: "edenscout-block",        surface: "EdenScout",   variant: "block-white",  file: "r6-edenscout-block.html",        url: "edenradar.com",       headline: "300+ tech transfer offices, indexed daily.",         intro: "EdenScout indexes 300+ tech transfer offices daily into one searchable canvas for biotech BD." },
  { id: "edenscout-block-green",  surface: "EdenScout",   variant: "block-green",  file: "r6-edenscout-block-green.html",  url: "edenradar.com",       headline: "300+ tech transfer offices, indexed daily.",         intro: "EdenScout indexes 300+ tech transfer offices daily into one searchable canvas for biotech BD." },
  { id: "edenlab-block",          surface: "EdenLab",     variant: "block-white",  file: "r6-edenlab-block.html",          url: "edenradar.com/lab",   headline: "Every grant that fits your lab, the day it opens.", intro: "EdenLab matches NIH, NSF, DOE, foundation, and EU grants to your lab the day they open." },
  { id: "edenlab-block-green",    surface: "EdenLab",     variant: "block-green",  file: "r6-edenlab-block-green.html",    url: "edenradar.com/lab",   headline: "Every grant that fits your lab, the day it opens.", intro: "EdenLab matches NIH, NSF, DOE, foundation, and EU grants to your lab the day they open." },
  { id: "edenmarket-block",       surface: "EdenMarket",  variant: "block-white",  file: "r6-edenmarket-block.html",       url: "edenradar.com",       headline: "Free to list. Pay when you close.",                  intro: "EdenMarket is a success-fee marketplace for licensable science. Free to list. Pay when you close." },
  { id: "edenmarket-block-green", surface: "EdenMarket",  variant: "block-green",  file: "r6-edenmarket-block-green.html", url: "edenradar.com",       headline: "Free to list. Pay when you close.",                  intro: "EdenMarket is a success-fee marketplace for licensable science. Free to list. Pay when you close." },
  { id: "edenengine-block",       surface: "EDEN engine", variant: "block-white",  file: "r6-edenengine-block.html",       url: "edenradar.com",       headline: "300+ TTOs. 10M+ papers. One signal.",                intro: "The AI layer behind EdenRadar parses tech transfer pages, papers, and grants into one signal." },
  { id: "edenengine-block-green", surface: "EDEN engine", variant: "block-green",  file: "r6-edenengine-block-green.html", url: "edenradar.com",       headline: "Reads the science so you don't have to.",            intro: "The AI layer behind EdenRadar reads the science so your team does not have to." },
  { id: "edennx-block",           surface: "EdenNX",      variant: "block-white",  file: "r6-edennx-block.html",           url: "edennx.com",          headline: "The biotech intelligence platform.",                 intro: "EdenNX is the biotech intelligence platform behind EdenRadar — tech transfer, grants, and licensing in one engine." },
  { id: "edennx-block-green",     surface: "EdenNX",      variant: "block-green",  file: "r6-edennx-block-green.html",     url: "edennx.com",          headline: "The biotech intelligence platform.",                 intro: "EdenNX is the biotech intelligence platform behind EdenRadar — tech transfer, grants, and licensing in one engine." },
  { id: "edenradar-block",        surface: "EdenRadar",   variant: "block-white",  file: "r6-edenradar-block.html",        url: "edenradar.com",       headline: "Every TTO, every grant, every deal — one signal.",   intro: "EdenScout, EdenLab, EdenMarket, and the EDEN engine, working as one stack for biotech BD." },
  { id: "edenradar-block-green",  surface: "EdenRadar",   variant: "block-green",  file: "r6-edenradar-block-green.html",  url: "edenradar.com",       headline: "Every TTO, every grant, every deal — one signal.",   intro: "EdenScout, EdenLab, EdenMarket, and the EDEN engine, working as one stack for biotech BD." },
];

const SIZES = [
  { name: "li-1200x627",    w: 1200, h: 627  },
  { name: "li-1200x1200",   w: 1200, h: 1200 },
  { name: "meta-1080x1350", w: 1080, h: 1350 },
  { name: "x-1200x675",     w: 1200, h: 675  },
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

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const { server, port } = await startServer();
  const browser = await chromium.launch();
  const oversized = [];
  try {
    for (const angle of ANGLES) {
      for (const size of SIZES) {
        const ctx = await browser.newContext({ viewport: { width: size.w, height: size.h }, deviceScaleFactor: 1 });
        const page = await ctx.newPage();
        await page.goto(`http://127.0.0.1:${port}/ads/${angle.file}`, { waitUntil: "networkidle" });
        await page.evaluate(() => (document.fonts && document.fonts.ready) || Promise.resolve());
        await page.waitForTimeout(400);
        const outPath = path.join(OUT_DIR, `r6-${angle.id}-${size.name}.png`);
        await page.screenshot({ path: outPath, type: "png", fullPage: false, omitBackground: false });
        const s = await stat(outPath);
        let finalSize = s.size;
        if (s.size > 1024 * 1024) {
          const tmp = outPath + ".q.png";
          const r = spawnSync("magick", [outPath, "-strip", "-define", "png:compression-level=9", "-colors", "200", tmp], { stdio: "inherit" });
          if (r.status === 0) {
            await rename(tmp, outPath);
            finalSize = (await stat(outPath)).size;
          }
          if (finalSize > 1024 * 1024) oversized.push({ outPath, bytes: finalSize });
        }
        const kb = (finalSize / 1024).toFixed(0);
        const flag = finalSize > 1024 * 1024 ? "  [>1MB]" : (s.size > 1024 * 1024 ? "  (quantized)" : "");
        console.log(`rendered ${size.name.padEnd(16)} ${angle.id.padEnd(28)} ${kb}KB${flag}`);
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

function buildManifest() {
  const L = [];
  L.push("# Block + watermark ads — Round 6 (2026-05)");
  L.push("");
  L.push("Round 6 reuses the proven Round 5 block layout (oversized type on solid white or solid emerald-green panels) and adds a large, subtle EdenNX mark watermark anchored bottom-right behind the foreground content. Twelve ads ship: 6 products x white + green flavors.");
  L.push("");
  L.push("Shared styles live in `_shared-r6.css`. Watermark asset: `images/edennx-mark-watermark.png` (transparent PNG, mark only).");
  L.push("");
  L.push("**Sizes shipped per angle (4 sizes x 12 angles = 48 PNGs):**");
  L.push("");
  L.push("- LinkedIn Single Image — 1200x627 (1.91:1 landscape)");
  L.push("- LinkedIn Square — 1200x1200 (1:1)");
  L.push("- Meta portrait — 1080x1350 (4:5)");
  L.push("- X landscape — 1200x675 (1.91:1)");
  L.push("");
  L.push("---");
  L.push("");
  for (const a of ANGLES) {
    L.push(`## ${a.surface} — ${a.id}`);
    L.push("");
    L.push(`**Surface:** ${a.surface}  |  **Variant:** ${a.variant}  |  **Footer URL:** ${a.url}`);
    L.push("");
    L.push(`**Source:** \`artifacts/mockup-sandbox/public/ads/${a.file}\``);
    L.push("");
    L.push(`**Headline:** ${a.headline}`);
    L.push("");
    L.push(`**LinkedIn intro text** (${a.intro.length} chars): ${a.intro}`);
    L.push("");
    L.push("**Files:**");
    for (const s of SIZES) L.push(`- \`r6-${a.id}-${s.name}.png\` (${s.w}x${s.h})`);
    L.push("");
    L.push("---");
    L.push("");
  }
  return L.join("\n");
}

main().catch((err) => { console.error(err); process.exit(1); });
