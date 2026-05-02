export interface DispatchAsset {
  id: number;
  assetName: string;
  institution: string;
  indication: string | null;
  modality: string | null;
  developmentStage: string;
  summary: string | null;
  sourceUrl: string | null;
  firstSeenAt: Date | string;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stageColor(stage: string): string {
  const s = stage.toLowerCase();
  if (s.includes("phase 3") || s.includes("phase-3") || s.includes("approved")) return "#059669";
  if (s.includes("phase 2") || s.includes("phase-2")) return "#2563eb";
  if (s.includes("phase 1") || s.includes("phase-1")) return "#7c3aed";
  if (s.includes("preclinical")) return "#d97706";
  return "#6b7280";
}

function stageBg(stage: string): string {
  const s = stage.toLowerCase();
  if (s.includes("phase 3") || s.includes("phase-3") || s.includes("approved")) return "#d1fae5";
  if (s.includes("phase 2") || s.includes("phase-2")) return "#dbeafe";
  if (s.includes("phase 1") || s.includes("phase-1")) return "#ede9fe";
  if (s.includes("preclinical")) return "#fef3c7";
  return "#f3f4f6";
}

function stageText(stage: string): string {
  const s = stage.toLowerCase();
  if (s.includes("phase 3") || s.includes("phase-3") || s.includes("approved")) return "#065f46";
  if (s.includes("phase 2") || s.includes("phase-2")) return "#1e40af";
  if (s.includes("phase 1") || s.includes("phase-1")) return "#5b21b6";
  if (s.includes("preclinical")) return "#92400e";
  return "#374151";
}

function capitalize(str: string): string {
  if (!str || str === "unknown") return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/* EdenRadar green palette */
const G_MAIN   = "#25a15a";
const G_BRIGHT = "#36bb6c";
const G_DARK   = "#0d1e14";
const G_MID    = "#1a3325";

/* Sprout icon in a rounded green square — matches EdenScout icon from login screen */
const SPROUT_LOGO_SVG = `<svg width="38" height="38" viewBox="0 0 38 38" style="display:block;" xmlns="http://www.w3.org/2000/svg">
  <rect width="38" height="38" rx="8" fill="${G_MAIN}"/>
  <g stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none">
    <path d="M19 28v-8"/>
    <path d="M19 20c0-4-2.8-7-7-8 0 5 3 8 7 8z"/>
    <path d="M19 20c0-4 2.8-7 7-8 0 5-3 8-7 8z"/>
    <line x1="13" y1="28" x2="25" y2="28"/>
  </g>
</svg>`;

/* Building icon for institution headers */
const BUILDING_SVG = `<svg width="13" height="13" viewBox="0 0 13 13" style="display:inline-block;vertical-align:middle;margin-right:5px;margin-top:-1px;" xmlns="http://www.w3.org/2000/svg">
  <rect x="1" y="3" width="11" height="9" rx="1" fill="none" stroke="${G_MAIN}" stroke-width="1.2"/>
  <rect x="3" y="5.5" width="2" height="2" rx=".3" fill="${G_MAIN}"/>
  <rect x="8" y="5.5" width="2" height="2" rx=".3" fill="${G_MAIN}"/>
  <rect x="5.5" y="8" width="2" height="4" rx=".3" fill="${G_MAIN}"/>
  <path d="M1 3L6.5 1 12 3" stroke="${G_MAIN}" stroke-width="1.2" fill="none"/>
</svg>`;

/* Dark mode header SVG decoration */
const HEADER_SVG_DARK = `<svg
  xmlns="http://www.w3.org/2000/svg"
  width="620" height="140"
  viewBox="0 0 620 140"
  style="position:absolute;top:0;left:0;width:100%;height:100%;display:block;pointer-events:none;"
  preserveAspectRatio="xMidYMid slice"
  aria-hidden="true">
  <defs>
    <pattern id="er-dots-d" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
      <circle cx="1.5" cy="1.5" r="1.5" fill="${G_BRIGHT}" fill-opacity="0.08"/>
    </pattern>
    <radialGradient id="er-glow-d" cx="75%" cy="40%" r="45%">
      <stop offset="0%" stop-color="${G_BRIGHT}" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="${G_BRIGHT}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="620" height="140" fill="url(#er-dots-d)"/>
  <rect width="620" height="140" fill="url(#er-glow-d)"/>
  <line x1="490" y1="28" x2="545" y2="55" stroke="${G_BRIGHT}" stroke-width="0.8" stroke-opacity="0.25"/>
  <line x1="545" y1="55" x2="580" y2="30" stroke="${G_BRIGHT}" stroke-width="0.8" stroke-opacity="0.20"/>
  <line x1="545" y1="55" x2="530" y2="100" stroke="${G_BRIGHT}" stroke-width="0.8" stroke-opacity="0.18"/>
  <line x1="530" y1="100" x2="572" y2="112" stroke="${G_BRIGHT}" stroke-width="0.8" stroke-opacity="0.15"/>
  <line x1="490" y1="28" x2="530" y2="100" stroke="${G_BRIGHT}" stroke-width="0.5" stroke-opacity="0.10"/>
  <line x1="580" y1="30" x2="572" y2="112" stroke="${G_BRIGHT}" stroke-width="0.5" stroke-opacity="0.10"/>
  <line x1="460" y1="72" x2="490" y2="28" stroke="${G_BRIGHT}" stroke-width="0.6" stroke-opacity="0.13"/>
  <line x1="460" y1="72" x2="530" y2="100" stroke="${G_BRIGHT}" stroke-width="0.6" stroke-opacity="0.12"/>
  <circle cx="490" cy="28"  r="4"   fill="${G_BRIGHT}" fill-opacity="0.55"/>
  <circle cx="490" cy="28"  r="7"   fill="${G_BRIGHT}" fill-opacity="0.10"/>
  <circle cx="545" cy="55"  r="5.5" fill="${G_BRIGHT}" fill-opacity="0.45"/>
  <circle cx="545" cy="55"  r="9"   fill="${G_BRIGHT}" fill-opacity="0.08"/>
  <circle cx="580" cy="30"  r="3"   fill="${G_BRIGHT}" fill-opacity="0.35"/>
  <circle cx="530" cy="100" r="3.5" fill="${G_BRIGHT}" fill-opacity="0.35"/>
  <circle cx="572" cy="112" r="2.5" fill="${G_BRIGHT}" fill-opacity="0.25"/>
  <circle cx="460" cy="72"  r="3"   fill="${G_BRIGHT}" fill-opacity="0.28"/>
  <circle cx="608" cy="68"  r="2"   fill="${G_BRIGHT}" fill-opacity="0.20"/>
  <line x1="580" y1="30" x2="608" y2="68" stroke="${G_BRIGHT}" stroke-width="0.5" stroke-opacity="0.12"/>
  <circle cx="608" cy="68"  r="2"   fill="${G_BRIGHT}" fill-opacity="0.20"/>
</svg>`;

/* Light mode header SVG decoration — subtle, low-opacity dots and constellation */
const HEADER_SVG_LIGHT = `<svg
  xmlns="http://www.w3.org/2000/svg"
  width="620" height="120"
  viewBox="0 0 620 120"
  style="position:absolute;top:0;left:0;width:100%;height:100%;display:block;pointer-events:none;"
  preserveAspectRatio="xMidYMid slice"
  aria-hidden="true">
  <defs>
    <pattern id="er-dots-l" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
      <circle cx="1.5" cy="1.5" r="1.5" fill="${G_MAIN}" fill-opacity="0.07"/>
    </pattern>
    <radialGradient id="er-glow-l" cx="80%" cy="40%" r="40%">
      <stop offset="0%" stop-color="${G_MAIN}" stop-opacity="0.07"/>
      <stop offset="100%" stop-color="${G_MAIN}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="620" height="120" fill="url(#er-dots-l)"/>
  <rect width="620" height="120" fill="url(#er-glow-l)"/>
  <line x1="490" y1="22" x2="545" y2="48" stroke="${G_MAIN}" stroke-width="0.7" stroke-opacity="0.15"/>
  <line x1="545" y1="48" x2="580" y2="24" stroke="${G_MAIN}" stroke-width="0.7" stroke-opacity="0.12"/>
  <line x1="545" y1="48" x2="530" y2="90" stroke="${G_MAIN}" stroke-width="0.7" stroke-opacity="0.10"/>
  <line x1="460" y1="65" x2="490" y2="22" stroke="${G_MAIN}" stroke-width="0.5" stroke-opacity="0.10"/>
  <circle cx="490" cy="22"  r="3.5" fill="${G_MAIN}" fill-opacity="0.30"/>
  <circle cx="545" cy="48"  r="5"   fill="${G_MAIN}" fill-opacity="0.22"/>
  <circle cx="580" cy="24"  r="2.5" fill="${G_MAIN}" fill-opacity="0.18"/>
  <circle cx="530" cy="90"  r="2.5" fill="${G_MAIN}" fill-opacity="0.15"/>
  <circle cx="460" cy="65"  r="2"   fill="${G_MAIN}" fill-opacity="0.14"/>
</svg>`;

export function renderDispatchEmail(opts: {
  subject: string;
  assets: DispatchAsset[];
  windowLabel: string;
  isTest?: boolean;
  colorMode?: "light" | "dark";
  totalCount?: number;
  settingsUrl?: string;
  appBaseUrl?: string;
}): string {
  const { subject, assets, windowLabel, isTest = false, colorMode = "light", totalCount, settingsUrl, appBaseUrl = "https://edenradar.com" } = opts;
  const resolvedSettingsUrl = settingsUrl ?? `${appBaseUrl}/industry/settings`;
  const isLight = colorMode === "light";

  const byInstitution = new Map<string, DispatchAsset[]>();
  for (const a of assets) {
    const inst = a.institution || "Unknown Institution";
    if (!byInstitution.has(inst)) byInstitution.set(inst, []);
    byInstitution.get(inst)!.push(a);
  }

  const institutionBlocks = Array.from(byInstitution.entries()).map(([institution, items]) => {
    const cards = items.map((a) => {
      const borderColor = stageColor(a.developmentStage);
      const badgeBg = stageBg(a.developmentStage);
      const badgeTxt = stageText(a.developmentStage);
      const stageLabel = capitalize(a.developmentStage);
      const modalityLabel = capitalize(a.modality ?? "");
      const indicationLabel = a.indication && a.indication !== "unknown" ? capitalize(a.indication) : "";
      const summarySnippet = a.summary
        ? escapeHtml(a.summary.slice(0, 240)) + (a.summary.length > 240 ? "..." : "")
        : "";

      const stageBadge = stageLabel
        ? `<span style="display:inline-block;background:${badgeBg};color:${badgeTxt};font-size:11px;font-weight:600;padding:2px 9px;border-radius:999px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;white-space:nowrap;">${escapeHtml(stageLabel)}</span>`
        : "";
      const modalityBadge = modalityLabel
        ? `<span style="display:inline-block;background:#ede9fe;color:#5b21b6;font-size:11px;font-weight:500;padding:2px 9px;border-radius:999px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;white-space:nowrap;">${escapeHtml(modalityLabel)}</span>`
        : "";
      const indicationBadge = indicationLabel
        ? `<span style="display:inline-block;background:#f0fdf4;color:#166534;font-size:11px;font-weight:500;padding:2px 9px;border-radius:999px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;white-space:nowrap;">${escapeHtml(indicationLabel)}</span>`
        : "";

      const badgesHtml = [stageBadge, modalityBadge, indicationBadge].filter(Boolean).join(`<span style="display:inline-block;width:6px;"></span>`);

      const dossierUrl = `${appBaseUrl}/asset/${a.id}`;
      const ctaButton = `<a href="${dossierUrl}" style="display:inline-block;background:${G_MAIN};color:#ffffff;font-size:12px;font-weight:700;padding:7px 18px;border-radius:6px;text-decoration:none;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;letter-spacing:0.01em;">View in EdenRadar &rarr;</a>`;

      return `
      <tr>
        <td style="padding:0 0 14px 0;">
          <table cellpadding="0" cellspacing="0" width="100%" style="border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
            <tr>
              <td width="4" style="background:${borderColor};border-radius:8px 0 0 0;font-size:0;line-height:0;">&nbsp;</td>
              <td style="background:#ffffff;padding:16px 20px 14px 18px;">
                <p style="margin:0 0 8px 0;font-size:15px;font-weight:700;color:#0a1a0f;line-height:1.3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">${escapeHtml(a.assetName)}</p>
                <div style="margin-bottom:${summarySnippet ? "10px" : "0"};">${badgesHtml}</div>
                ${summarySnippet ? `<p style="margin:0;font-size:13px;color:#4b5563;line-height:1.65;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">${summarySnippet}</p>` : ""}
              </td>
            </tr>
            <tr>
              <td width="4" style="background:${borderColor};font-size:0;line-height:0;">&nbsp;</td>
              <td style="background:#f9fdf9;border-top:1px solid #ecf5ec;padding:10px 20px 10px 18px;">${ctaButton}</td>
            </tr>
          </table>
        </td>
      </tr>`;
    }).join("");

    return `
    <tr>
      <td style="padding:0 0 28px 0;">
        <table cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td style="padding:0 0 10px 0;border-bottom:1px solid #f0f9f4;">
              <p style="margin:0;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#6b7280;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">${BUILDING_SVG}${escapeHtml(institution)}</p>
            </td>
          </tr>
          <tr><td style="padding:12px 0 0 0;">
            <table cellpadding="0" cellspacing="0" width="100%">
              ${cards}
            </table>
          </td></tr>
        </table>
      </td>
    </tr>`;
  }).join("");

  const testBanner = isTest ? `
  <tr>
    <td style="padding:10px 32px;background:#f0fdf4;border-bottom:2px solid ${G_MAIN};">
      <p style="margin:0;font-size:12px;font-weight:700;color:#14532d;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;letter-spacing:0.01em;">TEST SEND &mdash; This email was sent as a preview only and was not delivered to subscribers.</p>
    </td>
  </tr>` : "";

  const year = new Date().getFullYear();

  /* ---- LIGHT MODE header ---- */
  const lightHeader = `
        <!-- Green accent bar top -->
        <tr>
          <td height="5" style="background:linear-gradient(90deg,${G_MAIN} 0%,${G_BRIGHT} 60%,${G_MAIN} 100%);font-size:0;line-height:0;">&nbsp;</td>
        </tr>

        <!-- Header: white + subtle dot grid + light constellation -->
        <tr>
          <td style="background:#f7fbf9;padding:0;position:relative;overflow:hidden;">
            ${HEADER_SVG_LIGHT}
            <table cellpadding="0" cellspacing="0" width="100%" style="position:relative;">
              <tr>
                <td style="padding:24px 32px 20px 32px;">
                  <table cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td width="50" valign="middle" style="padding-right:14px;">${SPROUT_LOGO_SVG}</td>
                      <td valign="middle">
                        <p style="margin:0;font-size:24px;font-weight:800;color:#0a1a0f;letter-spacing:-0.03em;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1;">EdenRadar</p>
                        <p style="margin:4px 0 0 0;font-size:11px;color:${G_MAIN};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;letter-spacing:0.07em;font-weight:700;text-transform:uppercase;">TTO Intelligence Digest</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Window strip — light -->
        <tr>
          <td style="background:#f0fdf4;border-bottom:1px solid #d1fae5;padding:8px 32px;">
            <p style="margin:0;font-size:12px;color:#166534;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
              <span style="color:#4b7a60;">Window:</span>&nbsp;&nbsp;${escapeHtml(windowLabel)}
            </p>
          </td>
        </tr>`;

  /* ---- DARK MODE header ---- */
  const darkHeader = `
        <!-- Green accent bar top -->
        <tr>
          <td height="5" style="background:linear-gradient(90deg,${G_MAIN} 0%,${G_BRIGHT} 60%,${G_MAIN} 100%);font-size:0;line-height:0;">&nbsp;</td>
        </tr>

        <!-- Header: dark green + dot grid + connected nodes SVG -->
        <tr>
          <td style="background:${G_DARK};padding:0;position:relative;overflow:hidden;">
            ${HEADER_SVG_DARK}
            <table cellpadding="0" cellspacing="0" width="100%" style="position:relative;">
              <tr>
                <td style="padding:28px 32px 22px 32px;">
                  <table cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td width="50" valign="middle" style="padding-right:14px;">${SPROUT_LOGO_SVG}</td>
                      <td valign="middle">
                        <p style="margin:0;font-size:24px;font-weight:800;color:#ffffff;letter-spacing:-0.03em;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1;">EdenRadar</p>
                        <p style="margin:4px 0 0 0;font-size:11px;color:${G_BRIGHT};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;letter-spacing:0.07em;font-weight:700;text-transform:uppercase;">TTO Intelligence Digest</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Window strip — dark -->
        <tr>
          <td style="background:${G_MID};padding:9px 32px;">
            <p style="margin:0;font-size:12px;color:#6bac88;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
              <span style="color:#3a6650;">Window:</span>&nbsp;&nbsp;${escapeHtml(windowLabel)}
            </p>
          </td>
        </tr>`;

  const headerHtml = isLight ? lightHeader : darkHeader;

  /* ---- FOOTER ---- */
  const footerBg = isLight ? "#f0fdf4" : G_DARK;
  const footerTitle = isLight ? "#0a1a0f" : "#ffffff";
  const footerSubtitle = isLight ? G_MAIN : "#3a6650";
  const footerBody = isLight ? "#4b7a60" : "#2d4d3b";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#eef4f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table cellpadding="0" cellspacing="0" width="100%" style="background:#eef4f0;padding:36px 0 48px 0;">
  <tr>
    <td align="center">
      <table cellpadding="0" cellspacing="0" width="620" style="max-width:620px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 2px 20px rgba(15,50,25,0.13);">

        ${headerHtml}

        ${testBanner}

        <!-- Body -->
        <tr>
          <td style="padding:28px 32px 8px 32px;">
            <p style="margin:0 0 22px 0;font-size:14px;color:#374151;line-height:1.75;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
              Here are the latest licensable TTO assets discovered across <strong style="color:#0a1a0f;">${byInstitution.size}&nbsp;institution${byInstitution.size !== 1 ? "s" : ""}</strong> during the <strong style="color:#0a1a0f;">${escapeHtml(windowLabel.toLowerCase())}</strong>. Each listing is sourced directly from institutional technology transfer offices.
            </p>

            <!-- Green divider -->
            <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;">
              <tr>
                <td width="36" height="2" style="background:${G_MAIN};border-radius:2px;font-size:0;line-height:0;">&nbsp;</td>
                <td height="2" style="background:#e9f5ee;font-size:0;line-height:0;">&nbsp;</td>
              </tr>
            </table>

            <table cellpadding="0" cellspacing="0" width="100%">
              ${institutionBlocks}
            </table>
            ${totalCount && totalCount > assets.length ? `
            <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:20px;">
              <tr>
                <td style="background:#f0fdf4;border:1px solid #d1fae5;border-radius:8px;padding:14px 20px;text-align:center;">
                  <p style="margin:0;font-size:13px;color:#166534;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
                    <strong style="color:#0a1a0f;">+${totalCount - assets.length} more match${totalCount - assets.length !== 1 ? "es" : ""}</strong> found for this alert.
                    &nbsp;<a href="${appBaseUrl}/alerts" style="color:${G_MAIN};font-weight:700;text-decoration:none;">View all ${totalCount} in EdenRadar &rarr;</a>
                  </p>
                </td>
              </tr>
            </table>` : ""}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:${footerBg};padding:22px 32px;">
            <table cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td valign="top">
                  <p style="margin:0 0 2px 0;font-size:15px;font-weight:800;color:${footerTitle};letter-spacing:-0.02em;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">EdenRadar</p>
                  <p style="margin:0 0 12px 0;font-size:11px;color:${footerSubtitle};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;letter-spacing:0.03em;">Biotech intelligence for industry buyers</p>
                  <p style="margin:0;font-size:11px;color:${footerBody};line-height:1.7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
                    You received this digest because you are subscribed to EdenRadar TTO intelligence alerts.<br />
                    To manage your alert preferences or unsubscribe, <a href="${resolvedSettingsUrl}" style="color:${isLight ? G_MAIN : G_BRIGHT};text-decoration:underline;font-size:11px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">visit your notification settings</a>.<br />
                    &copy; ${year} EdenRadar. All rights reserved.
                  </p>
                </td>
                <td align="right" valign="bottom">
                  <svg width="60" height="50" viewBox="0 0 60 50" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <line x1="10" y1="38" x2="30" y2="20" stroke="${G_BRIGHT}" stroke-width="0.6" stroke-opacity="0.2"/>
                    <line x1="30" y1="20" x2="52" y2="30" stroke="${G_BRIGHT}" stroke-width="0.6" stroke-opacity="0.18"/>
                    <line x1="30" y1="20" x2="42" y2="8"  stroke="${G_BRIGHT}" stroke-width="0.6" stroke-opacity="0.15"/>
                    <line x1="52" y1="30" x2="42" y2="8"  stroke="${G_BRIGHT}" stroke-width="0.5" stroke-opacity="0.12"/>
                    <circle cx="10" cy="38" r="2"   fill="${G_BRIGHT}" fill-opacity="0.25"/>
                    <circle cx="30" cy="20" r="3.5" fill="${G_BRIGHT}" fill-opacity="0.35"/>
                    <circle cx="52" cy="30" r="2.5" fill="${G_BRIGHT}" fill-opacity="0.28"/>
                    <circle cx="42" cy="8"  r="2"   fill="${G_BRIGHT}" fill-opacity="0.22"/>
                  </svg>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Green accent bar bottom -->
        <tr>
          <td height="4" style="background:linear-gradient(90deg,${G_BRIGHT} 0%,${G_MAIN} 100%);font-size:0;line-height:0;">&nbsp;</td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}
