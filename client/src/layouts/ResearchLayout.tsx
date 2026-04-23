import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ResearchSidebar } from "@/components/ResearchSidebar";
import { ResearcherOnboarding } from "@/components/ResearcherOnboarding";
import { useAuth } from "@/hooks/use-auth";
import { PortalBackground } from "@/components/PortalBackground";
import { getResearcherProfile, useResearcherInit } from "@/hooks/use-researcher";

type ResearchLayoutProps = {
  children: React.ReactNode;
};

export function ResearchLayout({ children }: ResearchLayoutProps) {
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
      <main className="flex-1 min-w-0 overflow-y-auto relative z-10">
        {children}
      </main>
      <ResearcherOnboarding
        open={onboardingOpen}
        onClose={() => setOnboardingOpen(false)}
      />
    </div>
  );
}
