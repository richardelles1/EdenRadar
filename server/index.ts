import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { storage } from "./storage";
import { db } from "./db";
import { sql } from "drizzle-orm";
import { existsSync } from "fs";
import { execSync } from "child_process";
import { loadAndRestoreScheduler, startScheduler } from "./lib/scheduler";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: "25mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // ── Ensure Playwright Chromium browser binary is present ─────────────────
  // The binary lives in .cache/ms-playwright inside the workspace. If it ever
  // disappears (container rebuild, first boot) scrapers silently return 0
  // results. We detect and auto-recover here so the problem is always visible
  // in the startup log rather than discovered mid-scrape.
  try {
    const { chromium } = await import("playwright");
    const executablePath = chromium.executablePath();
    if (!existsSync(executablePath)) {
      log("[startup] Playwright Chromium binary missing — installing…", "startup");
      execSync("npx playwright install chromium", { stdio: "inherit", timeout: 120_000 });
      log("[startup] Playwright Chromium installed OK", "startup");
    } else {
      log("[startup] Playwright Chromium binary present ✓", "startup");
    }
  } catch (err: any) {
    log(`[startup] Playwright check failed: ${err?.message}`, "startup");
  }

  // ── Startup migrations: ensure pgvector + embedding column ───────────────
  try {
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
    await db.execute(sql`
      ALTER TABLE ingested_assets
      ADD COLUMN IF NOT EXISTS embedding vector(1536)
    `);
    await db.execute(sql`
      ALTER TABLE ingested_assets
      ADD COLUMN IF NOT EXISTS source_name TEXT NOT NULL DEFAULT 'tech_transfer'
    `);
    log("[startup] ingested_assets source_name column ready", "startup");
  } catch (err: any) {
    log(`[startup] pgvector migration skipped or failed: ${err?.message}`, "startup");
  }

  // ── Startup migrations: add enrichment columns to ingested_assets ─────────
  try {
    await db.execute(sql`ALTER TABLE ingested_assets ADD COLUMN IF NOT EXISTS categories JSONB`);
    await db.execute(sql`ALTER TABLE ingested_assets ADD COLUMN IF NOT EXISTS category_confidence REAL`);
    await db.execute(sql`ALTER TABLE ingested_assets ADD COLUMN IF NOT EXISTS available BOOLEAN`);
    await db.execute(sql`ALTER TABLE ingested_assets ADD COLUMN IF NOT EXISTS content_hash TEXT`);
    await db.execute(sql`ALTER TABLE ingested_assets ADD COLUMN IF NOT EXISTS completeness_score REAL`);
    await db.execute(sql`ALTER TABLE ingested_assets ADD COLUMN IF NOT EXISTS last_content_change_at TIMESTAMP`);
    await db.execute(sql`ALTER TABLE ingested_assets ADD COLUMN IF NOT EXISTS innovation_claim TEXT`);
    await db.execute(sql`ALTER TABLE ingested_assets ADD COLUMN IF NOT EXISTS mechanism_of_action TEXT`);
    await db.execute(sql`ALTER TABLE ingested_assets ADD COLUMN IF NOT EXISTS ip_type TEXT`);
    await db.execute(sql`ALTER TABLE ingested_assets ADD COLUMN IF NOT EXISTS unmet_need TEXT`);
    await db.execute(sql`ALTER TABLE ingested_assets ADD COLUMN IF NOT EXISTS comparable_drugs TEXT`);
    await db.execute(sql`ALTER TABLE ingested_assets ADD COLUMN IF NOT EXISTS licensing_readiness TEXT`);
    await db.execute(sql`ALTER TABLE ingested_assets ADD COLUMN IF NOT EXISTS patent_status TEXT`);
    await db.execute(sql`ALTER TABLE ingested_assets ADD COLUMN IF NOT EXISTS licensing_status TEXT`);
    await db.execute(sql`ALTER TABLE ingested_assets ADD COLUMN IF NOT EXISTS inventors JSONB`);
    await db.execute(sql`ALTER TABLE ingested_assets ADD COLUMN IF NOT EXISTS contact_email TEXT`);
    await db.execute(sql`ALTER TABLE ingested_assets ADD COLUMN IF NOT EXISTS technology_id TEXT`);
    await db.execute(sql`ALTER TABLE ingested_assets ADD COLUMN IF NOT EXISTS abstract TEXT`);
    await db.execute(sql`ALTER TABLE ingestion_runs ADD COLUMN IF NOT EXISTS relevant_new_count INTEGER NOT NULL DEFAULT 0`);
    log("[startup] ingested_assets enrichment columns ready", "startup");
  } catch (err: any) {
    log(`[startup] ingested_assets enrichment column migration failed: ${err?.message}`, "startup");
  }

  // ── Startup migrations: saved_assets status column ───────────────────────
  try {
    await db.execute(sql`ALTER TABLE saved_assets ADD COLUMN IF NOT EXISTS status TEXT`);
    await db.execute(sql`
      ALTER TABLE saved_assets
      ADD CONSTRAINT IF NOT EXISTS saved_assets_status_check
      CHECK (status IS NULL OR status IN ('viewing', 'evaluating', 'contacted'))
    `);
    log("[startup] saved_assets status column ready", "startup");
  } catch (err: any) {
    log(`[startup] saved_assets status column migration failed: ${err?.message}`, "startup");
  }

  // ── Startup migrations: near-duplicate detection columns ─────────────────
  try {
    // Column additions are fast — always done synchronously
    await db.execute(sql`ALTER TABLE ingested_assets ADD COLUMN IF NOT EXISTS duplicate_flag BOOLEAN NOT NULL DEFAULT false`);
    await db.execute(sql`ALTER TABLE ingested_assets ADD COLUMN IF NOT EXISTS duplicate_of_id INTEGER`);
    await db.execute(sql`ALTER TABLE ingested_assets ADD COLUMN IF NOT EXISTS dedupe_embedding JSONB`);
    await db.execute(sql`ALTER TABLE ingested_assets ADD COLUMN IF NOT EXISTS dedupe_similarity REAL`);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_ingested_assets_duplicate_flag
      ON ingested_assets (duplicate_flag)
      WHERE duplicate_flag = true
    `);
    log("[startup] near-duplicate detection columns ready", "startup");
    // Dedup + unique index creation is deferred to background — may be slow on large datasets
    // Retried up to 3 times with exponential backoff to guarantee DB-level enforcement
    setImmediate(async () => {
      const MAX_ATTEMPTS = 3;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          // Step 0: Normalize existing source_urls — strip query params and hash fragments.
          // Many TTO sites embed session tokens (?session=abc) or tracking params that
          // change on each scrape. Before dedup reconciliation, collapse these so that
          // /asset?session=1 and /asset?session=2 are treated as the same URL.
          // Two-step: first null out non-canonical rows within each normalized-URL group
          // (to avoid unique-index conflicts), then update survivors to the clean URL.
          await db.execute(sql`
            UPDATE ingested_assets a
            SET source_url = NULL
            FROM (
              SELECT id FROM (
                SELECT id,
                  ROW_NUMBER() OVER (
                    PARTITION BY regexp_replace(source_url, '[?#].*$', '')
                    ORDER BY COALESCE(completeness_score, 0) DESC, id ASC
                  ) AS rn
                FROM ingested_assets
                WHERE source_url IS NOT NULL
                  AND source_url ~ '[?#]'
              ) ranked
              WHERE rn > 1
            ) dups
            WHERE a.id = dups.id
          `);
          await db.execute(sql`
            UPDATE ingested_assets
            SET source_url = regexp_replace(source_url, '[?#].*$', '')
            WHERE source_url IS NOT NULL
              AND source_url ~ '[?#]'
          `);

          // Reconcile duplicate source_urls before creating the unique index.
          // Strategy: for each URL group with duplicates, select the canonical row
          // (highest completeness_score; tie-break by lowest id = oldest/first ingested)
          // and set source_url=NULL on all non-canonical rows. The canonical row retains
          // the URL and will be updated-in-place by future URL-dedup upserts. Non-canonical
          // rows keep all their other fields and remain searchable by fingerprint.
          const reconcileResult = await db.execute(sql`
            UPDATE ingested_assets a
            SET source_url = NULL
            FROM (
              SELECT id FROM (
                SELECT id,
                  ROW_NUMBER() OVER (
                    PARTITION BY source_url
                    ORDER BY COALESCE(completeness_score, 0) DESC, id ASC
                  ) AS rn
                FROM ingested_assets
                WHERE source_url IS NOT NULL
              ) ranked
              WHERE rn > 1
            ) dups
            WHERE a.id = dups.id
          `);
          const reconciled = (reconcileResult as { rowCount?: number }).rowCount ?? 0;
          if (reconciled > 0) {
            console.log(`[startup] source_url reconciliation: cleared URL on ${reconciled} non-canonical duplicate row(s) before unique index creation`);
          }
          await db.execute(sql`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_ingested_assets_source_url_unique
            ON ingested_assets (source_url)
            WHERE source_url IS NOT NULL
          `);
          // Verify the index exists
          const verify = await db.execute(sql`
            SELECT 1 FROM pg_indexes
            WHERE tablename = 'ingested_assets'
              AND indexname = 'idx_ingested_assets_source_url_unique'
          `);
          if (verify.rows.length > 0) {
            log("[startup] source_url unique index ready", "startup");
            break;
          } else {
            throw new Error("index not found after creation");
          }
        } catch (err: any) {
          if (attempt < MAX_ATTEMPTS) {
            const waitMs = 1000 * Math.pow(2, attempt - 1);
            log(`[startup] source_url unique index attempt ${attempt} failed (${err?.message}) — retrying in ${waitMs}ms`, "startup");
            await new Promise((r) => setTimeout(r, waitMs));
          } else {
            log(`[startup] source_url unique index failed after ${MAX_ATTEMPTS} attempts: ${err?.message}`, "startup");
          }
        }
      }
    });
  } catch (err: any) {
    log(`[startup] near-duplicate detection migration failed: ${err?.message}`, "startup");
  }

  // ── industry_profiles column migrations ──────────────────────────────────
  try {
    await db.execute(sql`ALTER TABLE industry_profiles ADD COLUMN IF NOT EXISTS notification_prefs JSONB DEFAULT '{}'`);
  } catch (err: any) {
    log(`[startup] industry_profiles migration failed: ${err?.message}`, "startup");
  }

  // ── Ensure eden_sessions table exists ────────────────────────────────────
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS eden_sessions (
        id serial PRIMARY KEY,
        session_id text NOT NULL UNIQUE,
        messages jsonb NOT NULL DEFAULT '[]'::jsonb,
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.execute(sql`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'eden_sessions' AND column_name = 'turns'
        ) THEN
          ALTER TABLE eden_sessions RENAME COLUMN turns TO messages;
        END IF;
      END $$
    `);
    await db.execute(sql`
      ALTER TABLE eden_sessions ADD COLUMN IF NOT EXISTS focus_context jsonb
    `);
    log("[startup] eden_sessions table ready", "startup");
  } catch (err: any) {
    log(`[startup] eden_sessions migration failed: ${err?.message}`, "startup");
  }

  // ── Ensure eden_message_feedback table exists ─────────────────────────────
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS eden_message_feedback (
        id serial PRIMARY KEY,
        session_id text NOT NULL,
        message_index integer NOT NULL,
        sentiment text NOT NULL,
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS eden_message_feedback_session_msg_uidx
      ON eden_message_feedback(session_id, message_index)
    `);
    log("[startup] eden_message_feedback table ready", "startup");
  } catch (err: any) {
    log(`[startup] eden_message_feedback migration failed: ${err?.message}`, "startup");
  }

  // ── Ensure T007 taxonomy + convergence tables exist ──────────────────────
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS therapy_area_taxonomy (
        id serial PRIMARY KEY,
        name text NOT NULL UNIQUE,
        parent_id integer,
        level integer NOT NULL DEFAULT 0,
        asset_count integer NOT NULL DEFAULT 0,
        last_updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS convergence_signals (
        id serial PRIMARY KEY,
        therapy_area text NOT NULL,
        target_or_mechanism text NOT NULL,
        institution_count integer NOT NULL DEFAULT 0,
        asset_ids jsonb,
        institutions jsonb,
        score real NOT NULL DEFAULT 0,
        detected_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    log("[startup] taxonomy + convergence tables ready", "startup");
  } catch (err: any) {
    log(`[startup] taxonomy migration failed: ${err?.message}`, "startup");
  }

  // ── Ensure review_queue table exists ─────────────────────────────────────
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS review_queue (
        id serial PRIMARY KEY,
        asset_id integer NOT NULL,
        reason text NOT NULL,
        status text NOT NULL DEFAULT 'pending',
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        resolved_at timestamp
      )
    `);
    log("[startup] review_queue table ready", "startup");
  } catch (err: any) {
    log(`[startup] review_queue migration failed: ${err?.message}`, "startup");
  }

  // ── Ensure concept_cards + concept_interests tables exist ─────────────────
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS concept_cards (
        id serial PRIMARY KEY,
        user_id text NOT NULL,
        submitter_name text NOT NULL,
        submitter_affiliation text,
        submitter_email text,
        title text NOT NULL,
        one_liner text NOT NULL,
        hypothesis text,
        problem text NOT NULL,
        proposed_approach text NOT NULL,
        required_expertise text,
        seeking jsonb,
        therapeutic_area text NOT NULL,
        modality text NOT NULL DEFAULT 'unknown',
        stage integer NOT NULL DEFAULT 1,
        credibility_score integer,
        credibility_rationale text,
        interest_collaborating integer NOT NULL DEFAULT 0,
        interest_funding integer NOT NULL DEFAULT 0,
        interest_advising integer NOT NULL DEFAULT 0,
        attached_files jsonb DEFAULT '[]',
        status text NOT NULL DEFAULT 'active',
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS concept_interests (
        id serial PRIMARY KEY,
        concept_id integer NOT NULL,
        user_id text NOT NULL,
        interest_type text NOT NULL,
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    log("[startup] concept_cards + concept_interests tables ready", "startup");
  } catch (err: any) {
    log(`[startup] concept_cards migration failed: ${err?.message}`, "startup");
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS manual_institutions (
        id serial PRIMARY KEY,
        name text NOT NULL UNIQUE,
        tto_url text,
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    log("[startup] manual_institutions table ready", "startup");
  } catch (err: any) {
    log(`[startup] manual_institutions migration failed: ${err?.message}`, "startup");
  }

  // ── Ensure scheduler_state + scraper_health tables exist ─────────────────
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS scheduler_state (
        id INTEGER PRIMARY KEY DEFAULT 1,
        queue_index INTEGER NOT NULL DEFAULT 0,
        cycle_count INTEGER NOT NULL DEFAULT 0,
        cycle_started_at TIMESTAMP,
        completed_this_cycle INTEGER NOT NULL DEFAULT 0,
        failed_this_cycle INTEGER NOT NULL DEFAULT 0,
        last_cycle_completed_at TIMESTAMP,
        scheduler_running BOOLEAN NOT NULL DEFAULT false,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.execute(sql`ALTER TABLE scheduler_state ADD COLUMN IF NOT EXISTS scheduler_running BOOLEAN NOT NULL DEFAULT false`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS scraper_health (
        institution TEXT PRIMARY KEY,
        consecutive_failures INTEGER NOT NULL DEFAULT 0,
        last_failure_reason TEXT,
        last_failure_at TIMESTAMP,
        last_success_at TIMESTAMP,
        backoff_until TIMESTAMP,
        last_success_new_count INTEGER,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.execute(sql`ALTER TABLE scraper_health ADD COLUMN IF NOT EXISTS last_success_new_count INTEGER`);
    log("[startup] scheduler_state + scraper_health tables ready", "startup");
  } catch (err: any) {
    log(`[startup] scheduler_state/scraper_health migration failed: ${err?.message}`, "startup");
  }

  // ── Ensure research_projects + related tables exist ───────────────────────
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS research_projects (
        id serial PRIMARY KEY,
        researcher_id text NOT NULL,
        title text NOT NULL,
        description text,
        research_area text,
        hypothesis text,
        status text NOT NULL DEFAULT 'planning',
        objectives text,
        methodology text,
        target_completion date,
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_edited_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        research_domain text,
        keywords jsonb,
        primary_research_question text,
        scientific_rationale text,
        key_papers jsonb,
        conflicting_evidence text,
        literature_gap text,
        experimental_design text,
        key_technologies jsonb,
        datasets_used jsonb,
        preliminary_data text,
        supporting_evidence_links jsonb,
        confidence_level text,
        potential_applications text,
        industry_relevance text,
        patent_status text,
        startup_potential text,
        project_contributors jsonb,
        open_for_collaboration boolean,
        collaboration_type jsonb,
        funding_status text,
        funding_sources jsonb,
        estimated_budget integer,
        technical_risk text,
        regulatory_risk text,
        key_scientific_unknowns text,
        next_experiments jsonb,
        expected_timeline text,
        success_criteria text,
        discovery_title text,
        discovery_summary text,
        technology_type text,
        development_stage text,
        project_seeking jsonb,
        publish_to_industry boolean,
        admin_status text NOT NULL DEFAULT 'pending',
        project_url text,
        evidence_tables jsonb,
        potential_partners jsonb,
        section4_files jsonb,
        section5_files jsonb,
        section8_files jsonb,
        general_files jsonb,
        hypotheses jsonb DEFAULT '[]'::jsonb,
        fishbone jsonb,
        milestones jsonb DEFAULT '[]'::jsonb,
        pico jsonb,
        protocol_checklist jsonb
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS saved_grants (
        id serial PRIMARY KEY,
        user_id text NOT NULL,
        project_id integer REFERENCES research_projects(id),
        title text NOT NULL,
        url text,
        agency_name text NOT NULL DEFAULT '',
        deadline text,
        amount text,
        notes text,
        status text NOT NULL DEFAULT 'not_started',
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS saved_references (
        id serial PRIMARY KEY,
        user_id text NOT NULL,
        project_id integer REFERENCES research_projects(id),
        title text NOT NULL,
        url text NOT NULL,
        source_type text NOT NULL DEFAULT 'paper',
        date text NOT NULL DEFAULT '',
        institution text NOT NULL DEFAULT '',
        notes text,
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    log("[startup] research_projects + saved_grants + saved_references tables ready", "startup");
  } catch (err: any) {
    log(`[startup] research_projects migration failed: ${err?.message}`, "startup");
  }

  await registerRoutes(httpServer, app);

  // ── Restore scheduler state from DB ──────────────────────────────────────
  // Only auto-resume if the scheduler was actively running when the server last
  // shut down (crash recovery). If it was paused — or there is no saved state —
  // leave it paused so the admin has full control.
  try {
    const wasRunning = await loadAndRestoreScheduler();
    if (wasRunning) {
      const started = startScheduler();
      if (started.ok) {
        log("[startup] Scheduler auto-resumed (was running before restart)", "startup");
      } else {
        log(`[startup] Scheduler resume skipped: ${started.message}`, "startup");
      }
    } else {
      log("[startup] Scheduler paused — press Start in the Admin panel to begin syncing", "startup");
    }
  } catch (err: any) {
    log(`[startup] Scheduler restore failed: ${err?.message}`, "startup");
  }

  // On startup, mark any orphaned "running" ingestion runs as "failed"
  // so the UI never shows a permanent stuck spinner after a server restart
  try {
    const lastRun = await storage.getLastIngestionRun();
    if (lastRun && lastRun.status === "running") {
      await storage.updateIngestionRun(lastRun.id, {
        status: "failed",
        errorMessage: "Server restarted while ingestion was in progress",
      });
      log(`[startup] Cleared orphaned ingestion run #${lastRun.id}`, "startup");
    }
  } catch (err: any) {
    log(`[startup] Could not clear orphaned runs: ${err?.message}`, "startup");
  }

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
