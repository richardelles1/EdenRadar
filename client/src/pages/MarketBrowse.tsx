import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { EyeOff, Send, SlidersHorizontal, X, GitCompareArrows, ShoppingBag, Zap, BadgeCheck, BellPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { MarketListing } from "@shared/schema";

type ListingWithMeta = MarketListing & { eoiCount: number; myEoiStatus: string | null; edenSignalScore?: number; sellerVerified?: boolean };

const ACCENT = "hsl(234 80% 58%)";

const ENGAGEMENT_LABELS: Record<string, string> = {
  actively_seeking: "Actively Seeking",
  quietly_inbound: "Quietly Inbound",
  under_loi: "Under LOI",
  closed: "Closed",
};

const ENGAGEMENT_COLORS: Record<string, string> = {
  actively_seeking: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  quietly_inbound: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  under_loi: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  closed: "bg-muted text-muted-foreground border-border",
};

function priceLabel(l: ListingWithMeta) {
  if (l.priceRangeMin && l.priceRangeMax) return `$${l.priceRangeMin}M – $${l.priceRangeMax}M`;
  if (l.askingPrice) return l.askingPrice;
  return "Price on request";
}

// NOTE: server-side formula is authoritative and uses intelligence-derived signals from the
// linked EdenScout asset (enrichment completeness, patents, clinical-stage trials inference,
// scientific specificity). Client fallback is a structural approximation only — it activates
// only when the listing was fetched without server score (e.g. cached response).
function getEdenSignalScore(l: ListingWithMeta): number {
  if (l.edenSignalScore != null) return l.edenSignalScore; // always prefer server value
  // Client-side structural fallback (no intelligence signals available):
  // EdenScout link: +30 base; market completeness: price+10, aiSummary+5, mechanism+5,
  // full TA/modality/stage classification: +10, active engagement: +5 → max 65 unlinked, 95 linked
  let s = 0;
  if (l.ingestedAssetId) s += 30;    // EdenScout link (no enrichment bonus without server data)
  if (l.priceRangeMin) s += 10;       // price signal
  if (l.aiSummary) s += 5;            // AI summary
  if (l.mechanism) s += 5;            // mechanism disclosed
  if (l.therapeuticArea && l.modality && l.stage) s += 10; // full classification
  if (l.engagementStatus && l.engagementStatus !== "closed") s += 5; // active
  return Math.min(100, s);
}

function EdenSignalBadge({ score }: { score: number }) {
  const color =
    score >= 70 ? "text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/8" :
    score >= 40 ? "text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/8" :
                  "text-muted-foreground border-border bg-transparent";
  return (
    <span
      className={cn("inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border", color)}
      title={`Eden Signal Score: ${score}/100`}
      data-testid="eden-signal-badge"
    >
      <Zap className="w-2.5 h-2.5" /> {score}
    </span>
  );
}

function ListingCard({
  listing,
  selected,
  onToggleCompare,
  canCompare,
}: {
  listing: ListingWithMeta;
  selected: boolean;
  onToggleCompare: () => void;
  canCompare: boolean;
}) {
  const [, navigate] = useLocation();

  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-5 flex flex-col gap-3 transition-all cursor-pointer hover:border-indigo-500/30",
        selected ? "border-indigo-500/50 ring-1 ring-indigo-500/30" : "border-card-border"
      )}
      onClick={() => navigate(`/market/listing/${listing.id}`)}
      data-testid={`market-listing-card-${listing.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {listing.blind ? (
            <div className="flex items-center gap-1.5 mb-1">
              <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground italic">Confidential Listing</span>
            </div>
          ) : (
            listing.assetName && (
              <p className="text-sm font-semibold text-foreground truncate mb-0.5">{listing.assetName}</p>
            )
          )}
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline" className="text-[10px] border-border">{listing.therapeuticArea}</Badge>
            <Badge variant="outline" className="text-[10px] border-border">{listing.modality}</Badge>
            <Badge variant="outline" className="text-[10px] border-border">{listing.stage}</Badge>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {listing.sellerVerified && (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-400"
              title="Eden ops has confirmed this seller's organization and authority to list this asset."
              data-testid={`market-listing-verified-seller-${listing.id}`}
            >
              <BadgeCheck className="w-2.5 h-2.5" /> Verified Seller
            </span>
          )}
          <Badge variant="outline" className={cn("text-[10px]", ENGAGEMENT_COLORS[listing.engagementStatus])}>
            {ENGAGEMENT_LABELS[listing.engagementStatus] ?? listing.engagementStatus}
          </Badge>
        </div>
      </div>

      {listing.aiSummary && (
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{listing.aiSummary}</p>
      )}

      <div className="flex items-center justify-between gap-2 mt-auto pt-2 border-t border-border/60">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-foreground">{priceLabel(listing)}</span>
          {listing.eoiCount > 0 && (
            <span className="text-[10px] text-muted-foreground">{listing.eoiCount} EOI{listing.eoiCount !== 1 ? "s" : ""}</span>
          )}
          <EdenSignalBadge score={getEdenSignalScore(listing)} />
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={e => { e.stopPropagation(); onToggleCompare(); }}
            className={cn(
              "p-1.5 rounded-md text-xs transition-colors border",
              selected
                ? "border-indigo-500/40 bg-indigo-500/10 text-indigo-600"
                : canCompare || selected ? "border-border bg-background text-muted-foreground hover:border-indigo-500/30" : "border-border bg-background text-muted-foreground/40 cursor-not-allowed"
            )}
            disabled={!selected && !canCompare}
            title={selected ? "Remove from comparison" : "Add to comparison"}
            data-testid={`market-compare-toggle-${listing.id}`}
          >
            <GitCompareArrows className="w-3.5 h-3.5" />
          </button>
          <Button
            size="sm"
            variant={listing.myEoiStatus ? "outline" : "default"}
            className={cn("h-7 text-xs gap-1", !listing.myEoiStatus ? "text-white" : "")}
            style={!listing.myEoiStatus ? { background: ACCENT } : {}}
            onClick={e => { e.stopPropagation(); navigate(`/market/listing/${listing.id}`); }}
            data-testid={`market-listing-eoi-btn-${listing.id}`}
          >
            {listing.myEoiStatus ? (
              <>EOI {listing.myEoiStatus}</>
            ) : (
              <><Send className="w-3 h-3" /> Submit EOI</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ComparisonTable({ listings, onClose }: { listings: ListingWithMeta[]; onClose: () => void }) {
  const fields: { label: string; key: keyof MarketListing; render?: (v: unknown, l: ListingWithMeta) => string }[] = [
    { label: "Therapeutic Area", key: "therapeuticArea" },
    { label: "Modality", key: "modality" },
    { label: "Stage", key: "stage" },
    { label: "Engagement", key: "engagementStatus", render: v => ENGAGEMENT_LABELS[v as string] ?? String(v) },
    { label: "Mechanism", key: "mechanism", render: v => String(v ?? "—") },
    { label: "IP Status", key: "ipStatus", render: v => String(v ?? "—") },
    { label: "Price Range", key: "priceRangeMin", render: (_, l) => priceLabel(l) },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4">
      <div className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card z-10">
          <h2 className="text-base font-bold text-foreground">Listing Comparison</h2>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-accent/60 text-muted-foreground" data-testid="market-comparison-close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-6 py-3 text-xs font-semibold text-muted-foreground w-36">Field</th>
                {listings.map(l => (
                  <th key={l.id} className="text-left px-4 py-3 text-xs font-semibold text-foreground">
                    {l.blind ? <span className="flex items-center gap-1 italic text-muted-foreground"><EyeOff className="w-3 h-3" /> Confidential</span> : l.assetName || `Listing #${l.id}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fields.map(f => (
                <tr key={f.key} className="border-b border-border/50 hover:bg-accent/30">
                  <td className="px-6 py-3 text-xs text-muted-foreground font-medium">{f.label}</td>
                  {listings.map(l => (
                    <td key={l.id} className="px-4 py-3 text-xs text-foreground">
                      {f.render ? f.render(l[f.key], l) : String(l[f.key] ?? "—")}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="border-b border-border/50 hover:bg-accent/30">
                <td className="px-6 py-3 text-xs text-muted-foreground font-medium">AI Summary</td>
                {listings.map(l => (
                  <td key={l.id} className="px-4 py-3 text-xs text-muted-foreground leading-relaxed">{l.aiSummary ?? "—"}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function MarketBrowse() {
  const { session } = useAuth();
  const { toast } = useToast();
  const [location] = useLocation();
  // Read initial filter values from URL query string (used by "Run now" from
  // the saved-searches panel on My EOIs).
  const initialFromUrl = useMemo(() => {
    const qs = typeof window !== "undefined" ? window.location.search : "";
    const params = new URLSearchParams(qs);
    return {
      ta: params.get("ta") ?? "",
      modality: params.get("modality") ?? "all",
      stage: params.get("stage") ?? "all",
      engagement: params.get("engagement") ?? "all",
      min: params.get("min") ?? "",
      max: params.get("max") ?? "",
      keyword: params.get("keyword") ?? "",
    };
  }, [location]);
  const [taFilter, setTaFilter] = useState(initialFromUrl.ta);
  const [modalityFilter, setModalityFilter] = useState(initialFromUrl.modality);
  const [stageFilter, setStageFilter] = useState(initialFromUrl.stage);
  const [engagementFilter, setEngagementFilter] = useState(initialFromUrl.engagement);
  const [minPriceFilter, setMinPriceFilter] = useState(initialFromUrl.min);
  const [maxPriceFilter, setMaxPriceFilter] = useState(initialFromUrl.max);
  const [keywordFilter, setKeywordFilter] = useState(initialFromUrl.keyword);
  const [compareIds, setCompareIds] = useState<number[]>([]);
  const [showComparison, setShowComparison] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [savePending, setSavePending] = useState(false);

  // Sync URL → state when "Run now" navigates here with new params.
  useEffect(() => {
    setTaFilter(initialFromUrl.ta);
    setModalityFilter(initialFromUrl.modality);
    setStageFilter(initialFromUrl.stage);
    setEngagementFilter(initialFromUrl.engagement);
    setMinPriceFilter(initialFromUrl.min);
    setMaxPriceFilter(initialFromUrl.max);
    setKeywordFilter(initialFromUrl.keyword);
  }, [initialFromUrl]);

  async function handleSaveSearch() {
    if (!saveName.trim()) return;
    setSavePending(true);
    try {
      const filters: Record<string, unknown> = {};
      if (taFilter.trim()) filters.therapeuticArea = taFilter.trim();
      if (modalityFilter !== "all") filters.modality = modalityFilter;
      if (stageFilter !== "all") filters.stage = stageFilter;
      if (engagementFilter !== "all") filters.engagementStatus = engagementFilter;
      if (minPriceFilter) {
        const m = parseInt(minPriceFilter, 10);
        if (!isNaN(m)) filters.priceRangeMinM = m;
      }
      if (maxPriceFilter) {
        const m = parseInt(maxPriceFilter, 10);
        if (!isNaN(m)) filters.priceRangeMaxM = m;
      }
      await apiRequest("POST", "/api/market/saved-searches", {
        name: saveName.trim(),
        keyword: keywordFilter.trim() || null,
        filters,
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/market/saved-searches"] });
      toast({ title: "Saved", description: `Search "${saveName.trim()}" will alert you on matching listings.` });
      setSaveDialogOpen(false);
      setSaveName("");
    } catch (e: any) {
      toast({ title: "Couldn't save search", description: e?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setSavePending(false);
    }
  }

  const hasAnyFilter = !!(taFilter || keywordFilter || modalityFilter !== "all" || stageFilter !== "all" || engagementFilter !== "all" || minPriceFilter || maxPriceFilter);

  const { data: listings = [], isLoading } = useQuery<ListingWithMeta[]>({
    queryKey: ["/api/market/listings"],
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const res = await fetch("/api/market/listings", {
        headers: { Authorization: `Bearer ${session!.access_token}`, "x-user-id": session!.user.id },
      });
      if (!res.ok) throw new Error("Failed to load listings");
      return res.json();
    },
  });

  const filtered = useMemo(() => listings.filter(l => {
    if (taFilter && !l.therapeuticArea.toLowerCase().includes(taFilter.toLowerCase())) return false;
    if (modalityFilter !== "all" && l.modality !== modalityFilter) return false;
    if (stageFilter !== "all" && l.stage !== stageFilter) return false;
    if (engagementFilter !== "all" && l.engagementStatus !== engagementFilter) return false;
    if (minPriceFilter) {
      const min = parseInt(minPriceFilter, 10);
      if (!isNaN(min) && l.priceRangeMax != null && l.priceRangeMax < min) return false;
    }
    if (maxPriceFilter) {
      const max = parseInt(maxPriceFilter, 10);
      if (!isNaN(max) && l.priceRangeMin != null && l.priceRangeMin > max) return false;
    }
    if (keywordFilter.trim()) {
      const k = keywordFilter.trim().toLowerCase();
      const blindFields = l.blindFields || {};
      const haystacks: string[] = [];
      if (l.assetName && !(l.blind && blindFields.assetName)) haystacks.push(l.assetName);
      if (l.mechanism && !(l.blind && blindFields.mechanismDetail)) haystacks.push(l.mechanism);
      if (l.aiSummary) haystacks.push(l.aiSummary);
      if (l.therapeuticArea) haystacks.push(l.therapeuticArea);
      if (!haystacks.some(h => h.toLowerCase().includes(k))) return false;
    }
    return true;
  }), [listings, taFilter, modalityFilter, stageFilter, engagementFilter, minPriceFilter, maxPriceFilter, keywordFilter]);

  const compareListings = listings.filter(l => compareIds.includes(l.id));
  const modalities = [...new Set(listings.map(l => l.modality))];
  const stages = [...new Set(listings.map(l => l.stage))];

  function toggleCompare(id: number) {
    setCompareIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id].slice(0, 3));
  }

  return (
    <div className="px-4 sm:px-6 py-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">Browse Listings</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {filtered.length} active listing{filtered.length !== 1 ? "s" : ""}
          </p>
        </div>
        {compareIds.length >= 2 && (
          <Button
            size="sm"
            className="gap-2 text-white shrink-0"
            style={{ background: ACCENT }}
            onClick={() => setShowComparison(true)}
            data-testid="market-compare-selected-btn"
          >
            <GitCompareArrows className="w-4 h-4" />
            Compare Selected ({compareIds.length})
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative">
          <SlidersHorizontal className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Therapeutic area…"
            value={taFilter}
            onChange={e => setTaFilter(e.target.value)}
            className="pl-8 h-8 text-xs w-48"
            data-testid="market-filter-ta"
          />
        </div>
        <Input
          placeholder="Keyword…"
          value={keywordFilter}
          onChange={e => setKeywordFilter(e.target.value)}
          className="h-8 text-xs w-40"
          data-testid="market-filter-keyword"
        />
        <Select value={modalityFilter} onValueChange={setModalityFilter}>
          <SelectTrigger className="h-8 text-xs w-36" data-testid="market-filter-modality">
            <SelectValue placeholder="Modality" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All modalities</SelectItem>
            {modalities.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="h-8 text-xs w-36" data-testid="market-filter-stage">
            <SelectValue placeholder="Stage" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stages</SelectItem>
            {stages.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={engagementFilter} onValueChange={setEngagementFilter}>
          <SelectTrigger className="h-8 text-xs w-44" data-testid="market-filter-engagement">
            <SelectValue placeholder="Engagement" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All engagement</SelectItem>
            {Object.entries(ENGAGEMENT_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input
          type="number"
          placeholder="Min $M"
          value={minPriceFilter}
          onChange={e => setMinPriceFilter(e.target.value)}
          className="h-8 text-xs w-24"
          data-testid="market-filter-min-price"
        />
        <Input
          type="number"
          placeholder="Max $M"
          value={maxPriceFilter}
          onChange={e => setMaxPriceFilter(e.target.value)}
          className="h-8 text-xs w-24"
          data-testid="market-filter-max-price"
        />
        {hasAnyFilter && (
          <button
            onClick={() => { setTaFilter(""); setKeywordFilter(""); setModalityFilter("all"); setStageFilter("all"); setEngagementFilter("all"); setMinPriceFilter(""); setMaxPriceFilter(""); }}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            data-testid="market-filter-clear"
          >
            <X className="w-3.5 h-3.5" /> Clear
          </button>
        )}
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs gap-1 ml-auto"
          onClick={() => setSaveDialogOpen(true)}
          disabled={!hasAnyFilter}
          title={hasAnyFilter ? "Save these filters and get notified on matching listings" : "Set at least one filter or keyword to save"}
          data-testid="market-save-search-btn"
        >
          <BellPlus className="w-3.5 h-3.5" /> Save this search
        </Button>
      </div>

      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save this search</DialogTitle>
            <DialogDescription>
              We'll send you an in-app notification and email the moment a new listing matches these filters.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="saved-search-name" className="text-xs">Name</Label>
              <Input
                id="saved-search-name"
                placeholder='e.g. "Oncology small molecule"'
                value={saveName}
                onChange={e => setSaveName(e.target.value)}
                maxLength={120}
                data-testid="market-save-search-name"
              />
            </div>
            <div className="text-xs text-muted-foreground space-y-0.5 rounded-md border border-border bg-muted/30 p-3">
              <p className="font-medium text-foreground">Filters captured</p>
              {keywordFilter && <p>Keyword: <span className="text-foreground">{keywordFilter}</span></p>}
              {taFilter && <p>Therapeutic area: <span className="text-foreground">{taFilter}</span></p>}
              {modalityFilter !== "all" && <p>Modality: <span className="text-foreground">{modalityFilter}</span></p>}
              {stageFilter !== "all" && <p>Stage: <span className="text-foreground">{stageFilter}</span></p>}
              {engagementFilter !== "all" && <p>Engagement: <span className="text-foreground">{ENGAGEMENT_LABELS[engagementFilter] ?? engagementFilter}</span></p>}
              {maxPriceFilter && <p>Max price: <span className="text-foreground">${maxPriceFilter}M</span></p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSaveDialogOpen(false)} data-testid="market-save-search-cancel">Cancel</Button>
            <Button
              onClick={handleSaveSearch}
              disabled={!saveName.trim() || savePending}
              className="text-white"
              style={{ background: ACCENT }}
              data-testid="market-save-search-confirm"
            >
              {savePending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <ShoppingBag className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No listings match your filters</p>
          <p className="text-xs mt-1">Try adjusting the filters above</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(l => (
            <ListingCard
              key={l.id}
              listing={l}
              selected={compareIds.includes(l.id)}
              onToggleCompare={() => toggleCompare(l.id)}
              canCompare={compareIds.length < 3}
            />
          ))}
        </div>
      )}

      {showComparison && compareListings.length >= 2 && (
        <ComparisonTable listings={compareListings} onClose={() => setShowComparison(false)} />
      )}
    </div>
  );
}
