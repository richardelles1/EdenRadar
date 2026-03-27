import { createContext, useContext, useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

type SidebarContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  animate: boolean;
};

const SidebarContext = createContext<SidebarContextValue>({
  open: false,
  setOpen: () => {},
  animate: true,
});

export function useSidebar() {
  return useContext(SidebarContext);
}

type SidebarProps = {
  children: React.ReactNode;
  open?: boolean;
  setOpen?: (open: boolean) => void;
  animate?: boolean;
};

export function AceternitySidebar({ children, open: openProp, setOpen: setOpenProp, animate = true }: SidebarProps) {
  const [openState, setOpenState] = useState(false);
  const open = openProp !== undefined ? openProp : openState;
  const setOpen = setOpenProp ?? setOpenState;

  return (
    <SidebarContext.Provider value={{ open, setOpen, animate }}>
      {children}
    </SidebarContext.Provider>
  );
}

type SidebarBodyProps = {
  children: React.ReactNode;
  className?: string;
};

export function AceternitySidebarBody({ children, className }: SidebarBodyProps) {
  const { open, setOpen, animate } = useSidebar();

  return (
    <motion.div
      className={cn(
        "hidden md:flex flex-col h-screen sticky top-0 overflow-hidden border-r border-border bg-background shrink-0",
        className
      )}
      animate={{
        width: animate ? (open ? 220 : 60) : 220,
      }}
      transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {children}
    </motion.div>
  );
}

export type SidebarLinkItem = {
  label: string;
  href: string;
  icon: React.ReactNode;
};

type SidebarLinkProps = {
  link: SidebarLinkItem;
  className?: string;
  isActive?: boolean;
  onClick?: () => void;
  badge?: React.ReactNode;
};

export function AceternitySidebarLink({ link, className, isActive, onClick, badge }: SidebarLinkProps) {
  const { open, animate } = useSidebar();

  return (
    <a
      href={link.href}
      onClick={(e) => {
        e.preventDefault();
        onClick?.();
      }}
      className={cn(
        "flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm font-medium cursor-pointer transition-colors duration-150 group/link",
        isActive
          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          : "text-muted-foreground hover:text-foreground hover:bg-accent/60",
        className
      )}
    >
      <div className="relative shrink-0">
        {link.icon}
        {badge}
      </div>
      <motion.span
        animate={{
          opacity: animate ? (open ? 1 : 0) : 1,
          width: animate ? (open ? "auto" : 0) : "auto",
        }}
        transition={{ duration: 0.15, ease: "easeOut" }}
        className="whitespace-pre overflow-hidden text-sm font-medium"
        style={{ display: "block" }}
      >
        {link.label}
      </motion.span>
    </a>
  );
}
