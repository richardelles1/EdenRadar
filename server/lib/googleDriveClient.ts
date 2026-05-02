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

async function getOrCreateDriveFolder(
  drive: any,
  folderName: string
): Promise<string> {
  // Search for existing folder
  const list = await drive.files.list({
    q: `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false`,
    fields: "files(id,name)",
    spaces: "drive",
  });
  if (list.data.files && list.data.files.length > 0) {
    return list.data.files[0].id;
  }
  // Create folder
  const created = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
    },
    fields: "id",
  });
  return created.data.id;
}

export async function uploadToGoogleDrive(
  filename: string,
  buffer: Buffer,
  folder = "EdenRadar Templates"
): Promise<DriveUploadResult | null> {
  const accessToken = await getGoogleDriveAccessToken();
  if (!accessToken) return null;

  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const drive = google.drive({ version: "v3", auth });

  const folderId = await getOrCreateDriveFolder(drive, folder);

  const docxMime =
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  const response = await drive.files.create({
    requestBody: {
      name: filename,
      parents: [folderId],
    },
    media: {
      mimeType: docxMime,
      body: Readable.from(buffer),
    },
    fields: "id,name,webViewLink",
  });

  const fileId = response.data.id!;
  const editUrl = `https://docs.google.com/document/d/${fileId}/edit`;

  return {
    name: response.data.name ?? filename,
    editUrl,
  };
}
