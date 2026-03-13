import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import {
  Bell,
  ExternalLink,
  Search,
  Building2,
  Calendar,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getResearcherProfile } from "@/hooks/use-researcher";

type SearchResult = {
  id: string;
  title: string;
  text: string;
  url: string;
  date: string;
  institution_or_sponsor: string;
  source_key?: string;
};
type SearchResponse = { assets: { signals: SearchResult[] }[] };

export default function ResearchAlerts() {
  const profile = getResearcherProfile();
  const [, navigate] = useLocation();
  const primaryArea = profile.researchAreas[0] ?? "";
  const [filter, setFilter] = useState("");

  const { data, isLoading } = useQuery<SearchResponse>({
    queryKey: ["/api/search", primaryArea, "pubmed", "alerts"],
    queryFn: async () => {
      const r = await fetch(`/api/search?q=${encodeURIComponent(primaryArea)}&sources=pubmed&maxPerSource=20`);
      if (!r.ok) throw new Error("Failed to fetch alerts");
      return r.json();
    },
    enabled: !!primaryArea,
  });

  const allSignals = useMemo(() => {
    return data?.assets?.flatMap((a) => a.signals ?? []) ?? [];
  }, [data]);

  const filtered = useMemo(() => {
    if (!filter.trim()) return allSignals;
    const q = filter.toLowerCase();
    return allSignals.filter(
      (s) =>
        s.title?.toLowerCase().includes(q) ||
        s.text?.toLowerCase().includes(q) ||
        s.institution_or_sponsor?.toLowerCase().includes(q)
    );
  }, [allSignals, filter]);

  if (!primaryArea) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="flex items-center gap-2 mb-6">
          <Bell className="w-5 h-5 text-amber-500" />
          <h1 className="text-xl font-bold text-foreground">My Alerts</h1>
        </div>
        <div className="border border-dashed border-border rounded-lg p-10 text-center">
          <Bell className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground mb-3">
            Set a research area in your profile to activate alerts.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/research/profile")}
            data-testid="button-go-to-profile"
          >
            Go to Profile
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-amber-500" />
          <h1 className="text-xl font-bold text-foreground">My Alerts</h1>
          <Badge variant="secondary" className="text-xs bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30">
            {primaryArea}
          </Badge>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Filter alerts..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="pl-10"
          data-testid="input-alert-filter"
        />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="border border-border rounded-lg p-6 text-center text-sm text-muted-foreground">
          {filter ? "No alerts match your filter." : "No alerts found for this research area."}
        </div>
      ) : (
        <div className="space-y-3" data-testid="alerts-feed">
          <p className="text-xs text-muted-foreground">{filtered.length} alert{filtered.length !== 1 ? "s" : ""}</p>
          {filtered.map((signal, i) => (
            <div
              key={signal.id ?? i}
              className="border border-border rounded-lg p-4 bg-card hover:border-amber-500/30 transition-colors"
              data-testid={`alert-card-${i}`}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <h3 className="text-sm font-semibold text-foreground leading-snug line-clamp-2">{signal.title}</h3>
                {signal.url && (
                  <a
                    href={signal.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                    data-testid={`alert-link-${i}`}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
              {signal.text && (
                <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed mb-2">{signal.text}</p>
              )}
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                {signal.date && (
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {signal.date}
                  </span>
                )}
                {signal.institution_or_sponsor && (
                  <span className="flex items-center gap-1">
                    <Building2 className="w-3 h-3" />
                    {signal.institution_or_sponsor}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
