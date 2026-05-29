import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400&family=Barlow+Semi+Condensed:wght@600;700;800&display=swap" rel="stylesheet">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body {
  background: hsl(210 25% 88%);
  font-family: 'Barlow', system-ui, sans-serif;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px 20px 60px;
}
.doc {
  width: 794px;
  background: hsl(210 25% 97%);
  box-shadow: 0 12px 48px hsl(222 40% 10% / 0.22);
  overflow: hidden;
}

/* HEADER */
.hd {
  background: hsl(210 25% 97%);
  padding: 14px 40px;
  border-bottom: 2px solid hsl(142 52% 36%);
  display: flex; align-items: center; justify-content: space-between; gap: 20px;
}
.wordmark { display: flex; align-items: center; gap: 9px; }
.wm-text {
  font-family: 'Barlow Semi Condensed', system-ui, sans-serif;
  font-size: 16px; font-weight: 700; letter-spacing: -0.02em; color: hsl(222 40% 14%);
}
.wm-text em { font-style: normal; color: hsl(142 52% 36%); }
.hd-right { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; }
.hd-url { font-size: 11px; font-weight: 600; letter-spacing: 0.03em; color: hsl(222 40% 22%); }
.hd-date { font-size: 9px; color: hsl(215 18% 52%); letter-spacing: 0.08em; text-transform: uppercase; }

/* HERO */
.hero {
  background: hsl(210 25% 97%);
  padding: 36px 40px 34px;
  border-bottom: 1px solid hsl(142 28% 89%);
  position: relative; overflow: hidden;
}
.hero::before {
  content: '';
  position: absolute; top: -60px; right: -60px;
  width: 380px; height: 380px;
  background: radial-gradient(circle, hsl(142 55% 48% / 0.07) 0%, transparent 65%);
  pointer-events: none;
}
.hero-hed {
  position: relative;
  font-family: 'Barlow Semi Condensed', system-ui, sans-serif;
  font-size: 32px; line-height: 1.08; letter-spacing: -0.025em;
  color: hsl(142 52% 30%); margin-bottom: 13px; max-width: 590px;
}
.hero-hed-setup { font-weight: 600; }
.hero-hed-punch { font-weight: 800; }
.hero-kicker {
  position: relative;
  font-size: 13px; font-weight: 500;
  color: hsl(142 52% 36%); margin-bottom: 14px; letter-spacing: 0.01em;
}
.hero-body {
  position: relative;
  font-size: 13px; font-weight: 400; line-height: 1.72;
  color: hsl(222 30% 32%); max-width: 560px;
}

/* BODY SECTIONS */
.body { background: hsl(210 25% 97%); padding: 0 40px; border-bottom: 1px solid hsl(142 28% 89%); }
.section {
  display: grid; grid-template-columns: 72px 1fr;
  gap: 0 20px; padding: 26px 0;
  border-bottom: 1px solid hsl(142 28% 90%);
}
.section:last-child { border-bottom: none; }
.sec-num {
  font-family: 'Barlow Semi Condensed', system-ui, sans-serif;
  font-size: 48px; font-weight: 800; letter-spacing: -0.04em;
  color: hsl(142 52% 36%); line-height: 1; padding-top: 1px;
}
.sec-hed {
  font-family: 'Barlow Semi Condensed', system-ui, sans-serif;
  font-size: 15px; font-weight: 700; letter-spacing: -0.01em;
  color: hsl(222 47% 12%); margin-bottom: 8px; line-height: 1.2;
}
.sec-body {
  font-size: 12px; font-weight: 400; line-height: 1.74;
  color: hsl(222 30% 24%);
}
.sec-body strong { font-weight: 600; color: hsl(33 85% 38%); }

/* COVERAGE — 4 columns */
.cov {
  background: hsl(142 65% 11%);
  display: grid; grid-template-columns: 1fr 1px 1fr 1px 1fr 1px 1fr;
}
.cov-div { background: hsl(142 40% 20% / 0.5); }
.cov-cell { padding: 18px 14px; text-align: center; }
.cov-num {
  display: block; font-family: 'Barlow Semi Condensed', system-ui, sans-serif;
  font-size: 24px; font-weight: 800; letter-spacing: -0.03em;
  line-height: 1; margin-bottom: 3px;
}
.cov-num.amber { color: hsl(33 85% 58%); }
.cov-num.emerald { color: hsl(142 65% 58%); }
.cov-label {
  display: block; font-size: 8px; font-weight: 700; letter-spacing: 0.14em;
  text-transform: uppercase; color: hsl(142 32% 62%); margin-bottom: 6px;
}
.cov-ex { display: block; font-size: 9.5px; color: hsl(142 18% 58%); line-height: 1.55; }

/* PRICING */
.pricing {
  background: hsl(142 15% 96%); padding: 22px 40px;
  border-bottom: 1px solid hsl(142 28% 89%);
}
.pricing-table {
  display: grid; grid-template-columns: 1fr 1fr 1fr;
  border: 1px solid hsl(142 28% 87%);
  background: hsl(142 28% 87%); gap: 1px;
}
.tier { padding: 15px 17px; background: hsl(210 25% 97%); }
.tier-featured { background: hsl(142 65% 10%); }
.tier-name {
  font-size: 9px; font-weight: 700; letter-spacing: 0.16em;
  text-transform: uppercase; color: hsl(142 52% 36%); margin-bottom: 7px;
}
.tier-featured .tier-name { color: hsl(142 65% 55%); }
.tier-price {
  font-family: 'Barlow Semi Condensed', system-ui, sans-serif;
  font-size: 22px; font-weight: 800; letter-spacing: -0.03em;
  color: hsl(222 47% 12%); line-height: 1; margin-bottom: 8px;
}
.tier-price span { font-size: 12px; font-weight: 500; color: hsl(215 18% 46%); letter-spacing: 0; }
.tier-featured .tier-price { color: hsl(210 25% 95%); }
.tier-featured .tier-price span { color: hsl(142 22% 60%); }
.tier-desc { font-size: 11px; line-height: 1.6; color: hsl(215 18% 38%); }
.tier-featured .tier-desc { color: hsl(142 20% 64%); }

/* FOOTER */
.ft {
  background: hsl(142 15% 95%);
  border-top: 1px solid hsl(142 28% 88%);
  padding: 22px 40px;
  display: flex; align-items: center; justify-content: space-between; gap: 24px;
}
.cta-btn {
  display: inline-block; padding: 10px 22px;
  background: hsl(33 85% 44%); color: #fff;
  font-family: 'Barlow Semi Condensed', system-ui, sans-serif;
  font-size: 12px; font-weight: 700; letter-spacing: 0.04em;
  text-decoration: none; border-radius: 3px; margin-bottom: 10px;
}
.ft-contact { font-size: 10px; color: hsl(215 20% 40%); line-height: 1.7; }
.ft-right { display: flex; flex-direction: column; align-items: center; gap: 5px; flex-shrink: 0; }
.qr-placeholder {
  width: 60px; height: 60px; background: hsl(142 18% 86%);
  border-radius: 4px; border: 1px solid hsl(142 20% 78%);
}
.qr-label { font-size: 9px; letter-spacing: 0.06em; color: hsl(215 16% 40%); text-transform: uppercase; }
</style>
</head>
<body>
<div class="doc">

  <!-- HEADER -->
  <div class="hd">
    <div class="wordmark">
      <svg width="26" height="26" viewBox="0 0 28 28" fill="none" style="color: hsl(142 52% 36%)">
        <circle cx="14" cy="14" r="12" stroke="currentColor" stroke-width="1.4"/>
        <circle cx="14" cy="14" r="7.5" stroke="currentColor" stroke-width="1.2" stroke-opacity="0.55"/>
        <circle cx="14" cy="14" r="3" stroke="currentColor" stroke-width="1.2" stroke-opacity="0.35"/>
        <line x1="2" y1="14" x2="5" y2="14" stroke="currentColor" stroke-width="1.2"/>
        <line x1="23" y1="14" x2="26" y2="14" stroke="currentColor" stroke-width="1.2"/>
        <line x1="14" y1="2" x2="14" y2="5" stroke="currentColor" stroke-width="1.2"/>
        <line x1="14" y1="23" x2="14" y2="26" stroke="currentColor" stroke-width="1.2"/>
      </svg>
      <span class="wm-text">Eden<em>Radar</em></span>
    </div>
    <div class="hd-right">
      <span class="hd-url">edenradar.com</span>
      <span class="hd-date">May 2026</span>
    </div>
  </div>

  <!-- HERO -->
  <div class="hero">
    <h1 class="hero-hed">
      <span class="hero-hed-setup">By the time an asset appears in a public filing,</span><br>
      <span class="hero-hed-punch">the licensing window is already closing.</span>
    </h1>
    <p class="hero-kicker" style="color: hsl(33 85% 40%); font-weight: 600;">Before the patent. Before the competition.</p>
    <p class="hero-body">
      EdenRadar monitors 350+ technology transfer offices in real time, surfacing pre-clinical and
      discovery-stage assets before they reach patent databases. Every result is scored, enriched
      by EDEN AI with 12 structured fields, and delivered with the context your BD team needs
      to evaluate, engage, and move first.
    </p>
  </div>

  <!-- NUMBERED SECTIONS -->
  <div class="body">

    <div class="section">
      <div class="sec-num">01</div>
      <div>
        <h2 class="sec-hed">Monitor 350+ tech transfer offices in real time, scored against your deal profile.</h2>
        <p class="sec-body">
          A single query scans <strong>350+ technology transfer office portals</strong> for pre-commercial,
          pre-patent assets alongside <strong>active clinical trial registries</strong>,
          <strong>published literature</strong>, and <strong>patent filings</strong>. Every TTO result
          is scored 1&ndash;100 against your saved deal profile: therapeutic area, modality, and development
          stage. Set your profile once; EdenRadar applies it to every search automatically. Filter by
          indication, stage, institution, or date, and sort by score or momentum to surface assets with
          the strongest and most recent signal.
        </p>
      </div>
    </div>

    <div class="section">
      <div class="sec-num">02</div>
      <div>
        <h2 class="sec-hed">Track every asset from first signal to term sheet.</h2>
        <p class="sec-body">
          Save any result to a private pipeline and move it across five tracked statuses:
          <strong>Watching, Evaluating, In Discussion, On Hold,</strong> and <strong>Passed</strong>.
          The kanban board updates in real time. Add <strong>timestamped team notes</strong>, generate a
          <strong>one-click executive brief</strong>, and export the full pipeline as a structured
          <strong>CSV</strong> for BD review. Set saved search alerts; when new assets match your
          criteria, EdenRadar surfaces them at the top of your feed.
        </p>
      </div>
    </div>

    <div class="section">
      <div class="sec-num">03</div>
      <div>
        <h2 class="sec-hed">A complete intelligence brief, not a database record.</h2>
        <p class="sec-body">
          Every asset generates a structured dossier: target, modality, indication, development stage,
          <strong>mechanism of action</strong>, <strong>innovation claim</strong>, <strong>unmet need</strong>,
          <strong>comparable drugs</strong>, <strong>patent status</strong>, <strong>licensing readiness</strong>,
          and TTO contact. A streamed AI narrative synthesises the science, commercial rationale, and
          competitive landscape, closing with a <strong>suggested BD next step</strong>. Competing assets,
          active clinical trials, and supporting literature are included automatically. Share via
          <strong>permanent link</strong> or print for board presentation.
        </p>
      </div>
    </div>

    <div class="section">
      <div class="sec-num">04</div>
      <div>
        <h2 class="sec-hed">Map the research landscape before targeting a single asset.</h2>
        <p class="sec-body">
          The <strong>Intelligence</strong> tab provides a real-time view of the entire indexed corpus
          across all 350+ TTO portals. See which <strong>therapeutic mechanisms</strong> have the
          highest research activity, identify <strong>supply gaps</strong> where unmet need is high and
          competing assets are scarce, and monitor <strong>modality momentum</strong> to see which
          delivery platforms are gaining ground. <strong>Institution velocity</strong> shows which TTOs
          are adding assets fastest. Every data point is clickable: select a mechanism, modality, or
          institution and EdenRadar runs a pre-filtered search directly from the landscape view.
        </p>
      </div>
    </div>

  </div>

  <!-- COVERAGE STRIP — 4 columns -->
  <div class="cov">
    <div class="cov-cell">
      <span class="cov-num amber">350+</span>
      <span class="cov-label">TTO Portals</span>
      <span class="cov-ex">Global Coverage of<br>Tech Transfer Network</span>
    </div>
    <div class="cov-div"></div>
    <div class="cov-cell">
      <span class="cov-num emerald">33,000+</span>
      <span class="cov-label">Scored Assets</span>
      <span class="cov-ex">Pre-clinical &middot; Discovery &middot; Phase I/II &middot; Available for licensing</span>
    </div>
    <div class="cov-div"></div>
    <div class="cov-cell">
      <span class="cov-num emerald">12</span>
      <span class="cov-label">Data Intelligence Layers</span>
      <span class="cov-ex">Per asset &middot; Structured &middot; AI-synthesised</span>
    </div>
    <div class="cov-div"></div>
    <div class="cov-cell">
      <span class="cov-num emerald">40+</span>
      <span class="cov-label">Live Data Sources</span>
      <span class="cov-ex">Patents &middot; Clinical Trials &middot; Research</span>
    </div>
  </div>

  <!-- PRICING -->
  <div class="pricing">
    <div class="pricing-table">
      <div class="tier">
        <div class="tier-name">Individual</div>
        <div class="tier-price">$1,999<span>/mo</span></div>
        <div class="tier-desc">Single seat. Pipeline tracking and saved asset lists. PDF and CSV export.</div>
      </div>
      <div class="tier tier-featured">
        <div class="tier-name">Team</div>
        <div class="tier-price">$8,999<span>/mo</span></div>
        <div class="tier-desc">5 seats. Shared pipeline and watchlists. Org dashboard. Priority support.</div>
      </div>
      <div class="tier">
        <div class="tier-name">Enterprise</div>
        <div class="tier-price">$16,999<span>/mo</span></div>
        <div class="tier-desc">10 seats. Dedicated account manager. Custom alert configurations.</div>
      </div>
    </div>
  </div>

  <!-- FOOTER -->
  <div class="ft">
    <div>
      <a class="cta-btn" href="#">Request early access at edenradar.com</a>
      <div class="ft-contact">&copy; 2026 EdenRadar &middot; All rights reserved</div>
    </div>
    <div class="ft-right">
      <div class="qr-placeholder"></div>
      <span class="qr-label">Scan to apply</span>
    </div>
  </div>

</div>
</body>
</html>`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 900, height: 900 });
await page.setContent(html, { waitUntil: "networkidle" });
await page.waitForTimeout(2000);
await page.screenshot({ path: "screenshot-onepager.png", fullPage: true });
await browser.close();
console.log("Done: screenshot-onepager.png");
