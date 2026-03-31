import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Search, Lightbulb, FlaskConical, Building2, Bell,
  Layers, User, Moon, Sun, LogOut, Menu, X, Radar,
  LayoutDashboard, Settings, Newspaper,
} from "lucide-react";
import { motion } from "framer-motion";
import { useTheme } from "@/hooks/use-theme";
import { useAuth } from "@/hooks/use-auth";
import { useState, useEffect } from "react";
import { getIndustryProfile } from "@/hooks/use-industry";
import {
  AceternitySidebar,
  AceternitySidebarBody,
  useSidebar,
} from "@/components/ui/aceternity-sidebar";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "edenLastSeenAlerts";

type AlertsBadgeData = {
  newAssets: { total: number };
  newConcepts: { total: number };
  newProjects: { total: number };
};

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
  alertsBadge?: boolean;
};

type NavGroup = {
  groupLabel: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    groupLabel: "Overview",
    items: [
      { href: "/industry/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true },
      { href: "/industry/new-arrivals", label: "New Arrivals", icon: Newspaper, exact: true },
    ],
  },
  {
    groupLabel: "Intelligence",
    items: [
      { href: "/scout", label: "Scout", icon: Search, exact: true },
      { href: "/alerts", label: "Alerts", icon: Bell, exact: true, alertsBadge: true },
      { href: "/institutions", label: "Institutions", icon: Building2 },
    ],
  },
  {
    groupLabel: "Workspace",
    items: [
      { href: "/assets", label: "Pipelines", icon: Layers },
      { href: "/industry/concepts", label: "Discovery", icon: Lightbulb },
      { href: "/industry/projects", label: "Lab", icon: FlaskConical },
    ],
  },
];

function getInitials(name: string): string {
  if (!name.trim()) return "";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function AnimatedLabel({ children }: { children: React.ReactNode }) {
  const { open, animate } = useSidebar();
  return (
    <motion.span
      animate={{
        opacity: animate ? (open ? 1 : 0) : 1,
        width: animate ? (open ? "auto" : 0) : "auto",
      }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      className="whitespace-pre overflow-hidden block"
    >
      {children}
    </motion.span>
  );
}

function SidebarNavContent({ onClose }: { onClose?: () => void }) {
  const { open, animate } = useSidebar();
  const { theme, toggleTheme } = useTheme();
  const { signOut } = useAuth();
  const [location, setLocation] = useLocation();
  const profile = getIndustryProfile();

  const [sinceParam, setSinceParam] = useState(() =>
    typeof window !== "undefined" ? (localStorage.getItem(STORAGE_KEY) ?? "") : ""
  );

  useEffect(() => {
    const handler = () => setSinceParam(localStorage.getItem(STORAGE_KEY) ?? "");
    window.addEventListener("eden-alerts-seen", handler);
    return () => window.removeEventListener("eden-alerts-seen", handler);
  }, []);

  const deltaSidebarUrl = sinceParam
    ? `/api/industry/alerts/delta?since=${encodeURIComponent(sinceParam)}`
    : "/api/industry/alerts/delta";

  const { data: alertsData } = useQuery<AlertsBadgeData>({
    queryKey: [deltaSidebarUrl],
    staleTime: 5 * 60 * 1000,
  });

  const totalAlerts =
    (alertsData?.newAssets.total ?? 0) +
    (alertsData?.newConcepts.total ?? 0) +
    (alertsData?.newProjects.total ?? 0);

  function navigate(href: string) {
    setLocation(href);
    onClose?.();
  }

  async function handleSignOut() {
    await signOut();
    window.location.href = "/login";
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Logo header */}
      <div className="h-14 flex items-center px-3.5 border-b border-border shrink-0">
        <button
          className="flex items-center gap-2.5 cursor-pointer select-none flex-1 min-w-0"
          onClick={() => navigate("/industry/dashboard")}
          data-testid="industry-sidebar-logo"
        >
          <div className="relative w-7 h-7 rounded-md bg-emerald-600 flex items-center justify-center shrink-0">
            <Radar className="w-4 h-4 text-white" />
          </div>
          <AnimatedLabel>
            <span className="font-bold text-foreground text-base tracking-tight">
              Eden<span className="text-emerald-500">Radar</span>
            </span>
          </AnimatedLabel>
        </button>
        {onClose && (
          <Button variant="ghost" size="icon" className="w-7 h-7 shrink-0 ml-1" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Nav groups */}
      <nav className="flex-1 px-2 pt-3 pb-2 overflow-y-auto overflow-x-hidden space-y-4">
        {NAV_GROUPS.map(({ groupLabel, items }) => (
          <div key={groupLabel}>
            <motion.p
              animate={{
                opacity: animate ? (open ? 1 : 0) : 1,
                height: animate ? (open ? "auto" : 0) : "auto",
              }}
              transition={{ duration: 0.12, ease: "easeOut" }}
              className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest px-3 mb-1 overflow-hidden whitespace-pre"
            >
              {groupLabel}
            </motion.p>

            <div className="space-y-0.5">
              {items.map(({ href, label, icon: Icon, exact, alertsBadge }) => {
                const isActive = exact
                  ? location === href
                  : location === href || location.startsWith(href + "/");
                const showDot = alertsBadge && totalAlerts > 0 && !isActive;

                return (
                  <button
                    key={href}
                    onClick={() => navigate(href)}
                    className={cn(
                      "flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm font-medium cursor-pointer transition-colors duration-150 w-full text-left",
                      isActive
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
                    )}
                    data-testid={`industry-sidebar-link-${label.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    {/* Icon with optional alert dot */}
                    <div className="relative shrink-0">
                      <Icon className={cn("w-4 h-4", showDot && "text-emerald-500")} />
                      {showDot && (
                        <span
                          className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 border-2 border-background"
                          data-testid="alerts-dot"
                        />
                      )}
                    </div>

                    {/* Animated label + count */}
                    <motion.span
                      animate={{
                        opacity: animate ? (open ? 1 : 0) : 1,
                        width: animate ? (open ? "auto" : 0) : "auto",
                      }}
                      transition={{ duration: 0.15, ease: "easeOut" }}
                      className="whitespace-pre overflow-hidden flex items-center justify-between flex-1"
                      style={{ display: "flex" }}
                    >
                      <span>{label}</span>
                      {showDot && (
                        <span
                          className="text-[10px] font-semibold text-emerald-500 tabular-nums"
                          data-testid="alerts-count"
                        >
                          {totalAlerts}
                        </span>
                      )}
                    </motion.span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* Account */}
        <div>
          <motion.p
            animate={{
              opacity: animate ? (open ? 1 : 0) : 1,
              height: animate ? (open ? "auto" : 0) : "auto",
            }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest px-3 mb-1 overflow-hidden whitespace-pre"
          >
            Account
          </motion.p>
          <button
            onClick={() => navigate("/industry/profile")}
            className={cn(
              "flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm font-medium cursor-pointer transition-colors duration-150 w-full text-left",
              location === "/industry/profile"
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
            )}
            data-testid="industry-sidebar-link-profile"
          >
            <User className="w-4 h-4 shrink-0" />
            <AnimatedLabel>Profile</AnimatedLabel>
          </button>
          <button
            onClick={() => navigate("/settings")}
            className={cn(
              "flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm font-medium cursor-pointer transition-colors duration-150 w-full text-left",
              location === "/settings" || location === "/industry/settings"
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
            )}
            data-testid="industry-sidebar-link-settings"
          >
            <Settings className="w-4 h-4 shrink-0" />
            <AnimatedLabel>Settings</AnimatedLabel>
          </button>
        </div>
      </nav>

      {/* Bottom: company avatar + controls */}
      <div className="px-2 pb-4 pt-2 border-t border-border space-y-0.5 shrink-0 overflow-x-hidden">
        {profile.companyName && (
          <button
            onClick={() => navigate("/industry/profile")}
            className="flex items-center gap-2.5 px-3 py-2 mb-1 rounded-md hover:bg-accent/60 cursor-pointer transition-colors w-full text-left"
            data-testid="industry-sidebar-avatar-link"
          >
            <div className="w-7 h-7 rounded-full bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center overflow-hidden shrink-0">
              <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                {getInitials(profile.companyName)}
              </span>
            </div>
            <AnimatedLabel>
              <span className="text-xs font-medium text-foreground truncate">
                {profile.companyName}
              </span>
            </AnimatedLabel>
          </button>
        )}

        <button
          onClick={toggleTheme}
          className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors w-full text-left"
          data-testid="industry-sidebar-toggle-theme"
        >
          {theme === "dark" ? <Sun className="w-4 h-4 shrink-0" /> : <Moon className="w-4 h-4 shrink-0" />}
          <AnimatedLabel>{theme === "dark" ? "Light mode" : "Dark mode"}</AnimatedLabel>
        </button>

        <button
          onClick={handleSignOut}
          className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-red-500 dark:hover:text-red-400 hover:bg-accent/60 transition-colors w-full text-left"
          data-testid="industry-sidebar-sign-out"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <AnimatedLabel>Sign Out</AnimatedLabel>
        </button>
      </div>
    </div>
  );
}

export function IndustrySidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        className="fixed top-3.5 left-4 z-50 md:hidden p-1.5 rounded-md bg-background border border-border text-muted-foreground hover:text-foreground"
        onClick={() => setMobileOpen(true)}
        data-testid="industry-sidebar-mobile-open"
        aria-label="Open menu"
      >
        <Menu className="w-4 h-4" />
      </button>

      {/* Mobile overlay backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile drawer — fixed width, no animation needed */}
      {mobileOpen && (
        <div className="fixed top-0 left-0 z-50 w-64 h-full bg-background border-r border-border shadow-xl md:hidden">
          <AceternitySidebar animate={false}>
            <SidebarNavContent onClose={() => setMobileOpen(false)} />
          </AceternitySidebar>
        </div>
      )}

      {/* Desktop collapsible sidebar */}
      <AceternitySidebar animate={true}>
        <AceternitySidebarBody>
          <SidebarNavContent />
        </AceternitySidebarBody>
      </AceternitySidebar>
    </>
  );
}
