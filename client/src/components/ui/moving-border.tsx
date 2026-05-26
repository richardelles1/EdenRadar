import { useEffect, useRef, ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function MovingBorder({
  children,
  className,
  containerClassName,
  duration = 4000,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  containerClassName?: string;
  duration?: number;
}) {
  const spanRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let id: number;
    let start: number | null = null;
    const tick = (ts: number) => {
      if (start === null) start = ts;
      const angle = Math.round((((ts - start) % duration) / duration) * 360);
      if (spanRef.current) {
        spanRef.current.style.background = `conic-gradient(from ${angle}deg, hsl(142 52% 26%) 0deg, hsl(142 65% 55%) 80deg, hsl(155 60% 48%) 140deg, hsl(142 52% 26%) 200deg)`;
      }
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [duration]);

  return (
    <div className={cn("relative p-px rounded-lg overflow-hidden group/mb", containerClassName)}>
      <span
        ref={spanRef}
        className="absolute inset-0 rounded-[inherit] opacity-60 group-hover/mb:opacity-90 transition-opacity duration-300"
        aria-hidden
      />
      <div
        className="absolute inset-[1px] rounded-[calc(0.5rem-1px)]"
        style={{ background: "hsl(var(--background))" }}
      />
      <button
        className={cn("relative z-10 rounded-[calc(0.5rem-2px)]", className)}
        {...props}
      >
        {children}
      </button>
    </div>
  );
}
