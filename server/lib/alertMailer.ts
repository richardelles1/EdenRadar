import { db } from "../db";
import { storage } from "../storage";
import { userAlerts, ingestedAssets, industryProfiles } from "../../shared/schema";
import { eq, gt, and, ilike, or, inArray, desc, isNotNull } from "drizzle-orm";
import { renderDispatchEmail, type DispatchAsset } from "./emailTemplate";

const DIGEST_SAMPLE_LIMIT = 3;

function frequencyWindowHours(frequency: string): number {
  if (frequency === "weekly") return 168;
  return 24;
}

function shouldSendNow(lastSentAt: Date | null, windowHours: number): boolean {
  if (!lastSentAt) return true;
  const elapsedHours = (Date.now() - lastSentAt.getTime()) / (1000 * 60 * 60);
  return elapsedHours >= windowHours;
}

/**
 * Guards against concurrent evaluations (e.g., manual admin trigger races with
 * cycle completion). Node.js is single-threaded so a simple boolean is sufficient.
 */
let isEvaluating = false;

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
    .orderBy(desc(ingestedAssets.firstSeenAt));

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
 * Called once per scheduler cycle (after all institutions complete) to avoid race
 * conditions on the lastAlertSentAt watermark that would arise from per-institution
 * concurrent evaluations.
 */
export async function checkAndSendAlerts(): Promise<void> {
  if (isEvaluating) {
    console.log("[alertMailer] Evaluation already in progress — skipping concurrent call");
    return;
  }
  isEvaluating = true;
  try {
    await evaluateAlerts();
  } finally {
    isEvaluating = false;
  }
}

async function evaluateAlerts(): Promise<void> {
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

  // Fetch all saved alerts. Wrap in try-catch in case user_alerts table is missing
  // (e.g. first deploy before db:push runs — createUserAlertsTable handles this on boot).
  let alerts: typeof userAlerts.$inferSelect[];
  try {
    alerts = await db
      .select()
      .from(userAlerts)
      .where(isNotNull(userAlerts.userId));
  } catch (err: any) {
    console.error("[alertMailer] Failed to query user_alerts table:", err?.message,
      "— table may not exist yet; will retry next cycle");
    return;
  }

  if (alerts.length === 0) {
    console.log("[alertMailer] No saved alerts found — skipping cycle");
    return;
  }

  console.log(`[alertMailer] Evaluating ${alerts.length} saved alert(s)`);

  // Stable boundary for this evaluation run. All assets with firstSeenAt <=
  // evaluationStartedAt are in scope. The watermark for each sent alert advances
  // to this timestamp so assets ingested during the send loop are deferred to the
  // next cycle rather than silently skipped.
  const evaluationStartedAt = new Date();
  const fortyEightHoursAgo = new Date(evaluationStartedAt.getTime() - 48 * 60 * 60 * 1000);

  // Batch-fetch industry profiles for all unique user IDs so we can check
  // opt-in status and frequency preference without N+1 queries.
  const uniqueUserIds = [...new Set(alerts.map((a) => a.userId).filter(Boolean))] as string[];
  const profileRows = uniqueUserIds.length
    ? await db.select().from(industryProfiles).where(inArray(industryProfiles.userId, uniqueUserIds))
    : [];
  const profileMap = new Map(profileRows.map((p) => [p.userId, p]));

  // Resolve user emails via Supabase admin API — fully paginated so every user
  // is covered regardless of team size.
  const { createClient } = await import("@supabase/supabase-js");
  const adminSupabase = createClient(supabaseUrl, supabaseServiceRoleKey);

  const userEmailMap = new Map<string, string>();
  let page = 1;
  while (true) {
    const { data: pageData, error: pageError } =
      await adminSupabase.auth.admin.listUsers({ perPage: 1000, page });
    if (pageError) {
      console.error("[alertMailer] Failed to fetch user emails:", pageError.message);
      return;
    }
    const users = pageData?.users ?? [];
    for (const u of users) {
      const email: string | undefined =
        (u.user_metadata?.contactEmail as string | undefined) || u.email;
      if (email) userEmailMap.set(u.id, email);
    }
    if (users.length < 1000) break;
    page++;
  }

  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);

  let sentCount = 0;
  let skippedCount = 0;

  for (const alert of alerts) {
    if (!alert.userId) continue;

    // Only send to users who have opted in to email digest
    const profile = profileMap.get(alert.userId);
    if (!profile) {
      console.log(`[alertMailer] Alert ${alert.id} — skip: no industry_profile for user ${alert.userId}`);
      skippedCount++;
      continue;
    }
    if (!profile.subscribedToDigest) {
      console.log(`[alertMailer] Alert ${alert.id} — skip: user ${alert.userId} not subscribed to digest`);
      skippedCount++;
      continue;
    }

    // Respect the user's chosen frequency (daily/weekly). "realtime" always sends.
    const frequency = (profile.notificationPrefs as { frequency?: string } | null)?.frequency ?? "daily";
    if (frequency !== "realtime") {
      const windowHours = frequencyWindowHours(frequency);
      const elapsed = alert.lastAlertSentAt
        ? ((Date.now() - alert.lastAlertSentAt.getTime()) / (1000 * 60 * 60)).toFixed(1)
        : "never sent";
      if (!shouldSendNow(alert.lastAlertSentAt ?? null, windowHours)) {
        console.log(
          `[alertMailer] Alert ${alert.id} — skip: frequency gate (${frequency}, ${elapsed}h elapsed, need ${windowHours}h)`
        );
        skippedCount++;
        continue;
      }
    }

    // Use lastAlertSentAt watermark; fall back to 48h ago for first-run alerts
    // to avoid flooding users with historical data.
    const since = alert.lastAlertSentAt ?? fortyEightHoursAgo;
    let matched: DispatchAsset[];

    try {
      matched = await matchAssetsForAlert(alert, since);
    } catch (err: any) {
      console.error(`[alertMailer] Alert ${alert.id} — match error:`, err?.message);
      continue;
    }

    if (matched.length === 0) {
      console.log(`[alertMailer] Alert ${alert.id} ("${alert.name ?? "Unnamed"}") — skip: no new matches since ${since.toISOString()}`);
      skippedCount++;
      continue;
    }

    const email = userEmailMap.get(alert.userId);
    if (!email) {
      console.log(`[alertMailer] Alert ${alert.id} — skip: no email address for user ${alert.userId}`);
      skippedCount++;
      continue;
    }

    const alertName = alert.name ?? "Unnamed Alert";
    const totalCount = matched.length;
    // Show up to 3 sample assets in the digest; remaining count shown in a footer CTA
    const sampleAssets = matched.slice(0, DIGEST_SAMPLE_LIMIT);
    const subject = `EdenRadar Alert: ${totalCount} new match${totalCount !== 1 ? "es" : ""} — ${alertName}`;
    const windowLabel = `Alert: ${alertName} · ${totalCount} new asset${totalCount !== 1 ? "s" : ""}`;

    const html = renderDispatchEmail({
      subject,
      assets: sampleAssets,
      windowLabel,
      isTest: false,
      colorMode: "light",
      totalCount,
      settingsUrl: "https://edenradar.com/industry/settings",
    });

    try {
      const { error: sendError } = await resend.emails.send({
        from: "EdenRadar Alerts <digest@edenradar.com>",
        to: [email],
        subject,
        html,
      });

      if (sendError) {
        console.error(
          `[alertMailer] Alert ${alert.id} — send error → ${email}:`,
          sendError.message,
        );
        continue;
      }

      console.log(
        `[alertMailer] Sent alert "${alertName}" → ${email} | ${matched.length} asset(s) matched`,
      );
      sentCount++;

      // Record in dispatch_logs so admin can audit all outbound alert emails
      await storage.createDispatchLog({
        subject,
        recipients: [email],
        assetIds: matched.map((a) => a.id),
        assetNames: matched.map((a) => a.assetName),
        assetSourceUrls: matched.map((a) => a.sourceUrl ?? ""),
        assetCount: matched.length,
        windowHours: frequencyWindowHours(
          (profile.notificationPrefs as { frequency?: string } | null)?.frequency ?? "daily"
        ),
        isTest: false,
      });

      // Advance the watermark to evaluationStartedAt (captured before any sends),
      // not to send-time. Assets ingested between evaluation start and now will be
      // picked up cleanly by the next cycle; none are silently skipped.
      await db
        .update(userAlerts)
        .set({ lastAlertSentAt: evaluationStartedAt })
        .where(eq(userAlerts.id, alert.id));
    } catch (err: any) {
      console.error(`[alertMailer] Alert ${alert.id} — unexpected error:`, err?.message);
    }
  }

  console.log(
    `[alertMailer] Cycle complete — sent: ${sentCount}, skipped: ${skippedCount}, total alerts: ${alerts.length}`
  );
}
