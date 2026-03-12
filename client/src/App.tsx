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
import { DashboardLayout } from "@/layouts/DashboardLayout";
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

      <Route path="/discover">
        <Redirect to="/scout" />
      </Route>
      <Route path="/pipeline">
        <Redirect to="/assets" />
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

      <Route path="/admin" component={Admin} />

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeInit />
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
