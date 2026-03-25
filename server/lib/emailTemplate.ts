export interface DispatchAsset {
  id: number;
  assetName: string;
  institution: string;
  indication: string;
  modality: string;
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

const LOGO_SVG = `<svg width="36" height="36" viewBox="0 0 36 36" style="display:block;" xmlns="http://www.w3.org/2000/svg">
  <circle cx="18" cy="18" r="18" fill="#f59e0b" fill-opacity="0.18"/>
  <path d="M18 8C12.5 8 8 12.5 8 18c0 4.1 2.5 7.7 6.1 9.3L18 29l3.9-1.7C25.5 25.7 28 22.1 28 18c0-5.5-4.5-10-10-10z" fill="#f59e0b"/>
  <line x1="18" y1="10" x2="18" y2="22" stroke="#0c0a1e" stroke-width="1.8" stroke-linecap="round"/>
  <path d="M12.5 15.5c1.5-1.4 3.3-2.1 5.5-2.1s4 .7 5.5 2.1" stroke="#0c0a1e" stroke-width="1.8" stroke-linecap="round" fill="none"/>
  <path d="M14.5 19c.9-.8 2.1-1.3 3.5-1.3s2.6.5 3.5 1.3" stroke="#0c0a1e" stroke-width="1.6" stroke-linecap="round" fill="none"/>
</svg>`;

const BUILDING_SVG = `<svg width="13" height="13" viewBox="0 0 13 13" style="display:inline-block;vertical-align:middle;margin-right:5px;margin-top:-1px;" xmlns="http://www.w3.org/2000/svg">
  <rect x="1" y="3" width="11" height="9" rx="1" fill="none" stroke="#f59e0b" stroke-width="1.2"/>
  <rect x="3" y="5.5" width="2" height="2" rx=".3" fill="#f59e0b"/>
  <rect x="8" y="5.5" width="2" height="2" rx=".3" fill="#f59e0b"/>
  <rect x="5.5" y="8" width="2" height="4" rx=".3" fill="#f59e0b"/>
  <path d="M1 3L6.5 1 12 3" stroke="#f59e0b" stroke-width="1.2" fill="none"/>
</svg>`;

export function renderDispatchEmail(opts: {
  subject: string;
  assets: DispatchAsset[];
  windowLabel: string;
  isTest?: boolean;
}): string {
  const { subject, assets, windowLabel, isTest = false } = opts;

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
      const modalityLabel = capitalize(a.modality);
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

      const ctaButton = a.sourceUrl
        ? `<a href="${escapeHtml(a.sourceUrl)}" style="display:inline-block;background:#f59e0b;color:#0c0a1e;font-size:12px;font-weight:700;padding:7px 18px;border-radius:6px;text-decoration:none;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;letter-spacing:0.01em;">View Listing &rarr;</a>`
        : "";

      return `
      <tr>
        <td style="padding:0 0 14px 0;">
          <table cellpadding="0" cellspacing="0" width="100%" style="border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
            <tr>
              <td width="4" style="background:${borderColor};border-radius:8px 0 0 8px;font-size:0;line-height:0;">&nbsp;</td>
              <td style="background:#ffffff;padding:16px 20px 14px 18px;">
                <p style="margin:0 0 8px 0;font-size:15px;font-weight:700;color:#0f0e1a;line-height:1.3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">${escapeHtml(a.assetName)}</p>
                <div style="margin-bottom:${summarySnippet ? "10px" : "0"};">${badgesHtml}</div>
                ${summarySnippet ? `<p style="margin:0;font-size:13px;color:#4b5563;line-height:1.65;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">${summarySnippet}</p>` : ""}
              </td>
            </tr>
            ${ctaButton ? `
            <tr>
              <td width="4" style="background:${borderColor};font-size:0;line-height:0;">&nbsp;</td>
              <td style="background:#fafafa;border-top:1px solid #f0f0f0;padding:10px 20px 10px 18px;">${ctaButton}</td>
            </tr>` : ""}
          </table>
        </td>
      </tr>`;
    }).join("");

    return `
    <tr>
      <td style="padding:0 0 28px 0;">
        <table cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td style="padding:0 0 10px 0;border-bottom:1px solid #f3f4f6;">
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
    <td style="padding:10px 32px;background:#fffbeb;border-bottom:2px solid #f59e0b;">
      <p style="margin:0;font-size:12px;font-weight:700;color:#92400e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;letter-spacing:0.01em;">TEST SEND &mdash; This email was sent as a preview only and was not delivered to subscribers.</p>
    </td>
  </tr>` : "";

  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f0f0f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table cellpadding="0" cellspacing="0" width="100%" style="background:#f0f0f5;padding:36px 0 48px 0;">
  <tr>
    <td align="center">
      <table cellpadding="0" cellspacing="0" width="620" style="max-width:620px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.10);">

        <!-- Amber accent bar -->
        <tr>
          <td height="5" style="background:linear-gradient(90deg,#f59e0b 0%,#d97706 100%);font-size:0;line-height:0;">&nbsp;</td>
        </tr>

        <!-- Header -->
        <tr>
          <td style="background:#0c0a1e;padding:28px 32px 24px 32px;">
            <table cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td width="48" valign="middle" style="padding-right:14px;">${LOGO_SVG}</td>
                <td valign="middle">
                  <p style="margin:0;font-size:24px;font-weight:800;color:#ffffff;letter-spacing:-0.03em;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1;">EdenRadar</p>
                  <p style="margin:4px 0 0 0;font-size:12px;color:#f59e0b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;letter-spacing:0.04em;font-weight:600;text-transform:uppercase;">TTO Intelligence Digest</p>
                </td>
                <td align="right" valign="middle">
                  <table cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="background:rgba(245,158,11,0.15);border:1px solid rgba(245,158,11,0.35);border-radius:999px;padding:5px 14px;">
                        <p style="margin:0;font-size:13px;font-weight:700;color:#f59e0b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;white-space:nowrap;">${assets.length}&nbsp;asset${assets.length !== 1 ? "s" : ""}</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Window label strip -->
        <tr>
          <td style="background:#17132e;padding:10px 32px;">
            <p style="margin:0;font-size:12px;color:#a78bfa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
              <span style="color:#6d6a8a;">Window:</span>&nbsp;&nbsp;${escapeHtml(windowLabel)}&nbsp;&nbsp;&bull;&nbsp;&nbsp;<span style="color:#6d6a8a;">Institutions:</span>&nbsp;&nbsp;${byInstitution.size}
            </p>
          </td>
        </tr>

        ${testBanner}

        <!-- Intro -->
        <tr>
          <td style="padding:28px 32px 8px 32px;">
            <p style="margin:0 0 24px 0;font-size:14px;color:#374151;line-height:1.75;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
              Here are the latest licensable TTO assets discovered across <strong style="color:#0f0e1a;">${byInstitution.size}&nbsp;institution${byInstitution.size !== 1 ? "s" : ""}</strong> during the <strong style="color:#0f0e1a;">${escapeHtml(windowLabel.toLowerCase())}</strong>. Each listing is sourced directly from institutional technology transfer offices.
            </p>

            <!-- Divider -->
            <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;">
              <tr>
                <td width="32" height="2" style="background:#f59e0b;border-radius:2px;font-size:0;line-height:0;">&nbsp;</td>
                <td height="2" style="background:#f3f4f6;font-size:0;line-height:0;">&nbsp;</td>
              </tr>
            </table>

            <table cellpadding="0" cellspacing="0" width="100%">
              ${institutionBlocks}
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#0c0a1e;padding:24px 32px;">
            <table cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td>
                  <p style="margin:0 0 2px 0;font-size:14px;font-weight:800;color:#ffffff;letter-spacing:-0.02em;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">EdenRadar</p>
                  <p style="margin:0 0 12px 0;font-size:11px;color:#6d6a8a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;letter-spacing:0.03em;">Biotech intelligence for industry buyers</p>
                  <p style="margin:0;font-size:11px;color:#4a4870;line-height:1.7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
                    You received this digest because you are subscribed to EdenRadar TTO intelligence alerts.<br />
                    &copy; ${year} EdenRadar. All rights reserved.
                  </p>
                </td>
                <td align="right" valign="bottom">
                  <p style="margin:0;font-size:11px;color:#3d3a5c;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">Powered by EdenRadar</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Bottom amber bar -->
        <tr>
          <td height="4" style="background:linear-gradient(90deg,#d97706 0%,#f59e0b 100%);font-size:0;line-height:0;">&nbsp;</td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}
