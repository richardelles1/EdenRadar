import { db } from "../db";
import { storage } from "../storage";
import { userAlerts, ingestedAssets } from "../../shared/schema";
import { eq, gt, and, ilike, or, inArray, desc, isNotNull } from "drizzle-orm";
import { renderDispatchEmail, type DispatchAsset } from "./emailTemplate";

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

  const alerts = await db
    .select()
    .from(userAlerts)
    .where(isNotNull(userAlerts.userId));

  if (alerts.length === 0) return;

  // Stable boundary for this evaluation run. All assets with firstSeenAt <=
  // evaluationStartedAt are in scope. The watermark for each sent alert advances
  // to this timestamp so assets ingested during the send loop are deferred to the
  // next cycle rather than silently skipped.
  const evaluationStartedAt = new Date();
  const fortyEightHoursAgo = new Date(evaluationStartedAt.getTime() - 48 * 60 * 60 * 1000);

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

  for (const alert of alerts) {
    if (!alert.userId) continue;

    // Use lastAlertSentAt watermark; fall back to 48h ago for first-run alerts
    // to avoid flooding users with historical data.
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
        console.error(
          `[alertMailer] Send error for alert ${alert.id} → ${email}:`,
          sendError.message,
        );
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

      // Advance the watermark to evaluationStartedAt (captured before any sends),
      // not to send-time. Assets ingested between evaluation start and now will be
      // picked up cleanly by the next cycle; none are silently skipped.
      await db
        .update(userAlerts)
        .set({ lastAlertSentAt: evaluationStartedAt })
        .where(eq(userAlerts.id, alert.id));
    } catch (err: any) {
      console.error(`[alertMailer] Unexpected error for alert ${alert.id}:`, err?.message);
    }
  }
}
