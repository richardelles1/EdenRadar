/**
 * Coalesces EdenScout → EdenMarket "asset is now listed" email notifications.
 *
 * When an admin batch-activates several listings at once, multiple per-listing
 * emails to the same user pile up in a single tick. This helper batches them
 * into one summary email per user, sent after a short debounce window so any
 * subsequent activations in the same window are folded in.
 *
 * In-memory state is single-instance only. If multi-instance deployment is
 * adopted, swap for a DB-backed queue (e.g. an `outbox` table polled by one
 * worker), since two instances would otherwise each send their own coalesced
 * email per user.
 */
import { sendMarketAdHocEmail, APP_URL } from "../email";

const COALESCE_WINDOW_MS = 5 * 60 * 1000;

interface PendingItem {
  listingId: number;
  assetLabel: string;
}
interface PendingBatch {
  email: string;
  items: PendingItem[];
  timer: NodeJS.Timeout;
}

const pending = new Map<string, PendingBatch>();

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function flush(userKey: string): Promise<void> {
  const batch = pending.get(userKey);
  if (!batch) return;
  pending.delete(userKey);

  // Dedupe by listingId in case the same listing was enqueued twice
  const seen = new Set<number>();
  const uniq = batch.items.filter((i) => (seen.has(i.listingId) ? false : (seen.add(i.listingId), true)));

  try {
    if (uniq.length === 1) {
      const it = uniq[0];
      await sendMarketAdHocEmail(
        batch.email,
        `EdenMarket — ${it.assetLabel} is now listed`,
        `<p>An asset you've been tracking in EdenScout — <strong>${escapeHtml(it.assetLabel)}</strong> — is now available for licensing in <strong>EdenMarket</strong>.</p>
         <p><a href="${APP_URL}/market/listing/${it.listingId}">View the listing</a></p>
         <p style="font-size:12px;color:#9ca3af">This alert was triggered because you have this asset in your EdenScout portfolio.</p>`,
      );
    } else {
      const rows = uniq
        .map(
          (i) =>
            `<li style="margin-bottom:6px;"><a href="${APP_URL}/market/listing/${i.listingId}">${escapeHtml(i.assetLabel)}</a></li>`,
        )
        .join("");
      await sendMarketAdHocEmail(
        batch.email,
        `EdenMarket — ${uniq.length} tracked assets are now listed`,
        `<p><strong>${uniq.length} assets</strong> you've been tracking in EdenScout are now available for licensing in <strong>EdenMarket</strong>:</p>
         <ul style="padding-left:20px;margin:14px 0;">${rows}</ul>
         <p style="font-size:12px;color:#9ca3af">These alerts were triggered because you have these assets in your EdenScout portfolio.</p>`,
      );
    }
    console.log(`[marketEmailCoalescer] Sent batch to ${batch.email} — ${uniq.length} listing(s)`);
  } catch (err) {
    console.warn(`[marketEmailCoalescer] Failed to send batch to ${batch.email}:`, err);
  }
}

/**
 * Enqueue a "listing is now available" email for a user. Calls within
 * COALESCE_WINDOW_MS for the same email address are merged into a single send.
 */
export function enqueueListingAvailable(
  email: string,
  listingId: number,
  assetLabel: string,
): void {
  const key = email.toLowerCase();
  const existing = pending.get(key);
  if (existing) {
    existing.items.push({ listingId, assetLabel });
    return;
  }
  const timer = setTimeout(() => {
    flush(key).catch(() => {});
  }, COALESCE_WINDOW_MS);
  // Allow the process to exit even if this timer is still pending
  if (typeof timer.unref === "function") timer.unref();
  pending.set(key, { email, items: [{ listingId, assetLabel }], timer });
}

/** For tests/shutdown: flush all pending batches synchronously. */
export async function flushAllListingEmails(): Promise<void> {
  const keys = [...pending.keys()];
  for (const k of keys) {
    const batch = pending.get(k);
    if (batch) clearTimeout(batch.timer);
    await flush(k);
  }
}
