import { db } from "../db";
import { storage } from "../storage";
import { userAlerts, ingestedAssets } from "../../shared/schema";
import { eq, gt, and, ilike, or, inArray, desc, isNotNull } from "drizzle-orm";
import { renderDispatchEmail, type DispatchAsset } from "./emailTemplate";

/**
 * Find new relevant assets that match a saved alert's criteria.
 * Uses idiomatic Drizzle: undefined conditions are silently ignored by `and()`.
 */
async function matchAssetsForAlert(
  alert: typeof userAlerts.$inferSelect,
  since: Date,
): Promise<DispatchAsset[]> {
  const trimmedQuery = alert.query?.trim();

  const rows = await db
    .select()
    .from(ingestedAssets)
    .where(
      and(
        gt(ingestedAssets.firstSeenAt, since),
        eq(ingestedAssets.relevant, true),
        alert.institutions?.length
          ? inArray(ingestedAssets.institution, alert.institutions)
          : undefined,
        alert.modalities?.length
          ? inArray(ingestedAssets.modality, alert.modalities)
          : undefined,
        alert.stages?.length
          ? inArray(ingestedAssets.developmentStage, alert.stages)
          : undefined,
        trimmedQuery
          ? or(
              ilike(ingestedAssets.assetName, `%${trimmedQuery}%`),
              ilike(ingestedAssets.summary, `%${trimmedQuery}%`),
              ilike(ingestedAssets.indication, `%${trimmedQuery}%`),
              ilike(ingestedAssets.target, `%${trimmedQuery}%`),
            )
          : undefined,
      ),
    )
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
 * Evaluate all saved user alerts and send one email per alert that has new matches.
 *
 * @param triggeringInstitution — when provided, only evaluates alerts whose
 *   institution list includes this institution (or have no institution restriction).
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

  const alerts = await db
    .select()
    .from(userAlerts)
    .where(isNotNull(userAlerts.userId));

  if (alerts.length === 0) return;

  const now = new Date();
  const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

  // Resolve user emails up-front via Supabase admin API
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

  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);

  for (const alert of alerts) {
    if (!alert.userId) continue;

    // Institution scope check: if this was triggered by a specific institution,
    // skip alerts that don't cover it (alerts with no institution list match anything).
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
      console.error(`[alertMailer] Match error for alert ${alert.id}:`, err?.message);
      continue;
    }

    if (matched.length === 0) continue;

    const email = userEmailMap.get(alert.userId);
    if (!email) {
      console.log(`[alertMailer] No email for user ${alert.userId} — skipping alert ${alert.id}`);
      continue;
    }

    const alertName = alert.name ?? "Unnamed Alert";
    const subject = `EdenRadar Alert: ${matched.length} new match${matched.length !== 1 ? "es" : ""} — ${alertName}`;
    const windowLabel = `Alert: ${alertName} · ${matched.length} new asset${matched.length !== 1 ? "s" : ""}`;

    const html = renderDispatchEmail({
      subject,
      assets: matched,
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
        console.error(`[alertMailer] Send error for alert ${alert.id} → ${email}:`, sendError.message);
        continue;
      }

      console.log(
        `[alertMailer] Sent alert "${alertName}" → ${email} | ${matched.length} asset(s)`,
      );

      // Record in dispatch_logs so admin can audit all outbound alert emails
      await storage.createDispatchLog({
        subject,
        recipients: [email],
        assetIds: matched.map((a) => a.id),
        assetNames: matched.map((a) => a.assetName),
        assetSourceUrls: matched.map((a) => a.sourceUrl ?? ""),
        assetCount: matched.length,
        windowHours: 0,
        isTest: false,
      });

      // Update lastAlertSentAt only for this specific alert
      await db
        .update(userAlerts)
        .set({ lastAlertSentAt: now })
        .where(eq(userAlerts.id, alert.id));
    } catch (err: any) {
      console.error(`[alertMailer] Unexpected error for alert ${alert.id}:`, err?.message);
    }
  }
}
