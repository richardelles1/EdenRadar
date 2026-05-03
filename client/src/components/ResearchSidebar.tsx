import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  FolderOpen,
  Bell,
  FlaskConical,
  Search,
  Library,
  User,
  Moon,
  Sun,
  LogOut,
  Menu,
  X,
  Microscope,
  BadgeDollarSign,
  ShoppingBag,
} from "lucide-react";
import { motion } from "framer-motion";
import { useTheme } from "@/hooks/use-theme";
import { useAuth } from "@/hooks/use-auth";
import { useState } from "react";
import { getResearcherProfile } from "@/hooks/use-researcher";
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

const ACCENT = PORTAL_ACCENT.lab;

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
};

const NAV_GROUPS: { groupLabel: string; items: NavItem[] }[] = [
  {
    groupLabel: "Workflow",
    items: [
      { href: "/research", label: "Dashboard", icon: LayoutDashboard, exact: true },
      { href: "/research/data-sources", label: "Database Search", icon: Search },
      { href: "/research/projects", label: "Projects", icon: FolderOpen },
    ],
  },
  {
    groupLabel: "Workspace",
    items: [
      { href: "/research/my-discoveries", label: "Discoveries", icon: FlaskConical },
      { href: "/research/grants", label: "Grants", icon: BadgeDollarSign },
      { href: "/research/library", label: "Saved Literature", icon: Library },
      { href: "/research/alerts", label: "Alerts", icon: Bell },
    ],
  },
  {
    groupLabel: "EdenMarket",
    items: [
      { href: "/market/list", label: "List your assets", icon: ShoppingBag },
    ],
  },
];

function isItemActive(loc: string, item: NavItem): boolean {
  return item.exact ? loc === item.href : loc === item.href || loc.startsWith(item.href + "/");
}

function getInitials(name: string): string {
  if (!name.trim()) return "";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function ResearcherIdentityBlock({ navigate }: { navigate: (href: string) => void }) {
  const { open, animate } = useSidebar();
  const profile = getResearcherProfile();
  if (!profile.name && !profile.photoUrl) return null;
  const initials = getInitials(profile.name || "");

  return (
    <button
      onClick={() => navigate("/research/profile")}
      className="flex items-center gap-2.5 px-3 py-2 rounded-md hover:bg-accent/60 cursor-pointer transition-colors w-full text-left"
      style={{ background: accentMix(ACCENT, 6) }}
      data-testid="sidebar-avatar-link"
    >
      <div
        className="w-8 h-8 rounded-md flex items-center justify-center overflow-hidden shrink-0 border"
        style={{ borderColor: accentMix(ACCENT, 40) }}
      >
        {profile.photoUrl ? (
          <img src={profile.photoUrl} alt="" className="w-full h-full object-cover rounded-md" />
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
          {profile.name || "Researcher"}
        </span>
        <span className="text-[10px] text-muted-foreground leading-tight">EdenLab</span>
      </motion.div>
    </button>
  );
}

function SidebarNavContent({ onClose }: { onClose?: () => void }) {
  const { theme, toggleTheme } = useTheme();
  const { signOut } = useAuth();
  const [location, setLocation] = useLocation();

  function navigate(href: string) {
    setLocation(href);
    onClose?.();
  }

  async function handleSignOut() {
    await signOut();
    window.location.href = "/login";
  }

  const profileActive = location === "/research/profile";

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Logo header */}
      <div className="h-12 flex items-center px-3.5 border-b border-border shrink-0">
        <button
          className="flex items-center gap-2.5 cursor-pointer select-none flex-1 min-w-0"
          onClick={() => navigate("/research")}
          data-testid="research-sidebar-logo"
        >
          <div className="relative w-7 h-7 rounded-md bg-violet-600 flex items-center justify-center shrink-0">
            <Microscope className="w-4 h-4 text-white" />
          </div>
          <AnimatedLabel>
            <span className="font-bold text-foreground text-base tracking-tight">
              Eden<span className="text-violet-500">Lab</span>
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
      <nav className="flex-1 px-2 pt-2 pb-1 overflow-hidden space-y-3">
        {NAV_GROUPS.map(({ groupLabel, items }) => (
          <div key={groupLabel}>
            <SidebarGroupHeader>{groupLabel}</SidebarGroupHeader>
            <div className="space-y-0.5">
              {items.map((item) => (
                <SidebarNavButton
                  key={item.href}
                  label={item.label}
                  icon={item.icon}
                  isActive={isItemActive(location, item)}
                  onClick={() => navigate(item.href)}
                  accent={ACCENT}
                  testId={`research-sidebar-link-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom: identity + account + controls */}
      <div className="px-2 pb-3 pt-2 border-t border-border space-y-0.5 shrink-0 overflow-x-hidden">
        <ResearcherIdentityBlock navigate={navigate} />

        <SidebarBottomButton
          label="Profile"
          icon={User}
          onClick={() => navigate("/research/profile")}
          isActive={profileActive}
          accent={ACCENT}
          testId="research-sidebar-link-profile"
        />
        <SidebarBottomButton
          label={theme === "dark" ? "Light mode" : "Dark mode"}
          icon={theme === "dark" ? Sun : Moon}
          onClick={toggleTheme}
          testId="research-sidebar-toggle-theme"
        />
        <SidebarBottomButton
          label="Sign Out"
          icon={LogOut}
          onClick={handleSignOut}
          danger
          testId="research-sidebar-sign-out"
        />
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
