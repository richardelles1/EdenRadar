#!/bin/bash
set -e
npm install
# Apply idempotent schema patches via direct SQL before drizzle-kit runs.
# This avoids drizzle-kit's interactive confirmation prompts for constraint additions.
node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function run() {
  const client = await pool.connect();
  try {
    // Add unique constraint on manual_institutions.name only if the table exists and constraint is missing
    await client.query(\`
      DO \$\$ BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_name = 'manual_institutions'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE table_name = 'manual_institutions'
            AND constraint_name = 'manual_institutions_name_unique'
            AND constraint_type = 'UNIQUE'
        ) THEN
          ALTER TABLE manual_institutions ADD CONSTRAINT manual_institutions_name_unique UNIQUE (name);
        END IF;
      END \$\$
    \`);
    console.log('Schema patches applied.');
  } finally {
    client.release();
    await pool.end();
  }
}
run().catch(e => { console.error('Schema patch error:', e.message); process.exit(1); });
"
# Push remaining schema changes non-interactively.
# --force auto-approves data-loss statements so stdin-closed env does not block.
npx drizzle-kit push --force
