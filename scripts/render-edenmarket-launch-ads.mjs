#!/usr/bin/env node
// Render EdenMarket day-one launch awareness ads at 4 sizes per angle.
// Output: build/ads/edenmarket-launch-day-one-2026-05/  (16 PNGs + manifest.md)
import { chromium } from "playwright";
import { mkdir, writeFile, readFile, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "artifacts/mockup-sandbox/public");
const SLUG = "edenmarket-launch-day-one-2026-05";
const OUT_DIR = path.join(ROOT, "build/ads", SLUG);

const ANGLES = [
  { id: "angle1-hero",         file: "edenmarket-launch-angle1-hero.html",         track: "positioning" },
  { id: "angle2-confidential", file: "edenmarket-launch-angle2-confidential.html", track: "positioning" },
  { id: "angle3-buyers",       file: "edenmarket-launch-angle3-buyers.html",       track: "audience" },
  { id: "angle4-sellers",      file: "edenmarket-launch-angle4-sellers.html",      track: "audience" },
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
        const outPath = path.join(OUT_DIR, `edenmarket-${angle.id}-${size.name}.png`);
        await page.screenshot({ path: outPath, type: "png", fullPage: false, omitBackground: false });
        const s = await stat(outPath);
        let finalSize = s.size;
        if (s.size > 1024 * 1024) {
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
        console.log(`rendered ${size.name.padEnd(16)} ${angle.id.padEnd(22)} ${finalKb}KB${finalFlag}`);
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
    id: "angle1-hero",
    track: "Positioning",
    title: "Angle 1 — EdenMarket hero (positioning)",
    visual: "Light edennx-style canvas: pale-emerald checker grid, massive EdenMarket display wordmark, deep-emerald 'Eden' / slate 'Market' treatment matching the parent-brand artwork.",
    audience: "Biotech BD, search and evaluation, TTO directors, pharma licensing and alliance management, biotech founders open to out-licensing",
    onImage: "EdenMarket The biotech deal marketplace EdenMarket Confidential biopharma deal flow Browse compare and close on TTO spin-outs and deprioritized programs in NDA-gated deal rooms edenmarket.com",
    linkedin: {
      intro: "EdenMarket is live: the confidential biopharma deal marketplace. Browse, compare, and close in NDA-gated deal rooms.",
      headline: "EdenMarket: the biotech deal marketplace",
    },
    meta: {
      primary: "EdenMarket is live. The confidential biopharma deal marketplace.",
      headline: "The biotech deal marketplace",
      description: "EdenMarket is live",
    },
    x: {
      tweet: "EdenMarket is live. The confidential biopharma deal marketplace. edenmarket.com",
      card: "EdenMarket: the biotech deal marketplace",
    },
  },
  {
    id: "angle2-confidential",
    track: "Positioning",
    title: "Angle 2 — Confidential by design (positioning)",
    visual: "Calm light canvas with a thick deep-emerald accent bar under the headline, then three pill features: Blind listings, NDA-gated deal rooms, Success-fee pricing.",
    audience: "TTO directors, BD and licensing leads, head of corporate development, head of external innovation, pharma alliance management",
    onImage: "EdenMarket Confidential by design Where biotech deals happen behind the curtain Blind listings NDA-gated deal rooms Success-fee pricing edenmarket.com",
    linkedin: {
      intro: "Confidential by design. EdenMarket: blind listings, NDA-gated deal rooms, success-fee pricing. Live now.",
      headline: "Where biotech deals happen behind the curtain",
    },
    meta: {
      primary: "Where biotech deals happen behind the curtain. EdenMarket is live.",
      headline: "Confidential by design",
      description: "Live now",
    },
    x: {
      tweet: "Where biotech deals happen behind the curtain. EdenMarket is live. edenmarket.com",
      card: "EdenMarket: confidential biopharma deal flow",
    },
  },
  {
    id: "angle3-buyers",
    track: "Audience",
    title: "Angle 3 — For buyers, BD and licensing (audience)",
    visual: "Light canvas with two side-by-side cards under the headline: TTO programs scored, and pharma out-licenses. Deep-emerald uppercase tags, slate body text.",
    audience: "Biotech BD, VP and Director of Business Development, search and evaluation, head of external innovation, biotech investors",
    onImage: "EdenMarket For biotech BD and licensing Browse licensable biotech assets Submit EOIs in one click Spin-outs TTO programs scored Pre-clinical assets from 300+ tech transfer offices Deprioritized Pharma out-licenses Non-core programs available for partnering edenmarket.com",
    linkedin: {
      intro: "Biotech BD: browse licensable assets and submit EOIs in one click. TTO spin-outs and pharma out-licenses, in one workspace.",
      headline: "Browse licensable biotech assets. Submit EOIs in one click.",
    },
    meta: {
      primary: "Browse licensable biotech assets. Submit EOIs in one click.",
      headline: "For biotech BD",
      description: "EdenMarket is live",
    },
    x: {
      tweet: "Biotech BD: browse licensable assets and submit EOIs in one click. EdenMarket is live. edenmarket.com",
      card: "EdenMarket: licensable biotech assets in one workspace",
    },
  },
  {
    id: "angle4-sellers",
    track: "Audience",
    title: "Angle 4 — For sellers, TTOs and pharma out-licensing (audience)",
    visual: "Light canvas with two side-by-side cards under the headline: Blind listings, and Success-fee pricing. Same emerald tag treatment as angle 3 for symmetry across the buyer/seller pair.",
    audience: "TTO directors, biotech founders open to out-licensing, pharma out-licensing leads, head of corporate development",
    onImage: "EdenMarket For TTOs and pharma out-licensing List deprioritized programs in front of qualified buyers Confidential Blind listings Reveal asset details only after NDA signature Aligned Success-fee pricing No upfront cost You pay when a deal closes edenmarket.com",
    linkedin: {
      intro: "TTOs and pharma: list deprioritized programs in front of qualified buyers. Blind listings, success-fee pricing. EdenMarket is live.",
      headline: "List deprioritized programs in front of qualified buyers",
    },
    meta: {
      primary: "List deprioritized programs in front of qualified buyers.",
      headline: "For TTOs and pharma",
      description: "Success-fee pricing",
    },
    x: {
      tweet: "TTOs and pharma: list deprioritized programs in front of qualified buyers. EdenMarket is live. edenmarket.com",
      card: "EdenMarket: list biotech assets, success-fee pricing",
    },
  },
];

function len(s) { return s.length; }
function wordCount(s) { return s.split(/\s+/).filter((w) => w.length > 0).length; }

function buildManifest() {
  const L = [];
  L.push("# EdenMarket — Day-one launch ad batch (2026-05)");
  L.push("");
  L.push("First paid ad creative for **EdenMarket** (edenmarket.com), the third surface of the EdenNX suite. Shipped for day-one launch in awareness mode so EdenMarket-targeted spend has matching creative when a customer clicks through from the EdenNX product-suite ads.");
  L.push("");
  L.push("Two messaging tracks running in parallel:");
  L.push("");
  L.push("1. **Positioning track (angles 1 and 2):** what EdenMarket is — the confidential biopharma deal marketplace.");
  L.push("2. **Audience track (angles 3 and 4):** for buyers (BD, licensing) and for sellers (TTOs, pharma out-licensing). Buyer/seller cards mirror each other so the pair reads as one campaign.");
  L.push("");
  L.push("All on-image copy is em-dash free and the artwork is evergreen (no launch date on the image). 'Live now' messaging is reserved for the per-platform post copy below, where it can be updated without re-rendering the artwork.");
  L.push("");
  L.push("**Brand identity locked from edennx.com / edenmarket.com:**");
  L.push("- Logo: leaf glyph + EdenMarket wordmark, rendered in HTML/CSS so the type aligns precisely with Inter on the rest of the artwork. Same top-left placement and ~7vh height as the EdenNX day-one batch.");
  L.push("- Typography: Inter (400, 500, 600, 700, 800, 900) — the only font family loaded by the live edennx.com / edenmarket.com sites.");
  L.push("- Palette: deep emerald base `#005f46` (matches the live --primary CSS variable on edennx.com), emerald accent `#10603b`, near-white canvas, slate-900 `#0f172a` body, slate-600 `#475569` muted. Pulled directly from the EdenNX site CSS so the EdenMarket creative reads as one suite with the EdenNX product-suite ads it sits next to.");
  L.push("- Single source-of-truth stylesheet shared across all 4 angles: `artifacts/mockup-sandbox/public/ads/_shared-edenmarket.css`.");
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
    L.push(`**On-image copy (${wc} words):** ${a.onImage}`);
    L.push("");
    L.push("**Files:**");
    for (const s of SIZES) {
      L.push(`- \`edenmarket-${a.id}-${s.name}.png\` (${s.w}x${s.h})`);
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
