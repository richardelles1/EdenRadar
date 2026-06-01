import type { Express } from "express";
import { startAutoSweep, getSchedulerStatus } from "../lib/scheduler";

// Prevents the dual-UTC cron entries (DST coverage) from double-firing within the same window.
const TRIGGER_COOLDOWN_MS = 4 * 60 * 60 * 1000;
let lastTriggerAt = 0;

export function registerInternalRoutes(app: Express): void {
  app.post("/api/internal/sweep-trigger", async (req, res) => {
    const secret = process.env.SWEEP_TRIGGER_SECRET;
    if (!secret) {
      return res.status(503).json({ error: "SWEEP_TRIGGER_SECRET not configured on server" });
    }
    if (req.headers.authorization !== `Bearer ${secret}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const now = Date.now();
    const agoMin = Math.round((now - lastTriggerAt) / 60_000);
    if (lastTriggerAt > 0 && now - lastTriggerAt < TRIGGER_COOLDOWN_MS) {
      console.log(`[sweep-trigger] Skipped — triggered ${agoMin}min ago (cooldown: 4h)`);
      return res.json({ ok: true, started: false, reason: `cooldown (${agoMin}min ago)` });
    }

    // Only skip if we're already mid-sweep — not for a normal running cycle.
    // startStalenessFirstScan() safely preempts a running cycle by incrementing
    // runGeneration and rebuilding the queue in staleness-first order.
    const status = getSchedulerStatus();
    if (status.autoSweepActive) {
      console.log("[sweep-trigger] Skipped — auto-sweep already in progress");
      return res.json({ ok: true, started: false, reason: "auto_sweep_already_active" });
    }

    lastTriggerAt = now;
    const triggerLabel = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date()) + " PST (external cron)";

    startAutoSweep(triggerLabel).then((r) => {
      console.log(`[sweep-trigger] ${r.message}`);
    }).catch((err: any) => {
      console.error(`[sweep-trigger] Failed to start: ${err?.message}`);
    });

    return res.json({ ok: true, started: true, trigger: triggerLabel });
  });
}
