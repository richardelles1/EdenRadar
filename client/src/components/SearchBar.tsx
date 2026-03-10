import { useState } from "react";
import { Search, Loader2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  onSearch: (query: string, source: string) => void;
  isLoading: boolean;
  sources: Source[];
  selectedSource: string;
  onSourceChange: (source: string) => void;
};

const EXAMPLE_QUERIES = [
  "KRAS inhibitor pancreatic cancer",
  "solid tumor CAR-T therapy",
  "GLP-1 receptor agonist obesity",
  "mRNA cancer vaccine",
  "EGFR tyrosine kinase inhibitor lung cancer",
  "PD-1 checkpoint inhibitor melanoma",
];

export function SearchBar({ onSearch, isLoading, sources, selectedSource, onSourceChange }: SearchBarProps) {
  const [query, setQuery] = useState("");

  const currentSource = sources.find((s) => s.id === selectedSource);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim() && !isLoading) {
      onSearch(query.trim(), selectedSource);
    }
  };

  const handleExample = (q: string) => {
    setQuery(q);
    onSearch(q, selectedSource);
  };

  return (
    <div className="flex flex-col gap-4 w-full max-w-3xl mx-auto">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search biotech assets (e.g. KRAS inhibitors pancreatic cancer)"
            className="pl-10 h-11 bg-card border-card-border focus:border-primary/60 text-sm"
            data-testid="input-search"
            disabled={isLoading}
          />
        </div>
        {sources.length > 1 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="h-11 px-3 gap-1.5 border-card-border bg-card text-sm shrink-0"
                data-testid="button-source-select"
              >
                {currentSource?.label ?? "Source"}
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
              </Button>
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
        )}
        <Button
          type="submit"
          className="h-11 px-5 shrink-0"
          disabled={isLoading || !query.trim()}
          data-testid="button-search"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            "Search"
          )}
        </Button>
      </form>

      <div className="flex flex-wrap gap-2">
        {EXAMPLE_QUERIES.map((q) => (
          <button
            key={q}
            onClick={() => handleExample(q)}
            className="text-xs px-3 py-1.5 rounded-full border border-card-border bg-card text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all duration-200"
            data-testid={`button-example-query`}
            disabled={isLoading}
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}
