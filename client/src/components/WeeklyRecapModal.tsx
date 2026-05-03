import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Minus,
  Sparkles,
  Activity,
  Search,
  Bell,
  ShoppingBag,
  Star,
  Package,
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
  activity?: {
    label: "Team activity" | "Your activity";
    entries: Array<{ action: string; actorName: string; userId: string; assetId: number | null; assetName: string; at: string }>;
  };
  topSearches?: Array<{ query: string; count: number }>;
  marketSignals?: Array<{ alertName: string; matchCount: number; topAssets: Highlight[] }>;
  edenMarket?: { count: number };
  worthALook?: Highlight[];
};

type RecapResponse = {
  weekStart: string;
  frozen: boolean;
  payload: RecapPayload;
};

function DeltaPill({ value }: { value: number }) {
  if (value === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground">
        <Minus className="w-3 h-3" />0
      </span>
    );
  }
  const positive = value > 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${
        positive ? "text-primary" : "text-amber-600 dark:text-amber-400"
      }`}
    >
      {positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {Math.abs(value)} vs last week
    </span>
  );
}

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
  return (
    <Link href={assetHref(h.id, h.assetName)}>
      <a
        className="block rounded-lg border border-border/50 bg-white dark:bg-card px-4 py-3 hover:border-primary/40 hover:bg-primary/[0.04] transition-colors"
        data-testid={`recap-highlight-${h.id}`}
      >
        <p className="text-sm font-semibold text-foreground line-clamp-1">{h.assetName}</p>
        <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
          {[h.institution, h.modality, h.indication].filter(Boolean).join(" · ") || "—"}
        </p>
        {h.reason && (
          <p className="text-[11px] text-primary mt-1.5 font-medium">{h.reason}</p>
        )}
      </a>
    </Link>
  );
}

function actionVerb(action: string, isSolo: boolean): string {
  switch (action) {
    case "saved_asset": return isSolo ? "you saved" : "saved";
    case "moved_asset": return isSolo ? "you moved" : "moved";
    case "added_note": return isSolo ? "you added a note to" : "added a note to";
    case "removed_asset": return isSolo ? "you removed" : "removed";
    default: return action;
  }
}

export function WeeklyRecapModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // null = current week (live preview); otherwise a Monday ISO string.
  const [weekKey, setWeekKey] = useState<string | null>(null);

  // Default queryFn (queryClient.ts) attaches Supabase auth headers and uses
  // queryKey[0] as the URL, so we encode the full path there.
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

  // "On current" means we're showing the in-progress week — either the live
  // sentinel (weekKey === null) or an explicit Monday equal to this week's.
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
                {p?.weekLabel ?? "—"}
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
              {/* Summary headline */}
              <div
                className="rounded-xl border border-primary/20 bg-primary/[0.05] px-5 py-4"
                data-testid="recap-summary"
              >
                <p className="text-base text-foreground leading-relaxed">{p.summary}</p>
              </div>

              {/* Headline counts with WoW deltas */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { key: "newAssets" as const, label: "New assets", value: p.counts.newAssets },
                  { key: "saves" as const, label: p.isSolo ? "Saved" : "Team saves", value: p.counts.saves },
                  { key: "statusChanges" as const, label: "Status moves", value: p.counts.statusChanges },
                  { key: "marketListings" as const, label: "Market listings", value: p.counts.marketListings },
                ].map((c) => (
                  <div
                    key={c.key}
                    className="rounded-xl border border-border/60 bg-white dark:bg-card px-4 py-3"
                    data-testid={`recap-count-${c.key}`}
                  >
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">{c.label}</p>
                    <p className="text-2xl font-semibold text-foreground mt-1.5">{c.value}</p>
                    {p.deltas && <div className="mt-1"><DeltaPill value={p.deltas[c.key]} /></div>}
                  </div>
                ))}
              </div>

              {/* New assets */}
              {p.newAssets && (
                <section data-testid="recap-section-new-assets">
                  <SectionHeader icon={Package} title={`New assets (${p.newAssets.total})`} />
                  {p.newAssets.byModality.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {p.newAssets.byModality.map((m) => (
                        <Badge key={m.modality} variant="secondary" className="text-[11px] bg-primary/10 text-primary border-0 hover:bg-primary/15">
                          {m.modality} · {m.count}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <div className="space-y-2">
                    {p.newAssets.top.map((h) => <HighlightRow key={h.id} h={h} />)}
                  </div>
                </section>
              )}

              {/* Activity */}
              {p.activity && (
                <section data-testid="recap-section-activity">
                  <SectionHeader icon={Activity} title={p.activity.label} />
                  <ul className="space-y-2">
                    {p.activity.entries.map((a, i) => {
                      const content = p.isSolo ? (
                        <>
                          <span className="text-foreground">{actionVerb(a.action, true)}</span>{" "}
                          <span className="font-medium text-foreground">{a.assetName}</span>
                        </>
                      ) : (
                        <>
                          <span className="font-medium text-foreground">{a.actorName}</span>{" "}
                          {actionVerb(a.action, false)}{" "}
                          <span className="font-medium text-foreground">{a.assetName}</span>
                        </>
                      );
                      // Always link the activity row — `assetHref` falls back
                      // to /scout?q=... when there's no resolvable id, so the
                      // entry is never rendered as dead text.
                      const liClass = "text-sm text-muted-foreground rounded-md px-3 py-2 hover:bg-primary/[0.04] transition-colors";
                      return (
                        <li key={i} data-testid={`recap-activity-${i}`}>
                          <Link href={assetHref(a.assetId, a.assetName)}>
                            <a className={`block ${liClass}`}>{content}</a>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
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
                          <span className="text-muted-foreground text-xs shrink-0">×{s.count}</span>
                        </a>
                      </Link>
                    ))}
                  </div>
                </section>
              )}

              {/* Market signals */}
              {p.marketSignals && p.marketSignals.length > 0 && (
                <section data-testid="recap-section-market-signals">
                  <SectionHeader icon={Bell} title="Market signals" />
                  <div className="space-y-4">
                    {p.marketSignals.map((s, i) => (
                      <div key={i} data-testid={`recap-market-signal-${i}`}>
                        <p className="text-sm text-muted-foreground mb-2">
                          <span className="font-semibold text-foreground">{s.alertName}</span> — {s.matchCount} new match{s.matchCount === 1 ? "" : "es"}
                        </p>
                        <div className="space-y-2">
                          {s.topAssets.map((h) => <HighlightRow key={h.id} h={h} />)}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* EdenMarket new listings */}
              {p.edenMarket && (
                <section data-testid="recap-section-edenmarket">
                  <SectionHeader icon={ShoppingBag} title="EdenMarket" />
                  <p className="text-sm text-muted-foreground">
                    {p.edenMarket.count} new listing{p.edenMarket.count === 1 ? "" : "s"} on{" "}
                    <Link href="/market">
                      <a className="text-primary hover:underline font-medium" data-testid="link-recap-edenmarket">EdenMarket</a>
                    </Link>{" "}
                    this week.
                  </p>
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
