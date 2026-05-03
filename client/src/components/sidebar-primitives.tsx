import { motion } from "framer-motion";
import { useSidebar } from "@/components/ui/aceternity-sidebar";
import { cn } from "@/lib/utils";

export type PortalKey = "lab" | "scout" | "market" | "discovery";

export const PORTAL_ACCENT: Record<PortalKey, string> = {
  lab: "hsl(262 80% 60%)",
  scout: "var(--org-accent, hsl(142 52% 36%))",
  market: "hsl(234 80% 58%)",
  discovery: "hsl(38 92% 50%)",
};

export function accentMix(accent: string, pct = 10): string {
  return `color-mix(in srgb, ${accent} ${pct}%, transparent)`;
}

export function AnimatedLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { open, animate } = useSidebar();
  return (
    <motion.span
      animate={{
        opacity: animate ? (open ? 1 : 0) : 1,
        width: animate ? (open ? "auto" : 0) : "auto",
      }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      className={cn("whitespace-pre overflow-hidden block", className)}
    >
      {children}
    </motion.span>
  );
}

export function SidebarGroupHeader({ children }: { children: React.ReactNode }) {
  const { open, animate } = useSidebar();
  return (
    <motion.p
      animate={{
        opacity: animate ? (open ? 1 : 0) : 1,
        height: animate ? (open ? "auto" : 0) : "auto",
      }}
      transition={{ duration: 0.12, ease: "easeOut" }}
      className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest px-3 mb-0.5 overflow-hidden whitespace-pre"
    >
      {children}
    </motion.p>
  );
}

type NavButtonProps = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  isActive: boolean;
  onClick: () => void;
  accent: string;
  testId: string;
  badgeCount?: number;
  showDot?: boolean;
};

export function SidebarNavButton({
  label,
  icon: Icon,
  isActive,
  onClick,
  accent,
  testId,
  badgeCount,
  showDot,
}: NavButtonProps) {
  const { open, animate } = useSidebar();

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium cursor-pointer transition-colors duration-150 w-full text-left",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isActive ? "" : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
      )}
      style={
        isActive
          ? { backgroundColor: accentMix(accent, 10), color: accent }
          : undefined
      }
      data-testid={testId}
    >
      <div
        className="relative shrink-0"
        style={showDot && !isActive ? { color: accent } : undefined}
      >
        <Icon className="w-4 h-4" />
        {showDot && !isActive && (
          <span
            className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border-2 border-background"
            style={{ backgroundColor: accent }}
            data-testid="alerts-dot"
          />
        )}
      </div>
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
        {badgeCount !== undefined && badgeCount > 0 && !isActive && (
          <span
            className="text-[10px] font-semibold tabular-nums"
            style={{ color: accent }}
            data-testid="alerts-count"
          >
            {badgeCount > 9 ? "9+" : badgeCount}
          </span>
        )}
      </motion.span>
    </button>
  );
}

type BottomButtonProps = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  isActive?: boolean;
  accent?: string;
  testId?: string;
  danger?: boolean;
};

export function SidebarBottomButton({
  label,
  icon: Icon,
  onClick,
  isActive,
  accent,
  testId,
  danger,
}: BottomButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2.5 px-3 py-1.5 rounded-md text-sm font-medium cursor-pointer transition-colors duration-150 w-full text-left",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isActive
          ? ""
          : danger
            ? "text-muted-foreground hover:text-red-500 dark:hover:text-red-400 hover:bg-accent/60"
            : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
      )}
      style={
        isActive && accent
          ? { backgroundColor: accentMix(accent, 10), color: accent }
          : undefined
      }
      data-testid={testId}
    >
      <Icon className="w-4 h-4 shrink-0" />
      <AnimatedLabel>{label}</AnimatedLabel>
    </button>
  );
}
