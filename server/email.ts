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

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
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
      body: JSON.stringify({ from: FROM_ADDRESS, to, subject, html }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "(unreadable)");
      console.error("[email] Resend rejected the request", res.status, text);
    } else {
      console.log("[email] Sent:", subject, "->", to);
    }
  } catch (err) {
    console.error("[email] Network error sending to", to, err);
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
