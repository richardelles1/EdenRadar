import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { useTheme } from "@/hooks/use-theme";
import { useAuth } from "@/hooks/use-auth";
import { useState } from "react";
import {
  AceternitySidebar,
  AceternitySidebarBody,
  useSidebar,
} from "@/components/ui/aceternity-sidebar";
import {
  ShoppingBag, Briefcase, FileText, LayoutDashboard,
  Moon, Sun, LogOut, Menu, X, Settings, Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
};

const NAV_GROUPS = [
  {
    groupLabel: "Market",
    items: [
      { href: "/market", label: "Browse Listings", icon: ShoppingBag, exact: true },
      { href: "/market/my-eois", label: "My EOIs", icon: FileText, exact: true },
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

const ACCENT = "hsl(271 81% 55%)";
const ACCENT_MIX = "color-mix(in srgb, hsl(271 81% 55%) 12%, transparent)";

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

function NavButton({ href, label, icon: Icon, exact, location, navigate }: NavItem & { location: string; navigate: (h: string) => void }) {
  const { open, animate } = useSidebar();
  const isActive = exact ? location === href : location.startsWith(href);

  return (
    <button
      onClick={() => navigate(href)}
      className={cn(
        "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium cursor-pointer transition-colors duration-150 w-full text-left",
        isActive ? "" : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
      )}
      style={isActive ? { backgroundColor: ACCENT_MIX, color: ACCENT } : {}}
      data-testid={`market-sidebar-link-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <Icon className="w-4 h-4 shrink-0" />
      <motion.span
        animate={{ opacity: animate ? (open ? 1 : 0) : 1, width: animate ? (open ? "auto" : 0) : "auto" }}
        transition={{ duration: 0.15, ease: "easeOut" }}
        className="whitespace-pre overflow-hidden"
      >
        {label}
      </motion.span>
    </button>
  );
}

const ADMIN_KEY = "eden-admin-pw";

function SidebarNavContent({ onClose }: { onClose?: () => void }) {
  const { open, animate } = useSidebar();
  const { theme, toggleTheme } = useTheme();
  const { signOut } = useAuth();
  const [location, setLocation] = useLocation();
  const isAdmin = typeof window !== "undefined" && !!localStorage.getItem(ADMIN_KEY);

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

      {/* Nav groups */}
      <nav className="flex-1 px-2 pt-2 pb-1 overflow-hidden space-y-3">
        {NAV_GROUPS.map(({ groupLabel, items }) => (
          <div key={groupLabel}>
            <motion.p
              animate={{ opacity: animate ? (open ? 1 : 0) : 1, height: animate ? (open ? "auto" : 0) : "auto" }}
              transition={{ duration: 0.12, ease: "easeOut" }}
              className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest px-3 mb-0.5 overflow-hidden whitespace-pre"
            >
              {groupLabel}
            </motion.p>
            <div className="space-y-0.5">
              {items.map(item => (
                <NavButton key={item.href} {...item} location={location} navigate={navigate} />
              ))}
            </div>
          </div>
        ))}
        {isAdmin && (
          <div>
            <motion.p
              animate={{ opacity: animate ? (open ? 1 : 0) : 1, height: animate ? (open ? "auto" : 0) : "auto" }}
              transition={{ duration: 0.12, ease: "easeOut" }}
              className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest px-3 mb-0.5 overflow-hidden whitespace-pre"
            >
              Admin
            </motion.p>
            <div className="space-y-0.5">
              <NavButton
                href="/admin"
                label="Admin Panel"
                icon={Shield}
                location={location}
                navigate={navigate}
              />
            </div>
          </div>
        )}
      </nav>

      {/* Bottom controls */}
      <div className="px-2 pb-3 pt-2 border-t border-border space-y-0.5 shrink-0">
        <button
          onClick={() => navigate("/industry/settings")}
          className={cn(
            "flex items-center gap-2.5 px-3 py-1.5 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors w-full text-left"
          )}
          data-testid="market-sidebar-link-settings"
        >
          <Settings className="w-4 h-4 shrink-0" />
          <AnimatedLabel>Settings</AnimatedLabel>
        </button>

        <button
          onClick={toggleTheme}
          className="flex items-center gap-2.5 px-3 py-1.5 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors w-full text-left"
        >
          {theme === "dark" ? <Sun className="w-4 h-4 shrink-0" /> : <Moon className="w-4 h-4 shrink-0" />}
          <AnimatedLabel>{theme === "dark" ? "Light mode" : "Dark mode"}</AnimatedLabel>
        </button>

        <button
          onClick={handleSignOut}
          className="flex items-center gap-2.5 px-3 py-1.5 rounded-md text-sm font-medium text-muted-foreground hover:text-red-500 dark:hover:text-red-400 hover:bg-accent/60 transition-colors w-full text-left"
          data-testid="market-sidebar-sign-out"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <AnimatedLabel>Sign Out</AnimatedLabel>
        </button>
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
