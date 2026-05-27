import React, { useState, useEffect, type ReactNode } from "react";
import { useDocumentMeta } from "@/hooks/use-document-meta";
import { OrganizationsTab } from "@/components/admin/OrganizationsTab";
import { EdenMarketTab } from "@/components/admin/EdenMarketTab";
import { ApiManagementTab } from "@/components/admin/ApiManagementTab";
import { useQuery } from "@tanstack/react-query";
import {
  Shield, Lock, LogOut, Loader2, ChevronDown,
  Activity, Database, PackagePlus, ClipboardList, Inbox, Send,
  Microscope, Lightbulb, ArrowUpCircle, FlaskConical, BrainCircuit,
  Users, Building2, CreditCard, Server, BarChart3, Eye,
  Zap, Globe, Key,
} from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { EdenAvatar } from "@/components/EdenOrb";

// ── Lazy-loaded tab chunks ──────────────────────────────────────────────────
const DataPipeline        = React.lazy(() => import("./admin/DataPipeline").then(m => ({ default: m.DataPipeline })));
const DataQualityTab      = React.lazy(() => import("./admin/DataQuality").then(m => ({ default: m.DataQualityTab })));
const ManualImportTab     = React.lazy(() => import("./admin/ManualImport").then(m => ({ default: m.ManualImportTab })));
const NewArrivals         = React.lazy(() => import("./admin/NewArrivals").then(m => ({ default: m.NewArrivals })));
const DispatchTab         = React.lazy(() => import("./admin/Dispatch").then(m => ({ default: m.DispatchTab })));
const PipelineReviewQueue = React.lazy(() => import("./admin/Queues").then(m => ({ default: m.PipelineReviewQueue })));
const ResearchQueue       = React.lazy(() => import("./admin/Queues").then(m => ({ default: m.ResearchQueue })));
const ConceptQueue        = React.lazy(() => import("./admin/Queues").then(m => ({ default: m.ConceptQueue })));
const ConceptEscalationQueue = React.lazy(() => import("./admin/Queues").then(m => ({ default: m.ConceptEscalationQueue })));
const IndustryProjectsQueue  = React.lazy(() => import("./admin/Queues").then(m => ({ default: m.IndustryProjectsQueue })));
const AccountCenter       = React.lazy(() => import("./admin/AccountCenter").then(m => ({ default: m.AccountCenter })));
const EdenTab             = React.lazy(() => import("./admin/EdenTab").then(m => ({ default: m.EdenTab })));
const AnalyticsTab        = React.lazy(() => import("./admin/Analytics").then(m => ({ default: m.AnalyticsTab })));
const ImpersonationTab    = React.lazy(() => import("./admin/ImpersonationTab").then(m => ({ default: m.ImpersonationTab })));
const AuditLogTab         = React.lazy(() => import("./admin/AuditLog").then(m => ({ default: m.AuditLogTab })));
const SubscriptionData    = React.lazy(() => import("./admin/Misc").then(m => ({ default: m.SubscriptionData })));
const PlatformInfo        = React.lazy(() => import("./admin/Misc").then(m => ({ default: m.PlatformInfo })));
const DocumentsTab        = React.lazy(() => import("./admin/Documents").then(m => ({ default: m.DocumentsTab })));
const JarvisTab           = React.lazy(() => import("./admin/Jarvis").then(m => ({ default: m.JarvisTab })));
const TtoContactsTab      = React.lazy(() => import("./admin/TtoContacts").then(m => ({ default: m.TtoContactsTab })));

function TabFallback() {
  return (
    <div className="flex items-center justify-center p-8 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  );
}

// ── Auth gate ───────────────────────────────────────────────────────────────
function AdminAuthGate({ children }: { children: ReactNode }) {
  const { session, loading: authLoading } = useAuth();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!authLoading && !session) navigate("/login?redirect=/admin", { replace: true });
  }, [authLoading, session, navigate]);

  if (authLoading || (session && adminLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" data-testid="admin-gate-loading">
        <Loader2 className="h-6 w-6 text-primary animate-spin" />
      </div>
    );
  }
  if (!session) return null;
  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-6" data-testid="admin-gate-denied">
        <div className="w-full max-w-sm space-y-4 p-8 border border-border rounded-xl bg-card text-center">
          <Lock className="h-6 w-6 text-destructive mx-auto" />
          <h1 className="text-lg font-semibold text-foreground">Admin access required</h1>
          <p className="text-sm text-muted-foreground">
            Your account ({session.user.email}) is not on the admin allowlist. Contact an administrator to request access.
          </p>
          <Link href="/" className="text-sm text-primary underline">Return home</Link>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

// ── Inner shell (state + auth wiring) ──────────────────────────────────────
function AdminInner() {
  const [activeTab, setActiveTab] = useState("data-pipeline");
  const [navOpen, setNavOpen] = useState<Record<string, boolean>>({
    dataControls: true,
    productControls: true,
    adminControls: false,
    edenmarket: false,
    outbound: false,
    apiManagement: false,
  });
  const { theme, setTheme } = useTheme();
  const { session, signOut, sendPasswordReset } = useAuth();
  const { toast } = useToast();
  const pw = session?.access_token ?? "";

  async function onChangePassword() {
    const email = session?.user?.email;
    if (!email) {
      toast({ title: "Not signed in", variant: "destructive" });
      return;
    }
    const { error } = await sendPasswordReset(email);
    if (error) {
      toast({ title: "Could not send reset email", description: error, variant: "destructive" });
    } else {
      toast({
        title: "Password reset email sent",
        description: `Check ${email} for a link to set a new password.`,
      });
    }
  }

  return (
    <AdminPanel
      pw={pw}
      setAuthed={async (v) => { if (!v) { await signOut(); window.location.href = "/login"; } }}
      theme={theme}
      setTheme={setTheme}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      navOpen={navOpen}
      setNavOpen={setNavOpen}
      onChangePassword={onChangePassword}
      adminEmail={session?.user?.email ?? ""}
    />
  );
}

export default function Admin() {
  useDocumentMeta({ title: "Admin | EdenRadar", noindex: true });
  return <AdminAuthGate><AdminInner /></AdminAuthGate>;
}

// ── Main panel (nav + tab switcher) ────────────────────────────────────────
function AdminPanel({ pw, setAuthed, theme, setTheme, activeTab, setActiveTab, navOpen, setNavOpen, onChangePassword, adminEmail }: {
  pw: string;
  setAuthed: (v: boolean) => void;
  theme: string;
  setTheme: (v: "light" | "dark") => void;
  activeTab: string;
  setActiveTab: (v: string) => void;
  navOpen: Record<string, boolean>;
  setNavOpen: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  onChangePassword?: () => void | Promise<void>;
  adminEmail?: string;
}) {
  const { data: queueData } = useQuery<{ cards: any[] }>({
    queryKey: ["/api/admin/research-queue"],
    queryFn: async () => {
      const res = await fetch("/api/admin/research-queue", { headers: { ...(pw ? { Authorization: `Bearer ${pw}` } : {}) } });
      if (!res.ok) return { cards: [] };
      return res.json();
    },
    staleTime: 30000,
    enabled: !!pw,
  });
  const pendingCount = (queueData?.cards ?? []).filter((c) => c.adminStatus === "pending").length;

  return (
    <div className="min-h-screen bg-background" data-testid="admin-panel">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-screen-2xl mx-auto flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <Shield className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold text-foreground">EdenRadar Admin</h1>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="/admin/mobile"
              className="hidden sm:inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded-md hover:bg-muted transition-colors"
              data-testid="link-mobile-admin"
            >
              Mobile view →
            </a>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              data-testid="button-toggle-theme"
            >
              {theme === "dark" ? "Light" : "Dark"}
            </Button>
            {adminEmail ? (
              <span className="hidden md:inline text-xs text-muted-foreground" data-testid="text-admin-email">
                {adminEmail}
              </span>
            ) : null}
            {onChangePassword ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { void onChangePassword(); }}
                data-testid="button-change-password"
                title="Send a password-reset email to your admin address"
              >
                Change password
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setAuthed(false); }}
              data-testid="button-admin-logout"
            >
              <LogOut className="h-4 w-4 mr-1" /> Logout
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-screen-2xl mx-auto flex flex-col lg:flex-row">
        <aside className="shrink-0 border-b lg:border-b-0 lg:w-56 lg:border-r border-border lg:min-h-[calc(100vh-57px)]">
          <nav className="flex flex-row overflow-x-auto gap-1 p-2 lg:flex-col lg:overflow-x-visible lg:p-4 lg:gap-0">

            {/* ── DATA CONTROLS ── */}
            <div className="hidden lg:block pt-1 pb-1.5">
              <button
                onClick={() => setNavOpen(o => ({ ...o, dataControls: !o.dataControls }))}
                className="w-full flex items-center justify-between px-3 py-0.5 group"
              >
                <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Data Controls</p>
                <ChevronDown className={`h-3 w-3 text-muted-foreground/60 transition-transform duration-200 ${navOpen.dataControls ? "" : "-rotate-90"}`} />
              </button>
            </div>
            {navOpen.dataControls && (
              <>
                <button
                  onClick={() => setActiveTab("data-pipeline")}
                  className={`shrink-0 whitespace-nowrap lg:w-full text-left px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 ${
                    activeTab === "data-pipeline" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                  data-testid="nav-data-pipeline"
                >
                  <Activity className="h-4 w-4" />
                  Data Pipeline
                </button>
                <button
                  onClick={() => setActiveTab("data-quality")}
                  className={`shrink-0 whitespace-nowrap lg:w-full text-left px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 ${
                    activeTab === "data-quality" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                  data-testid="nav-data-quality"
                >
                  <Database className="h-4 w-4" />
                  Data Quality
                </button>
                <button
                  onClick={() => setActiveTab("manual-import")}
                  className={`shrink-0 whitespace-nowrap lg:w-full text-left px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 ${
                    activeTab === "manual-import" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                  data-testid="nav-manual-import"
                >
                  <PackagePlus className="h-4 w-4" />
                  Manual Import
                </button>
                <button
                  onClick={() => setActiveTab("pipeline-review")}
                  className={`shrink-0 whitespace-nowrap lg:w-full text-left px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 ${
                    activeTab === "pipeline-review" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                  data-testid="nav-pipeline-review"
                >
                  <ClipboardList className="h-4 w-4" />
                  Pipeline Review
                </button>
                <button
                  onClick={() => setActiveTab("new-arrivals")}
                  className={`shrink-0 whitespace-nowrap lg:w-full text-left px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 ${
                    activeTab === "new-arrivals" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                  data-testid="nav-new-arrivals"
                >
                  <Inbox className="h-4 w-4" />
                  Indexing Queue
                </button>
                <button
                  onClick={() => setActiveTab("dispatch")}
                  className={`shrink-0 whitespace-nowrap lg:w-full text-left px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 ${
                    activeTab === "dispatch" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                  data-testid="nav-dispatch"
                >
                  <Send className="h-4 w-4" />
                  Dispatch
                </button>
                <button
                  onClick={() => setActiveTab("tto-contacts")}
                  className={`shrink-0 whitespace-nowrap lg:w-full text-left px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 ${
                    activeTab === "tto-contacts" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                  data-testid="nav-tto-contacts"
                >
                  <Users className="h-4 w-4" />
                  TTO Contacts
                </button>
              </>
            )}

            {/* ── PRODUCT CONTROLS ── */}
            <div className="hidden lg:block border-t border-border mt-3 pt-1 pb-1.5">
              <button
                onClick={() => setNavOpen(o => ({ ...o, productControls: !o.productControls }))}
                className="w-full flex items-center justify-between px-3 py-0.5 group"
              >
                <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Product Controls</p>
                <ChevronDown className={`h-3 w-3 text-muted-foreground/60 transition-transform duration-200 ${navOpen.productControls ? "" : "-rotate-90"}`} />
              </button>
            </div>
            {navOpen.productControls && (
              <>
                <button
                  onClick={() => setActiveTab("research-queue")}
                  className={`shrink-0 whitespace-nowrap lg:w-full text-left px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 ${
                    activeTab === "research-queue" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                  data-testid="nav-research-queue"
                >
                  <Microscope className="h-4 w-4" />
                  <span>Discovery Cards Review</span>
                  {pendingCount > 0 && (
                    <span className="ml-auto text-[10px] font-bold bg-amber-500 text-white rounded-full px-1.5 py-0.5 min-w-[18px] text-center" data-testid="badge-pending-count">
                      {pendingCount}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setActiveTab("concept-queue")}
                  className={`shrink-0 whitespace-nowrap lg:w-full text-left px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 ${
                    activeTab === "concept-queue" ? "bg-amber-500/10 text-amber-600" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                  data-testid="nav-concept-queue"
                >
                  <Lightbulb className="h-4 w-4" />
                  Concept Review
                </button>
                <button
                  onClick={() => setActiveTab("concept-escalations")}
                  className={`shrink-0 whitespace-nowrap lg:w-full text-left px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 ${
                    activeTab === "concept-escalations" ? "bg-violet-500/10 text-violet-600 dark:text-violet-400" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                  data-testid="nav-concept-escalations"
                >
                  <ArrowUpCircle className="h-4 w-4" />
                  Graduation Queue
                </button>
                <button
                  onClick={() => setActiveTab("edenlab-review")}
                  className={`shrink-0 whitespace-nowrap lg:w-full text-left px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 ${
                    activeTab === "edenlab-review" ? "bg-violet-500/10 text-violet-600" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                  data-testid="nav-edenlab-review"
                >
                  <FlaskConical className="h-4 w-4" />
                  Research Projects Review
                </button>
                <button
                  onClick={() => setActiveTab("eden")}
                  className={`shrink-0 whitespace-nowrap lg:w-full text-left px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 ${
                    activeTab === "eden" ? "bg-emerald-500/10 text-emerald-600" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                  data-testid="nav-eden"
                >
                  <BrainCircuit className="h-4 w-4" />
                  EDEN
                </button>
              </>
            )}

            {/* ── ADMIN CONTROLS ── */}
            <div className="hidden lg:block border-t border-border mt-3 pt-1 pb-1.5">
              <button
                onClick={() => setNavOpen(o => ({ ...o, adminControls: !o.adminControls }))}
                className="w-full flex items-center justify-between px-3 py-0.5 group"
              >
                <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Admin Controls</p>
                <ChevronDown className={`h-3 w-3 text-muted-foreground/60 transition-transform duration-200 ${navOpen.adminControls ? "" : "-rotate-90"}`} />
              </button>
            </div>
            {navOpen.adminControls && (
              <>
                <button
                  onClick={() => setActiveTab("account-center")}
                  className={`shrink-0 whitespace-nowrap lg:w-full text-left px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 ${
                    activeTab === "account-center" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                  data-testid="nav-account-center"
                >
                  <Users className="h-4 w-4" />
                  Account Center
                </button>
                <button
                  onClick={() => setActiveTab("organizations")}
                  className={`shrink-0 whitespace-nowrap lg:w-full text-left px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 ${
                    activeTab === "organizations" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                  data-testid="nav-organizations"
                >
                  <Building2 className="h-4 w-4" />
                  Organizations
                </button>
                <button
                  onClick={() => setActiveTab("subscription-data")}
                  className={`shrink-0 whitespace-nowrap lg:w-full text-left px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 ${
                    activeTab === "subscription-data" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                  data-testid="nav-subscription-data"
                >
                  <CreditCard className="h-4 w-4" />
                  Subscription Data
                </button>
                <button
                  onClick={() => setActiveTab("platform-info")}
                  className={`shrink-0 whitespace-nowrap lg:w-full text-left px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 ${
                    activeTab === "platform-info" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                  data-testid="nav-platform-info"
                >
                  <Server className="h-4 w-4" />
                  Platform Info
                </button>
                <button
                  onClick={() => setActiveTab("analytics")}
                  className={`shrink-0 whitespace-nowrap lg:w-full text-left px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 ${
                    activeTab === "analytics" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                  data-testid="nav-analytics"
                >
                  <BarChart3 className="h-4 w-4" />
                  Analytics
                </button>
                <button
                  onClick={() => setActiveTab("impersonation")}
                  className={`shrink-0 whitespace-nowrap lg:w-full text-left px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 ${
                    activeTab === "impersonation" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                  data-testid="nav-impersonation"
                >
                  <Eye className="h-4 w-4" />
                  Impersonation
                </button>
                <button
                  onClick={() => setActiveTab("audit-log")}
                  className={`shrink-0 whitespace-nowrap lg:w-full text-left px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 ${
                    activeTab === "audit-log" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                  data-testid="nav-audit-log"
                >
                  <ClipboardList className="h-4 w-4" />
                  Audit Log
                </button>
              </>
            )}

            {/* ── JARVIS ── */}
            <div className="hidden lg:block border-t border-border mt-3 pt-1 pb-1.5">
              <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground px-3 py-0.5">Jarvis</p>
            </div>
            <button
              onClick={() => setActiveTab("jarvis")}
              className={`shrink-0 whitespace-nowrap lg:w-full text-left px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 ${
                activeTab === "jarvis" ? "bg-emerald-500/10 text-emerald-600" : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
              data-testid="nav-jarvis"
            >
              <Zap className="h-4 w-4" />
              JARVIS
            </button>

            {/* ── EDENMARKET ── */}
            <div className="hidden lg:block border-t border-border mt-3 pt-1 pb-1.5">
              <button
                onClick={() => setNavOpen(o => ({ ...o, edenmarket: !o.edenmarket }))}
                className="w-full flex items-center justify-between px-3 py-0.5 group"
              >
                <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">EdenMarket</p>
                <ChevronDown className={`h-3 w-3 text-muted-foreground/60 transition-transform duration-200 ${navOpen.edenmarket ? "" : "-rotate-90"}`} />
              </button>
            </div>
            {navOpen.edenmarket && (
              <>
                <button
                  onClick={() => setActiveTab("edenmarket")}
                  className={`shrink-0 whitespace-nowrap lg:w-full text-left px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 ${
                    activeTab === "edenmarket" ? "bg-indigo-500/10 text-indigo-600" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                  data-testid="nav-edenmarket"
                >
                  <Globe className="h-4 w-4" />
                  EdenMarket
                </button>
              </>
            )}

            {/* ── OUTBOUND ── */}
            <div className="hidden lg:block border-t border-border mt-3 pt-1 pb-1.5">
              <button
                onClick={() => setNavOpen(o => ({ ...o, outbound: !o.outbound }))}
                className="w-full flex items-center justify-between px-3 py-0.5 group"
              >
                <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Outbound</p>
                <ChevronDown className={`h-3 w-3 text-muted-foreground/60 transition-transform duration-200 ${navOpen.outbound ? "" : "-rotate-90"}`} />
              </button>
            </div>
            {navOpen.outbound && (
              <>
                <button
                  onClick={() => setActiveTab("documents")}
                  className={`shrink-0 whitespace-nowrap lg:w-full text-left px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 ${
                    activeTab === "documents" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                  data-testid="nav-documents"
                >
                  <ClipboardList className="h-4 w-4" />
                  Export Log
                </button>
              </>
            )}

            {/* ── API MANAGEMENT ── */}
            <div className="hidden lg:block border-t border-border mt-3 pt-1 pb-1.5">
              <button
                onClick={() => setNavOpen(o => ({ ...o, apiManagement: !o.apiManagement }))}
                className="w-full flex items-center justify-between px-3 py-0.5 group"
              >
                <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">API Management</p>
                <ChevronDown className={`h-3 w-3 text-muted-foreground/60 transition-transform duration-200 ${navOpen.apiManagement ? "" : "-rotate-90"}`} />
              </button>
            </div>
            {navOpen.apiManagement && (
              <>
                <button
                  onClick={() => setActiveTab("api-management")}
                  className={`shrink-0 whitespace-nowrap lg:w-full text-left px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 ${
                    activeTab === "api-management" ? "bg-violet-500/10 text-violet-600 dark:text-violet-400" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                  data-testid="nav-api-management"
                >
                  <Key className="h-4 w-4" />
                  API Management
                </button>
              </>
            )}
          </nav>
        </aside>

        <main className="flex-1 p-6 overflow-hidden">
          <React.Suspense fallback={<TabFallback />}>
            {activeTab === "new-arrivals" && (
              <>
                <div className="mb-6">
                  <h2 className="text-2xl font-semibold text-foreground" data-testid="text-section-title">Indexing Queue</h2>
                  <p className="text-sm text-muted-foreground mt-1">All discovered assets not yet pushed to the pipeline, grouped by institution. Push to make them visible in Scout.</p>
                </div>
                <NewArrivals pw={pw} />
              </>
            )}

            {activeTab === "dispatch" && <DispatchTab pw={pw} />}

            {activeTab === "manual-import" && (
              <>
                <div className="mb-6">
                  <h2 className="text-2xl font-semibold text-foreground" data-testid="text-section-title">Manual Import</h2>
                  <p className="text-sm text-muted-foreground mt-1">Upload a screenshot or paste text from any TTO listing. AI extracts structured fields and adds the asset to the Indexing Queue.</p>
                </div>
                <ManualImportTab pw={pw} setActiveTab={setActiveTab} />
              </>
            )}

            {activeTab === "data-pipeline" && (
              <>
                <div className="mb-6">
                  <h2 className="text-2xl font-semibold text-foreground" data-testid="text-section-title">Data Pipeline</h2>
                  <p className="text-sm text-muted-foreground mt-1">Collector health, live connections, and bulk CSV import.</p>
                </div>
                <DataPipeline pw={pw} />
              </>
            )}

            {activeTab === "data-quality" && (
              <>
                <div className="mb-6">
                  <h2 className="text-2xl font-semibold text-foreground" data-testid="text-section-title">Data Quality</h2>
                  <p className="text-sm text-muted-foreground mt-1">Dataset completeness, field coverage, enrichment controls, EDEN readiness, and duplicate detection.</p>
                </div>
                <DataQualityTab pw={pw} />
              </>
            )}

            {activeTab === "pipeline-review" && (
              <>
                <div className="mb-6">
                  <h2 className="text-2xl font-semibold text-foreground" data-testid="text-section-title">Pipeline Review</h2>
                  <p className="text-sm text-muted-foreground mt-1">Review ambiguous assets, manage the review queue, and wipe/re-collect data</p>
                </div>
                <PipelineReviewQueue pw={pw} />
              </>
            )}

            {activeTab === "research-queue" && (
              <>
                <div className="mb-6">
                  <h2 className="text-2xl font-semibold text-foreground" data-testid="text-section-title">Discovery Cards Review</h2>
                  <p className="text-sm text-muted-foreground mt-1">Review one-page Discovery Cards submitted via EdenDiscovery. Approved cards become the "Lab Discoveries" source in Scout. (Full research projects are reviewed under "Research Projects Review" below.)</p>
                </div>
                <ResearchQueue pw={pw} />
              </>
            )}

            {activeTab === "concept-queue" && (
              <>
                <div className="mb-6">
                  <h2 className="text-2xl font-semibold text-foreground" data-testid="text-section-title">Concept Review</h2>
                  <p className="text-sm text-muted-foreground mt-1">View all submitted concepts from the EdenDiscovery portal with AI credibility scores.</p>
                </div>
                <ConceptQueue pw={pw} />
              </>
            )}

            {activeTab === "concept-escalations" && (
              <>
                <div className="mb-6">
                  <h2 className="text-2xl font-semibold text-foreground" data-testid="text-section-title">Graduation Queue</h2>
                  <p className="text-sm text-muted-foreground mt-1">Concepts requesting graduation from EdenDiscovery to an EdenLab research project. Approving creates a new research project. All inter-portal escalations are controlled here.</p>
                </div>
                <ConceptEscalationQueue pw={pw} />
              </>
            )}

            {activeTab === "edenlab-review" && (
              <>
                <div className="mb-6">
                  <h2 className="text-2xl font-semibold text-foreground" data-testid="text-section-title">Research Projects Review</h2>
                  <p className="text-sm text-muted-foreground mt-1">Approve full research projects from EdenLab for industry visibility. Published projects appear on the Industry EdenLab tab and as researcher-sourced assets in Scout/Institutions.</p>
                </div>
                <IndustryProjectsQueue pw={pw} />
              </>
            )}

            {activeTab === "account-center" && (
              <>
                <div className="mb-6">
                  <h2 className="text-2xl font-semibold text-foreground" data-testid="text-section-title">Account Center</h2>
                  <p className="text-sm text-muted-foreground mt-1">Manage user accounts, assign portal roles, and invite new users to the platform.</p>
                </div>
                <AccountCenter pw={pw} />
              </>
            )}

            {activeTab === "organizations" && (
              <OrganizationsTab pw={pw} />
            )}

            {activeTab === "subscription-data" && (
              <>
                <div className="mb-6">
                  <h2 className="text-2xl font-semibold text-foreground" data-testid="text-section-title">Subscription Data</h2>
                  <p className="text-sm text-muted-foreground mt-1">Revenue by tier, MRR, and subscriber metrics. Connect a billing provider to activate live figures.</p>
                </div>
                <SubscriptionData />
              </>
            )}

            {activeTab === "platform-info" && (
              <>
                <div className="mb-6">
                  <h2 className="text-2xl font-semibold text-foreground" data-testid="text-section-title">Platform Info</h2>
                  <p className="text-sm text-muted-foreground mt-1">Live platform metrics: asset coverage, user activity, AI usage, and content health.</p>
                </div>
                <PlatformInfo pw={pw} />
              </>
            )}

            {activeTab === "eden" && (
              <>
                <div className="mb-6">
                  <h2 className="text-2xl font-semibold text-foreground flex items-center gap-2" data-testid="text-section-title">
                    <EdenAvatar size={28} />
                    EDEN: AI Analyst
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">Eden Radar Novel Innovation Experience. Deep-enriches the 20K relevant TTO assets using GPT-4o for RAG-powered analysis.</p>
                </div>
                <EdenTab pw={pw} />
              </>
            )}

            {activeTab === "analytics" && (
              <>
                <div className="mb-6">
                  <h2 className="text-2xl font-semibold text-foreground flex items-center gap-2" data-testid="text-section-title">
                    <BarChart3 className="h-6 w-6 text-primary" />
                    Usage Analytics
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">Platform usage metrics: search volume, AI sessions, feature adoption, and top search queries. No user PII is shown.</p>
                </div>
                <AnalyticsTab pw={pw} />
              </>
            )}

            {activeTab === "impersonation" && (
              <>
                <div className="mb-6">
                  <h2 className="text-2xl font-semibold text-foreground" data-testid="text-section-title">Impersonation</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Act as another user to debug what they're seeing. Read-only by default. Other admin accounts cannot be impersonated. Every request is recorded in the audit log below.
                  </p>
                </div>
                <ImpersonationTab pw={pw} />
              </>
            )}

            {activeTab === "audit-log" && (
              <AuditLogTab pw={pw} />
            )}

            {activeTab === "edenmarket" && (
              <>
                <div className="mb-6">
                  <h2 className="text-2xl font-semibold text-foreground flex items-center gap-2" data-testid="text-section-title">
                    <Globe className="h-6 w-6 text-indigo-500" />
                    EdenMarket
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">Review and approve biopharma deal listings, monitor EOI submissions, and manage marketplace subscribers.</p>
                </div>
                <EdenMarketTab />
              </>
            )}

            {activeTab === "documents" && <DocumentsTab pw={pw} />}

            {activeTab === "jarvis" && <JarvisTab pw={pw} />}

            {activeTab === "tto-contacts" && <TtoContactsTab pw={pw} />}

            {activeTab === "api-management" && (
              <ApiManagementTab pw={pw} />
            )}
          </React.Suspense>
        </main>
      </div>
    </div>
  );
}
