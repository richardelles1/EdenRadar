import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, Lock, Unlock, FileSignature, Upload, File, Trash2,
  Send, CheckCircle2, Clock, AlertCircle, Shield, Building2, Download, History,
  Eye, ChevronDown, ChevronRight,
} from "lucide-react";
import type { MarketDeal, MarketDealDocument, MarketDealMessage, DealStatusHistoryEntry } from "@shared/schema";

type DealDocumentWithViews = MarketDealDocument & {
  lastViewedByCounterparty: { viewerId: string; viewedAt: string } | null;
  viewCountByCounterparty: number;
  counterpartyViews: { viewerId: string; viewedAt: string }[];
  ownViewCount: number;
};

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  if (diff < 60_000) return "just now";
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} day${d === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString();
}

type PartialListing = {
  id: number;
  therapeuticArea: string;
  modality: string;
  stage: string;
  blind: boolean;
  status: string;
  assetName: string | null;
  mechanism: string | null;
  ipStatus: string | null;
  ipSummary: string | null;
  milestoneHistory: string | null;
  askingPrice: string | null;
  priceRangeMin: number | null;
  priceRangeMax: number | null;
  aiSummary: string | null;
  sellerId: string;
};

type PartialEoi = {
  id: number;
  listingId: number;
  status: string;
  buyerId: string | null;
  company: string | null;
  role: string | null;
  rationale: string | null;
  budgetRange: string | null;
  timeline: string | null;
};

type StatusHistoryEntry = DealStatusHistoryEntry;
type DealRoomData = { deal: MarketDeal; listing: PartialListing | null; eoi: PartialEoi | null; ndaDocumentUrl?: string | null; sellerOrgName?: string | null; buyerOrgName?: string | null };

const ACCENT = "hsl(234 80% 58%)";

const STATUS_LABELS: Record<string, string> = {
  nda_pending: "NDA Pending",
  nda_signed: "NDA Signed",
  due_diligence: "Due Diligence",
  term_sheet: "Term Sheet",
  loi: "Letter of Intent",
  closed: "Closed",
  paused: "Paused",
};

const STATUS_COLORS: Record<string, string> = {
  nda_pending: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  nda_signed: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  due_diligence: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/20",
  term_sheet: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20",
  loi: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  closed: "bg-emerald-600/10 text-emerald-800 dark:text-emerald-300 border-emerald-600/20",
  paused: "bg-muted text-muted-foreground border-border",
};

function NdaTemplate({ deal, listing, eoi }: { deal: MarketDeal; listing: PartialListing | null; eoi: PartialEoi | null }) {
  const date = new Date(deal.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const assetRef = listing?.blind
    ? `a ${listing.therapeuticArea} ${listing.modality} asset (EdenMarket Listing #${deal.listingId})`
    : (listing?.assetName || `EdenMarket Listing #${deal.listingId}`);

  return (
    <div className="text-xs text-muted-foreground leading-relaxed space-y-3 max-h-72 overflow-y-auto pr-2 font-mono">
      <p className="text-center font-semibold text-foreground text-sm">MUTUAL NON-DISCLOSURE AGREEMENT</p>
      <p>This Mutual Non-Disclosure Agreement (&quot;Agreement&quot;) is entered into as of <strong>{date}</strong>, between the Seller party (Deal Party A) and the Buyer party (Deal Party B) in connection with <strong>{assetRef}</strong>, facilitated through EdenMarket by EdenRadar.</p>
      <p><strong>1. CONFIDENTIAL INFORMATION.</strong> Each party (&quot;Disclosing Party&quot;) may disclose to the other party (&quot;Receiving Party&quot;) certain non-public, proprietary, or confidential information (&quot;Confidential Information&quot;) in connection with the evaluation of a potential business transaction regarding the above-referenced asset.</p>
      <p><strong>2. NON-DISCLOSURE.</strong> Each Receiving Party agrees to: (a) hold the Disclosing Party's Confidential Information in strict confidence; (b) not disclose it to any third party without prior written consent; (c) use it solely for evaluating the Potential Transaction; and (d) protect it using at least the same degree of care applied to its own confidential information.</p>
      <p><strong>3. TERM.</strong> This Agreement shall remain in force for three (3) years from the date of execution, unless otherwise terminated by mutual written agreement.</p>
      <p><strong>4. RETURN OF INFORMATION.</strong> Upon request, each party shall promptly return or certifiably destroy all Confidential Information received.</p>
      <p><strong>5. GOVERNING LAW.</strong> This Agreement shall be governed by the laws of the jurisdiction in which the Disclosing Party is incorporated.</p>
      <p><strong>6. ENTIRE AGREEMENT.</strong> This Agreement constitutes the entire agreement between the parties with respect to the subject matter herein and supersedes all prior communications.</p>
      {deal.sellerSignedName && <p><strong>Party A Signature:</strong> {deal.sellerSignedName} — {deal.sellerSignedAt ? new Date(deal.sellerSignedAt).toLocaleString() : ""}</p>}
      {deal.buyerSignedName && <p><strong>Party B Signature:</strong> {deal.buyerSignedName} — {deal.buyerSignedAt ? new Date(deal.buyerSignedAt).toLocaleString() : ""}</p>}
    </div>
  );
}

export default function MarketDealRoom() {
  const { id } = useParams<{ id: string }>();
  const dealId = parseInt(id ?? "0", 10);
  const { session } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const userId = session?.user.id ?? "";

  const [ndaChecked, setNdaChecked] = useState(false);
  const [signedName, setSignedName] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [uploading, setUploading] = useState(false);
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [closeDealSizeM, setCloseDealSizeM] = useState<string>("");
  const [expandedViewHistory, setExpandedViewHistory] = useState<Record<number, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const authHeaders = {
    Authorization: `Bearer ${session!.access_token}`,
    "x-user-id": userId,
  };

  const { data: roomData, isLoading } = useQuery<DealRoomData>({
    queryKey: ["/api/market/deals", dealId],
    queryFn: async () => {
      const res = await fetch(`/api/market/deals/${dealId}`, { headers: authHeaders });
      if (!res.ok) throw new Error("Failed to load deal room");
      return res.json();
    },
  });

  const { data: documents = [] } = useQuery<DealDocumentWithViews[]>({
    queryKey: ["/api/market/deals", dealId, "documents"],
    queryFn: async () => {
      const res = await fetch(`/api/market/deals/${dealId}/documents`, { headers: authHeaders });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!roomData?.deal?.ndaSignedAt,
  });

  const { data: messages = [] } = useQuery<MarketDealMessage[]>({
    queryKey: ["/api/market/deals", dealId, "messages"],
    queryFn: async () => {
      const res = await fetch(`/api/market/deals/${dealId}/messages`, { headers: authHeaders });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!roomData?.deal?.ndaSignedAt,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const token = session?.access_token;
    if (!token || !dealId) return;
    const es = new EventSource(`/api/market/deals/events?token=${encodeURIComponent(token)}`);
    const onMessage = (e: MessageEvent) => {
      try {
        const { dealId: evtDealId } = JSON.parse(e.data);
        if (evtDealId !== dealId) return;
        qc.invalidateQueries({ queryKey: ["/api/market/deals", dealId, "messages"] });
      } catch {}
    };
    const onDocument = (e: MessageEvent) => {
      try {
        const { dealId: evtDealId } = JSON.parse(e.data);
        if (evtDealId !== dealId) return;
        qc.invalidateQueries({ queryKey: ["/api/market/deals", dealId, "documents"] });
      } catch {}
    };
    const onUpdated = (e: MessageEvent) => {
      try {
        const { dealId: evtDealId } = JSON.parse(e.data);
        if (evtDealId !== dealId) return;
        qc.invalidateQueries({ queryKey: ["/api/market/deals", dealId] });
      } catch {}
    };
    es.addEventListener("deal_message", onMessage);
    es.addEventListener("deal_document", onDocument);
    es.addEventListener("deal_updated", onUpdated);
    return () => { es.close(); };
  }, [session?.access_token, dealId, qc]);

  const { mutate: signNda, isPending: signing } = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/market/deals/${dealId}/sign-nda`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ signedName }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/market/deals", dealId] });
      toast({ title: "NDA signed", description: "Your signature has been recorded." });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const { mutate: updateStatus, isPending: updatingStatus } = useMutation({
    mutationFn: async (payload: { status: string; dealSizeM?: number }) => {
      const res = await fetch(`/api/market/deals/${dealId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok && res.status !== 207) { throw new Error(data.error || "Status update failed"); }
      return { status: res.status, data };
    },
    onSuccess: ({ status, data }) => {
      qc.invalidateQueries({ queryKey: ["/api/market/deals", dealId] });
      const auto = (data as { autoInvoice?: { feeAmount?: number; invoiceId?: string | null; error?: string; note?: string } }).autoInvoice;
      if (auto?.error) {
        toast({
          title: "Closed — invoice generation failed",
          description: `${auto.error}. Admins have been alerted to issue the invoice manually.`,
          variant: "destructive",
        });
      } else if (auto?.feeAmount) {
        const feeStr = `$${(auto.feeAmount / 1000).toFixed(0)}k`;
        toast({
          title: "Deal closed — invoice issued",
          description: auto.invoiceId
            ? `Stripe invoice ${auto.invoiceId.slice(0, 14)}… for ${feeStr} success fee has been emailed to your billing address.`
            : `${feeStr} success fee recorded${auto.note ? ` (${auto.note})` : ""}.`,
        });
      } else {
        toast({ title: "Status updated" });
      }
      setCloseModalOpen(false);
      setCloseDealSizeM("");
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  function handleStatusChange(next: string) {
    if (next === "closed") {
      setCloseDealSizeM(roomData?.deal?.successFeeDealSizeM ? String(roomData.deal.successFeeDealSizeM) : "");
      setCloseModalOpen(true);
      return;
    }
    updateStatus({ status: next });
  }

  function feeForSize(sizeM: number): number | null {
    if (!Number.isFinite(sizeM) || sizeM <= 0) return null;
    if (sizeM <= 5) return 10000;
    if (sizeM <= 50) return 30000;
    return 50000;
  }

  const { mutate: sendMessage, isPending: sendingMsg } = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/market/deals/${dealId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ body: messageBody }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/market/deals", dealId, "messages"] });
      setMessageBody("");
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const { mutate: deleteDoc } = useMutation({
    mutationFn: async (docId: number) => {
      const res = await fetch(`/api/market/deals/${dealId}/documents/${docId}`, {
        method: "DELETE",
        headers: authHeaders,
      });
      if (!res.ok) throw new Error("Delete failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/market/deals", dealId, "documents"] }),
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  async function openDocument(doc: DealDocumentWithViews) {
    // Fire-and-forget tracking — never block the open if it fails. The
    // counterparty receives a real-time SSE so their UI updates immediately.
    fetch(`/api/market/deals/${dealId}/documents/${doc.id}/track-view`, {
      method: "POST",
      headers: authHeaders,
    }).then(() => {
      qc.invalidateQueries({ queryKey: ["/api/market/deals", dealId, "documents"] });
    }).catch(() => {});
    window.open(doc.fileUrl, "_blank", "noopener,noreferrer");
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum file size is 50MB", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/market/deals/${dealId}/documents`, {
        method: "POST",
        headers: authHeaders,
        body: formData,
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      qc.invalidateQueries({ queryKey: ["/api/market/deals", dealId, "documents"] });
      toast({ title: "Document uploaded" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!roomData) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <AlertCircle className="w-10 h-10 mx-auto text-destructive mb-3" />
          <p className="text-sm text-muted-foreground">Deal room not found or access denied.</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate("/market")}>Back to Market</Button>
        </div>
      </div>
    );
  }

  const { deal, listing, eoi, ndaDocumentUrl, sellerOrgName, buyerOrgName } = roomData;
  const isSeller = deal.sellerId === userId;
  const isBuyer = deal.buyerId === userId;
  const ndaUnlocked = !!deal.ndaSignedAt;
  const hasSigned = isSeller ? !!deal.sellerSignedAt : !!deal.buyerSignedAt;
  const otherSigned = isSeller ? !!deal.buyerSignedAt : !!deal.sellerSignedAt;
  // In the deal room, identity is always revealed (blind only applies to marketplace browsing)
  const assetLabel = listing?.assetName || `${listing?.therapeuticArea ?? ""} · ${listing?.modality ?? ""} (Listing #${deal.listingId})`;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur px-4 sm:px-6 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate("/market/deals")}
          className="text-muted-foreground hover:text-foreground transition-colors"
          data-testid="deal-room-back"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Shield className="w-4 h-4 shrink-0" style={{ color: ACCENT }} />
          <span className="font-semibold text-foreground text-sm truncate">Deal Room #{deal.id}</span>
          <span className="text-muted-foreground text-sm hidden sm:block truncate">— {assetLabel}</span>
          <Badge variant="outline" className={cn("text-[10px] ml-auto shrink-0", STATUS_COLORS[deal.status] ?? "border-border text-muted-foreground")}>
            {STATUS_LABELS[deal.status] ?? deal.status}
          </Badge>
        </div>
        {ndaUnlocked && isSeller && (
          <Select
            value={deal.status}
            onValueChange={handleStatusChange}
            disabled={updatingStatus}
          >
            <SelectTrigger className="h-7 w-44 text-xs shrink-0" data-testid="deal-status-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="nda_signed">NDA Signed</SelectItem>
              <SelectItem value="due_diligence">Due Diligence</SelectItem>
              <SelectItem value="term_sheet">Term Sheet</SelectItem>
              <SelectItem value="loi">Letter of Intent</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* Listing Info */}
        <div className="rounded-xl border border-card-border bg-card p-5 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">Asset Overview</span>
            {ndaUnlocked && <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-700 dark:text-emerald-400 gap-1"><Unlock className="w-2.5 h-2.5" />Full Access</Badge>}
          </div>
          {listing ? (
            <div className="space-y-2 text-xs text-muted-foreground">
              {listing.assetName && (
                <p><span className="font-medium text-foreground">Asset:</span> {listing.assetName}</p>
              )}
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="outline" className="text-[10px] border-border">{listing.therapeuticArea}</Badge>
                <Badge variant="outline" className="text-[10px] border-border">{listing.modality}</Badge>
                <Badge variant="outline" className="text-[10px] border-border">{listing.stage}</Badge>
              </div>
              {ndaUnlocked && (
                <div className="space-y-1 pt-1 border-t border-border">
                  {listing.mechanism && <p><span className="font-medium text-foreground">Mechanism:</span> {listing.mechanism}</p>}
                  {listing.ipStatus && <p><span className="font-medium text-foreground">IP Status:</span> {listing.ipStatus}</p>}
                  {listing.ipSummary && <p><span className="font-medium text-foreground">IP Summary:</span> {listing.ipSummary}</p>}
                  {listing.milestoneHistory && <p><span className="font-medium text-foreground">Milestones:</span> {listing.milestoneHistory}</p>}
                  {listing.askingPrice && <p><span className="font-medium text-foreground">Price:</span> {listing.askingPrice}</p>}
                  {listing.priceRangeMin && listing.priceRangeMax && (
                    <p><span className="font-medium text-foreground">Price Range:</span> ${listing.priceRangeMin}M – ${listing.priceRangeMax}M</p>
                  )}
                  {listing.aiSummary && (
                    <div className="rounded-lg bg-indigo-500/5 border border-indigo-500/15 p-3 mt-2">
                      <p className="text-xs font-semibold text-indigo-600 mb-1">AI Summary</p>
                      <p className="text-xs text-muted-foreground">{listing.aiSummary}</p>
                    </div>
                  )}
                </div>
              )}
              {!ndaUnlocked && (
                <p className="text-muted-foreground/60 italic text-[10px] pt-1">Full listing details are revealed after both parties sign the NDA.</p>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Listing details not available.</p>
          )}
          {/* Identity is revealed to both parties as soon as the deal is created (EOI accepted) */}
          {eoi && (
            <div className="pt-2 border-t border-border text-xs space-y-1">
              <div className="flex items-center gap-1.5 mb-1">
                <Building2 className="w-3 h-3 text-muted-foreground" />
                <span className="font-medium text-foreground">Counterparty Identity</span>
                <Badge variant="outline" className="text-[10px] border-indigo-500/30 text-indigo-700 dark:text-indigo-400">Revealed</Badge>
              </div>
              {/* Buyer sees seller org; seller sees buyer org */}
              {isBuyer && sellerOrgName && (
                <p><span className="text-muted-foreground">Seller Organisation:</span> <span className="font-medium text-foreground">{sellerOrgName}</span></p>
              )}
              {isSeller && buyerOrgName && (
                <p><span className="text-muted-foreground">Buyer Organisation:</span> <span className="font-medium text-foreground">{buyerOrgName}</span></p>
              )}
              {eoi.company && <p><span className="text-muted-foreground">Company (EOI):</span> {eoi.company}</p>}
              {eoi.role && <p><span className="text-muted-foreground">Role:</span> {eoi.role}</p>}
              {ndaUnlocked && (
                <>
                  {eoi.rationale && <p><span className="text-muted-foreground">Rationale:</span> {eoi.rationale}</p>}
                  {eoi.budgetRange && <p><span className="text-muted-foreground">Budget:</span> {eoi.budgetRange}</p>}
                  {eoi.timeline && <p><span className="text-muted-foreground">Timeline:</span> {eoi.timeline}</p>}
                </>
              )}
              {!ndaUnlocked && (
                <p className="text-muted-foreground/60 italic text-[10px]">Due diligence details (rationale, budget, timeline) unlock after NDA execution.</p>
              )}
            </div>
          )}
        </div>

        {/* NDA Sign Section */}
        <div className={cn("rounded-xl border p-5 space-y-4", ndaUnlocked ? "border-emerald-500/30 bg-emerald-500/5" : "border-card-border bg-card")}>
          <div className="flex items-center gap-2">
            {ndaUnlocked ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <FileSignature className="w-4 h-4" style={{ color: ACCENT }} />
            )}
            <span className="text-sm font-semibold text-foreground">
              {ndaUnlocked ? "Mutual NDA — Executed" : "Mutual Non-Disclosure Agreement"}
            </span>
          </div>

          {ndaUnlocked ? (
            <div className="text-xs text-muted-foreground space-y-1.5">
              <p>Both parties have executed the NDA. The deal room is fully unlocked.</p>
              <p>
                <span className="font-medium text-foreground">Party A (Seller):</span> {deal.sellerSignedName} —{" "}
                {deal.sellerSignedAt ? new Date(deal.sellerSignedAt).toLocaleString() : ""}
              </p>
              <p>
                <span className="font-medium text-foreground">Party B (Buyer):</span> {deal.buyerSignedName} —{" "}
                {deal.buyerSignedAt ? new Date(deal.buyerSignedAt).toLocaleString() : ""}
              </p>
              {ndaDocumentUrl && (
                <a
                  href={ndaDocumentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-700 dark:text-indigo-400 hover:underline mt-1"
                  data-testid="nda-download-link"
                >
                  <Download className="w-3 h-3" />
                  Download executed NDA
                </a>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <NdaTemplate deal={deal} listing={listing} eoi={eoi} />

              <div className="flex items-start gap-3 pt-2 border-t border-border">
                <div className="pt-0.5">
                  {hasSigned ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  ) : (
                    <div className="w-4 h-4 rounded border border-border mt-0.5 flex items-center justify-center cursor-pointer"
                      style={ndaChecked ? { background: ACCENT, borderColor: ACCENT } : {}}
                      onClick={() => setNdaChecked(!ndaChecked)}
                      data-testid="nda-checkbox"
                    >
                      {ndaChecked && <span className="text-white text-[10px]">✓</span>}
                    </div>
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  {hasSigned ? (
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">You have signed the NDA.</p>
                      {otherSigned ? null : (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" /> Waiting for the other party to sign…
                        </p>
                      )}
                    </div>
                  ) : (
                    <>
                      <p className="text-xs text-muted-foreground">
                        I have read and agree to the terms of this Mutual Non-Disclosure Agreement.
                      </p>
                      {ndaChecked && (
                        <div className="flex gap-2">
                          <Input
                            placeholder="Type your full legal name to sign"
                            value={signedName}
                            onChange={e => setSignedName(e.target.value)}
                            className="h-8 text-xs flex-1"
                            data-testid="nda-sign-name"
                          />
                          <Button
                            size="sm"
                            className="h-8 text-xs text-white gap-1 shrink-0"
                            style={{ background: ACCENT }}
                            onClick={() => signNda()}
                            disabled={signing || signedName.trim().length < 2}
                            data-testid="nda-sign-button"
                          >
                            <FileSignature className="w-3 h-3" />
                            {signing ? "Signing…" : "Sign NDA"}
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                  {!hasSigned && otherSigned && (
                    <p className="text-xs text-amber-600 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> The other party has signed — your signature is needed to unlock the deal room.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Status History Timeline */}
        {Array.isArray(deal.statusHistory) && deal.statusHistory.length > 0 && (
          <div className="rounded-xl border border-card-border bg-card p-5 space-y-3">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">Deal Timeline</span>
            </div>
            <div className="relative pl-4 space-y-3">
              <div className="absolute left-1.5 top-1 bottom-1 w-px bg-border" />
              {deal.statusHistory.map((entry, i) => (
                <div key={i} className="relative flex items-start gap-3" data-testid={`status-history-${i}`}>
                  <div className="absolute -left-3 top-1 w-2 h-2 rounded-full border-2 border-indigo-500 bg-background" />
                  <div className="min-w-0">
                    <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-full border", STATUS_COLORS[entry.status] ?? "border-border text-muted-foreground")}>
                      {STATUS_LABELS[entry.status] ?? entry.status}
                    </span>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {new Date(entry.changedAt).toLocaleString()}
                      {entry.changedBy === "system" ? " · system" : ""}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Documents Section */}
        <div className={cn("rounded-xl border border-card-border bg-card p-5 space-y-4", !ndaUnlocked && "opacity-50 pointer-events-none")}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {ndaUnlocked ? <Upload className="w-4 h-4 text-muted-foreground" /> : <Lock className="w-4 h-4 text-muted-foreground" />}
              <span className="text-sm font-semibold text-foreground">Documents</span>
              {!ndaUnlocked && <span className="text-xs text-muted-foreground">(available after NDA signing)</span>}
            </div>
            {ndaUnlocked && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.xlsx,.doc,.xls"
                  className="hidden"
                  onChange={handleFileUpload}
                  data-testid="doc-file-input"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  data-testid="doc-upload-button"
                >
                  <Upload className="w-3 h-3" />
                  {uploading ? "Uploading…" : "Upload File"}
                </Button>
              </>
            )}
          </div>

          {documents.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">No documents uploaded yet.</p>
          ) : (
            <div className="space-y-2">
              {documents.map(doc => {
                const counterpartyLabel = isSeller ? "Buyer" : "Seller";
                const expanded = !!expandedViewHistory[doc.id];
                return (
                  <div
                    key={doc.id}
                    className="rounded-lg border border-border px-3 py-2.5"
                    data-testid={`doc-row-${doc.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <File className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <button
                          type="button"
                          onClick={() => openDocument(doc)}
                          className="text-xs font-medium text-foreground hover:underline truncate block text-left w-full"
                          data-testid={`doc-open-${doc.id}`}
                        >
                          {doc.fileName}
                        </button>
                        <p className="text-[10px] text-muted-foreground">
                          {doc.uploaderId === userId ? "You" : counterpartyLabel}
                          {" · "}
                          {doc.fileSize ? `${(doc.fileSize / 1024).toFixed(0)} KB · ` : ""}
                          {new Date(doc.uploadedAt).toLocaleDateString()}
                        </p>
                        {/* Engagement signal — counterparty's most recent open. */}
                        {doc.lastViewedByCounterparty ? (
                          <p
                            className="text-[10px] text-emerald-700 dark:text-emerald-400 flex items-center gap-1 mt-1"
                            data-testid={`doc-last-viewed-${doc.id}`}
                          >
                            <Eye className="w-2.5 h-2.5" />
                            Last viewed by {counterpartyLabel} · {relativeTime(doc.lastViewedByCounterparty.viewedAt)}
                            {doc.viewCountByCounterparty > 1 && (
                              <span className="text-muted-foreground/70"> · {doc.viewCountByCounterparty} opens</span>
                            )}
                          </p>
                        ) : (
                          <p
                            className="text-[10px] text-muted-foreground/60 italic flex items-center gap-1 mt-1"
                            data-testid={`doc-not-viewed-${doc.id}`}
                          >
                            <Eye className="w-2.5 h-2.5" />
                            Not yet viewed by {counterpartyLabel}
                          </p>
                        )}
                      </div>
                      {doc.viewCountByCounterparty > 0 && (
                        <button
                          type="button"
                          onClick={() => setExpandedViewHistory(prev => ({ ...prev, [doc.id]: !prev[doc.id] }))}
                          className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                          data-testid={`doc-view-history-toggle-${doc.id}`}
                          aria-label={expanded ? "Collapse view history" : "Expand view history"}
                        >
                          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        </button>
                      )}
                      {doc.uploaderId === userId && (
                        <button
                          onClick={() => { if (confirm("Delete this document?")) deleteDoc(doc.id); }}
                          className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                          data-testid={`doc-delete-${doc.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    {expanded && doc.counterpartyViews.length > 0 && (
                      <div
                        className="mt-2 ml-7 pl-3 border-l border-border space-y-1"
                        data-testid={`doc-view-history-${doc.id}`}
                      >
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                          View history ({doc.counterpartyViews.length})
                        </p>
                        {doc.counterpartyViews.map((v, i) => (
                          <p
                            key={i}
                            className="text-[10px] text-muted-foreground"
                            data-testid={`doc-view-entry-${doc.id}-${i}`}
                          >
                            <span className="text-foreground">{counterpartyLabel}</span> · {new Date(v.viewedAt).toLocaleString()} ({relativeTime(v.viewedAt)})
                          </p>
                        ))}
                        {doc.ownViewCount > 0 && (
                          <p className="text-[10px] text-muted-foreground/60 italic pt-1 border-t border-border/40">
                            You opened this {doc.ownViewCount} time{doc.ownViewCount === 1 ? "" : "s"}.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Messaging */}
        <div className={cn("rounded-xl border border-card-border bg-card overflow-hidden", !ndaUnlocked && "opacity-50 pointer-events-none")}>
          <div className="px-5 py-3 border-b border-border flex items-center gap-2">
            <Send className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">Messages</span>
            {!ndaUnlocked && <span className="text-xs text-muted-foreground">(available after NDA signing)</span>}
          </div>

          <div className="px-5 py-3 min-h-48 max-h-80 overflow-y-auto space-y-3">
            {messages.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">No messages yet. Start the conversation.</p>
            ) : (
              messages.map(msg => {
                const isMine = msg.senderId === userId;
                return (
                  <div
                    key={msg.id}
                    className={cn("flex", isMine ? "justify-end" : "justify-start")}
                    data-testid={`message-${msg.id}`}
                  >
                    <div className={cn(
                      "max-w-[75%] rounded-xl px-4 py-2.5 text-xs space-y-1",
                      isMine
                        ? "text-white rounded-br-sm"
                        : "bg-muted text-foreground rounded-bl-sm"
                    )}
                      style={isMine ? { background: ACCENT } : {}}
                    >
                      <p className="leading-relaxed">{msg.body}</p>
                      <p className={cn("text-[10px]", isMine ? "text-white/70" : "text-muted-foreground")}>
                        {isMine ? "You" : (isSeller ? "Buyer" : "Seller")} · {new Date(msg.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {ndaUnlocked && (
            <div className="px-5 py-3 border-t border-border flex gap-2">
              <Textarea
                placeholder="Write a message…"
                value={messageBody}
                onChange={e => setMessageBody(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (messageBody.trim()) sendMessage(); } }}
                className="min-h-0 h-8 resize-none text-xs py-1.5 flex-1"
                data-testid="message-input"
              />
              <Button
                size="sm"
                className="h-8 w-8 p-0 shrink-0 text-white"
                style={{ background: ACCENT }}
                onClick={() => { if (messageBody.trim()) sendMessage(); }}
                disabled={sendingMsg || !messageBody.trim()}
                data-testid="message-send-button"
              >
                <Send className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Close-deal modal: collect final deal size, preview success-fee tier */}
      <Dialog open={closeModalOpen} onOpenChange={(o) => { if (!updatingStatus) setCloseModalOpen(o); }}>
        <DialogContent className="sm:max-w-md" data-testid="close-deal-modal">
          <DialogHeader>
            <DialogTitle>Close deal & issue success fee</DialogTitle>
            <DialogDescription>
              Enter the final deal size in USD millions. Closing the deal automatically generates a Stripe invoice for the corresponding success-fee tier and emails it to your billing address.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <label htmlFor="close-deal-size" className="text-xs font-medium text-foreground">Final deal size (USD millions)</label>
              <Input
                id="close-deal-size"
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                placeholder="e.g. 25"
                value={closeDealSizeM}
                onChange={(e) => setCloseDealSizeM(e.target.value)}
                data-testid="input-close-deal-size"
              />
            </div>
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs space-y-1">
              <p className="font-medium text-foreground">Success-fee tiers</p>
              <p className="text-muted-foreground">≤ $5M deal → $10k · ≤ $50M deal → $30k · &gt; $50M deal → $50k</p>
              {(() => {
                const n = Number(closeDealSizeM);
                const fee = feeForSize(n);
                if (!fee) return <p className="text-muted-foreground italic">Enter a deal size to preview your fee.</p>;
                return (
                  <p className="text-foreground" data-testid="text-fee-preview">
                    You will be invoiced <span className="font-semibold">${(fee / 1000).toFixed(0)}k</span> for a ${n}M deal.
                  </p>
                );
              })()}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCloseModalOpen(false)}
              disabled={updatingStatus}
              data-testid="button-close-modal-cancel"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="text-white"
              style={{ background: ACCENT }}
              disabled={updatingStatus || !feeForSize(Number(closeDealSizeM))}
              onClick={() => {
                const n = Number(closeDealSizeM);
                if (!feeForSize(n)) return;
                updateStatus({ status: "closed", dealSizeM: n });
              }}
              data-testid="button-close-modal-confirm"
            >
              {updatingStatus ? "Closing…" : "Close deal & issue invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
