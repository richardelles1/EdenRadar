#!/usr/bin/env node
// Render evergreen round-3 ads (EdenMarket, EdenLab, EDEN engine) at 4 sizes
// per angle. Output: build/ads/evergreen-round-3-2026-05/ (24 PNGs + manifest.md)
import { chromium } from "playwright";
import { mkdir, writeFile, readFile, stat, rename } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "artifacts/mockup-sandbox/public");
const SLUG = "evergreen-round-3-2026-05";
const OUT_DIR = path.join(ROOT, "build/ads", SLUG);

const ANGLES = [
  { id: "edenmarket-blind",        surface: "EdenMarket",  file: "r3-edenmarket-blind.html",        url: "edenmarket.com"     },
  { id: "edenmarket-success-fee",  surface: "EdenMarket",  file: "r3-edenmarket-success-fee.html",  url: "edenmarket.com"     },
  { id: "edenlab-timestamp",       surface: "EdenLab",     file: "r3-edenlab-timestamp.html",       url: "edenradar.com/lab"  },
  { id: "edenlab-grants",          surface: "EdenLab",     file: "r3-edenlab-grants.html",          url: "edenradar.com/lab"  },
  { id: "edenengine-reads",        surface: "EDEN engine", file: "r3-edenengine-reads.html",        url: "edenradar.com"      },
  { id: "edenengine-scale",        surface: "EDEN engine", file: "r3-edenengine-scale.html",        url: "edenradar.com"      },
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
        const outPath = path.join(OUT_DIR, `r3-${angle.id}-${size.name}.png`);
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

const ANGLE_COPY = [
  {
    id: "edenmarket-blind",
    surface: "EdenMarket",
    url: "edenmarket.com",
    title: "Angle 1 — EdenMarket: Blind by design",
    visual: "Editorial low-key photo of an unbranded archival folder on a dark conference table, single warm spotlight, deep shadow vignette across the bottom 40% so the headline scrim has a quiet canvas.",
    audience: "TTO directors, biotech founders open to out-licensing, pharma out-licensing leads, head of corporate development",
    linkedin: {
      intro: "List your licensable asset on EdenMarket without revealing who you are. A blind marketplace for biotech BD.",
      headline: "List without revealing who you are",
    },
    meta: {
      primary: "List your licensable asset without revealing who you are.",
      headline: "Blind by design",
      description: "EdenMarket for biotech",
    },
    x: {
      tweet: "EdenMarket: list your licensable asset without revealing who you are. Reveal only after NDA.",
      card: "EdenMarket: blind marketplace for licensable biotech",
    },
  },
  {
    id: "edenmarket-success-fee",
    surface: "EdenMarket",
    url: "edenmarket.com",
    title: "Angle 2 — EdenMarket: Free to list, pay when you close",
    visual: "Two pairs of hands closing on a signed term sheet at golden hour, brushed steel pen, deep cinematic shadow on the bottom of the frame.",
    audience: "TTO directors, biotech founders, BD and licensing leads, head of corporate development",
    linkedin: {
      intro: "Free to list. Pay only when a licensable asset finds its buyer. EdenMarket runs on success-fee pricing.",
      headline: "Free to list. Pay when you close.",
    },
    meta: {
      primary: "Free to list. Pay only when a deal closes.",
      headline: "Aligned with your outcome",
      description: "Success-fee pricing",
    },
    x: {
      tweet: "EdenMarket: free to list. Pay only when a licensable asset finds its buyer.",
      card: "EdenMarket: success-fee biotech marketplace",
    },
  },
  {
    id: "edenlab-timestamp",
    surface: "EdenLab",
    url: "edenradar.com/lab",
    title: "Angle 3 — EdenLab: Timestamp the idea before someone else does",
    visual: "Editorial macro of a research notebook caught mid-write under warm lamplight, paper texture and ink visible, deep shadow falling across the lower third of the frame.",
    audience: "PhD students, postdocs, solo concept creators, early-stage researchers",
    linkedin: {
      intro: "Date-stamp your concept before someone else publishes it. EdenLab gives every researcher a registered place to plant their idea.",
      headline: "Timestamp the idea before someone else does",
    },
    meta: {
      primary: "Date-stamp your concept before someone else publishes it.",
      headline: "Concept registry for researchers",
      description: "Free for researchers",
    },
    x: {
      tweet: "EdenLab: timestamp the idea before someone else does. Free for researchers and concept creators.",
      card: "EdenLab: a concept registry for researchers",
    },
  },
  {
    id: "edenlab-grants",
    surface: "EdenLab",
    url: "edenradar.com/lab",
    title: "Angle 4 — EdenLab: Every grant that fits your lab, the day it opens",
    visual: "Lab bench bathed in early morning light, shallow depth of field on a row of glassware and a single open notebook, deep shadow vignette across the bottom of the frame.",
    audience: "PIs, lab leaders, research office staff, grants and contracts officers",
    linkedin: {
      intro: "Every NIH, NSF, DOE, EU, and foundation grant that fits your lab, surfaced the day it opens. EdenLab is free for researchers.",
      headline: "Every grant that fits your lab, the day it opens",
    },
    meta: {
      primary: "Every grant that fits your lab, the day it opens.",
      headline: "Grants discovery for PIs",
      description: "Free for researchers",
    },
    x: {
      tweet: "EdenLab: every grant that fits your lab, the day it opens. Free for researchers.",
      card: "EdenLab: grants discovery for PIs and labs",
    },
  },
  {
    id: "edenengine-reads",
    surface: "EDEN engine",
    url: "edenradar.com",
    title: "Angle 5 — EDEN engine: Reads the science so you don't have to",
    visual: "Editorial macro: a stack of scientific journals dissolving into a single beam of light, low-key lighting, deep shadow across the bottom 40%, premium tech-meets-publishing aesthetic.",
    audience: "Pharma BD, licensing executives, biotech investors, head of external innovation",
    linkedin: {
      intro: "The AI layer behind every EdenRadar surface. Tech transfer pages, papers, grants, parsed and scored into a single signal.",
      headline: "Reads the science so you don't have to",
    },
    meta: {
      primary: "The AI layer that reads the science so you don't have to.",
      headline: "EDEN engine",
      description: "AI for biotech BD",
    },
    x: {
      tweet: "EDEN engine: the AI layer that reads the science so you don't have to. Powers EdenRadar.",
      card: "EDEN engine: AI intelligence for biotech BD",
    },
  },
  {
    id: "edenengine-scale",
    surface: "EDEN engine",
    url: "edenradar.com",
    title: "Angle 6 — EDEN engine: 300+ TTOs, 10M+ papers, one signal",
    visual: "Wide architectural shot of a research campus or aerial network of buildings at dusk, a faint light grid suggesting connection between sites, deep shadow vignette across the bottom of the frame.",
    audience: "Enterprise BD leadership, pharma licensing, biotech investors, search and evaluation",
    linkedin: {
      intro: "300+ tech transfer offices. 10M+ scientific papers. One signal you can act on. The EDEN engine powers EdenRadar.",
      headline: "300+ TTOs. 10M+ papers. One signal.",
    },
    meta: {
      primary: "300+ TTOs. 10M+ papers. One signal you can act on.",
      headline: "One signal at scale",
      description: "EDEN engine",
    },
    x: {
      tweet: "300+ TTOs. 10M+ papers. One signal. The EDEN engine powers every EdenRadar surface.",
      card: "EDEN engine: 300+ TTOs and 10M+ papers, one signal",
    },
  },
];

function len(s) { return s.length; }

function buildManifest() {
  const L = [];
  L.push("# Evergreen ads — Round 3 (2026-05)");
  L.push("");
  L.push("Round 1 and 2 covered EdenScout. The EdenNX launch batch covered the parent brand. Round 3 ships always-on awareness creative for the three remaining high-value surfaces:");
  L.push("");
  L.push("- **EdenMarket** — blind marketplace for licensable biotech assets (`edenmarket.com`)");
  L.push("- **EdenLab / EdenDiscovery** — researcher and concept-creator portal under EdenRadar (`edenradar.com/lab`)");
  L.push("- **EDEN engine** — the AI layer behind every EdenRadar surface, marketed under EdenRadar (`edenradar.com`)");
  L.push("");
  L.push("All on-image and post copy is em-dash free. Artwork is evergreen, no dated language and no on-image CTA buttons.");
  L.push("");
  L.push("**Locked legibility recipe (reused from round 2 unchanged):**");
  L.push("");
  L.push("- Bottom scrim 60vh, `transparent -> rgba(0,0,0,0.92)`");
  L.push("- Headline weight 900, ~8vmin landscape / 9vmin portrait, text-shadow `0 2px 8px rgba(0,0,0,0.55)`");
  L.push("- Subtitle weight 600, 3.4vmin, color `rgba(255,255,255,0.92)`");
  L.push("- White logo top-left at 5vh tall, footer URL bottom-left at 1.9vh");
  L.push("- Hero subject anchored upper two-thirds, dark vignette across bottom 40% of frame");
  L.push("");
  L.push("**Per-surface identity (single shared header drives all 24 renders):**");
  L.push("");
  L.push("- **EdenMarket** — Inter typography (Google Fonts), emerald accent `#34d399` over dark hero, leaf glyph logo, footer `edenmarket.com`. Inter and the emerald system are pulled from the live `edenmarket.com` / `edennx.com` sites.");
  L.push("- **EdenLab** — Open Sans typography (Google Fonts, EdenRadar parent pairing), violet accent `#c4b5fd` (matches the EdenLab in-app accent), flask glyph logo, footer `edenradar.com/lab` (canonical URL of the live researcher portal under EdenRadar).");
  L.push("- **EDEN engine** — Open Sans typography (Google Fonts), emerald accent `#34d399`, EdenRadar radar glyph logo, footer `edenradar.com`. Inherits the EdenRadar parent identity since the engine is marketed under EdenRadar.");
  L.push("");
  L.push("**Sizes shipped per angle (4 sizes x 6 angles = 24 PNGs):**");
  L.push("");
  L.push("- LinkedIn Single Image — 1200x627 (1.91:1 landscape)");
  L.push("- LinkedIn Square — 1200x1200 (1:1)");
  L.push("- Meta portrait — 1080x1350 (4:5)");
  L.push("- X landscape — 1200x675 (1.91:1)");
  L.push("");
  L.push("---");
  L.push("");
  for (const a of ANGLE_COPY) {
    L.push(`## ${a.title}`);
    L.push("");
    L.push(`**Surface:** ${a.surface}  |  **Footer URL:** ${a.url}`);
    L.push("");
    L.push(`**Visual:** ${a.visual}`);
    L.push("");
    L.push(`**Audience suggestion:** ${a.audience}`);
    L.push("");
    L.push("**Files:**");
    for (const s of SIZES) {
      L.push(`- \`r3-${a.id}-${s.name}.png\` (${s.w}x${s.h})`);
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
