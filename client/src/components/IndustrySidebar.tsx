import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Search, Lightbulb, FlaskConical, Building2, Bell,
  Layers, User, Moon, Sun, LogOut, Menu, X, Radar,
  LayoutDashboard, Settings, Newspaper, ShoppingBag,
} from "lucide-react";
import { motion } from "framer-motion";
import { useTheme } from "@/hooks/use-theme";
import { useAuth } from "@/hooks/use-auth";
import { useState } from "react";
import { getIndustryProfile } from "@/hooks/use-industry";
import { useOrg, planTierLabel } from "@/hooks/use-org";
import {
  AceternitySidebar,
  AceternitySidebarBody,
  useSidebar,
} from "@/components/ui/aceternity-sidebar";
import {
  AnimatedLabel,
  SidebarGroupHeader,
  SidebarNavButton,
  SidebarBottomButton,
  PORTAL_ACCENT,
  accentMix,
} from "@/components/sidebar-primitives";

const ACCENT = PORTAL_ACCENT.scout;

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
  {
    groupLabel: "EdenMarket",
    items: [
      { href: "/market", label: "Deal Marketplace", icon: ShoppingBag, exact: true },
    ],
  },
];

function getInitials(name: string): string {
  if (!name.trim()) return "";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function OrgIdentityBlock({ navigate }: { navigate: (href: string) => void }) {
  const { open, animate } = useSidebar();
  const { data: org } = useOrg();
  const profile = getIndustryProfile();

  if (org) {
    const displayName =
      org.planTier === "individual" && profile.companyName
        ? profile.companyName
        : org.name;
    const initials = getInitials(displayName) || displayName.trim().slice(0, 2).toUpperCase();
    const tierLabel = planTierLabel(org.planTier);

    return (
      <button
        onClick={() => navigate("/industry/settings")}
        className="flex items-center gap-2.5 px-3 py-2 rounded-md hover:bg-accent/60 cursor-pointer transition-colors w-full text-left"
        style={{ background: accentMix(ACCENT, 6) }}
        data-testid="industry-sidebar-org-block"
      >
        <div
          className="w-8 h-8 rounded-md flex items-center justify-center overflow-hidden shrink-0 border"
          style={{ borderColor: accentMix(ACCENT, 40) }}
        >
          {org.logoUrl ? (
            <img src={org.logoUrl} alt={displayName} className="w-full h-full object-cover rounded-md" />
          ) : (
            <span className="text-[11px] font-bold" style={{ color: ACCENT }}>
              {initials}
            </span>
          )}
        </div>
        <motion.div
          animate={{
            opacity: animate ? (open ? 1 : 0) : 1,
            width: animate ? (open ? "auto" : 0) : "auto",
          }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className="whitespace-pre overflow-hidden flex flex-col min-w-0"
        >
          <span className="text-xs font-semibold truncate leading-tight" style={{ color: ACCENT }}>
            {displayName}
          </span>
          <span className="text-[10px] text-muted-foreground leading-tight">{tierLabel}</span>
        </motion.div>
      </button>
    );
  }

  if (profile.companyName) {
    return (
      <button
        onClick={() => navigate("/industry/profile")}
        className="flex items-center gap-2.5 px-3 py-1.5 rounded-md hover:bg-accent/60 cursor-pointer transition-colors w-full text-left"
        data-testid="industry-sidebar-avatar-link"
      >
        <div className="w-6 h-6 rounded-full bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center overflow-hidden shrink-0">
          <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400">
            {getInitials(profile.companyName)}
          </span>
        </div>
        <AnimatedLabel>
          <span className="text-xs font-medium text-foreground truncate">
            {profile.companyName}
          </span>
        </AnimatedLabel>
      </button>
    );
  }

  return null;
}

function SidebarNavContent({ onClose }: { onClose?: () => void }) {
  const { theme, toggleTheme } = useTheme();
  const { signOut } = useAuth();
  const [location, setLocation] = useLocation();

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ["/api/alerts/unread-count"],
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  // Task #752 — show a "Get access" upsell pill on the EdenMarket nav
  // entry whenever the current user/org has no Market access yet.
  const { data: marketAccess } = useQuery<{ access: boolean }>({
    queryKey: ["/api/market/access"],
    staleTime: 5 * 60 * 1000,
  });
  const showMarketUpsell = marketAccess && !marketAccess.access;

  const totalAlerts = unreadData?.count ?? 0;

  function navigate(href: string) {
    setLocation(href);
    onClose?.();
  }

  async function handleSignOut() {
    await signOut();
    window.location.href = "/login";
  }

  function isItemActive(item: NavItem): boolean {
    return item.exact
      ? location === item.href
      : location === item.href || location.startsWith(item.href + "/");
  }

  const profileActive = location === "/industry/profile";
  const settingsActive = location === "/settings" || location === "/industry/settings";

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Logo header */}
      <div className="h-12 flex items-center px-3.5 border-b border-border shrink-0">
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

      {/* Nav groups — primary workflow → workspace → cross-portal */}
      <nav className="flex-1 px-2 pt-2 pb-1 overflow-hidden space-y-3">
        {NAV_GROUPS.map(({ groupLabel, items }) => (
          <div key={groupLabel}>
            <SidebarGroupHeader>{groupLabel}</SidebarGroupHeader>
            <div className="space-y-0.5">
              {items.map((item) => {
                const isMarket = item.href === "/market";
                return (
                  <div key={item.href} className={isMarket ? "relative" : undefined}>
                    <SidebarNavButton
                      label={item.label}
                      icon={item.icon}
                      isActive={isItemActive(item)}
                      onClick={() => navigate(item.href)}
                      accent={isMarket ? "hsl(234 80% 58%)" : ACCENT}
                      testId={`industry-sidebar-link-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                      badgeCount={item.alertsBadge ? totalAlerts : undefined}
                      showDot={item.alertsBadge && totalAlerts > 0}
                    />
                    {isMarket && showMarketUpsell && (
                      <div className="px-2 pb-0.5">
                        <span
                          className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full inline-block"
                          style={{ background: "hsl(234 80% 58% / 0.18)", color: "hsl(234 80% 58%)" }}
                          data-testid="badge-market-upsell"
                        >
                          Get access
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom: org identity + account + controls */}
      <div className="px-2 pb-3 pt-2 border-t border-border space-y-0.5 shrink-0 overflow-x-hidden">
        <OrgIdentityBlock navigate={navigate} />

        <SidebarBottomButton
          label="Profile"
          icon={User}
          onClick={() => navigate("/industry/profile")}
          isActive={profileActive}
          accent={ACCENT}
          testId="industry-sidebar-link-profile"
        />
        <SidebarBottomButton
          label="Settings"
          icon={Settings}
          onClick={() => navigate("/settings")}
          isActive={settingsActive}
          accent={ACCENT}
          testId="industry-sidebar-link-settings"
        />
        <SidebarBottomButton
          label={theme === "dark" ? "Light mode" : "Dark mode"}
          icon={theme === "dark" ? Sun : Moon}
          onClick={toggleTheme}
          testId="industry-sidebar-toggle-theme"
        />
        <SidebarBottomButton
          label="Sign Out"
          icon={LogOut}
          onClick={handleSignOut}
          danger
          testId="industry-sidebar-sign-out"
        />
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

      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {mobileOpen && (
        <div className="fixed top-0 left-0 z-50 w-64 h-full bg-background border-r border-border shadow-xl md:hidden">
          <AceternitySidebar animate={false}>
            <SidebarNavContent onClose={() => setMobileOpen(false)} />
          </AceternitySidebar>
        </div>
      )}

      <AceternitySidebar animate={true}>
        <AceternitySidebarBody>
          <SidebarNavContent />
        </AceternitySidebarBody>
      </AceternitySidebar>
    </>
  );
}
