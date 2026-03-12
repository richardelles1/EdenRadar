import { defineConfig } from "drizzle-kit";

const connectionString = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("SUPABASE_DATABASE_URL must be set. Did you forget to provision a database?");
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
    ssl: { rejectUnauthorized: false },
  },
});
