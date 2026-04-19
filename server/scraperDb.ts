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

export const scraperPool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: 3,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 15_000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
});

scraperPool.on("error", (err) => {
  console.error("[scraperDb] Pool connection error (connection auto-removed):", err.message);
});

export const scraperDb = drizzle(scraperPool, { schema });
