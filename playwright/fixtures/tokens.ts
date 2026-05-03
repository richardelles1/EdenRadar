import crypto from "node:crypto";

/**
 * Mirror of server/email.ts `signUnsubscribeToken`. We replicate the function
 * here (instead of importing from server/) so Playwright specs do not pull in
 * server-only modules (drizzle, pg, supabase, etc.) at test-load time.
 *
 * MUST stay byte-identical with the server signer. If server/email.ts changes
 * its signing algorithm, update this file too.
 */
function unsubscribeSecret(): string {
  const secret =
    process.env.UNSUBSCRIBE_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "";
  if (!secret) {
    throw new Error(
      "E2E: UNSUBSCRIBE_SECRET or SUPABASE_SERVICE_ROLE_KEY must be set to sign tokens",
    );
  }
  return secret;
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function signUnsubscribeToken(userId: string): string {
  const sig = crypto.createHmac("sha256", unsubscribeSecret()).update(userId).digest();
  return `${b64url(userId)}.${b64url(sig)}`;
}
