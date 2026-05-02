// OneDrive integration via Replit connector proxy (connection:conn_onedrive_01KPVAA2ZWKJXKWHAYGD97TP7H)
import { Client } from "@microsoft/microsoft-graph-client";

let connectionSettings: any;

async function getAccessToken(): Promise<string> {
  if (
    connectionSettings &&
    connectionSettings.settings?.expires_at &&
    new Date(connectionSettings.settings.expires_at).getTime() > Date.now()
  ) {
    return connectionSettings.settings.access_token;
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? "depl " + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) throw new Error("X-Replit-Token not found for repl/depl");

  connectionSettings = await fetch(
    "https://" +
      hostname +
      "/api/v2/connection?include_secrets=true&connector_names=onedrive",
    {
      headers: {
        Accept: "application/json",
        "X-Replit-Token": xReplitToken,
      },
    }
  )
    .then((r) => r.json())
    .then((data) => data.items?.[0]);

  const accessToken =
    connectionSettings?.settings?.access_token ||
    connectionSettings?.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken)
    throw new Error("OneDrive not connected");

  return accessToken;
}

// WARNING: Never cache this client. Tokens expire.
export async function getUncachableOneDriveClient(): Promise<Client> {
  const accessToken = await getAccessToken();
  return Client.initWithMiddleware({
    authProvider: { getAccessToken: async () => accessToken },
  });
}

export async function isOneDriveConnected(): Promise<boolean> {
  try {
    await getAccessToken();
    return true;
  } catch {
    return false;
  }
}

async function ensureOneDriveFolderPath(
  accessToken: string,
  folderPath: string
): Promise<void> {
  // Create each segment in turn; conflictBehavior:replace returns the existing folder.
  const parts = folderPath.split("/").filter(Boolean);
  let parentPath = "";
  for (const part of parts) {
    const parentEndpoint = parentPath
      ? `https://graph.microsoft.com/v1.0/me/drive/root:/${encodeURIComponent(parentPath)}:/children`
      : "https://graph.microsoft.com/v1.0/me/drive/root/children";
    try {
      await fetch(parentEndpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: part,
          folder: {},
          "@microsoft.graph.conflictBehavior": "replace",
        }),
      });
    } catch {
      // non-fatal: upload will still work if folder exists
    }
    parentPath = parentPath ? `${parentPath}/${part}` : part;
  }
}

export interface UploadResult {
  name: string;
  webUrl: string;
}

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function inferContentType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "application/pdf";
  if (ext === "docx") return DOCX_MIME;
  if (ext === "csv") return "text/csv";
  if (ext === "xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (ext === "json") return "application/json";
  if (ext === "txt") return "text/plain";
  if (ext === "html" || ext === "htm") return "text/html";
  return "application/octet-stream";
}

export async function uploadToOneDrive(
  filename: string,
  buffer: Buffer,
  folder = "EdenRadar Templates",
  contentType?: string
): Promise<UploadResult> {
  const accessToken = await getAccessToken();

  // Ensure the target folder path exists (supports nested paths like "EdenRadar/Documents")
  await ensureOneDriveFolderPath(accessToken, folder);

  const remotePath = `${folder}/${filename}`;
  const uploadUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/${encodeURIComponent(remotePath)}:/content`;

  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": contentType ?? inferContentType(filename),
    },
    body: buffer,
  });

  if (!uploadResponse.ok) {
    const errText = await uploadResponse.text();
    throw new Error(`OneDrive upload failed (${uploadResponse.status}): ${errText}`);
  }

  const responseData = await uploadResponse.json() as any;

  return {
    name: responseData.name ?? filename,
    webUrl: responseData.webUrl ?? "",
  };
}
