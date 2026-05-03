import { initSentry } from "./lib/sentry";
import * as Sentry from "@sentry/node";
initSentry();

import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { storage } from "./storage";
import { db } from "./db";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { existsSync } from "fs";
import { spawn } from "child_process";
import { loadAndRestoreScheduler, startScheduler, flushSchedulerState } from "./lib/scheduler";
import { reapExpiredMarketAccess, startMarketAccessReaper } from "./lib/marketAccess";
import { startWeeklyRecapScheduler, backfillLatestRecaps } from "./lib/weeklyRecap";
import { sendTrialEndingEmail } from "./email";
import { checkAndSendAlerts } from "./lib/alertMailer";
import pg from "pg";

const app = express();
const httpServer = createServer(app);

// ── Global safety net: prevent unhandled DB pool errors from crashing ─────────
// pg's connection pool emits 'error' on terminated connections. Without a handler
// this kills the process. We log and continue — the pool recovers automatically.
process.on("uncaughtException", (err: Error) => {
  console.error(`[fatal] Uncaught exception (process kept alive): ${err.message}`);
});
process.on("unhandledRejection", (reason: unknown) => {
  console.error(`[fatal] Unhandled rejection (process kept alive):`, reason);
});

// Flush scheduler queue-position to DB before the process exits so a restart
// resumes from the correct institution rather than repeating the full cycle.
async function onShutdownSignal(signal: string) {
  console.log(`[scheduler] ${signal} received — flushing state before exit`);
  try {
    // Race the DB write against a 2500ms safety-net (Supabase/PgBouncer headroom).
    // If flushSchedulerState rejects, the catch branch logs the failure.
    // process.exit(0) always fires via finally regardless of outcome.
    let timedOut = false;
    const timeout = new Promise<void>((resolve) => setTimeout(() => { timedOut = true; resolve(); }, 2500));
    await Promise.race([flushSchedulerState(), timeout]);
    if (timedOut) {
      console.warn(`[scheduler] State flush did not complete within 2500ms on ${signal} — exiting anyway`);
    } else {
      console.log(`[scheduler] State flushed successfully on ${signal}`);
    }
  } catch (err: any) {
    console.warn(`[scheduler] State flush failed on ${signal}: ${err?.message}`);
  } finally {
    process.exit(0);
  }
}
process.on("SIGTERM", async () => { await onShutdownSignal("SIGTERM"); });
process.on("SIGINT", async () => { await onShutdownSignal("SIGINT"); });

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

// ── CORS ──────────────────────────────────────────────────────────────────────
// Allow: any *.replit.app subdomain, localhost/127.0.0.1 for dev, and an
// optional ALLOWED_ORIGIN env var for a custom production domain.
// Explicitly rejects all other origins rather than reflecting them.
app.use(
  cors({
    origin(origin, callback) {
      // Non-browser requests (curl, server-to-server) have no Origin header —
      // allow them so admin scripts and health checks keep working.
      if (!origin) return callback(null, true);

      const allowed =
        /^https:\/\/[a-zA-Z0-9-]+\.replit\.app$/.test(origin) ||
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ||
        (process.env.ALLOWED_ORIGIN ? origin === process.env.ALLOWED_ORIGIN : false);

      if (allowed) return callback(null, true);
      // Return false — cors will send no Allow header and the browser blocks it.
      // Do NOT call callback(new Error(...)) as that logs a noisy 500.
      callback(null, false);
    },
    credentials: true,
  }),
);

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

// ── Ensure sync_staging indexes exist ────────────────────────────────────────
// CREATE INDEX IF NOT EXISTS is idempotent — no-op when the index already exists.
// Retries with exponential backoff so it self-heals once the staging cleanup
// (which runs during each institution sync) has shrunk the table enough.
async function ensureStagingIndexes(attempt = 1): Promise<void> {
  const RETRY_DELAYS = [5 * 60_000, 15 * 60_000, 60 * 60_000]; // 5m, 15m, 1h

  const indexes = [
    {
      name: "sync_staging_institution_status_created_idx",
      ddl: `CREATE INDEX IF NOT EXISTS sync_staging_institution_status_created_idx
            ON sync_staging (institution, status, created_at)`,
    },
    {
      name: "sync_staging_session_fingerprint_idx",
      ddl: `CREATE INDEX IF NOT EXISTS sync_staging_session_fingerprint_idx
            ON sync_staging (session_id, fingerprint)`,
    },
    {
      name: "sync_staging_session_status_idx",
      ddl: `CREATE INDEX IF NOT EXISTS sync_staging_session_status_idx
            ON sync_staging (session_id, status)`,
    },
  ];

  let allOk = true;
  for (const { name, ddl } of indexes) {
    try {
      await db.execute(sql.raw(ddl));
      log(`[startup] Index ready: ${name}`, "startup");
    } catch (err: any) {
      log(`[startup] Index skipped (${name}): ${err?.message}`, "startup");
      allOk = false;
    }
  }

  if (!allOk && attempt <= RETRY_DELAYS.length) {
    const delay = RETRY_DELAYS[attempt - 1];
    log(`[startup] Will retry indexes in ${Math.round(delay / 60000)}m (attempt ${attempt + 1})`, "startup");
    setTimeout(() => {
      ensureStagingIndexes(attempt + 1).catch(() => {});
    }, delay);
  }
}

// ── Batch cleanup for sync_staging + index creation ──────────────────────────
// Full-table UPDATEs on sync_staging always exceed Supabase's 8-second statement
// timeout when the table is large. This function cleans up old enriched-session
// rows in small batches (5 000 rows each). Each batch uses a LIMIT clause so
// PostgreSQL stops scanning after finding N matching rows — fast even without an
// index, because old rows are dense throughout the table.
// After all batches complete it fires ensureStagingIndexes(), which will succeed
// once the table is small enough.
async function batchCleanStagingThenIndex(): Promise<void> {
  const BATCH = 5_000;
  const DELAY_MS = 50;
  let totalDeleted = 0;
  let totalSkipped = 0;

  try {
    // Pass 1 — DELETE old pushed rows (safe: fingerprints live in ingested_assets,
    // not in staging).  No JOIN needed — fast even without indexes.
    while (true) {
      const result = await db.execute(sql`
        DELETE FROM sync_staging
        WHERE id IN (
          SELECT id FROM sync_staging
          WHERE status = 'pushed'
            AND created_at < NOW() - INTERVAL '14 days'
          LIMIT ${BATCH}
        )
      `);
      const deleted = (result as any).rowCount ?? 0;
      totalDeleted += deleted;
      if (deleted < BATCH) break;
      await new Promise(r => setTimeout(r, DELAY_MS));
    }

    // Pass 2 — Mark non-pushed/non-skipped/non-quarantined old rows as skipped.  No JOIN.
    // 'quarantined' rows are excluded so they survive for manual release/discard.
    while (true) {
      const result = await db.execute(sql`
        WITH batch AS (
          SELECT id FROM sync_staging
          WHERE status NOT IN ('pushed', 'skipped', 'quarantined')
            AND created_at < NOW() - INTERVAL '14 days'
          LIMIT ${BATCH}
        )
        UPDATE sync_staging
        SET status = 'skipped'
        FROM batch
        WHERE sync_staging.id = batch.id
      `);
      const updated = (result as any).rowCount ?? 0;
      totalSkipped += updated;
      if (updated < BATCH) break;
      await new Promise(r => setTimeout(r, DELAY_MS));
    }

    const total = totalDeleted + totalSkipped;
    if (total > 0) {
      log(
        `[startup] Batch cleanup complete — deleted ${totalDeleted} pushed rows, skipped ${totalSkipped} stale rows`,
        "startup",
      );
    } else {
      log("[startup] Batch cleanup: no stale staging rows found", "startup");
    }
  } catch (err: any) {
    log(`[startup] Batch cleanup error: ${err?.message}`, "startup");
  }

  // Now that the table is smaller, attempt index creation immediately.
  await ensureStagingIndexes().catch(() => {});
}

// ── All startup migrations in one place, run after port opens ─────────────────
// Uses a DEDICATED pg.Client that is completely separate from the API connection
// pool. This ensures migrations never compete with API requests for pool slots.
async function runStartupMigrations() {
  // All columns and tables already exist in Supabase — skip DDL at startup.
  // Running migrations via the dedicated pg.Client causes Supabase FATAL errors
  // that cascade to the shared pool (PgBouncer rejects backend connections under
  // DDL load). Use `npm run db:push` to apply new schema changes explicitly.
  log("[startup] Skipping startup migrations (use db:push to sync schema)", "startup");
  return;
  const client = new pg.Client({
    connectionString: process.env.SUPABASE_DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  // Prevent pg.Client errors (e.g. Supabase FATAL mid-migration) from
  // propagating as uncaught exceptions. Errors mid-migration are already
  // caught by each individual try/catch block below.
  client.on("error", (err) => {
    log(`[startup] Migration client error (handled): ${err?.message}`, "startup");
  });
  try {
    await client.connect();
  } catch (err: any) {
    log(`[startup] Migration client failed to connect: ${err?.message} — skipping migrations`, "startup");
    return;
  }
  const mdb = drizzle(client);

  try {
  // ── pgvector + source_name column ─────────────────────────────────────────
  try {
    await mdb.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
    await mdb.execute(sql`
      ALTER TABLE ingested_assets
      ADD COLUMN IF NOT EXISTS embedding vector(1536)
    `);
    await mdb.execute(sql`
      ALTER TABLE ingested_assets
      ADD COLUMN IF NOT EXISTS source_name TEXT NOT NULL DEFAULT 'tech_transfer'
    `);
    log("[startup] ingested_assets source_name column ready", "startup");
  } catch (err: any) {
    log(`[startup] pgvector migration skipped or failed: ${err?.message}`, "startup");
  }

  // ── Enrichment columns ────────────────────────────────────────────────────
  try {
    await mdb.execute(sql`ALTER TABLE ingested_assets ADD COLUMN IF NOT EXISTS categories JSONB`);
    await mdb.execute(sql`ALTER TABLE ingested_assets ADD COLUMN IF NOT EXISTS category_confidence REAL`);
    await mdb.execute(sql`ALTER TABLE ingested_assets ADD COLUMN IF NOT EXISTS available BOOLEAN`);
    await mdb.execute(sql`ALTER TABLE ingested_assets ADD COLUMN IF NOT EXISTS content_hash TEXT`);
    await mdb.execute(sql`ALTER TABLE ingested_assets ADD COLUMN IF NOT EXISTS completeness_score REAL`);
    await mdb.execute(sql`ALTER TABLE ingested_assets ADD COLUMN IF NOT EXISTS last_content_change_at TIMESTAMP`);
    await mdb.execute(sql`ALTER TABLE ingested_assets ADD COLUMN IF NOT EXISTS innovation_claim TEXT`);
    await mdb.execute(sql`ALTER TABLE ingested_assets ADD COLUMN IF NOT EXISTS mechanism_of_action TEXT`);
    await mdb.execute(sql`ALTER TABLE ingested_assets ADD COLUMN IF NOT EXISTS ip_type TEXT`);
    await mdb.execute(sql`ALTER TABLE ingested_assets ADD COLUMN IF NOT EXISTS unmet_need TEXT`);
    await mdb.execute(sql`ALTER TABLE ingested_assets ADD COLUMN IF NOT EXISTS comparable_drugs TEXT`);
    await mdb.execute(sql`ALTER TABLE ingested_assets ADD COLUMN IF NOT EXISTS licensing_readiness TEXT`);
    await mdb.execute(sql`ALTER TABLE ingested_assets ADD COLUMN IF NOT EXISTS patent_status TEXT`);
    await mdb.execute(sql`ALTER TABLE ingested_assets ADD COLUMN IF NOT EXISTS licensing_status TEXT`);
    await mdb.execute(sql`ALTER TABLE ingested_assets ADD COLUMN IF NOT EXISTS inventors JSONB`);
    await mdb.execute(sql`ALTER TABLE ingested_assets ADD COLUMN IF NOT EXISTS contact_email TEXT`);
    await mdb.execute(sql`ALTER TABLE ingested_assets ADD COLUMN IF NOT EXISTS technology_id TEXT`);
    await mdb.execute(sql`ALTER TABLE ingested_assets ADD COLUMN IF NOT EXISTS abstract TEXT`);
    await mdb.execute(sql`ALTER TABLE ingestion_runs ADD COLUMN IF NOT EXISTS relevant_new_count INTEGER NOT NULL DEFAULT 0`);
    await mdb.execute(sql`ALTER TABLE ingested_assets ADD COLUMN IF NOT EXISTS deep_enrich_attempts INTEGER NOT NULL DEFAULT 0`);
    log("[startup] ingested_assets enrichment columns ready", "startup");
  } catch (err: any) {
    log(`[startup] ingested_assets enrichment column migration failed: ${err?.message}`, "startup");
  }

  // ── Impersonation tables (Task #736) ──────────────────────────────────────
  try {
    await mdb.execute(sql`
      CREATE TABLE IF NOT EXISTS impersonation_sessions (
        id              SERIAL PRIMARY KEY,
        admin_id        TEXT NOT NULL,
        admin_email     TEXT NOT NULL,
        target_user_id  TEXT NOT NULL,
        target_email    TEXT NOT NULL,
        target_role     TEXT,
        read_only       BOOLEAN NOT NULL DEFAULT TRUE,
        started_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        ended_at        TIMESTAMP,
        ended_reason    TEXT,
        action_count    INTEGER NOT NULL DEFAULT 0,
        last_activity_at TIMESTAMP
      )
    `);
    await mdb.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_impersonation_sessions_active
      ON impersonation_sessions (admin_id) WHERE ended_at IS NULL
    `);
    await mdb.execute(sql`
      CREATE TABLE IF NOT EXISTS impersonation_audit_events (
        id           SERIAL PRIMARY KEY,
        session_id   INTEGER NOT NULL,
        method       TEXT NOT NULL,
        route        TEXT NOT NULL,
        status_code  INTEGER NOT NULL,
        blocked      BOOLEAN NOT NULL DEFAULT FALSE,
        created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `);
    await mdb.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_impersonation_audit_session
      ON impersonation_audit_events (session_id, created_at DESC)
    `);
    log("[startup] impersonation tables ready", "startup");
  } catch (err: any) {
    log(`[startup] impersonation table migration failed: ${err?.message}`, "startup");
  }

  // ── saved_assets status column ────────────────────────────────────────────
  try {
    await mdb.execute(sql`ALTER TABLE saved_assets ADD COLUMN IF NOT EXISTS status TEXT`);
    await mdb.execute(sql`
      DO $$ BEGIN
        ALTER TABLE saved_assets
        ADD CONSTRAINT saved_assets_status_check
        CHECK (status IS NULL OR status IN ('viewing', 'evaluating', 'contacted'));
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
    log("[startup] saved_assets status column ready", "startup");
  } catch (err: any) {
    log(`[startup] saved_assets status column migration failed: ${err?.message}`, "startup");
  }

  // ── Stripe billing date columns ───────────────────────────────────────────
  try {
    await mdb.execute(sql`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS stripe_current_period_end TIMESTAMP`);
    await mdb.execute(sql`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS stripe_cancel_at TIMESTAMP`);
    log("[startup] organizations stripe billing date columns ready", "startup");
  } catch (err: any) {
    log(`[startup] organizations stripe billing date column migration failed: ${err?.message}`, "startup");
  }

  // ── Near-duplicate detection columns ─────────────────────────────────────
  try {
    await mdb.execute(sql`ALTER TABLE ingested_assets ADD COLUMN IF NOT EXISTS duplicate_flag BOOLEAN NOT NULL DEFAULT false`);
    await mdb.execute(sql`ALTER TABLE ingested_assets ADD COLUMN IF NOT EXISTS duplicate_of_id INTEGER`);
    await mdb.execute(sql`ALTER TABLE ingested_assets ADD COLUMN IF NOT EXISTS dedupe_embedding JSONB`);
    await mdb.execute(sql`ALTER TABLE ingested_assets ADD COLUMN IF NOT EXISTS dedupe_similarity REAL`);
    await mdb.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_ingested_assets_duplicate_flag
      ON ingested_assets (duplicate_flag)
      WHERE duplicate_flag = true
    `);
    log("[startup] near-duplicate detection columns ready", "startup");
    // Heavy dedup queries deferred so they don't compete with API traffic at startup.
    // They use the shared pool (db) since the dedicated migration client is closed by then.
    // Idempotency guard: if the unique index already exists the cleanup was done on a
    // previous run — skip the expensive full-table scans entirely.
    setTimeout(async () => {
      try {
        const alreadyDone = await db.execute(sql`
          SELECT 1 FROM pg_indexes
          WHERE tablename = 'ingested_assets'
            AND indexname = 'idx_ingested_assets_source_url_unique'
        `);
        if (alreadyDone.rows.length > 0) {
          log("[startup] source_url unique index already exists — skipping reconciliation", "startup");
          return;
        }
      } catch (_) { /* continue to full migration if probe fails */ }

      const MAX_ATTEMPTS = 3;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
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
    }, 60_000);
  } catch (err: any) {
    log(`[startup] near-duplicate detection migration failed: ${err?.message}`, "startup");
  }

  // ── industry_profiles column ──────────────────────────────────────────────
  try {
    await mdb.execute(sql`ALTER TABLE industry_profiles ADD COLUMN IF NOT EXISTS notification_prefs JSONB DEFAULT '{}'`);
  } catch (err: any) {
    log(`[startup] industry_profiles migration failed: ${err?.message}`, "startup");
  }

  // ── eden_sessions ─────────────────────────────────────────────────────────
  try {
    await mdb.execute(sql`
      CREATE TABLE IF NOT EXISTS eden_sessions (
        id serial PRIMARY KEY,
        session_id text NOT NULL UNIQUE,
        messages jsonb NOT NULL DEFAULT '[]'::jsonb,
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await mdb.execute(sql`
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
    await mdb.execute(sql`
      ALTER TABLE eden_sessions ADD COLUMN IF NOT EXISTS focus_context jsonb
    `);
    log("[startup] eden_sessions table ready", "startup");
  } catch (err: any) {
    log(`[startup] eden_sessions migration failed: ${err?.message}`, "startup");
  }

  // ── eden_message_feedback ─────────────────────────────────────────────────
  try {
    await mdb.execute(sql`
      CREATE TABLE IF NOT EXISTS eden_message_feedback (
        id serial PRIMARY KEY,
        session_id text NOT NULL,
        message_index integer NOT NULL,
        sentiment text NOT NULL,
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await mdb.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS eden_message_feedback_session_msg_uidx
      ON eden_message_feedback(session_id, message_index)
    `);
    log("[startup] eden_message_feedback table ready", "startup");
  } catch (err: any) {
    log(`[startup] eden_message_feedback migration failed: ${err?.message}`, "startup");
  }

  // ── taxonomy + convergence tables ────────────────────────────────────────
  try {
    await mdb.execute(sql`
      CREATE TABLE IF NOT EXISTS therapy_area_taxonomy (
        id serial PRIMARY KEY,
        name text NOT NULL UNIQUE,
        parent_id integer,
        level integer NOT NULL DEFAULT 0,
        asset_count integer NOT NULL DEFAULT 0,
        last_updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await mdb.execute(sql`
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

  // ── review_queue ──────────────────────────────────────────────────────────
  try {
    await mdb.execute(sql`
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

  // ── concept_cards + concept_interests ─────────────────────────────────────
  try {
    await mdb.execute(sql`
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
    await mdb.execute(sql`
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

  // ── manual_institutions ───────────────────────────────────────────────────
  try {
    await mdb.execute(sql`
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

  // ── scheduler_state + scraper_health ─────────────────────────────────────
  try {
    await mdb.execute(sql`
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
    await mdb.execute(sql`ALTER TABLE scheduler_state ADD COLUMN IF NOT EXISTS scheduler_running BOOLEAN NOT NULL DEFAULT false`);
    await mdb.execute(sql`
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
    await mdb.execute(sql`ALTER TABLE scraper_health ADD COLUMN IF NOT EXISTS last_success_new_count INTEGER`);
    await mdb.execute(sql`ALTER TABLE scraper_health ADD COLUMN IF NOT EXISTS last_success_raw_count INTEGER`);
    log("[startup] scheduler_state + scraper_health tables ready", "startup");
  } catch (err: any) {
    log(`[startup] scheduler_state/scraper_health migration failed: ${err?.message}`, "startup");
  }

  // ── research_projects + saved_grants + saved_references ──────────────────
  try {
    await mdb.execute(sql`
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
    await mdb.execute(sql`
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
    await mdb.execute(sql`
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
    await mdb.execute(sql`ALTER TABLE research_projects ADD COLUMN IF NOT EXISTS admin_note TEXT`);
    log("[startup] research_projects + saved_grants + saved_references tables ready", "startup");
  } catch (err: any) {
    log(`[startup] research_projects migration failed: ${err?.message}`, "startup");
  }

  // ── user_alerts: last_alert_sent_at column ────────────────────────────────
  try {
    await client.query(`ALTER TABLE user_alerts ADD COLUMN IF NOT EXISTS last_alert_sent_at TIMESTAMP`);
    log("[startup] user_alerts last_alert_sent_at column ready", "startup");
  } catch (err: any) {
    log(`[startup] user_alerts migration failed: ${err?.message}`, "startup");
  }

  // ── industry_profiles: last_viewed_alerts_at column ───────────────────────
  try {
    await client.query(`ALTER TABLE industry_profiles ADD COLUMN IF NOT EXISTS last_viewed_alerts_at TIMESTAMP`);
    log("[startup] industry_profiles last_viewed_alerts_at column ready", "startup");
  } catch (err: any) {
    log(`[startup] industry_profiles last_viewed_alerts_at migration failed: ${err?.message}`, "startup");
  }

  } finally {
    // Always close the dedicated migration client, even if a migration throws
    await client.end().catch(() => {});
  }

}

// ── Post-startup tasks: scheduler restore + orphaned run cleanup ──────────────
// Extracted from runStartupMigrations() so they always run even when migrations
// are skipped (early return).
async function runPostStartupTasks(): Promise<void> {
  // ── Incremental scraper_health schema upgrades ────────────────────────────
  // Always runs regardless of migration skip flag; safe to run on every boot.
  try {
    await db.execute(sql`ALTER TABLE scraper_health ADD COLUMN IF NOT EXISTS last_success_raw_count INTEGER`);
  } catch (_) { /* column may already exist — safe to ignore */ }

  // ── Scheduler restore ─────────────────────────────────────────────────────
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

  // ── EdenMarket access reaper (Task #732) ─────────────────────────────────
  // One-time backfill at boot for any orgs that drifted (their grace period
  // expired but the boolean is still true), then start a 24h interval so any
  // org whose grace lapses going forward gets cleaned up within a day.
  // Backfill and recurring start are decoupled — a backfill failure must
  // never prevent the periodic reaper from running.
  try {
    const revoked = await reapExpiredMarketAccess("startup");
    if (revoked > 0) {
      log(`[startup] EdenMarket reaper revoked ${revoked} expired org(s) at boot`, "startup");
    }
  } catch (err: any) {
    log(`[startup] EdenMarket reaper backfill failed: ${err?.message}`, "startup");
  }
  try {
    startMarketAccessReaper();
  } catch (err: any) {
    log(`[startup] EdenMarket reaper interval failed to start: ${err?.message}`, "startup");
  }

  // ── Weekly Recap (Task #738) ─────────────────────────────────────────────
  // Idempotent CREATE TABLE so the recap routes work on fresh deploys before
  // db:push has run. Then backfill the last completed week for every org so
  // the dashboard button is immediately useful, and start the hourly tick
  // that fires the freeze job on Mondays.
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS weekly_recaps (
        id              SERIAL PRIMARY KEY,
        org_id          INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        week_start_date TIMESTAMP NOT NULL,
        payload         JSONB NOT NULL,
        frozen          BOOLEAN NOT NULL DEFAULT FALSE,
        generated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (org_id, week_start_date)
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS weekly_recaps_org_idx ON weekly_recaps (org_id, week_start_date DESC)`);
    log("[startup] weekly_recaps table ensured", "startup");
  } catch (err: any) {
    log(`[startup] weekly_recaps table check: ${err?.message}`, "startup");
  }
  try {
    const result = await backfillLatestRecaps();
    if (result.created > 0) {
      log(`[startup] Weekly Recap backfill wrote ${result.created} recap(s) across ${result.orgsProcessed} org(s)`, "startup");
    }
  } catch (err: any) {
    log(`[startup] Weekly Recap backfill failed: ${err?.message}`, "startup");
  }
  try {
    startWeeklyRecapScheduler();
  } catch (err: any) {
    log(`[startup] Weekly Recap scheduler failed to start: ${err?.message}`, "startup");
  }

  // ── Clear orphaned ingestion runs ─────────────────────────────────────────
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

  // ── One-time startup quarantine for UC Berkeley + UC San Diego ────────────
  // The 2025-03-31 URL format change (NCD/Detail?NCDId=XXX → NCD/XXXXX.html)
  // caused ~262 UCB and ~450 UCSD staging rows to be flagged as new assets
  // when they are actually already indexed. We quarantine them so they cannot
  // be pushed until explicitly reviewed and released or discarded.
  // The idempotency guard: if no quarantinable rows exist, the function returns 0.
  for (const institution of ["UC Berkeley", "UC San Diego"]) {
    try {
      const n = await storage.quarantineNewStagingRows(institution);
      if (n > 0) {
        log(`[startup] Auto-quarantined ${n} false-new staging row(s) for ${institution}`, "startup");
      }
    } catch (err: any) {
      log(`[startup] Auto-quarantine skipped for ${institution}: ${err?.message}`, "startup");
    }
  }
}

// ── Ensure institution_metadata table exists + is seeded (Task #729) ─────────
// Idempotent: runs every boot. Created here (not in runStartupMigrations,
// which is currently a no-op) so it survives any environment where db:push
// was not run manually. Seeds from server/lib/institutionSeed only when the
// table is empty — subsequent boots are a single SELECT count(*).
async function ensureInstitutionMetadataTable() {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS institution_metadata (
        slug text PRIMARY KEY,
        name text NOT NULL,
        city text,
        tto_name text,
        website text,
        specialties jsonb NOT NULL DEFAULT '[]'::jsonb,
        continent text,
        no_public_portal boolean NOT NULL DEFAULT false,
        access_restricted boolean NOT NULL DEFAULT false
      )
    `);
    const existing = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM institution_metadata`,
    );
    const existingCount = existing.rows[0]?.n ?? 0;
    if (existingCount === 0) {
      const { INSTITUTIONS, BLOCKED_SLUGS } = await import("./lib/institutionSeed");
      for (const inst of INSTITUTIONS) {
        await db.execute(sql`
          INSERT INTO institution_metadata
            (slug, name, city, tto_name, website, specialties, continent, no_public_portal, access_restricted)
          VALUES (
            ${inst.slug}, ${inst.name}, ${inst.city}, ${inst.ttoName}, ${inst.website},
            ${JSON.stringify(inst.specialties ?? [])}::jsonb,
            ${inst.continent ?? null},
            ${inst.noPublicPortal === true},
            ${BLOCKED_SLUGS.has(inst.slug)}
          )
          ON CONFLICT (slug) DO NOTHING
        `);
      }
      log(`[startup] institution_metadata seeded ${INSTITUTIONS.length} rows`, "startup");
    } else {
      log(`[startup] institution_metadata table ready (${existingCount} rows)`, "startup");
    }
  } catch (err: any) {
    log(`[startup] institution_metadata table check: ${err?.message}`, "startup");
  }
}

// ── Ensure saved_asset_notes table exists ─────────────────────────────────────
// Created here (idempotent CREATE TABLE IF NOT EXISTS) so it survives any
// environment where db:push was not run manually (e.g. fresh deploys).
async function createSavedAssetNotesTable() {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS saved_asset_notes (
        id          SERIAL PRIMARY KEY,
        saved_asset_id INTEGER NOT NULL REFERENCES saved_assets(id) ON DELETE CASCADE,
        user_id     TEXT,
        author_name TEXT NOT NULL DEFAULT 'Unknown',
        content     TEXT NOT NULL,
        is_system_event BOOLEAN NOT NULL DEFAULT FALSE,
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS saved_asset_notes_asset_created_idx
        ON saved_asset_notes (saved_asset_id, created_at)
    `);
    log("[startup] saved_asset_notes table ensured", "startup");
  } catch (err: any) {
    log(`[startup] saved_asset_notes table check: ${err?.message}`, "startup");
  }
}

// ── Ensure stripe_billing_events table exists ─────────────────────────────────
async function createStripeBillingEventsTable() {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS stripe_billing_events (
        id                    SERIAL PRIMARY KEY,
        org_id                INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        stripe_subscription_id TEXT,
        event_type            TEXT NOT NULL,
        old_price_id          TEXT,
        new_price_id          TEXT,
        old_plan_tier         TEXT,
        new_plan_tier         TEXT,
        stripe_status         TEXT,
        amount_cents          INTEGER,
        currency              TEXT,
        created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `);
    await db.execute(sql`ALTER TABLE stripe_billing_events ADD COLUMN IF NOT EXISTS amount_cents INTEGER`);
    await db.execute(sql`ALTER TABLE stripe_billing_events ADD COLUMN IF NOT EXISTS currency TEXT`);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS stripe_billing_events_org_created_idx
        ON stripe_billing_events (org_id, created_at DESC)
    `);
    log("[startup] stripe_billing_events table ensured", "startup");
  } catch (err: any) {
    log(`[startup] stripe_billing_events table check: ${err?.message}`, "startup");
  }
}

// ── Ensure user_alerts table exists ───────────────────────────────────────────
// Critical for the digest/alert pipeline. Created idempotently so it survives
// fresh deploys where db:push may not have been run yet.
async function createUserAlertsTable() {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS user_alerts (
        id              SERIAL PRIMARY KEY,
        user_id         TEXT,
        name            TEXT,
        query           TEXT,
        modalities      TEXT[],
        stages          TEXT[],
        institutions    TEXT[],
        created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_alert_sent_at TIMESTAMP
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS user_alerts_user_id_idx ON user_alerts (user_id)
    `);
    log("[startup] user_alerts table ensured", "startup");
  } catch (err: any) {
    log(`[startup] user_alerts table check: ${err?.message}`, "startup");
  }
}

// ── Backfill industry_profiles for Supabase digest subscribers ────────────────
// The alertMailer reads subscribed_to_digest from industry_profiles (local DB),
// but the toggle can be set in Supabase user_metadata without syncing here.
// On every boot, we upsert a minimal industry_profiles row for every Supabase
// user who has subscribedToDigest=true so the mailer can always see them.
async function syncSubscribersFromSupabase() {
  const sbUrl = process.env.VITE_SUPABASE_URL ?? "";
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!sbUrl || !sbKey) {
    log("[startup] Supabase not configured — skipping subscriber backfill", "startup");
    return;
  }
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const admin = createClient(sbUrl, sbKey);
    let page = 1;
    let synced = 0;
    while (true) {
      const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000, page });
      if (error) {
        log(`[startup] Supabase subscriber backfill error: ${error.message}`, "startup");
        break;
      }
      const users = data?.users ?? [];
      let failed = 0;
      for (const u of users) {
        if (u.user_metadata?.subscribedToDigest === true) {
          try {
            await storage.setIndustryProfileSubscription(u.id, true);
            synced++;
          } catch (uErr: any) {
            failed++;
            log(`[startup] Subscriber backfill failed for ${u.id}: ${uErr?.message}`, "startup");
          }
        }
      }
      if (failed > 0) {
        log(`[startup] Subscriber backfill: ${failed} user(s) could not be synced — check logs above`, "startup");
      }
      if (users.length < 1000) break;
      page++;
    }
    if (synced > 0) {
      log(`[startup] Backfilled ${synced} digest subscriber(s) into industry_profiles`, "startup");
    }
  } catch (err: any) {
    log(`[startup] Subscriber backfill failed: ${err?.message}`, "startup");
  }
}

// ── Ensure shared_links table exists ──────────────────────────────────────────
async function createSharedLinksTable() {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS shared_links (
        id           SERIAL PRIMARY KEY,
        token        UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
        type         TEXT NOT NULL,
        entity_id    TEXT,
        payload      JSONB NOT NULL,
        created_by   TEXT,
        expires_at   TIMESTAMP NOT NULL,
        password_hash TEXT,
        created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `);
    log("[startup] shared_links table ensured", "startup");
  } catch (err: any) {
    log(`[startup] shared_links table check: ${err?.message}`, "startup");
  }
}

// Human-readable plan name mapping for trial reminder emails
function planTierLabel(tier: string | null | undefined): string {
  switch (tier) {
    case "individual": return "Individual";
    case "team5":      return "Team (5 seats)";
    case "team10":     return "Team (10 seats)";
    case "enterprise": return "Enterprise";
    default:           return tier ?? "EdenScout";
  }
}

// ── Trial-ending reminder emails (runs every 6h, sends when trial ends within 25h) ──
async function checkAndSendTrialReminders() {
  try {
    // Atomic claim: UPDATE … RETURNING stamps trialReminderSentAt before we read results,
    // so concurrent workers skip the same orgs even without row-level locking.
    const orgs = await storage.claimOrgsForTrialReminder(25);
    if (orgs.length === 0) return;

    const sbUrl = process.env.VITE_SUPABASE_URL ?? "";
    const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    let admin: Awaited<ReturnType<typeof import("@supabase/supabase-js").createClient>> | null = null;
    if (sbUrl && sbKey) {
      try {
        const { createClient } = await import("@supabase/supabase-js");
        admin = createClient(sbUrl, sbKey);
      } catch { /* no-op */ }
    }

    for (const org of orgs) {
      let sent = false;
      try {
        // Resolve recipient email: prefer org owner's Supabase auth email, fall back to billingEmail
        let recipientEmail: string | null = org.billingEmail ?? null;
        if (admin) {
          try {
            const ownerRow = await db.execute(sql`
              SELECT user_id FROM org_members
              WHERE org_id = ${org.id} AND role = 'owner'
              LIMIT 1
            `);
            const ownerRows = (ownerRow as any).rows ?? ownerRow;
            const ownerId: string | undefined = ownerRows[0]?.user_id;
            if (ownerId) {
              const { data: userData } = await admin.auth.admin.getUserById(ownerId);
              const ownerEmail: string | undefined = userData?.user?.email;
              if (ownerEmail) recipientEmail = ownerEmail;
            }
          } catch (lookupErr: any) {
            log(`[trial-reminder] Could not resolve owner email for org ${org.id}: ${lookupErr?.message}`, "startup");
          }
        }
        if (!recipientEmail) {
          log(`[trial-reminder] No email for org ${org.id} — skipping`, "startup");
          // Release claim so we retry if email becomes available later
          await storage.updateOrganization(org.id, { trialReminderSentAt: null });
          continue;
        }
        const trialEndDate = new Date(org.stripeCurrentPeriodEnd!).toLocaleDateString("en-US", {
          year: "numeric", month: "long", day: "numeric",
        });
        const portalUrl = `${process.env.APP_URL ?? "https://edenradar.com"}/industry/settings`;
        const planName = planTierLabel(org.planTier);
        await sendTrialEndingEmail(recipientEmail, org.name ?? "", trialEndDate, portalUrl, planName);
        sent = true;
        log(`[trial-reminder] Sent trial-ending email to ${recipientEmail} (org ${org.id}, plan: ${planName}, ends ${trialEndDate})`, "startup");
      } catch (orgErr: any) {
        log(`[trial-reminder] Failed for org ${org.id}: ${orgErr?.message}`, "startup");
      } finally {
        // If send was not confirmed, release the claim so the next run retries
        if (!sent) {
          try {
            await storage.updateOrganization(org.id, { trialReminderSentAt: null });
          } catch (releaseErr: any) {
            log(`[trial-reminder] Could not release claim for org ${org.id}: ${releaseErr?.message}`, "startup");
          }
        }
      }
    }
  } catch (err: any) {
    log(`[trial-reminder] Error running trial reminder check: ${err?.message}`, "startup");
  }
}

function scheduleTrialReminderCheck() {
  setTimeout(() => {
    checkAndSendTrialReminders();
    setInterval(() => checkAndSendTrialReminders(), 6 * 60 * 60 * 1000);
  }, 10_000);
}

// ── Periodic alert-mailer evaluation (Task #687) ─────────────────────────────
// In addition to firing at scheduler-cycle completion (~70-min cycles), evaluate
// alerts on a short cadence so realtime subscribers receive new assets within
// ~5 minutes of firstSeenAt. The isEvaluating guard inside checkAndSendAlerts
// prevents concurrent runs; the lastAlertSentAt watermark prevents double-sends.
// ── Weekly relevance-metrics aggregation (Task #694) ──────────────────────────
function scheduleRelevanceMetricsAggregation() {
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  setTimeout(async () => {
    try {
      const lastAt = await storage.getLastRelevanceMetricsAt();
      const stale = !lastAt || Date.now() - lastAt.getTime() > WEEK_MS;
      if (stale) {
        const r = await storage.computeRelevanceMetrics(7);
        log(`[relevance] Initial metrics aggregation: ${r.inserted} rows`, "startup");
      }
    } catch (err: any) {
      log(`[relevance] Initial aggregation failed: ${err?.message}`, "startup");
    }
    setInterval(async () => {
      try {
        const r = await storage.computeRelevanceMetrics(7);
        log(`[relevance] Weekly metrics aggregation: ${r.inserted} rows`, "startup");
      } catch (err: any) {
        log(`[relevance] Weekly aggregation failed: ${err?.message}`, "startup");
      }
    }, WEEK_MS);
  }, 60_000);
}

function schedulePeriodicAlertCheck() {
  const intervalMin = Math.max(2, Number(process.env.ALERT_EVAL_INTERVAL_MIN ?? 5));
  const intervalMs = intervalMin * 60 * 1000;
  log(`[alertMailer] Periodic evaluation every ${intervalMin} min`, "startup");
  setTimeout(() => {
    checkAndSendAlerts().catch((err: any) =>
      log(`[alertMailer] Periodic check failed: ${err?.message}`, "startup"));
    setInterval(() => {
      checkAndSendAlerts().catch((err: any) =>
        log(`[alertMailer] Periodic check failed: ${err?.message}`, "startup"));
    }, intervalMs);
  }, 30_000);
}

// ── Scout FTS + trigram indexes (Task #760, Tier 1) ──────────────────────────
// Replaces the brute-force `LIKE '%token%'` keyword search in
// keywordSearchIngestedAssets() with Postgres full-text search. Adds:
//   - pg_trgm extension for fuzzy/typo matching
//   - search_tsv generated tsvector column with field weighting
//       A = asset_name, B = target/indication/MoA, C = summary/innovation/etc, D = institution/categories
//   - GIN index on search_tsv (FTS uses index, no sequential scan)
//   - GIN trigram index on LOWER(asset_name) for typo tolerance
// All idempotent — safe to run on every boot.
declare global {
  // eslint-disable-next-line no-var
  var __pgTrgmAvailable: boolean | undefined;
  // eslint-disable-next-line no-var
  var __searchTsvAvailable: boolean | undefined;
}

async function ensureScoutSearchIndexes() {
  // Conservative defaults: capability flags only flip true after a successful
  // probe / DDL. Requests racing ahead of these checks degrade gracefully
  // rather than emit failing operators.
  globalThis.__pgTrgmAvailable = false;
  globalThis.__searchTsvAvailable = false;

  // ── FTS path ─────────────────────────────────────────────────────────────
  // Independent of pg_trgm so a managed DB that disallows the trigram
  // extension still gets full FTS (stemming, phrases, AND/OR, negation).
  try {
    await db.execute(sql`
      ALTER TABLE ingested_assets
      ADD COLUMN IF NOT EXISTS search_tsv tsvector
      GENERATED ALWAYS AS (
        setweight(to_tsvector('english', COALESCE(asset_name, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(target, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(indication, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(mechanism_of_action, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(summary, '')), 'C') ||
        setweight(to_tsvector('english', COALESCE(innovation_claim, '')), 'C') ||
        setweight(to_tsvector('english', COALESCE(unmet_need, '')), 'C') ||
        setweight(to_tsvector('english', COALESCE(comparable_drugs, '')), 'C') ||
        setweight(to_tsvector('english', COALESCE(abstract, '')), 'C') ||
        setweight(to_tsvector('english', COALESCE(institution, '')), 'D') ||
        setweight(to_tsvector('english', COALESCE(categories::text, '')), 'D')
      ) STORED
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS ingested_assets_search_tsv_idx
      ON ingested_assets USING GIN (search_tsv)
    `);
    globalThis.__searchTsvAvailable = true;
    log("[startup] scout search FTS index ensured", "startup");
  } catch (err: any) {
    log(`[startup] scout search FTS ensure failed — FTS disabled, falling back to exact-name + structured filters: ${err?.message}`, "startup");
  }

  // ── Trigram path (independent) ────────────────────────────────────────────
  try {
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
  } catch (err: any) {
    log(`[startup] pg_trgm extension skipped: ${err?.message}`, "startup");
  }
  try {
    await db.execute(sql`SELECT 'a' <% 'abc'`);
    try {
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS ingested_assets_asset_name_trgm_idx
        ON ingested_assets USING GIN (LOWER(asset_name) gin_trgm_ops)
      `);
    } catch (err: any) {
      log(`[startup] pg_trgm GIN index create skipped: ${err?.message}`, "startup");
    }
    globalThis.__pgTrgmAvailable = true;
    log("[startup] pg_trgm operators available — fuzzy fallback enabled", "startup");
  } catch (err: any) {
    log(`[startup] pg_trgm operators unavailable — fuzzy fallback disabled: ${err?.message}`, "startup");
  }
}

// ── Index for alert-matching query (Task #687) ───────────────────────────────
// alertMailer's matchAssetsForAlert filters on (firstSeenAt > since AND relevant = true).
// At 5-min cadence with growing alert/asset volume, this needs an index to stay fast.
async function ensureAlertMatchIndex() {
  try {
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS ingested_assets_first_seen_relevant_idx
      ON ingested_assets(first_seen_at DESC, relevant)
      WHERE relevant = true
    `);
    log("[startup] ingested_assets first_seen/relevant index ensured", "startup");
  } catch (err: any) {
    log(`[startup] ingested_assets index check: ${err?.message}`, "startup");
  }
}

// ── Ensure organizations.trial_reminder_sent_at column exists ─────────────────
async function addTrialReminderSentAtColumn() {
  try {
    await db.execute(sql`
      ALTER TABLE organizations
        ADD COLUMN IF NOT EXISTS trial_reminder_sent_at TIMESTAMP
    `);
    log("[startup] organizations.trial_reminder_sent_at column ensured", "startup");
  } catch (err: any) {
    log(`[startup] trial_reminder_sent_at column check: ${err?.message}`, "startup");
  }
}

// ── Ensure team_activities.asset_fingerprint column exists + backfill ────────
async function addTeamActivityFingerprintColumn() {
  try {
    await db.execute(sql`
      ALTER TABLE team_activities
        ADD COLUMN IF NOT EXISTS asset_fingerprint TEXT
    `);
    // Drop NOT NULL on org_id so individual / no-org users get logged too.
    await db.execute(sql`
      ALTER TABLE team_activities
        ALTER COLUMN org_id DROP NOT NULL
    `);
    log("[startup] team_activities.asset_fingerprint column ensured (org_id nullable)", "startup");
    // Backfill is done in two passes, both gated on asset_name matching to
    // avoid false ID-collision matches between saved_assets.id and
    // ingested_assets.id (overlapping serial PK spaces).
    // Pass 1: saved_assets path (legacy callsites passed saved_assets.id).
    await db.execute(sql`
      UPDATE team_activities ta
      SET asset_fingerprint = ia.fingerprint
      FROM saved_assets sa
      JOIN ingested_assets ia ON ia.id = sa.ingested_asset_id
      WHERE ta.asset_fingerprint IS NULL
        AND ta.asset_id = sa.id
        AND LOWER(TRIM(ia.asset_name)) = LOWER(TRIM(ta.asset_name))
    `);
    // Pass 2: direct ingested_assets path (current callsites pass
    // saved_assets.ingestedAssetId, i.e. ingested_assets.id).
    await db.execute(sql`
      UPDATE team_activities ta
      SET asset_fingerprint = ia.fingerprint
      FROM ingested_assets ia
      WHERE ta.asset_fingerprint IS NULL
        AND ta.asset_id = ia.id
        AND LOWER(TRIM(ia.asset_name)) = LOWER(TRIM(ta.asset_name))
    `);
  } catch (err: any) {
    log(`[startup] team_activities.asset_fingerprint check: ${err?.message}`, "startup");
  }
}

// ── Ensure saved_reports table exists ─────────────────────────────────────────
async function createSavedReportsTable() {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS saved_reports (
        id          SERIAL PRIMARY KEY,
        user_id     TEXT NOT NULL,
        title       TEXT NOT NULL,
        query       TEXT NOT NULL,
        assets_json JSONB NOT NULL DEFAULT '[]'::jsonb,
        report_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at  TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    log("[startup] saved_reports table ensured", "startup");
  } catch (err: any) {
    log(`[startup] saved_reports table check: ${err?.message}`, "startup");
  }
}

// ── Ensure export_logs table exists (cloud export audit log) ──────────────────
async function createExportLogsTable() {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS export_logs (
        id              SERIAL PRIMARY KEY,
        filename        TEXT NOT NULL,
        destination     TEXT NOT NULL,
        file_type       TEXT NOT NULL DEFAULT 'document',
        exported_by     TEXT,
        share_url       TEXT,
        success         BOOLEAN NOT NULL DEFAULT TRUE,
        error_message   TEXT,
        exported_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS export_logs_exported_at_idx ON export_logs (exported_at DESC)
    `);
    log("[startup] export_logs table ensured", "startup");
  } catch (err: any) {
    log(`[startup] export_logs table check: ${err?.message}`, "startup");
  }
}

// ── Ensure market_deals tables exist ──────────────────────────────────────────
async function createMarketDealsTables() {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS market_deals (
        id                      SERIAL PRIMARY KEY,
        listing_id              INTEGER NOT NULL REFERENCES market_listings(id) ON DELETE CASCADE,
        eoi_id                  INTEGER NOT NULL REFERENCES market_eois(id) ON DELETE CASCADE,
        seller_id               TEXT NOT NULL,
        buyer_id                TEXT NOT NULL,
        status                  TEXT NOT NULL DEFAULT 'nda_pending',
        status_history          JSONB NOT NULL DEFAULT '[]',
        seller_signed_at        TIMESTAMP,
        seller_signed_name      TEXT,
        buyer_signed_at         TIMESTAMP,
        buyer_signed_name       TEXT,
        nda_signed_at           TIMESTAMP,
        nda_document_path       TEXT,
        success_fee_invoice_id  TEXT,
        success_fee_deal_size_m INTEGER,
        success_fee_amount      INTEGER,
        created_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // Add new columns if they don't exist (for existing tables)
    await db.execute(sql`ALTER TABLE market_deals ADD COLUMN IF NOT EXISTS status_history JSONB NOT NULL DEFAULT '[]'`);
    await db.execute(sql`ALTER TABLE market_deals ADD COLUMN IF NOT EXISTS nda_document_path TEXT`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS market_deals_eoi_id_unique ON market_deals(eoi_id)`);
    // EdenScout linkage — allow sellers to link a listing to an ingested_assets record
    await db.execute(sql`ALTER TABLE market_listings ADD COLUMN IF NOT EXISTS ingested_asset_id INTEGER`);
    // Add FK constraint (idempotent via pg_constraint check)
    await db.execute(sql`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_market_listings_ingested_asset') THEN
          ALTER TABLE market_listings ADD CONSTRAINT fk_market_listings_ingested_asset
            FOREIGN KEY (ingested_asset_id) REFERENCES ingested_assets(id) ON DELETE SET NULL;
        END IF;
      END $$
    `);
    // In-app notifications table for EdenScout → EdenMarket availability signal
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS market_availability_notifications (
        id               SERIAL PRIMARY KEY,
        user_id          TEXT NOT NULL,
        listing_id       INTEGER NOT NULL,
        ingested_asset_id INTEGER,
        message          TEXT NOT NULL,
        read_at          TIMESTAMP,
        created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS man_user_unread ON market_availability_notifications(user_id) WHERE read_at IS NULL`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS man_user_listing_unique ON market_availability_notifications(user_id, listing_id)`);
    // Free-form email-address opt-outs for admin manual dispatch recipients
    // who have no Eden account (token-keyed unsubscribe).
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS email_unsubscribes (
        email            TEXT PRIMARY KEY,
        unsubscribed_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // Saved searches — EdenMarket Browse alerts (Task #713)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS market_saved_searches (
        id          SERIAL PRIMARY KEY,
        user_id     TEXT NOT NULL,
        name        TEXT NOT NULL,
        keyword     TEXT,
        filters     JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS market_saved_searches_user_name_unique ON market_saved_searches(user_id, name)`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS market_deal_documents (
        id           SERIAL PRIMARY KEY,
        deal_id      INTEGER NOT NULL REFERENCES market_deals(id) ON DELETE CASCADE,
        uploader_id  TEXT NOT NULL,
        file_name    TEXT NOT NULL,
        file_url     TEXT NOT NULL,
        file_size    INTEGER,
        uploaded_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS market_deal_messages (
        id          SERIAL PRIMARY KEY,
        deal_id     INTEGER NOT NULL REFERENCES market_deals(id) ON DELETE CASCADE,
        sender_id   TEXT NOT NULL,
        body        TEXT NOT NULL,
        sent_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS market_deal_events (
        id          SERIAL PRIMARY KEY,
        deal_id     INTEGER NOT NULL REFERENCES market_deals(id) ON DELETE CASCADE,
        actor_id    TEXT NOT NULL,
        event_type  TEXT NOT NULL,
        detail      TEXT,
        created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    log("[startup] market_deals tables ensured", "startup");
  } catch (err: any) {
    log(`[startup] market_deals tables check: ${err?.message}`, "startup");
  }
}

// ── One-time migration: relabel old saved_asset status values ─────────────────
// Old constraint: ('viewing', 'evaluating', 'contacted')
// New values:     ('watching', 'evaluating', 'in_discussion', 'on_hold', 'passed')
// Mapping: 'viewing' -> 'watching', 'contacted' -> 'in_discussion'
// The old DB-level check constraint is also dropped so the new values are accepted.
async function backfillIndividualOrgNames() {
  try {
    const result = await db.execute(sql`
      UPDATE organizations o
      SET name = ip.company_name
      FROM org_members om
      JOIN industry_profiles ip ON ip.user_id = om.user_id
      WHERE om.org_id = o.id
        AND om.role = 'owner'
        AND o.plan_tier = 'individual'
        AND o.name IN ('My Organisation', 'Personal Workspace')
        AND ip.company_name IS NOT NULL
        AND ip.company_name != ''
    `);
    type PgResult = { rowCount: number | null };
    const updated = ((result as unknown as PgResult).rowCount ?? 0);
    if (updated > 0) {
      log(`[startup] Backfilled org names: updated ${updated} individual org(s) from profile company name`, "startup");
    }
  } catch (err: any) {
    log(`[startup] Org name backfill note: ${err?.message}`, "startup");
  }
}

async function backfillSavedAssetSourceNames() {
  try {
    const r1 = await db.execute(sql`
      UPDATE saved_assets
      SET source_name = 'clinical_trial'
      WHERE (source_name IS NULL OR source_name = 'unknown')
        AND pmid LIKE 'NCT%'
    `);
    const r2 = await db.execute(sql`
      UPDATE saved_assets
      SET source_name = 'patent'
      WHERE (source_name IS NULL OR source_name = 'unknown')
        AND pmid IS NOT NULL
        AND pmid NOT LIKE 'NCT%'
        AND pmid ~ '^[0-9]+$'
    `);
    type PgResult = { rowCount: number | null };
    const fixed = ((r1 as unknown as PgResult).rowCount ?? 0) + ((r2 as unknown as PgResult).rowCount ?? 0);
    if (fixed > 0) {
      log(`[startup] Backfilled source_name for ${fixed} saved_asset(s) with missing labels`, "startup");
    }
  } catch (err: any) {
    log(`[startup] Source name backfill note: ${err?.message}`, "startup");
  }
}

async function migrateAssetStatusValues() {
  try {
    await db.execute(sql`
      ALTER TABLE saved_assets DROP CONSTRAINT IF EXISTS saved_assets_status_check
    `);
    const r1 = await db.execute(sql`
      UPDATE saved_assets SET status = 'watching' WHERE status = 'viewing'
    `);
    const r2 = await db.execute(sql`
      UPDATE saved_assets SET status = 'in_discussion' WHERE status = 'contacted'
    `);
    // Add replacement constraint covering the 5 new values (NULL is allowed)
    await db.execute(sql`
      ALTER TABLE saved_assets
        ADD CONSTRAINT saved_assets_status_check
        CHECK (status IS NULL OR status IN ('watching', 'evaluating', 'in_discussion', 'on_hold', 'passed'))
    `);
    type PgResult = { rowCount: number | null };
    const migrated = ((r1 as unknown as PgResult).rowCount ?? 0) + ((r2 as unknown as PgResult).rowCount ?? 0);
    if (migrated > 0) {
      log(`[startup] Migrated ${migrated} saved_asset status row(s) to new vocabulary`, "startup");
    }
    log("[startup] saved_assets status constraint updated to 5-value vocabulary", "startup");
  } catch (err: any) {
    log(`[startup] Asset status migration note: ${err?.message}`, "startup");
  }
}

(async () => {
  // ── Playwright Chromium binary: install in background if missing ───────────
  try {
    const { chromium } = await import("playwright");
    const executablePath = chromium.executablePath();
    if (!existsSync(executablePath)) {
      log("[startup] Playwright Chromium binary missing — installing in background…", "startup");
      const child = spawn("npx", ["playwright", "install", "chromium"], {
        stdio: "inherit",
        detached: false,
      });
      child.on("close", (code) => {
        if (code === 0) log("[startup] Playwright Chromium installed OK", "startup");
        else log(`[startup] Playwright Chromium install exited with code ${code}`, "startup");
      });
    } else {
      log("[startup] Playwright Chromium binary present ✓", "startup");
    }
  } catch (err: any) {
    log(`[startup] Playwright check failed: ${err?.message}`, "startup");
  }

  // ── Register API routes ───────────────────────────────────────────────────
  await registerRoutes(httpServer, app);

  // ── Federated search source health summary ───────────────────────────────
  try {
    const { logSourceHealthSummary } = await import("./lib/sources/index");
    logSourceHealthSummary();
  } catch (e) {
    log(`[startup] source health summary failed: ${(e as Error)?.message}`, "startup");
  }

  // ── Sentry Express error handler (must come before our own error handler) ──
  if (process.env.SENTRY_DSN) {
    Sentry.setupExpressErrorHandler(app);
  }

  // ── Error handler middleware ──────────────────────────────────────────────
  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (process.env.SENTRY_DSN && status >= 500) {
      Sentry.captureException(err);
    }

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // ── Static serving (production) or Vite dev server ───────────────────────
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ── Open port FIRST so the health check passes immediately ───────────────
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
      // ── Scheduler restore + orphaned run cleanup ────────────────────────
      runPostStartupTasks().catch((err: any) => {
        log(`[startup] Post-startup tasks failed: ${err?.message}`, "startup");
      });
      // ── runStartupMigrations: no-op (migrations skipped; use db:push) ───
      runStartupMigrations().catch(() => {});
      // ── Ensure saved_asset_notes table exists (idempotent) ────────────
      createSavedAssetNotesTable().catch(() => {});
      // ── Ensure institution_metadata table exists + is seeded (Task #729) ─
      ensureInstitutionMetadataTable().catch(() => {});
      // ── Ensure shared_links table exists (idempotent) ──────────────────
      createSharedLinksTable().catch(() => {});
      // ── Ensure stripe_billing_events table exists (idempotent) ─────────
      createStripeBillingEventsTable().catch(() => {});
      // ── Ensure user_alerts table exists (digest pipeline) ───────────────
      createUserAlertsTable().catch(() => {});
      // ── Add trial_reminder_sent_at to organizations (idempotent) ────────
      addTrialReminderSentAtColumn().catch(() => {});
      // ── Add asset_fingerprint to team_activities + backfill (idempotent) ─
      addTeamActivityFingerprintColumn().catch(() => {});
      // ── Ensure saved_reports table exists (idempotent) ──────────────────
      createSavedReportsTable().catch(() => {});
      // ── Ensure market_deals tables exist (idempotent) ────────────────────
      createMarketDealsTables().catch(() => {});
      // ── Ensure export_logs table exists (idempotent) ─────────────────────
      createExportLogsTable().catch(() => {});
      // ── Trial-ending reminder emails (every 6h, 25h window) ────────────
      scheduleTrialReminderCheck();
      // ── Periodic alert evaluation (every 5 min by default) ─────────────
      schedulePeriodicAlertCheck();
      // ── Weekly relevance-metrics aggregation (Task #694) ─────────────────
      scheduleRelevanceMetricsAggregation();
      // ── Index for alertMailer's matchAssetsForAlert query ──────────────
      ensureAlertMatchIndex().catch(() => {});
      // ── Scout FTS + trigram indexes (Task #760) ─────────────────────────
      ensureScoutSearchIndexes().catch(() => {});
      // ── Backfill industry_profiles for Supabase digest subscribers ───────
      syncSubscribersFromSupabase().catch(() => {});
      // ── Migrate asset status values to new vocabulary ──────────────────
      migrateAssetStatusValues().catch(() => {});
      // ── Backfill source_name for unlabeled patent/trial saved assets ────
      backfillSavedAssetSourceNames().catch(() => {});
      // ── Backfill individual org names from profile company name ─────────
      backfillIndividualOrgNames().catch(() => {});
      // ── Batch-clean stale staging rows then create indexes ─────────────
      // Runs 5 seconds after startup. Cleans old rows in small LIMIT batches,
      // then calls ensureStagingIndexes once the table is smaller.
      setTimeout(() => {
        batchCleanStagingThenIndex().catch((err: any) => {
          log(`[startup] batchCleanStagingThenIndex failed: ${err?.message}`, "startup");
        });
      }, 5_000);
    },
  );
})();
