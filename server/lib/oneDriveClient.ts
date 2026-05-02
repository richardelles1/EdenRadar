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

async function ensureOneDriveFolder(
  accessToken: string,
  folderName: string
): Promise<void> {
  // Try to create the folder; if it already exists (409 Conflict), that's fine
  try {
    await fetch(
      "https://graph.microsoft.com/v1.0/me/drive/root/children",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: folderName,
          folder: {},
          "@microsoft.graph.conflictBehavior": "fail",
        }),
      }
    );
    // 201 = created, 409 = already exists — both are acceptable
  } catch {
    // folder creation errors are non-fatal; upload will still work if folder exists
  }
}

export interface UploadResult {
  name: string;
  webUrl: string;
}

export async function uploadToOneDrive(
  filename: string,
  buffer: Buffer,
  folder = "EdenRadar Templates"
): Promise<UploadResult> {
  const accessToken = await getAccessToken();

  // Ensure the target folder exists before uploading
  await ensureOneDriveFolder(accessToken, folder);

  const remotePath = `${folder}/${filename}`;
  const uploadUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/${encodeURIComponent(remotePath)}:/content`;

  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
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
