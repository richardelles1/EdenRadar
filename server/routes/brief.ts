import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { requireAdmin } from "../lib/supabaseAuth";
import { sendBriefEmail } from "../email";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const createIssueSchema = z.object({
  slug:        z.string().regex(/^\d{4}-\d{2}$/, "slug must be YYYY-MM"),
  issueNumber: z.number().int().positive(),
  title:       z.string().min(1).max(200),
  content:     z.record(z.unknown()),
});

const updateIssueSchema = createIssueSchema.partial().extend({
  status: z.enum(["draft", "published"]).optional(),
});

export function registerBriefRoutes(app: Express): void {
  // ── Public: list published issues ─────────────────────────────────────────
  app.get("/api/brief", async (_req, res) => {
    try {
      const issues = await storage.listBriefIssues("published");
      res.json(issues);
    } catch (err) {
      console.error("[brief] list error:", err);
      res.status(500).json({ error: "Failed to load issues" });
    }
  });

  // ── Public: get a single issue ────────────────────────────────────────────
  app.get("/api/brief/:slug", async (req, res) => {
    try {
      const issue = await storage.getBriefIssue(req.params.slug);
      if (!issue || issue.status !== "published") {
        return res.status(404).json({ error: "Issue not found" });
      }
      res.json(issue);
    } catch (err) {
      console.error("[brief] get error:", err);
      res.status(500).json({ error: "Failed to load issue" });
    }
  });

  // ── Public: subscribe ─────────────────────────────────────────────────────
  app.post("/api/brief/subscribe", async (req, res) => {
    const { email } = req.body as { email?: string };
    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: "Valid email required" });
    }
    try {
      const token = Buffer.from(`${email}:${Date.now()}`).toString("base64url");
      await storage.subscribeToBrief(email.toLowerCase(), token);
      res.json({ ok: true });
    } catch (err) {
      console.error("[brief] subscribe error:", err);
      res.status(500).json({ error: "Subscription failed" });
    }
  });

  // ── Public: unsubscribe ───────────────────────────────────────────────────
  app.post("/api/brief/unsubscribe", async (req, res) => {
    const { email } = req.body as { email?: string };
    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: "Valid email required" });
    }
    try {
      await storage.unsubscribeFromBrief(email.toLowerCase());
      res.json({ ok: true });
    } catch (err) {
      console.error("[brief] unsubscribe error:", err);
      res.status(500).json({ error: "Unsubscribe failed" });
    }
  });

  // ── Admin: create draft ───────────────────────────────────────────────────
  app.post("/api/admin/brief", requireAdmin, async (req, res) => {
    const parsed = createIssueSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message });
    }
    try {
      const issue = await storage.createBriefIssue({
        ...parsed.data,
        content: parsed.data.content as any,
        status: "draft",
      });
      res.json(issue);
    } catch (err) {
      console.error("[brief] create error:", err);
      res.status(500).json({ error: "Create failed" });
    }
  });

  // ── Admin: update draft ───────────────────────────────────────────────────
  app.patch("/api/admin/brief/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });

    const parsed = updateIssueSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message });
    }
    try {
      const issue = await storage.updateBriefIssue(id, parsed.data as any);
      res.json(issue);
    } catch (err) {
      console.error("[brief] update error:", err);
      res.status(500).json({ error: "Update failed" });
    }
  });

  // ── Admin: publish + send email ───────────────────────────────────────────
  app.post("/api/admin/brief/:id/publish", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });

    try {
      const issue = await storage.updateBriefIssue(id, {
        status: "published",
        publishedAt: new Date(),
      });

      const subscribers = await storage.listActiveBriefSubscribers();
      if (subscribers.length > 0) {
        const appUrl = process.env.APP_URL ?? "https://edenradar.com";
        const issueUrl = `${appUrl}/brief/${issue.slug}`;
        await sendBriefEmail(
          subscribers.map((s) => s.email),
          issue.issueNumber,
          issue.title,
          issueUrl,
        );
      }

      res.json({ ok: true, issue, sent: subscribers.length });
    } catch (err) {
      console.error("[brief] publish error:", err);
      res.status(500).json({ error: "Publish failed" });
    }
  });

  // ── Admin: list all (including drafts) ────────────────────────────────────
  app.get("/api/admin/brief", requireAdmin, async (_req, res) => {
    try {
      const issues = await storage.listBriefIssues();
      res.json(issues);
    } catch (err) {
      console.error("[brief] admin list error:", err);
      res.status(500).json({ error: "Failed to load issues" });
    }
  });

  // ── Admin: subscriber count ───────────────────────────────────────────────
  app.get("/api/admin/brief/subscribers/count", requireAdmin, async (_req, res) => {
    try {
      const subs = await storage.listActiveBriefSubscribers();
      res.json({ count: subs.length });
    } catch (err) {
      console.error("[brief] subscriber count error:", err);
      res.status(500).json({ error: "Failed to count subscribers" });
    }
  });
}
