import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const intelImgPath = path.join(__dirname, "screenshot-intelligence.png");
const intelImgB64 = readFileSync(intelImgPath).toString("base64");
const intelImgSrc = `data:image/png;base64,${intelImgB64}`;

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600&family=Barlow+Semi+Condensed:wght@600;700&display=swap" rel="stylesheet">
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: 'Barlow', system-ui, sans-serif;
  background: #f9fafb;
  color: #111827;
  height: 100vh;
  overflow: hidden;
}

/* Nav */
.nav {
  height: 56px;
  border-bottom: 1px solid #e5e7eb;
  background: rgba(249,250,251,0.95);
  backdrop-filter: blur(12px);
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 24px;
  position: relative; z-index: 20;
}
.nav-logo { display: flex; align-items: center; gap: 10px; }
.nav-logo-icon {
  width: 28px; height: 28px; border-radius: 6px;
  background: hsl(142,55%,36%);
  display: flex; align-items: center; justify-content: center;
}
.nav-logo-name { font-weight: 700; font-size: 15px; letter-spacing: -0.02em; color: #111827; }
.nav-logo-name span { color: hsl(142,55%,36%); }
.nav-links { display: flex; align-items: center; gap: 4px; }
.nav-link {
  padding: 6px 12px; border-radius: 6px;
  font-size: 13px; font-weight: 500;
  color: #6b7280; text-decoration: none;
}
.nav-btn-outline {
  padding: 6px 14px; border-radius: 6px;
  font-size: 12px; font-weight: 600;
  border: 1px solid rgba(16,185,129,0.35);
  color: hsl(142,55%,36%);
  background: transparent;
}
.nav-btn {
  padding: 6px 14px; border-radius: 6px;
  font-size: 12px; font-weight: 600;
  background: hsl(142,55%,36%);
  color: #fff; border: none;
}

/* Layout */
.layout {
  display: grid;
  grid-template-columns: 1fr 460px;
  height: calc(100vh - 56px);
}

/* LEFT panel — full-bleed intelligence background */
.left {
  position: relative;
  overflow: hidden;
  display: flex; flex-direction: column; justify-content: center;
}

/* Full-bleed background image */
.left-bg {
  position: absolute; inset: 0;
  width: 100%; height: 100%;
  object-fit: cover;
  object-position: top center;
  pointer-events: none; user-select: none;
}

/* Left-to-right gradient scrim */
.left-scrim {
  position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(
    to right,
    #f9fafb 24%,
    rgba(249,250,251,0.94) 40%,
    rgba(249,250,251,0.65) 58%,
    rgba(249,250,251,0.18) 78%,
    transparent 100%
  );
}

/* Content — lives in the opaque gradient zone */
.content {
  position: relative; z-index: 10;
  padding: 0 3.5rem;
  max-width: 500px;
}

.eyebrow {
  font-size: 0.62rem; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.2em;
  color: hsl(142,55%,34%);
  margin-bottom: 1.25rem;
}

.headline {
  font-family: 'Barlow Semi Condensed', 'Barlow', system-ui, sans-serif;
  font-size: 3.2rem;
  font-weight: 700;
  line-height: 1.05;
  letter-spacing: -0.025em;
  color: #111827;
  margin-bottom: 1rem;
}
.headline .accent { color: hsl(142,55%,34%); }

.subline {
  font-size: 0.875rem;
  line-height: 1.65;
  color: #6b7280;
  max-width: 38ch;
  margin-bottom: 1.5rem;
}

.stats { display: flex; gap: 1.25rem; margin-bottom: 2rem; flex-wrap: wrap; }
.stat-num {
  font-family: 'Barlow Semi Condensed', 'Barlow', system-ui, sans-serif;
  font-size: 1.7rem; font-weight: 700;
  letter-spacing: -0.025em;
  color: #111827;
  line-height: 1; margin-bottom: 0.25rem;
}
.stat-label {
  font-size: 0.68rem; color: #6b7280;
  line-height: 1.3; max-width: 11ch;
}

.disclaimer {
  font-size: 0.68rem; color: rgba(107,114,128,0.65);
}

/* Bottom-right context label */
.intel-label {
  position: absolute; bottom: 20px; right: 16px; z-index: 10;
  display: flex; align-items: center; gap: 6px;
  padding: 5px 12px; border-radius: 999px;
  background: rgba(249,250,251,0.82); border: 1px solid #e5e7eb;
  font-size: 11px; font-weight: 600; color: #6b7280;
  backdrop-filter: blur(6px);
}
.intel-dot { width: 6px; height: 6px; border-radius: 50%; background: hsl(142,55%,36%); flex-shrink: 0; }

/* RIGHT panel — form */
.right {
  background: #ffffff;
  border-left: 1px solid #e5e7eb;
  display: flex; flex-direction: column; justify-content: center;
  padding: 2.5rem 2.25rem;
  overflow-y: auto;
}
.form-wrap { width: 100%; }

.form-title {
  font-family: 'Barlow Semi Condensed', 'Barlow', system-ui, sans-serif;
  font-size: 1.75rem;
  font-weight: 700; letter-spacing: -0.015em;
  color: #111827;
  margin-bottom: 0.35rem;
}
.form-sub {
  font-size: 0.875rem; color: #6b7280;
  line-height: 1.6; margin-bottom: 1.5rem;
}

.form { display: flex; flex-direction: column; gap: 0.8rem; }
.field-group { display: flex; flex-direction: column; }
.field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; }
.label {
  display: block;
  font-size: 0.6rem; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.14em;
  color: #9ca3af; margin-bottom: 0.3rem;
}
.input, .select, .textarea {
  width: 100%;
  background: #f9fafb; border: 1px solid #e5e7eb;
  border-radius: 0.5rem; padding: 0.55rem 0.8rem;
  color: #374151; font-size: 0.875rem;
  font-family: 'Barlow', system-ui, sans-serif;
  outline: none; appearance: none;
}
.input::placeholder, .textarea::placeholder { color: #d1d5db; }
.textarea { resize: none; }

.submit-btn {
  display: flex; align-items: center; justify-content: center; gap: 0.5rem;
  width: 100%; padding: 0.7rem 1.25rem;
  border-radius: 0.5rem; border: none;
  background: hsl(142,55%,36%); color: #fff;
  font-size: 0.875rem; font-weight: 600;
  font-family: 'Barlow', system-ui, sans-serif;
  cursor: pointer; margin-top: 0.2rem;
}

.fine-print {
  margin-top: 1rem; text-align: center;
  font-size: 0.65rem; color: rgba(107,114,128,0.5);
}
</style>
</head>
<body>

<nav class="nav">
  <div class="nav-logo">
    <div class="nav-logo-icon">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round">
        <circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/>
        <line x1="12" y1="3" x2="12" y2="1"/>
      </svg>
    </div>
    <span class="nav-logo-name">Eden<span>Radar</span></span>
  </div>
  <div class="nav-links">
    <a class="nav-link">About</a>
    <a class="nav-link">Platform</a>
    <a class="nav-link">How It Works</a>
    <a class="nav-link">Pricing</a>
  </div>
  <div style="display:flex;align-items:center;gap:8px;">
    <button class="nav-btn-outline">Request Access</button>
    <button class="nav-btn">Sign In</button>
  </div>
</nav>

<div class="layout">

  <!-- LEFT: intelligence as background -->
  <div class="left">
    <img class="left-bg" src="${intelImgSrc}" alt="" />
    <div class="left-scrim"></div>

    <div class="content">
      <h1 class="headline">
        The BD intelligence<br>
        your competitors<br>
        <span class="accent">don't have.</span>
      </h1>

      <p class="subline">
        EdenScout monitors 350+ university tech transfer offices and surfaces AI-enriched asset dossiers before they hit marketing channels. Your deal flow, running ahead of the competition.
      </p>

      <div class="stats">
        <div>
          <p class="stat-num">350+</p>
          <p class="stat-label">Tech Transfer Offices</p>
        </div>
        <div>
          <p class="stat-num">33K+</p>
          <p class="stat-label">Scored Assets</p>
        </div>
        <div>
          <p class="stat-num">40+</p>
          <p class="stat-label">Live Data Sources</p>
        </div>
        <div>
          <p class="stat-num">Daily</p>
          <p class="stat-label">Updates &amp; Alerts</p>
        </div>
      </div>

      <p class="disclaimer">Applications reviewed personally. We'll reach out within 24 hours.</p>
    </div>

    <div class="intel-label">
      <span class="intel-dot"></span>
      Live landscape intelligence
    </div>
  </div>

  <!-- RIGHT: form -->
  <div class="right">
    <div class="form-wrap">
      <h2 class="form-title">Apply for early access</h2>
      <p class="form-sub">Tell us about yourself. We'll match you to the right access tier.</p>

      <form class="form">
        <div class="field-group">
          <label class="label">Work email</label>
          <input class="input" type="email" placeholder="you@company.com" />
        </div>
        <div class="field-row">
          <div class="field-group">
            <label class="label">First</label>
            <input class="input" type="text" placeholder="Jane" />
          </div>
          <div class="field-group">
            <label class="label">Last</label>
            <input class="input" type="text" placeholder="Smith" />
          </div>
        </div>
        <div class="field-group">
          <label class="label">Company</label>
          <input class="input" type="text" placeholder="Acme Therapeutics" />
        </div>
        <div class="field-row">
          <div class="field-group">
            <label class="label">Role</label>
            <select class="select">
              <option>Select your role</option>
              <option>Pharma BD / Licensing</option>
              <option>Biotech BD / Strategy</option>
              <option>TTO / Licensing Manager</option>
              <option>Biotech Investor / VC</option>
              <option>BD Consultant</option>
              <option>Other</option>
            </select>
          </div>
          <div class="field-group">
            <label class="label">Team size</label>
            <select class="select">
              <option>Team size</option>
              <option>Just me</option>
              <option>2 – 5</option>
              <option>6 – 20</option>
              <option>20+</option>
            </select>
          </div>
        </div>
        <div class="field-group">
          <label class="label">
            What are you hunting for?
            <span style="color:#d1d5db;text-transform:none;letter-spacing:normal;font-weight:400;"> (optional)</span>
          </label>
          <textarea class="textarea" rows="2" placeholder="e.g. early-stage oncology assets in solid tumors, CAR-T programs, gene therapy..."></textarea>
        </div>
        <button type="button" class="submit-btn">
          Request access
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"/>
            <polyline points="12 5 19 12 12 19"/>
          </svg>
        </button>
      </form>

      <p class="fine-print">No credit card. No spam. We review every application.</p>
    </div>
  </div>

</div>
</body>
</html>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 860 });
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.waitForTimeout(1400);

  const out = path.join(__dirname, "screenshot-demo.png");
  await page.screenshot({ path: out, fullPage: false });
  console.log("Saved:", out);
  await browser.close();
})();
