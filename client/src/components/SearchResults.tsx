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
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="border border-card-border rounded-lg p-5 bg-card flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 flex-1">
              <Skeleton className="w-8 h-8 rounded-md" />
              <Skeleton className="h-4 flex-1" />
            </div>
            <Skeleton className="w-14 h-6 rounded-md" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-5 w-20 rounded-sm" />
            <Skeleton className="h-5 w-24 rounded-sm" />
            <Skeleton className="h-5 w-16 rounded-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Skeleton className="h-3 w-10" />
              <Skeleton className="h-4 w-24" />
            </div>
            <div className="space-y-1">
              <Skeleton className="h-3 w-14" />
              <Skeleton className="h-4 w-20" />
            </div>
          </div>
          <Skeleton className="h-12 w-full rounded-md" />
          <div className="border-t border-card-border pt-3 flex items-center justify-between">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-6 w-20 rounded" />
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
            Try broader terms or enable "Include research sources" for wider coverage.
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
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
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
