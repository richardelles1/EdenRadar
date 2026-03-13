import { useEffect } from "react";
import { useLocation } from "wouter";
import { ResearchSidebar } from "@/components/ResearchSidebar";
import { useAuth } from "@/hooks/use-auth";

type ResearchLayoutProps = {
  children: React.ReactNode;
};

export function ResearchLayout({ children }: ResearchLayoutProps) {
  const [, navigate] = useLocation();
  const { session, role, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!session) {
      navigate("/login", { replace: true });
    } else if (role === "industry") {
      navigate("/scout", { replace: true });
    } else if (role && role !== "researcher") {
      navigate("/login", { replace: true });
    }
  }, [session, role, loading, navigate]);

  if (loading || !session || role !== "researcher") return null;

  return (
    <div className="flex min-h-screen bg-background">
      <ResearchSidebar />
      <main className="flex-1 min-w-0 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
