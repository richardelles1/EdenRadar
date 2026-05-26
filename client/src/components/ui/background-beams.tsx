import { motion } from "framer-motion";
import { useRef } from "react";
import { cn } from "@/lib/utils";

let _counter = 0;

const PATHS = [
  "M-380 -189C-380 -189 -312 216 152 343C616 470 684 875 684 875",
  "M-373 -197C-373 -197 -305 208 159 335C623 462 691 867 691 867",
  "M-359 -213C-359 -213 -291 192 173 319C637 446 705 851 705 851",
  "M-345 -229C-345 -229 -277 176 187 303C651 430 719 835 719 835",
  "M-331 -245C-331 -245 -263 160 201 287C665 414 733 819 733 819",
  "M-317 -261C-317 -261 -249 144 215 271C679 398 747 803 747 803",
  "M-303 -277C-303 -277 -235 128 229 255C693 382 761 787 761 787",
  "M-289 -293C-289 -293 -221 112 243 239C707 366 775 771 775 771",
  "M-275 -309C-275 -309 -207 96 257 223C721 350 789 755 789 755",
  "M-261 -325C-261 -325 -193 80 271 207C735 334 803 739 803 739",
  "M-247 -341C-247 -341 -179 64 285 191C749 318 817 723 817 723",
  "M-233 -357C-233 -357 -165 48 299 175C763 302 831 707 831 707",
];

export function BackgroundBeams({ className }: { className?: string }) {
  const idRef = useRef<string | null>(null);
  if (!idRef.current) idRef.current = `bb-${_counter++}`;
  const id = idRef.current;

  return (
    <svg
      className={cn("pointer-events-none absolute inset-0 h-full w-full", className)}
      viewBox="0 0 696 316"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={`${id}-g1`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="transparent" />
          <stop offset="50%" stopColor="hsl(142 65% 55%)" />
          <stop offset="100%" stopColor="transparent" />
        </linearGradient>
        <linearGradient id={`${id}-g2`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="transparent" />
          <stop offset="50%" stopColor="hsl(155 60% 48%)" />
          <stop offset="100%" stopColor="transparent" />
        </linearGradient>
      </defs>

      {PATHS.map((d, i) => (
        <motion.path
          key={i}
          d={d}
          stroke={i % 2 === 0 ? `url(#${id}-g1)` : `url(#${id}-g2)`}
          strokeWidth={i % 3 === 0 ? "0.8" : "0.4"}
          fill="none"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{
            pathLength: [0, 1],
            opacity: [0, 0.6, 0],
          }}
          transition={{
            duration: 3.5,
            delay: i * 0.18,
            repeat: Infinity,
            repeatDelay: 1.2,
            ease: "easeInOut",
          }}
        />
      ))}
    </svg>
  );
}
