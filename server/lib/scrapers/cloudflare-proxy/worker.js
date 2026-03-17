/**
 * EdenRadar Scraper Egress Proxy — Cloudflare Worker
 *
 * Deployment instructions:
 * 1. Install Wrangler CLI:  npm install -g wrangler
 * 2. Login:                 wrangler login
 * 3. Deploy:                wrangler deploy --name eden-scraper-proxy worker.js
 * 4. Copy the *.workers.dev URL shown after deploy
 * 5. In the Replit environment-secrets panel, add:
 *      SCRAPER_PROXY_URL = https://eden-scraper-proxy.<your-account>.workers.dev
 *
 * Usage: GET https://<worker-url>?url=<encoded-target-url>
 *
 * The worker forwards the request with a real browser User-Agent and returns
 * the raw response body. No auth is required — the URL itself is obscure
 * enough, and DOE lab pages are publicly accessible anyway.
 *
 * Allowed origins (keep this list narrow to prevent misuse):
 */
const ALLOWED_ORIGINS = [
  "technology.ornl.gov",
  "www.ornl.gov",
  "commercialization.ornl.gov",
  "techtransfer.anl.gov",
  "www.anl.gov",
  "availabletechnologies.pnl.gov",
  "www.pnnl.gov",
];

export default {
  async fetch(request) {
    const incoming = new URL(request.url);
    const rawTarget = incoming.searchParams.get("url");

    if (!rawTarget) {
      return new Response("Missing ?url parameter", { status: 400 });
    }

    let target;
    try {
      target = new URL(rawTarget);
    } catch {
      return new Response("Invalid ?url value", { status: 400 });
    }

    if (!ALLOWED_ORIGINS.includes(target.hostname)) {
      return new Response(`Origin not allowlisted: ${target.hostname}`, { status: 403 });
    }

    const upstream = await fetch(target.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: "https://www.google.com/",
      },
      redirect: "follow",
    });

    const body = await upstream.text();

    return new Response(body, {
      status: upstream.status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "X-Proxied-Status": String(upstream.status),
        "X-Proxied-URL": target.toString(),
      },
    });
  },
};
