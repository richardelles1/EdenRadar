import { Bookmark, X, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SavedAssetCard } from "./AssetCard";
import type { SavedAsset } from "@shared/schema";

type SavedAssetsPanelProps = {
  assets: SavedAsset[];
  isOpen: boolean;
  onClose: () => void;
  onDelete: (id: number) => void;
  onExportJson: () => void;
  onExportCsv: () => void;
};

export function SavedAssetsPanel({ assets, isOpen, onClose, onDelete, onExportJson, onExportCsv }: SavedAssetsPanelProps) {
  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={`fixed top-0 right-0 h-full w-80 bg-sidebar border-l border-sidebar-border z-50 flex flex-col transition-transform duration-300 ease-in-out ${isOpen ? "translate-x-0" : "translate-x-full"} lg:relative lg:translate-x-0 lg:block`}
        data-testid="panel-saved-assets"
      >
        <div className="flex items-center justify-between px-4 py-4 border-b border-sidebar-border shrink-0">
          <div className="flex items-center gap-2">
            <Bookmark className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm text-foreground">Saved Assets</span>
            {assets.length > 0 && (
              <span className="w-5 h-5 rounded-full bg-primary/15 text-primary text-xs flex items-center justify-center font-semibold">
                {assets.length}
              </span>
            )}
          </div>
          <Button variant="ghost" size="icon" className="w-7 h-7 lg:hidden" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        {assets.length > 0 && (
          <div className="px-4 py-3 border-b border-sidebar-border flex gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 h-8 text-xs gap-1.5 border-sidebar-border bg-transparent"
              onClick={onExportJson}
              data-testid="button-export-json"
            >
              <Download className="w-3 h-3" />
              JSON
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 h-8 text-xs gap-1.5 border-sidebar-border bg-transparent"
              onClick={onExportCsv}
              data-testid="button-export-csv"
            >
              <Download className="w-3 h-3" />
              CSV
            </Button>
          </div>
        )}

        <ScrollArea className="flex-1 min-h-0">
          {assets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-muted/50 flex items-center justify-center">
                <Bookmark className="w-6 h-6 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">No saved assets</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Save promising drug assets from your search results.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-4 flex flex-col gap-3">
              {assets.map((asset) => (
                <SavedAssetCard key={asset.id} asset={asset} onDelete={onDelete} />
              ))}
            </div>
          )}
        </ScrollArea>
      </aside>
    </>
  );
}
