import crypto from "crypto";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_ADDRESS = process.env.RESEND_FROM_ADDRESS ?? "EdenRadar <noreply@edenradar.com>";
export const APP_URL = process.env.APP_URL ?? "https://edenradar.com";
const LOGIN_URL = `${APP_URL}/login`;

const SUPPORT_EMAIL = "support@edenradar.com";
const BILLING_EMAIL = "billing@edenradar.com";
const MARKET_EMAIL = "market@edenradar.com";

const FROM_NOREPLY = "EdenRadar <noreply@edenradar.com>";
const FROM_ONBOARDING = "EdenRadar <onboarding@edenradar.com>";
const FROM_BILLING = "EdenRadar <billing@edenradar.com>";
const FROM_MARKET = "EdenMarket <market@edenradar.com>";
export const FROM_DIGEST = "EdenRadar Alerts <digest@edenradar.com>";

const ADMIN_NOTIFICATION_EMAILS = (
  process.env.ADMIN_NOTIFICATION_EMAILS ?? "wmohamed@edennx.com,relles@edennx.com"
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
  individual: "EdenRadar Individual",
  team5: "EdenRadar Team (5 seats)",
  team10: "EdenRadar Team (10 seats)",
  enterprise: "EdenRadar Enterprise",
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
// Conservative email validator — defence-in-depth for token payloads (the actual
// address validation happened when the admin entered it on the dispatch panel).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_TOKEN_PREFIX = "e:";

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
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [idPart, sigPart] = parts;
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

// Email-keyed unsubscribe token — used when the recipient is a free-form
// address from the admin manual dispatch panel and has no userId. The token
// resolves to an `email_unsubscribes` row (or to a matching user account if
// one exists). Format: `e:<b64url(email)>.<b64url(hmac)>`.
export function signUnsubscribeTokenForEmail(email: string): string {
  const norm = email.trim().toLowerCase();
  const sig = crypto.createHmac("sha256", unsubscribeSecret()).update(`email:${norm}`).digest();
  return `${EMAIL_TOKEN_PREFIX}${b64url(norm)}.${b64url(sig)}`;
}

export function verifyUnsubscribeTokenForEmail(token: string): string | null {
  if (!token || typeof token !== "string" || !token.startsWith(EMAIL_TOKEN_PREFIX)) return null;
  const body = token.slice(EMAIL_TOKEN_PREFIX.length);
  const parts = body.split(".");
  if (parts.length !== 2) return null;
  const [emailPart, sigPart] = parts;
  let email: string;
  let providedSig: Buffer;
  try {
    email = b64urlDecode(emailPart).toString("utf8").trim().toLowerCase();
    providedSig = b64urlDecode(sigPart);
  } catch {
    return null;
  }
  if (!EMAIL_RE.test(email)) return null;
  let expectedSig: Buffer;
  try {
    expectedSig = crypto.createHmac("sha256", unsubscribeSecret()).update(`email:${email}`).digest();
  } catch {
    return null;
  }
  if (providedSig.length !== expectedSig.length) return null;
  if (!crypto.timingSafeEqual(providedSig, expectedSig)) return null;
  return email;
}

export function unsubscribeUrlForEmail(email: string): string {
  return `${APP_URL}/unsubscribe?t=${signUnsubscribeTokenForEmail(email)}`;
}

// ── HTML wrapper ─────────────────────────────────────────────────────────────

interface BaseHtmlOpts {
  unsubscribeUrl?: string;
  replyToHint?: string;
  accentColor?: string;
}

function baseHtml(bodyContent: string, opts: BaseHtmlOpts = {}): string {
  const accent = opts.accentColor ?? "#059669";
  const contactLine = opts.replyToHint
    ? `Questions? Reply to this email or contact <a href="mailto:${opts.replyToHint}" style="color:${accent};text-decoration:none;">${opts.replyToHint}</a>.`
    : `Questions? Contact <a href="mailto:${SUPPORT_EMAIL}" style="color:${accent};text-decoration:none;">${SUPPORT_EMAIL}</a>.`;
  const unsubLine = opts.unsubscribeUrl
    ? `<br /><a href="${opts.unsubscribeUrl}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe from these notifications</a>.`
    : "";
  // Inline EdenRadar icon mark — the favicon droplet with DNA strokes
  const iconMark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="26" height="26" style="display:inline-block;vertical-align:middle;"><path d="M16 2C16 2 6 8 6 18c0 5.5 4.5 10 10 10s10-4.5 10-10C26 8 16 2 16 2z" fill="${accent}"/><path d="M16 8v16M16 14c-3-2-6-1-7 1M16 18c3-2 6-1 7 1" stroke="#ffffff" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>`;
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
          <!-- Header — white background, brand wordmark -->
          <tr>
            <td style="background:#ffffff;padding:22px 40px 18px;">
              ${iconMark}<span style="margin-left:8px;font-size:19px;font-weight:700;letter-spacing:-0.4px;vertical-align:middle;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;"><span style="color:#111827;">Eden</span><span style="color:${accent};">Radar</span></span>
            </td>
          </tr>
          <!-- Accent bar -->
          <tr>
            <td style="background:${accent};height:2px;font-size:0;line-height:0;">&nbsp;</td>
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
              <p style="margin:0 0 14px;font-size:12px;color:#9ca3af;line-height:1.5;">
                EdenRadar. Biotech intelligence for industry buyers.<br />
                ${contactLine}${unsubLine}
              </p>
              <img src="${APP_URL}/edennx-logo.png" alt="EdenNX" width="48" height="48" style="display:block;border:0;opacity:0.55;" />
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
  // Mailto-only List-Unsubscribe header (no one-click POST). Reserved for
  // pure transactional helpers that need a header but cannot mint a signed
  // token. Manual digest dispatch uses unsubscribeUrl with an email-keyed
  // token instead, so this branch has no production callers today.
  unsubscribeMailto?: string;
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
  } else if (opts.unsubscribeMailto) {
    headers["List-Unsubscribe"] = `<mailto:${opts.unsubscribeMailto}?subject=unsubscribe>`;
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
    <h1 style="margin:0 0 10px;font-size:24px;font-weight:700;color:#111827;letter-spacing:-0.4px;">Welcome, ${displayName}.</h1>
    <p style="margin:0 0 28px;font-size:15px;color:#374151;line-height:1.6;">
      Your EdenRadar account is ready. You have access to biotech intelligence tools used by
      leading industry buyers. Start exploring below.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
      <tr>
        <td style="padding:14px 16px;border-bottom:1px solid #f3f4f6;">
          <p style="margin:0 0 2px;font-size:14px;font-weight:600;color:#111827;">EdenDiscovery</p>
          <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">Search and filter TTO assets across hundreds of research institutions.</p>
        </td>
      </tr>
      <tr>
        <td style="padding:14px 16px;border-bottom:1px solid #f3f4f6;">
          <p style="margin:0 0 2px;font-size:14px;font-weight:600;color:#111827;">EdenLab</p>
          <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">Build and manage your deal pipeline, save assets, and track progress.</p>
        </td>
      </tr>
      <tr>
        <td style="padding:14px 16px;">
          <p style="margin:0 0 2px;font-size:14px;font-weight:600;color:#111827;">EdenRadar</p>
          <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">Set deal alerts and receive weekly pipeline recaps. Available on team plans.</p>
        </td>
      </tr>
    </table>
    <a href="${APP_URL}/discover"
       style="display:inline-block;background:#059669;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:13px 32px;border-radius:6px;">
      Start Exploring &rarr;
    </a>
    <p style="margin:28px 0 0;font-size:13px;color:#6b7280;line-height:1.5;">
      Didn't create this account? Contact us immediately at
      <a href="mailto:${SUPPORT_EMAIL}" style="color:#059669;text-decoration:none;">${SUPPORT_EMAIL}</a>.
    </p>
  `, { replyToHint: SUPPORT_EMAIL });
  return sendEmail(to, `Welcome to EdenRadar, ${displayName}.`, html, { from: FROM_NOREPLY, replyTo: SUPPORT_EMAIL });
}

export function sendTeamInviteEmail(
  to: string,
  name: string,
  orgName: string,
  planTier: string,
  setPasswordLink?: string,
  inviterName?: string,
): Promise<void> {
  const displayName = name?.trim() || "there";
  const headline = inviterName?.trim()
    ? `${inviterName} at ${orgName} has invited you to EdenRadar.`
    : `${orgName} has invited you to EdenRadar.`;
  const intro = inviterName?.trim()
    ? `Hi ${displayName}, ${inviterName} has set up your account as part of ${orgName}'s <strong>${planLabel(planTier)}</strong> plan.`
    : `Hi ${displayName}, your account has been set up as part of ${orgName}'s <strong>${planLabel(planTier)}</strong> plan.`;
  const actionBlock = setPasswordLink
    ? `<a href="${setPasswordLink}"
         style="display:inline-block;background:#059669;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 28px;border-radius:6px;">
        Set Your Password
      </a>
      <p style="margin:16px 0 0;font-size:13px;color:#6b7280;line-height:1.5;">
        This link expires in 7 days. After setting your password you can sign in at
        <a href="${LOGIN_URL}" style="color:#059669;text-decoration:none;">edenradar.com</a> anytime.
      </p>`
    : `<a href="${LOGIN_URL}"
         style="display:inline-block;background:#059669;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 28px;border-radius:6px;">
        Sign in to EdenRadar
      </a>`;
  const html = baseHtml(`
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#111827;">${headline}</h1>
    <p style="margin:0 0 14px;font-size:15px;color:#374151;line-height:1.6;">${intro}</p>
    <p style="margin:0 0 28px;font-size:15px;color:#374151;line-height:1.6;">
      You will have access to EdenRadar, EdenDiscovery, and EdenLab once you set your password below.
    </p>
    ${actionBlock}
    <p style="margin:28px 0 0;font-size:13px;color:#6b7280;line-height:1.5;">
      Not expecting this invitation? Contact
      <a href="mailto:${SUPPORT_EMAIL}" style="color:#059669;text-decoration:none;">${SUPPORT_EMAIL}</a>.
    </p>
  `, { replyToHint: SUPPORT_EMAIL });
  return sendEmail(to, headline, html, { from: FROM_NOREPLY, replyTo: SUPPORT_EMAIL });
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
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#111827;">Welcome to EdenRadar!</h1>
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
      Open EdenRadar
    </a>
    <p style="margin:28px 0 0;font-size:13px;color:#6b7280;line-height:1.5;">
      Need help getting started? Reply to this email or reach us at
      <a href="mailto:${SUPPORT_EMAIL}" style="color:#059669;text-decoration:none;">${SUPPORT_EMAIL}</a>.
    </p>
  `, { replyToHint: SUPPORT_EMAIL });
  return sendEmail(to, "Welcome to EdenRadar — your subscription is active.", html, {
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
      ${greeting} we were unable to process your EdenRadar subscription payment. To keep your
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
  return sendEmail(to, "Your EdenRadar payment failed — action required", html, {
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
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#111827;">Your EdenRadar subscription has renewed</h1>
    <p style="margin:0 0 14px;font-size:15px;color:#374151;line-height:1.6;">
      ${greeting} your EdenRadar subscription has been successfully renewed. Your payment of
      <strong>${amountFormatted}</strong> was processed and your access continues without interruption.
    </p>
    <a href="${APP_URL}"
       style="display:inline-block;background:#059669;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 28px;border-radius:6px;">
      Open EdenRadar
    </a>
    <p style="margin:20px 0 0;font-size:13px;color:#6b7280;line-height:1.5;">
      You can manage your subscription and view invoices in your
      <a href="${APP_URL}/industry/settings" style="color:#059669;text-decoration:none;">billing settings</a>.
    </p>
  `, { replyToHint: BILLING_EMAIL });
  return sendEmail(to, "EdenRadar subscription renewed successfully", html, {
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
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#111827;">Your EdenRadar trial expires tomorrow</h1>
    <p style="margin:0 0 14px;font-size:15px;color:#374151;line-height:1.6;">
      ${greeting} your EdenRadar free trial expires on <strong>${trialEndDate}</strong>. After that date
      you will be charged automatically unless you cancel first. To stay on the plan or cancel,
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
  return sendEmail(to, "Your EdenRadar trial expires tomorrow", html, {
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
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#111827;">Mutual interest confirmed</h1>
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
  `, { replyToHint: MARKET_EMAIL, accentColor: '#7c3aed' });
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
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#111827;">NDA fully executed. Deal room is open.</h1>
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
  `, { replyToHint: MARKET_EMAIL, accentColor: '#7c3aed' });
  return sendEmail(to, `Deal room open — ${assetLabel} — EdenMarket`, html, {
    from: FROM_MARKET,
    replyTo: MARKET_EMAIL,
  });
}

// Escapes user-supplied text for safe inclusion in our HTML email bodies.
// We never want a buyer/seller to be able to inject markup into the
// preview block of a deal-room notification.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function sendDealRoomMessageEmail(
  to: string,
  recipientName: string,
  senderLabel: string,
  dealUrl: string,
  assetLabel: string,
  messagePreview: string,
): Promise<void> {
  const greeting = recipientName?.trim() ? `Hi ${recipientName},` : "Hi,";
  const trimmed = messagePreview.length > 280
    ? messagePreview.slice(0, 280).trimEnd() + "…"
    : messagePreview;
  const safePreview = escapeHtml(trimmed).replace(/\n/g, "<br />");
  const safeSender = escapeHtml(senderLabel || "The other party");
  const safeAsset = escapeHtml(assetLabel);
  const html = baseHtml(`
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#111827;">New message in your deal room</h1>
    <p style="margin:0 0 14px;font-size:15px;color:#374151;line-height:1.6;">
      ${greeting} <strong>${safeSender}</strong> just sent you a message about <strong>${safeAsset}</strong>.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border-left:3px solid #7c3aed;background:#faf5ff;border-radius:4px;">
      <tr><td style="padding:14px 16px;font-size:14px;color:#374151;line-height:1.6;">${safePreview}</td></tr>
    </table>
    <a href="${dealUrl}"
       style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 28px;border-radius:6px;">
      Open Deal Room
    </a>
    <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;line-height:1.5;">
      To avoid filling your inbox, we send at most one message notification per
      hour per deal. Open the deal room to see all replies in real time.
    </p>
  `, { replyToHint: MARKET_EMAIL, accentColor: '#7c3aed' });
  return sendEmail(to, `New message — ${assetLabel} — EdenMarket`, html, {
    from: FROM_MARKET,
    replyTo: MARKET_EMAIL,
  });
}

export function sendDealRoomDocumentEmail(
  to: string,
  recipientName: string,
  uploaderLabel: string,
  dealUrl: string,
  assetLabel: string,
  fileName: string,
): Promise<void> {
  const greeting = recipientName?.trim() ? `Hi ${recipientName},` : "Hi,";
  const safeUploader = escapeHtml(uploaderLabel || "The other party");
  const safeAsset = escapeHtml(assetLabel);
  const safeFile = escapeHtml(fileName);
  const html = baseHtml(`
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#111827;">A new document was shared with you</h1>
    <p style="margin:0 0 14px;font-size:15px;color:#374151;line-height:1.6;">
      ${greeting} <strong>${safeUploader}</strong> uploaded a new document to your deal room
      for <strong>${safeAsset}</strong>:
    </p>
    <p style="margin:0 0 24px;font-size:15px;color:#111827;font-weight:600;">
      ${safeFile}
    </p>
    <a href="${dealUrl}"
       style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 28px;border-radius:6px;">
      Open Deal Room
    </a>
    <p style="margin:24px 0 0;font-size:13px;color:#6b7280;line-height:1.5;">
      Documents are stored securely in your deal room and only visible to you and the other party.
    </p>
  `, { replyToHint: MARKET_EMAIL, accentColor: '#7c3aed' });
  return sendEmail(to, `New document — ${assetLabel} — EdenMarket`, html, {
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
  return sendEmail(to, subject, baseHtml(bodyHtml, { replyToHint: MARKET_EMAIL, accentColor: '#7c3aed' }), {
    from: FROM_MARKET,
    replyTo: MARKET_EMAIL,
  });
}

// Task #714 — EdenMarket grace-period notice. Sent once when a subscription
// is cancelled. The org keeps read-only access for 30 days; reactivating
// before the grace expires restores full write access.
export function sendMarketGraceNoticeEmail(
  to: string,
  orgName: string,
  graceEndsAt: Date,
): Promise<void> {
  const greeting = orgName?.trim() ? `Hi ${orgName},` : "Hi,";
  const dateStr = graceEndsAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const reactivateUrl = `${APP_URL}/market`;
  const html = baseHtml(`
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#111827;">Your EdenMarket subscription has been cancelled</h1>
    <p style="margin:0 0 14px;font-size:15px;color:#374151;line-height:1.6;">
      ${greeting} your EdenMarket subscription has been cancelled. To make sure your in-flight
      conversations and deal rooms aren't disrupted, you have a <strong>30-day grace period</strong>
      ending <strong>${dateStr}</strong>.
    </p>
    <p style="margin:0 0 14px;font-size:15px;color:#374151;line-height:1.6;">
      During the grace period you can still <strong>browse listings and review existing deal rooms</strong>,
      but you will not be able to create new listings, submit or accept Expressions of Interest,
      upload documents, or send messages. After ${dateStr}, all EdenMarket access will be revoked.
    </p>
    <a href="${reactivateUrl}"
       style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 28px;border-radius:6px;">
      Reactivate EdenMarket
    </a>
    <p style="margin:24px 0 0;font-size:13px;color:#6b7280;line-height:1.5;">
      Questions? Reply to this email or reach us at
      <a href="mailto:${MARKET_EMAIL}" style="color:#7c3aed;text-decoration:none;">${MARKET_EMAIL}</a>.
    </p>
  `, { replyToHint: MARKET_EMAIL, accentColor: '#7c3aed' });
  return sendEmail(to, "Your EdenMarket subscription cancelled — 30-day grace period started", html, {
    from: FROM_MARKET,
    replyTo: MARKET_EMAIL,
  });
}

// ── Weekly Recap digest ───────────────────────────────────────────────────────

export interface WeeklyRecapEmailData {
  weekLabel: string;
  summary: string;
  counts: { newAssets: number; saves: number; marketListings: number };
  highlights: Array<{
    assetName: string;
    institution: string | null;
    modality: string | null;
    indication: string | null;
  }>;
}

export function sendWeeklyRecapEmail(
  to: string,
  recipientName: string | null,
  data: WeeklyRecapEmailData,
  unsubscribeUrl: string,
): Promise<void> {
  const greeting = recipientName?.trim() ? `Hi ${recipientName},` : "Hi,";
  const dashboardUrl = `${APP_URL}/industry/dashboard`;

  const highlightRows = data.highlights.slice(0, 5).map((h) => {
    const meta = [h.institution, h.modality, h.indication].filter(Boolean).join(" · ");
    return `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;">
          <p style="margin:0 0 2px;font-size:14px;font-weight:600;color:#111827;">${h.assetName}</p>
          ${meta ? `<p style="margin:0;font-size:12px;color:#6b7280;">${meta}</p>` : ""}
        </td>
      </tr>`;
  }).join("");

  const highlightSection = data.highlights.length > 0 ? `
    <h2 style="margin:28px 0 12px;font-size:15px;font-weight:700;color:#111827;">Worth a look this week</h2>
    <table width="100%" cellpadding="0" cellspacing="0">${highlightRows}</table>
  ` : "";

  const html = baseHtml(`
    <p style="margin:0 0 4px;font-size:13px;color:#6b7280;letter-spacing:0.05em;text-transform:uppercase;">${data.weekLabel}</p>
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#111827;">Your EdenRadar Weekly Recap</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">${greeting} here's what happened in your pipeline this week.</p>

    ${data.summary ? `<p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">${data.summary}</p>` : ""}

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:6px;margin-bottom:24px;">
      <tr>
        <td style="padding:20px 24px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="text-align:center;padding:0 12px;">
                <p style="margin:0 0 4px;font-size:28px;font-weight:700;color:#059669;">${data.counts.newAssets}</p>
                <p style="margin:0;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">New Assets</p>
              </td>
              <td style="text-align:center;padding:0 12px;border-left:1px solid #e5e7eb;">
                <p style="margin:0 0 4px;font-size:28px;font-weight:700;color:#059669;">${data.counts.saves}</p>
                <p style="margin:0;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Pipeline Saves</p>
              </td>
              <td style="text-align:center;padding:0 12px;border-left:1px solid #e5e7eb;">
                <p style="margin:0 0 4px;font-size:28px;font-weight:700;color:#059669;">${data.counts.marketListings}</p>
                <p style="margin:0;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Market Listings</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    ${highlightSection}

    <a href="${dashboardUrl}"
       style="display:inline-block;background:#059669;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 28px;border-radius:6px;margin-top:24px;">
      View Full Recap →
    </a>
  `, { unsubscribeUrl });

  return sendEmail(to, `Your EdenRadar recap — ${data.weekLabel}`, html, {
    from: FROM_DIGEST,
    unsubscribeUrl,
  });
}

export function sendMarketEoiDeclinedEmail(
  to: string,
  recipientName: string,
  assetLabel: string,
): Promise<void> {
  const greeting = recipientName?.trim() ? `Hi ${recipientName},` : "Hi,";
  const html = baseHtml(`
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#111827;">Expression of Interest update</h1>
    <p style="margin:0 0 14px;font-size:15px;color:#374151;line-height:1.6;">
      ${greeting} the seller has reviewed your Expression of Interest for <strong>${assetLabel}</strong>
      and has decided not to proceed with your submission at this time.
    </p>
    <p style="margin:0 0 28px;font-size:15px;color:#374151;line-height:1.6;">
      There are many reasons a seller may decline an EOI unrelated to your organisation: timing, exclusivity, or existing negotiations. We encourage you to continue exploring other listings that match your focus.
    </p>
    <a href="${APP_URL}/market"
       style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 28px;border-radius:6px;">
      Browse EdenMarket
    </a>
    <p style="margin:24px 0 0;font-size:13px;color:#6b7280;line-height:1.5;">
      Questions? Contact <a href="mailto:${MARKET_EMAIL}" style="color:#7c3aed;text-decoration:none;">${MARKET_EMAIL}</a>.
    </p>
  `, { replyToHint: MARKET_EMAIL, accentColor: '#7c3aed' });
  return sendEmail(to, `EOI update — ${assetLabel} — EdenMarket`, html, {
    from: FROM_MARKET,
    replyTo: MARKET_EMAIL,
  });
}

export function sendMarketObserverInviteEmail(
  to: string,
  observerName: string,
  inviterOrgName: string,
  assetLabel: string,
  role: string,
  acceptUrl: string,
): Promise<void> {
  const greeting = observerName?.trim() ? `Hi ${observerName},` : "Hi,";
  const roleLabel = role === "counsel" ? "legal counsel" : role === "advisor" ? "advisor" : "observer";
  const html = baseHtml(`
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#111827;">You've been invited to a deal room</h1>
    <p style="margin:0 0 14px;font-size:15px;color:#374151;line-height:1.6;">
      ${greeting} <strong>${inviterOrgName}</strong> has invited you as <strong>${roleLabel}</strong> to access the EdenMarket deal room for <strong>${assetLabel}</strong>.
    </p>
    <p style="margin:0 0 28px;font-size:15px;color:#374151;line-height:1.6;">
      As an observer, you will have read-only access to deal room documents and communications. Your access link is unique; do not share it.
    </p>
    <a href="${acceptUrl}"
       style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 28px;border-radius:6px;">
      Accept Invitation
    </a>
    <p style="margin:24px 0 0;font-size:13px;color:#6b7280;line-height:1.5;">
      This link expires in 7 days. Questions? Contact <a href="mailto:${MARKET_EMAIL}" style="color:#7c3aed;text-decoration:none;">${MARKET_EMAIL}</a>.
    </p>
  `, { replyToHint: MARKET_EMAIL, accentColor: '#7c3aed' });
  return sendEmail(to, `Deal room access — ${assetLabel} — EdenMarket`, html, {
    from: FROM_MARKET,
    replyTo: MARKET_EMAIL,
  });
}

export function sendMarketFeedbackRequestEmail(
  to: string,
  recipientName: string,
  assetLabel: string,
  dealId: number,
  role: "seller" | "buyer",
): Promise<void> {
  const greeting = recipientName?.trim() ? `Hi ${recipientName},` : "Hi,";
  const feedbackUrl = `${APP_URL}/market/deals/${dealId}?tab=feedback`;
  const context = role === "seller"
    ? "As the seller, your perspective on how the deal progressed is invaluable."
    : "As the buyer, your experience throughout the process helps us improve EdenMarket for everyone.";
  const html = baseHtml(`
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#111827;">Share your deal experience</h1>
    <p style="margin:0 0 14px;font-size:15px;color:#374151;line-height:1.6;">
      ${greeting} your deal for <strong>${assetLabel}</strong> has been marked as complete.
    </p>
    <p style="margin:0 0 14px;font-size:15px;color:#374151;line-height:1.6;">
      ${context} Your feedback takes less than 2 minutes and helps EdenMarket surface better deal intelligence for the whole community.
    </p>
    <a href="${feedbackUrl}"
       style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 28px;border-radius:6px;">
      Share Feedback
    </a>
    <p style="margin:24px 0 0;font-size:13px;color:#6b7280;line-height:1.5;">
      All responses are kept confidential. Questions? Contact <a href="mailto:${MARKET_EMAIL}" style="color:#7c3aed;text-decoration:none;">${MARKET_EMAIL}</a>.
    </p>
  `, { replyToHint: MARKET_EMAIL, accentColor: '#7c3aed' });
  return sendEmail(to, `How did your deal go? — ${assetLabel} — EdenMarket`, html, {
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

export function sendDemoRequestEmail(data: {
  email: string;
  firstName: string;
  lastName: string;
  company: string;
  role: string;
  teamSize: string;
  intent: string;
}): Promise<void> {
  const fullName = `${data.firstName} ${data.lastName}`.trim();
  const subject = `New early access request: ${fullName} — ${data.company}`;
  const html = baseHtml(`
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">New Early Access Request</h1>
    <p style="margin:0 0 20px;font-size:14px;color:#6b7280;">Submitted via /demo</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr><td style="padding:8px 0;color:#6b7280;width:130px;">Name</td><td style="padding:8px 0;color:#111827;font-weight:600;">${fullName}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;">Email</td><td style="padding:8px 0;"><a href="mailto:${data.email}" style="color:#059669;">${data.email}</a></td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;">Company</td><td style="padding:8px 0;color:#111827;font-weight:600;">${data.company}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;">Role</td><td style="padding:8px 0;color:#111827;">${data.role}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;">Team size</td><td style="padding:8px 0;color:#111827;">${data.teamSize || "—"}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;vertical-align:top;">Looking for</td><td style="padding:8px 0;color:#111827;">${data.intent || "—"}</td></tr>
    </table>
    <div style="margin-top:24px;padding:12px 16px;background:#f0fdf4;border-radius:8px;border:1px solid #bbf7d0;">
      <p style="margin:0;font-size:13px;color:#065f46;">Reply directly to this email to respond to ${data.firstName}.</p>
    </div>
  `);
  const recipients = getAdminNotificationRecipients();
  return sendEmail(recipients, subject, html, {
    from: FROM_NOREPLY,
    replyTo: data.email,
  });
}

// ── Eden Brief ───────────────────────────────────────────────────────────────

const FROM_BRIEF = "Eden Brief <brief@edenradar.com>";

export async function sendBriefEmail(
  to: string[],
  issueNumber: number,
  title: string,
  issueUrl: string,
): Promise<void> {
  if (to.length === 0) return;
  const subject = `The Eden Brief - Issue ${issueNumber}: ${title}`;
  const html = baseHtml(`
    <div style="margin-bottom:4px;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:#6b7280;font-family:monospace;">
      Eden NX · Intelligence Brief
    </div>
    <h1 style="margin:0 0 4px;font-size:28px;font-weight:700;letter-spacing:-0.5px;color:#111827;">
      The Eden Brief
    </h1>
    <p style="margin:0 0 24px;font-size:13px;color:#6b7280;font-family:monospace;letter-spacing:0.04em;">
      Issue ${issueNumber} · ${title}
    </p>
    <div style="height:3px;background:#2d7a52;margin-bottom:28px;"></div>
    <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.7;">
      Your monthly intelligence brief is ready. This issue covers new signals from across 400+ monitored TTO portfolios.
    </p>
    <a href="${escapeHtml(issueUrl)}"
       style="display:inline-block;background:#2d7a52;color:#fff;text-decoration:none;padding:12px 28px;font-size:13px;font-family:monospace;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:28px;">
      Read Issue ${issueNumber}
    </a>
    <p style="margin:0 0 8px;font-size:13px;color:#9ca3af;line-height:1.6;">
      Published monthly by Eden NX. Signal from the licensing frontier.
    </p>
  `, { accentColor: "#2d7a52" });

  // Send in batches to avoid Resend's per-request recipient limit
  const BATCH = 50;
  for (let i = 0; i < to.length; i += BATCH) {
    const batch = to.slice(i, i + BATCH);
    await sendEmail(batch, subject, html, { from: FROM_BRIEF });
  }
}
