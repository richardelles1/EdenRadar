const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_ADDRESS = process.env.RESEND_FROM_ADDRESS ?? "EdenRadar <noreply@edenradar.com>";
const APP_URL = "https://edenradar.com";
const LOGIN_URL = `${APP_URL}/login`;

if (!process.env.RESEND_FROM_ADDRESS) {
  console.warn(
    "[email] RESEND_FROM_ADDRESS is not set — using default noreply@edenradar.com." +
      " Set this env var to a Resend-verified domain address before going to production."
  );
}

const PLAN_LABELS: Record<string, string> = {
  individual: "EdenScout Individual",
  team5: "EdenScout Team (5 seats)",
  team10: "EdenScout Team (10 seats)",
  enterprise: "EdenScout Enterprise",
};

function planLabel(tier: string): string {
  return PLAN_LABELS[tier] ?? tier;
}

function baseHtml(bodyContent: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>EdenRadar</title>
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;border:1px solid #e5e7eb;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="background:#059669;padding:28px 40px;">
              <span style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">EdenRadar</span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:36px 40px 32px;">
              ${bodyContent}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px 28px;border-top:1px solid #f3f4f6;">
              <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.5;">
                EdenRadar &mdash; Biotech intelligence for industry buyers.<br />
                Questions? Reply to this email or contact <a href="mailto:support@edenradar.com" style="color:#059669;text-decoration:none;">support@edenradar.com</a>.
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

export async function sendEmail(to: string, subject: string, html: string, from?: string): Promise<void> {
  if (!RESEND_API_KEY) {
    console.warn("[email] RESEND_API_KEY not configured — skipping email to", to);
    return;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: from ?? FROM_ADDRESS, to, subject, html }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "(unreadable)");
      throw new Error(`[email] Resend rejected (${res.status}): ${text}`);
    }
    console.log("[email] Sent:", subject, "->", to);
  } catch (err) {
    console.error("[email] Failed to send to", to, err);
    throw err;
  }
}

export function sendWelcomeEmail(to: string, name: string): Promise<void> {
  const displayName = name?.trim() || "there";
  const html = baseHtml(`
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#111827;">Welcome to EdenRadar, ${displayName}.</h1>
    <p style="margin:0 0 14px;font-size:15px;color:#374151;line-height:1.6;">
      Your account is ready. You now have access to <strong>EdenDiscovery</strong> and <strong>EdenLab</strong>,
      and you can explore TTO assets from leading research institutions.
    </p>
    <p style="margin:0 0 28px;font-size:15px;color:#374151;line-height:1.6;">
      If your organization has an EdenScout subscription, your team administrator will connect your account.
    </p>
    <a href="${LOGIN_URL}"
       style="display:inline-block;background:#059669;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 28px;border-radius:6px;">
      Go to EdenRadar
    </a>
    <p style="margin:28px 0 0;font-size:13px;color:#6b7280;line-height:1.5;">
      If you did not create this account, please contact us immediately at
      <a href="mailto:support@edenradar.com" style="color:#059669;text-decoration:none;">support@edenradar.com</a>.
    </p>
  `);
  return sendEmail(to, "Welcome to EdenRadar.", html);
}

export function sendTeamInviteEmail(
  to: string,
  name: string,
  orgName: string,
  planTier: string,
  setPasswordLink?: string,
): Promise<void> {
  const displayName = name?.trim() || "there";
  const actionBlock = setPasswordLink
    ? `<a href="${setPasswordLink}"
         style="display:inline-block;background:#059669;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 28px;border-radius:6px;">
        Set Your Password
      </a>
      <p style="margin:16px 0 0;font-size:13px;color:#6b7280;line-height:1.5;">
        This link expires in 24 hours. After setting your password you can sign in at
        <a href="${LOGIN_URL}" style="color:#059669;text-decoration:none;">edenradar.com</a> anytime.
      </p>`
    : `<a href="${LOGIN_URL}"
         style="display:inline-block;background:#059669;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 28px;border-radius:6px;">
        Sign in to EdenRadar
      </a>`;
  const html = baseHtml(`
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#111827;">${orgName} has added you to EdenRadar.</h1>
    <p style="margin:0 0 14px;font-size:15px;color:#374151;line-height:1.6;">
      Hi ${displayName}, your account has been set up as part of your organization's
      <strong>${planLabel(planTier)}</strong> plan.
    </p>
    <p style="margin:0 0 28px;font-size:15px;color:#374151;line-height:1.6;">
      You will have access to EdenScout, EdenDiscovery, and EdenLab once you set your password below.
    </p>
    ${actionBlock}
    <p style="margin:28px 0 0;font-size:13px;color:#6b7280;line-height:1.5;">
      If you were not expecting this invitation, please contact
      <a href="mailto:support@edenradar.com" style="color:#059669;text-decoration:none;">support@edenradar.com</a>.
    </p>
  `);
  return sendEmail(to, `${orgName} has added you to EdenRadar.`, html);
}

export interface AlertAsset {
  id: number;
  assetName: string;
  institution: string;
  modality: string;
  developmentStage: string;
  indication: string;
  sourceUrl?: string | null;
}

export function sendThesisAlertEmail(
  to: string,
  displayName: string,
  assets: AlertAsset[],
  therapeuticAreas: string[],
  modalities: string[],
): Promise<void> {
  const name = displayName?.trim() || "there";
  const focusSummary = [
    ...(therapeuticAreas.length > 0 ? [therapeuticAreas.slice(0, 3).join(", ")] : []),
    ...(modalities.length > 0 ? [modalities.slice(0, 2).join(", ")] : []),
  ].join(" · ");

  const assetRows = assets
    .slice(0, 10)
    .map(
      (a) => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;vertical-align:top;">
          ${
            a.sourceUrl
              ? `<a href="${a.sourceUrl}" style="font-size:14px;font-weight:600;color:#059669;text-decoration:none;">${a.assetName}</a>`
              : `<span style="font-size:14px;font-weight:600;color:#111827;">${a.assetName}</span>`
          }
          <div style="margin-top:3px;font-size:12px;color:#6b7280;">${a.institution}</div>
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;vertical-align:top;font-size:12px;color:#374151;white-space:nowrap;">
          ${a.modality !== "unknown" ? a.modality : "-"}
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;vertical-align:top;font-size:12px;color:#374151;white-space:nowrap;text-transform:capitalize;">
          ${a.developmentStage !== "unknown" ? a.developmentStage : "-"}
        </td>
      </tr>`,
    )
    .join("");

  const html = baseHtml(`
    <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#111827;">New assets matching your focus, ${name}.</h1>
    <p style="margin:0 0 6px;font-size:14px;color:#6b7280;">
      ${focusSummary ? `Focus: ${focusSummary}` : "Based on your saved deal focus."}
    </p>
    <p style="margin:0 0 24px;font-size:14px;color:#374151;line-height:1.6;">
      ${assets.length} new asset${assets.length !== 1 ? "s" : ""} ingested since your last alert that match your thesis.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;margin-bottom:24px;">
      <thead>
        <tr style="background:#f9fafb;">
          <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Asset</th>
          <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Modality</th>
          <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Stage</th>
        </tr>
      </thead>
      <tbody>
        ${assetRows}
      </tbody>
    </table>
    <a href="${APP_URL}/discover"
       style="display:inline-block;background:#059669;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 24px;border-radius:6px;">
      Explore in EdenScout
    </a>
    <p style="margin:20px 0 0;font-size:12px;color:#9ca3af;line-height:1.5;">
      You are receiving this because you opted in to asset match alerts.
      Update your preferences in <a href="${APP_URL}/industry/profile" style="color:#059669;text-decoration:none;">account settings</a>.
    </p>
  `);
  return sendEmail(to, `${assets.length} new asset${assets.length !== 1 ? "s" : ""} match your deal focus — EdenRadar`, html);
}

export function sendSubscriptionWelcomeEmail(
  to: string,
  orgName: string,
  planTier: string,
  seatCount: number,
  nextBillingDate: string,
): Promise<void> {
  const label = planLabel(planTier);
  const html = baseHtml(`
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#111827;">Welcome to EdenScout!</h1>
    <p style="margin:0 0 14px;font-size:15px;color:#374151;line-height:1.6;">
      Thanks for subscribing${orgName ? `, ${orgName}` : ""}. Your <strong>${label}</strong> plan is now active.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
      <tr style="background:#f9fafb;">
        <td style="padding:12px 16px;font-size:13px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;width:50%;">Plan</td>
        <td style="padding:12px 16px;font-size:13px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;width:50%;">Seats</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;font-size:15px;color:#111827;">${label}</td>
        <td style="padding:12px 16px;font-size:15px;color:#111827;">${seatCount}</td>
      </tr>
      <tr style="background:#f9fafb;">
        <td colspan="2" style="padding:12px 16px;font-size:13px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Next billing date</td>
      </tr>
      <tr>
        <td colspan="2" style="padding:12px 16px;font-size:15px;color:#111827;">${nextBillingDate}</td>
      </tr>
    </table>
    <a href="${APP_URL}"
       style="display:inline-block;background:#059669;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 28px;border-radius:6px;">
      Open EdenScout
    </a>
    <p style="margin:28px 0 0;font-size:13px;color:#6b7280;line-height:1.5;">
      Need help getting started? Reply to this email or reach us at
      <a href="mailto:support@edenradar.com" style="color:#059669;text-decoration:none;">support@edenradar.com</a>.
    </p>
  `);
  return sendEmail(to, "Welcome to EdenScout — your subscription is active.", html, "EdenScout <onboarding@edenradar.com>");
}

export function sendAccountDeletionEmail(to: string, name: string): Promise<void> {
  const displayName = name?.trim() || "your account";
  const html = baseHtml(`
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#111827;">Your EdenRadar account has been deleted.</h1>
    <p style="margin:0 0 14px;font-size:15px;color:#374151;line-height:1.6;">
      Hi ${displayName}, this email confirms that your EdenRadar account and all associated data
      have been permanently removed from our platform.
    </p>
    <p style="margin:0 0 0;font-size:13px;color:#6b7280;line-height:1.5;">
      If you believe this was done in error or have questions, contact us at
      <a href="mailto:support@edenradar.com" style="color:#059669;text-decoration:none;">support@edenradar.com</a>.
    </p>
  `);
  return sendEmail(to, "Your EdenRadar account has been deleted.", html);
}
