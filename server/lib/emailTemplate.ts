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
  if (s.includes("phase 3") || s.includes("phase-3") || s.includes("approved")) return "#10b981";
  if (s.includes("phase 2") || s.includes("phase-2")) return "#3b82f6";
  if (s.includes("phase 1") || s.includes("phase-1")) return "#8b5cf6";
  if (s.includes("preclinical")) return "#f59e0b";
  return "#6b7280";
}

function capitalize(str: string): string {
  if (!str || str === "unknown") return "Unknown";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

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
      const stageBg = stageColor(a.developmentStage);
      const summarySnippet = a.summary
        ? escapeHtml(a.summary.slice(0, 220)) + (a.summary.length > 220 ? "..." : "")
        : "";
      const linkHtml = a.sourceUrl
        ? `<a href="${escapeHtml(a.sourceUrl)}" style="color:#4f46e5;text-decoration:none;font-size:12px;">View Listing &rarr;</a>`
        : "";

      return `
      <tr>
        <td style="padding:0 0 16px 0;">
          <table cellpadding="0" cellspacing="0" width="100%" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="padding:16px 20px 12px 20px;">
                <table cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td>
                      <p style="margin:0 0 6px 0;font-size:15px;font-weight:600;color:#111827;font-family:sans-serif;">${escapeHtml(a.assetName)}</p>
                      <table cellpadding="0" cellspacing="0">
                        <tr>
                          <td style="padding-right:6px;">
                            <span style="display:inline-block;background:${stageBg}22;color:${stageBg};font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;font-family:sans-serif;">${escapeHtml(capitalize(a.developmentStage))}</span>
                          </td>
                          <td style="padding-right:6px;">
                            <span style="display:inline-block;background:#e0e7ff;color:#4338ca;font-size:11px;padding:2px 8px;border-radius:999px;font-family:sans-serif;">${escapeHtml(capitalize(a.modality))}</span>
                          </td>
                          <td>
                            <span style="display:inline-block;background:#f3f4f6;color:#374151;font-size:11px;padding:2px 8px;border-radius:999px;font-family:sans-serif;">${escapeHtml(a.indication !== "unknown" ? capitalize(a.indication) : "")}</span>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
                ${summarySnippet ? `<p style="margin:10px 0 0 0;font-size:13px;color:#4b5563;line-height:1.6;font-family:sans-serif;">${summarySnippet}</p>` : ""}
              </td>
            </tr>
            ${linkHtml ? `<tr><td style="padding:8px 20px 12px 20px;border-top:1px solid #e5e7eb;">${linkHtml}</td></tr>` : ""}
          </table>
        </td>
      </tr>`;
    }).join("");

    return `
    <tr>
      <td style="padding:0 0 24px 0;">
        <table cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td style="padding:0 0 10px 0;">
              <p style="margin:0;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#6b7280;font-family:sans-serif;">${escapeHtml(institution)}</p>
            </td>
          </tr>
          ${cards}
        </table>
      </td>
    </tr>`;
  }).join("");

  const testBanner = isTest ? `
  <tr>
    <td style="padding:10px 24px;background:#fef9c3;border-bottom:1px solid #fde047;">
      <p style="margin:0;font-size:12px;font-weight:600;color:#854d0e;font-family:sans-serif;">TEST SEND — This email was sent as a preview only and was not delivered to subscribers.</p>
    </td>
  </tr>` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:sans-serif;">
<table cellpadding="0" cellspacing="0" width="100%" style="background:#f3f4f6;padding:32px 0;">
  <tr>
    <td align="center">
      <table cellpadding="0" cellspacing="0" width="640" style="max-width:640px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1e1b4b 0%,#312e81 100%);padding:28px 32px;">
            <table cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td>
                  <p style="margin:0;font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.02em;font-family:sans-serif;">EdenRadar</p>
                  <p style="margin:4px 0 0 0;font-size:13px;color:#a5b4fc;font-family:sans-serif;">TTO Intelligence Digest &mdash; ${escapeHtml(windowLabel)}</p>
                </td>
                <td align="right">
                  <span style="display:inline-block;background:rgba(255,255,255,0.15);border-radius:999px;padding:4px 14px;font-size:12px;color:#e0e7ff;font-family:sans-serif;">${assets.length} asset${assets.length !== 1 ? "s" : ""}</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        ${testBanner}

        <!-- Body -->
        <tr>
          <td style="padding:28px 32px 8px 32px;">
            <p style="margin:0 0 20px 0;font-size:14px;color:#374151;line-height:1.7;font-family:sans-serif;">
              Here are the latest licensable TTO assets discovered across ${byInstitution.size} institution${byInstitution.size !== 1 ? "s" : ""} in the past ${escapeHtml(windowLabel.toLowerCase())}.
            </p>
            <table cellpadding="0" cellspacing="0" width="100%">
              ${institutionBlocks}
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 32px;">
            <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;font-family:sans-serif;">
              You received this digest because you subscribed to EdenRadar TTO intelligence alerts.<br />
              &copy; ${new Date().getFullYear()} EdenRadar. All rights reserved.
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}
