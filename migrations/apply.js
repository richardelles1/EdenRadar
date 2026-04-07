#!/usr/bin/env node
/**
 * migrations/apply.js
 * Applies all pending *.sql migration files in this directory against
 * SUPABASE_DATABASE_URL.  Each migration is tracked in a `_migrations`
 * table so it is only applied once.
 *
 * Usage:  node migrations/apply.js
 */
import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const connectionString = process.env.SUPABASE_DATABASE_URL;
if (!connectionString) {
  console.error("SUPABASE_DATABASE_URL is not set");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: 1,
  connectionTimeoutMillis: 15_000,
});

async function run() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name        TEXT PRIMARY KEY,
        applied_at  TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    const { rows: applied } = await client.query("SELECT name FROM _migrations");
    const appliedSet = new Set(applied.map((r) => r.name));

    const files = fs
      .readdirSync(__dirname)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log(`  skip  ${file} (already applied)`);
        continue;
      }
      const sql = fs.readFileSync(path.join(__dirname, file), "utf8");
      await client.query(sql);
      await client.query("INSERT INTO _migrations (name) VALUES ($1)", [file]);
      console.log(`  apply ${file}`);
    }

    console.log("Done.");
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
