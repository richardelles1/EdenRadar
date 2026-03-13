import { useEffect } from "react";
import { useLocation } from "wouter";
import { ResearchSidebar } from "@/components/ResearchSidebar";

type ResearchLayoutProps = {
  children: React.ReactNode;
};

export function ResearchLayout({ children }: ResearchLayoutProps) {
  const [, navigate] = useLocation();

  useEffect(() => {
    const entered = localStorage.getItem("eden-research-portal");
    if (!entered) {
      navigate("/");
    }
  }, [navigate]);

  return (
    <div className="flex min-h-screen bg-background">
      <ResearchSidebar />
      <main className="flex-1 min-w-0 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
