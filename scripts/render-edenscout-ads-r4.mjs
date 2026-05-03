#!/usr/bin/env node
// Render EdenScout round-4 awareness ads at 4 sizes per angle.
// Quarterly refresh of EdenScout creative; reuses the locked round-2
// legibility recipe (_shared-r2.css) but with 4 fresh angles.
// Output: build/ads/edenscout-awareness-2026-05-round-4/  (16 PNGs + manifest.md)
import { chromium } from "playwright";
import { mkdir, writeFile, readFile, stat } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "artifacts/mockup-sandbox/public");
const SLUG = "edenscout-awareness-2026-05-round-4";
const OUT_DIR = path.join(ROOT, "build/ads", SLUG);

const ANGLES = [
  { id: "angle1-atlas",       file: "edenscout-r4-angle1-atlas.html" },
  { id: "angle2-observatory", file: "edenscout-r4-angle2-observatory.html" },
  { id: "angle3-vault",       file: "edenscout-r4-angle3-vault.html" },
  { id: "angle4-firstlight",  file: "edenscout-r4-angle4-firstlight.html" },
];

const SIZES = [
  { name: "li-1200x627",   w: 1200, h: 627  },
  { name: "li-1200x1200",  w: 1200, h: 1200 },
  { name: "meta-1080x1350",w: 1080, h: 1350 },
  { name: "x-1200x675",    w: 1200, h: 675  },
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
        let finalSize = s.size;
        if (s.size > 1024 * 1024) {
          // Re-encode with a 256-color palette via ImageMagick. The hero photo
          // is dominated by deep black + emerald accents so palette compression
          // is visually lossless at this print scale.
          try {
            execFileSync("magick", [outPath, "-colors", "256", "-define", "png:compression-level=9", "-strip", `${outPath}.tmp.png`]);
            execFileSync("mv", [`${outPath}.tmp.png`, outPath]);
            const s2 = await stat(outPath);
            finalSize = s2.size;
            console.log(`  -> recompressed ${size.name} ${angle.id} from ${kb}KB to ${(s2.size/1024).toFixed(0)}KB`);
          } catch (err) {
            console.warn(`  -> recompress failed for ${outPath}: ${err.message}`);
          }
          if (finalSize > 1024 * 1024) oversized.push({ outPath, bytes: finalSize });
        }
        const finalKb = (finalSize / 1024).toFixed(0);
        console.log(`rendered ${size.name.padEnd(16)} ${angle.id.padEnd(22)} ${finalKb}KB${finalSize > 1024 * 1024 ? "  [>1MB]" : ""}`);
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
    server.close();
  }

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
    id: "angle1-atlas",
    title: "Angle 1 — Atlas of Licensable Science",
    visual: "Abstract emerald topographic map on deep matte black, intentional dark low-detail bottom third for headline overlay.",
    audience: "Biotech BD, search and evaluation, pharma licensing teams looking for landscape coverage",
    linkedin: {
      intro: "Stop chasing 300+ TTO portals one by one. EdenScout maps every licensable pre-clinical asset onto a single searchable canvas, scored and enriched.",
      headline: "Every pre-clinical asset, on one canvas",
    },
    meta: {
      primary: "Map every licensable pre-clinical asset onto one searchable canvas.",
      headline: "An atlas for biotech BD",
      description: "300+ TTOs, one workspace",
    },
    x: {
      tweet: "EdenScout maps every licensable pre-clinical asset onto one searchable canvas. 300+ TTOs, scored.",
      card: "An atlas of licensable pre-clinical science",
    },
  },
  {
    id: "angle2-observatory",
    title: "Angle 2 — Observatory: First Sight",
    visual: "Silhouetted research observatory dome opening to a deep night sky with a single emerald pinpoint of light, near-black bottom third for headline overlay.",
    audience: "VP and Director of BD, Head of External Innovation, scouts who need early-warning signal",
    linkedin: {
      intro: "The deals that close best are the ones you saw first. EdenScout watches 300+ tech transfer offices so your team gets first sight.",
      headline: "Spot the next license deal while it is still distant",
    },
    meta: {
      primary: "Get early sight on every licensable pre-clinical asset.",
      headline: "First sight on the field",
      description: "Continuous TTO coverage",
    },
    x: {
      tweet: "EdenScout watches 300+ TTOs continuously so your team gets first sight on every licensable asset.",
      card: "First sight on every licensable pre-clinical asset",
    },
  },
  {
    id: "angle3-vault",
    title: "Angle 3 — Hidden Inventory, Surfaced",
    visual: "Macro of a heavy precision steel vault interior with a single emerald LED reflection, near-black bottom third for headline overlay.",
    audience: "TTO directors, alliance management, biotech BD chasing assets that never reach public portals",
    linkedin: {
      intro: "Most pre-clinical IP never reaches a public portal. EdenScout surfaces the hidden inventory across 300+ research institutes.",
      headline: "Open the vault on university pre-clinical IP",
    },
    meta: {
      primary: "Surface the pre-clinical IP that never reaches a public portal.",
      headline: "Hidden inventory, surfaced",
      description: "300+ research institutes",
    },
    x: {
      tweet: "Most pre-clinical IP never reaches a public portal. EdenScout surfaces it for biotech BD.",
      card: "Hidden university IP, in one searchable workspace",
    },
  },
  {
    id: "angle4-firstlight",
    title: "Angle 4 — First-Mover Intelligence",
    visual: "Long-exposure light trails curving toward a single emerald vanishing point in a pitch black corridor, near-black bottom third for headline overlay.",
    audience: "Biotech BD leadership, corporate development, scouts where speed-to-asset is the competitive edge",
    linkedin: {
      intro: "In licensing, the second team to a deal usually loses it. EdenScout scores 300+ TTOs so your BD team is first.",
      headline: "Reach the asset before the field does",
    },
    meta: {
      primary: "Be first to the asset, not second.",
      headline: "First-mover intelligence",
      description: "Continuous TTO scoring",
    },
    x: {
      tweet: "In licensing, the second team to a deal usually loses it. EdenScout puts your team first.",
      card: "First-mover intelligence for biotech BD",
    },
  },
];

function len(s) { return s.length; }

function buildManifest() {
  const L = [];
  L.push("# EdenScout — Awareness Campaign (2026-05, round 4)");
  L.push("");
  L.push("Round-4 quarterly refresh of the EdenScout awareness ad batch under the EdenRadar banner. Rounds 1, 2, and the EdenNX launch covered EdenScout; the newly shipped round 3 covers EdenMarket, EdenLab, and the EDEN engine. Because EdenScout creative has been running longest, it is most prone to fatigue, so this round ships 4 new angles to keep the awareness pool fresh.");
  L.push("");
  L.push("Same legibility recipe as round 2 (locked in `_shared-r2.css`): 60vh bottom scrim ramping to 0.92 alpha, weight-900 headline at 8vmin (9vmin portrait), text-shadow safety net, and re-prompted hero imagery with intentionally dark, low-detail bottom thirds. All visible URLs read `edenradar.com`. All on-image and post copy is em-dash free.");
  L.push("");
  L.push("**New round-4 angles (distinct from rounds 1 and 2):**");
  L.push("");
  L.push("1. **Atlas of Licensable Science** — landscape coverage framing");
  L.push("2. **Observatory: First Sight** — early-warning framing");
  L.push("3. **Hidden Inventory, Surfaced** — vault / unreachable IP framing");
  L.push("4. **First-Mover Intelligence** — speed-to-asset framing");
  L.push("");
  L.push("**Sizes shipped per angle (4 sizes x 4 angles = 16 PNGs):**");
  L.push("");
  L.push("- LinkedIn Single Image — 1200x627 (1.91:1 landscape)");
  L.push("- LinkedIn Square — 1200x1200 (1:1)");
  L.push("- Meta portrait — 1080x1350 (4:5)");
  L.push("- X landscape — 1200x675 (1.91:1)");
  L.push("");
  L.push("**Default target audience (all angles):** Biotech BD / search and evaluation, TTO directors, pharma licensing and alliance management. Job titles: VP/Director of BD, Head of External Innovation, Director of Tech Transfer, Director of Corporate Development.");
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
