import crypto from "crypto";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_ADDRESS = process.env.RESEND_FROM_ADDRESS ?? "EdenRadar <noreply@edenradar.com>";
export const APP_URL = process.env.APP_URL ?? "https://edenradar.com";
const LOGIN_URL = `${APP_URL}/login`;

const SUPPORT_EMAIL = "support@edenradar.com";
const BILLING_EMAIL = "billing@edenradar.com";
const MARKET_EMAIL = "market@edenradar.com";

const FROM_NOREPLY = "EdenRadar <noreply@edenradar.com>";
const FROM_ONBOARDING = "EdenScout <onboarding@edenradar.com>";
const FROM_BILLING = "EdenScout <billing@edenradar.com>";
const FROM_MARKET = "EdenMarket <market@edenradar.com>";
export const FROM_DIGEST = "EdenRadar Alerts <digest@edenradar.com>";

const ADMIN_NOTIFICATION_EMAILS = (
  process.env.ADMIN_NOTIFICATION_EMAILS ?? "admin@edenradar.com"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export function getAdminNotificationRecipients(): string[] {
  return [...ADMIN_NOTIFICATION_EMAILS];
}

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

// ── Unsubscribe tokens ───────────────────────────────────────────────────────
// Token format: base64url(userId).base64url(hmac-sha256(userId, secret))
// No expiry — unsubscribe links should remain valid indefinitely so a user
// who finds an old email can still opt out. Compromise of the secret would
// only let an attacker forge unsubscribe URLs, not access any data.

function unsubscribeSecret(): string {
  // No hardcoded fallback: an attacker who knows the source could otherwise
  // mint valid unsubscribe tokens for arbitrary users. We do allow falling
  // back to SUPABASE_SERVICE_ROLE_KEY because it is a server-only,
  // cryptographically-strong secret already required by the app — this lets
  // us avoid a separate env var while remaining secure-by-default.
  const secret =
    process.env.UNSUBSCRIBE_TOKEN_SECRET ??
    process.env.SUPABASE_JWT_SECRET ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    throw new Error(
      "[email] No unsubscribe-token secret available. Set UNSUBSCRIBE_TOKEN_SECRET " +
        "(or ensure SUPABASE_SERVICE_ROLE_KEY is configured).",
    );
  }
  return secret;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

export function signUnsubscribeToken(userId: string): string {
  const sig = crypto.createHmac("sha256", unsubscribeSecret()).update(userId).digest();
  return `${b64url(userId)}.${b64url(sig)}`;
}

export function verifyUnsubscribeToken(token: string): string | null {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [idPart, sigPart] = token.split(".");
  let userId: string;
  let providedSig: Buffer;
  try {
    userId = b64urlDecode(idPart).toString("utf8");
    providedSig = b64urlDecode(sigPart);
  } catch {
    return null;
  }
  // Defence-in-depth: only accept properly-formatted Supabase user UUIDs so
  // a malformed token can never reach the DB layer with arbitrary content.
  if (!UUID_RE.test(userId)) return null;
  let expectedSig: Buffer;
  try {
    expectedSig = crypto.createHmac("sha256", unsubscribeSecret()).update(userId).digest();
  } catch {
    return null;
  }
  if (providedSig.length !== expectedSig.length) return null;
  if (!crypto.timingSafeEqual(providedSig, expectedSig)) return null;
  return userId;
}

export function unsubscribeUrlFor(userId: string): string {
  return `${APP_URL}/unsubscribe?t=${signUnsubscribeToken(userId)}`;
}

// ── HTML wrapper ─────────────────────────────────────────────────────────────

interface BaseHtmlOpts {
  unsubscribeUrl?: string;
  replyToHint?: string;
}

function baseHtml(bodyContent: string, opts: BaseHtmlOpts = {}): string {
  const contactLine = opts.replyToHint
    ? `Questions? Reply to this email or contact <a href="mailto:${opts.replyToHint}" style="color:#059669;text-decoration:none;">${opts.replyToHint}</a>.`
    : `Questions? Contact <a href="mailto:${SUPPORT_EMAIL}" style="color:#059669;text-decoration:none;">${SUPPORT_EMAIL}</a>.`;
  const unsubLine = opts.unsubscribeUrl
    ? `<br /><a href="${opts.unsubscribeUrl}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe from these notifications</a>.`
    : "";
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
                ${contactLine}${unsubLine}
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

// ── Core sender ──────────────────────────────────────────────────────────────

export interface SendEmailOptions {
  from?: string;
  replyTo?: string;
  unsubscribeUrl?: string; // sets RFC 8058 List-Unsubscribe + List-Unsubscribe-Post headers
}

export async function sendEmail(
  to: string | string[],
  subject: string,
  html: string,
  optsOrFrom?: SendEmailOptions | string,
): Promise<void> {
  if (!RESEND_API_KEY) {
    console.warn("[email] RESEND_API_KEY not configured — skipping email to", Array.isArray(to) ? to.join(",") : to);
    return;
  }
  const opts: SendEmailOptions =
    typeof optsOrFrom === "string" ? { from: optsOrFrom } : (optsOrFrom ?? {});

  const headers: Record<string, string> = {};
  if (opts.unsubscribeUrl) {
    headers["List-Unsubscribe"] = `<${opts.unsubscribeUrl}>, <mailto:${SUPPORT_EMAIL}?subject=unsubscribe>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }

  const payload: Record<string, unknown> = {
    from: opts.from ?? FROM_ADDRESS,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
  };
  if (opts.replyTo) payload.reply_to = opts.replyTo;
  if (Object.keys(headers).length > 0) payload.headers = headers;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "(unreadable)");
      throw new Error(`[email] Resend rejected (${res.status}): ${text}`);
    }
    console.log("[email] Sent:", subject, "->", Array.isArray(to) ? to.join(",") : to);
  } catch (err) {
    console.error("[email] Failed to send to", to, err);
    throw err;
  }
}

// ── Templated senders ────────────────────────────────────────────────────────

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
      <a href="mailto:${SUPPORT_EMAIL}" style="color:#059669;text-decoration:none;">${SUPPORT_EMAIL}</a>.
    </p>
  `, { replyToHint: SUPPORT_EMAIL });
  return sendEmail(to, "Welcome to EdenRadar.", html, { from: FROM_NOREPLY, replyTo: SUPPORT_EMAIL });
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
      <a href="mailto:${SUPPORT_EMAIL}" style="color:#059669;text-decoration:none;">${SUPPORT_EMAIL}</a>.
    </p>
  `, { replyToHint: SUPPORT_EMAIL });
  return sendEmail(to, `${orgName} has added you to EdenRadar.`, html, { from: FROM_NOREPLY, replyTo: SUPPORT_EMAIL });
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
  unsubscribeUrl?: string,
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
  `, { unsubscribeUrl });
  return sendEmail(
    to,
    `${assets.length} new asset${assets.length !== 1 ? "s" : ""} match your deal focus — EdenRadar`,
    html,
    { from: FROM_DIGEST, replyTo: SUPPORT_EMAIL, unsubscribeUrl },
  );
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
      <a href="mailto:${SUPPORT_EMAIL}" style="color:#059669;text-decoration:none;">${SUPPORT_EMAIL}</a>.
    </p>
  `, { replyToHint: SUPPORT_EMAIL });
  return sendEmail(to, "Welcome to EdenScout — your subscription is active.", html, {
    from: FROM_ONBOARDING,
    replyTo: SUPPORT_EMAIL,
  });
}

export function sendPaymentFailedEmail(
  to: string,
  orgName: string,
  billingPortalUrl: string,
): Promise<void> {
  const greeting = orgName ? `Hi ${orgName},` : "Hi,";
  const html = baseHtml(`
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#111827;">Action required: payment failed</h1>
    <p style="margin:0 0 14px;font-size:15px;color:#374151;line-height:1.6;">
      ${greeting} we were unable to process your EdenScout subscription payment. To keep your
      access uninterrupted, please update your payment method as soon as possible.
    </p>
    <a href="${billingPortalUrl}"
       style="display:inline-block;background:#dc2626;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 28px;border-radius:6px;">
      Update payment method
    </a>
    <p style="margin:20px 0 0;font-size:13px;color:#6b7280;line-height:1.5;">
      If you have already updated your details, you can ignore this email. Stripe will automatically
      retry the charge. Questions? Reply to this email or contact
      <a href="mailto:${BILLING_EMAIL}" style="color:#059669;text-decoration:none;">${BILLING_EMAIL}</a>.
    </p>
  `, { replyToHint: BILLING_EMAIL });
  return sendEmail(to, "Your EdenScout payment failed — action required", html, {
    from: FROM_BILLING,
    replyTo: BILLING_EMAIL,
  });
}

export function sendRenewalConfirmationEmail(
  to: string,
  orgName: string,
  amountFormatted: string,
): Promise<void> {
  const greeting = orgName ? `Hi ${orgName},` : "Hi,";
  const html = baseHtml(`
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#111827;">Your EdenScout subscription has renewed</h1>
    <p style="margin:0 0 14px;font-size:15px;color:#374151;line-height:1.6;">
      ${greeting} your EdenScout subscription has been successfully renewed. Your payment of
      <strong>${amountFormatted}</strong> was processed and your access continues without interruption.
    </p>
    <a href="${APP_URL}"
       style="display:inline-block;background:#059669;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 28px;border-radius:6px;">
      Open EdenScout
    </a>
    <p style="margin:20px 0 0;font-size:13px;color:#6b7280;line-height:1.5;">
      You can manage your subscription and view invoices in your
      <a href="${APP_URL}/industry/settings" style="color:#059669;text-decoration:none;">billing settings</a>.
    </p>
  `, { replyToHint: BILLING_EMAIL });
  return sendEmail(to, "EdenScout subscription renewed successfully", html, {
    from: FROM_BILLING,
    replyTo: BILLING_EMAIL,
  });
}

export function sendTrialEndingEmail(
  to: string,
  orgName: string,
  trialEndDate: string,
  portalUrl?: string,
  planName?: string,
): Promise<void> {
  const greeting = orgName ? `Hi ${orgName},` : "Hi,";
  const ctaUrl = portalUrl ?? `${APP_URL}/industry/settings`;
  const planLine = planName
    ? `<p style="margin:0 0 14px;font-size:15px;color:#374151;line-height:1.6;">Your current plan: <strong>${planName}</strong></p>`
    : "";
  const html = baseHtml(`
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#111827;">Your EdenScout trial expires tomorrow</h1>
    <p style="margin:0 0 14px;font-size:15px;color:#374151;line-height:1.6;">
      ${greeting} your EdenScout free trial expires on <strong>${trialEndDate}</strong>. After that date
      you will be charged automatically unless you cancel first. To stay on the plan — or to cancel —
      manage your subscription in Settings.
    </p>
    ${planLine}
    <a href="${ctaUrl}"
       style="display:inline-block;background:#059669;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 28px;border-radius:6px;">
      Manage subscription
    </a>
    <p style="margin:20px 0 0;font-size:13px;color:#6b7280;line-height:1.5;">
      Questions? Reply to this email or reach us at
      <a href="mailto:${BILLING_EMAIL}" style="color:#059669;text-decoration:none;">${BILLING_EMAIL}</a>.
    </p>
  `, { replyToHint: BILLING_EMAIL });
  return sendEmail(to, "Your EdenScout trial expires tomorrow", html, {
    from: FROM_BILLING,
    replyTo: BILLING_EMAIL,
  });
}

export function sendMarketMutualInterestEmail(
  to: string,
  recipientName: string,
  dealUrl: string,
  assetLabel: string,
): Promise<void> {
  const greeting = recipientName?.trim() ? `Hi ${recipientName},` : "Hi,";
  const html = baseHtml(`
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#111827;">Mutual interest confirmed — EdenMarket</h1>
    <p style="margin:0 0 14px;font-size:15px;color:#374151;line-height:1.6;">
      ${greeting} both parties have confirmed mutual interest in <strong>${assetLabel}</strong>.
    </p>
    <p style="margin:0 0 28px;font-size:15px;color:#374151;line-height:1.6;">
      Your next step is to execute a mutual NDA to unlock the full deal room. Click below to review and sign the NDA.
    </p>
    <a href="${dealUrl}"
       style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 28px;border-radius:6px;">
      Open Deal Room
    </a>
    <p style="margin:24px 0 0;font-size:13px;color:#6b7280;line-height:1.5;">
      Both parties must sign the NDA before deal room documents and communication become accessible.
      Questions? Contact <a href="mailto:${MARKET_EMAIL}" style="color:#7c3aed;text-decoration:none;">${MARKET_EMAIL}</a>.
    </p>
  `, { replyToHint: MARKET_EMAIL });
  return sendEmail(to, `Mutual interest confirmed — ${assetLabel} — EdenMarket`, html, {
    from: FROM_MARKET,
    replyTo: MARKET_EMAIL,
  });
}

export function sendMarketNdaSignedEmail(
  to: string,
  recipientName: string,
  dealUrl: string,
  assetLabel: string,
): Promise<void> {
  const greeting = recipientName?.trim() ? `Hi ${recipientName},` : "Hi,";
  const html = baseHtml(`
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#111827;">NDA fully executed — deal room is open</h1>
    <p style="margin:0 0 14px;font-size:15px;color:#374151;line-height:1.6;">
      ${greeting} both parties have signed the mutual NDA for <strong>${assetLabel}</strong>.
      The deal room is now fully unlocked.
    </p>
    <p style="margin:0 0 28px;font-size:15px;color:#374151;line-height:1.6;">
      You can now access the full listing details, share documents, and communicate securely with the other party.
    </p>
    <a href="${dealUrl}"
       style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 28px;border-radius:6px;">
      Open Deal Room
    </a>
    <p style="margin:24px 0 0;font-size:13px;color:#6b7280;line-height:1.5;">
      A copy of the signed NDA is available in your deal room for your records.
    </p>
  `, { replyToHint: MARKET_EMAIL });
  return sendEmail(to, `Deal room open — ${assetLabel} — EdenMarket`, html, {
    from: FROM_MARKET,
    replyTo: MARKET_EMAIL,
  });
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
      <a href="mailto:${SUPPORT_EMAIL}" style="color:#059669;text-decoration:none;">${SUPPORT_EMAIL}</a>.
    </p>
  `, { replyToHint: SUPPORT_EMAIL });
  return sendEmail(to, "Your EdenRadar account has been deleted.", html, {
    from: FROM_NOREPLY,
    replyTo: SUPPORT_EMAIL,
  });
}

// ── EdenMarket ad-hoc helpers (replaces inline-HTML sites in routes.ts) ──────

export function sendMarketAdHocEmail(
  to: string | string[],
  subject: string,
  bodyHtml: string,
): Promise<void> {
  return sendEmail(to, subject, baseHtml(bodyHtml, { replyToHint: MARKET_EMAIL }), {
    from: FROM_MARKET,
    replyTo: MARKET_EMAIL,
  });
}

export function sendAdminNotificationEmail(
  subject: string,
  bodyHtml: string,
): Promise<void> {
  const recipients = getAdminNotificationRecipients();
  if (recipients.length === 0) return Promise.resolve();
  return sendEmail(recipients, subject, baseHtml(bodyHtml, { replyToHint: SUPPORT_EMAIL }), {
    from: FROM_NOREPLY,
    replyTo: SUPPORT_EMAIL,
  });
}
