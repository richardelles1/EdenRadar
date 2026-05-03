import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MarketLayout } from "@/layouts/MarketLayout";
import { MarketGate } from "@/components/MarketGate";
import MarketBrowse from "@/pages/MarketBrowse";
import MarketListingDetail from "@/pages/MarketListingDetail";
import MarketCreateListing from "@/pages/MarketCreateListing";
import MarketEditListing from "@/pages/MarketEditListing";
import MarketSellerDashboard from "@/pages/MarketSellerDashboard";
import MarketMyEOIs from "@/pages/MarketMyEOIs";
import MarketDeals from "@/pages/MarketDeals";
import MarketDealRoom from "@/pages/MarketDealRoom";
import MarketPreview from "@/pages/MarketPreview";
import MarketList from "@/pages/MarketList";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/Landing";
import Scout from "@/pages/Scout";
import Assets from "@/pages/Assets";
import AssetDossier from "@/pages/AssetDossier";
import Report from "@/pages/Report";
import Reports from "@/pages/Reports";
import Alerts from "@/pages/Alerts";
import Institutions from "@/pages/Institutions";
import InstitutionDetail from "@/pages/InstitutionDetail";
import Sources from "@/pages/Sources";
import Admin from "@/pages/Admin";
import AdminMobile from "@/pages/AdminMobile";
import AdminResetPassword from "@/pages/AdminResetPassword";
import ResearchDashboard from "@/pages/ResearchDashboard";
import CreateDiscovery from "@/pages/CreateDiscovery";
import MyDiscoveries from "@/pages/MyDiscoveries";
import ResearchProfile from "@/pages/ResearchProfile";
import ResearchDataSources from "@/pages/ResearchDataSources";
import ResearchLibrary from "@/pages/ResearchLibrary";
import ResearchProjects from "@/pages/ResearchProjects";
import ResearchAlerts from "@/pages/ResearchAlerts";
import ResearchGrants from "@/pages/ResearchGrants";
import ProjectDetail from "@/pages/ProjectDetail";
import DiscoveryFeed from "@/pages/DiscoveryFeed";
import SubmitConcept from "@/pages/SubmitConcept";
import ConceptDetail from "@/pages/ConceptDetail";
import DiscoveryJoin from "@/pages/DiscoveryJoin";
import MyConcepts from "@/pages/MyConcepts";
import DiscoveryProfile from "@/pages/DiscoveryProfile";
import DossierPrint from "@/pages/DossierPrint";
import ShareView from "@/pages/ShareView";
import ReportPrint from "@/pages/ReportPrint";
import PipelineBriefPrint from "@/pages/PipelineBriefPrint";
import PitchDeck from "@/pages/PitchDeck";
import OnePager from "@/pages/OnePager";
import About from "@/pages/About";
import WhatWeDo from "@/pages/WhatWeDo";
import HowItWorks from "@/pages/HowItWorks";
import Tos from "@/pages/Tos";
import Privacy from "@/pages/Privacy";
import Pricing from "@/pages/Pricing";
import BillingSuccess from "@/pages/BillingSuccess";
import IndustryConcepts from "@/pages/IndustryConcepts";
import IndustryProjects from "@/pages/IndustryProjects";
import IndustryProfile from "@/pages/IndustryProfile";
import IndustrySettings, { SimplifiedSettings } from "@/pages/IndustrySettings";
import IndustryEden from "@/pages/IndustryEden";
import Dashboard from "@/pages/Dashboard";
import IndustryDashboard from "@/pages/IndustryDashboard";
import NewArrivals from "@/pages/NewArrivals";
import { DashboardLayout } from "@/layouts/DashboardLayout";
import { ResearchLayout } from "@/layouts/ResearchLayout";
import { DiscoveryLayout } from "@/layouts/DiscoveryLayout";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { SiteGate } from "@/components/SiteGate";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";
import { ScoutGate } from "@/components/ScoutGate";
import Login from "@/pages/Login";
import Unsubscribe from "@/pages/Unsubscribe";
import { EdenWidget } from "@/components/EdenWidget";
import { useEffect } from "react";
import { useLocation } from "wouter";

function ThemeInit() {
  useEffect(() => {
    const stored = localStorage.getItem("eden-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = stored ?? (prefersDark ? "dark" : "light");
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    }
  }, []);
  return null;
}

function SettingsRoute() {
  const { session, role, loading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!loading && !session) navigate("/login", { replace: true });
  }, [loading, session, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!session) return null;

  if (role === "industry") {
    return (
      <DashboardLayout>
        <IndustrySettings />
      </DashboardLayout>
    );
  }

  return <SimplifiedSettings />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/login" component={Login} />

      <Route path="/register">
        {() => <Redirect to={`/login${window.location.search}`} />}
      </Route>
      <Route path="/discover">
        <Redirect to="/scout" />
      </Route>
      <Route path="/pipeline">
        <Redirect to="/assets" />
      </Route>
      <Route path="/browse">
        {() => {
          const params = new URLSearchParams(window.location.search);
          const area = params.get("therapyArea");
          return <Redirect to={area ? `/scout?q=${encodeURIComponent(area)}` : "/scout"} />;
        }}
      </Route>

      <Route path="/industry/dashboard">
        <DashboardLayout>
          <ScoutGate>
            <IndustryDashboard />
          </ScoutGate>
        </DashboardLayout>
      </Route>
      <Route path="/industry/new-arrivals">
        <DashboardLayout>
          <ScoutGate>
            <NewArrivals />
          </ScoutGate>
        </DashboardLayout>
      </Route>
      <Route path="/dashboard">
        <Redirect to="/industry/dashboard" />
      </Route>
      <Route path="/scout">
        <DashboardLayout>
          <ScoutGate>
            <Scout />
          </ScoutGate>
        </DashboardLayout>
      </Route>
      <Route path="/assets">
        <DashboardLayout>
          <ScoutGate>
            <Assets />
          </ScoutGate>
        </DashboardLayout>
      </Route>
      <Route path="/reports">
        <DashboardLayout>
          <ScoutGate>
            <Reports />
          </ScoutGate>
        </DashboardLayout>
      </Route>
      <Route path="/alerts">
        <DashboardLayout>
          <ScoutGate>
            <Alerts />
          </ScoutGate>
        </DashboardLayout>
      </Route>
      <Route path="/institutions/:slug">
        <DashboardLayout>
          <ScoutGate>
            <InstitutionDetail />
          </ScoutGate>
        </DashboardLayout>
      </Route>
      <Route path="/institutions">
        <DashboardLayout>
          <ScoutGate>
            <Institutions />
          </ScoutGate>
        </DashboardLayout>
      </Route>
      <Route path="/sources">
        <DashboardLayout>
          <ScoutGate>
            <Sources />
          </ScoutGate>
        </DashboardLayout>
      </Route>
      <Route path="/asset/:id">
        <DashboardLayout>
          <ScoutGate>
            <AssetDossier />
          </ScoutGate>
        </DashboardLayout>
      </Route>
      <Route path="/report">
        <DashboardLayout>
          <ScoutGate>
            <Report />
          </ScoutGate>
        </DashboardLayout>
      </Route>

      <Route path="/industry/concepts">
        <DashboardLayout>
          <ScoutGate>
            <IndustryConcepts />
          </ScoutGate>
        </DashboardLayout>
      </Route>
      <Route path="/industry/projects">
        <DashboardLayout>
          <ScoutGate>
            <IndustryProjects />
          </ScoutGate>
        </DashboardLayout>
      </Route>
      <Route path="/industry/profile">
        <DashboardLayout>
          <ScoutGate>
            <IndustryProfile />
          </ScoutGate>
        </DashboardLayout>
      </Route>
      {/* Settings is intentionally exempt from ScoutGate — users need it to connect
          their org context (the mechanism by which they gain paid-plan access). */}
      <Route path="/industry/settings" component={SettingsRoute} />
      <Route path="/settings" component={SettingsRoute} />
      <Route path="/industry/eden">
        <DashboardLayout>
          <ScoutGate>
            <IndustryEden />
          </ScoutGate>
        </DashboardLayout>
      </Route>

      <Route path="/unsubscribe" component={Unsubscribe} />

      <Route path="/admin" component={Admin} />
      <Route path="/admin/mobile" component={AdminMobile} />
      <Route path="/admin/reset-password" component={AdminResetPassword} />

      <Route path="/research">
        <ResearchLayout>
          <ResearchDashboard />
        </ResearchLayout>
      </Route>
      <Route path="/research/create-discovery">
        <ResearchLayout>
          <CreateDiscovery />
        </ResearchLayout>
      </Route>
      <Route path="/research/my-discoveries">
        <ResearchLayout>
          <MyDiscoveries />
        </ResearchLayout>
      </Route>
      <Route path="/research/profile">
        <ResearchLayout>
          <ResearchProfile />
        </ResearchLayout>
      </Route>
      <Route path="/research/data-sources">
        <ResearchLayout>
          <ResearchDataSources />
        </ResearchLayout>
      </Route>
      <Route path="/research/library">
        <ResearchLayout>
          <ResearchLibrary />
        </ResearchLayout>
      </Route>
      <Route path="/research/projects/:id">
        <ResearchLayout>
          <ProjectDetail />
        </ResearchLayout>
      </Route>
      <Route path="/research/projects">
        <ResearchLayout>
          <ResearchProjects />
        </ResearchLayout>
      </Route>
      <Route path="/research/alerts">
        <ResearchLayout>
          <ResearchAlerts />
        </ResearchLayout>
      </Route>
      <Route path="/research/grants">
        <ResearchLayout>
          <ResearchGrants />
        </ResearchLayout>
      </Route>

      {/* EdenMarket public marketing pages (no auth, no MarketGate) */}
      <Route path="/market/preview" component={MarketPreview} />
      <Route path="/market/list" component={MarketList} />

      {/* EdenMarket */}
      <Route path="/market/listing/:id">
        <MarketLayout>
          <MarketGate>
            <MarketListingDetail />
          </MarketGate>
        </MarketLayout>
      </Route>
      <Route path="/market/create-listing">
        <MarketLayout>
          <MarketGate>
            <MarketCreateListing />
          </MarketGate>
        </MarketLayout>
      </Route>
      <Route path="/market/edit-listing/:id">
        <MarketLayout>
          <MarketGate>
            <MarketEditListing />
          </MarketGate>
        </MarketLayout>
      </Route>
      <Route path="/market/seller">
        <MarketLayout>
          <MarketGate>
            <MarketSellerDashboard />
          </MarketGate>
        </MarketLayout>
      </Route>
      <Route path="/market/my-eois">
        <MarketLayout>
          <MarketGate>
            <MarketMyEOIs />
          </MarketGate>
        </MarketLayout>
      </Route>
      <Route path="/market/deals/:id">
        <MarketLayout>
          <MarketGate>
            <MarketDealRoom />
          </MarketGate>
        </MarketLayout>
      </Route>
      <Route path="/market/deals">
        <MarketLayout>
          <MarketGate>
            <MarketDeals />
          </MarketGate>
        </MarketLayout>
      </Route>
      <Route path="/market">
        <MarketLayout>
          <MarketGate>
            <MarketBrowse />
          </MarketGate>
        </MarketLayout>
      </Route>

      <Route path="/share/:token" component={ShareView} />
      <Route path="/asset/:id/print" component={DossierPrint} />
      <Route path="/report/print" component={ReportPrint} />
      <Route path="/pipeline/brief/print" component={PipelineBriefPrint} />

      <Route path="/pitch" component={PitchDeck} />
      <Route path="/one-pager" component={OnePager} />
      <Route path="/about" component={About} />
      <Route path="/what-we-do" component={WhatWeDo} />
      <Route path="/how-it-works" component={HowItWorks} />
      <Route path="/tos" component={Tos} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/pricing" component={Pricing} />
      <Route path="/billing/success" component={BillingSuccess} />

      <Route path="/discovery">
        <DiscoveryLayout requireAuth={false}>
          <DiscoveryFeed />
        </DiscoveryLayout>
      </Route>
      <Route path="/discovery/concept/:id">
        <DiscoveryLayout requireAuth={false}>
          <ConceptDetail />
        </DiscoveryLayout>
      </Route>
      <Route path="/discovery/join" component={DiscoveryJoin} />
      <Route path="/discovery/submit">
        <DiscoveryLayout>
          <SubmitConcept />
        </DiscoveryLayout>
      </Route>
      <Route path="/discovery/my-concepts">
        <DiscoveryLayout>
          <MyConcepts />
        </DiscoveryLayout>
      </Route>
      <Route path="/discovery/profile">
        <DiscoveryLayout>
          <DiscoveryProfile />
        </DiscoveryLayout>
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <ThemeInit />
          <Toaster />
          <SiteGate>
            <ImpersonationBanner />
            <Router />
            <EdenWidget />
          </SiteGate>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
