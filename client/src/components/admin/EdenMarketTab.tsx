import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  ShoppingBag, CheckCircle2, XCircle, Clock, FileText, Users, EyeOff,
  MessageSquare, Building2, Shield, DollarSign, AlertTriangle, ChevronDown, ChevronUp, Paperclip,
} from "lucide-react";
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

type SubscriberOrg = {
  id: number;
  name: string;
  billingEmail: string | null;
  edenMarketStripeSubId: string | null;
  createdAt: string;
};

type AdminDeal = {
  id: number;
  listingId: number;
  eoiId: number;
  sellerId: string;
  buyerId: string;
  status: string;
  sellerSignedAt: string | null;
  buyerSignedAt: string | null;
  ndaSignedAt: string | null;
  successFeeInvoiceId: string | null;
  successFeeDealSizeM: number | null;
  successFeeAmount: number | null;
  createdAt: string;
  assetLabel: string;
  therapeuticArea: string;
  eoiCreatedAt: string | null;
};

type AdminDealMessage = {
  id: number;
  dealId: number;
  senderId: string;
  senderRole: string;
  body: string;
  createdAt: string;
};

type AdminDealDocument = {
  id: number;
  dealId: number;
  uploaderId: string;
  uploaderRole: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  signedUrl: string;
  createdAt: string;
};

function DealInspectionPanel({ deal }: { deal: AdminDeal }) {
  const { data: messages = [], isLoading: msgsLoading } = useQuery<AdminDealMessage[]>({
    queryKey: ["/api/admin/market/deals", deal.id, "messages"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/market/deals/${deal.id}/messages`, { headers: adminHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });
  const { data: docs = [], isLoading: docsLoading } = useQuery<AdminDealDocument[]>({
    queryKey: ["/api/admin/market/deals", deal.id, "documents"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/market/deals/${deal.id}/documents`, { headers: adminHeaders() });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const loading = msgsLoading || docsLoading;

  return (
    <tr>
      <td colSpan={7} className="px-0 pb-0">
        <div className="bg-muted/20 border-t border-violet-500/10 px-4 py-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Messages */}
          <div className="space-y-2">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
              <MessageSquare className="w-3 h-3" /> Thread ({messages.length})
            </p>
            {loading ? (
              <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                <div className="w-3 h-3 border border-violet-500 border-t-transparent rounded-full animate-spin" /> Loading…
              </div>
            ) : messages.length === 0 ? (
              <p className="text-xs text-muted-foreground/60 italic">No messages yet</p>
            ) : (
              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {messages.map(m => (
                  <div key={m.id} className="rounded-lg bg-card border border-border p-2.5 space-y-0.5" data-testid={`admin-deal-msg-${m.id}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-semibold text-foreground capitalize">{m.senderRole}</span>
                      <span className="text-[10px] text-muted-foreground/60">{new Date(m.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{m.body}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Documents */}
          <div className="space-y-2">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
              <Paperclip className="w-3 h-3" /> Documents ({docs.length})
            </p>
            {loading ? null : docs.length === 0 ? (
              <p className="text-xs text-muted-foreground/60 italic">No documents uploaded</p>
            ) : (
              <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                {docs.map(d => (
                  <a
                    key={d.id}
                    href={d.signedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-lg border border-border bg-card hover:bg-muted/40 px-2.5 py-2 transition-colors"
                    data-testid={`admin-deal-doc-${d.id}`}
                  >
                    <FileText className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="text-xs text-foreground truncate flex-1">{d.fileName}</span>
                    <span className="text-[10px] text-muted-foreground/60 capitalize shrink-0">{d.uploaderRole}</span>
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  pending: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  active: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  paused: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  closed: "bg-muted text-muted-foreground border-border",
};

const DEAL_STATUS_LABELS: Record<string, string> = {
  nda_pending: "NDA Pending",
  nda_signed: "NDA Signed",
  due_diligence: "Due Diligence",
  term_sheet: "Term Sheet",
  loi: "LOI",
  closed: "Closed",
  paused: "Paused",
};

const DEAL_STATUS_COLORS: Record<string, string> = {
  nda_pending: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  nda_signed: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  due_diligence: "bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/20",
  term_sheet: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20",
  loi: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  closed: "bg-emerald-600/10 text-emerald-800 dark:text-emerald-300 border-emerald-600/20",
  paused: "bg-muted text-muted-foreground border-border",
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

function SuccessFeeModal({ deal, onClose }: { deal: AdminDeal; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [dealSize, setDealSize] = useState("");

  const sizeM = parseInt(dealSize, 10);
  let feeAmount = 0;
  if (!isNaN(sizeM)) {
    if (sizeM <= 5) feeAmount = 10000;
    else if (sizeM <= 50) feeAmount = 30000;
    else feeAmount = 50000;
  }

  const { mutate: generateInvoice, isPending } = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/market/deals/${deal.id}/invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...adminHeaders() },
        body: JSON.stringify({ dealSizeM: sizeM }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      return res.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/admin/market/deals"] });
      toast({ title: "Invoice generated", description: data.invoiceId ? `Stripe invoice: ${data.invoiceId}` : "Recorded locally (Stripe not configured)." });
      onClose();
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-sm shadow-xl space-y-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-semibold text-foreground">Generate Success Fee Invoice</h3>
        <p className="text-xs text-muted-foreground">Deal: <strong>{deal.assetLabel}</strong> #{deal.id}</p>
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Deal size (USD millions)</label>
          <Input
            type="number"
            placeholder="e.g. 25"
            value={dealSize}
            onChange={e => setDealSize(e.target.value)}
            className="h-8 text-xs"
            data-testid="invoice-deal-size"
          />
        </div>
        {!isNaN(sizeM) && sizeM > 0 && (
          <div className="rounded-lg bg-violet-500/5 border border-violet-500/20 p-3 text-xs space-y-1">
            <p className="font-semibold text-foreground">Fee tier: <span className="text-violet-600">${(feeAmount / 1000).toFixed(0)}k</span></p>
            <p className="text-muted-foreground">
              {sizeM <= 5 ? "≤ $5M deal → $10k fee" : sizeM <= 50 ? "$5M–$50M deal → $30k fee" : "> $50M deal → $50k fee"}
            </p>
          </div>
        )}
        <div className="flex gap-2 pt-2">
          <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            className="flex-1 text-xs text-white"
            style={{ background: "hsl(271 81% 55%)" }}
            disabled={isPending || isNaN(sizeM) || sizeM <= 0}
            onClick={() => generateInvoice()}
            data-testid="invoice-generate-button"
          >
            {isPending ? "Generating…" : "Generate Invoice"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function EdenMarketTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [activeSection, setActiveSection] = useState<"listings" | "eois" | "subscribers" | "deals">("listings");
  const [noteInputs, setNoteInputs] = useState<Record<number, string>>({});
  const [invoiceDeal, setInvoiceDeal] = useState<AdminDeal | null>(null);
  const [expandedDealId, setExpandedDealId] = useState<number | null>(null);

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
    enabled: activeSection === "listings",
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

  const { data: subscribers = [], isLoading: subscribersLoading } = useQuery<SubscriberOrg[]>({
    queryKey: ["/api/admin/market/subscribers"],
    queryFn: async () => {
      const res = await fetch("/api/admin/market/subscribers", { headers: adminHeaders() });
      if (!res.ok) throw new Error("Failed to load subscribers");
      return res.json();
    },
    enabled: activeSection === "subscribers",
  });

  const { data: deals = [], isLoading: dealsLoading } = useQuery<AdminDeal[]>({
    queryKey: ["/api/admin/market/deals"],
    queryFn: async () => {
      const res = await fetch("/api/admin/market/deals", { headers: adminHeaders() });
      if (!res.ok) throw new Error("Failed to load deals");
      return res.json();
    },
    enabled: activeSection === "deals",
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

  const closedDeals = deals.filter(d => d.status === "closed");
  const loiDeals = deals.filter(d => d.status === "loi");

  return (
    <div className="space-y-6">
      {invoiceDeal && <SuccessFeeModal deal={invoiceDeal} onClose={() => setInvoiceDeal(null)} />}

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
      <div className="flex gap-2 border-b border-border overflow-x-auto">
        {(["listings", "eois", "deals", "subscribers"] as const).map(section => {
          const icons = {
            listings: <ShoppingBag className="w-3.5 h-3.5 inline mr-1.5" />,
            eois: <FileText className="w-3.5 h-3.5 inline mr-1.5" />,
            deals: <Shield className="w-3.5 h-3.5 inline mr-1.5" />,
            subscribers: <Building2 className="w-3.5 h-3.5 inline mr-1.5" />,
          };
          const labels = { listings: "Listings", eois: "EOIs", deals: "Deals", subscribers: "Subscribers" };
          return (
            <button
              key={section}
              onClick={() => setActiveSection(section)}
              className={cn(
                "px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0",
                activeSection === section ? "border-violet-500 text-violet-600" : "border-transparent text-muted-foreground hover:text-foreground"
              )}
              data-testid={`admin-market-${section}-tab`}
            >
              {icons[section]}{labels[section]}
              {section === "deals" && (closedDeals.length + loiDeals.length > 0) && (
                <span className="ml-1.5 text-[10px] bg-amber-500 text-white rounded-full px-1.5 py-0.5">{closedDeals.length + loiDeals.length}</span>
              )}
            </button>
          );
        })}
      </div>

      {activeSection === "listings" && (
        <div className="space-y-4">
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

      {activeSection === "deals" && (
        <div className="space-y-4">
          {(closedDeals.length > 0 || loiDeals.length > 0) && (
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-3 flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                {closedDeals.length} closed deal{closedDeals.length !== 1 ? "s" : ""}
                {loiDeals.length > 0 ? ` and ${loiDeals.length} LOI deal${loiDeals.length !== 1 ? "s" : ""}` : ""} may require success fee invoicing.
              </span>
            </div>
          )}

          {dealsLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : deals.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Shield className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No deals yet</p>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Deal</th>
                    <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Asset</th>
                    <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Status</th>
                    <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">EOI Date</th>
                    <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">NDA Signed</th>
                    <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Fee</th>
                    <th className="text-right px-4 py-2.5 text-muted-foreground font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {deals.map(deal => {
                    const isExpanded = expandedDealId === deal.id;
                    return (
                      <>
                        <tr
                          key={deal.id}
                          className="hover:bg-muted/20 transition-colors cursor-pointer"
                          data-testid={`admin-deal-row-${deal.id}`}
                          onClick={() => setExpandedDealId(isExpanded ? null : deal.id)}
                        >
                          <td className="px-4 py-2.5 font-mono text-muted-foreground">
                            <span className="flex items-center gap-1">
                              {isExpanded ? <ChevronUp className="w-3 h-3 text-violet-500" /> : <ChevronDown className="w-3 h-3 text-muted-foreground/40" />}
                              #{deal.id}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="font-medium text-foreground truncate max-w-32 block">{deal.assetLabel}</span>
                            <span className="text-muted-foreground/60 text-[10px]">{deal.therapeuticArea}</span>
                          </td>
                          <td className="px-4 py-2.5">
                            <Badge variant="outline" className={cn("text-[10px]", DEAL_STATUS_COLORS[deal.status] ?? "border-border text-muted-foreground")}>
                              {DEAL_STATUS_LABELS[deal.status] ?? deal.status}
                            </Badge>
                            {(deal.status === "loi" || deal.status === "closed") && (
                              <AlertTriangle className="w-3 h-3 text-amber-500 inline ml-1" />
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground">
                            {deal.eoiCreatedAt ? new Date(deal.eoiCreatedAt).toLocaleDateString() : "—"}
                          </td>
                          <td className="px-4 py-2.5">
                            {deal.ndaSignedAt ? (
                              <span className="text-emerald-600 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> {new Date(deal.ndaSignedAt).toLocaleDateString()}
                              </span>
                            ) : (
                              <span className="text-muted-foreground flex items-center gap-1">
                                <Clock className="w-3 h-3" /> Pending
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            {deal.successFeeAmount ? (
                              <span className="text-emerald-600">${(deal.successFeeAmount / 1000).toFixed(0)}k</span>
                            ) : (
                              <span className="text-muted-foreground/60">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right" onClick={e => e.stopPropagation()}>
                            {!deal.successFeeInvoiceId && deal.status === "closed" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 text-[10px] gap-1 text-violet-600 border-violet-500/30 px-2"
                                onClick={() => setInvoiceDeal(deal)}
                                data-testid={`admin-deal-invoice-${deal.id}`}
                              >
                                <DollarSign className="w-3 h-3" /> Invoice
                              </Button>
                            )}
                            {deal.successFeeInvoiceId && (
                              <span className="text-[10px] text-muted-foreground font-mono">{deal.successFeeInvoiceId.slice(0, 12)}…</span>
                            )}
                          </td>
                        </tr>
                        {isExpanded && <DealInspectionPanel key={`inspect-${deal.id}`} deal={deal} />}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeSection === "subscribers" && (
        <div className="space-y-4">
          <span className="text-xs text-muted-foreground">{subscribers.length} active subscriber{subscribers.length !== 1 ? "s" : ""}</span>
          {subscribersLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : subscribers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Building2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No active subscribers</p>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Org</th>
                    <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Billing Email</th>
                    <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Stripe Sub ID</th>
                    <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Since</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {subscribers.map(org => (
                    <tr key={org.id} data-testid={`admin-market-subscriber-${org.id}`} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-2.5 font-medium text-foreground">{org.name}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{org.billingEmail ?? "—"}</td>
                      <td className="px-4 py-2.5 text-muted-foreground font-mono">
                        {org.edenMarketStripeSubId ? org.edenMarketStripeSubId.slice(0, 14) + "…" : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{new Date(org.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
