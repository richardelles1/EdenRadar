import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Lightbulb,
  PlusCircle,
  Compass,
  FolderOpen,
  Moon,
  Sun,
  LogOut,
  Menu,
  X,
  UserCircle,
  ArrowRight,
  FlaskConical,
  Users,
  Database,
  FileCheck,
} from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { useAuth } from "@/hooks/use-auth";
import { useState } from "react";

const NAV_ITEMS = [
  { href: "/discovery", label: "Concept Feed", icon: Compass, exact: true },
  { href: "/discovery/my-concepts", label: "My Concepts", icon: FolderOpen },
  { href: "/discovery/submit", label: "Submit Concept", icon: PlusCircle },
  { href: "/discovery/profile", label: "Profile", icon: UserCircle },
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
        <Link href="/discovery">
          <div
            className="flex items-center gap-2.5 cursor-pointer select-none"
            data-testid="discovery-sidebar-logo"
            onClick={onClose}
          >
            <div className="relative w-7 h-7 rounded-md bg-amber-500 flex items-center justify-center">
              <Lightbulb className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-foreground text-base tracking-tight">
              Eden<span className="text-amber-500">Discovery</span>
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
          Concept Portal
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
                    ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
                }`}
                data-testid={`discovery-sidebar-link-${label.toLowerCase().replace(/\s+/g, "-")}`}
                onClick={onClose}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{label}</span>
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="px-3 pb-3 pt-2 border-t border-border shrink-0">
        <div className="rounded-xl bg-gradient-to-br from-violet-500/10 via-violet-500/5 to-amber-500/5 border border-violet-500/20 p-3.5 mb-3" data-testid="sidebar-upgrade-edenlab">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-md bg-violet-500/20 flex items-center justify-center">
              <FlaskConical className="w-3.5 h-3.5 text-violet-500" />
            </div>
            <p className="text-xs font-semibold text-foreground">Ready to go deeper?</p>
          </div>
          <ul className="space-y-1.5 mb-3">
            <li className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <FlaskConical className="w-3 h-3 shrink-0 mt-0.5 text-violet-400" />
              <span>Structured project workflow</span>
            </li>
            <li className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <Users className="w-3 h-3 shrink-0 mt-0.5 text-violet-400" />
              <span>Researcher collaboration tools</span>
            </li>
            <li className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <Database className="w-3 h-3 shrink-0 mt-0.5 text-violet-400" />
              <span>Data source access</span>
            </li>
            <li className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <FileCheck className="w-3 h-3 shrink-0 mt-0.5 text-violet-400" />
              <span>Grant &amp; IP tracking</span>
            </li>
          </ul>
          <Link href="/login">
            <Button
              size="sm"
              className="w-full bg-violet-600 hover:bg-violet-700 text-white text-xs gap-1.5 h-8"
              data-testid="button-upgrade-edenlab"
              onClick={onClose}
            >
              Explore EdenLab
              <ArrowRight className="w-3 h-3" />
            </Button>
          </Link>
          <p className="text-[10px] text-muted-foreground text-center mt-1.5">
            Log in with a researcher account to upgrade
          </p>
        </div>

        <div className="space-y-0.5">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-3 px-3 h-9 text-sm font-medium text-muted-foreground hover:text-foreground"
            onClick={toggleTheme}
            data-testid="discovery-sidebar-toggle-theme"
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
            data-testid="discovery-sidebar-sign-out"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            Sign Out
          </Button>
        </div>
      </div>
    </div>
  );
}

export function DiscoverySidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <button
        className="fixed top-3.5 left-4 z-50 md:hidden p-1.5 rounded-md bg-background border border-border text-muted-foreground hover:text-foreground"
        onClick={() => setMobileOpen(true)}
        data-testid="discovery-sidebar-mobile-open"
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
