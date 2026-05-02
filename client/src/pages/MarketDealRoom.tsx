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
import { cn } from "@/lib/utils";
import {
  ArrowLeft, Lock, Unlock, FileSignature, Upload, File, Trash2,
  Send, CheckCircle2, Clock, AlertCircle, Shield, Building2,
} from "lucide-react";
import type { MarketDeal, MarketDealDocument, MarketDealMessage } from "@shared/schema";

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

type DealRoomData = { deal: MarketDeal; listing: PartialListing | null; eoi: PartialEoi | null };

const ACCENT = "hsl(271 81% 55%)";

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
  due_diligence: "bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/20",
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
    refetchInterval: 30000,
  });

  const { data: documents = [] } = useQuery<MarketDealDocument[]>({
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
    refetchInterval: 30000,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
    mutationFn: async (status: string) => {
      const res = await fetch(`/api/market/deals/${dealId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/market/deals", dealId] });
      toast({ title: "Status updated" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

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
        <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
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

  const { deal, listing, eoi } = roomData;
  const isSeller = deal.sellerId === userId;
  const isBuyer = deal.buyerId === userId;
  const ndaUnlocked = !!deal.ndaSignedAt;
  const hasSigned = isSeller ? !!deal.sellerSignedAt : !!deal.buyerSignedAt;
  const otherSigned = isSeller ? !!deal.buyerSignedAt : !!deal.sellerSignedAt;
  const assetLabel = listing?.blind
    ? `${listing.therapeuticArea} · ${listing.modality} (Blind)`
    : (listing?.assetName || `Listing #${deal.listingId}`);

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
            onValueChange={(v) => updateStatus(v)}
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
              {listing.assetName && !listing.blind && (
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
                    <div className="rounded-lg bg-violet-500/5 border border-violet-500/15 p-3 mt-2">
                      <p className="text-xs font-semibold text-violet-600 mb-1">AI Summary</p>
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
          {eoi && ndaUnlocked && (
            <div className="pt-2 border-t border-border text-xs space-y-1">
              <p className="font-medium text-foreground">EOI Details</p>
              <p><span className="text-muted-foreground">Company:</span> {eoi.company} · {eoi.role}</p>
              <p><span className="text-muted-foreground">Rationale:</span> {eoi.rationale}</p>
              {eoi.budgetRange && <p><span className="text-muted-foreground">Budget:</span> {eoi.budgetRange}</p>}
              {eoi.timeline && <p><span className="text-muted-foreground">Timeline:</span> {eoi.timeline}</p>}
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
            <div className="text-xs text-muted-foreground space-y-1">
              <p>Both parties have executed the NDA. The deal room is fully unlocked.</p>
              <p>
                <span className="font-medium text-foreground">Party A (Seller):</span> {deal.sellerSignedName} —{" "}
                {deal.sellerSignedAt ? new Date(deal.sellerSignedAt).toLocaleString() : ""}
              </p>
              <p>
                <span className="font-medium text-foreground">Party B (Buyer):</span> {deal.buyerSignedName} —{" "}
                {deal.buyerSignedAt ? new Date(deal.buyerSignedAt).toLocaleString() : ""}
              </p>
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
              {documents.map(doc => (
                <div
                  key={doc.id}
                  className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5"
                  data-testid={`doc-row-${doc.id}`}
                >
                  <File className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <a
                      href={doc.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-foreground hover:underline truncate block"
                    >
                      {doc.fileName}
                    </a>
                    <p className="text-[10px] text-muted-foreground">
                      {doc.fileSize ? `${(doc.fileSize / 1024).toFixed(0)} KB · ` : ""}
                      {new Date(doc.uploadedAt).toLocaleDateString()}
                    </p>
                  </div>
                  {doc.uploaderId === userId && (
                    <button
                      onClick={() => { if (confirm("Delete this document?")) deleteDoc(doc.id); }}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                      data-testid={`doc-delete-${doc.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
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
    </div>
  );
}
