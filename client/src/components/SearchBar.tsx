import { useState } from "react";
import { Search, Loader2, X, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Source = {
  id: string;
  label: string;
  description: string;
};

type SearchBarProps = {
  query: string;
  onQueryChange: (q: string) => void;
  onSearch: (query: string, source: string) => void;
  onClear?: () => void;
  isLoading: boolean;
  sources: Source[];
  selectedSource: string;
  onSourceChange: (source: string) => void;
  placeholder?: string;
};

export function SearchBar({
  query = "",
  onQueryChange,
  onSearch,
  onClear,
  isLoading,
  sources,
  selectedSource,
  onSourceChange,
  placeholder = "Search biotech assets...",
}: SearchBarProps) {
  const [focused, setFocused] = useState(false);
  const currentSource = sources.find((s) => s.id === selectedSource);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim() && !isLoading) {
      onSearch(query.trim(), selectedSource);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-center w-full rounded-xl border bg-card transition-all duration-200"
      style={{
        borderColor: focused
          ? "hsl(var(--primary) / 0.50)"
          : "hsl(var(--border))",
        boxShadow: focused
          ? "0 0 0 3px hsl(var(--primary) / 0.08), 0 4px 20px hsl(var(--primary) / 0.10)"
          : "0 1px 6px hsl(var(--foreground) / 0.04)",
      }}
    >
      {/* Leading icon */}
      <div className="pl-4 pr-1 shrink-0 flex items-center">
        {isLoading ? (
          <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
        ) : (
          <Search className="w-4 h-4 text-muted-foreground/70" />
        )}
      </div>

      {/* Input */}
      <input
        type="text"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        className="flex-1 h-14 px-2 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/45 outline-none min-w-0"
        data-testid="input-search"
        disabled={isLoading}
      />

      {/* Trailing area — clear button or keyboard hint */}
      <div className="flex items-center gap-1.5 px-2 shrink-0">
        {query.trim().length > 0 ? (
          onClear && (
            <button
              type="button"
              onClick={onClear}
              tabIndex={-1}
              className="p-1 rounded-md text-muted-foreground/50 hover:text-muted-foreground hover:bg-accent/70 transition-colors"
              data-testid="button-clear-search"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )
        ) : (
          <div className="hidden sm:flex items-center gap-0.5 select-none pointer-events-none">
            <kbd className="text-[9px] font-mono text-muted-foreground/30 px-1 py-0.5 rounded border border-border/40 bg-muted/20 leading-none">
              ⌘
            </kbd>
            <kbd className="text-[9px] font-mono text-muted-foreground/30 px-1 py-0.5 rounded border border-border/40 bg-muted/20 leading-none">
              K
            </kbd>
          </div>
        )}
      </div>

      {/* Source selector — only when sources provided */}
      {sources.length > 1 && (
        <>
          <div className="h-5 w-px bg-border/50 shrink-0 mx-1" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors shrink-0"
                data-testid="button-source-select"
              >
                {currentSource?.label ?? "Source"}
                <ChevronDown className="w-3 h-3 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {sources.map((s) => (
                <DropdownMenuItem
                  key={s.id}
                  onClick={() => onSourceChange(s.id)}
                  className={selectedSource === s.id ? "text-primary" : ""}
                  data-testid={`option-source-${s.id}`}
                >
                  <div>
                    <div className="font-medium text-sm">{s.label}</div>
                    <div className="text-xs text-muted-foreground">{s.description}</div>
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}

      {/* Divider */}
      <div className="h-5 w-px bg-border/50 shrink-0 mx-1" />

      {/* Submit */}
      <button
        type="submit"
        disabled={isLoading || !query.trim()}
        className="mx-2 h-9 px-5 rounded-lg bg-primary text-primary-foreground text-[11px] font-mono font-bold uppercase tracking-[0.1em] transition-all duration-150 hover:bg-primary/85 active:scale-[0.97] disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
        data-testid="button-search"
      >
        Search
      </button>
    </form>
  );
}
