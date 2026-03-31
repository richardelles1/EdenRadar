import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import {
  Newspaper,
  Building2,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  ArrowLeft,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

type NewArrivalsAsset = {
  id: number;
  assetName: string;
  institution: string;
  modality: string | null;
  indication: string | null;
  completenessScore: number | null;
  firstSeenAt: string;
};

type NewArrivalsResponse = {
  assets: NewArrivalsAsset[];
  institutions: { institution: string; count: number }[];
  total: number;
  window: string;
  hasMore: boolean;
};

function timeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(ms / 3600000);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(ms / 86400000);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function InstitutionGroup({
  institution,
  assets,
  defaultOpen,
}: {
  institution: string;
  assets: NewArrivalsAsset[];
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [, navigate] = useLocation();

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden" data-testid={`institution-group-${institution}`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-primary/3 transition-colors text-left"
        data-testid={`button-group-toggle-${institution}`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
            <Building2 className="w-3.5 h-3.5 text-primary" />
          </div>
          <span className="text-sm font-semibold text-foreground truncate">{institution}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium tabular-nums shrink-0">
            {assets.length}
          </span>
        </div>
        {open ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {open && (
        <div className="border-t border-border/60 divide-y divide-border/40">
          {assets.map((asset) => (
            <button
              key={asset.id}
              onClick={() => navigate(`/asset/${asset.id}`)}
              className="w-full text-left flex items-center justify-between gap-3 px-4 py-3 hover:bg-primary/5 transition-colors group"
              data-testid={`new-arrival-asset-${asset.id}`}
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-foreground group-hover:text-primary transition-colors truncate">
                  {asset.assetName}
                </p>
                {asset.indication && asset.indication !== "unknown" && (
                  <p className="text-[10px] text-muted-foreground truncate mt-0.5 capitalize">{asset.indication}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {asset.modality && asset.modality !== "unknown" && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/15 capitalize hidden sm:inline-block">
                    {asset.modality}
                  </span>
                )}
                {asset.completenessScore !== null && asset.completenessScore > 0 && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-600 border border-green-500/20 tabular-nums hidden sm:inline-block">
                    {Math.round(asset.completenessScore)}%
                  </span>
                )}
                <span className="text-[10px] text-muted-foreground/60 tabular-nums">{timeAgo(asset.firstSeenAt)}</span>
                <ArrowRight className="w-3 h-3 text-muted-foreground/40 group-hover:text-primary transition-colors" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const PAGE_SIZE = 500;

export default function NewArrivals() {
  const [window, setWindow] = useState<"7d" | "30d">("7d");
  const [accumulated, setAccumulated] = useState<NewArrivalsAsset[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const { toast } = useToast();

  const { data, isLoading } = useQuery<NewArrivalsResponse>({
    queryKey: [`/api/browse/new-arrivals?window=${window}&limit=${PAGE_SIZE}&offset=0`],
    staleTime: 5 * 60 * 1000,
  });

  // Reset accumulated assets when window changes
  const handleWindowChange = useCallback((w: "7d" | "30d") => {
    setWindow(w);
    setAccumulated([]);
  }, []);

  const baseAssets = data?.assets ?? [];
  const institutions = data?.institutions ?? [];
  const total = data?.total ?? 0;

  // Combine base page with any additionally loaded pages
  const allAssets = accumulated.length > 0 ? accumulated : baseAssets;
  const hasMore = allAssets.length < total;

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    const nextOffset = allAssets.length;
    try {
      const resp = await fetch(`/api/browse/new-arrivals?window=${window}&limit=${PAGE_SIZE}&offset=${nextOffset}`);
      const json: NewArrivalsResponse = await resp.json();
      const combined = [...allAssets, ...json.assets];
      setAccumulated(combined);
    } catch (_) {
      toast({ title: "Failed to load more assets", variant: "destructive" });
    } finally {
      setLoadingMore(false);
    }
  }, [window, allAssets]);

  const byInstitution: Record<string, NewArrivalsAsset[]> = {};
  for (const asset of allAssets) {
    const key = asset.institution || "Unknown";
    if (!byInstitution[key]) byInstitution[key] = [];
    byInstitution[key].push(asset);
  }

  const orderedInstitutions = institutions.map((i) => i.institution);

  return (
    <div className="min-h-full">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* Header */}
        <div className="space-y-3">
          <Link href="/industry/dashboard">
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary transition-colors cursor-pointer">
              <ArrowLeft className="w-3 h-3" /> Dashboard
            </span>
          </Link>

          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Newspaper className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">New Arrivals</h1>
                <p className="text-[11px] text-muted-foreground">
                  {isLoading ? "Loading..." : `${data?.total ?? 0} new asset${(data?.total ?? 0) !== 1 ? "s" : ""} in the last ${window === "7d" ? "7 days" : "30 days"}`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
              <button
                onClick={() => handleWindowChange("7d")}
                className={`text-[11px] px-3 py-1 rounded-md transition-colors ${window === "7d" ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground hover:text-foreground"}`}
                data-testid="toggle-7d"
              >
                Last 7 days
              </button>
              <button
                onClick={() => handleWindowChange("30d")}
                className={`text-[11px] px-3 py-1 rounded-md transition-colors ${window === "30d" ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground hover:text-foreground"}`}
                data-testid="toggle-30d"
              >
                Last 30 days
              </button>
            </div>
          </div>
        </div>

        {/* Institution summary */}
        {!isLoading && institutions.length > 0 && (
          <p className="text-[11px] text-muted-foreground truncate whitespace-nowrap overflow-hidden" data-testid="institution-summary">
            From {institutions.length.toLocaleString()} institution{institutions.length !== 1 ? "s" : ""}{institutions.length > 0 && (
              <> — {institutions.slice(0, 3).map((i) => i.institution).join(", ")}{institutions.length > 3 ? " and more" : ""}</>
            )}
          </p>
        )}

        {/* Asset groups by institution */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-2">
                <Skeleton className="h-6 w-48 rounded" />
                <Skeleton className="h-10 rounded-lg" />
                <Skeleton className="h-10 rounded-lg" />
              </div>
            ))}
          </div>
        ) : allAssets.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-10 text-center space-y-3">
            <Newspaper className="w-8 h-8 text-muted-foreground/40 mx-auto" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">No new assets yet</p>
              <p className="text-xs text-muted-foreground">
                Try expanding the window to 30 days, or check back after the next sync.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {orderedInstitutions.map((inst, idx) => {
              const instAssets = byInstitution[inst] ?? [];
              if (instAssets.length === 0) return null;
              return (
                <InstitutionGroup
                  key={inst}
                  institution={inst}
                  assets={instAssets}
                  defaultOpen={idx < 3}
                />
              );
            })}

            {hasMore && (
              <div className="pt-2 text-center">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="text-xs px-5 py-2 rounded-lg border border-border hover:border-primary/40 hover:bg-primary/5 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                  data-testid="button-load-more"
                >
                  {loadingMore ? "Loading..." : `Load more (${total - allAssets.length} remaining)`}
                </button>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
