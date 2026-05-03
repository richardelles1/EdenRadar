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
      <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
        <Minus className="w-2.5 h-2.5" />0
      </span>
    );
  }
  const positive = value > 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${
        positive ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
      }`}
    >
      {positive ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
      {Math.abs(value)} vs last week
    </span>
  );
}

function SectionHeader({ icon: Icon, title }: { icon: any; title: string }) {
  return (
    <div className="flex items-center gap-1.5 mb-2">
      <Icon className="w-3.5 h-3.5 text-primary" />
      <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground">{title}</h3>
    </div>
  );
}

function HighlightRow({ h }: { h: Highlight }) {
  return (
    <Link href={`/scout?q=${encodeURIComponent(h.assetName)}`}>
      <a
        className="block rounded-md border border-border/60 px-3 py-2 hover:border-primary/40 hover:bg-primary/[0.03] transition-colors"
        data-testid={`recap-highlight-${h.id}`}
      >
        <p className="text-sm font-medium text-foreground line-clamp-1">{h.assetName}</p>
        <p className="text-[11px] text-muted-foreground line-clamp-1">
          {[h.institution, h.modality, h.indication].filter(Boolean).join(" · ") || "—"}
        </p>
        {h.reason && (
          <p className="text-[10px] text-primary/80 mt-0.5">{h.reason}</p>
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
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto" data-testid="modal-weekly-recap">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3 pr-6">
            <div className="space-y-1">
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                Weekly Recap
              </DialogTitle>
              <p className="text-xs text-muted-foreground" data-testid="text-recap-week-label">
                {p?.weekLabel ?? "—"}
                {data && !data.frozen && (
                  <span className="ml-2 inline-block px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-medium">
                    Live preview
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={goPreviousWeek}
                data-testid="button-recap-prev-week"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Previous
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
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

        {isLoading || !p ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* Summary headline */}
            <div className="rounded-lg border border-primary/20 bg-primary/[0.04] p-3" data-testid="recap-summary">
              <p className="text-sm text-foreground leading-relaxed">{p.summary}</p>
            </div>

            {/* Headline counts with WoW deltas */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { key: "newAssets" as const, label: "New assets", value: p.counts.newAssets },
                { key: "saves" as const, label: p.isSolo ? "Saved" : "Team saves", value: p.counts.saves },
                { key: "statusChanges" as const, label: "Status moves", value: p.counts.statusChanges },
                { key: "marketListings" as const, label: "Market listings", value: p.counts.marketListings },
              ].map((c) => (
                <div key={c.key} className="rounded-md border border-border/60 px-3 py-2" data-testid={`recap-count-${c.key}`}>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{c.label}</p>
                  <p className="text-lg font-semibold text-foreground">{c.value}</p>
                  {p.deltas && <DeltaPill value={p.deltas[c.key]} />}
                </div>
              ))}
            </div>

            {/* New assets */}
            {p.newAssets && (
              <section data-testid="recap-section-new-assets">
                <SectionHeader icon={Package} title={`New assets (${p.newAssets.total})`} />
                {p.newAssets.byModality.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {p.newAssets.byModality.map((m) => (
                      <Badge key={m.modality} variant="secondary" className="text-[10px]">
                        {m.modality} · {m.count}
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="space-y-1.5">
                  {p.newAssets.top.map((h) => <HighlightRow key={h.id} h={h} />)}
                </div>
              </section>
            )}

            {/* Activity */}
            {p.activity && (
              <section data-testid="recap-section-activity">
                <SectionHeader icon={Activity} title={p.activity.label} />
                <ul className="space-y-1.5">
                  {p.activity.entries.map((a, i) => (
                    <li key={i} className="text-xs text-muted-foreground" data-testid={`recap-activity-${i}`}>
                      {p.isSolo ? (
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
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Top searches */}
            {p.topSearches && p.topSearches.length > 0 && (
              <section data-testid="recap-section-searches">
                <SectionHeader icon={Search} title="Top searches" />
                <div className="space-y-1">
                  {p.topSearches.map((s, i) => (
                    <Link key={i} href={`/scout?q=${encodeURIComponent(s.query)}`}>
                      <a className="flex items-center justify-between text-xs px-2 py-1 rounded hover:bg-accent/60" data-testid={`recap-search-${i}`}>
                        <span className="text-foreground line-clamp-1">{s.query}</span>
                        <span className="text-muted-foreground text-[10px] shrink-0">×{s.count}</span>
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
                <div className="space-y-3">
                  {p.marketSignals.map((s, i) => (
                    <div key={i} data-testid={`recap-market-signal-${i}`}>
                      <p className="text-xs text-muted-foreground mb-1">
                        <span className="font-medium text-foreground">{s.alertName}</span> — {s.matchCount} new match{s.matchCount === 1 ? "" : "es"}
                      </p>
                      <div className="space-y-1.5">
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
                <p className="text-xs text-muted-foreground">
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
                <div className="space-y-1.5">
                  {p.worthALook.map((h) => <HighlightRow key={h.id} h={h} />)}
                </div>
              </section>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
