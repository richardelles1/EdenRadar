import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface Tab {
  id: string;
  label: string;
}

export function AnimatedTabs({
  tabs,
  activeIndex,
  onChange,
  className,
}: {
  tabs: Tab[];
  activeIndex: number;
  onChange: (i: number) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center p-1 rounded-full border border-border bg-card shadow-sm",
        className
      )}
    >
      {tabs.map((tab, i) => (
        <button
          key={tab.id}
          onClick={() => onChange(i)}
          data-testid={`button-demo-scenario-${tab.id}`}
          className="relative px-4 sm:px-5 py-2 rounded-full text-xs sm:text-sm font-semibold transition-colors duration-150 min-h-[36px]"
          style={{ color: activeIndex === i ? "white" : "hsl(var(--muted-foreground))" }}
        >
          {activeIndex === i && (
            <motion.span
              layoutId="tab-pill"
              className="absolute inset-0 rounded-full"
              style={{
                background: "hsl(var(--portal-scout))",
                boxShadow: "0 2px 8px hsl(142 52% 36% / 0.4)",
              }}
              transition={{ type: "spring", stiffness: 450, damping: 32 }}
            />
          )}
          <span className="relative z-10">{tab.label}</span>
        </button>
      ))}
    </div>
  );
}
