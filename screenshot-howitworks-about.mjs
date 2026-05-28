import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const howItWorksHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700;9..40,800;9..40,900&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; font-family: 'DM Sans', system-ui, sans-serif; margin: 0; padding: 0; }
  body { background: white; }
</style>
</head>
<body>

<!-- NAV -->
<nav style="position:sticky;top:0;z-index:50;border-bottom:1px solid rgba(16,185,129,0.12);background:rgba(255,255,255,0.88);backdrop-filter:blur(12px);padding:0 24px;height:56px;display:flex;align-items:center;justify-content:space-between;">
  <div style="display:flex;align-items:center;gap:8px;">
    <div style="width:28px;height:28px;border-radius:50%;background:hsl(142 52% 36%);display:flex;align-items:center;justify-content:center;">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/></svg>
    </div>
    <span style="font-weight:800;font-size:15px;color:hsl(222 20% 10%);">EdenRadar</span>
  </div>
  <div style="display:flex;align-items:center;gap:20px;">
    <a style="font-size:13px;font-weight:600;color:hsl(142 52% 36%);text-decoration:none;">How it works</a>
    <a style="font-size:13px;font-weight:500;color:hsl(220 10% 40%);text-decoration:none;">Pricing</a>
    <button style="height:34px;padding:0 16px;border-radius:6px;background:hsl(33 85% 44%);color:white;font-size:13px;font-weight:600;border:none;">Get started</button>
  </div>
</nav>

<!-- HERO: light centered with radar rings -->
<section style="position:relative;overflow:hidden;min-height:92vh;background:white;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:112px 32px 72px;">

  <!-- Radar bg: rings + sweep arm (static snapshot) -->
  <div style="position:absolute;inset:0;pointer-events:none;" aria-hidden="true">
    <div style="position:absolute;inset:0;background:conic-gradient(from 48deg at 50% 50%, transparent 0deg, hsl(38 92% 50% / 0.02) 10deg, hsl(38 92% 50% / 0.07) 22deg, hsl(38 92% 50% / 0.13) 28deg, transparent 31deg);"></div>
    <div style="position:absolute;left:50%;top:50%;width:900px;height:1.5px;background:linear-gradient(to right, transparent 0%, hsl(38 92% 50% / 0.5) 40%, transparent 100%);transform-origin:0% 50%;transform:rotate(77deg);"></div>
    <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:180px;height:180px;border-radius:50%;border:1px solid hsl(142 55% 40% / 0.10);"></div>
    <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:360px;height:360px;border-radius:50%;border:1px solid hsl(142 55% 40% / 0.09);"></div>
    <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:540px;height:540px;border-radius:50%;border:1px solid hsl(142 55% 40% / 0.07);"></div>
    <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:720px;height:720px;border-radius:50%;border:1px solid hsl(142 55% 40% / 0.055);"></div>
    <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:900px;height:900px;border-radius:50%;border:1px solid hsl(142 55% 40% / 0.04);"></div>
    <div style="position:absolute;left:0;right:0;top:50%;height:1px;background:hsl(142 55% 40% / 0.06);"></div>
    <div style="position:absolute;top:0;bottom:0;left:50%;width:1px;background:hsl(142 55% 40% / 0.06);"></div>
    <div style="position:absolute;width:7px;height:7px;border-radius:50%;background:#c47d1a;opacity:0.8;left:calc(50% + 240px);top:calc(50% - 110px);box-shadow:0 0 10px #c47d1a88;"></div>
    <div style="position:absolute;width:6px;height:6px;border-radius:50%;background:#34d399;opacity:0.6;left:calc(50% - 260px);top:calc(50% + 95px);box-shadow:0 0 7px #34d399;"></div>
    <div style="position:absolute;width:5px;height:5px;border-radius:50%;background:#34d399;opacity:0.5;left:calc(50% + 310px);top:calc(50% + 150px);box-shadow:0 0 6px #34d399;"></div>
    <div style="position:absolute;bottom:0;left:0;right:0;height:100px;background:linear-gradient(to bottom,transparent,white);"></div>
  </div>

  <!-- Headline with amber accents -->
  <h1 style="font-size:clamp(38px,5vw,62px);font-weight:900;line-height:1.06;letter-spacing:-0.03em;color:hsl(222 20% 10%);margin-bottom:20px;max-width:720px;position:relative;z-index:1;">
    Most licensing deals are <span style="color:hsl(33 85% 44%);">missed</span>, not <span style="color:hsl(33 85% 44%);">lost</span>.
  </h1>

  <!-- Sub-copy -->
  <div style="margin-bottom:40px;max-width:440px;position:relative;z-index:1;">
    <p style="font-size:17px;line-height:1.65;color:hsl(222 15% 48%);margin-bottom:6px;">
      The asset was indexed. The window was open. The team that closed the deal searched smarter.
    </p>
    <p style="font-size:17px;font-weight:600;color:hsl(142 52% 36%);">EDEN makes sure that's you.</p>
  </div>

  <!-- EDEN Chat Demo card -->
  <div style="width:100%;max-width:580px;border-radius:18px;overflow:hidden;background:white;box-shadow:0 8px 32px rgba(0,0,0,0.10),0 2px 8px rgba(0,0,0,0.06),0 32px 72px rgba(0,0,0,0.08);margin-bottom:36px;display:flex;flex-direction:column;height:580px;position:relative;z-index:1;">

    <!-- Header -->
    <div style="display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid hsl(220 13% 91%);background:hsl(142 52% 36% / 0.04);flex-shrink:0;">
      <div style="width:26px;height:26px;border-radius:50%;background:white;border:1.5px solid hsl(142 52% 36% / 0.3);flex-shrink:0;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 3px hsl(142 52% 36% / 0.08);">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="hsl(142 52% 36%)" stroke-width="2.5"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/></svg>
      </div>
      <div style="flex:1;min-width:0;text-align:left;">
        <p style="font-size:11px;font-weight:700;color:hsl(222 20% 10%);line-height:1.3;">
          <span style="color:hsl(142 52% 36%);">E</span>ngine for <span style="color:hsl(142 52% 36%);">D</span>iscovery &amp; <span style="color:hsl(142 52% 36%);">E</span>merging <span style="color:hsl(142 52% 36%);">N</span>etworks
        </p>
        <p style="font-size:9px;color:hsl(220 10% 52%);font-weight:500;margin-top:1px;">350+ institutions · 14,847 assets indexed</p>
      </div>
      <div style="display:flex;align-items:center;gap:5px;flex-shrink:0;">
        <span style="width:6px;height:6px;border-radius:50%;background:hsl(142 52% 36%);"></span>
        <span style="font-size:10px;font-weight:600;color:hsl(142 52% 36%);">Active</span>
      </div>
    </div>

    <!-- Message area — full conversation shown -->
    <div style="flex:1;overflow:hidden;padding:16px;display:flex;flex-direction:column;gap:14px;background:hsl(220 20% 98%);">

      <!-- User message 1 -->
      <div style="display:flex;justify-content:flex-end;">
        <div style="max-width:82%;padding:9px 14px;font-size:12px;line-height:1.55;font-weight:500;color:white;background:hsl(33 85% 44%);border-radius:14px 14px 3px 14px;box-shadow:0 3px 12px hsl(33 85% 44% / 0.28);">
          We're building out our oncology pipeline. What's moving at Hopkins right now?
        </div>
      </div>

      <!-- EDEN response 1 -->
      <div style="display:flex;gap:9px;align-items:flex-start;">
        <div style="width:24px;height:24px;border-radius:50%;background:white;border:1.5px solid hsl(142 52% 36% / 0.3);flex-shrink:0;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 3px hsl(142 52% 36% / 0.08);margin-top:2px;">
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="hsl(142 52% 36%)" stroke-width="2.5"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/></svg>
        </div>
        <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:8px;">
          <div style="background:hsl(142 52% 36% / 0.07);border-radius:4px 14px 14px 14px;padding:10px 14px;font-size:12px;line-height:1.6;color:hsl(222 15% 22%);">
            14 JHU programs indexed this week. Worth flagging: the HDAC inhibitor's target overlaps with Pfizer's Seagen territory, so deprioritize that one. The CAR-T scores 91, and the PI has two prior top-10 pharma licensings at this stage. I'd start there.
          </div>
          <div style="display:flex;flex-direction:column;gap:5px;">
            <div style="display:flex;align-items:center;gap:10px;height:52px;border-radius:10px;padding:0 14px;border:1px solid hsl(220 13% 91%);background:white;box-shadow:0 1px 4px rgba(0,0,0,0.05);">
              <div style="width:34px;height:34px;border-radius:7px;background:hsl(142 65% 48% / 0.12);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:12px;font-weight:700;color:hsl(142 65% 38%);">91</div>
              <div style="flex:1;min-width:0;text-align:left;">
                <p style="font-size:11px;font-weight:600;color:hsl(222 20% 14%);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">CAR-T Cell Therapy Targeting CD19/CD22 Dual Antigen</p>
                <p style="font-size:10px;color:hsl(220 10% 52%);margin-top:1px;">Johns Hopkins · Preclinical · Cell Therapy</p>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:10px;height:52px;border-radius:10px;padding:0 14px;border:1px solid hsl(220 13% 91%);background:white;box-shadow:0 1px 4px rgba(0,0,0,0.05);">
              <div style="width:34px;height:34px;border-radius:7px;background:hsl(38 92% 50% / 0.12);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:12px;font-weight:700;color:hsl(38 85% 38%);">88</div>
              <div style="flex:1;min-width:0;text-align:left;">
                <p style="font-size:11px;font-weight:600;color:hsl(222 20% 14%);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Bispecific Antibody Against PD-L1 and TIM-3 in Lymphoma</p>
                <p style="font-size:10px;color:hsl(220 10% 52%);margin-top:1px;">Johns Hopkins · IND-Enabling · Antibody</p>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:10px;height:52px;border-radius:10px;padding:0 14px;border:1px solid hsl(220 13% 91%);background:white;box-shadow:0 1px 4px rgba(0,0,0,0.05);">
              <div style="width:34px;height:34px;border-radius:7px;background:hsl(265 60% 60% / 0.12);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:12px;font-weight:700;color:hsl(265 55% 45%);">85</div>
              <div style="flex:1;min-width:0;text-align:left;">
                <p style="font-size:11px;font-weight:600;color:hsl(222 20% 14%);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">HDAC Inhibitor Platform for Solid Tumor Microenvironment</p>
                <p style="font-size:10px;color:hsl(220 10% 52%);margin-top:1px;">Johns Hopkins · Discovery · Small Molecule</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- User message 2 -->
      <div style="display:flex;justify-content:flex-end;">
        <div style="max-width:82%;padding:9px 14px;font-size:12px;line-height:1.55;font-weight:500;color:white;background:hsl(33 85% 44%);border-radius:14px 14px 3px 14px;box-shadow:0 3px 12px hsl(33 85% 44% / 0.28);">
          Has the PI published recently? We want a partner, not just a licensor.
        </div>
      </div>

      <!-- EDEN response 2 -->
      <div style="display:flex;gap:9px;align-items:flex-start;">
        <div style="width:24px;height:24px;border-radius:50%;background:white;border:1.5px solid hsl(142 52% 36% / 0.3);flex-shrink:0;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 3px hsl(142 52% 36% / 0.08);margin-top:2px;">
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="hsl(142 52% 36%)" stroke-width="2.5"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/></svg>
        </div>
        <div style="background:hsl(142 52% 36% / 0.07);border-radius:4px 14px 14px 14px;padding:10px 14px;font-size:12px;line-height:1.6;color:hsl(222 15% 22%);flex:1;">
          Three publications in the last 18 months, including Nature Medicine. Prior records show two industry co-development arrangements, not straight licenses. The TTO has flagged this program as partnership-preferred.
        </div>
      </div>

    </div>
  </div>

  <!-- Stats -->
  <div style="display:flex;gap:48px;margin-bottom:36px;position:relative;z-index:1;">
    <div style="text-align:center;">
      <div style="font-size:24px;font-weight:700;color:hsl(142 52% 36%);line-height:1;">0–100</div>
      <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:hsl(222 10% 52%);margin-top:4px;">EDEN readiness score</div>
    </div>
    <div style="text-align:center;">
      <div style="font-size:24px;font-weight:700;color:hsl(142 52% 36%);line-height:1;">Daily</div>
      <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:hsl(222 10% 52%);margin-top:4px;">Monitoring cadence</div>
    </div>
    <div style="text-align:center;">
      <div style="font-size:24px;font-weight:700;color:hsl(142 52% 36%);line-height:1;">4</div>
      <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:hsl(222 10% 52%);margin-top:4px;">Portals in ecosystem</div>
    </div>
  </div>

  <!-- CTA -->
  <button style="display:inline-flex;align-items:center;gap:8px;height:44px;padding:0 28px;border-radius:8px;background:hsl(33 85% 44%);color:white;font-size:15px;font-weight:700;border:none;position:relative;z-index:1;">
    Try EdenScout
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
  </button>

  <!-- Bottom fade to white -->
  <div style="position:absolute;bottom:0;left:0;right:0;height:100px;background:linear-gradient(to bottom,transparent,white);pointer-events:none;"></div>
</section>

</body>
</html>`;

const aboutHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<script src="https://cdn.tailwindcss.com"></script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700;9..40,800;9..40,900&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; font-family: 'DM Sans', system-ui, sans-serif; margin: 0; padding: 0; }
  body { background: white; }
</style>
</head>
<body>

<!-- NAV -->
<nav style="position:sticky;top:0;z-index:50;border-bottom:1px solid rgba(16,185,129,0.12);background:rgba(255,255,255,0.88);backdrop-filter:blur(12px);padding:0 24px;height:56px;display:flex;align-items:center;justify-content:space-between;">
  <div style="display:flex;align-items:center;gap:8px;">
    <div style="width:28px;height:28px;border-radius:50%;background:hsl(142 52% 36%);display:flex;align-items:center;justify-content:center;">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/></svg>
    </div>
    <span style="font-weight:800;font-size:15px;color:hsl(222 20% 10%);">EdenRadar</span>
  </div>
  <div style="display:flex;align-items:center;gap:20px;">
    <a style="font-size:13px;font-weight:500;color:hsl(220 10% 40%);text-decoration:none;">How it works</a>
    <a style="font-size:13px;font-weight:500;color:hsl(220 10% 40%);text-decoration:none;">Pricing</a>
    <button style="height:36px;padding:0 16px;border-radius:6px;background:hsl(33 85% 44%);color:white;font-size:13px;font-weight:600;border:none;">Get started</button>
  </div>
</nav>

<!-- HERO -->
<section style="position:relative;overflow:hidden;min-height:78vh;display:flex;align-items:center;justify-content:center;text-align:center;">
  <!-- Radar bg -->
  <div style="position:absolute;inset:0;background:white;" aria-hidden="true">
    <div style="position:absolute;inset:0;background:conic-gradient(from 48deg at 50% 50%, transparent 0deg, hsl(38 92% 50% / 0.02) 10deg, hsl(38 92% 50% / 0.07) 22deg, hsl(38 92% 50% / 0.13) 28deg, transparent 31deg);"></div>
    <div style="position:absolute;left:50%;top:50%;width:680px;height:1.5px;background:linear-gradient(to right, transparent 0%, hsl(38 92% 50% / 0.45) 40%, transparent 100%);transform-origin:0% 50%;transform:rotate(77deg);"></div>
    <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:200px;height:200px;border-radius:50%;border:1px solid hsl(142 55% 40% / 0.10);"></div>
    <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:380px;height:380px;border-radius:50%;border:1px solid hsl(142 55% 40% / 0.09);"></div>
    <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:560px;height:560px;border-radius:50%;border:1px solid hsl(142 55% 40% / 0.07);"></div>
    <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:740px;height:740px;border-radius:50%;border:1px solid hsl(142 55% 40% / 0.06);"></div>
    <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:920px;height:920px;border-radius:50%;border:1px solid hsl(142 55% 40% / 0.04);"></div>
    <div style="position:absolute;left:0;right:0;top:50%;height:1px;background:hsl(142 55% 40% / 0.06);"></div>
    <div style="position:absolute;top:0;bottom:0;left:50%;width:1px;background:hsl(142 55% 40% / 0.06);"></div>
    <div style="position:absolute;width:7px;height:7px;border-radius:50%;background:#c47d1a;opacity:0.75;left:calc(50% + 190px);top:calc(50% - 130px);box-shadow:0 0 10px #c47d1a88;"></div>
    <div style="position:absolute;width:6px;height:6px;border-radius:50%;background:#34d399;opacity:0.6;left:calc(50% - 220px);top:calc(50% + 80px);box-shadow:0 0 7px #34d399;"></div>
    <div style="position:absolute;width:5px;height:5px;border-radius:50%;background:#34d399;opacity:0.5;left:calc(50% + 290px);top:calc(50% + 120px);box-shadow:0 0 6px #34d399;"></div>
    <div style="position:absolute;bottom:0;left:0;right:0;height:120px;background:linear-gradient(to bottom,transparent,white);"></div>
  </div>

  <!-- Copy -->
  <div style="position:relative;z-index:10;max-width:860px;margin:0 auto;padding:120px 32px 80px;">
    <h1 style="font-size:clamp(36px,5vw,68px);font-weight:900;line-height:1.05;letter-spacing:-0.03em;color:hsl(222 20% 10%);margin-bottom:24px;text-wrap:balance;">
      Built by industry insiders,<br/>
      <span style="color:hsl(142 52% 36%);">for the industry.</span>
    </h1>
    <p style="font-size:18px;line-height:1.65;color:hsl(222 20% 10% / 0.6);max-width:600px;margin:0 auto 36px;">
      EdenRadar was founded on a single conviction: the world's most important biotech assets are locked inside university technology transfer offices, and the industry teams that need them have no efficient way to find them.
    </p>
    <button style="display:inline-flex;align-items:center;gap:8px;height:44px;padding:0 28px;border-radius:8px;background:hsl(33 85% 44%);color:white;font-size:15px;font-weight:600;border:none;">
      Get Started
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
    </button>
  </div>
</section>

<!-- BOTTOM CTA -->
<section style="background:linear-gradient(135deg,hsl(25 80% 6%) 0%,hsl(33 75% 9%) 60%,hsl(38 70% 7%) 100%);border-top:1px solid hsl(33 85% 44% / 0.25);padding:80px 24px;text-align:center;">
  <h2 style="font-size:clamp(26px,4vw,42px);font-weight:700;color:hsl(38 25% 91%);margin-bottom:16px;line-height:1.2;">
    The discovery gap is a solvable problem.
  </h2>
  <p style="font-size:16px;color:hsl(38 15% 62%);max-width:440px;margin:0 auto 36px;line-height:1.6;">
    EdenRadar was built to close it: systematically, at scale, starting with the first search you run.
  </p>
  <div style="display:flex;align-items:center;justify-content:center;gap:14px;">
    <button style="height:44px;padding:0 28px;border-radius:8px;background:hsl(38 25% 91%);color:hsl(25 80% 12%);font-size:15px;font-weight:700;border:none;">Get Started</button>
    <button style="height:44px;padding:0 28px;border-radius:8px;background:transparent;border:1px solid hsl(33 85% 44% / 0.3);color:hsl(33 60% 68%);font-size:15px;font-weight:600;">See Pricing</button>
  </div>
</section>

</body>
</html>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 820 });

  // HowItWorks hero
  await page.setContent(howItWorksHtml, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "screenshot_howitworks.png" });
  console.log("HowItWorks hero screenshot saved.");

  // Full HowItWorks
  await page.screenshot({ path: "screenshot_howitworks_full.png", fullPage: true });
  console.log("HowItWorks full screenshot saved.");

  // About hero
  await page.setContent(aboutHtml, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "screenshot_about.png" });
  console.log("About hero screenshot saved.");

  await browser.close();
  console.log("Done.");
})();
