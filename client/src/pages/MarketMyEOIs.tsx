import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronRight, EyeOff, FileText, Bell, Trash2, Play, Pencil, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { MarketEoi, MarketListing, MarketSavedSearch } from "@shared/schema";

const ENGAGEMENT_LABELS: Record<string, string> = {
  actively_seeking: "Actively Seeking",
  quietly_inbound: "Quietly Inbound",
  under_loi: "Under LOI",
  closed: "Closed",
};

function buildBrowseUrl(s: MarketSavedSearch): string {
  const p = new URLSearchParams();
  const f = s.filters || {};
  if (f.therapeuticArea) p.set("ta", f.therapeuticArea);
  if (f.modality) p.set("modality", f.modality);
  if (f.stage) p.set("stage", f.stage);
  if (f.engagementStatus) p.set("engagement", f.engagementStatus);
  if (f.priceRangeMinM != null) p.set("min", String(f.priceRangeMinM));
  if (f.priceRangeMaxM != null) p.set("max", String(f.priceRangeMaxM));
  if (s.keyword) p.set("keyword", s.keyword);
  const qs = p.toString();
  return qs ? `/market?${qs}` : "/market";
}

function filterSummary(s: MarketSavedSearch): string {
  const f = s.filters || {};
  const parts: string[] = [];
  if (s.keyword) parts.push(`"${s.keyword}"`);
  if (f.therapeuticArea) parts.push(f.therapeuticArea);
  if (f.modality) parts.push(f.modality);
  if (f.stage) parts.push(f.stage);
  if (f.engagementStatus) parts.push(ENGAGEMENT_LABELS[f.engagementStatus] ?? f.engagementStatus);
  if (f.priceRangeMinM != null) parts.push(`≥ $${f.priceRangeMinM}M`);
  if (f.priceRangeMaxM != null) parts.push(`≤ $${f.priceRangeMaxM}M`);
  return parts.length ? parts.join(" · ") : "Any listing";
}

type EoiWithListing = MarketEoi & { listing: MarketListing | null };

const STATUS_COLORS: Record<string, string> = {
  submitted: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  viewed: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  accepted: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  declined: "bg-destructive/10 text-destructive border-destructive/20",
};

export default function MarketMyEOIs() {
  const { session } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: eois = [], isLoading } = useQuery<EoiWithListing[]>({
    queryKey: ["/api/market/my-eois"],
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const res = await fetch("/api/market/my-eois", {
        headers: { Authorization: `Bearer ${session!.access_token}`, "x-user-id": session!.user.id },
      });
      if (!res.ok) throw new Error("Failed to load EOIs");
      return res.json();
    },
  });

  const { data: savedSearches = [], isLoading: savedLoading } = useQuery<MarketSavedSearch[]>({
    queryKey: ["/api/market/saved-searches"],
    staleTime: 60 * 1000,
    queryFn: async () => {
      const res = await fetch("/api/market/saved-searches", {
        headers: { Authorization: `Bearer ${session!.access_token}`, "x-user-id": session!.user.id },
      });
      if (!res.ok) throw new Error("Failed to load saved searches");
      return res.json();
    },
  });

  const [renameId, setRenameId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renamePending, setRenamePending] = useState(false);

  async function handleDelete(id: number, name: string) {
    try {
      await apiRequest("DELETE", `/api/market/saved-searches/${id}`);
      await queryClient.invalidateQueries({ queryKey: ["/api/market/saved-searches"] });
      toast({ title: "Deleted", description: `Saved search "${name}" was removed.` });
    } catch (e: any) {
      toast({ title: "Couldn't delete", description: e?.message ?? "Unknown error", variant: "destructive" });
    }
  }

  function startRename(s: MarketSavedSearch) {
    setRenameId(s.id);
    setRenameValue(s.name);
  }

  async function commitRename() {
    if (renameId == null) return;
    const name = renameValue.trim();
    if (!name) { setRenameId(null); return; }
    setRenamePending(true);
    try {
      await apiRequest("PATCH", `/api/market/saved-searches/${renameId}`, { name });
      await queryClient.invalidateQueries({ queryKey: ["/api/market/saved-searches"] });
      toast({ title: "Renamed", description: `Saved search renamed to "${name}".` });
      setRenameId(null);
    } catch (e: any) {
      toast({ title: "Couldn't rename", description: e?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setRenamePending(false);
    }
  }

  return (
    <div className="px-4 sm:px-6 py-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">My Expressions of Interest</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Track your submitted EOIs and their status</p>
      </div>

      {/* Saved searches panel — Task #713 */}
      <section className="rounded-xl border border-card-border bg-card p-5 space-y-3" data-testid="saved-searches-panel">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-violet-500" />
          <h2 className="text-sm font-semibold text-foreground">My saved searches</h2>
          <span className="text-xs text-muted-foreground">— alerts you when matching listings go live</span>
        </div>
        {savedLoading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : savedSearches.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            None yet. Use <span className="font-medium text-foreground">Save this search</span> on the Browse page to get notified the moment a new listing matches your filters.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {savedSearches.map(s => (
              <li key={s.id} className="py-3 flex items-center gap-3" data-testid={`saved-search-row-${s.id}`}>
                <div className="flex-1 min-w-0">
                  {renameId === s.id ? (
                    <div className="flex items-center gap-1.5">
                      <Input
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter") commitRename();
                          if (e.key === "Escape") setRenameId(null);
                        }}
                        autoFocus
                        maxLength={120}
                        className="h-7 text-sm"
                        data-testid={`saved-search-rename-input-${s.id}`}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-emerald-600 hover:text-emerald-700"
                        onClick={commitRename}
                        disabled={renamePending}
                        title="Save name"
                        data-testid={`saved-search-rename-save-${s.id}`}
                      >
                        <Check className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground"
                        onClick={() => setRenameId(null)}
                        disabled={renamePending}
                        title="Cancel rename"
                        data-testid={`saved-search-rename-cancel-${s.id}`}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-foreground truncate" data-testid={`saved-search-name-${s.id}`}>{s.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{filterSummary(s)}</p>
                    </>
                  )}
                </div>
                {renameId !== s.id && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={() => navigate(buildBrowseUrl(s))}
                      data-testid={`saved-search-run-${s.id}`}
                    >
                      <Play className="w-3 h-3" /> Run now
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                      onClick={() => startRename(s)}
                      title="Rename saved search"
                      data-testid={`saved-search-rename-${s.id}`}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(s.id, s.name)}
                      title="Delete saved search"
                      data-testid={`saved-search-delete-${s.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : eois.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <FileText className="w-10 h-10 mx-auto text-muted-foreground/30" />
          <div>
            <p className="text-sm font-medium text-foreground">No EOIs submitted yet</p>
            <p className="text-xs text-muted-foreground mt-1">Browse listings and submit your first EOI</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/market")}
            data-testid="my-eois-browse-cta"
          >
            Browse Listings
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {eois.map(eoi => {
            const l = eoi.listing;
            return (
              <div
                key={eoi.id}
                className="rounded-xl border border-card-border bg-card p-5 flex flex-col sm:flex-row sm:items-center gap-4"
                data-testid={`my-eoi-card-${eoi.id}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {l ? (
                      // After acceptance identity is revealed; blind only suppresses marketplace browsing
                      (eoi.status === "accepted" || !l.blind) ? (
                        <span className="text-sm font-semibold text-foreground truncate">
                          {l.assetName ?? `Listing #${l.id}`}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground italic">
                          <EyeOff className="w-3 h-3" /> Confidential Listing
                        </span>
                      )
                    ) : (
                      <span className="text-sm text-muted-foreground">Listing removed</span>
                    )}
                    <Badge variant="outline" className={cn("text-[10px] capitalize", STATUS_COLORS[eoi.status])}>
                      {eoi.status}
                    </Badge>
                  </div>
                  {l && (
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="outline" className="text-[10px] border-border">{l.therapeuticArea}</Badge>
                      <Badge variant="outline" className="text-[10px] border-border">{l.modality}</Badge>
                      <Badge variant="outline" className="text-[10px] border-border">{l.stage}</Badge>
                    </div>
                  )}
                  <div className="mt-2 text-xs text-muted-foreground space-y-0.5">
                    <p><span className="font-medium text-foreground">Company:</span> {eoi.company}</p>
                    <p><span className="font-medium text-foreground">Rationale:</span> {eoi.rationale.slice(0, 100)}{eoi.rationale.length > 100 ? "…" : ""}</p>
                    {eoi.budgetRange && <p><span className="font-medium text-foreground">Budget:</span> {eoi.budgetRange}</p>}
                    {eoi.timeline && <p><span className="font-medium text-foreground">Timeline:</span> {eoi.timeline}</p>}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1.5">
                    Submitted {new Date(eoi.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                </div>
                {l && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1 shrink-0"
                    onClick={() => navigate(`/market/listing/${l.id}`)}
                    data-testid={`my-eoi-view-listing-${eoi.id}`}
                  >
                    View Listing <ChevronRight className="w-3 h-3" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
