import { useEffect } from "react";
import { useLocation } from "wouter";
import { MarketSidebar } from "@/components/MarketSidebar";
import { useAuth } from "@/hooks/use-auth";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useDocumentMeta } from "@/hooks/use-document-meta";

type MarketLayoutProps = {
  children: React.ReactNode;
};

export function MarketLayout({ children }: MarketLayoutProps) {
  useDocumentMeta({ title: "EdenMarket | EdenRadar", noindex: true });
  const [, navigate] = useLocation();
  const { session, loading } = useAuth();

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
    <div className="flex min-h-screen bg-background relative">
      <MarketSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1 overflow-y-auto relative z-10">
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
