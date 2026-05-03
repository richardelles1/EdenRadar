import pg from "pg";
import crypto from "node:crypto";

const { Pool } = pg;

let _pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (_pool) return _pool;
  const cs = process.env.SUPABASE_DATABASE_URL;
  if (!cs) {
    throw new Error("E2E: SUPABASE_DATABASE_URL must be set to run DB-backed specs");
  }
  _pool = new Pool({
    connectionString: cs,
    ssl: { rejectUnauthorized: false },
    max: 4,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
  return _pool;
}

export async function closePool() {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}

/** Stable prefix used to identify all rows created by the E2E suite. */
export const E2E_MARKER = "e2e-test";

/** Generate a deterministic-ish UUID v4 for a test scenario. */
export function e2eUserId(): string {
  return crypto.randomUUID();
}

/**
 * Create an industry_profiles row for a synthetic test user.
 * Returns the user UUID that owns it.
 */
export async function seedIndustryProfile(opts: {
  userId?: string;
  subscribedToDigest?: boolean;
  companyName?: string;
} = {}): Promise<string> {
  const userId = opts.userId ?? e2eUserId();
  const companyName = opts.companyName ?? `${E2E_MARKER}-${userId.slice(0, 8)}`;
  const subscribed = opts.subscribedToDigest ?? true;
  const pool = getPool();
  await pool.query(
    `INSERT INTO industry_profiles
       (user_id, user_name, company_name, subscribed_to_digest, onboarding_done, updated_at)
     VALUES ($1, $2, $3, $4, true, CURRENT_TIMESTAMP)
     ON CONFLICT (user_id) DO UPDATE SET
       subscribed_to_digest = EXCLUDED.subscribed_to_digest,
       company_name = EXCLUDED.company_name`,
    [userId, `E2E ${userId.slice(0, 8)}`, companyName, subscribed],
  );
  return userId;
}

export async function getIndustryProfile(userId: string) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT user_id, subscribed_to_digest, company_name FROM industry_profiles WHERE user_id = $1`,
    [userId],
  );
  return rows[0] as { user_id: string; subscribed_to_digest: boolean; company_name: string } | undefined;
}

/**
 * Cleanup all rows created by the E2E suite (any row whose company_name starts
 * with the E2E_MARKER prefix).
 */
export async function cleanupE2ERows() {
  const pool = getPool();
  await pool.query(
    `DELETE FROM industry_profiles WHERE company_name LIKE $1`,
    [`${E2E_MARKER}-%`],
  );
}
