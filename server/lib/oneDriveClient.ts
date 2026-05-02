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

export interface UploadResult {
  name: string;
  webUrl: string;
  onlineEditUrl?: string;
}

export async function uploadToOneDrive(
  filename: string,
  buffer: Buffer,
  folder = "EdenRadar Templates"
): Promise<UploadResult> {
  const client = await getUncachableOneDriveClient();

  // Ensure the folder exists by creating it (PUT is idempotent via Graph)
  const remotePath = `${folder}/${filename}`;

  const response = await client
    .api(`/me/drive/root:/${remotePath}:/content`)
    .headers({ "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })
    .put(buffer);

  return {
    name: response.name ?? filename,
    webUrl: response.webUrl ?? "",
    onlineEditUrl: response["@microsoft.graph.downloadUrl"] ?? response.webUrl ?? "",
  };
}
