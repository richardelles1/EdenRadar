import type { Express, Request, Response } from "express";

const SITE_NAME = "EdenRadar";
const DEFAULT_OG_IMAGE = "/og-image.png";
const DEFAULT_DESCRIPTION =
  "EdenRadar connects world-class university biotech research with industry teams. AI-enriched asset discovery across 300+ tech transfer offices, scientific literature, and a confidential biopharma deal marketplace.";
const TWITTER_HANDLE = "@edenradar";

export type PublicPage = {
  path: string;
  title: string;
  description: string;
  ogType?: "website" | "article";
  ogImage?: string;
  changefreq?: "daily" | "weekly" | "monthly";
  schemas?: Record<string, unknown>[];
};

export const PUBLIC_PAGES: PublicPage[] = [
  {
    path: "/",
    title: "EdenRadar — Where Biotech Research Meets Industry Intelligence",
    description:
      "AI-powered biotech asset discovery across 300+ tech transfer offices and scientific literature. Connect industry BD teams with university researchers, surface licensable assets, and run a confidential deal marketplace — all in EdenRadar.",
    changefreq: "weekly",
  },
  {
    path: "/about",
    title: "About EdenRadar — Built by Industry Insiders, for the Industry",
    description:
      "EdenRadar was founded to eliminate the discovery gap between university research and industry development. Meet the founders and the mission powering biotech's most connected discovery platform.",
    changefreq: "monthly",
  },
  {
    path: "/what-we-do",
    title: "What We Do — Biotech Asset Discovery & Deal Intelligence | EdenRadar",
    description:
      "EdenRadar enriches biotech assets from 300+ TTOs and academic literature with AI scoring, then connects them to BD teams, researchers, and a confidential deal marketplace.",
    changefreq: "monthly",
  },
  {
    path: "/how-it-works",
    title: "How EdenRadar Works — From Discovery Concept to Closed Deal",
    description:
      "See how EdenRadar's three portals work together: EdenDiscovery for early-stage concepts, EdenLab for structured research, and EdenScout for industry asset discovery — all powered by the EDEN intelligence engine.",
    changefreq: "monthly",
  },
  {
    path: "/pricing",
    title: "Pricing — EdenScout, EdenLab, EdenDiscovery & EdenMarket | EdenRadar",
    description:
      "Free for researchers and concept creators. EdenScout starts at affordable per-seat pricing for industry BD teams. EdenMarket adds confidential deal flow with success-fee pricing.",
    changefreq: "monthly",
    schemas: [
      {
        "@context": "https://schema.org",
        "@type": "Product",
        name: "EdenScout",
        description:
          "Continuous discovery and AI enrichment of biotech assets from 300+ tech transfer offices for industry BD teams.",
        brand: { "@type": "Brand", name: "EdenRadar" },
        offers: {
          "@type": "AggregateOffer",
          priceCurrency: "USD",
          lowPrice: "0",
          offerCount: 4,
        },
      },
    ],
  },
  {
    path: "/pitch",
    title: "EdenRadar Pitch Deck — The Biotech Discovery Platform",
    description:
      "Investor and partner pitch for EdenRadar, the AI-powered biotech asset discovery and deal-flow platform connecting academia and industry.",
    changefreq: "monthly",
  },
  {
    path: "/one-pager",
    title: "EdenRadar One-Pager — Platform Overview",
    description:
      "A one-page overview of EdenRadar: discovery, lab, scout, and marketplace working together to accelerate biotech licensing and deal flow.",
    changefreq: "monthly",
  },
  {
    path: "/tos",
    title: "Terms of Service | EdenRadar",
    description: "EdenRadar's Terms of Service governing use of the platform and its services.",
    changefreq: "monthly",
  },
  {
    path: "/privacy",
    title: "Privacy Policy | EdenRadar",
    description: "How EdenRadar collects, uses, and protects your data across our platform.",
    changefreq: "monthly",
  },
  {
    path: "/market/preview",
    title: "EdenMarket — Confidential Biopharma Deal Marketplace | EdenRadar",
    description:
      "EdenMarket is the confidential biopharma deal marketplace. Browse licensable TTO spin-outs and deprioritized programs, submit EOIs, and close inside NDA-gated deal rooms.",
    changefreq: "weekly",
  },
  {
    path: "/market/list",
    title: "List Your Biopharma Assets on EdenMarket | EdenRadar",
    description:
      "List deprioritized programs, TTO spin-outs, and non-core biopharma assets on EdenMarket. Confidential blind listings, NDA-gated deal rooms, success-fee pricing.",
    changefreq: "weekly",
  },
];

function getBaseUrl(req: Request): string {
  const envUrl = process.env.PUBLIC_BASE_URL || process.env.ALLOWED_ORIGIN;
  if (envUrl) return envUrl.replace(/\/$/, "");
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "https";
  const host = (req.headers["x-forwarded-host"] as string) || req.headers.host;
  return `${proto}://${host}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildSchemaScripts(baseUrl: string, pageSchemas?: Record<string, unknown>[]): string {
  const always: Record<string, unknown>[] = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: SITE_NAME,
      url: baseUrl,
      logo: `${baseUrl}/favicon.png`,
      sameAs: [],
      description: DEFAULT_DESCRIPTION,
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: SITE_NAME,
      url: baseUrl,
      description: DEFAULT_DESCRIPTION,
    },
  ];
  return [...always, ...(pageSchemas ?? [])]
    .map(
      (s) =>
        `<script type="application/ld+json">${JSON.stringify(s).replace(/</g, "\\u003c")}</script>`,
    )
    .join("\n    ");
}

const FONT_BLOCK = `
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Open+Sans:ital,wght@0,300..800;1,300..800&display=swap">
    <link rel="stylesheet" media="print" onload="this.media='all'" href="https://fonts.googleapis.com/css2?family=Open+Sans:ital,wght@0,300..800;1,300..800&display=swap">
    <noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Open+Sans:ital,wght@0,300..800;1,300..800&display=swap"></noscript>`;

/**
 * Inject SEO head tags into a base index.html template by replacing the
 * default <title>, <meta name="description">, and head fonts. Preserves all
 * other content (theme-init script, favicon link, body, scripts).
 */
export function renderSeoHtml(
  template: string,
  page: PublicPage,
  baseUrl: string,
): string {
  const canonical = `${baseUrl}${page.path === "/" ? "" : page.path}`;
  const ogImage = page.ogImage ?? DEFAULT_OG_IMAGE;
  const absOg = ogImage.startsWith("http") ? ogImage : `${baseUrl}${ogImage}`;
  const ogType = page.ogType ?? "website";

  const headTags = `
    <title>${escapeHtml(page.title)}</title>
    <meta name="description" content="${escapeHtml(page.description)}" />
    <meta name="theme-color" content="#059669" />
    <link rel="canonical" href="${escapeHtml(canonical)}" />

    <meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />
    <meta property="og:locale" content="en_US" />
    <meta property="og:type" content="${ogType}" />
    <meta property="og:title" content="${escapeHtml(page.title)}" />
    <meta property="og:description" content="${escapeHtml(page.description)}" />
    <meta property="og:url" content="${escapeHtml(canonical)}" />
    <meta property="og:image" content="${escapeHtml(absOg)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:site" content="${TWITTER_HANDLE}" />
    <meta name="twitter:title" content="${escapeHtml(page.title)}" />
    <meta name="twitter:description" content="${escapeHtml(page.description)}" />
    <meta name="twitter:image" content="${escapeHtml(absOg)}" />
${FONT_BLOCK}
    ${buildSchemaScripts(baseUrl, page.schemas)}
`;

  // Strip the existing <title>, default meta description, and the heavy
  // Google Fonts <link> + preconnects from the template, then inject ours.
  let out = template;
  out = out.replace(/<title>[\s\S]*?<\/title>/i, "");
  out = out.replace(/<meta\s+name=["']description["'][^>]*\/?>/i, "");
  out = out.replace(/<meta\s+name=["']theme-color["'][^>]*\/?>/i, "");
  out = out.replace(/<link\s+rel=["']canonical["'][^>]*\/?>/gi, "");
  out = out.replace(/<link\s+rel=["']preconnect["'][^>]*fonts\.googleapis\.com[^>]*\/?>/gi, "");
  out = out.replace(/<link\s+rel=["']preconnect["'][^>]*fonts\.gstatic\.com[^>]*\/?>/gi, "");
  out = out.replace(/<link[^>]*fonts\.googleapis\.com\/css2[^>]*\/?>/gi, "");
  out = out.replace(/<meta\s+property=["']og:[^"']+["'][^>]*\/?>/gi, "");
  out = out.replace(/<meta\s+name=["']twitter:[^"']+["'][^>]*\/?>/gi, "");

  out = out.replace(/<\/head>/i, `${headTags}\n  </head>`);
  return out;
}

export function buildRobotsTxt(baseUrl: string): string {
  const disallow = [
    "/api",
    "/admin",
    "/scout",
    "/assets",
    "/alerts",
    "/reports",
    "/industry/",
    "/research/",
    "/market/listing/",
    "/market/seller",
    "/market/deals",
    "/market/create-listing",
    "/market/edit-listing/",
    "/market/my-eois",
    "/discovery/submit",
    "/discovery/my-concepts",
    "/discovery/profile",
    "/share/",
    "/asset/",
    "/report",
    "/pipeline/",
  ];

  const allowedAgents = [
    "Googlebot",
    "Bingbot",
    "OAI-SearchBot",
    "PerplexityBot",
    "ChatGPT-User",
    "GPTBot",
    "ClaudeBot",
    "Claude-Web",
  ];

  const sections: string[] = [];
  for (const agent of allowedAgents) {
    sections.push(`User-agent: ${agent}\nAllow: /\n${disallow.map((d) => `Disallow: ${d}`).join("\n")}`);
  }
  sections.push(`User-agent: *\nAllow: /\n${disallow.map((d) => `Disallow: ${d}`).join("\n")}`);

  return `${sections.join("\n\n")}\n\nSitemap: ${baseUrl}/sitemap.xml\n`;
}

export function buildSitemapXml(baseUrl: string, lastmod: string): string {
  const urls = PUBLIC_PAGES.map((p) => {
    const loc = `${baseUrl}${p.path === "/" ? "" : p.path}`;
    return `  <url>\n    <loc>${escapeHtml(loc)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${p.changefreq ?? "monthly"}</changefreq>\n  </url>`;
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

const BUILD_LASTMOD = new Date().toISOString().slice(0, 10);

/**
 * Register robots.txt + sitemap.xml + per-page SSR handlers for public
 * marketing routes. `getTemplate(req)` returns the base index.html (already
 * vite-transformed in dev, or read from disk in prod). Must be called BEFORE
 * any SPA catch-all.
 */
export function registerSeoRoutes(
  app: Express,
  getTemplate: (req: Request) => Promise<string>,
): void {
  app.get("/robots.txt", (req, res) => {
    res.type("text/plain").send(buildRobotsTxt(getBaseUrl(req)));
  });

  app.get("/sitemap.xml", (req, res) => {
    res
      .type("application/xml")
      .send(buildSitemapXml(getBaseUrl(req), BUILD_LASTMOD));
  });

  for (const page of PUBLIC_PAGES) {
    app.get(page.path, async (req: Request, res: Response, next) => {
      try {
        const tpl = await getTemplate(req);
        const html = renderSeoHtml(tpl, page, getBaseUrl(req));
        res
          .status(200)
          .set({
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "public, max-age=300, must-revalidate",
          })
          .end(html);
      } catch (err) {
        next(err);
      }
    });
  }
}
