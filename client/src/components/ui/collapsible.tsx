import * as React from "react";
import { cn } from "@/lib/utils";

interface CollapsibleContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CollapsibleContext = React.createContext<CollapsibleContextValue | null>(null);

export interface CollapsibleProps extends React.HTMLAttributes<HTMLDivElement> {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function Collapsible({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  className,
  children,
  ...props
}: CollapsibleProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : uncontrolledOpen;

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      if (!isControlled) {
        setUncontrolledOpen(nextOpen);
      }
      onOpenChange?.(nextOpen);
    },
    [isControlled, onOpenChange],
  );

  return (
    <CollapsibleContext.Provider value={{ open, onOpenChange: handleOpenChange }}>
      <div data-state={open ? "open" : "closed"} className={cn(className)} {...props}>
        {children}
      </div>
    </CollapsibleContext.Provider>
  );
}

export interface CollapsibleTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
}

export const CollapsibleTrigger = React.forwardRef<HTMLButtonElement, CollapsibleTriggerProps>(
  ({ className, onClick, children, ...props }, ref) => {
    const context = React.useContext(CollapsibleContext);
    if (!context) {
      throw new Error("CollapsibleTrigger must be used within a Collapsible");
    }

    return (
      <button
        type="button"
        ref={ref}
        aria-expanded={context.open}
        data-state={context.open ? "open" : "closed"}
        onClick={(e) => {
          context.onOpenChange(!context.open);
          onClick?.(e);
        }}
        className={cn(className)}
        {...props}
      >
        {children}
      </button>
    );
  },
);
CollapsibleTrigger.displayName = "CollapsibleTrigger";

export interface CollapsibleContentProps extends React.HTMLAttributes<HTMLDivElement> {
  forceMount?: boolean;
}

export const CollapsibleContent = React.forwardRef<HTMLDivElement, CollapsibleContentProps>(
  ({ className, children, forceMount, ...props }, ref) => {
    const context = React.useContext(CollapsibleContext);
    if (!context) {
      throw new Error("CollapsibleContent must be used within a Collapsible");
    }

    if (!context.open && !forceMount) {
      return null;
    }

    return (
      <div
        ref={ref}
        data-state={context.open ? "open" : "closed"}
        className={cn("overflow-hidden transition-all", className)}
        {...props}
      >
        {children}
      </div>
    );
  },
);
CollapsibleContent.displayName = "CollapsibleContent";
