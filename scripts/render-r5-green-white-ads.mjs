#!/usr/bin/env node
// Render round-5 green-and-white ads (block-text + light-hero variants) at 4
// sizes per angle. Slots the new r5 batch into the same canvas/render pipeline
// that already drives r2/r3/r4 so the green-and-white creative is visible
// alongside the earlier rounds in the ad feed.
// Output: build/ads/green-white-round-5-2026-05/  (32 PNGs + manifest.md)
import { chromium } from "playwright";
import { mkdir, writeFile, readFile, stat, rename } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "artifacts/mockup-sandbox/public");
const SLUG = "green-white-round-5-2026-05";
const OUT_DIR = path.join(ROOT, "build/ads", SLUG);

// All 8 r5-* HTML files under artifacts/mockup-sandbox/public/ads/.
// Block-text variants: solid white or inverted green panels, oversized type.
// Light-hero variants:  bright/airy hero photo with soft white wash.
const ANGLES = [
  // Block-text variants (4)
  { id: "edenscout-block",         surface: "EdenScout",   variant: "block-text",  file: "r5-edenscout-block.html",         url: "edenradar.com"     },
  { id: "edenlab-block-green",     surface: "EdenLab",     variant: "block-text",  file: "r5-edenlab-block-green.html",     url: "edenradar.com/lab" },
  { id: "edenmarket-block",        surface: "EdenMarket",  variant: "block-text",  file: "r5-edenmarket-block.html",        url: "edenradar.com"     },
  { id: "edenengine-block-green",  surface: "EDEN engine", variant: "block-text",  file: "r5-edenengine-block-green.html",  url: "edenradar.com"     },
  // Light-hero variants (4)
  { id: "edenscout-light-hero",    surface: "EdenScout",   variant: "light-hero",  file: "r5-edenscout-light-hero.html",    url: "edenradar.com"     },
  { id: "edenlab-light-hero",      surface: "EdenLab",     variant: "light-hero",  file: "r5-edenlab-light-hero.html",      url: "edenradar.com/lab" },
  { id: "edennx-light-hero",       surface: "EdenNX",      variant: "light-hero",  file: "r5-edennx-light-hero.html",       url: "edenradar.com"     },
  { id: "edenradar-light-hero",    surface: "EdenRadar",   variant: "light-hero",  file: "r5-edenradar-light-hero.html",    url: "edenradar.com"     },
];

const SIZES = [
  { name: "li-1200x627",    w: 1200, h: 627  }, // LinkedIn Single Image
  { name: "li-1200x1200",   w: 1200, h: 1200 }, // LinkedIn Square
  { name: "meta-1080x1350", w: 1080, h: 1350 }, // Meta portrait 4:5
  { name: "x-1200x675",     w: 1200, h: 675  }, // X landscape 1.91:1
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
        const ctx = await browser.newContext({
          viewport: { width: size.w, height: size.h },
          deviceScaleFactor: 1,
        });
        const page = await ctx.newPage();
        const url = `http://127.0.0.1:${port}/ads/${angle.file}`;
        await page.goto(url, { waitUntil: "networkidle" });
        await page.evaluate(() => (document.fonts && document.fonts.ready) || Promise.resolve());
        await page.waitForTimeout(400);
        const outPath = path.join(OUT_DIR, `r5-${angle.id}-${size.name}.png`);
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
        const flag = finalSize > 1024 * 1024 ? "  [>1MB]" : (s.size > 1024 * 1024 ? "  (quantized)" : "");
        console.log(`rendered ${size.name.padEnd(16)} ${angle.id.padEnd(26)} ${kb}KB${flag}`);
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
  L.push("# Green & white ads — Round 5 (2026-05)");
  L.push("");
  L.push("Round 5 introduces a green-and-white palette to keep the awareness pool fresh alongside the dark-hero rounds 2, 3, and 4. Eight ads ship in two distinct layout families:");
  L.push("");
  L.push("- **Block text (4)** — solid white surface (or inverted emerald-green) with oversized typography and no hero photo.");
  L.push("- **Light hero (4)** — bright/airy product or science photography behind a soft white wash so emerald copy stays legible.");
  L.push("");
  L.push("Shared styles live in `_shared-r5.css` (`layout-block`, `layout-block-green`, `layout-light-hero`). All on-image and post copy is em-dash free.");
  L.push("");
  L.push("**Sizes shipped per angle (4 sizes x 8 angles = 32 PNGs):**");
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
    L.push("**Files:**");
    for (const s of SIZES) {
      L.push(`- \`r5-${a.id}-${s.name}.png\` (${s.w}x${s.h})`);
    }
    L.push("");
    L.push("---");
    L.push("");
  }
  return L.join("\n");
}

main().catch((err) => { console.error(err); process.exit(1); });
