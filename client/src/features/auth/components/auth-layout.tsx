import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-screen bg-background text-foreground lg:grid-cols-[1.05fr_0.95fr]">
      <div className="hidden flex-col justify-between bg-primary p-12 text-primary-foreground lg:flex">
        <Link to="/login" className="text-lg font-semibold tracking-wide">
          FaultLine<span className="text-muted-foreground">.</span>
        </Link>
        <div className="max-w-md space-y-5">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary-foreground/70">
            API monitoring, clearly seen
          </p>
          <h1 className="font-serif text-5xl leading-tight">
            A steadier view of the services you depend on.
          </h1>
          <p className="text-primary-foreground/75">
            A focused workspace for understanding service health and responding when it matters.
          </p>
        </div>
        <p className="text-xs text-primary-foreground/60">
          Real-time monitoring foundations for thoughtful teams.
        </p>
      </div>
      <div className="flex items-center justify-center px-6 py-12">{children}</div>
    </main>
  );
}
