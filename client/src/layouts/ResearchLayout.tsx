import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ResearchSidebar } from "@/components/ResearchSidebar";
import { ResearcherOnboarding } from "@/components/ResearcherOnboarding";
import { AppSwitcher } from "@/components/AppSwitcher";
import { useAuth } from "@/hooks/use-auth";
import { PortalBackground } from "@/components/PortalBackground";
import { getResearcherProfile, useResearcherInit } from "@/hooks/use-researcher";
import { useDocumentMeta } from "@/hooks/use-document-meta";

type ResearchLayoutProps = {
  children: React.ReactNode;
};

export function ResearchLayout({ children }: ResearchLayoutProps) {
  useDocumentMeta({ title: "EdenLab — Research Workspace | EdenRadar", noindex: true });
  const [, navigate] = useLocation();
  const { session, role, loading } = useAuth();
  useResearcherInit();
  const [onboardingOpen, setOnboardingOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      navigate("/login", { replace: true });
    } else if (role === "industry") {
      navigate("/scout", { replace: true });
    } else if (role === "concept") {
      navigate("/discovery", { replace: true });
    } else if (role !== "researcher") {
      navigate("/login", { replace: true });
    } else {
      const profile = getResearcherProfile();
      if (!profile.onboardingDone) {
        setOnboardingOpen(true);
      }
    }
  }, [session, role, loading, navigate]);

  if (loading || !session || role !== "researcher") return null;

  return (
    <div className="flex min-h-screen bg-background relative">
      <PortalBackground variant="lab" />
      <ResearchSidebar />
      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        <div className="h-12 flex items-center justify-end px-4 border-b border-border bg-background/60 backdrop-blur-sm shrink-0">
          <AppSwitcher active="lab" />
        </div>
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
      <ResearcherOnboarding
        open={onboardingOpen}
        onClose={() => setOnboardingOpen(false)}
      />
    </div>
  );
}
