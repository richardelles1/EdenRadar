import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Sparkles,
  Search,
  Bell,
  Star,
  Package,
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

function SectionHeader({ icon: Icon, title }: { icon: any; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-primary/10 text-primary">
        <Icon className="w-4 h-4" />
      </span>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
    </div>
  );
}

function assetHref(id: number | null | undefined, fallbackName: string): string {
  if (id != null && Number.isFinite(id) && id > 0) return `/asset/${id}`;
  return `/scout?q=${encodeURIComponent(fallbackName)}`;
}

function HighlightRow({ h }: { h: Highlight }) {
  const meta = [h.institution, h.modality, h.indication].filter(Boolean).join(" · ");
  return (
    <Link href={assetHref(h.id, h.assetName)}>
      <a
        className="flex items-start gap-3 rounded-lg border border-border/50 bg-white dark:bg-card px-4 py-3 hover:border-primary/40 hover:bg-primary/[0.03] transition-colors"
        data-testid={`recap-highlight-${h.id}`}
      >
        <span className="mt-0.5 w-1 self-stretch rounded-full bg-primary/30 shrink-0" />
        <div className="min-w-0">
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl max-h-[88vh] overflow-y-auto bg-background p-0"
        data-testid="modal-weekly-recap"
      >
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/60 bg-gradient-to-b from-primary/[0.06] to-transparent">
          <div className="flex items-start justify-between gap-3 pr-6">
            <div className="space-y-1.5">
              <DialogTitle className="flex items-center gap-2 text-lg">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 text-primary">
                  <Sparkles className="w-4 h-4" />
                </span>
                Weekly Recap
              </DialogTitle>
              <p className="text-sm text-muted-foreground" data-testid="text-recap-week-label">
                {p?.weekLabel ?? "Loading..."}
                {data && !data.frozen && (
                  <span className="ml-2 inline-block px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-medium">
                    Live preview
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2.5 text-xs"
                onClick={goPreviousWeek}
                data-testid="button-recap-prev-week"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Previous
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2.5 text-xs"
                onClick={goNextWeek}
                disabled={onCurrent}
                data-testid="button-recap-next-week"
              >
                Next
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="px-6 py-6">
          {isLoading || !p ? (
            <div className="space-y-4">
              <Skeleton className="h-20 w-full rounded-xl" />
              <Skeleton className="h-28 w-full rounded-xl" />
              <Skeleton className="h-28 w-full rounded-xl" />
            </div>
          ) : (
            <div className="space-y-7">

              {/* Hero stat */}
              <div
                className="rounded-xl border border-primary/20 bg-primary/[0.05] px-5 py-4 flex items-center justify-between gap-4"
                data-testid="recap-summary"
              >
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-primary font-semibold mb-1">New this week</p>
                  <p className="text-3xl font-bold text-foreground tabular-nums">{p.counts.newAssets}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">TTO assets indexed</p>
                </div>
                {p.deltas && p.deltas.newAssets !== 0 && (
                  <div className="flex items-center gap-1.5 text-sm font-medium text-primary bg-primary/10 rounded-lg px-3 py-2 shrink-0">
                    <TrendingUp className="w-4 h-4" />
                    {p.deltas.newAssets > 0 ? "+" : ""}{p.deltas.newAssets} vs last week
                  </div>
                )}
              </div>

              {/* New assets */}
              {p.newAssets && (
                <section data-testid="recap-section-new-assets">
                  <SectionHeader icon={Package} title={`New assets (${p.newAssets.total})`} />
                  {p.newAssets.byModality.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {p.newAssets.byModality.map((m) => (
                        <Badge
                          key={m.modality}
                          variant="secondary"
                          className="text-[11px] bg-primary/10 text-primary border-0 hover:bg-primary/15 font-medium"
                        >
                          {m.modality} · {m.count}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <div className="space-y-2">
                    {p.newAssets.top.map((h) => <HighlightRow key={h.id} h={h} />)}
                  </div>
                  <Link href="/industry/new-arrivals">
                    <a className="mt-3 flex items-center gap-1.5 text-xs text-primary hover:underline font-medium" data-testid="link-recap-see-all">
                      See all {p.newAssets.total} new assets
                      <ArrowRight className="w-3 h-3" />
                    </a>
                  </Link>
                </section>
              )}

              {/* Top searches */}
              {p.topSearches && p.topSearches.length > 0 && (
                <section data-testid="recap-section-searches">
                  <SectionHeader icon={Search} title="Top searches" />
                  <div className="space-y-1.5">
                    {p.topSearches.map((s, i) => (
                      <Link key={i} href={`/scout?q=${encodeURIComponent(s.query)}`}>
                        <a
                          className="flex items-center justify-between text-sm px-3 py-2 rounded-md hover:bg-primary/[0.05] transition-colors"
                          data-testid={`recap-search-${i}`}
                        >
                          <span className="text-foreground line-clamp-1">{s.query}</span>
                          <span className="text-muted-foreground text-xs shrink-0 tabular-nums">{s.count} searches</span>
                        </a>
                      </Link>
                    ))}
                  </div>
                </section>
              )}

              {/* Market signals (alert matches) */}
              {p.marketSignals && p.marketSignals.length > 0 && (
                <section data-testid="recap-section-market-signals">
                  <SectionHeader icon={Bell} title="Alert matches" />
                  <div className="space-y-4">
                    {p.marketSignals.map((s, i) => (
                      <div key={i} data-testid={`recap-market-signal-${i}`}>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-sm font-semibold text-foreground">{s.alertName}</p>
                          <span className="text-xs text-muted-foreground tabular-nums">{s.matchCount} new match{s.matchCount === 1 ? "" : "es"}</span>
                        </div>
                        <div className="space-y-2">
                          {s.topAssets.map((h) => <HighlightRow key={h.id} h={h} />)}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Worth a look */}
              {p.worthALook && p.worthALook.length > 0 && (
                <section data-testid="recap-section-worth-a-look">
                  <SectionHeader icon={Star} title="Worth a look" />
                  <div className="space-y-2">
                    {p.worthALook.map((h) => <HighlightRow key={h.id} h={h} />)}
                  </div>
                </section>
              )}

            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
