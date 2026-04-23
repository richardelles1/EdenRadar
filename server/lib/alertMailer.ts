import { db } from "../db";
import { userAlerts, ingestedAssets } from "../../shared/schema";
import { eq, gt, and, ilike, or, inArray, desc, isNotNull } from "drizzle-orm";
import { renderDispatchEmail, type DispatchAsset } from "./emailTemplate";

interface AlertMatchGroup {
  alertId: number;
  alertName: string;
  assets: DispatchAsset[];
}

/**
 * Query ingested_assets for new matches since the given date,
 * applying the alert's criteria filters.
 */
async function matchAssetsForAlert(
  alert: typeof userAlerts.$inferSelect,
  since: Date,
): Promise<DispatchAsset[]> {
  const conditions: ReturnType<typeof eq>[] = [
    gt(ingestedAssets.firstSeenAt, since) as any,
    eq(ingestedAssets.relevant, true) as any,
  ];

  if (alert.institutions && alert.institutions.length > 0) {
    conditions.push(inArray(ingestedAssets.institution, alert.institutions) as any);
  }
  if (alert.modalities && alert.modalities.length > 0) {
    conditions.push(inArray(ingestedAssets.modality, alert.modalities) as any);
  }
  if (alert.stages && alert.stages.length > 0) {
    conditions.push(inArray(ingestedAssets.developmentStage, alert.stages) as any);
  }
  if (alert.query && alert.query.trim()) {
    const q = `%${alert.query.trim()}%`;
    conditions.push(
      or(
        ilike(ingestedAssets.assetName, q),
        ilike(ingestedAssets.summary, q),
        ilike(ingestedAssets.indication, q),
        ilike(ingestedAssets.target, q),
      ) as any,
    );
  }

  const rows = await db
    .select()
    .from(ingestedAssets)
    .where(and(...(conditions as any[])))
    .orderBy(desc(ingestedAssets.firstSeenAt))
    .limit(15);

  return rows.map((a) => ({
    id: a.id,
    assetName: a.assetName,
    institution: a.institution,
    indication: a.indication,
    modality: a.modality,
    developmentStage: a.developmentStage,
    summary: a.summary,
    sourceUrl: a.sourceUrl,
    firstSeenAt: a.firstSeenAt,
  }));
}

/**
 * Called after each institution sync that produced new assets, or at cycle end.
 * Evaluates all user_alerts, groups matches by user, and sends one email per user.
 *
 * @param triggeringInstitution — when provided, only evaluates alerts that
 *   include this institution (or have no institution restriction).
 */
export async function checkAndSendAlerts(triggeringInstitution?: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!apiKey) {
    console.log("[alertMailer] RESEND_API_KEY not set — skipping alert emails");
    return;
  }
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.log("[alertMailer] Supabase credentials not set — skipping alert emails");
    return;
  }

  // Load all user_alerts that have a user_id
  const alerts = await db
    .select()
    .from(userAlerts)
    .where(isNotNull(userAlerts.userId));

  if (alerts.length === 0) return;

  const now = new Date();
  const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

  // Evaluate each alert; collect matches keyed by user
  const matchesByUser = new Map<string, AlertMatchGroup[]>();

  for (const alert of alerts) {
    if (!alert.userId) continue;

    // If triggered by a specific institution, skip alerts that don't cover it
    if (
      triggeringInstitution &&
      alert.institutions &&
      alert.institutions.length > 0 &&
      !alert.institutions
        .map((i) => i.toLowerCase())
        .includes(triggeringInstitution.toLowerCase())
    ) {
      continue;
    }

    const since = alert.lastAlertSentAt ?? fortyEightHoursAgo;
    let matched: DispatchAsset[];

    try {
      matched = await matchAssetsForAlert(alert, since);
    } catch (err: any) {
      console.error(`[alertMailer] Error matching alert ${alert.id}:`, err?.message);
      continue;
    }

    if (matched.length === 0) continue;

    const existing = matchesByUser.get(alert.userId) ?? [];
    existing.push({
      alertId: alert.id,
      alertName: alert.name ?? "Unnamed Alert",
      assets: matched,
    });
    matchesByUser.set(alert.userId, existing);
  }

  if (matchesByUser.size === 0) {
    console.log("[alertMailer] No alert matches — no emails to send");
    return;
  }

  // Fetch user emails from Supabase admin API
  const { createClient } = await import("@supabase/supabase-js");
  const adminSupabase = createClient(supabaseUrl, supabaseServiceRoleKey);
  const { data: usersData, error: usersError } =
    await adminSupabase.auth.admin.listUsers({ perPage: 500 });

  if (usersError) {
    console.error("[alertMailer] Failed to fetch user emails:", usersError.message);
    return;
  }

  const userEmailMap = new Map<string, string>();
  for (const u of usersData?.users ?? []) {
    const email: string | undefined =
      (u.user_metadata?.contactEmail as string | undefined) || u.email;
    if (email) userEmailMap.set(u.id, email);
  }

  // Send one email per user containing all their matched assets
  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);

  for (const [userId, groups] of matchesByUser.entries()) {
    const email = userEmailMap.get(userId);
    if (!email) {
      console.log(`[alertMailer] No email for user ${userId} — skipping`);
      continue;
    }

    // Deduplicate assets across alerts for this user
    const seenIds = new Set<number>();
    const allAssets: DispatchAsset[] = [];
    for (const g of groups) {
      for (const a of g.assets) {
        if (!seenIds.has(a.id)) {
          seenIds.add(a.id);
          allAssets.push(a);
        }
      }
    }
    if (allAssets.length === 0) continue;

    const alertNames = [...new Set(groups.map((g) => g.alertName))].join(", ");
    const subject = `EdenRadar Alert: ${allAssets.length} new match${allAssets.length !== 1 ? "es" : ""} — ${alertNames}`;
    const windowLabel = `Alert match · ${allAssets.length} new asset${allAssets.length !== 1 ? "s" : ""}`;

    const html = renderDispatchEmail({
      subject,
      assets: allAssets,
      windowLabel,
      isTest: false,
      colorMode: "light",
    });

    try {
      const { error: sendError } = await resend.emails.send({
        from: "EdenRadar Alerts <digest@edenradar.com>",
        to: [email],
        subject,
        html,
      });

      if (sendError) {
        console.error(`[alertMailer] Send error for ${email}:`, sendError.message);
        continue;
      }

      console.log(
        `[alertMailer] Sent alert email → ${email} | ${allAssets.length} asset(s) | alerts: ${alertNames}`,
      );

      // Update lastAlertSentAt only for the alerts that contributed matches
      const matchedAlertIds = groups.map((g) => g.alertId);
      await db
        .update(userAlerts)
        .set({ lastAlertSentAt: now })
        .where(inArray(userAlerts.id, matchedAlertIds));
    } catch (err: any) {
      console.error(`[alertMailer] Unexpected error for ${email}:`, err?.message);
    }
  }
}
