import type { Express } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { getAdminEvents } from "../storage";

export function registerAnalyticsRoutes(app: Express): void {
  app.get("/api/admin/analytics/overview", async (req, res) => {
    try {

      const analyticsSupabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const analyticsSupabaseUrl = process.env.VITE_SUPABASE_URL || "";

      // Daily search volume â€” last 30 days
      const searchesPerDayResult = await db.execute(sql`
        SELECT DATE(created_at) AS day, COUNT(*) AS count
        FROM search_history
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY day
        ORDER BY day ASC
      `);
      const searchesPerDay = searchesPerDayResult.rows as { day: string; count: string }[];

      // Eden AI sessions per day â€” last 30 days
      const sessionsPerDayResult = await db.execute(sql`
        SELECT DATE(created_at) AS day, COUNT(*) AS count
        FROM eden_sessions
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY day
        ORDER BY day ASC
      `);
      const sessionsPerDay = sessionsPerDayResult.rows as { day: string; count: string }[];

      // Saved assets per day (cumulative growth proxy) â€” last 30 days
      const savedAssetsPerDayResult = await db.execute(sql`
        SELECT DATE(saved_at) AS day, COUNT(*) AS count
        FROM saved_assets
        WHERE saved_at >= NOW() - INTERVAL '30 days'
        GROUP BY day
        ORDER BY day ASC
      `);
      const savedAssetsPerDay = savedAssetsPerDayResult.rows as { day: string; count: string }[];

      // Dispatch logs per week â€” last 8 weeks
      const dispatchesPerWeekResult = await db.execute(sql`
        SELECT DATE_TRUNC('week', sent_at) AS week, COUNT(*) AS count
        FROM dispatch_logs
        WHERE sent_at >= NOW() - INTERVAL '8 weeks'
        GROUP BY week
        ORDER BY week ASC
      `);
      const dispatchesPerWeek = dispatchesPerWeekResult.rows as { week: string; count: string }[];

      // App event feature usage counts (all time)
      const featureUsageResult = await db.execute(sql`
        SELECT event, COUNT(*) AS count
        FROM app_events
        GROUP BY event
        ORDER BY count DESC
      `);
      const featureUsage = featureUsageResult.rows as { event: string; count: string }[];

      // Recent app events list (last 50)
      const recentEventsResult = await db.execute(sql`
        SELECT id, event, metadata, created_at
        FROM app_events
        ORDER BY created_at DESC
        LIMIT 50
      `);
      const recentEvents = recentEventsResult.rows as { id: number; event: string; metadata: Record<string, unknown> | null; created_at: string }[];

      // Aggregate totals
      const [totalSearches, totalSessions, totalSavedAssets, totalDispatches] = await Promise.all([
        db.execute(sql`SELECT COUNT(*) AS n FROM search_history`),
        db.execute(sql`SELECT COUNT(*) AS n FROM eden_sessions`),
        db.execute(sql`SELECT COUNT(*) AS n FROM saved_assets`),
        db.execute(sql`SELECT COUNT(*) AS n FROM dispatch_logs`),
      ]);

      type CountRow = { n: string };
      const toCount = (rows: unknown[]): number => Number((rows[0] as CountRow)?.n ?? 0);

      // New user signups by week (last 8 weeks) via Supabase admin API
      type SignupWeek = { week: string; count: number };
      let signupsPerWeek: SignupWeek[] = [];
      if (analyticsSupabaseKey && analyticsSupabaseUrl) {
        try {
          const { createClient } = await import("@supabase/supabase-js");
          const adminClient = createClient(analyticsSupabaseUrl, analyticsSupabaseKey);
          const cutoff = new Date();
          cutoff.setDate(cutoff.getDate() - 56); // 8 weeks
          // Paginate through all users to avoid the 500-user cap
          const allUsers: { created_at: string }[] = [];
          let page = 1;
          while (true) {
            const { data: pageData } = await adminClient.auth.admin.listUsers({ perPage: 1000, page });
            const batch = pageData?.users ?? [];
            allUsers.push(...batch);
            if (batch.length < 1000) break;
            page++;
          }
          // Bucket by ISO week (Monday-based)
          const weekMap = new Map<string, number>();
          for (const u of allUsers) {
            const created = new Date(u.created_at);
            if (created < cutoff) continue;
            // Get Monday of that week
            const day = created.getDay(); // 0=Sun
            const diff = (day === 0 ? -6 : 1) - day;
            const monday = new Date(created);
            monday.setDate(created.getDate() + diff);
            const key = monday.toISOString().slice(0, 10);
            weekMap.set(key, (weekMap.get(key) ?? 0) + 1);
          }
          signupsPerWeek = Array.from(weekMap.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([week, count]) => ({ week, count }));
        } catch {
          // Non-fatal: if Supabase admin fails, omit signup chart
        }
      }

      res.json({
        searchesPerDay: searchesPerDay.map(r => ({ day: r.day, count: Number(r.count) })),
        sessionsPerDay: sessionsPerDay.map(r => ({ day: r.day, count: Number(r.count) })),
        savedAssetsPerDay: savedAssetsPerDay.map(r => ({ day: r.day, count: Number(r.count) })),
        dispatchesPerWeek: dispatchesPerWeek.map(r => ({ week: r.week, count: Number(r.count) })),
        signupsPerWeek,
        featureUsage: featureUsage.map(r => ({ event: r.event, count: Number(r.count) })),
        recentEvents: recentEvents.map(r => ({ id: r.id, event: r.event, metadata: r.metadata, createdAt: r.created_at })),
        totals: {
          searches: toCount(totalSearches.rows),
          sessions: toCount(totalSessions.rows),
          savedAssets: toCount(totalSavedAssets.rows),
          dispatches: toCount(totalDispatches.rows),
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/admin/analytics/top-searches", async (req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT query, COUNT(*) AS count
        FROM search_history
        GROUP BY query
        ORDER BY count DESC
        LIMIT 20
      `);
      const rows = result.rows as { query: string; count: string }[];
      res.json({ searches: rows.map(r => ({ query: r.query, count: Number(r.count) })) });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/admin/events", async (_req, res) => {
    try {
      const events = await getAdminEvents(200);
      res.json({ events });
    } catch (err: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // â”€â”€ JARVIS SQL Pad â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Read-only SQL execution for admin operator use. Blocks anything that isn't
  // a SELECT statement to prevent accidental writes via the UI.
  app.post("/api/admin/jarvis/sql", async (req, res) => {
    const { query } = req.body as { query?: string };
    if (!query || typeof query !== "string") {
      return res.status(400).json({ error: "query is required" });
    }
    const trimmed = query.trim().replace(/;+$/, "");
    // Strip comments before checking â€” prevents `/**/SELECT` bypass.
    const stripped = trimmed.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ").trim();
    if (!/^SELECT\b/i.test(stripped)) {
      return res.status(400).json({ error: "Only SELECT statements are allowed" });
    }
    // Block DML inside CTEs (e.g. WITH x AS (DELETE ...) SELECT 1).
    if (/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE)\b/i.test(stripped)) {
      return res.status(400).json({ error: "Only SELECT statements are allowed" });
    }
    try {
      const result = await db.transaction(async (tx) => {
        await tx.execute(sql`SET TRANSACTION READ ONLY`);
        return await tx.execute(sql.raw(trimmed));
      });
      res.json({ rows: result.rows, rowCount: result.rows.length });
    } catch (err: any) {
      res.status(400).json({ error: err.message ?? "Query failed" });
    }
  });

}