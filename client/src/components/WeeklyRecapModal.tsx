import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Sparkles,
  ArrowRight,
} from "lucide-react";

type Highlight = {
  id: number;
  assetName: string;
  institution: string | null;
  modality: string | null;
  indication: string | null;
  reason?: string;
};

type RecapPayload = {
  weekStart: string;
  weekEnd: string;
  weekLabel: string;
  isSolo: boolean;
  memberCount: number;
  summary: string;
  counts: { newAssets: number; saves: number; statusChanges: number; marketListings: number };
  deltas?: { newAssets: number; saves: number; statusChanges: number; marketListings: number };
  newAssets?: { total: number; byModality: Array<{ modality: string; count: number }>; top: Highlight[] };
  topSearches?: Array<{ query: string; count: number }>;
  marketSignals?: Array<{ alertName: string; matchCount: number; topAssets: Highlight[] }>;
  worthALook?: Highlight[];
};

type RecapResponse = {
  weekStart: string;
  frozen: boolean;
  payload: RecapPayload;
};

function assetHref(id: number | null | undefined, fallbackName: string): string {
  if (id != null && Number.isFinite(id) && id > 0) return `/asset/${id}`;
  return `/scout?q=${encodeURIComponent(fallbackName)}`;
}

function SectionBand({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-4 py-2 bg-[#166534]">
      <span className="text-[10px] font-extrabold tracking-[0.12em] uppercase text-white">{title}</span>
      {sub && <span className="text-[10px] text-white/50 italic font-normal normal-case tracking-normal">{sub}</span>}
    </div>
  );
}

function HighlightRow({ h }: { h: Highlight }) {
  const meta = [h.institution, h.modality, h.indication].filter(Boolean).join(" · ");
  return (
    <Link href={assetHref(h.id, h.assetName)}>
      <a
        className="flex items-stretch rounded-lg border border-[#dceee3] bg-white overflow-hidden hover:border-[#86efac] hover:shadow-sm transition-all"
        data-testid={`recap-highlight-${h.id}`}
      >
        <span className="w-1 bg-[#166534] shrink-0" />
        <div className="px-3 py-2.5 min-w-0">
          <p className="text-sm font-semibold text-foreground line-clamp-1">{h.assetName}</p>
          {meta && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{meta}</p>}
          {h.reason && (
            <p className="text-[11px] text-primary mt-1.5 font-medium">{h.reason}</p>
          )}
        </div>
      </a>
    </Link>
  );
}

function previousWeekKey(): string {
  const d = new Date();
  const day = d.getUTCDay();
  const offset = day === 0 ? 6 : day - 1;
  const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  out.setUTCDate(out.getUTCDate() - offset - 7);
  return out.toISOString().slice(0, 10);
}

export function WeeklyRecapModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [weekKey, setWeekKey] = useState<string | null>(previousWeekKey);

  useEffect(() => {
    if (open) setWeekKey(previousWeekKey());
  }, [open]);

  const url = weekKey === null ? "/api/recap/current" : `/api/recap/${weekKey}`;
  const { data, isLoading } = useQuery<RecapResponse>({
    queryKey: [url],
    enabled: open,
  });

  const p = data?.payload;

  function goPreviousWeek() {
    const current = data?.weekStart ? new Date(data.weekStart) : new Date();
    const prev = new Date(current);
    prev.setUTCDate(prev.getUTCDate() - 7);
    setWeekKey(prev.toISOString().slice(0, 10));
  }

  function currentWeekStart(): Date {
    const d = new Date();
    const day = d.getUTCDay();
    const offset = day === 0 ? 6 : day - 1;
    const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    out.setUTCDate(out.getUTCDate() - offset);
    return out;
  }

  function goNextWeek() {
    const current = data?.weekStart ? new Date(data.weekStart) : new Date();
    const next = new Date(current);
    next.setUTCDate(next.getUTCDate() + 7);
    const cur = currentWeekStart();
    if (next.getTime() >= cur.getTime()) {
      setWeekKey(null);
      return;
    }
    setWeekKey(next.toISOString().slice(0, 10));
  }

  const onCurrent =
    weekKey === null ||
    (data?.weekStart !== undefined &&
      new Date(data.weekStart).getTime() === currentWeekStart().getTime());

  // Only show targeted alerts — filter out catch-alls that match everything
  const targetedSignals = p?.marketSignals?.filter(
    (s) => s.matchCount < (p.counts.newAssets ?? Infinity)
  ) ?? [];

  // Only show top searches if there are enough to be meaningful
  const meaningfulSearches = (p?.topSearches ?? []).filter((_, i) => i < 5);
  const showSearches = meaningfulSearches.length >= 3;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl max-h-[88vh] overflow-y-auto p-0 gap-0 border-0"
        data-testid="modal-weekly-recap"
      >
        {/* Deep emerald header */}
        <div className="px-6 pt-5 pb-5 bg-gradient-to-br from-[#14532d] via-[#166534] to-[#15803d] rounded-t-xl relative">
          <div className="flex items-start justify-between gap-3 pr-6">
            <div className="space-y-1.5">
              <DialogTitle className="flex items-center gap-2.5 text-base font-bold text-white">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-white/15">
                  <Sparkles className="w-3.5 h-3.5 text-white" />
                </span>
                Weekly Recap
              </DialogTitle>
              <p className="text-xs text-white/60 pl-[38px]" data-testid="text-recap-week-label">
                {p?.weekLabel ?? "Loading..."}
                {data && !data.frozen && (
                  <span className="ml-2 inline-block px-2 py-0.5 rounded-full bg-white/20 text-white text-[10px] font-semibold">
                    Live
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2.5 text-xs text-white/80 hover:text-white hover:bg-white/15 border border-white/20"
                onClick={goPreviousWeek}
                data-testid="button-recap-prev-week"
              >
                <ChevronLeft className="w-3 h-3" />
                Previous
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2.5 text-xs text-white/80 hover:text-white hover:bg-white/15 border border-white/20 disabled:opacity-30"
                onClick={goNextWeek}
                disabled={onCurrent}
                data-testid="button-recap-next-week"
              >
                Next
                <ChevronRight className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </div>

        {/* Visual break — separates dark header from dark hero */}
        <div className="h-[5px] bg-[#f4f9f5] border-t-2 border-white/20" />

        {/* Body */}
        <div className="px-4 py-3 pb-5 bg-[#f4f9f5] space-y-3">
          {isLoading || !p ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-40 w-full rounded-xl" />
              <Skeleton className="h-28 w-full rounded-xl" />
            </div>
          ) : (
            <>
              {/* Hero stat — slightly darker than header to create separation */}
              <div
                className="rounded-xl bg-[#14532d] border border-white/[0.07] px-5 py-5 flex items-center justify-between gap-4"
                data-testid="recap-summary"
              >
                <div>
                  <p className="text-[10px] font-bold tracking-[0.1em] uppercase text-white/55 mb-1">New this week</p>
                  <p className="text-5xl font-extrabold text-white leading-none tabular-nums">{p.counts.newAssets}</p>
                  <p className="text-xs text-white/55 mt-1.5">TTO assets indexed</p>
                </div>
                {p.deltas && p.deltas.newAssets !== 0 && (
                  <div className="flex items-center gap-2 text-sm font-bold text-white bg-white/15 border border-white/20 rounded-lg px-4 py-2.5 shrink-0">
                    <TrendingUp className="w-4 h-4" />
                    {p.deltas.newAssets > 0 ? "+" : ""}{p.deltas.newAssets} vs last week
                  </div>
                )}
              </div>

              {/* New assets */}
              {p.newAssets && (
                <section
                  className="rounded-xl overflow-hidden border border-[#dceee3] bg-white"
                  data-testid="recap-section-new-assets"
                >
                  <SectionBand title="New Assets" />
                  <div className="px-4 pt-3 pb-4 space-y-3">
                    {p.newAssets.byModality.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {p.newAssets.byModality.map((m) => (
                          <span
                            key={m.modality}
                            className="text-[11px] font-semibold text-[#166534] bg-[#f0fdf4] border border-[#bbf7d0] rounded-full px-2.5 py-0.5"
                          >
                            {m.modality} · {m.count}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="space-y-2">
                      {p.newAssets.top.map((h) => <HighlightRow key={h.id} h={h} />)}
                    </div>
                    <Link href="/industry/new-arrivals">
                      <a className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#166534] border border-[#166534] rounded-md px-3 py-1.5 hover:bg-[#f0fdf4] transition-colors self-start" data-testid="link-recap-see-all">
                        See all {p.newAssets.total} new assets
                        <ArrowRight className="w-3 h-3" />
                      </a>
                    </Link>
                  </div>
                </section>
              )}

              {/* Worth a look */}
              {p.worthALook && p.worthALook.length > 0 && (
                <section
                  className="rounded-xl overflow-hidden border border-[#dceee3] bg-white"
                  data-testid="recap-section-worth-a-look"
                >
                  <SectionBand title="Worth a Look" sub="EDEN-curated picks against your deal focus" />
                  <div className="px-4 pt-3 pb-4 space-y-2">
                    {p.worthALook.map((h) => <HighlightRow key={h.id} h={h} />)}
                  </div>
                </section>
              )}

              {/* Targeted alert matches only — catch-alls filtered out */}
              {targetedSignals.length > 0 && (
                <section
                  className="rounded-xl overflow-hidden border border-[#dceee3] bg-white"
                  data-testid="recap-section-market-signals"
                >
                  <SectionBand title="Alert Matches" />
                  <div className="px-4 pt-3 pb-4 space-y-4">
                    {targetedSignals.map((s, i) => (
                      <div key={i} data-testid={`recap-market-signal-${i}`}>
                        <div className="flex items-center justify-between mb-2">
                          <Link href="/alerts">
                            <a className="text-sm font-semibold text-foreground hover:text-[#166534] transition-colors" data-testid={`recap-alert-name-${i}`}>
                              {s.alertName}
                            </a>
                          </Link>
                          <span className="text-[11px] font-semibold text-white bg-[#166534] rounded-full px-2.5 py-0.5 tabular-nums">
                            {s.matchCount} match{s.matchCount === 1 ? "" : "es"}
                          </span>
                        </div>
                        <div className="space-y-2">
                          {s.topAssets.map((h) => <HighlightRow key={h.id} h={h} />)}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Top searches — only shown when meaningful (3+) */}
              {showSearches && (
                <section
                  className="rounded-xl overflow-hidden border border-[#dceee3] bg-white"
                  data-testid="recap-section-searches"
                >
                  <SectionBand title="Top Searches" />
                  <div className="px-4 pt-1 pb-3">
                    {meaningfulSearches.map((s, i) => (
                      <Link key={i} href={`/scout?q=${encodeURIComponent(s.query)}`}>
                        <a
                          className="flex items-center justify-between py-2.5 border-b border-[#f0f9f4] last:border-0 hover:bg-[#f6fdf7] -mx-4 px-4 transition-colors"
                          data-testid={`recap-search-${i}`}
                        >
                          <span className="text-sm font-medium text-foreground line-clamp-1">{s.query}</span>
                          <span className="text-xs text-muted-foreground shrink-0 ml-4 tabular-nums">{s.count} searches</span>
                        </a>
                      </Link>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
