import { storage } from "../storage.js";
import { sendThesisAlertEmail, unsubscribeUrlFor, type AlertAsset } from "../email.js";

export interface AlertDispatchResult {
  checked: number;
  sent: number;
  noMatch: number;
  skippedFrequency: number;
  errors: number;
}

async function getUserEmail(userId: string): Promise<string | null> {
  const sbUrl = process.env.VITE_SUPABASE_URL ?? "";
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!sbUrl || !sbKey) return null;
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const admin = createClient(sbUrl, sbKey);
    const { data } = await admin.auth.admin.getUserById(userId);
    return data?.user?.email ?? null;
  } catch {
    return null;
  }
}

function frequencyWindowHours(frequency: string): number {
  if (frequency === "weekly") return 168;
  return 24;
}

function shouldSendNow(lastAlertSentAt: Date | null, windowHours: number): boolean {
  if (!lastAlertSentAt) return true;
  const elapsedHours = (Date.now() - lastAlertSentAt.getTime()) / (1000 * 60 * 60);
  return elapsedHours >= windowHours;
}

export async function runAlertDispatch(): Promise<AlertDispatchResult> {
  const result: AlertDispatchResult = { checked: 0, sent: 0, noMatch: 0, skippedFrequency: 0, errors: 0 };

  let subscribers;
  try {
    subscribers = await storage.getAlertSubscribers();
  } catch (err) {
    console.error("[alertDispatch] Failed to load subscribers:", err);
    return result;
  }

  console.log(`[alertDispatch] Checking ${subscribers.length} opted-in subscriber(s)`);

  for (const profile of subscribers) {
    result.checked++;

    try {
      const freq = profile.notificationPrefs?.frequency ?? "daily";
      const windowHours = frequencyWindowHours(freq);

      if (!shouldSendNow(profile.lastAlertSentAt ?? null, windowHours)) {
        result.skippedFrequency++;
        continue;
      }

      if (profile.therapeuticAreas.length === 0 && profile.modalities.length === 0) {
        result.noMatch++;
        continue;
      }

      const suggestions = await storage.getSubscriberSuggestions(profile.userId, windowHours);
      const matches = suggestions
        .filter((s) => s.score > 0)
        .slice(0, 10);

      if (matches.length === 0) {
        result.noMatch++;
        continue;
      }

      const email = await getUserEmail(profile.userId);
      if (!email) {
        console.warn(`[alertDispatch] No email found for userId=${profile.userId}`);
        result.errors++;
        continue;
      }

      const displayName = profile.userName || profile.companyName || "";
      const alertAssets: AlertAsset[] = matches.map((m) => ({
        id: m.id,
        assetName: m.assetName,
        institution: m.institution,
        modality: m.modality,
        developmentStage: m.developmentStage,
        indication: m.indication,
        sourceUrl: m.sourceUrl,
      }));

      await sendThesisAlertEmail(
        email,
        displayName,
        alertAssets,
        profile.therapeuticAreas,
        profile.modalities,
        unsubscribeUrlFor(profile.userId),
      );

      const maxAssetId = Math.max(...matches.map((m) => m.id));
      await storage.updateAlertState(profile.userId, new Date(), maxAssetId);

      result.sent++;
      console.log(`[alertDispatch] Sent alert to ${email} — ${matches.length} match(es)`);
    } catch (err) {
      console.error(`[alertDispatch] Error processing userId=${profile.userId}:`, err);
      result.errors++;
    }
  }

  console.log(
    `[alertDispatch] Done — checked=${result.checked} sent=${result.sent} noMatch=${result.noMatch} ` +
    `skippedFreq=${result.skippedFrequency} errors=${result.errors}`
  );
  return result;
}
