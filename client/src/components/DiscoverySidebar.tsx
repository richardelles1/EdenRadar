import { useLocation } from "wouter";
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
  ShoppingBag,
} from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { useAuth } from "@/hooks/use-auth";
import { useState } from "react";
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
} from "@/components/sidebar-primitives";

const ACCENT = PORTAL_ACCENT.discovery;

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
};

const NAV_GROUPS: { groupLabel: string; items: NavItem[] }[] = [
  {
    groupLabel: "Concepts",
    items: [
      { href: "/discovery", label: "Concept Feed", icon: Compass, exact: true },
      { href: "/discovery/submit", label: "Submit Concept", icon: PlusCircle },
      { href: "/discovery/my-concepts", label: "My Concepts", icon: FolderOpen },
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

function UpgradeToLabCard({ navigate, role }: { navigate: (href: string) => void; role: string | null | undefined }) {
  const { open, animate } = useSidebar();
  // Hide only when the desktop sidebar is animated and currently collapsed.
  // Mobile drawer (animate=false) and expanded desktop both render the card.
  if (animate && !open) return null;
  return (
    <div
      className="rounded-xl bg-gradient-to-br from-violet-500/10 via-violet-500/5 to-amber-500/5 border border-violet-500/20 p-3.5 mx-2 mb-2"
      data-testid="sidebar-upgrade-edenlab"
    >
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
      <Button
        size="sm"
        className="w-full bg-violet-600 hover:bg-violet-700 text-white text-xs gap-1.5 h-8"
        data-testid="button-upgrade-edenlab"
        onClick={() => navigate(role === "researcher" ? "/research" : "/login")}
      >
        {role === "researcher" ? "Go to EdenLab" : "Explore EdenLab"}
        <ArrowRight className="w-3 h-3" />
      </Button>
      <p className="text-[10px] text-muted-foreground text-center mt-1.5">
        {role === "researcher"
          ? "Access your researcher workspace"
          : "Log in with a researcher account or contact us to upgrade"}
      </p>
    </div>
  );
}

function SidebarNavContent({ onClose }: { onClose?: () => void }) {
  const { theme, toggleTheme } = useTheme();
  const { signOut, role } = useAuth();
  const [location, setLocation] = useLocation();

  function navigate(href: string) {
    setLocation(href);
    onClose?.();
  }

  async function handleSignOut() {
    await signOut();
    window.location.href = "/login";
  }

  const profileActive = location === "/discovery/profile";

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Logo header */}
      <div className="h-12 flex items-center px-3.5 border-b border-border shrink-0">
        <button
          className="flex items-center gap-2.5 cursor-pointer select-none flex-1 min-w-0"
          onClick={() => navigate("/discovery")}
          data-testid="discovery-sidebar-logo"
        >
          <div className="relative w-7 h-7 rounded-md bg-amber-500 flex items-center justify-center shrink-0">
            <Lightbulb className="w-4 h-4 text-white" />
          </div>
          <AnimatedLabel>
            <span className="font-bold text-foreground text-base tracking-tight">
              Eden<span className="text-amber-500">Discovery</span>
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
      <nav className="flex-1 px-2 pt-2 pb-1 overflow-y-auto space-y-3">
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
                  testId={`discovery-sidebar-link-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                />
              ))}
            </div>
          </div>
        ))}

        <UpgradeToLabCard navigate={navigate} role={role} />
      </nav>

      {/* Bottom: profile + controls */}
      <div className="px-2 pb-3 pt-2 border-t border-border space-y-0.5 shrink-0 overflow-x-hidden">
        <SidebarBottomButton
          label="Profile"
          icon={UserCircle}
          onClick={() => navigate("/discovery/profile")}
          isActive={profileActive}
          accent={ACCENT}
          testId="discovery-sidebar-link-profile"
        />
        <SidebarBottomButton
          label={theme === "dark" ? "Light mode" : "Dark mode"}
          icon={theme === "dark" ? Sun : Moon}
          onClick={toggleTheme}
          testId="discovery-sidebar-toggle-theme"
        />
        <SidebarBottomButton
          label="Sign Out"
          icon={LogOut}
          onClick={handleSignOut}
          danger
          testId="discovery-sidebar-sign-out"
        />
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
