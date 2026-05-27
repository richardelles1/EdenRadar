import type { Express } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { verifyAnyAuth, tryGetUserId, requireAdmin } from "../lib/supabaseAuth";
import { runTtoContactScrape, upsertContacts, TTO_SEEDS, type TtoContact } from "../lib/ttoContactScraper";

let scrapeRunning = false;

export function registerContactRoutes(app: Express): void {
  // ── Public: contacts for an institution (auth required) ──────────────────
  app.get("/api/tto-contacts/:institution", verifyAnyAuth, async (req, res) => {
    try {
      const institution = decodeURIComponent(req.params.institution);
      const result = await db.execute(sql`
        SELECT id, institution, name, title, email, phone, linkedin_url, tto_url, verified_at
        FROM tto_contacts
        WHERE lower(institution) = lower(${institution})
        ORDER BY
          CASE WHEN verified_at IS NOT NULL THEN 0 ELSE 1 END,
          name ASC
        LIMIT 20
      `);
      return res.json({ contacts: result.rows });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── Public: bulk contacts for multiple institutions ───────────────────────
  app.post("/api/tto-contacts/bulk", verifyAnyAuth, async (req, res) => {
    try {
      const { institutions } = req.body as { institutions?: string[] };
      if (!Array.isArray(institutions) || institutions.length === 0) {
        return res.status(400).json({ error: "institutions array required" });
      }
      const capped = institutions.slice(0, 50);
      const result = await db.execute(sql`
        SELECT id, institution, name, title, email, phone, linkedin_url, tto_url, verified_at
        FROM tto_contacts
        WHERE lower(institution) = ANY(${capped.map(i => i.toLowerCase())}::text[])
        ORDER BY institution, CASE WHEN verified_at IS NOT NULL THEN 0 ELSE 1 END, name ASC
      `);
      const byInst: Record<string, unknown[]> = {};
      for (const row of result.rows as any[]) {
        const key = row.institution as string;
        if (!byInst[key]) byInst[key] = [];
        byInst[key].push(row);
      }
      return res.json({ contacts: byInst });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── Admin: trigger scrape run ─────────────────────────────────────────────
  app.post("/api/admin/tto-contacts/scrape", requireAdmin, async (req, res) => {
    if (scrapeRunning) return res.status(409).json({ error: "Scrape already running" });

    const { institutions } = req.body as { institutions?: string[] };
    const seeds = institutions
      ? TTO_SEEDS.filter(s => institutions.includes(s.institution))
      : TTO_SEEDS;

    if (seeds.length === 0) return res.status(400).json({ error: "No matching seeds" });

    scrapeRunning = true;
    const ac = new AbortController();

    // Stream SSE progress
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.flushHeaders();

    const write = (data: object) => {
      try { res.write(`data: ${JSON.stringify(data)}\n\n`); } catch {}
    };

    runTtoContactScrape(seeds, (p) => write(p), ac.signal)
      .then(({ total, inserted, results }) => {
        const empty = results.filter(r => r.status === "empty").map(r => r.institution);
        const errors = results.filter(r => r.status === "error").map(r => r.institution);
        write({ done: true, total, inserted, empty, errors });
        scrapeRunning = false;
        res.end();
      })
      .catch((err) => {
        write({ done: true, error: err.message });
        scrapeRunning = false;
        res.end();
      });

    req.on("close", () => { ac.abort(); scrapeRunning = false; });
  });

  // ── Admin: list all contacts ──────────────────────────────────────────────
  app.get("/api/admin/tto-contacts", requireAdmin, async (req, res) => {
    try {
      const institution = req.query.institution as string | undefined;
      const withEmail = req.query.withEmail === "true";
      const result = await db.execute(sql`
        SELECT id, institution, name, title, email, phone, linkedin_url, tto_url, source, verified_at, created_at
        FROM tto_contacts
        WHERE (${institution ?? null}::text IS NULL OR lower(institution) = lower(${institution ?? ""}))
          AND (NOT ${withEmail} OR email IS NOT NULL)
        ORDER BY institution, name ASC
        LIMIT 2000
      `);
      const total = await db.execute(sql`SELECT COUNT(*)::int AS n FROM tto_contacts`);
      const withEmailCount = await db.execute(sql`SELECT COUNT(*)::int AS n FROM tto_contacts WHERE email IS NOT NULL`);
      return res.json({
        contacts: result.rows,
        stats: {
          total: (total.rows[0] as any)?.n ?? 0,
          withEmail: (withEmailCount.rows[0] as any)?.n ?? 0,
        },
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── Admin: institutions with no contacts ──────────────────────────────────
  app.get("/api/admin/tto-contacts/gaps", requireAdmin, async (req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT DISTINCT ia.institution
        FROM ingested_assets ia
        WHERE ia.relevant = true
          AND NOT EXISTS (
            SELECT 1 FROM tto_contacts tc
            WHERE lower(tc.institution) = lower(ia.institution)
          )
        ORDER BY ia.institution ASC
      `);
      return res.json({ gaps: result.rows.map((r: any) => r.institution) });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── Admin: manual insert / update ────────────────────────────────────────
  app.post("/api/admin/tto-contacts", requireAdmin, async (req, res) => {
    try {
      const { institution, name, title, email, phone, linkedin_url, tto_url, verified } =
        req.body as Partial<TtoContact & { linkedin_url?: string; verified?: boolean }>;
      if (!institution || !name) return res.status(400).json({ error: "institution and name required" });
      await upsertContacts([{
        institution, name,
        title: title ?? undefined,
        email: email?.toLowerCase() ?? undefined,
        phone: phone ?? undefined,
        tto_url: tto_url ?? undefined,
        source: "manual",
      }]);
      if (verified && email) {
        await db.execute(sql`
          UPDATE tto_contacts SET verified_at = CURRENT_TIMESTAMP
          WHERE lower(email) = lower(${email})
        `);
      }
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ── Admin: delete contact ─────────────────────────────────────────────────
  app.delete("/api/admin/tto-contacts/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      await db.execute(sql`DELETE FROM tto_contacts WHERE id = ${id}`);
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });
}
