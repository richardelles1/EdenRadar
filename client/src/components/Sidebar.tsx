import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Search,
  Layers,
  FileText,
  Bell,
  Building2,
  Database,
  Sprout,
  Moon,
  Sun,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import type { SavedAsset } from "@shared/schema";
import { useState } from "react";

type SavedAssetsResponse = { assets: SavedAsset[] };

const NAV_ITEMS = [
  { href: "/scout", label: "Scout", icon: Search },
  { href: "/assets", label: "Pipelines", icon: Layers },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/alerts", label: "Alerts", icon: Bell },
  { href: "/institutions", label: "Institutions", icon: Building2 },
  { href: "/sources", label: "Sources", icon: Database },
];

function SidebarContent({ onClose }: { onClose?: () => void }) {
  const { theme, toggleTheme } = useTheme();
  const { signOut } = useAuth();
  const [location] = useLocation();

  const { data: savedData } = useQuery<SavedAssetsResponse>({
    queryKey: ["/api/saved-assets"],
  });

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ["/api/alerts/unread-count"],
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  const savedCount = savedData?.assets?.length ?? 0;
  const alertCount = unreadData?.count ?? 0;

  async function handleSignOut() {
    await signOut();
    window.location.href = "/login";
  }

  return (
    <div className="flex flex-col h-full">
      <div className="h-14 flex items-center px-4 border-b border-border shrink-0">
        <Link href="/">
          <div
            className="flex items-center gap-2.5 cursor-pointer select-none"
            data-testid="sidebar-logo"
            onClick={onClose}
          >
            <div className="relative w-7 h-7 rounded-md bg-primary flex items-center justify-center">
              <Sprout className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-bold text-foreground text-base tracking-tight">
              Eden<span className="text-primary">Radar</span>
            </span>
          </div>
        </Link>
        {onClose && (
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto w-7 h-7"
            onClick={onClose}
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = location === href || location.startsWith(href + "/");
          return (
            <Link key={href} href={href}>
              <div
                className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium cursor-pointer transition-all duration-150 relative ${
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
                }`}
                data-testid={`sidebar-link-${label.toLowerCase()}`}
                onClick={onClose}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{label}</span>
                {label === "Pipelines" && savedCount > 0 && (
                  <span className="ml-auto text-[11px] font-semibold bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 min-w-[20px] text-center leading-none">
                    {savedCount}
                  </span>
                )}
                {label === "Alerts" && alertCount > 0 && (
                  <span className="ml-auto text-[11px] font-semibold bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 min-w-[20px] text-center leading-none" data-testid="sidebar-alert-badge">
                    {alertCount.toLocaleString()}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="px-3 pb-4 pt-2 border-t border-border space-y-0.5 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-3 px-3 h-9 text-sm font-medium text-muted-foreground hover:text-foreground"
          onClick={toggleTheme}
          data-testid="sidebar-toggle-theme"
        >
          {theme === "dark" ? (
            <Sun className="w-4 h-4 shrink-0" />
          ) : (
            <Moon className="w-4 h-4 shrink-0" />
          )}
          {theme === "dark" ? "Light mode" : "Dark mode"}
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-3 px-3 h-9 text-sm font-medium text-muted-foreground hover:text-foreground hover:text-red-500 dark:hover:text-red-400"
          onClick={handleSignOut}
          data-testid="sidebar-sign-out"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          Sign Out
        </Button>
      </div>
    </div>
  );
}

export function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <button
        className="fixed top-3.5 left-4 z-50 md:hidden p-1.5 rounded-md bg-background border border-border text-muted-foreground hover:text-foreground"
        onClick={() => setMobileOpen(true)}
        data-testid="sidebar-mobile-open"
        aria-label="Open menu"
      >
        <Menu className="w-4 h-4" />
      </button>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      {mobileOpen && (
        <div className="fixed top-0 left-0 z-50 w-64 h-full bg-background border-r border-border shadow-xl md:hidden">
          <SidebarContent onClose={() => setMobileOpen(false)} />
        </div>
      )}

      <aside className="hidden md:flex flex-col w-[220px] shrink-0 border-r border-border bg-background h-screen sticky top-0">
        <SidebarContent />
      </aside>
    </>
  );
}
