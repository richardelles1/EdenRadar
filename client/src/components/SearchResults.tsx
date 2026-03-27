import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { AssetCard } from "./AssetCard";
import { FlaskConical, SearchX, Microscope } from "lucide-react";
import type { ScoredAsset } from "@/lib/types";

type SearchResultsProps = {
  assets: ScoredAsset[];
  isLoading: boolean;
  hasSearched: boolean;
  query?: string;
  savedAssetIds: Set<string>;
  onSave?: (asset: ScoredAsset) => void;
  onUnsave: (id: string, assetName?: string) => void;
  headerAction?: ReactNode;
};

function LoadingSkeleton() {
  return (
    <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(185px,220px))]">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="relative w-full h-[260px] rounded-[17px] overflow-hidden bg-white/80 dark:bg-zinc-900/85 border border-white/90 dark:border-white/10"
          style={{ boxShadow: "0 4px 20px rgba(0,0,0,0.08)" }}
        >
          <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-emerald-400/50 dark:bg-emerald-500/30" />
          {/* Flush score badge skeleton */}
          <div
            className="absolute top-0 left-0 z-10 flex flex-col items-center justify-center px-3 py-2 border-b border-r border-emerald-400/30 dark:border-emerald-500/20"
            style={{ borderRadius: "17px 0 10px 0", background: "rgba(255,255,255,0.4)", minWidth: "54px" }}
          >
            <Skeleton className="h-2 w-7 bg-muted/60 dark:bg-zinc-700 mb-1" />
            <Skeleton className="h-6 w-5 bg-muted/60 dark:bg-zinc-700" />
          </div>
          {/* Bookmark skeleton */}
          <Skeleton className="absolute top-2.5 right-2.5 w-7 h-7 rounded-lg bg-muted/50 dark:bg-zinc-700" />
          {/* Content below badge */}
          <div className="relative flex flex-col h-full pl-4 pr-3 pt-[62px] pb-3">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3.5 w-full bg-muted/50 dark:bg-zinc-700" />
              <Skeleton className="h-3.5 w-4/5 bg-muted/50 dark:bg-zinc-700" />
              <Skeleton className="h-3.5 w-3/5 bg-muted/50 dark:bg-zinc-700" />
            </div>
            <div className="mt-auto">
              <Skeleton className="h-3 w-3/4 bg-muted/40 dark:bg-zinc-800 mb-2" />
              <Skeleton className="h-7 w-full rounded-md bg-emerald-200/60 dark:bg-emerald-900/40" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function SearchResults({ assets, isLoading, hasSearched, query, savedAssetIds, onSave, onUnsave, headerAction }: SearchResultsProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Microscope className="w-4 h-4 animate-pulse text-primary" />
          <span>Scanning sources and scoring assets...</span>
        </div>
        <LoadingSkeleton />
      </div>
    );
  }

  if (!hasSearched) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
          <FlaskConical className="w-8 h-8 text-primary" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-1">Start Your Discovery</h3>
          <p className="text-muted-foreground text-sm max-w-sm">
            Search 300+ TTO assets from leading research institutions, ranked for your acquisition thesis.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2 max-w-lg">
          {["KRAS inhibitor", "CAR-T solid tumor", "GLP-1 obesity"].map((area) => (
            <span key={area} className="px-3 py-1 rounded-full border border-card-border bg-card text-xs text-muted-foreground">
              {area}
            </span>
          ))}
        </div>
      </div>
    );
  }

  if (assets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
        <div className="w-14 h-14 rounded-2xl bg-muted/50 flex items-center justify-center">
          <SearchX className="w-7 h-7 text-muted-foreground" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground mb-1">
            No TTO assets found for "{query}"
          </h3>
          <p className="text-muted-foreground text-sm max-w-xs">
            Try broader terms or check Research Sources in the sidebar for wider coverage.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2 mt-1">
          {["oncology", "gene therapy", "immunotherapy"].map((sug) => (
            <span key={sug} className="px-3 py-1 rounded-full border border-card-border bg-card text-xs text-muted-foreground">
              Try: {sug}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground" data-testid="results-count">
          <span className="text-foreground font-semibold">{assets.length}</span> ranked asset{assets.length !== 1 ? "s" : ""} found
          {query ? <> for "<span className="text-foreground">{query}</span>"</> : ""}
        </p>
        {headerAction ?? (
          <p className="text-xs text-muted-foreground hidden sm:block">
            Sorted by match score ↓
          </p>
        )}
      </div>
      <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(185px,220px))]">
        {assets.map((asset) => (
          <AssetCard
            key={asset.id}
            asset={asset}
            isSaved={savedAssetIds.has(asset.id)}
            onSave={onSave}
            onUnsave={onUnsave}
          />
        ))}
      </div>
    </div>
  );
}
