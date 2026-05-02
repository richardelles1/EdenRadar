#!/usr/bin/env node
/**
 * Bootstrap admin Supabase Auth users for EdenRadar.
 *
 * Creates (idempotently) one Supabase user per ADMIN_EMAILS entry with the
 * default password `edenadmin1`. Existing users are left untouched — admins
 * who have already changed their password keep it.
 *
 * Required env:
 *   VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   (admin key — never expose to the browser)
 *
 * Optional env:
 *   ADMIN_EMAILS                (comma-separated; defaults to the same list
 *                                used by the server's requireAdmin middleware)
 *   ADMIN_DEFAULT_PASSWORD      (defaults to "edenadmin1")
 *
 * Usage:
 *   node scripts/bootstrap-admins.mjs
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEFAULT_EMAILS = "relles@edennx.com,wmohamed@edennx.com";
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? DEFAULT_EMAILS)
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
const DEFAULT_PASSWORD = process.env.ADMIN_DEFAULT_PASSWORD ?? "edenadmin1";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("[bootstrap-admins] Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.");
  process.exit(1);
}
if (ADMIN_EMAILS.length === 0) {
  console.error("[bootstrap-admins] ADMIN_EMAILS resolves to an empty list.");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findUserByEmail(email) {
  // listUsers paginates; small allowlist => first page is enough for our use.
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw error;
  return data.users.find((u) => (u.email ?? "").toLowerCase() === email) ?? null;
}

async function ensureAdmin(email) {
  const existing = await findUserByEmail(email);
  if (existing) {
    // Idempotently ensure user_metadata.is_admin === true (defense-in-depth flag),
    // but never touch the password — admins may have rotated it already.
    if (existing.user_metadata?.is_admin !== true) {
      const { error: upErr } = await admin.auth.admin.updateUserById(existing.id, {
        user_metadata: { ...(existing.user_metadata ?? {}), is_admin: true },
      });
      if (upErr) {
        console.error(`[bootstrap-admins] ${email} exists but failed to set is_admin:`, upErr.message);
        return { email, status: "error", error: upErr.message };
      }
      console.log(`[bootstrap-admins] ${email} already exists — set user_metadata.is_admin=true.`);
    } else {
      console.log(`[bootstrap-admins] ${email} already exists (id=${existing.id}) — already an admin, no change.`);
    }
    return { email, status: "exists", id: existing.id };
  }
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: DEFAULT_PASSWORD,
    email_confirm: true,
    user_metadata: { is_admin: true },
  });
  if (error) {
    console.error(`[bootstrap-admins] Failed to create ${email}:`, error.message);
    return { email, status: "error", error: error.message };
  }
  console.log(`[bootstrap-admins] Created ${email} (id=${data.user?.id}) with default password and is_admin=true.`);
  return { email, status: "created", id: data.user?.id };
}

const results = [];
for (const email of ADMIN_EMAILS) {
  results.push(await ensureAdmin(email));
}

const created = results.filter((r) => r.status === "created").length;
const existed = results.filter((r) => r.status === "exists").length;
const errored = results.filter((r) => r.status === "error").length;
console.log(`\n[bootstrap-admins] Done. created=${created} existing=${existed} errors=${errored}`);
if (errored > 0) process.exit(2);
