import { useEffect, useRef, useState, ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function HoverBorderGradient({
  children,
  className,
  containerClassName,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  containerClassName?: string;
}) {
  const [hovered, setHovered] = useState(false);
  const borderRef = useRef<HTMLSpanElement>(null);
  const rafRef = useRef<number>(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (hovered) {
      const tick = (ts: number) => {
        if (startRef.current === null) startRef.current = ts;
        const angle = Math.round((((ts - startRef.current) % 2500) / 2500) * 360);
        if (borderRef.current) {
          borderRef.current.style.background = `conic-gradient(from ${angle}deg, hsl(142 52% 26%), hsl(142 65% 55%), hsl(155 60% 48%), hsl(142 52% 26%))`;
          borderRef.current.style.opacity = "1";
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } else {
      cancelAnimationFrame(rafRef.current);
      startRef.current = null;
      if (borderRef.current) {
        borderRef.current.style.background = "hsl(var(--border))";
        borderRef.current.style.opacity = "0.6";
      }
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [hovered]);

  return (
    <div
      className={cn("relative rounded-sm overflow-hidden p-px", containerClassName)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span
        ref={borderRef}
        className="absolute inset-0 rounded-[inherit] transition-opacity duration-300"
        style={{ background: "hsl(var(--border))", opacity: 0.6 }}
        aria-hidden
      />
      <div
        className="absolute inset-[1px] rounded-[inherit]"
        style={{ background: "hsl(var(--background))" }}
      />
      <button
        className={cn("relative z-10 rounded-[1px]", className)}
        {...props}
      >
        {children}
      </button>
    </div>
  );
}
