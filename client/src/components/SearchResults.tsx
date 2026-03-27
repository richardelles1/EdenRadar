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
          className="relative w-[192px] h-56 rounded-xl overflow-hidden shrink-0"
          style={{ background: "#3d3c3d" }}
        >
          <div className="absolute inset-0.5 rounded-[10px]" style={{ background: "#323132" }} />
          <div className="relative flex flex-col h-full px-3 pt-3 pb-3 gap-3">
            <div className="flex items-start justify-between">
              <div className="flex flex-col gap-1">
                <Skeleton className="h-2 w-8 bg-zinc-700" />
                <Skeleton className="h-5 w-6 bg-zinc-700" />
              </div>
              <Skeleton className="w-9 h-9 rounded-lg bg-zinc-700" />
            </div>
            <div className="flex-1 flex flex-col gap-2 justify-center">
              <Skeleton className="h-3.5 w-full bg-zinc-700" />
              <Skeleton className="h-3.5 w-4/5 bg-zinc-700" />
              <Skeleton className="h-2.5 w-3/5 bg-zinc-800 mt-1" />
            </div>
            <Skeleton className="h-7 w-full rounded-md bg-zinc-700" />
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
