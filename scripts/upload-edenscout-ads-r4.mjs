#!/usr/bin/env node
// Upload round-4 EdenScout ads to Google Drive at
//   EdenRadar/Ads/edenscout-awareness-2026-05-round-4/
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { google } from "googleapis";
import { Readable } from "node:stream";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SLUG = "edenscout-awareness-2026-05-round-4";
const SRC = path.join(ROOT, "build/ads", SLUG);
const FOLDER_PATH = ["EdenRadar", "Ads", SLUG];

async function getAccessToken() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xToken = process.env.REPL_IDENTITY ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL ? "depl " + process.env.WEB_REPL_RENEWAL : null;
  if (!hostname || !xToken) throw new Error("Missing REPLIT_CONNECTORS_HOSTNAME / REPL_IDENTITY");
  const data = await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=google-drive`,
    { headers: { Accept: "application/json", "X-Replit-Token": xToken } }
  ).then((r) => r.json());
  const conn = data.items?.[0];
  const token = conn?.settings?.access_token ?? conn?.settings?.oauth?.credentials?.access_token;
  if (!token) throw new Error("Google Drive connector not configured (no access_token)");
  return token;
}

function escQ(v) { return v.replace(/\\/g, "\\\\").replace(/'/g, "\\'"); }

async function findOrCreateFolder(drive, name, parentId) {
  const parentClause = parentId ? `'${parentId}' in parents` : `'root' in parents`;
  const list = await drive.files.list({
    q: `mimeType='application/vnd.google-apps.folder' and name='${escQ(name)}' and trashed=false and ${parentClause}`,
    fields: "files(id,name)",
    spaces: "drive",
  });
  if (list.data.files?.length) return list.data.files[0].id;
  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      ...(parentId ? { parents: [parentId] } : {}),
    },
    fields: "id",
  });
  return created.data.id;
}

function mimeFor(name) {
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".md")) return "text/markdown";
  return "application/octet-stream";
}

async function deleteIfExists(drive, name, parentId) {
  const list = await drive.files.list({
    q: `name='${escQ(name)}' and '${parentId}' in parents and trashed=false`,
    fields: "files(id,name)",
    spaces: "drive",
  });
  for (const f of list.data.files ?? []) {
    await drive.files.delete({ fileId: f.id });
  }
}

async function main() {
  const names = (await readdir(SRC)).filter((n) => !n.startsWith(".")).sort();
  if (!names.length) throw new Error(`No files in ${SRC}`);

  const token = await getAccessToken();
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: token });
  const drive = google.drive({ version: "v3", auth });

  let parent = null;
  for (const part of FOLDER_PATH) parent = await findOrCreateFolder(drive, part, parent);
  console.log(`Folder ready: ${FOLDER_PATH.join("/")} (${parent})`);

  for (const name of names) {
    const buf = await readFile(path.join(SRC, name));
    await deleteIfExists(drive, name, parent);
    const res = await drive.files.create({
      requestBody: { name, parents: [parent] },
      media: { mimeType: mimeFor(name), body: Readable.from(buf) },
      fields: "id,name,webViewLink",
    });
    console.log(`  uploaded ${name}  ${res.data.webViewLink ?? res.data.id}`);
  }

  const folderUrl = `https://drive.google.com/drive/folders/${parent}`;
  console.log(`\nGoogle Drive folder:\n  ${folderUrl}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
