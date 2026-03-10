import { History, Search, TrendingUp } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { SearchHistory } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";

type SearchHistoryPanelProps = {
  history: SearchHistory[];
  onRerunSearch: (query: string, source: string) => void;
};

export function SearchHistoryPanel({ history, onRerunSearch }: SearchHistoryPanelProps) {
  if (history.length === 0) return null;

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 mb-3">
        <History className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Recent Searches</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {history.slice(0, 8).map((entry) => (
          <button
            key={entry.id}
            onClick={() => onRerunSearch(entry.query, entry.source)}
            className="group flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-card-border bg-card text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all duration-200"
            data-testid={`button-history-${entry.id}`}
            title={`${entry.resultCount} assets · ${formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}`}
          >
            <Search className="w-3 h-3" />
            <span className="truncate max-w-[160px]">{entry.query}</span>
            {entry.resultCount > 0 && (
              <span className="text-[10px] text-primary">{entry.resultCount}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
