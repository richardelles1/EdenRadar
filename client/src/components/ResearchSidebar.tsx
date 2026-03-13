import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  FolderOpen,
  Bell,
  BookOpen,
  Database,
  Library,
  User,
  Moon,
  Sun,
  LogOut,
  Menu,
  X,
  Microscope,
} from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { useAuth } from "@/hooks/use-auth";
import { useState } from "react";

const NAV_ITEMS = [
  { href: "/research", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/research/projects", label: "My Projects", icon: FolderOpen },
  { href: "/research/alerts", label: "My Alerts", icon: Bell },
  { href: "/research/my-discoveries", label: "My Discoveries", icon: BookOpen },
  { href: "/research/data-sources", label: "Data Sources", icon: Database },
  { href: "/research/library", label: "Library", icon: Library },
  { href: "/research/profile", label: "Profile", icon: User },
];

function SidebarContent({ onClose }: { onClose?: () => void }) {
  const { theme, toggleTheme } = useTheme();
  const { signOut } = useAuth();
  const [location] = useLocation();

  async function handleSignOut() {
    await signOut();
    window.location.href = "/login";
  }

  return (
    <div className="flex flex-col h-full">
      <div className="h-14 flex items-center px-4 border-b border-border shrink-0">
        <Link href="/research">
          <div
            className="flex items-center gap-2.5 cursor-pointer select-none"
            data-testid="research-sidebar-logo"
            onClick={onClose}
          >
            <div className="relative w-7 h-7 rounded-md bg-violet-600 flex items-center justify-center">
              <Microscope className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-foreground text-base tracking-tight">
              Eden<span className="text-violet-500">Lab</span>
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

      <div className="px-3 pt-3 pb-1 shrink-0">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest px-3">
          Researcher Portal
        </p>
      </div>

      <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ href, label, icon: Icon, exact }) => {
          const isActive = exact
            ? location === href
            : location === href || location.startsWith(href + "/");
          return (
            <Link key={href} href={href}>
              <div
                className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium cursor-pointer transition-all duration-150 ${
                  isActive
                    ? "bg-violet-500/10 text-violet-600 dark:text-violet-400"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
                }`}
                data-testid={`research-sidebar-link-${label.toLowerCase().replace(/\s+/g, "-")}`}
                onClick={onClose}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{label}</span>
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
          data-testid="research-sidebar-toggle-theme"
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
          data-testid="research-sidebar-sign-out"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          Sign Out
        </Button>
      </div>
    </div>
  );
}

export function ResearchSidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <button
        className="fixed top-3.5 left-4 z-50 md:hidden p-1.5 rounded-md bg-background border border-border text-muted-foreground hover:text-foreground"
        onClick={() => setMobileOpen(true)}
        data-testid="research-sidebar-mobile-open"
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
