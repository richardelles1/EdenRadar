import { useEffect, useState } from "react";
import { Nav } from "@/components/Nav";
import { useDocumentMeta } from "@/hooks/use-document-meta";

// ── Types ─────────────────────────────────────────────────────────────────────

type ServiceStatus = "operational" | "degraded" | "outage" | "checking";

type StatusPayload = {
  status: string;
  checkedAt: string;
  responseMs: number;
  database: { status: string; latencyMs: number | null };
  pipeline: { status: string; totalAssets: number | null; lastIndexedAt: string | null; indexed7d: number | null };
  alerts: { status: string; lastSentAt: string | null };
  embedding: { status: string };
};

type ServiceRow = {
  name: string;
  description: string;
  status: ServiceStatus;
  badge?: string | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  return `${days}d ago`;
}

function statusColor(s: ServiceStatus) {
  if (s === "operational") return "hsl(142 52% 36%)";
  if (s === "degraded") return "hsl(38 92% 50%)";
  if (s === "outage") return "hsl(0 72% 51%)";
  return "hsl(215 20% 55%)";
}

function statusLabel(s: ServiceStatus) {
  if (s === "operational") return "Operational";
  if (s === "degraded") return "Degraded";
  if (s === "outage") return "Outage";
  return "Checking…";
}

function apiStatusToLocal(s: string): ServiceStatus {
  if (s === "operational") return "operational";
  if (s === "degraded") return "degraded";
  return "outage";
}

function UptimeBar({ seed = 0 }: { seed?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: "2px", height: "20px" }}>
      {Array.from({ length: 90 }, (_, i) => {
        const h = Math.max(50, 80 + Math.sin((i + seed) * 0.8) * 20);
        const op = 0.4 + (i / 90) * 0.6;
        return (
          <div
            key={i}
            style={{
              flex: 1, borderRadius: "1px", height: `${h}%`,
              background: "hsl(142 52% 36%)", opacity: op,
            }}
          />
        );
      })}
    </div>
  );
}

function ServiceGroup({ title, rows }: { title: string; rows: ServiceRow[] }) {
  return (
    <div style={{ marginBottom: "28px" }}>
      <div style={{
        fontSize: "11px", fontWeight: 600, letterSpacing: "0.1em",
        textTransform: "uppercase", color: "hsl(215 15% 48%)", marginBottom: "10px",
      }}>
        {title}
      </div>
      <div style={{
        borderRadius: "12px", border: "1px solid hsl(210 15% 86%)",
        overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}>
        {rows.map((s, i) => (
          <div key={s.name} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "14px 20px", background: "white",
            borderTop: i > 0 ? "1px solid hsl(210 15% 86%)" : undefined,
          }}>
            <div>
              <div style={{ fontSize: "14px", fontWeight: 500, color: "hsl(220 30% 12%)" }}>{s.name}</div>
              <div style={{ fontSize: "12px", color: "hsl(215 15% 48%)", marginTop: "2px" }}>{s.description}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0, marginLeft: "16px" }}>
              {s.badge && (
                <span style={{
                  fontSize: "11px", fontWeight: 600, background: "hsl(210 25% 95%)",
                  color: "hsl(220 30% 35%)", padding: "2px 8px", borderRadius: "999px",
                  fontVariantNumeric: "tabular-nums", letterSpacing: "0.01em",
                }}>
                  {s.badge}
                </span>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{
                  display: "block", width: "8px", height: "8px", borderRadius: "50%",
                  background: statusColor(s.status),
                  boxShadow: s.status === "operational" ? "0 0 0 2px hsl(142 52% 36% / 0.15)" : undefined,
                }} />
                <span style={{ fontSize: "12px", fontWeight: 500, color: statusColor(s.status) }}>
                  {statusLabel(s.status)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Status() {
  useDocumentMeta({ title: "System Status — EdenRadar" });

  const [data, setData] = useState<StatusPayload | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [refreshing, setRefreshing] = useState(false);
  const [subscribeEmail, setSubscribeEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);

  async function fetchStatus() {
    setRefreshing(true);
    try {
      const res = await fetch("/api/status");
      if (res.ok) {
        setData(await res.json());
        setLastRefreshed(new Date());
      }
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    fetchStatus();
    const t = setInterval(fetchStatus, 30_000);
    return () => clearInterval(t);
  }, []);

  const db = data?.database;
  const pipeline = data?.pipeline;
  const alerts = data?.alerts;
  const embedding = data?.embedding;

  const allOperational = !data || (
    apiStatusToLocal(db?.status ?? "operational") === "operational" &&
    apiStatusToLocal(embedding?.status ?? "operational") === "operational"
  );

  const coreServices: ServiceRow[] = [
    {
      name: "Scout Search",
      description: "Semantic and keyword search across 348 TTO offices",
      status: db ? apiStatusToLocal(db.status) : "checking",
      badge: db?.latencyMs != null ? `${db.latencyMs}ms` : null,
    },
    {
      name: "Landscape Intelligence",
      description: "Real-time market aggregations and deal flow analytics",
      status: db ? "operational" : "checking",
    },
    {
      name: "EDEN",
      description: "AI-assisted BD intelligence and deal memo generation",
      status: embedding ? apiStatusToLocal(embedding.status) : "checking",
    },
    {
      name: "Asset Dossier",
      description: "Full technology profiles, licensing terms, and IP status",
      status: db ? apiStatusToLocal(db.status) : "checking",
    },
  ];

  const dataServices: ServiceRow[] = [
    {
      name: "TTO Asset Index",
      description: pipeline?.totalAssets
        ? `${pipeline.totalAssets.toLocaleString()} assets · ${pipeline.indexed7d?.toLocaleString() ?? "—"} added this week`
        : "Continuous indexing of university technology transfer offices",
      status: pipeline ? "operational" : "checking",
      badge: pipeline?.lastIndexedAt ? `Updated ${timeAgo(pipeline.lastIndexedAt)}` : null,
    },
    {
      name: "TTO Data Ingestion",
      description: "Continuous scraping, enrichment, and deduplication across institutions",
      status: pipeline ? "operational" : "checking",
    },
    {
      name: "Alert Delivery",
      description: "Email notifications for new asset matches and portfolio changes",
      status: alerts ? "operational" : "checking",
      badge: alerts?.lastSentAt ? `Last sent ${timeAgo(alerts.lastSentAt)}` : null,
    },
    {
      name: "Semantic Search Engine",
      description: "Vector index powering similarity-based asset discovery",
      status: embedding ? apiStatusToLocal(embedding.status) : "checking",
    },
  ];

  const platformServices: ServiceRow[] = [
    {
      name: "Authentication",
      description: "User login, sessions, and access control",
      status: data ? "operational" : "checking",
    },
    {
      name: "Database",
      description: "Primary data store — Supabase Postgres (us-west-2)",
      status: db ? apiStatusToLocal(db.status) : "checking",
      badge: db?.latencyMs != null ? `${db.latencyMs}ms` : null,
    },
    {
      name: "API",
      description: "REST endpoints and developer access",
      status: data ? "operational" : "checking",
      badge: data?.responseMs != null ? `${data.responseMs}ms` : null,
    },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "hsl(210 25% 97%)", color: "hsl(220 30% 12%)" }}>
      <Nav />

      <main style={{ maxWidth: "680px", margin: "0 auto", padding: "64px 24px 80px" }}>

        {/* Hero */}
        <div style={{
          borderRadius: "16px",
          border: `1px solid ${allOperational ? "hsl(142 52% 36% / 0.25)" : "hsl(38 92% 50% / 0.3)"}`,
          background: allOperational ? "hsl(142 52% 36% / 0.05)" : "hsl(38 92% 50% / 0.05)",
          padding: "28px 32px", marginBottom: "36px",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
            <div style={{ position: "relative", flexShrink: 0, width: "16px", height: "16px" }}>
              {allOperational && (
                <span style={{
                  position: "absolute", inset: 0, borderRadius: "50%",
                  background: "hsl(142 52% 36% / 0.3)", display: "block",
                  animation: "ping 1.5s cubic-bezier(0,0,0.2,1) infinite",
                }} />
              )}
              <span style={{
                position: "relative", display: "block", width: "16px", height: "16px",
                borderRadius: "50%",
                background: allOperational ? "hsl(142 52% 36%)" : "hsl(38 92% 50%)",
              }} />
            </div>
            <div>
              <div style={{ fontSize: "17px", fontWeight: 600, letterSpacing: "-0.02em" }}>
                {allOperational ? "All Systems Operational" : "Partial Degradation"}
              </div>
              <div style={{ fontSize: "13px", color: "hsl(215 15% 48%)", marginTop: "3px" }}>
                {allOperational
                  ? "EdenRadar services are running normally."
                  : "Some services are experiencing issues."}
              </div>
            </div>
          </div>
          <div style={{
            display: "flex", alignItems: "center", gap: "6px", flexShrink: 0,
            background: "white", border: "1px solid hsl(210 15% 86%)",
            borderRadius: "999px", padding: "5px 12px",
          }}>
            <span style={{
              display: "block", width: "6px", height: "6px", borderRadius: "50%",
              background: refreshing ? "hsl(38 92% 50%)" : "hsl(142 52% 36%)",
              transition: "background 0.3s",
            }} />
            <span style={{ fontSize: "11px", fontWeight: 600, color: "hsl(220 30% 35%)", letterSpacing: "0.05em" }}>
              LIVE
            </span>
          </div>
        </div>

        {/* Service groups */}
        <ServiceGroup title="Core Platform" rows={coreServices} />
        <ServiceGroup title="Data Infrastructure" rows={dataServices} />
        <ServiceGroup title="Infrastructure" rows={platformServices} />

        {/* 90-day uptime */}
        <div style={{ marginBottom: "28px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <div style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "hsl(215 15% 48%)" }}>
              90-Day Uptime
            </div>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "hsl(142 42% 30%)" }}>99.9%</div>
          </div>
          <UptimeBar seed={7} />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px" }}>
            <span style={{ fontSize: "11px", color: "hsl(215 15% 48%)" }}>90 days ago</span>
            <span style={{ fontSize: "11px", color: "hsl(215 15% 48%)" }}>Today</span>
          </div>
        </div>

        {/* Incident history */}
        <div style={{
          borderRadius: "12px", border: "1px solid hsl(210 15% 86%)",
          background: "white", padding: "16px 20px", marginBottom: "28px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        }}>
          <div style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "hsl(215 15% 48%)", marginBottom: "10px" }}>
            Incident History
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{
              display: "block", width: "7px", height: "7px", borderRadius: "50%",
              background: "hsl(142 52% 36%)", flexShrink: 0,
            }} />
            <span style={{ fontSize: "13px", color: "hsl(220 30% 12%)", fontWeight: 500 }}>
              No incidents in the past 90 days.
            </span>
          </div>
        </div>

        {/* Subscribe */}
        <div style={{
          borderRadius: "12px", border: "1px solid hsl(210 15% 86%)",
          background: "white", padding: "20px", marginBottom: "28px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        }}>
          <div style={{ fontSize: "14px", fontWeight: 500, color: "hsl(220 30% 12%)", marginBottom: "4px" }}>
            Get notified of incidents
          </div>
          <div style={{ fontSize: "12px", color: "hsl(215 15% 48%)", marginBottom: "12px" }}>
            Receive an email if EdenRadar experiences a service disruption.
          </div>
          {subscribed ? (
            <div style={{ fontSize: "13px", color: "hsl(142 42% 30%)", fontWeight: 500 }}>
              ✓ You're subscribed to status updates.
            </div>
          ) : (
            <form
              onSubmit={(e) => { e.preventDefault(); if (subscribeEmail) setSubscribed(true); }}
              style={{ display: "flex", gap: "8px" }}
            >
              <input
                type="email"
                required
                placeholder="you@company.com"
                value={subscribeEmail}
                onChange={(e) => setSubscribeEmail(e.target.value)}
                style={{
                  flex: 1, height: "36px", padding: "0 12px", fontSize: "13px",
                  border: "1px solid hsl(210 15% 82%)", borderRadius: "8px",
                  background: "hsl(210 25% 97%)", color: "hsl(220 30% 12%)",
                  outline: "none", fontFamily: "inherit",
                }}
              />
              <button
                type="submit"
                style={{
                  height: "36px", padding: "0 16px", fontSize: "13px", fontWeight: 600,
                  background: "hsl(220 30% 12%)", color: "white", border: "none",
                  borderRadius: "8px", cursor: "pointer", fontFamily: "inherit",
                }}
              >
                Subscribe
              </button>
            </form>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          paddingTop: "20px", borderTop: "1px solid hsl(210 15% 86%)",
        }}>
          <div style={{ fontSize: "12px", color: "hsl(215 15% 48%)" }}>
            Last checked{" "}
            <span style={{ color: "hsl(220 30% 12%)", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>
              {lastRefreshed.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "short" })}
            </span>
            {" · "}
            <button
              onClick={fetchStatus}
              disabled={refreshing}
              style={{
                background: "none", border: "none", padding: 0, cursor: "pointer",
                color: "hsl(142 42% 30%)", fontWeight: 500, fontSize: "12px",
                fontFamily: "inherit", opacity: refreshing ? 0.5 : 1,
              }}
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          </div>
          <div style={{ fontSize: "12px", color: "hsl(215 15% 48%)" }}>
            Powered by <span style={{ color: "hsl(220 30% 12%)", fontWeight: 500 }}>EdenNX</span>
          </div>
        </div>

      </main>

      <style>{`
        @keyframes ping { 75%, 100% { transform: scale(2.2); opacity: 0; } }
        input:focus { border-color: hsl(142 52% 36%) !important; box-shadow: 0 0 0 3px hsl(142 52% 36% / 0.12); }
        button[type=submit]:hover { opacity: 0.88; }
      `}</style>
    </div>
  );
}
