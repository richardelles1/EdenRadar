import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useDocumentMeta } from "@/hooks/use-document-meta";
import {
  Copy,
  CheckCheck,
  KeyRound,
  Zap,
  ShieldCheck,
  BookOpen,
  ExternalLink,
  ChevronRight,
  Server,
  Hash,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Tiny copy button ──────────────────────────────────────────────────────────

function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button
      onClick={handleCopy}
      className={cn(
        "p-1.5 rounded hover:bg-white/10 transition-colors text-zinc-400 hover:text-zinc-200",
        className,
      )}
      aria-label="Copy"
    >
      {copied ? <CheckCheck className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

// ── Code block ────────────────────────────────────────────────────────────────

function CodeBlock({
  children,
  lang = "bash",
  label,
}: {
  children: string;
  lang?: string;
  label?: string;
}) {
  return (
    <div className="rounded-lg border border-border overflow-hidden my-4">
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/60 border-b border-border">
        <span className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
          {label ?? lang}
        </span>
        <CopyButton text={children.trim()} />
      </div>
      <pre className="p-4 text-xs font-mono text-foreground/90 overflow-x-auto bg-zinc-950/30 dark:bg-zinc-950/60 leading-relaxed">
        <code>{children.trim()}</code>
      </pre>
    </div>
  );
}

// ── Inline code ───────────────────────────────────────────────────────────────

function IC({ children }: { children: React.ReactNode }) {
  return (
    <code className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono text-foreground/90">
      {children}
    </code>
  );
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionTitle({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2
      id={id}
      className="text-lg font-semibold text-foreground mt-10 mb-4 scroll-mt-6 flex items-center gap-2"
    >
      {children}
    </h2>
  );
}

function SubTitle({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h3
      id={id}
      className="text-sm font-semibold text-foreground mt-7 mb-3 scroll-mt-6"
    >
      {children}
    </h3>
  );
}

// ── Method badge ──────────────────────────────────────────────────────────────

function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    GET: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
    POST: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    DELETE: "bg-red-500/15 text-red-400 border-red-500/30",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-semibold border",
        colors[method] ?? "bg-muted text-muted-foreground border-border",
      )}
    >
      {method}
    </span>
  );
}

// ── Param table ───────────────────────────────────────────────────────────────

type Param = {
  name: string;
  type: string;
  required?: boolean;
  description: string;
};

function ParamTable({ params }: { params: Param[] }) {
  return (
    <div className="overflow-x-auto my-3">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-2 pr-4 font-medium text-muted-foreground w-36">Parameter</th>
            <th className="text-left py-2 pr-4 font-medium text-muted-foreground w-24">Type</th>
            <th className="text-left py-2 pr-4 font-medium text-muted-foreground w-16">Required</th>
            <th className="text-left py-2 font-medium text-muted-foreground">Description</th>
          </tr>
        </thead>
        <tbody>
          {params.map((p) => (
            <tr key={p.name} className="border-b border-border/50">
              <td className="py-2 pr-4 font-mono text-foreground/90">{p.name}</td>
              <td className="py-2 pr-4 text-muted-foreground">{p.type}</td>
              <td className="py-2 pr-4">
                {p.required ? (
                  <span className="text-amber-500 font-medium">yes</span>
                ) : (
                  <span className="text-muted-foreground">no</span>
                )}
              </td>
              <td className="py-2 text-muted-foreground leading-relaxed">{p.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── ToC item ──────────────────────────────────────────────────────────────────

const TOC_ITEMS = [
  { id: "overview", label: "Overview" },
  { id: "authentication", label: "Authentication" },
  { id: "rate-limits", label: "Rate limits" },
  { id: "base-url", label: "Base URL" },
  { id: "endpoint-health", label: "GET /v1/health" },
  { id: "endpoint-search", label: "GET /v1/assets/search" },
  { id: "endpoint-asset", label: "GET /v1/assets/:id" },
  { id: "asset-schema", label: "Asset schema" },
  { id: "errors", label: "Error codes" },
];

function TableOfContents({ active }: { active: string }) {
  return (
    <nav className="sticky top-6 w-44 shrink-0 hidden lg:block">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        On this page
      </p>
      <ul className="space-y-0.5">
        {TOC_ITEMS.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              className={cn(
                "block text-xs py-1 px-2 rounded transition-colors",
                item.id.startsWith("endpoint-")
                  ? "pl-4 text-muted-foreground hover:text-foreground"
                  : "text-muted-foreground hover:text-foreground",
                active === item.id && "bg-accent text-foreground font-medium",
              )}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

// ── Scroll-spy hook ───────────────────────────────────────────────────────────

function useScrollSpy(ids: string[]) {
  const [active, setActive] = useState(ids[0] ?? "");
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(e.target.id);
        }
      },
      { rootMargin: "-20% 0px -75% 0px" },
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, [ids]);
  return active;
}

// ── Main page ─────────────────────────────────────────────────────────────────

const SECTION_IDS = TOC_ITEMS.map((t) => t.id);

const BASE_URL = "https://api.edenradar.com";

export default function Developers() {
  useDocumentMeta({ title: "Developer Docs · EdenRadar", noindex: true });
  const active = useScrollSpy(SECTION_IDS);

  return (
    <div className="px-6 py-8 max-w-5xl mx-auto">
      {/* Page header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
          <BookOpen className="w-3.5 h-3.5" />
          <span>API Reference</span>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground">V1</span>
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">Developer Docs</h1>
        <p className="text-sm text-muted-foreground max-w-xl">
          Integrate EdenRadar's biotech asset intelligence directly into your workflows.
          The V1 API gives programmatic access to the same corpus that powers Scout.
        </p>
        <div className="flex items-center gap-3 mt-4">
          <Badge variant="outline" className="text-xs gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
            V1 · Generally available
          </Badge>
          <Link href="/settings">
            <a className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline">
              Get your API key
              <ExternalLink className="w-3 h-3" />
            </a>
          </Link>
        </div>
      </div>

      <Separator className="mb-8" />

      <div className="flex gap-10">
        {/* Left ToC */}
        <TableOfContents active={active} />

        {/* Main content */}
        <article className="flex-1 min-w-0 text-sm text-foreground/80 leading-relaxed">

          {/* ── Overview ──────────────────────────────────── */}
          <SectionTitle id="overview">
            <BookOpen className="w-4 h-4 text-muted-foreground" />
            Overview
          </SectionTitle>
          <p>
            The EdenRadar API provides read access to a corpus of over 33,000 biotech and
            pharmaceutical assets — including drug candidates, research programs, and
            licensing opportunities — sourced and enriched by the EdenRadar pipeline.
          </p>
          <p className="mt-3">
            All responses are JSON. All endpoints require an API key (see{" "}
            <a href="#authentication" className="text-primary hover:underline">Authentication</a>).
            The current version is <IC>v1</IC>.
          </p>

          {/* ── Authentication ────────────────────────────── */}
          <SectionTitle id="authentication">
            <ShieldCheck className="w-4 h-4 text-muted-foreground" />
            Authentication
          </SectionTitle>
          <p>
            All requests must include your API key. Pass it as a{" "}
            <IC>Bearer</IC> token in the <IC>Authorization</IC> header or via the{" "}
            <IC>X-Api-Key</IC> header.
          </p>
          <CodeBlock lang="bash" label="Authorization header">
{`curl -H "Authorization: Bearer eden_a1b2c3d4_..." \\
     "${BASE_URL}/v1/health"`}
          </CodeBlock>
          <CodeBlock lang="bash" label="X-Api-Key header">
{`curl -H "X-Api-Key: eden_a1b2c3d4_..." \\
     "${BASE_URL}/v1/health"`}
          </CodeBlock>

          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 my-4 flex gap-3">
            <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Your full API key is shown <strong>once</strong> at generation time and cannot
              be retrieved later. Store it securely. You can always regenerate a key from{" "}
              <Link href="/settings">
                <a className="underline hover:text-amber-600">Settings → API Access</a>
              </Link>
              .
            </p>
          </div>

          <SubTitle id="key-format">Key format</SubTitle>
          <p>
            Keys follow the pattern <IC>{"eden_<prefix>_<secret>"}</IC> where{" "}
            <IC>prefix</IC> is an 8-character hex identifier and{" "}
            <IC>secret</IC> is a 32-character hex secret. The prefix is safe to log and
            display; never log the full key.
          </p>

          {/* ── Rate limits ───────────────────────────────── */}
          <SectionTitle id="rate-limits">
            <Zap className="w-4 h-4 text-muted-foreground" />
            Rate limits
          </SectionTitle>
          <p>
            Limits are enforced per API key on a rolling UTC-day window. The counter
            resets at <strong>00:00 UTC</strong> each day.
          </p>

          <div className="overflow-x-auto my-4">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-6 font-medium text-muted-foreground">Tier</th>
                  <th className="text-left py-2 pr-6 font-medium text-muted-foreground">Daily limit</th>
                  <th className="text-left py-2 font-medium text-muted-foreground">Scopes</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border/50">
                  <td className="py-2 pr-6 font-medium text-foreground">Starter</td>
                  <td className="py-2 pr-6">500 requests</td>
                  <td className="py-2 text-muted-foreground font-mono">read:assets, read:institutions</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-2 pr-6 font-medium text-foreground">Professional</td>
                  <td className="py-2 pr-6">5,000 requests</td>
                  <td className="py-2 text-muted-foreground font-mono">+ read:pipeline, read:reports</td>
                </tr>
                <tr>
                  <td className="py-2 pr-6 font-medium text-foreground">Enterprise</td>
                  <td className="py-2 pr-6">50,000 requests</td>
                  <td className="py-2 text-muted-foreground font-mono">all scopes</td>
                </tr>
              </tbody>
            </table>
          </div>

          <p>
            Every response includes rate-limit headers:
          </p>
          <CodeBlock lang="http" label="Response headers">
{`X-RateLimit-Limit: 500
X-RateLimit-Remaining: 497
Retry-After: 86400   # only present on 429 responses`}
          </CodeBlock>
          <p>
            When a key exceeds its limit the API returns{" "}
            <IC>429 Too Many Requests</IC> with{" "}
            <IC>{`{ "error": "Daily rate limit exceeded", "code": "rate_limit_exceeded" }`}</IC>.
            Retry after the next UTC midnight (at most 86,400 seconds away).
          </p>

          {/* ── Base URL ──────────────────────────────────── */}
          <SectionTitle id="base-url">
            <Server className="w-4 h-4 text-muted-foreground" />
            Base URL
          </SectionTitle>
          <CodeBlock lang="text">
{`${BASE_URL}`}
          </CodeBlock>
          <p>All paths below are relative to this base.</p>

          {/* ── GET /v1/health ────────────────────────────── */}
          <SectionTitle id="endpoint-health">
            <Hash className="w-4 h-4 text-muted-foreground" />
            Endpoints
          </SectionTitle>

          <div className="flex items-center gap-2 mb-1">
            <MethodBadge method="GET" />
            <code className="text-sm font-mono text-foreground">/v1/health</code>
          </div>
          <p className="mb-3 text-muted-foreground">
            Verify your key is valid, check your tier, and confirm the service is up.
            Does not require a scope — any active key can call this endpoint.
          </p>

          <CodeBlock lang="bash" label="Request">
{`curl -H "Authorization: Bearer eden_a1b2c3d4_..." \\
     "${BASE_URL}/v1/health"`}
          </CodeBlock>

          <CodeBlock lang="json" label="Response 200">
{`{
  "status": "ok",
  "key": "a1b2c3d4…",
  "tier": "starter",
  "scopes": ["read:assets", "read:institutions"],
  "ts": "2026-05-24T10:00:00.000Z"
}`}
          </CodeBlock>

          {/* ── GET /v1/assets/search ─────────────────────── */}
          <SubTitle id="endpoint-search">GET /v1/assets/search</SubTitle>
          <p className="mb-3">
            Full-text and fuzzy search across the EdenRadar asset corpus.
            Requires scope <IC>read:assets</IC>.
          </p>

          <ParamTable
            params={[
              { name: "q", type: "string", required: true, description: "Search query — searches name, target, indication, mechanism, and institution fields." },
              { name: "limit", type: "integer", required: false, description: "Results per page. Default 20, max 100." },
              { name: "offset", type: "integer", required: false, description: "Number of results to skip for pagination. Default 0." },
            ]}
          />

          <CodeBlock lang="bash" label="Request">
{`curl -H "Authorization: Bearer eden_a1b2c3d4_..." \\
     "${BASE_URL}/v1/assets/search?q=KRAS+inhibitor&limit=5"`}
          </CodeBlock>

          <CodeBlock lang="json" label="Response 200">
{`{
  "results": [
    {
      "id": 18241,
      "name": "AMG 510",
      "target": "KRAS G12C",
      "modality": "Small molecule",
      "indication": "Non-small cell lung cancer",
      "stage": "Approved",
      "institution": "Amgen",
      "summary": "First-in-class covalent KRAS G12C inhibitor...",
      "mechanism_of_action": "KRAS inhibition",
      "ip_type": "compound",
      "licensing_readiness": null,
      "source_url": "https://...",
      "completeness_score": 0.94,
      "last_seen_at": "2026-05-20T00:00:00.000Z"
    }
  ],
  "total": 1,
  "limit": 5,
  "offset": 0,
  "has_more": false
}`}
          </CodeBlock>

          {/* ── GET /v1/assets/:id ────────────────────────── */}
          <SubTitle id="endpoint-asset">GET /v1/assets/:id</SubTitle>
          <p className="mb-3">
            Fetch a single asset by its EdenRadar numeric ID.
            Requires scope <IC>read:assets</IC>.
          </p>

          <ParamTable
            params={[
              { name: "id", type: "integer", required: true, description: "EdenRadar asset ID (from search results)." },
            ]}
          />

          <CodeBlock lang="bash" label="Request">
{`curl -H "Authorization: Bearer eden_a1b2c3d4_..." \\
     "${BASE_URL}/v1/assets/18241"`}
          </CodeBlock>

          <CodeBlock lang="json" label="Response 200">
{`{
  "id": 18241,
  "name": "AMG 510",
  "target": "KRAS G12C",
  "modality": "Small molecule",
  "indication": "Non-small cell lung cancer",
  "stage": "Approved",
  "institution": "Amgen",
  "summary": "First-in-class covalent KRAS G12C inhibitor...",
  "mechanism_of_action": "KRAS inhibition",
  "ip_type": "compound",
  "licensing_readiness": null,
  "source_url": "https://...",
  "completeness_score": 0.94,
  "last_seen_at": "2026-05-20T00:00:00.000Z"
}`}
          </CodeBlock>

          <p>Returns <IC>404</IC> if the ID does not exist or belongs to an asset that is not in the public corpus.</p>

          {/* ── Asset schema ──────────────────────────────── */}
          <SectionTitle id="asset-schema">
            <BookOpen className="w-4 h-4 text-muted-foreground" />
            Asset schema
          </SectionTitle>

          <ParamTable
            params={[
              { name: "id", type: "integer", description: "Unique EdenRadar asset ID." },
              { name: "name", type: "string", description: "Program or compound name." },
              { name: "target", type: "string | null", description: "Biological target (e.g. KRAS G12C, PD-1)." },
              { name: "modality", type: "string | null", description: "Drug modality (Small molecule, Biologic, Cell therapy, …)." },
              { name: "indication", type: "string | null", description: "Primary disease indication." },
              { name: "stage", type: "string | null", description: "Development stage (Preclinical, Phase I/II/III, Approved, …)." },
              { name: "institution", type: "string | null", description: "Originating institution or company." },
              { name: "summary", type: "string | null", description: "Human-readable program summary (may be AI-enriched)." },
              { name: "mechanism_of_action", type: "string | null", description: "Mechanism-based biology term." },
              { name: "ip_type", type: "string | null", description: "IP classification (compound, method, composition, …)." },
              { name: "licensing_readiness", type: "string | null", description: "Indicated licensing status when available." },
              { name: "source_url", type: "string | null", description: "Original source URL for this asset record." },
              { name: "completeness_score", type: "number", description: "0–1 data completeness score for this record." },
              { name: "last_seen_at", type: "ISO 8601", description: "Timestamp of the most recent pipeline observation." },
            ]}
          />

          {/* ── Errors ────────────────────────────────────── */}
          <SectionTitle id="errors">
            <AlertCircle className="w-4 h-4 text-muted-foreground" />
            Error codes
          </SectionTitle>

          <p className="mb-4">
            All error responses share the same shape:{" "}
            <IC>{`{ "error": "...", "code": "..." }`}</IC>. HTTP status codes follow
            standard semantics.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-4 font-medium text-muted-foreground w-12">Status</th>
                  <th className="text-left py-2 pr-4 font-medium text-muted-foreground w-44">Code</th>
                  <th className="text-left py-2 font-medium text-muted-foreground">Meaning</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["401", "missing_key", "No API key provided in the request."],
                  ["401", "invalid_key", "Key not found in the database."],
                  ["401", "key_suspended", "Key has been suspended by an admin."],
                  ["401", "key_revoked", "Key has been revoked."],
                  ["401", "key_expired", "Key's expiry date has passed."],
                  ["403", "insufficient_scope", "Key does not have the required scope for this endpoint."],
                  ["404", "not_found", "Asset ID does not exist in the public corpus."],
                  ["422", "invalid_params", "Query parameters failed validation."],
                  ["429", "rate_limit_exceeded", "Daily call quota exhausted. Retry after next UTC midnight."],
                  ["500", "internal_error", "Unexpected server error."],
                ].map(([status, code, meaning]) => (
                  <tr key={code} className="border-b border-border/50">
                    <td className="py-2 pr-4 font-mono text-foreground/80">{status}</td>
                    <td className="py-2 pr-4 font-mono text-muted-foreground">{code}</td>
                    <td className="py-2 text-muted-foreground">{meaning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Footer CTA ────────────────────────────────── */}
          <div className="mt-12 rounded-xl border border-border bg-muted/30 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-foreground text-sm mb-1">Ready to start building?</p>
              <p className="text-xs text-muted-foreground">
                Generate your API key from Settings and make your first call in under a minute.
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Link href="/settings">
                <Button size="sm" className="gap-1.5">
                  <KeyRound className="w-3.5 h-3.5" />
                  Get API key
                </Button>
              </Link>
              <a
                href="#endpoint-health"
                className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-md border border-border hover:bg-accent transition-colors font-medium"
              >
                Try /v1/health
                <ChevronRight className="w-3 h-3" />
              </a>
            </div>
          </div>

        </article>
      </div>
    </div>
  );
}
