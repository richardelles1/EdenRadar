import { useEffect } from "react";
import { useLocation } from "wouter";
import { Sidebar } from "@/components/Sidebar";

type DashboardLayoutProps = {
  children: React.ReactNode;
};

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [, navigate] = useLocation();

  useEffect(() => {
    const entered = localStorage.getItem("eden-portal");
    if (!entered) {
      navigate("/");
    }
  }, [navigate]);

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
