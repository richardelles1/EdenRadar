#!/usr/bin/env node
// Render EdenNX day-one launch awareness ads at 4 sizes per angle.
// Output: build/ads/edennx-launch-day-one-2026-05/  (16 PNGs + manifest.md)
import { chromium } from "playwright";
import { mkdir, writeFile, readFile, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "artifacts/mockup-sandbox/public");
const SLUG = "edennx-launch-day-one-2026-05";
const OUT_DIR = path.join(ROOT, "build/ads", SLUG);

const ANGLES = [
  { id: "angle1-landscape",  file: "edennx-launch-angle1-landscape.html",  track: "positioning" },
  { id: "angle2-microscopy", file: "edennx-launch-angle2-microscopy.html", track: "positioning" },
  { id: "angle3-triptych",   file: "edennx-launch-angle3-triptych.html",   track: "product-suite" },
  { id: "angle4-glass",      file: "edennx-launch-angle4-glass.html",      track: "product-suite" },
];

const SIZES = [
  { name: "li-1200x627",    w: 1200, h: 627  }, // LinkedIn Single Image
  { name: "li-1200x1200",   w: 1200, h: 1200 }, // LinkedIn Square
  { name: "meta-1080x1350", w: 1080, h: 1350 }, // Meta portrait 4:5
  { name: "x-1200x675",     w: 1200, h: 675  }, // X landscape 1.91:1
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
        const outPath = path.join(OUT_DIR, `edennx-${angle.id}-${size.name}.png`);
        await page.screenshot({ path: outPath, type: "png", fullPage: false, omitBackground: false });
        const s = await stat(outPath);
        const kb = (s.size / 1024).toFixed(0);
        const flag = s.size > 1024 * 1024 ? "  [>1MB]" : "";
        let finalSize = s.size;
        if (s.size > 1024 * 1024) {
          // Quantize to <=200 colors with magick to drop under the 1MB ceiling.
          // The hero photography is dark and largely monochromatic emerald, so
          // the visible quality loss is imperceptible while file size drops 5-7x.
          const tmp = outPath + ".q.png";
          const r = spawnSync("magick", [outPath, "-strip", "-define", "png:compression-level=9", "-colors", "200", tmp], { stdio: "inherit" });
          if (r.status === 0) {
            const { rename } = await import("node:fs/promises");
            await rename(tmp, outPath);
            const s2 = await stat(outPath);
            finalSize = s2.size;
          }
          if (finalSize > 1024 * 1024) oversized.push({ outPath, bytes: finalSize });
        }
        const finalKb = (finalSize / 1024).toFixed(0);
        const finalFlag = finalSize > 1024 * 1024 ? "  [>1MB]" : (s.size > 1024 * 1024 ? "  (quantized)" : "");
        console.log(`rendered ${size.name.padEnd(16)} ${angle.id.padEnd(20)} ${finalKb}KB${finalFlag}`);
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
    id: "angle1-landscape",
    track: "Positioning",
    title: "Angle 1 — Data-as-landscape (positioning)",
    visual: "Abstract emerald topographic data terrain glowing across a dark obsidian sky. Quiet, low-detail bottom 40% reserved for headline overlay.",
    audience: "Biotech operators, BD and S&E leads, VPs of External Innovation, scientific co-founders",
    onImage: "EdenNX The intelligence layer The intelligence layer for biotech From signal to decision in one workspace edennx.com",
    linkedin: {
      intro: "EdenNX is live: the intelligence layer for biotech. Every signal, every deal, every license, in one workspace.",
      headline: "EdenNX: the intelligence layer for biotech",
    },
    meta: {
      primary: "EdenNX is live. The intelligence layer for biotech, in one workspace.",
      headline: "The intelligence layer for biotech",
      description: "EdenNX is live. edennx.com",
    },
    x: {
      tweet: "EdenNX is live. The intelligence layer for biotech, from signal to decision, in one workspace. edennx.com",
      card: "EdenNX: the intelligence layer for biotech",
    },
  },
  {
    id: "angle2-microscopy",
    track: "Positioning",
    title: "Angle 2 — Microscopy meets architecture (positioning)",
    visual: "Cellular structure dissolving into the geometric facade of a research institution at dusk, emerald interior light, deep concrete shadows in the lower foreground.",
    audience: "Biotech BD, alliance management, TTO directors, pharma licensing teams",
    onImage: "EdenNX Built for biotech Where the science meets the deal An intelligence layer for the people moving biotech forward edennx.com",
    linkedin: {
      intro: "Where the science meets the deal. EdenNX is the intelligence layer for the people moving biotech forward. Live now.",
      headline: "EdenNX: where the science meets the deal",
    },
    meta: {
      primary: "Where the science meets the deal. EdenNX is live.",
      headline: "Where science meets the deal",
      description: "EdenNX, live now",
    },
    x: {
      tweet: "Where the science meets the deal. EdenNX, the intelligence layer for biotech, is live. edennx.com",
      card: "EdenNX: where science meets the deal",
    },
  },
  {
    id: "angle3-triptych",
    track: "Product-suite",
    title: "Angle 3 — Triptych product surfaces (product-suite reveal)",
    visual: "Three luminous glass dashboard panels floating side by side as a unified triptych: radar circle, magnifier lens, exchange network, all in deep teal and emerald on near-black.",
    audience: "Biotech BD and S&E leads, TTO directors, biotech investors, alliance and licensing teams",
    onImage: "EdenNX Three products One intelligence layer EdenRadar EdenScout EdenMarket Built to work as one edennx.com edenradar.com edenscout.com edenmarket.com",
    linkedin: {
      intro: "EdenRadar, EdenScout, EdenMarket. One intelligence layer for biotech, three connected surfaces. All live now under EdenNX.",
      headline: "Three products, one intelligence layer for biotech",
    },
    meta: {
      primary: "EdenRadar, EdenScout, EdenMarket. One intelligence layer, live now.",
      headline: "Three products. One layer.",
      description: "All live now",
    },
    x: {
      tweet: "EdenRadar, EdenScout, EdenMarket. One intelligence layer for biotech, all live now under EdenNX. edennx.com",
      card: "Three products. One intelligence layer for biotech.",
    },
  },
  {
    id: "angle4-glass",
    track: "Product-suite",
    title: "Angle 4 — Layered glass panels (product-suite reveal)",
    visual: "Three layered translucent glass panels floating in mid-air, edges glowing emerald and teal, deep obsidian backdrop with soft particle haze.",
    audience: "Biotech investors, BD leads, head of search and evaluation, head of corporate development",
    onImage: "EdenNX The EdenNX suite EdenRadar EdenScout EdenMarket The intelligence layer for biotech in three connected surfaces edennx.com edenradar.com edenscout.com edenmarket.com",
    linkedin: {
      intro: "The EdenNX suite is live. EdenRadar, EdenScout, EdenMarket: the intelligence layer for biotech, in three connected surfaces.",
      headline: "EdenRadar, EdenScout, EdenMarket: live now",
    },
    meta: {
      primary: "The EdenNX suite is live. Three connected surfaces, one layer.",
      headline: "EdenRadar. EdenScout. EdenMarket.",
      description: "Live now under EdenNX",
    },
    x: {
      tweet: "The EdenNX suite is live. EdenRadar, EdenScout, EdenMarket: three connected surfaces, one intelligence layer for biotech.",
      card: "EdenRadar, EdenScout, EdenMarket: the EdenNX suite, live now",
    },
  },
];

function len(s) { return s.length; }

// Literal word count of every visible token on the image, including any
// domain strings (e.g. "edennx.com" counts as one word). The 20-word
// ceiling in the spec applies to everything the eye reads.
function wordCount(s) {
  return s.split(/\s+/).filter((w) => w.length > 0).length;
}

function buildManifest() {
  const L = [];
  L.push("# EdenNX — Day-one launch ad batch (2026-05)");
  L.push("");
  L.push("First paid ad creative for the parent brand **EdenNX** (edennx.com), shipped for day-one launch in awareness mode. Two messaging tracks running in parallel:");
  L.push("");
  L.push("1. **Positioning track (angles 1 and 2):** different visual worlds expressing 'the intelligence layer for biotech'.");
  L.push("2. **Product-suite reveal track (angles 3 and 4):** EdenRadar, EdenScout, and EdenMarket presented as a unified suite.");
  L.push("");
  L.push("All on-image copy is em-dash free and the artwork is evergreen (no launch date on the image). 'Live now' messaging is reserved for the per-platform post copy below, where it can be updated without re-rendering the artwork.");
  L.push("");
  L.push("**Brand identity locked from edennx.com:**");
  L.push("- Logo: `EdenNX_Logo_T_1774512284562.png` (transparent leaf-DNA mark), trimmed and resized to `images/edennx-logo.png`.");
  L.push("- Typography: Inter (400, 500, 600, 700, 800, 900) — the only font family loaded by the live edennx.com site.");
  L.push("- Palette: deep emerald base `#005f46`, emerald accent `#10603b`, signal accent `#34d399`, near-black canvas `#05121a` (all extracted from the live edennx.com CSS).");
  L.push("- Single source-of-truth stylesheet shared across all 4 angles: `artifacts/mockup-sandbox/public/ads/_shared-edennx.css`.");
  L.push("");
  L.push("**Sizes shipped per angle (4 sizes x 4 angles = 16 PNGs):**");
  L.push("");
  L.push("- LinkedIn Single Image — 1200x627 (1.91:1 landscape)");
  L.push("- LinkedIn Square — 1200x1200 (1:1)");
  L.push("- Meta portrait — 1080x1350 (4:5)");
  L.push("- X landscape — 1200x675 (1.91:1)");
  L.push("");
  L.push("---");
  L.push("");
  for (const a of ANGLE_COPY) {
    const wc = wordCount(a.onImage);
    L.push(`## ${a.title}`);
    L.push("");
    L.push(`**Track:** ${a.track}`);
    L.push("");
    L.push(`**Visual:** ${a.visual}`);
    L.push("");
    L.push(`**Audience suggestion:** ${a.audience}`);
    L.push("");
    L.push(`**On-image copy (${wc} words / 20-word ceiling):** ${a.onImage}`);
    L.push("");
    L.push("**Files:**");
    for (const s of SIZES) {
      L.push(`- \`edennx-${a.id}-${s.name}.png\` (${s.w}x${s.h})`);
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
