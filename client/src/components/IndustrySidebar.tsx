import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Search,
  Lightbulb,
  FlaskConical,
  Building2,
  Bell,
  Layers,
  Sparkles,
  User,
  Moon,
  Sun,
  LogOut,
  Menu,
  X,
  Radar,
  LayoutDashboard,
} from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { useAuth } from "@/hooks/use-auth";
import { useState } from "react";
import { getIndustryProfile } from "@/hooks/use-industry";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/industry/eden", label: "Eden", icon: Sparkles },
  { href: "/scout", label: "Scout", icon: Search, exact: true },
  { href: "/institutions", label: "Institutions", icon: Building2 },
  { href: "/alerts", label: "Alerts", icon: Bell, accent: true },
  { href: "/assets", label: "Pipelines", icon: Layers },
  { href: "/industry/projects", label: "EdenLab", icon: FlaskConical },
  { href: "/industry/concepts", label: "EdenDiscovery", icon: Lightbulb },
  { href: "/industry/profile", label: "Profile", icon: User },
];

function getInitials(name: string): string {
  if (!name.trim()) return "";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function SidebarContent({ onClose }: { onClose?: () => void }) {
  const { theme, toggleTheme } = useTheme();
  const { signOut } = useAuth();
  const [location] = useLocation();
  const profile = getIndustryProfile();

  async function handleSignOut() {
    await signOut();
    window.location.href = "/login";
  }

  return (
    <div className="flex flex-col h-full">
      <div className="h-14 flex items-center px-4 border-b border-border shrink-0">
        <Link href="/dashboard">
          <div
            className="flex items-center gap-2.5 cursor-pointer select-none"
            data-testid="industry-sidebar-logo"
            onClick={onClose}
          >
            <div className="relative w-7 h-7 rounded-md bg-emerald-600 flex items-center justify-center">
              <Radar className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-foreground text-base tracking-tight">
              Eden<span className="text-emerald-500">Radar</span>
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
          Industry Portal
        </p>
      </div>

      <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ href, label, icon: Icon, exact, accent }) => {
          const isActive = exact
            ? location === href
            : location === href || location.startsWith(href + "/");
          return (
            <Link key={href} href={href}>
              <div
                className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium cursor-pointer transition-all duration-150 ${
                  isActive
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
                }`}
                data-testid={`industry-sidebar-link-${label.toLowerCase().replace(/\s+/g, "-")}`}
                onClick={onClose}
              >
                <Icon className={`w-4 h-4 shrink-0 ${accent && !isActive ? "text-emerald-500" : ""}`} />
                <span>{label}</span>
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="px-3 pb-4 pt-2 border-t border-border space-y-0.5 shrink-0">
        {profile.companyName && (
          <Link href="/industry/profile">
            <div
              className="flex items-center gap-2.5 px-3 py-2 mb-1 rounded-md hover:bg-accent/60 cursor-pointer transition-colors"
              data-testid="industry-sidebar-avatar-link"
              onClick={onClose}
            >
              <div className="w-7 h-7 rounded-full bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center overflow-hidden shrink-0">
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                  {getInitials(profile.companyName)}
                </span>
              </div>
              <span className="text-xs font-medium text-foreground truncate">{profile.companyName}</span>
            </div>
          </Link>
        )}

        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-3 px-3 h-9 text-sm font-medium text-muted-foreground hover:text-foreground"
          onClick={toggleTheme}
          data-testid="industry-sidebar-toggle-theme"
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
          data-testid="industry-sidebar-sign-out"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          Sign Out
        </Button>
      </div>
    </div>
  );
}

export function IndustrySidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <button
        className="fixed top-3.5 left-4 z-50 md:hidden p-1.5 rounded-md bg-background border border-border text-muted-foreground hover:text-foreground"
        onClick={() => setMobileOpen(true)}
        data-testid="industry-sidebar-mobile-open"
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
