import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { IndustrySidebar } from "@/components/IndustrySidebar";
import { IndustryOnboarding } from "@/components/IndustryOnboarding";
import { useAuth } from "@/hooks/use-auth";
import { PortalBackground } from "@/components/PortalBackground";
import { getIndustryProfile } from "@/hooks/use-industry";

type DashboardLayoutProps = {
  children: React.ReactNode;
};

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [, navigate] = useLocation();
  const { session, role, loading } = useAuth();
  const [onboardingOpen, setOnboardingOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      navigate("/login", { replace: true });
    } else if (role === "researcher") {
      navigate("/research", { replace: true });
    } else if (role === "concept") {
      navigate("/discovery", { replace: true });
    } else if (role !== "industry") {
      navigate("/login", { replace: true });
    } else {
      const profile = getIndustryProfile();
      if (!profile.onboardingDone) {
        setOnboardingOpen(true);
      }
    }
  }, [session, role, loading, navigate]);

  const [location] = useLocation();
  const isEden = location === "/industry/eden";

  if (loading || !session || role !== "industry") return null;

  return (
    <div className="flex min-h-screen bg-background relative">
      {!isEden && <PortalBackground variant="radar" />}
      <IndustrySidebar />
      <main className="flex-1 min-w-0 overflow-y-auto relative z-10">
        {children}
      </main>
      <IndustryOnboarding
        open={onboardingOpen}
        onClose={() => setOnboardingOpen(false)}
      />
    </div>
  );
}
