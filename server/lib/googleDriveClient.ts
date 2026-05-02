// Google Drive integration via Replit connector proxy
// connector: ccfg_google-drive_0F6D7EF5E22543468DB221F94F (not_setup until user completes OAuth)
// At runtime, we attempt to retrieve credentials. If unavailable, upload is skipped gracefully.
import { google } from "googleapis";
import { Readable } from "stream";

async function getGoogleDriveAccessToken(): Promise<string | null> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? "depl " + process.env.WEB_REPL_RENEWAL
    : null;

  if (!hostname || !xReplitToken) return null;

  try {
    const data = await fetch(
      "https://" +
        hostname +
        "/api/v2/connection?include_secrets=true&connector_names=google-drive",
      {
        headers: {
          Accept: "application/json",
          "X-Replit-Token": xReplitToken,
        },
      }
    ).then((r) => r.json());

    const conn = data.items?.[0];
    const token =
      conn?.settings?.access_token ||
      conn?.settings?.oauth?.credentials?.access_token;

    return token ?? null;
  } catch {
    return null;
  }
}

export async function isGoogleDriveConnected(): Promise<boolean> {
  const token = await getGoogleDriveAccessToken();
  return !!token;
}

export interface DriveUploadResult {
  name: string;
  editUrl: string;
}

function escapeDriveQuery(value: string): string {
  // Escape single quotes for Drive query syntax (q=...)
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function findOrCreateChildFolder(
  drive: any,
  name: string,
  parentId: string | null
): Promise<string> {
  const safeName = escapeDriveQuery(name);
  const parentClause = parentId
    ? ` and '${parentId}' in parents`
    : ` and 'root' in parents`;
  const list = await drive.files.list({
    q: `mimeType='application/vnd.google-apps.folder' and name='${safeName}' and trashed=false${parentClause}`,
    fields: "files(id,name)",
    spaces: "drive",
  });
  if (list.data.files && list.data.files.length > 0) {
    return list.data.files[0].id;
  }
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

async function getOrCreateDriveFolder(
  drive: any,
  folderPath: string
): Promise<string> {
  // Walk path segments, creating each as a child of the previous (root for the first).
  // Supports nested folders like "EdenRadar/Documents".
  const parts = folderPath.split("/").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return "root";
  let parentId: string | null = null;
  for (const part of parts) {
    parentId = await findOrCreateChildFolder(drive, part, parentId);
  }
  return parentId!;
}

function inferDriveMime(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "application/pdf";
  if (ext === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (ext === "csv") return "text/csv";
  if (ext === "xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (ext === "json") return "application/json";
  if (ext === "txt") return "text/plain";
  if (ext === "html" || ext === "htm") return "text/html";
  return "application/octet-stream";
}

export async function uploadToGoogleDrive(
  filename: string,
  buffer: Buffer,
  folder = "EdenRadar Templates",
  contentType?: string
): Promise<DriveUploadResult | null> {
  const accessToken = await getGoogleDriveAccessToken();
  if (!accessToken) return null;

  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const drive = google.drive({ version: "v3", auth });

  const folderId = await getOrCreateDriveFolder(drive, folder);
  const mimeType = contentType ?? inferDriveMime(filename);

  const response = await drive.files.create({
    requestBody: {
      name: filename,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: Readable.from(buffer),
    },
    fields: "id,name,webViewLink",
  });

  const fileId = response.data.id!;
  // Word docs uploaded to Drive open via Google Docs editor; everything else uses the
  // standard Drive file viewer. webViewLink works for any file type.
  const editUrl =
    response.data.webViewLink ??
    (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      ? `https://docs.google.com/document/d/${fileId}/edit`
      : `https://drive.google.com/file/d/${fileId}/view`);

  return {
    name: response.data.name ?? filename,
    editUrl,
  };
}
