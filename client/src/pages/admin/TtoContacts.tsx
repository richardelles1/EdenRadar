import React, { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Users, Play, Square, CheckCircle2, AlertCircle, Loader2, ExternalLink, Mail, Phone, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";

interface ContactStats {
  total: number;
  withEmail: number;
}

interface ContactRow {
  id: number;
  institution: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  tto_url: string | null;
  verified_at: string | null;
  source: string;
}

interface ScrapeEvent {
  institution?: string;
  found?: number;
  status?: "ok" | "empty" | "error";
  error?: string;
  done?: boolean;
  total?: number;
  inserted?: number;
  empty?: string[];
  errors?: string[];
}

export function TtoContactsTab({ pw }: { pw: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [scraping, setScraping] = useState(false);
  const [progress, setProgress] = useState<ScrapeEvent[]>([]);
  const [done, setDone] = useState<ScrapeEvent | null>(null);
  const [showGaps, setShowGaps] = useState(false);
  const [institution, setInstitution] = useState("");
  const abortRef = useRef<() => void>();
  const logRef = useRef<HTMLDivElement>(null);

  const { data: statsData, refetch: refetchStats } = useQuery<{ stats: ContactStats }>({
    queryKey: ["/api/admin/tto-contacts"],
    queryFn: async () => {
      const res = await fetch("/api/admin/tto-contacts", {
        headers: { Authorization: `Bearer ${pw}` },
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 15000,
    enabled: !!pw,
  });

  const { data: gapsData } = useQuery<{ gaps: string[] }>({
    queryKey: ["/api/admin/tto-contacts/gaps"],
    queryFn: async () => {
      const res = await fetch("/api/admin/tto-contacts/gaps", {
        headers: { Authorization: `Bearer ${pw}` },
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 30000,
    enabled: !!pw && showGaps,
  });

  const { data: contactsData } = useQuery<{ contacts: ContactRow[] }>({
    queryKey: ["/api/admin/tto-contacts", institution],
    queryFn: async () => {
      const url = institution
        ? `/api/admin/tto-contacts?institution=${encodeURIComponent(institution)}`
        : "/api/admin/tto-contacts";
      const res = await fetch(url, { headers: { Authorization: `Bearer ${pw}` } });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 15000,
    enabled: !!pw,
  });

  const totalInstitutions = 346;
  const coveredInstitutions = totalInstitutions - (gapsData?.gaps.length ?? 0);
  const stats = statsData?.stats;

  function startScrape() {
    setScraping(true);
    setProgress([]);
    setDone(null);

    const es = new EventSource("/api/admin/tto-contacts/scrape-get");
    // SSE not ideal for POST — use fetch streaming instead
    es.close();

    const ctrl = new AbortController();
    abortRef.current = () => ctrl.abort();

    fetch("/api/admin/tto-contacts/scrape", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${pw}`,
      },
      body: JSON.stringify({ skipExisting: true }),
      signal: ctrl.signal,
    }).then(async (res) => {
      if (!res.ok || !res.body) {
        toast({ title: "Scrape failed to start", variant: "destructive" });
        setScraping(false);
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.replace(/^data: /, "").trim();
          if (!trimmed) continue;
          try {
            const evt: ScrapeEvent = JSON.parse(trimmed);
            if (evt.done) {
              setDone(evt);
              setScraping(false);
              void refetchStats();
              void qc.invalidateQueries({ queryKey: ["/api/admin/tto-contacts/gaps"] });
              void qc.invalidateQueries({ queryKey: ["/api/admin/tto-contacts"] });
            } else {
              setProgress(p => [...p, evt]);
              setTimeout(() => {
                logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
              }, 50);
            }
          } catch {}
        }
      }
      setScraping(false);
    }).catch((err) => {
      if (err.name !== "AbortError") {
        toast({ title: "Scrape error", description: err.message, variant: "destructive" });
      }
      setScraping(false);
    });
  }

  function stopScrape() {
    abortRef.current?.();
    setScraping(false);
  }

  const okCount = progress.filter(p => p.status === "ok").length;
  const emptyCount = progress.filter(p => p.status === "empty").length;
  const errCount = progress.filter(p => p.status === "error").length;

  return (
    <>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-foreground">TTO Contacts</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Technology transfer office staff contacts, auto-scraped from institution websites. Shown in asset dossiers and institution detail pages.
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="border border-border rounded-xl bg-card p-4 text-center">
          <div className="text-2xl font-bold text-foreground tabular-nums">{stats?.total?.toLocaleString() ?? "—"}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Total Contacts</div>
        </div>
        <div className="border border-border rounded-xl bg-card p-4 text-center">
          <div className="text-2xl font-bold text-primary tabular-nums">{stats?.withEmail?.toLocaleString() ?? "—"}</div>
          <div className="text-xs text-muted-foreground mt-0.5">With Email</div>
        </div>
        <div className="border border-border rounded-xl bg-card p-4 text-center">
          <div className="text-2xl font-bold text-emerald-500 tabular-nums">{coveredInstitutions}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Institutions Covered</div>
          <div className="text-[10px] text-muted-foreground/60">of {totalInstitutions}</div>
        </div>
        <div className="border border-border rounded-xl bg-card p-4 text-center">
          <div className="text-2xl font-bold text-amber-500 tabular-nums">{gapsData ? gapsData.gaps.length : "—"}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Gaps</div>
          <div className="text-[10px] text-muted-foreground/60">no contacts yet</div>
        </div>
      </div>

      {/* Scraper control */}
      <div className="border border-border rounded-xl bg-card p-5 mb-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-sm font-semibold text-foreground">Auto-scrape all institutions</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Probes each institution's TTO website for staff pages. Skips institutions already covered. ~30–60 min for a full run.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void refetchStats()}
              disabled={scraping}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
            {scraping ? (
              <Button variant="destructive" size="sm" onClick={stopScrape}>
                <Square className="h-3.5 w-3.5 mr-1.5" />
                Stop
              </Button>
            ) : (
              <Button size="sm" onClick={startScrape} disabled={scraping}>
                <Play className="h-3.5 w-3.5 mr-1.5" />
                Run Scrape
              </Button>
            )}
          </div>
        </div>

        {/* Progress */}
        {(scraping || progress.length > 0) && (
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1 text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" />{okCount} found</span>
              <span>{emptyCount} empty</span>
              {errCount > 0 && <span className="text-red-500">{errCount} errors</span>}
              {scraping && <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />running…</span>}
            </div>
            <div
              ref={logRef}
              className="bg-muted/40 border border-border rounded-lg p-3 max-h-48 overflow-y-auto font-mono text-[11px] space-y-0.5"
            >
              {progress.map((p, i) => (
                <div key={i} className={`flex items-center gap-2 ${p.status === "ok" ? "text-emerald-600 dark:text-emerald-400" : p.status === "error" ? "text-red-500" : "text-muted-foreground"}`}>
                  {p.status === "ok" ? "✓" : p.status === "error" ? "✗" : "·"}
                  <span>{p.institution}</span>
                  {p.status === "ok" && <span className="ml-auto">{p.found} contact{p.found !== 1 ? "s" : ""}</span>}
                  {p.error && <span className="ml-auto text-[10px] opacity-70">{p.error}</span>}
                </div>
              ))}
              {scraping && <div className="text-muted-foreground animate-pulse">…</div>}
            </div>
          </div>
        )}

        {/* Done summary */}
        {done && !scraping && (
          <div className="mt-3 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs text-emerald-700 dark:text-emerald-400">
            Done — scanned {done.total} institutions, inserted {done.inserted} new contacts.
            {(done.errors?.length ?? 0) > 0 && (
              <span className="text-amber-600 dark:text-amber-400 ml-2">{done.errors!.length} errors.</span>
            )}
          </div>
        )}
      </div>

      {/* Gap list toggle */}
      <div className="border border-border rounded-xl bg-card overflow-hidden mb-6">
        <button
          className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/30 transition-colors"
          onClick={() => setShowGaps(v => !v)}
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-500" />
            <span className="text-sm font-medium text-foreground">Institutions with no contacts</span>
            {gapsData && (
              <Badge variant="secondary" className="text-[10px]">{gapsData.gaps.length}</Badge>
            )}
          </div>
          {showGaps ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </button>
        {showGaps && gapsData && (
          <div className="border-t border-border p-4 max-h-64 overflow-y-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1">
              {gapsData.gaps.map(g => (
                <div key={g} className="text-xs text-muted-foreground py-0.5 truncate">{g}</div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Contacts table */}
      <div className="border border-border rounded-xl bg-card overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <span className="text-sm font-medium text-foreground flex items-center gap-2">
            <Users className="h-4 w-4" />
            All contacts
          </span>
          <input
            type="text"
            placeholder="Filter by institution…"
            value={institution}
            onChange={e => setInstitution(e.target.value)}
            className="text-xs border border-border rounded-md px-2 py-1 bg-background text-foreground placeholder:text-muted-foreground w-48 focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left py-2 px-3 font-semibold text-muted-foreground">Institution</th>
                <th className="text-left py-2 px-3 font-semibold text-muted-foreground">Name</th>
                <th className="text-left py-2 px-3 font-semibold text-muted-foreground hidden sm:table-cell">Title</th>
                <th className="text-left py-2 px-3 font-semibold text-muted-foreground">Email</th>
                <th className="text-left py-2 px-3 font-semibold text-muted-foreground hidden md:table-cell">Phone</th>
                <th className="text-left py-2 px-3 font-semibold text-muted-foreground hidden lg:table-cell">Source</th>
              </tr>
            </thead>
            <tbody>
              {(contactsData?.contacts ?? []).map(c => (
                <tr key={c.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                  <td className="py-2 px-3 text-muted-foreground max-w-[180px] truncate">
                    {c.tto_url ? (
                      <a href={c.tto_url} target="_blank" rel="noopener noreferrer" className="hover:text-primary inline-flex items-center gap-0.5">
                        {c.institution}
                        <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                      </a>
                    ) : c.institution}
                  </td>
                  <td className="py-2 px-3 font-medium text-foreground">
                    {c.name}
                    {c.verified_at && <span className="ml-1 text-emerald-500 text-[9px]">✓</span>}
                  </td>
                  <td className="py-2 px-3 text-muted-foreground hidden sm:table-cell max-w-[160px] truncate">{c.title ?? "—"}</td>
                  <td className="py-2 px-3">
                    {c.email ? (
                      <a href={`mailto:${c.email}`} className="text-primary hover:underline inline-flex items-center gap-1">
                        <Mail className="h-3 w-3" />{c.email}
                      </a>
                    ) : <span className="text-muted-foreground/40">—</span>}
                  </td>
                  <td className="py-2 px-3 text-muted-foreground hidden md:table-cell">
                    {c.phone ? (
                      <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 hover:text-foreground">
                        <Phone className="h-3 w-3" />{c.phone}
                      </a>
                    ) : "—"}
                  </td>
                  <td className="py-2 px-3 hidden lg:table-cell">
                    <Badge variant="secondary" className="text-[9px]">{c.source}</Badge>
                  </td>
                </tr>
              ))}
              {(contactsData?.contacts ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground text-xs">
                    No contacts found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
