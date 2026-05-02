#!/usr/bin/env -S npx tsx
// Upload rendered EdenScout LinkedIn ads + manifest to Google Drive via the
// existing /api/export/googledrive endpoint. Uses fileType="ad-campaign" + a
// campaignSlug field — the endpoint maps that to EdenRadar/Ads/<slug>/.
//
// Auth: signs in via Supabase using credentials supplied by env vars
// UPLOAD_USER_EMAIL and UPLOAD_USER_PASSWORD (both required). The script
// exits non-zero if either is missing — credentials are never hardcoded.
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

interface ExportSuccess {
  success: true;
  url: string;
  editUrl: string;
}
interface ExportFailure {
  error: string;
}
type ExportResponse = ExportSuccess | ExportFailure;
function isSuccess(r: ExportResponse): r is ExportSuccess {
  return (r as ExportSuccess).success === true;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "build/ads/edenscout-linkedin-awareness-2026-05");
const SLUG = "edenscout-linkedin-awareness-2026-05";

const BASE = process.env.UPLOAD_BASE_URL ?? "http://127.0.0.1:5000";
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? "";
const EMAIL = process.env.UPLOAD_USER_EMAIL ?? "";
const PASSWORD = process.env.UPLOAD_USER_PASSWORD ?? "";

async function getAccessToken(): Promise<string> {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set in env");
  }
  if (!EMAIL || !PASSWORD) {
    throw new Error("UPLOAD_USER_EMAIL and UPLOAD_USER_PASSWORD must be set (no hardcoded fallback).");
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const { data, error } = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (error || !data.session?.access_token) {
    throw new Error(`Supabase login failed for ${EMAIL}: ${error?.message ?? "no token"}`);
  }
  return data.session.access_token;
}

function inferContentType(name: string): string | undefined {
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".md")) return "text/markdown";
  return undefined;
}

async function uploadOne(token: string, name: string, buf: Buffer): Promise<string> {
  const res = await fetch(`${BASE}/api/export/googledrive`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      filename: name,
      fileType: "ad-campaign",
      campaignSlug: SLUG,
      content: buf.toString("base64"),
    }),
  });
  const body = (await res.json()) as ExportResponse;
  if (!res.ok || !isSuccess(body)) {
    const msg = (body as ExportFailure).error ?? `HTTP ${res.status}`;
    throw new Error(`Upload failed for ${name}: ${msg}`);
  }
  return body.url;
}

async function resolveFolderUrl(): Promise<string | null> {
  // Best-effort: query Drive directly via the connector token to print a
  // clickable folder URL in the script output. Non-fatal if it fails.
  try {
    const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
    const xToken = process.env.REPL_IDENTITY ? "repl " + process.env.REPL_IDENTITY
      : process.env.WEB_REPL_RENEWAL ? "depl " + process.env.WEB_REPL_RENEWAL : null;
    if (!hostname || !xToken) return null;
    interface ConnRes {
      items?: Array<{ settings?: { access_token?: string; oauth?: { credentials?: { access_token?: string } } } }>;
    }
    const conn = (await fetch(
      `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=google-drive`,
      { headers: { Accept: "application/json", "X-Replit-Token": xToken } }
    ).then((r) => r.json())) as ConnRes;
    const at = conn.items?.[0]?.settings?.access_token
      ?? conn.items?.[0]?.settings?.oauth?.credentials?.access_token;
    if (!at) return null;
    const { google } = await import("googleapis");
    const auth = new google.auth.OAuth2(); auth.setCredentials({ access_token: at });
    const drive = google.drive({ version: "v3", auth });
    let parent = "root";
    for (const part of ["EdenRadar", "Ads", SLUG]) {
      const list = await drive.files.list({
        q: `mimeType='application/vnd.google-apps.folder' and name='${part.replace(/'/g, "\\'")}' and trashed=false and '${parent}' in parents`,
        fields: "files(id)",
        spaces: "drive",
      });
      if (!list.data.files?.length) return null;
      parent = list.data.files[0].id!;
    }
    return `https://drive.google.com/drive/folders/${parent}`;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const names = (await readdir(SRC)).filter((n) => !n.startsWith(".")).sort();
  if (!names.length) throw new Error(`No files in ${SRC} — run scripts/render-edenscout-ads.mjs first.`);
  const token = await getAccessToken();
  console.log(`Signed in as ${EMAIL}; uploading ${names.length} files via /api/export/googledrive ...`);
  for (const name of names) {
    const buf = await readFile(path.join(SRC, name));
    const ct = inferContentType(name);
    if (!ct) console.warn(`  (no content-type inferred for ${name})`);
    const url = await uploadOne(token, name, buf);
    console.log(`  ${name} -> ${url}`);
  }
  const folderUrl = await resolveFolderUrl();
  if (folderUrl) {
    console.log(`\nGoogle Drive folder:\n  ${folderUrl}`);
  } else {
    console.log("\n(folder URL could not be resolved — open Drive and browse to EdenRadar/Ads/)");
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
