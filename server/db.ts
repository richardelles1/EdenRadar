import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

const connectionString = process.env.SUPABASE_DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "SUPABASE_DATABASE_URL must be set. This app requires Supabase — do not use a Replit-managed database.",
  );
}

export const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: 4,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
});

// Without this, a FATAL error from Supabase on any background connection
// propagates as an uncaught exception and permanently kills the pool.
// With this, pg silently removes the bad connection and creates a replacement.
pool.on("error", (err) => {
  console.error("[db] Pool connection error (connection auto-removed):", err.message);
});

export const db = drizzle(pool, { schema });
