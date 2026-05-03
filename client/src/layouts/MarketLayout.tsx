import { useEffect } from "react";
import { useLocation } from "wouter";
import { MarketSidebar } from "@/components/MarketSidebar";
import { AppSwitcher } from "@/components/AppSwitcher";
import { useAuth } from "@/hooks/use-auth";
import { useOrg } from "@/hooks/use-org";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useDocumentMeta } from "@/hooks/use-document-meta";

type MarketLayoutProps = {
  children: React.ReactNode;
};

export function MarketLayout({ children }: MarketLayoutProps) {
  useDocumentMeta({ title: "EdenMarket | EdenRadar", noindex: true });
  const [, navigate] = useLocation();
  const { session, loading } = useAuth();
  const { data: org } = useOrg();
  const orgColor = org?.primaryColor ?? null;

  useEffect(() => {
    if (!loading && !session) {
      navigate("/login", { replace: true });
    }
  }, [session, loading, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) return null;

  return (
    <div
      className="flex min-h-screen bg-background relative"
      style={orgColor ? ({ "--org-accent": orgColor } as React.CSSProperties) : {}}
    >
      <MarketSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <div className="h-12 flex items-center justify-end px-4 border-b border-border bg-background/60 backdrop-blur-sm shrink-0">
          <AppSwitcher active="market" />
        </div>
        <main className="flex-1 overflow-y-auto relative z-10">
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
