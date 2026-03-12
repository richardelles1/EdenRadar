import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Shield, BarChart3, ArrowUp, ArrowDown, Minus, Lock, LogOut, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/hooks/use-theme";

const ADMIN_KEY = "eden-admin-pw";

function PasswordGate({ onAuth }: { onAuth: () => void }) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState(false);

  const submit = () => {
    if (pw === "eden") {
      localStorage.setItem(ADMIN_KEY, pw);
      onAuth();
    } else {
      setError(true);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background" data-testid="admin-gate">
      <div className="w-full max-w-sm space-y-6 p-8 border border-border rounded-xl bg-card">
        <div className="flex items-center gap-3">
          <Lock className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-semibold text-foreground">Admin Access</h1>
        </div>
        <div className="space-y-3">
          <Input
            type="password"
            placeholder="Portal password"
            value={pw}
            onChange={(e) => { setPw(e.target.value); setError(false); }}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            data-testid="input-admin-password"
            className={error ? "border-destructive" : ""}
          />
          {error && <p className="text-sm text-destructive">Incorrect password</p>}
          <Button onClick={submit} className="w-full" data-testid="button-admin-login">
            Enter
          </Button>
        </div>
      </div>
    </div>
  );
}

interface RunMeta {
  id: number;
  ranAt: string;
  totalFound: number;
  newCount: number;
  status: string;
}

interface ScanMatrixData {
  runs: RunMeta[];
  matrix: Array<{ institution: string; counts: number[] }>;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    " " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function DeltaCell({ current, previous }: { current: number; previous: number }) {
  const diff = current - previous;
  if (diff === 0) return <span className="text-muted-foreground" data-testid="delta-unchanged"><Minus className="h-3.5 w-3.5 inline" /></span>;
  if (diff > 0) return <span className="text-emerald-600 dark:text-emerald-400 font-medium" data-testid="delta-increase">+{diff}</span>;
  return <span className="text-red-500 dark:text-red-400 font-medium" data-testid="delta-decrease">{diff}</span>;
}

function ScanTracking({ pw }: { pw: string }) {
  const { data, isLoading, error } = useQuery<ScanMatrixData>({
    queryKey: ["/api/admin/scan-matrix", pw],
    queryFn: async () => {
      const res = await fetch("/api/admin/scan-matrix", {
        headers: { "x-admin-password": pw },
      });
      if (!res.ok) throw new Error("Failed to load scan data");
      return res.json();
    },
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20" data-testid="scan-loading">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-20 text-muted-foreground" data-testid="scan-error">
        Failed to load scan data. Check backend connection.
      </div>
    );
  }

  if (data.runs.length === 0) {
    return (
      <div className="text-center py-20 text-muted-foreground" data-testid="scan-empty">
        <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-40" />
        <p className="text-lg font-medium">No completed scan runs yet</p>
        <p className="text-sm mt-2">Run the ingestion pipeline to see scan data here.</p>
      </div>
    );
  }

  const { runs, matrix } = data;

  return (
    <div className="overflow-x-auto" data-testid="scan-tracking-table">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-3 px-4 font-semibold text-foreground sticky left-0 bg-card z-10 min-w-[200px]">
              Institution
            </th>
            {runs.length >= 2 && (
              <th className="text-center py-3 px-3 font-semibold text-foreground min-w-[60px]">
                &Delta;
              </th>
            )}
            {runs.map((run, i) => (
              <th key={run.id} className="text-center py-2 px-3 font-normal min-w-[90px]">
                <div className="text-xs font-semibold text-foreground">Run #{run.id}</div>
                <div className="text-xs text-muted-foreground">{formatDate(run.ranAt)}</div>
                <div className="flex items-center justify-center gap-1 mt-1">
                  <Badge variant={i === 0 ? "default" : "secondary"} className="text-[10px] px-1.5 py-0">
                    {run.totalFound.toLocaleString()} found
                  </Badge>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize" data-testid={`status-run-${run.id}`}>
                    {run.status}
                  </Badge>
                </div>
              </th>
            ))}
          </tr>
          <tr className="border-b-2 border-border bg-muted/30">
            <td className="py-2 px-4 font-semibold text-foreground sticky left-0 bg-muted/30 z-10">
              Total
            </td>
            {runs.length >= 2 && (
              <td className="text-center py-2 px-3 font-semibold">
                <DeltaCell
                  current={runs[0].totalFound}
                  previous={runs[1].totalFound}
                />
              </td>
            )}
            {runs.map((run, i) => (
              <td key={i} className="text-center py-2 px-3 font-semibold text-foreground">
                {run.totalFound.toLocaleString()}
              </td>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row) => (
            <tr key={row.institution} className="border-b border-border/50 hover:bg-muted/20" data-testid={`scan-row-${row.institution.replace(/\s+/g, "-").toLowerCase()}`}>
              <td className="py-2 px-4 font-medium text-foreground sticky left-0 bg-card z-10 truncate max-w-[250px]" title={row.institution}>
                {row.institution}
              </td>
              {runs.length >= 2 && (
                <td className="text-center py-2 px-3">
                  <DeltaCell current={row.counts[0] ?? 0} previous={row.counts[1] ?? 0} />
                </td>
              )}
              {row.counts.map((count, i) => (
                <td key={i} className={`text-center py-2 px-3 tabular-nums ${count === 0 ? "text-muted-foreground/40" : "text-foreground"}`}>
                  {count > 0 ? count.toLocaleString() : "\u2014"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Admin() {
  const [authed, setAuthed] = useState(false);
  const [activeTab] = useState("scan-tracking");
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    const stored = localStorage.getItem(ADMIN_KEY);
    if (stored === "eden") setAuthed(true);
  }, []);

  if (!authed) return <PasswordGate onAuth={() => setAuthed(true)} />;

  const pw = localStorage.getItem(ADMIN_KEY) ?? "";

  return (
    <div className="min-h-screen bg-background" data-testid="admin-panel">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-screen-2xl mx-auto flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <Shield className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold text-foreground">EdenRadar Admin</h1>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              data-testid="button-toggle-theme"
            >
              {theme === "dark" ? "Light" : "Dark"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { localStorage.removeItem(ADMIN_KEY); setAuthed(false); }}
              data-testid="button-admin-logout"
            >
              <LogOut className="h-4 w-4 mr-1" /> Logout
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-screen-2xl mx-auto flex">
        <aside className="w-56 border-r border-border min-h-[calc(100vh-57px)] p-4 shrink-0">
          <nav className="space-y-1">
            <button
              className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 ${
                activeTab === "scan-tracking"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
              data-testid="nav-scan-tracking"
            >
              <BarChart3 className="h-4 w-4" />
              Scan Tracking
            </button>
          </nav>
        </aside>

        <main className="flex-1 p-6 overflow-hidden">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold text-foreground" data-testid="text-section-title">Scan Tracking</h2>
            <p className="text-sm text-muted-foreground mt-1">Per-institution asset counts across scan runs</p>
          </div>
          <div className="border border-border rounded-xl bg-card overflow-hidden">
            <ScanTracking pw={pw} />
          </div>
        </main>
      </div>
    </div>
  );
}
