import { useEffect } from "react";
import { useLocation } from "wouter";
import { DiscoverySidebar } from "@/components/DiscoverySidebar";
import { useAuth } from "@/hooks/use-auth";

type DiscoveryLayoutProps = {
  children: React.ReactNode;
};

export function DiscoveryLayout({ children }: DiscoveryLayoutProps) {
  const [, navigate] = useLocation();
  const { session, role, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!session) {
      navigate("/login", { replace: true });
    } else if (role === "industry") {
      navigate("/scout", { replace: true });
    } else if (role === "researcher") {
      navigate("/research", { replace: true });
    } else if (role !== "concept") {
      navigate("/login", { replace: true });
    }
  }, [session, role, loading, navigate]);

  if (loading || !session || role !== "concept") return null;

  return (
    <div className="flex min-h-screen bg-background">
      <DiscoverySidebar />
      <main className="flex-1 min-w-0 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
