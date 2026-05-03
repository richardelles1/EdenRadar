import { useEffect } from "react";
import { useLocation } from "wouter";
import { DiscoverySidebar } from "@/components/DiscoverySidebar";
import { AppSwitcher } from "@/components/AppSwitcher";
import { useAuth } from "@/hooks/use-auth";
import { PortalBackground } from "@/components/PortalBackground";
import { useDocumentMeta } from "@/hooks/use-document-meta";

type DiscoveryLayoutProps = {
  children: React.ReactNode;
  requireAuth?: boolean;
};

export function DiscoveryLayout({ children, requireAuth = true }: DiscoveryLayoutProps) {
  useDocumentMeta({
    title: requireAuth ? "EdenDiscovery — Concepts | EdenRadar" : "EdenDiscovery — Biotech Concept Community | EdenRadar",
    description: requireAuth
      ? undefined
      : "Browse early-stage biotech concepts scored by EDEN. Submit your own hypotheses and connect with industry and research collaborators.",
    noindex: requireAuth,
  });
  const [, navigate] = useLocation();
  const { session, role, loading } = useAuth();

  useEffect(() => {
    if (!requireAuth || loading) return;
    if (!session) {
      navigate("/login", { replace: true });
    } else if (role === "industry") {
      navigate("/scout", { replace: true });
    } else if (role === "researcher") {
      navigate("/research", { replace: true });
    } else if (role !== "concept") {
      navigate("/login", { replace: true });
    }
  }, [session, role, loading, navigate, requireAuth]);

  if (loading) return null;

  const showSidebar = session && role === "concept";

  if (requireAuth && (!session || role !== "concept")) return null;

  if (!showSidebar) {
    return (
      <div className="relative min-h-screen bg-background">
        <PortalBackground variant="discovery" />
        <div className="relative z-10">{children}</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background relative">
      <PortalBackground variant="discovery" />
      <DiscoverySidebar />
      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        <div className="h-12 flex items-center justify-end px-4 border-b border-border bg-background/60 backdrop-blur-sm shrink-0">
          <AppSwitcher active="discovery" />
        </div>
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
