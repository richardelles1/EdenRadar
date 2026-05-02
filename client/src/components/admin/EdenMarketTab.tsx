import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ShoppingBag, CheckCircle2, XCircle, Clock, FileText, Users, BarChart3, EyeOff, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

type AdminStats = {
  totalListings: number;
  pendingListings: number;
  activeListings: number;
  totalEois: number;
  marketSubscribers: number;
};

type ListingWithEoi = {
  id: number;
  sellerId: string;
  assetName: string | null;
  blind: boolean;
  therapeuticArea: string;
  modality: string;
  stage: string;
  status: string;
  adminNote: string | null;
  eoiCount: number;
  engagementStatus: string;
  aiSummary: string | null;
  createdAt: string;
};

type EoiGroup = {
  listing: ListingWithEoi;
  eois: Array<{
    id: number;
    buyerId: string;
    company: string;
    role: string;
    rationale: string;
    budgetRange: string | null;
    timeline: string | null;
    status: string;
    createdAt: string;
  }>;
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  pending: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  active: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  paused: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  closed: "bg-muted text-muted-foreground border-border",
};

function StatCard({ icon: Icon, label, value, color }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Icon className={cn("w-4 h-4", color ?? "text-muted-foreground")} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className={cn("text-2xl font-bold", color ?? "text-foreground")}>{value}</p>
    </div>
  );
}

const ADMIN_KEY = "eden-admin-pw";
const adminHeaders = () => ({ "x-admin-password": localStorage.getItem(ADMIN_KEY) ?? "" });

export function EdenMarketTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [activeSection, setActiveSection] = useState<"listings" | "eois">("listings");
  const [noteInputs, setNoteInputs] = useState<Record<number, string>>({});

  const { data: stats, isLoading: statsLoading } = useQuery<AdminStats>({
    queryKey: ["/api/admin/market/stats"],
    queryFn: async () => {
      const res = await fetch("/api/admin/market/stats", { headers: adminHeaders() });
      if (!res.ok) throw new Error("Failed to load stats");
      return res.json();
    },
  });

  const { data: listings = [], isLoading: listingsLoading } = useQuery<ListingWithEoi[]>({
    queryKey: ["/api/admin/market/listings", statusFilter],
    queryFn: async () => {
      const url = statusFilter === "all"
        ? "/api/admin/market/listings"
        : `/api/admin/market/listings?status=${statusFilter}`;
      const res = await fetch(url, { headers: adminHeaders() });
      if (!res.ok) throw new Error("Failed to load listings");
      return res.json();
    },
  });

  const { data: eoiGroups = [], isLoading: eoisLoading } = useQuery<EoiGroup[]>({
    queryKey: ["/api/admin/market/eois"],
    queryFn: async () => {
      const res = await fetch("/api/admin/market/eois", { headers: adminHeaders() });
      if (!res.ok) throw new Error("Failed to load EOIs");
      return res.json();
    },
    enabled: activeSection === "eois",
  });

  const { mutate: updateListing, isPending: updating } = useMutation({
    mutationFn: async ({ id, status, adminNote }: { id: number; status: string; adminNote?: string }) => {
      const res = await fetch(`/api/admin/market/listings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...adminHeaders() },
        body: JSON.stringify({ status, adminNote }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/market/listings"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/market/stats"] });
      toast({ title: "Listing updated" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  function handleApprove(id: number) {
    updateListing({ id, status: "active", adminNote: noteInputs[id] ?? undefined });
  }

  function handleReject(id: number) {
    updateListing({ id, status: "closed", adminNote: noteInputs[id] ?? "Rejected by admin" });
  }

  function handlePause(id: number) {
    updateListing({ id, status: "paused", adminNote: noteInputs[id] ?? undefined });
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      {statsLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard icon={ShoppingBag} label="Total Listings" value={stats?.totalListings ?? 0} />
          <StatCard icon={Clock} label="Pending Review" value={stats?.pendingListings ?? 0} color="text-amber-600" />
          <StatCard icon={CheckCircle2} label="Active" value={stats?.activeListings ?? 0} color="text-emerald-600" />
          <StatCard icon={MessageSquare} label="Total EOIs" value={stats?.totalEois ?? 0} color="text-blue-600" />
          <StatCard icon={Users} label="Subscribers" value={stats?.marketSubscribers ?? 0} color="text-violet-600" />
        </div>
      )}

      {/* Section toggle */}
      <div className="flex gap-2 border-b border-border">
        <button
          onClick={() => setActiveSection("listings")}
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
            activeSection === "listings" ? "border-violet-500 text-violet-600" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
          data-testid="admin-market-listings-tab"
        >
          <ShoppingBag className="w-3.5 h-3.5 inline mr-1.5" />
          Listings
        </button>
        <button
          onClick={() => setActiveSection("eois")}
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
            activeSection === "eois" ? "border-violet-500 text-violet-600" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
          data-testid="admin-market-eois-tab"
        >
          <FileText className="w-3.5 h-3.5 inline mr-1.5" />
          EOIs
        </button>
      </div>

      {activeSection === "listings" && (
        <div className="space-y-4">
          {/* Filter */}
          <div className="flex items-center gap-3">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-44 h-8 text-xs" data-testid="admin-market-status-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">{listings.length} listing{listings.length !== 1 ? "s" : ""}</span>
          </div>

          {listingsLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : listings.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ShoppingBag className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No listings found</p>
            </div>
          ) : (
            <div className="space-y-3">
              {listings.map(l => (
                <div
                  key={l.id}
                  className="rounded-xl border border-border bg-card p-5 space-y-4"
                  data-testid={`admin-market-listing-${l.id}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono text-muted-foreground">#{l.id}</span>
                        {l.blind ? (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground italic">
                            <EyeOff className="w-3 h-3" /> Blind Listing
                          </span>
                        ) : (
                          l.assetName && <span className="text-sm font-semibold text-foreground">{l.assetName}</span>
                        )}
                        <Badge variant="outline" className={cn("text-[10px]", STATUS_COLORS[l.status])}>
                          {l.status.charAt(0).toUpperCase() + l.status.slice(1)}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge variant="outline" className="text-[10px] border-border">{l.therapeuticArea}</Badge>
                        <Badge variant="outline" className="text-[10px] border-border">{l.modality}</Badge>
                        <Badge variant="outline" className="text-[10px] border-border">{l.stage}</Badge>
                        <span className="text-[10px] text-muted-foreground">{l.eoiCount} EOI{l.eoiCount !== 1 ? "s" : ""}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Seller: {l.sellerId.slice(0, 8)}… · {new Date(l.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  {l.aiSummary && (
                    <div className="rounded-lg bg-violet-500/5 border border-violet-500/15 p-3">
                      <p className="text-xs font-semibold text-violet-600 mb-1">AI Summary</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">{l.aiSummary}</p>
                    </div>
                  )}

                  {l.adminNote && (
                    <div className="rounded-lg bg-destructive/5 border border-destructive/20 p-3">
                      <p className="text-xs font-semibold text-destructive mb-1">Admin Note</p>
                      <p className="text-xs text-muted-foreground">{l.adminNote}</p>
                    </div>
                  )}

                  {/* Action row */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 pt-2 border-t border-border">
                    <Input
                      placeholder="Admin note (optional)"
                      value={noteInputs[l.id] ?? ""}
                      onChange={e => setNoteInputs(prev => ({ ...prev, [l.id]: e.target.value }))}
                      className="h-7 text-xs flex-1"
                      data-testid={`admin-market-note-${l.id}`}
                    />
                    <div className="flex gap-2 shrink-0">
                      {l.status !== "active" && (
                        <Button
                          size="sm"
                          className="h-7 text-xs gap-1 text-white"
                          style={{ background: "hsl(142 71% 45%)" }}
                          onClick={() => handleApprove(l.id)}
                          disabled={updating}
                          data-testid={`admin-market-approve-${l.id}`}
                        >
                          <CheckCircle2 className="w-3 h-3" /> Approve
                        </Button>
                      )}
                      {l.status === "active" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1"
                          onClick={() => handlePause(l.id)}
                          disabled={updating}
                          data-testid={`admin-market-pause-${l.id}`}
                        >
                          Pause
                        </Button>
                      )}
                      {l.status !== "closed" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1 text-destructive hover:text-destructive"
                          onClick={() => handleReject(l.id)}
                          disabled={updating}
                          data-testid={`admin-market-reject-${l.id}`}
                        >
                          <XCircle className="w-3 h-3" /> Reject
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeSection === "eois" && (
        <div className="space-y-4">
          {eoisLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : eoiGroups.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No EOIs submitted yet</p>
            </div>
          ) : (
            eoiGroups.map(g => (
              <div key={g.listing.id} className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="px-5 py-3 border-b border-border bg-muted/30 flex items-center gap-3">
                  <span className="text-xs font-mono text-muted-foreground">#{g.listing.id}</span>
                  {g.listing.blind ? (
                    <span className="text-xs italic text-muted-foreground flex items-center gap-1">
                      <EyeOff className="w-3 h-3" /> Blind
                    </span>
                  ) : (
                    <span className="text-sm font-semibold text-foreground">{g.listing.assetName ?? "—"}</span>
                  )}
                  <Badge variant="outline" className="text-[10px] border-border">{g.listing.therapeuticArea}</Badge>
                  <span className="text-xs text-muted-foreground ml-auto">{g.eois.length} EOI{g.eois.length !== 1 ? "s" : ""}</span>
                </div>
                <div className="divide-y divide-border">
                  {g.eois.map(eoi => (
                    <div key={eoi.id} className="px-5 py-3 text-xs space-y-1" data-testid={`admin-market-eoi-${eoi.id}`}>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">{eoi.company}</span>
                        <span className="text-muted-foreground">·</span>
                        <span className="text-muted-foreground">{eoi.role}</span>
                        <Badge variant="outline" className={cn("text-[10px] ml-auto", eoi.status === "accepted" ? "border-emerald-500/30 text-emerald-700" : "border-border text-muted-foreground")}>
                          {eoi.status}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground">{eoi.rationale}</p>
                      {eoi.budgetRange && <p>Budget: <span className="text-foreground">{eoi.budgetRange}</span></p>}
                      {eoi.timeline && <p>Timeline: <span className="text-foreground">{eoi.timeline}</span></p>}
                      <p className="text-muted-foreground/60">{new Date(eoi.createdAt).toLocaleDateString()}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
