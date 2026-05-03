import { useEffect } from "react";
import { useLocation } from "wouter";
import { DiscoverySidebar } from "@/components/DiscoverySidebar";
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
      <main className="flex-1 min-w-0 overflow-y-auto relative z-10">
        {children}
      </main>
    </div>
  );
}
