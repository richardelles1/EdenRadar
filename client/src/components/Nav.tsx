import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Bookmark, Moon, Sun, Sprout, Radar, Menu, X, ChevronDown,
  FlaskConical, Lightbulb, ShoppingBag,
  Layers, BookOpen, Award, Sparkles, Target, Rocket,
  TrendingUp, FileBarChart2, Bell, Briefcase,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SavedAsset } from "@shared/schema";

type NavProps = {
  onOpenSaved?: () => void;
};

const PUBLIC_PATHS = ["/", "/about", "/what-we-do", "/how-it-works", "/pricing", "/market/preview", "/market/list"];

function normalizePath(path: string) {
  const stripped = path.split("?")[0].split("#")[0];
  return stripped.length > 1 ? stripped.replace(/\/+$/, "") : stripped;
}

type PreviewItem = { Icon: LucideIcon; label: string };

type PortalEntry = {
  name: string;
  blurb: string;
  href: string;
  Icon: LucideIcon;
  accent: string;
  preview: PreviewItem[];
};

const RESEARCHER_PORTALS: PortalEntry[] = [
  {
    name: "EdenLab",
    blurb: "Project workspace, literature, and grants.",
    href: "/research",
    Icon: FlaskConical,
    accent: "262 80% 60%",
    preview: [
      { Icon: Layers, label: "Projects" },
      { Icon: BookOpen, label: "Library" },
      { Icon: Award, label: "Grants" },
      { Icon: Bell, label: "Alerts" },
    ],
  },
  {
    name: "EdenDiscovery",
    blurb: "Score and surface early-stage concepts.",
    href: "/discovery",
    Icon: Lightbulb,
    accent: "38 92% 50%",
    preview: [
      { Icon: Sparkles, label: "Scoring" },
      { Icon: Target, label: "Signal" },
      { Icon: Rocket, label: "Graduate" },
    ],
  },
];

const INDUSTRY_PORTALS: PortalEntry[] = [
  {
    name: "EdenScout",
    blurb: "Licensable signals from 300+ TTOs, patents, and papers.",
    href: "/scout",
    Icon: Radar,
    accent: "142 52% 36%",
    preview: [
      { Icon: TrendingUp, label: "Signals" },
      { Icon: Layers, label: "Assets" },
      { Icon: FileBarChart2, label: "Reports" },
      { Icon: Bell, label: "Alerts" },
    ],
  },
  {
    name: "EdenMarket",
    blurb: "Confidential biotech deal flow.",
    href: "/market/preview",
    Icon: ShoppingBag,
    accent: "234 80% 58%",
    preview: [
      { Icon: ShoppingBag, label: "Browse" },
      { Icon: Briefcase, label: "Deals" },
      { Icon: FileBarChart2, label: "EOIs" },
    ],
  },
];

type PortalContext = "scout" | "market" | "lab" | "discovery" | null;

function detectPortal(path: string): PortalContext {
  if (path.startsWith("/research")) return "lab";
  if (path.startsWith("/discovery")) return "discovery";
  if (path.startsWith("/market")) return "market";
  if (
    path.startsWith("/scout") || path.startsWith("/industry") ||
    path.startsWith("/assets") || path.startsWith("/asset/") ||
    path.startsWith("/reports") || path.startsWith("/report") ||
    path.startsWith("/alerts") || path.startsWith("/institutions") ||
    path.startsWith("/sources") || path.startsWith("/dashboard") ||
    path.startsWith("/discover") || path.startsWith("/pipeline")
  ) return "scout";
  return null;
}

const PORTAL_NAV: Record<NonNullable<PortalContext>, { label: string; href: string }[]> = {
  scout: [
    { label: "Dashboard", href: "/industry/dashboard" },
    { label: "Scout", href: "/scout" },
    { label: "Assets", href: "/assets" },
    { label: "Reports", href: "/reports" },
    { label: "Alerts", href: "/alerts" },
  ],
  market: [
    { label: "Browse", href: "/market" },
    { label: "Deals", href: "/market/deals" },
    { label: "My EOIs", href: "/market/my-eois" },
    { label: "Seller", href: "/market/seller" },
  ],
  lab: [
    { label: "Dashboard", href: "/research" },
    { label: "Projects", href: "/research/projects" },
    { label: "Library", href: "/research/library" },
    { label: "Grants", href: "/research/grants" },
    { label: "Alerts", href: "/research/alerts" },
  ],
  discovery: [
    { label: "Feed", href: "/discovery" },
    { label: "My Concepts", href: "/discovery/my-concepts" },
    { label: "Submit", href: "/discovery/submit" },
  ],
};

function PortalDropdown({
  label,
  entries,
  testId,
}: { label: string; entries: PortalEntry[]; testId: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="px-3 py-1.5 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-all duration-150 inline-flex items-center gap-1"
          data-testid={testId}
        >
          {label}
          <ChevronDown className="w-3.5 h-3.5 opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[320px] p-1.5">
        {entries.map((e) => (
          <Link key={e.href} href={e.href}>
            <a
              className="group block px-2 py-2 rounded-md hover:bg-accent/60 transition-colors"
              data-testid={`link-portal-${e.name.toLowerCase()}`}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-md flex items-center justify-center shrink-0"
                  style={{ background: `hsl(${e.accent} / 0.12)`, color: `hsl(${e.accent})` }}
                >
                  <e.Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold leading-tight" style={{ color: `hsl(${e.accent})` }}>
                    {e.name}
                  </div>
                  <div className="text-xs text-muted-foreground leading-tight truncate mt-0.5">{e.blurb}</div>
                </div>
              </div>
            </a>
          </Link>
        ))}
        <Link href="/pricing">
          <a
            className="block mt-1 px-2.5 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
            data-testid={`link-portal-pricing-${testId}`}
          >
            See pricing →
          </a>
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Nav({ onOpenSaved }: NavProps) {
  const { theme, toggleTheme } = useTheme();
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const normalizedLocation = normalizePath(location);
  const isPublic = PUBLIC_PATHS.includes(normalizedLocation);
  const portal = isPublic ? null : detectPortal(normalizedLocation);

  const { data } = useQuery<{ assets: SavedAsset[] }>({
    queryKey: ["/api/saved-assets"],
    enabled: !isPublic,
  });
  const savedCount = data?.assets?.length ?? 0;

  const portalLinks = portal ? PORTAL_NAV[portal] : [];

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">

        {/* Logo */}
        <div className="flex items-center gap-6">
          <Link href="/">
            <div className="flex items-center gap-2.5 cursor-pointer select-none" data-testid="link-home-logo">
              <div className="relative w-7 h-7 rounded-md bg-primary flex items-center justify-center overflow-hidden">
                <Sprout className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-bold text-foreground text-base tracking-tight">
                Eden<span className="text-primary">Radar</span>
              </span>
            </div>
          </Link>

          {/* Desktop nav links */}
          <nav className="hidden sm:flex items-center gap-1">
            {isPublic ? (
              <>
                <Link href="/about">
                  <button
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-150 ${
                      normalizedLocation === "/about"
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
                    }`}
                    data-testid="link-nav-about"
                  >
                    About
                  </button>
                </Link>
                <PortalDropdown
                  label="For Researchers"
                  entries={RESEARCHER_PORTALS}
                  testId="link-nav-for-researchers"
                />
                <PortalDropdown
                  label="For Industry"
                  entries={INDUSTRY_PORTALS}
                  testId="link-nav-for-industry"
                />
                <Link href="/how-it-works">
                  <button
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-150 ${
                      normalizedLocation === "/how-it-works"
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
                    }`}
                    data-testid="link-nav-how-it-works"
                  >
                    How It Works
                  </button>
                </Link>
                <Link href="/pricing">
                  <button
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-150 ${
                      normalizedLocation === "/pricing"
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
                    }`}
                    data-testid="link-nav-pricing"
                  >
                    Pricing
                  </button>
                </Link>
              </>
            ) : (
              portalLinks.map((link) => {
                const isActive = normalizedLocation === link.href;
                return (
                  <Link key={link.href} href={link.href}>
                    <button
                      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-150 ${
                        isActive
                          ? "bg-accent text-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
                      }`}
                      data-testid={`link-nav-${link.label.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      {link.label}
                    </button>
                  </Link>
                );
              })
            )}
          </nav>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2">
          {!isPublic && portal === "scout" && (
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20">
              <Radar className="w-3 h-3 text-primary" />
              <span className="text-xs font-medium text-primary">AI Discovery Engine</span>
            </div>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="w-8 h-8"
            onClick={toggleTheme}
            data-testid="button-toggle-theme"
            title="Toggle theme"
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>

          {isPublic ? (
            <Link href="/login">
              <Button
                size="sm"
                className="h-8 px-4 font-semibold text-xs hidden sm:flex"
                data-testid="button-nav-signin"
                style={{ background: "hsl(142 52% 36%)", color: "white", border: "none" }}
              >
                Sign In
              </Button>
            </Link>
          ) : (
            <>
              {onOpenSaved ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 h-8 border-card-border relative"
                  onClick={onOpenSaved}
                  data-testid="button-open-saved"
                >
                  <Bookmark className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline text-xs">Saved</span>
                  {savedCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-bold">
                      {savedCount}
                    </span>
                  )}
                </Button>
              ) : portal === "scout" ? (
                <Link href="/assets">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 h-8 border-card-border relative"
                    data-testid="button-nav-assets"
                  >
                    <Bookmark className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline text-xs">Assets</span>
                    {savedCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-bold">
                        {savedCount}
                      </span>
                    )}
                  </Button>
                </Link>
              ) : null}
            </>
          )}

          {/* Mobile menu toggle for public pages */}
          {isPublic && (
            <Button
              variant="ghost"
              size="icon"
              className="w-8 h-8 sm:hidden"
              onClick={() => setMobileOpen((v) => !v)}
              data-testid="button-nav-mobile-menu"
            >
              {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </Button>
          )}
        </div>
      </div>

      {/* Mobile dropdown for public pages */}
      {isPublic && mobileOpen && (
        <div className="sm:hidden border-t border-border bg-background/95 backdrop-blur-md px-4 py-3 flex flex-col gap-1">
          <Link href="/about">
            <button
              className="w-full text-left px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent/60"
              onClick={() => setMobileOpen(false)}
              data-testid="link-nav-mobile-about"
            >
              About
            </button>
          </Link>
          <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            For Researchers
          </div>
          {RESEARCHER_PORTALS.map((e) => (
            <Link key={e.href} href={e.href}>
              <button
                className="w-full text-left px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent/60"
                onClick={() => setMobileOpen(false)}
                data-testid={`link-nav-mobile-${e.name.toLowerCase()}`}
              >
                <span style={{ color: `hsl(${e.accent})` }}>{e.name}</span>
                <span className="block text-[11px] text-muted-foreground/80 leading-snug mt-0.5">{e.blurb}</span>
              </button>
            </Link>
          ))}
          <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            For Industry
          </div>
          {INDUSTRY_PORTALS.map((e) => (
            <Link key={e.href} href={e.href}>
              <button
                className="w-full text-left px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent/60"
                onClick={() => setMobileOpen(false)}
                data-testid={`link-nav-mobile-${e.name.toLowerCase()}`}
              >
                <span style={{ color: `hsl(${e.accent})` }}>{e.name}</span>
                <span className="block text-[11px] text-muted-foreground/80 leading-snug mt-0.5">{e.blurb}</span>
              </button>
            </Link>
          ))}
          <Link href="/how-it-works">
            <button
              className="w-full text-left mt-2 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent/60"
              onClick={() => setMobileOpen(false)}
              data-testid="link-nav-mobile-how-it-works"
            >
              How It Works
            </button>
          </Link>
          <Link href="/pricing">
            <button
              className="w-full text-left px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent/60"
              onClick={() => setMobileOpen(false)}
              data-testid="link-nav-mobile-pricing"
            >
              Pricing
            </button>
          </Link>
          <Link href="/login">
            <Button
              size="sm"
              className="w-full mt-2 font-semibold text-xs"
              data-testid="button-nav-mobile-signin"
              style={{ background: "hsl(142 52% 36%)", color: "white", border: "none" }}
              onClick={() => setMobileOpen(false)}
            >
              Sign In
            </Button>
          </Link>
        </div>
      )}
    </header>
  );
}
