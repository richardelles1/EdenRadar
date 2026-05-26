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
  Eye, ChevronDown, ChevronRight, BarChart3, Users, Star, TrendingUp, Plus, X, Sparkles,
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

type DealComp = {
  id: number;
  filingDate: string | null;
  licensor: string | null;
  licensee: string | null;
  assetName: string | null;
  indication: string | null;
  modality: string | null;
  developmentStage: string | null;
  upfrontUsd: number | null;
  totalValueUsd: number | null;
  milestoneDetails: string | null;
  geography: string | null;
  filingUrl: string | null;
};

type DealCompsData = {
  comps: DealComp[];
  benchmarks: { avgUpfrontM: number | null; avgTotalM: number | null; count: number };
};

type TermSheetFields = {
  upfrontUsdM?: number | null;
  milestonesUsdM?: number | null;
  royaltyPct?: number | null;
  territory?: string | null;
  exclusivity?: string | null;
  ipOwnership?: string | null;
  sublicensingRights?: string | null;
  diligenceRights?: string | null;
  notes?: string | null;
};

type TermSheet = {
  id: number;
  dealId: number;
  fields: TermSheetFields;
  sellerAgreedAt: string | null;
  buyerAgreedAt: string | null;
  lockedAt: string | null;
  lastEditedBy: string | null;
};

type Observer = {
  id: number;
  dealId: number;
  invitedBy: string;
  observerEmail: string;
  observerName: string;
  role: string;
  acceptedAt: string | null;
  invitedAt: string;
};

type DealFeedback = {
  id: number;
  dealId: number;
  responderId: string;
  responderRole: string;
  outcomeType: string;
  overallRating: number | null;
  timeToLoiDays: number | null;
  dealValueUsdM: number | null;
  mainBlocker: string | null;
  platformRating: number | null;
  platformComment: string | null;
  wouldRecommend: boolean | null;
};

type AiTermSuggestions = {
  upfrontUsdM?: { min: number; max: number; suggested: number };
  milestonesUsdM?: { min: number; max: number; suggested: number };
  royaltyPct?: { min: number; max: number; suggested: number };
  territory?: string;
  exclusivity?: string;
  rationale?: string;
};

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

  // Term sheet editing state
  const [tsEditing, setTsEditing] = useState(false);
  const [tsDraft, setTsDraft] = useState<TermSheetFields>({});
  const [tsAiSuggestions, setTsAiSuggestions] = useState<AiTermSuggestions | null>(null);
  const [loadingAiSuggestions, setLoadingAiSuggestions] = useState(false);

  // Observers state
  const [obsEmail, setObsEmail] = useState("");
  const [obsName, setObsName] = useState("");
  const [obsRole, setObsRole] = useState<"counsel" | "advisor" | "other">("counsel");
  const [obsInviting, setObsInviting] = useState(false);

  // Feedback state
  const [fbOutcome, setFbOutcome] = useState<string>("closed");
  const [fbOverallRating, setFbOverallRating] = useState<number | null>(null);
  const [fbPlatformRating, setFbPlatformRating] = useState<number | null>(null);
  const [fbMainBlocker, setFbMainBlocker] = useState("");
  const [fbPlatformComment, setFbPlatformComment] = useState("");
  const [fbWouldRecommend, setFbWouldRecommend] = useState<boolean | null>(null);
  const [fbTimeToLoi, setFbTimeToLoi] = useState<string>("");
  const [fbDealValue, setFbDealValue] = useState<string>("");

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

  const { data: compsData } = useQuery<DealCompsData>({
    queryKey: ["/api/market/deals", dealId, "comps"],
    queryFn: async () => {
      const res = await fetch(`/api/market/deals/${dealId}/comps`, { headers: authHeaders });
      if (!res.ok) return { comps: [], benchmarks: { avgUpfrontM: null, avgTotalM: null, count: 0 } };
      return res.json();
    },
    enabled: !!roomData?.deal?.ndaSignedAt,
  });

  const { data: termSheet, refetch: refetchTermSheet } = useQuery<TermSheet | null>({
    queryKey: ["/api/market/deals", dealId, "term-sheet"],
    queryFn: async () => {
      const res = await fetch(`/api/market/deals/${dealId}/term-sheet`, { headers: authHeaders });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!roomData?.deal?.ndaSignedAt,
  });

  const { data: observers = [], refetch: refetchObservers } = useQuery<Observer[]>({
    queryKey: ["/api/market/deals", dealId, "observers"],
    queryFn: async () => {
      const res = await fetch(`/api/market/deals/${dealId}/observers`, { headers: authHeaders });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!roomData?.deal?.ndaSignedAt,
  });

  const { data: feedbackData, refetch: refetchFeedback } = useQuery<{ submitted: boolean; feedback: DealFeedback | null }>({
    queryKey: ["/api/market/deals", dealId, "feedback"],
    queryFn: async () => {
      const res = await fetch(`/api/market/deals/${dealId}/feedback`, { headers: authHeaders });
      if (!res.ok) return { submitted: false, feedback: null };
      return res.json();
    },
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

  const { mutate: saveTermSheet, isPending: savingTs } = useMutation({
    mutationFn: async (fields: TermSheetFields) => {
      const res = await fetch(`/api/market/deals/${dealId}/term-sheet`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify(fields),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      return res.json();
    },
    onSuccess: () => {
      refetchTermSheet();
      setTsEditing(false);
      toast({ title: "Term sheet saved" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const { mutate: agreeTermSheet, isPending: agreeingTs } = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/market/deals/${dealId}/term-sheet/agree`, {
        method: "POST",
        headers: authHeaders,
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      return res.json();
    },
    onSuccess: () => {
      refetchTermSheet();
      toast({ title: "Agreement recorded" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const { mutate: inviteObserver } = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/market/deals/${dealId}/observers`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ observerEmail: obsEmail, observerName: obsName, role: obsRole }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      return res.json();
    },
    onSuccess: () => {
      refetchObservers();
      setObsEmail(""); setObsName(""); setObsRole("counsel"); setObsInviting(false);
      toast({ title: "Observer invited", description: `An invitation has been sent to ${obsEmail}` });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const { mutate: revokeObserver } = useMutation({
    mutationFn: async (obsId: number) => {
      const res = await fetch(`/api/market/deals/${dealId}/observers/${obsId}`, {
        method: "DELETE",
        headers: authHeaders,
      });
      if (!res.ok) throw new Error("Failed to revoke");
    },
    onSuccess: () => refetchObservers(),
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const { mutate: submitFeedback, isPending: submittingFb } = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/market/deals/${dealId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          outcomeType: fbOutcome,
          overallRating: fbOverallRating,
          platformRating: fbPlatformRating,
          mainBlocker: fbMainBlocker || null,
          platformComment: fbPlatformComment || null,
          wouldRecommend: fbWouldRecommend,
          timeToLoiDays: fbTimeToLoi ? parseInt(fbTimeToLoi, 10) : null,
          dealValueUsdM: fbDealValue ? parseFloat(fbDealValue) : null,
        }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      return res.json();
    },
    onSuccess: () => {
      refetchFeedback();
      toast({ title: "Feedback submitted — thank you!" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  async function getAiSuggestions() {
    setLoadingAiSuggestions(true);
    setTsAiSuggestions(null);
    try {
      const res = await fetch(`/api/market/deals/${dealId}/term-sheet/suggest`, {
        method: "POST",
        headers: authHeaders,
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      const { suggestions } = await res.json();
      setTsAiSuggestions(suggestions);
    } catch (err: any) {
      toast({ title: "AI suggestions unavailable", description: err.message, variant: "destructive" });
    } finally {
      setLoadingAiSuggestions(false);
    }
  }

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
              {/* E-Signature Audit Certificate */}
              {(() => {
                type SigEntry = { status: string; changedAt: string; signerName?: string; signerIp?: string };
                const history = (deal.statusHistory ?? []) as SigEntry[];
                const sellerSig = history.find(e => e.status === "seller_signed_nda");
                const buyerSig = history.find(e => e.status === "buyer_signed_nda");
                if (!sellerSig && !buyerSig) return null;
                return (
                  <div className="mt-3 rounded-lg border border-border bg-background/60 p-3 space-y-2">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">E-Signature Audit Trail · Doc ID: DEAL-{deal.id}-NDA</p>
                    {sellerSig && (
                      <div className="text-[10px] text-muted-foreground">
                        <p><span className="font-medium text-foreground">Party A (Seller):</span> {sellerSig.signerName} — {new Date(sellerSig.changedAt).toLocaleString()}</p>
                        {sellerSig.signerIp && <p className="text-muted-foreground/70">IP: {sellerSig.signerIp}</p>}
                      </div>
                    )}
                    {buyerSig && (
                      <div className="text-[10px] text-muted-foreground">
                        <p><span className="font-medium text-foreground">Party B (Buyer):</span> {buyerSig.signerName} — {new Date(buyerSig.changedAt).toLocaleString()}</p>
                        {buyerSig.signerIp && <p className="text-muted-foreground/70">IP: {buyerSig.signerIp}</p>}
                      </div>
                    )}
                  </div>
                );
              })()}
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

        {/* Term Sheet */}
        <div className={cn("rounded-xl border border-card-border bg-card p-5 space-y-4", !ndaUnlocked && "opacity-50 pointer-events-none")}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileSignature className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">Term Sheet</span>
              {!ndaUnlocked && <span className="text-xs text-muted-foreground">(available after NDA signing)</span>}
              {termSheet?.lockedAt && <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-700 dark:text-emerald-400">Agreed — Locked</Badge>}
            </div>
            {ndaUnlocked && !termSheet?.lockedAt && (
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setTsDraft(termSheet?.fields ?? {}); setTsEditing(true); }}>
                {termSheet ? "Edit" : "Create Term Sheet"}
              </Button>
            )}
          </div>

          {!termSheet && ndaUnlocked && (
            <p className="text-xs text-muted-foreground text-center py-4">No term sheet yet. Click <strong>Create Term Sheet</strong> to start drafting proposed deal terms.</p>
          )}

          {termSheet && !tsEditing && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2 text-xs">
                {termSheet.fields.upfrontUsdM != null && <div className="rounded-lg bg-muted/40 border border-border p-2.5"><p className="text-muted-foreground text-[10px] uppercase font-semibold mb-0.5">Upfront</p><p className="font-medium">${termSheet.fields.upfrontUsdM}M</p></div>}
                {termSheet.fields.milestonesUsdM != null && <div className="rounded-lg bg-muted/40 border border-border p-2.5"><p className="text-muted-foreground text-[10px] uppercase font-semibold mb-0.5">Milestones</p><p className="font-medium">${termSheet.fields.milestonesUsdM}M</p></div>}
                {termSheet.fields.royaltyPct != null && <div className="rounded-lg bg-muted/40 border border-border p-2.5"><p className="text-muted-foreground text-[10px] uppercase font-semibold mb-0.5">Royalty</p><p className="font-medium">{termSheet.fields.royaltyPct}%</p></div>}
                {termSheet.fields.territory && <div className="rounded-lg bg-muted/40 border border-border p-2.5"><p className="text-muted-foreground text-[10px] uppercase font-semibold mb-0.5">Territory</p><p className="font-medium">{termSheet.fields.territory}</p></div>}
                {termSheet.fields.exclusivity && <div className="rounded-lg bg-muted/40 border border-border p-2.5"><p className="text-muted-foreground text-[10px] uppercase font-semibold mb-0.5">Exclusivity</p><p className="font-medium">{termSheet.fields.exclusivity}</p></div>}
                {termSheet.fields.ipOwnership && <div className="rounded-lg bg-muted/40 border border-border p-2.5"><p className="text-muted-foreground text-[10px] uppercase font-semibold mb-0.5">IP Ownership</p><p className="font-medium">{termSheet.fields.ipOwnership}</p></div>}
              </div>
              {termSheet.fields.notes && <p className="text-xs text-muted-foreground bg-muted/30 rounded-lg border border-border p-2.5">{termSheet.fields.notes}</p>}
              <div className="flex items-center gap-3 pt-1">
                <div className="flex items-center gap-1.5 text-[10px]">
                  {termSheet.sellerAgreedAt ? <CheckCircle2 className="w-3 h-3 text-emerald-600" /> : <Clock className="w-3 h-3 text-muted-foreground" />}
                  <span className={termSheet.sellerAgreedAt ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}>Seller {termSheet.sellerAgreedAt ? "agreed" : "pending"}</span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px]">
                  {termSheet.buyerAgreedAt ? <CheckCircle2 className="w-3 h-3 text-emerald-600" /> : <Clock className="w-3 h-3 text-muted-foreground" />}
                  <span className={termSheet.buyerAgreedAt ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}>Buyer {termSheet.buyerAgreedAt ? "agreed" : "pending"}</span>
                </div>
                {!termSheet.lockedAt && !((isSeller && termSheet.sellerAgreedAt) || (!isSeller && termSheet.buyerAgreedAt)) && (
                  <Button size="sm" variant="outline" className="h-6 text-[10px] ml-auto gap-1" onClick={() => agreeTermSheet()} disabled={agreeingTs}>
                    <CheckCircle2 className="w-3 h-3" />Mark Agreed
                  </Button>
                )}
              </div>
            </div>
          )}

          {tsEditing && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Upfront ($M)", key: "upfrontUsdM", type: "number" },
                  { label: "Milestones ($M)", key: "milestonesUsdM", type: "number" },
                  { label: "Royalty (%)", key: "royaltyPct", type: "number" },
                  { label: "Territory", key: "territory", type: "text" },
                  { label: "Exclusivity", key: "exclusivity", type: "text" },
                  { label: "IP Ownership", key: "ipOwnership", type: "text" },
                  { label: "Sublicensing Rights", key: "sublicensingRights", type: "text" },
                  { label: "Diligence Rights", key: "diligenceRights", type: "text" },
                ].map(({ label, key, type }) => (
                  <div key={key}>
                    <label className="text-[10px] font-medium text-muted-foreground uppercase">{label}</label>
                    <Input
                      type={type}
                      value={(tsDraft as Record<string, unknown>)[key] as string ?? ""}
                      onChange={e => setTsDraft(prev => ({ ...prev, [key]: type === "number" ? (e.target.value ? parseFloat(e.target.value) : null) : e.target.value || null }))}
                      className="h-7 text-xs mt-1"
                    />
                  </div>
                ))}
              </div>
              <div>
                <label className="text-[10px] font-medium text-muted-foreground uppercase">Notes</label>
                <Textarea value={tsDraft.notes ?? ""} onChange={e => setTsDraft(prev => ({ ...prev, notes: e.target.value || null }))} className="h-16 text-xs mt-1 resize-none" />
              </div>
              {/* AI Term Suggestions */}
              <Button
                type="button" variant="outline" size="sm"
                className="h-7 text-xs gap-1.5 w-full border-indigo-500/30 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-500/5"
                onClick={getAiSuggestions}
                disabled={loadingAiSuggestions}
              >
                <Sparkles className="w-3 h-3" />
                {loadingAiSuggestions ? "Getting AI suggestions…" : "Get AI Term Suggestions"}
              </Button>

              {tsAiSuggestions && (
                <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/5 p-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="w-3 h-3 text-indigo-500" />
                      <span className="text-[10px] font-semibold text-indigo-700 dark:text-indigo-400 uppercase tracking-wide">AI Suggested Terms</span>
                    </div>
                    <button onClick={() => setTsAiSuggestions(null)} className="text-muted-foreground hover:text-foreground">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  {tsAiSuggestions.rationale && (
                    <p className="text-[10px] text-muted-foreground leading-relaxed">{tsAiSuggestions.rationale}</p>
                  )}
                  <div className="grid grid-cols-3 gap-2">
                    {tsAiSuggestions.upfrontUsdM && (
                      <div className="rounded bg-background border border-border p-2 text-center space-y-0.5">
                        <p className="text-[9px] text-muted-foreground uppercase font-semibold">Upfront</p>
                        <p className="text-xs font-bold text-foreground">${tsAiSuggestions.upfrontUsdM.suggested}M</p>
                        <p className="text-[9px] text-muted-foreground">${tsAiSuggestions.upfrontUsdM.min}–{tsAiSuggestions.upfrontUsdM.max}M</p>
                        <button className="text-[9px] text-indigo-600 dark:text-indigo-400 hover:underline" onClick={() => setTsDraft(prev => ({ ...prev, upfrontUsdM: tsAiSuggestions.upfrontUsdM!.suggested }))}>Apply</button>
                      </div>
                    )}
                    {tsAiSuggestions.milestonesUsdM && (
                      <div className="rounded bg-background border border-border p-2 text-center space-y-0.5">
                        <p className="text-[9px] text-muted-foreground uppercase font-semibold">Milestones</p>
                        <p className="text-xs font-bold text-foreground">${tsAiSuggestions.milestonesUsdM.suggested}M</p>
                        <p className="text-[9px] text-muted-foreground">${tsAiSuggestions.milestonesUsdM.min}–{tsAiSuggestions.milestonesUsdM.max}M</p>
                        <button className="text-[9px] text-indigo-600 dark:text-indigo-400 hover:underline" onClick={() => setTsDraft(prev => ({ ...prev, milestonesUsdM: tsAiSuggestions.milestonesUsdM!.suggested }))}>Apply</button>
                      </div>
                    )}
                    {tsAiSuggestions.royaltyPct && (
                      <div className="rounded bg-background border border-border p-2 text-center space-y-0.5">
                        <p className="text-[9px] text-muted-foreground uppercase font-semibold">Royalty</p>
                        <p className="text-xs font-bold text-foreground">{tsAiSuggestions.royaltyPct.suggested}%</p>
                        <p className="text-[9px] text-muted-foreground">{tsAiSuggestions.royaltyPct.min}–{tsAiSuggestions.royaltyPct.max}%</p>
                        <button className="text-[9px] text-indigo-600 dark:text-indigo-400 hover:underline" onClick={() => setTsDraft(prev => ({ ...prev, royaltyPct: tsAiSuggestions.royaltyPct!.suggested }))}>Apply</button>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {tsAiSuggestions.territory && (
                      <span className="text-[10px] text-muted-foreground">Territory: <strong className="text-foreground">{tsAiSuggestions.territory}</strong>{" "}
                        <button className="text-indigo-600 dark:text-indigo-400 hover:underline" onClick={() => setTsDraft(prev => ({ ...prev, territory: tsAiSuggestions.territory }))}>Apply</button>
                      </span>
                    )}
                    {tsAiSuggestions.exclusivity && (
                      <span className="text-[10px] text-muted-foreground">Exclusivity: <strong className="text-foreground">{tsAiSuggestions.exclusivity}</strong>{" "}
                        <button className="text-indigo-600 dark:text-indigo-400 hover:underline" onClick={() => setTsDraft(prev => ({ ...prev, exclusivity: tsAiSuggestions.exclusivity }))}>Apply</button>
                      </span>
                    )}
                  </div>
                  <Button size="sm" variant="outline" className="w-full h-7 text-[10px] gap-1.5 border-indigo-500/30" onClick={() => {
                    const f: TermSheetFields = {};
                    if (tsAiSuggestions.upfrontUsdM) f.upfrontUsdM = tsAiSuggestions.upfrontUsdM.suggested;
                    if (tsAiSuggestions.milestonesUsdM) f.milestonesUsdM = tsAiSuggestions.milestonesUsdM.suggested;
                    if (tsAiSuggestions.royaltyPct) f.royaltyPct = tsAiSuggestions.royaltyPct.suggested;
                    if (tsAiSuggestions.territory) f.territory = tsAiSuggestions.territory;
                    if (tsAiSuggestions.exclusivity) f.exclusivity = tsAiSuggestions.exclusivity;
                    setTsDraft(prev => ({ ...prev, ...f }));
                    toast({ title: "All AI suggestions applied" });
                  }}>
                    <Sparkles className="w-3 h-3" /> Apply All
                  </Button>
                </div>
              )}

              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setTsEditing(false); setTsAiSuggestions(null); }}>Cancel</Button>
                <Button size="sm" className="h-7 text-xs text-white" style={{ background: ACCENT }} onClick={() => saveTermSheet(tsDraft)} disabled={savingTs}>
                  {savingTs ? "Saving…" : "Save Term Sheet"}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Deal Comps */}
        {ndaUnlocked && compsData && compsData.comps.length > 0 && (
          <div className="rounded-xl border border-card-border bg-card p-5 space-y-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">Deal Benchmarks</span>
              <Badge variant="outline" className="text-[10px]">{compsData.benchmarks.count} comparable deals</Badge>
            </div>
            {(compsData.benchmarks.avgUpfrontM || compsData.benchmarks.avgTotalM) && (
              <div className="grid grid-cols-2 gap-3">
                {compsData.benchmarks.avgUpfrontM != null && (
                  <div className="rounded-lg bg-indigo-500/5 border border-indigo-500/15 p-3 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase font-semibold mb-1">Avg Upfront</p>
                    <p className="text-lg font-bold" style={{ color: ACCENT }}>${compsData.benchmarks.avgUpfrontM}M</p>
                    <p className="text-[10px] text-muted-foreground">across {compsData.benchmarks.count} deals</p>
                  </div>
                )}
                {compsData.benchmarks.avgTotalM != null && (
                  <div className="rounded-lg bg-indigo-500/5 border border-indigo-500/15 p-3 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase font-semibold mb-1">Avg Total Value</p>
                    <p className="text-lg font-bold" style={{ color: ACCENT }}>${compsData.benchmarks.avgTotalM}M</p>
                    <p className="text-[10px] text-muted-foreground">across {compsData.benchmarks.count} deals</p>
                  </div>
                )}
              </div>
            )}
            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
              {compsData.comps.slice(0, 10).map(comp => (
                <div key={comp.id} className="rounded-lg border border-border px-3 py-2 flex items-start gap-3">
                  <TrendingUp className="w-3 h-3 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-medium text-foreground truncate">{comp.assetName ?? "Unknown Asset"}</span>
                      {comp.modality && <Badge variant="outline" className="text-[9px] px-1 py-0 border-border">{comp.modality}</Badge>}
                      {comp.developmentStage && <Badge variant="outline" className="text-[9px] px-1 py-0 border-border">{comp.developmentStage}</Badge>}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground flex-wrap">
                      {comp.licensor && <span>{comp.licensor} → {comp.licensee}</span>}
                      {comp.upfrontUsd != null && <span className="text-emerald-700 dark:text-emerald-400 font-medium">${(comp.upfrontUsd / 1e6).toFixed(1)}M upfront</span>}
                      {comp.totalValueUsd != null && <span>/ ${(comp.totalValueUsd / 1e6).toFixed(0)}M total</span>}
                      {comp.filingDate && <span>{comp.filingDate}</span>}
                      {comp.filingUrl && <a href={comp.filingUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">SEC filing</a>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Observers */}
        {ndaUnlocked && (
          <div className="rounded-xl border border-card-border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-semibold text-foreground">Counsel & Observers</span>
                <span className="text-xs text-muted-foreground">Your side only</span>
              </div>
              {!obsInviting && (
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setObsInviting(true)}>
                  <Plus className="w-3 h-3" />Invite
                </Button>
              )}
            </div>
            {obsInviting && (
              <div className="rounded-lg border border-border p-3 space-y-2 bg-muted/20">
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="text-[10px] font-medium text-muted-foreground uppercase">Email</label><Input value={obsEmail} onChange={e => setObsEmail(e.target.value)} className="h-7 text-xs mt-1" placeholder="counsel@firm.com" /></div>
                  <div><label className="text-[10px] font-medium text-muted-foreground uppercase">Name</label><Input value={obsName} onChange={e => setObsName(e.target.value)} className="h-7 text-xs mt-1" placeholder="Jane Smith" /></div>
                </div>
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground uppercase">Role</label>
                  <Select value={obsRole} onValueChange={(v) => setObsRole(v as typeof obsRole)}>
                    <SelectTrigger className="h-7 text-xs mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="counsel">Legal Counsel</SelectItem>
                      <SelectItem value="advisor">Advisor</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setObsInviting(false)}>Cancel</Button>
                  <Button size="sm" className="h-7 text-xs text-white" style={{ background: ACCENT }}
                    onClick={() => inviteObserver()}
                    disabled={!obsEmail || !obsName}>
                    Send Invite
                  </Button>
                </div>
              </div>
            )}
            {observers.length === 0 && !obsInviting && (
              <p className="text-xs text-muted-foreground text-center py-3">No observers invited yet. Add legal counsel or advisors for read-only access.</p>
            )}
            {observers.map(obs => (
              <div key={obs.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
                <Users className="w-3 h-3 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground">{obs.observerName}</p>
                  <p className="text-[10px] text-muted-foreground">{obs.observerEmail} · {obs.role}</p>
                  {obs.acceptedAt && <p className="text-[10px] text-emerald-700 dark:text-emerald-400">Accepted {new Date(obs.acceptedAt).toLocaleDateString()}</p>}
                  {!obs.acceptedAt && <p className="text-[10px] text-amber-600">Invite pending</p>}
                </div>
                <button onClick={() => { if (confirm("Revoke this observer's access?")) revokeObserver(obs.id); }} className="text-muted-foreground hover:text-destructive transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

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
        {/* Post-Deal Feedback */}
        <div className="rounded-xl border border-card-border bg-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Star className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">Deal Feedback</span>
            {feedbackData?.submitted && <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-700 dark:text-emerald-400">Submitted</Badge>}
          </div>
          {feedbackData?.submitted ? (
            <div className="text-xs text-muted-foreground space-y-1">
              <p>Thank you for sharing your feedback on this deal. Your responses are kept confidential and used to improve EdenMarket intelligence.</p>
              {feedbackData.feedback?.overallRating && (
                <p><span className="font-medium text-foreground">Overall rating:</span> {"★".repeat(feedbackData.feedback.overallRating)}{"☆".repeat(5 - feedbackData.feedback.overallRating)}</p>
              )}
              {feedbackData.feedback?.platformRating && (
                <p><span className="font-medium text-foreground">Platform rating:</span> {"★".repeat(feedbackData.feedback.platformRating)}{"☆".repeat(5 - feedbackData.feedback.platformRating)}</p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">Share your experience to help improve EdenMarket's deal intelligence for the whole community. Takes ~2 minutes.</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground uppercase">Outcome</label>
                  <Select value={fbOutcome} onValueChange={setFbOutcome}>
                    <SelectTrigger className="h-7 text-xs mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="closed">Deal Closed</SelectItem>
                      <SelectItem value="abandoned_nda">Stopped after NDA</SelectItem>
                      <SelectItem value="abandoned_diligence">Stopped during Due Diligence</SelectItem>
                      <SelectItem value="abandoned_terms">Stopped during Terms Negotiation</SelectItem>
                      <SelectItem value="abandoned_other">Stopped for other reasons</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground uppercase">Deal Value ($M, if closed)</label>
                  <Input type="number" value={fbDealValue} onChange={e => setFbDealValue(e.target.value)} className="h-7 text-xs mt-1" placeholder="e.g. 12" />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground uppercase">Time to LOI (days)</label>
                  <Input type="number" value={fbTimeToLoi} onChange={e => setFbTimeToLoi(e.target.value)} className="h-7 text-xs mt-1" placeholder="e.g. 45" />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground uppercase">Would Recommend EdenMarket?</label>
                  <Select value={fbWouldRecommend === null ? "" : String(fbWouldRecommend)} onValueChange={v => setFbWouldRecommend(v === "" ? null : v === "true")}>
                    <SelectTrigger className="h-7 text-xs mt-1"><SelectValue placeholder="Select…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Yes</SelectItem>
                      <SelectItem value="false">No</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground uppercase">Overall Deal Rating (1–5)</label>
                  <div className="flex gap-1.5 mt-1.5">
                    {[1, 2, 3, 4, 5].map(n => (
                      <button key={n} onClick={() => setFbOverallRating(fbOverallRating === n ? null : n)}
                        className={cn("w-6 h-6 rounded text-xs font-medium border transition-colors",
                          fbOverallRating !== null && n <= fbOverallRating ? "border-amber-400 bg-amber-400/20 text-amber-700 dark:text-amber-400" : "border-border text-muted-foreground hover:border-amber-400/50")}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground uppercase">Platform Rating (1–5)</label>
                  <div className="flex gap-1.5 mt-1.5">
                    {[1, 2, 3, 4, 5].map(n => (
                      <button key={n} onClick={() => setFbPlatformRating(fbPlatformRating === n ? null : n)}
                        className={cn("w-6 h-6 rounded text-xs font-medium border transition-colors",
                          fbPlatformRating !== null && n <= fbPlatformRating ? "border-indigo-400 bg-indigo-400/20 text-indigo-700 dark:text-indigo-400" : "border-border text-muted-foreground hover:border-indigo-400/50")}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-medium text-muted-foreground uppercase">Main blocker or key friction point (optional)</label>
                <Input value={fbMainBlocker} onChange={e => setFbMainBlocker(e.target.value)} className="h-7 text-xs mt-1" placeholder="e.g. Valuation disagreement, timeline mismatch…" />
              </div>
              <div>
                <label className="text-[10px] font-medium text-muted-foreground uppercase">Comments on EdenMarket (optional)</label>
                <Textarea value={fbPlatformComment} onChange={e => setFbPlatformComment(e.target.value)} className="h-14 text-xs mt-1 resize-none" placeholder="What would have made this experience better?" />
              </div>
              <div className="flex justify-end">
                <Button size="sm" className="text-white text-xs" style={{ background: ACCENT }} onClick={() => submitFeedback()} disabled={submittingFb}>
                  {submittingFb ? "Submitting…" : "Submit Feedback"}
                </Button>
              </div>
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
