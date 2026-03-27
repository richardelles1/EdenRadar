import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
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
import ReportPrint from "@/pages/ReportPrint";
import PipelineBriefPrint from "@/pages/PipelineBriefPrint";
import PitchDeck from "@/pages/PitchDeck";
import About from "@/pages/About";
import WhatWeDo from "@/pages/WhatWeDo";
import HowItWorks from "@/pages/HowItWorks";
import IndustryConcepts from "@/pages/IndustryConcepts";
import IndustryProjects from "@/pages/IndustryProjects";
import IndustryProfile from "@/pages/IndustryProfile";
import IndustryEden from "@/pages/IndustryEden";
import Dashboard from "@/pages/Dashboard";
import IndustryDashboard from "@/pages/IndustryDashboard";
import { DashboardLayout } from "@/layouts/DashboardLayout";
import { ResearchLayout } from "@/layouts/ResearchLayout";
import { DiscoveryLayout } from "@/layouts/DiscoveryLayout";
import { AuthProvider } from "@/hooks/use-auth";
import { SiteGate } from "@/components/SiteGate";
import Login from "@/pages/Login";
import { EdenWidget } from "@/components/EdenWidget";
import { useEffect } from "react";

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

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/login" component={Login} />

      <Route path="/discover">
        <Redirect to="/scout" />
      </Route>
      <Route path="/pipeline">
        <Redirect to="/assets" />
      </Route>

      <Route path="/industry/dashboard">
        <DashboardLayout>
          <IndustryDashboard />
        </DashboardLayout>
      </Route>
      <Route path="/dashboard">
        <Redirect to="/industry/dashboard" />
      </Route>
      <Route path="/scout">
        <DashboardLayout>
          <Scout />
        </DashboardLayout>
      </Route>
      <Route path="/assets">
        <DashboardLayout>
          <Assets />
        </DashboardLayout>
      </Route>
      <Route path="/reports">
        <DashboardLayout>
          <Reports />
        </DashboardLayout>
      </Route>
      <Route path="/alerts">
        <DashboardLayout>
          <Alerts />
        </DashboardLayout>
      </Route>
      <Route path="/institutions/:slug">
        <DashboardLayout>
          <InstitutionDetail />
        </DashboardLayout>
      </Route>
      <Route path="/institutions">
        <DashboardLayout>
          <Institutions />
        </DashboardLayout>
      </Route>
      <Route path="/sources">
        <DashboardLayout>
          <Sources />
        </DashboardLayout>
      </Route>
      <Route path="/asset/:id">
        <DashboardLayout>
          <AssetDossier />
        </DashboardLayout>
      </Route>
      <Route path="/report">
        <DashboardLayout>
          <Report />
        </DashboardLayout>
      </Route>

      <Route path="/industry/concepts">
        <DashboardLayout>
          <IndustryConcepts />
        </DashboardLayout>
      </Route>
      <Route path="/industry/projects">
        <DashboardLayout>
          <IndustryProjects />
        </DashboardLayout>
      </Route>
      <Route path="/industry/profile">
        <DashboardLayout>
          <IndustryProfile />
        </DashboardLayout>
      </Route>
      <Route path="/industry/eden">
        <DashboardLayout>
          <IndustryEden />
        </DashboardLayout>
      </Route>

      <Route path="/admin" component={Admin} />

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

      <Route path="/asset/:id/print" component={DossierPrint} />
      <Route path="/report/print" component={ReportPrint} />
      <Route path="/pipeline/brief/print" component={PipelineBriefPrint} />

      <Route path="/pitch" component={PitchDeck} />
      <Route path="/about" component={About} />
      <Route path="/what-we-do" component={WhatWeDo} />
      <Route path="/how-it-works" component={HowItWorks} />

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
            <Router />
            <EdenWidget />
          </SiteGate>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
