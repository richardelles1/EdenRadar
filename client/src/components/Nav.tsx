import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Bookmark, Moon, Sun, Sprout, Radar } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { useQuery } from "@tanstack/react-query";
import type { SavedAsset } from "@shared/schema";

type NavProps = {
  onOpenSaved?: () => void;
};

export function Nav({ onOpenSaved }: NavProps) {
  const { theme, toggleTheme } = useTheme();
  const [location] = useLocation();

  const { data } = useQuery<{ assets: SavedAsset[] }>({
    queryKey: ["/api/saved-assets"],
  });
  const savedCount = data?.assets?.length ?? 0;

  const navLinks = [
    { href: "/", label: "Home" },
    { href: "/scout", label: "Scout" },
    { href: "/assets", label: "Assets" },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
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

          <nav className="hidden sm:flex items-center gap-1">
            {navLinks.map((link) => {
              const isActive = location === link.href;
              return (
                <Link key={link.href} href={link.href}>
                  <button
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-150 ${
                      isActive
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
                    }`}
                    data-testid={`link-nav-${link.label.toLowerCase()}`}
                  >
                    {link.label}
                  </button>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20">
            <Radar className="w-3 h-3 text-primary" />
            <span className="text-xs font-medium text-primary">AI Discovery Engine</span>
          </div>

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
          ) : (
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
          )}
        </div>
      </div>
    </header>
  );
}
