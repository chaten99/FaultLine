import { useState } from "react";
import { CircleAlert, CircleCheck, LoaderCircle, SearchX } from "lucide-react";
import { cn } from "@/lib/utils";
import { useScrolled } from "../hooks/use-public-motion";
import { staggerStyle } from "../lib/public-motion";

export function PublicLayout({
  children,
  topBar,
}: {
  children: React.ReactNode;
  topBar?: React.ReactNode;
}) {
  return (
    <div className="ps-root flex min-h-screen flex-col bg-background text-foreground">
      {topBar}
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-12">{children}</main>
      <footer className="border-t border-border px-4 py-6 text-center text-xs text-muted-foreground">
        Powered by <span className="font-semibold text-foreground">FaultLine</span>
      </footer>
    </div>
  );
}

export function PublicTopBar({
  title,
  logoUrl,
  action,
  className,
}: {
  title: string;
  logoUrl: string | null;
  action?: React.ReactNode;
  className?: string;
}) {
  const scrolled = useScrolled();
  const [logoFailed, setLogoFailed] = useState(false);
  return (
    <header
      data-scrolled={scrolled}
      className={cn(
        "ps-topbar sticky top-0 z-30 border-b backdrop-blur-md",
        className,
        scrolled
          ? "border-border bg-background/85 shadow-sm"
          : "border-transparent bg-background/60",
      )}
    >
      <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          {logoUrl && !logoFailed ? (
            <img
              src={logoUrl}
              alt=""
              referrerPolicy="no-referrer"
              onError={() => setLogoFailed(true)}
              className="h-7 max-w-28 shrink-0 object-contain"
            />
          ) : null}
          <span className="truncate text-sm font-semibold tracking-tight sm:text-base">
            {title}
          </span>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </header>
  );
}

type MessageIcon = "loading" | "success" | "error" | "info" | "missing";

function MessageGlyph({ icon }: { icon: MessageIcon }) {
  if (icon === "success") {
    return (
      <span className="ps-pop grid size-16 place-items-center rounded-full border border-emerald-600/30 bg-emerald-600/10 text-emerald-700">
        <svg
          viewBox="0 0 24 24"
          className="size-8"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path className="ps-draw" d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      </span>
    );
  }
  const config = {
    loading: {
      Icon: LoaderCircle,
      tone: "border-border bg-muted text-muted-foreground",
      spin: true,
    },
    error: { Icon: CircleAlert, tone: "border-red-600/30 bg-red-600/10 text-red-700", spin: false },
    info: { Icon: CircleCheck, tone: "border-border bg-muted text-foreground", spin: false },
    missing: { Icon: SearchX, tone: "border-border bg-muted text-muted-foreground", spin: false },
  }[icon];
  return (
    <span className={cn("ps-pop grid size-16 place-items-center rounded-full border", config.tone)}>
      <config.Icon className={cn("size-8", config.spin ? "animate-spin" : "")} aria-hidden="true" />
    </span>
  );
}

export function PublicMessage({
  title,
  children,
  role,
  icon = "info",
}: {
  title: string;
  children?: React.ReactNode;
  role?: "alert" | "status";
  icon?: MessageIcon;
}) {
  return (
    <PublicLayout>
      <div
        role={role}
        className="ps-fade-up mx-auto mt-8 flex max-w-md flex-col items-center gap-5 rounded-2xl border border-border bg-background p-8 text-center shadow-sm sm:mt-16"
        style={staggerStyle(0)}
      >
        <MessageGlyph icon={icon} />
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {children ? (
          <div className="w-full space-y-4 text-sm text-muted-foreground">{children}</div>
        ) : null}
      </div>
    </PublicLayout>
  );
}
