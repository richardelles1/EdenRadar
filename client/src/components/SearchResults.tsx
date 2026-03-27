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
    <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-4 justify-items-start">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="relative w-[190px] h-[254px] rounded-[17px] overflow-hidden shrink-0"
          style={{
            background: "rgba(255,255,255,0.65)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
            border: "1px solid rgba(255,255,255,0.80)",
            boxShadow: "12px 17px 51px rgba(0,0,0,0.12)",
          }}
        >
          <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-emerald-300/60 dark:bg-emerald-500/30" />
          <div className="absolute inset-0 dark:block hidden" style={{ background: "rgba(24,24,27,0.75)", borderRadius: "inherit" }} />
          <div className="relative z-10 flex flex-col h-full pl-4 pr-3 pt-3 pb-3 gap-3">
            <div className="flex items-start justify-between">
              <div className="border border-emerald-300/50 dark:border-emerald-500/30 rounded-lg px-2 py-1 flex flex-col gap-1">
                <Skeleton className="h-2 w-8 bg-muted/60 dark:bg-zinc-700" />
                <Skeleton className="h-4 w-5 bg-muted/60 dark:bg-zinc-700" />
              </div>
              <Skeleton className="w-8 h-8 rounded-lg bg-muted/60 dark:bg-zinc-700" />
            </div>
            <div className="flex-1 flex flex-col gap-2 justify-center">
              <Skeleton className="h-3.5 w-full bg-muted/50 dark:bg-zinc-700" />
              <Skeleton className="h-3.5 w-4/5 bg-muted/50 dark:bg-zinc-700" />
              <Skeleton className="h-2.5 w-3/5 bg-muted/40 dark:bg-zinc-800 mt-1" />
            </div>
            <Skeleton className="h-7 w-full rounded-md bg-primary/20 dark:bg-zinc-700" />
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
            Search 26,000+ exclusive TTO assets from leading research institutions, ranked for your acquisition thesis.
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
      <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-4 justify-items-start">
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
