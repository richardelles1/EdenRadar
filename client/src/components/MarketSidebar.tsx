import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { useTheme } from "@/hooks/use-theme";
import { useAuth } from "@/hooks/use-auth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AceternitySidebar,
  AceternitySidebarBody,
  useSidebar,
} from "@/components/ui/aceternity-sidebar";
import {
  ShoppingBag, Briefcase, FileText, LayoutDashboard,
  Moon, Sun, LogOut, Menu, X, Settings, Shield, Lock, Bell, Radar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AnimatedLabel,
  SidebarGroupHeader,
  SidebarNavButton,
  SidebarBottomButton,
  PORTAL_ACCENT,
} from "@/components/sidebar-primitives";

const ACCENT = PORTAL_ACCENT.market;
const SCOUT_ACCENT = PORTAL_ACCENT.scout;

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
};

const NAV_GROUPS: { groupLabel: string; items: NavItem[] }[] = [
  {
    groupLabel: "Market",
    items: [
      { href: "/market", label: "Browse Listings", icon: ShoppingBag, exact: true },
      { href: "/market/my-eois", label: "My EOIs", icon: FileText, exact: true },
      { href: "/market/deals", label: "My Deals", icon: Lock, exact: false },
    ],
  },
  {
    groupLabel: "Seller",
    items: [
      { href: "/market/seller", label: "Seller Dashboard", icon: LayoutDashboard, exact: true },
      { href: "/market/create-listing", label: "New Listing", icon: Briefcase, exact: true },
    ],
  },
];

function isActive(loc: string, item: NavItem): boolean {
  return item.exact ? loc === item.href : loc.startsWith(item.href);
}

function NotificationBell() {
  const { session } = useAuth();
  const { open, animate } = useSidebar();
  const qc = useQueryClient();
  const { data: notifs } = useQuery<Array<{ id: number; message: string; listingId: number; createdAt: string }>>({
    queryKey: ["/api/market/notifications"],
    enabled: !!session,
    staleTime: 60_000,
    refetchInterval: 120_000,
    queryFn: async () => {
      const res = await fetch("/api/market/notifications", {
        headers: { Authorization: `Bearer ${session!.access_token}`, "x-user-id": session!.user.id },
      });
      if (!res.ok) return [];
      return res.json();
    },
  });
  const markRead = useMutation({
    mutationFn: async () => {
      await fetch("/api/market/notifications/read", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${session!.access_token}`, "x-user-id": session!.user.id },
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/market/notifications"] }),
  });
  const unread = notifs?.length ?? 0;
  if (unread === 0) return null;
  return (
    <div
      className="mx-2 mb-1 rounded-lg border border-indigo-500/20 bg-indigo-500/5 px-3 py-2 cursor-pointer hover:bg-indigo-500/10 transition-colors"
      onClick={() => markRead.mutate()}
      data-testid="market-notifications-bell"
    >
      <div className="flex items-center gap-2">
        <div className="relative shrink-0">
          <Bell className="w-4 h-4 text-indigo-500" />
          <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-indigo-500 flex items-center justify-center text-[7px] font-bold text-white">{unread > 9 ? "9+" : unread}</span>
        </div>
        <motion.span
          animate={{ opacity: animate ? (open ? 1 : 0) : 1, width: animate ? (open ? "auto" : 0) : "auto" }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className="whitespace-pre overflow-hidden text-xs text-indigo-600 dark:text-indigo-400 font-medium"
        >
          {unread} new alert{unread !== 1 ? "s" : ""}
        </motion.span>
      </div>
      {open && notifs && notifs.length > 0 && (
        <p className="text-[10px] text-muted-foreground mt-1 leading-snug line-clamp-2">{notifs[0].message}</p>
      )}
    </div>
  );
}

function SidebarNavContent({ onClose }: { onClose?: () => void }) {
  const { theme, toggleTheme } = useTheme();
  const { signOut } = useAuth();
  const [location, setLocation] = useLocation();
  const { isAdmin } = useIsAdmin();

  function navigate(href: string) {
    setLocation(href);
    onClose?.();
  }

  async function handleSignOut() {
    await signOut();
    window.location.href = "/login";
  }

  const settingsActive = location === "/industry/settings";

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Logo header */}
      <div className="h-12 flex items-center px-3.5 border-b border-border shrink-0">
        <button
          className="flex items-center gap-2.5 cursor-pointer select-none flex-1 min-w-0"
          onClick={() => navigate("/market")}
          data-testid="market-sidebar-logo"
        >
          <div className="relative w-7 h-7 rounded-md flex items-center justify-center shrink-0" style={{ background: ACCENT }}>
            <ShoppingBag className="w-4 h-4 text-white" />
          </div>
          <AnimatedLabel>
            <span className="font-bold text-foreground text-base tracking-tight">
              Eden<span style={{ color: ACCENT }}>Market</span>
            </span>
          </AnimatedLabel>
        </button>
        {onClose && (
          <Button variant="ghost" size="icon" className="w-7 h-7 shrink-0 ml-1" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* EdenScout → EdenMarket notification alerts */}
      <NotificationBell />

      {/* Nav groups */}
      <nav className="flex-1 px-2 pt-2 pb-1 overflow-hidden space-y-3">
        {NAV_GROUPS.map(({ groupLabel, items }) => (
          <div key={groupLabel}>
            <SidebarGroupHeader>{groupLabel}</SidebarGroupHeader>
            <div className="space-y-0.5">
              {items.map(item => (
                <SidebarNavButton
                  key={item.href}
                  label={item.label}
                  icon={item.icon}
                  isActive={isActive(location, item)}
                  onClick={() => navigate(item.href)}
                  accent={ACCENT}
                  testId={`market-sidebar-link-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                />
              ))}
            </div>
          </div>
        ))}

        {/* Cross-portal jump back to EdenScout — uses Scout accent */}
        <div>
          <SidebarGroupHeader>EdenScout</SidebarGroupHeader>
          <div className="space-y-0.5">
            <SidebarNavButton
              label="Scout"
              icon={Radar}
              isActive={false}
              onClick={() => navigate("/industry/dashboard")}
              accent={SCOUT_ACCENT}
              tintInactive
              testId="market-sidebar-link-scout"
            />
          </div>
        </div>

        {isAdmin && (
          <div>
            <SidebarGroupHeader>Admin</SidebarGroupHeader>
            <div className="space-y-0.5">
              <SidebarNavButton
                label="Admin Panel"
                icon={Shield}
                isActive={location.startsWith("/admin")}
                onClick={() => navigate("/admin")}
                accent={ACCENT}
                testId="market-sidebar-link-admin-panel"
              />
            </div>
          </div>
        )}
      </nav>

      {/* Bottom controls */}
      <div className="px-2 pb-3 pt-2 border-t border-border space-y-0.5 shrink-0">
        <SidebarBottomButton
          label="Settings"
          icon={Settings}
          onClick={() => navigate("/industry/settings")}
          isActive={settingsActive}
          accent={ACCENT}
          testId="market-sidebar-link-settings"
        />
        <SidebarBottomButton
          label={theme === "dark" ? "Light mode" : "Dark mode"}
          icon={theme === "dark" ? Sun : Moon}
          onClick={toggleTheme}
          testId="market-sidebar-toggle-theme"
        />
        <SidebarBottomButton
          label="Sign Out"
          icon={LogOut}
          onClick={handleSignOut}
          danger
          testId="market-sidebar-sign-out"
        />
      </div>
    </div>
  );
}

export function MarketSidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <button
        className="fixed top-3.5 left-4 z-50 md:hidden p-1.5 rounded-md bg-background border border-border text-muted-foreground hover:text-foreground"
        onClick={() => setMobileOpen(true)}
        aria-label="Open menu"
        data-testid="market-sidebar-mobile-open"
      >
        <Menu className="w-4 h-4" />
      </button>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setMobileOpen(false)} />
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
