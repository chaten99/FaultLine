import { cn } from "@/lib/utils";

interface ProfileSectionProps {
  title: string;
  description: string;
  index?: number;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function ProfileSection({
  title,
  description,
  index = 0,
  action,
  children,
  className,
}: ProfileSectionProps) {
  return (
    <section
      aria-labelledby={`profile-${title.toLowerCase().replace(/\s+/g, "-")}`}
      className={cn("pf-rise space-y-4", className)}
      style={{ "--pf-i": index } as React.CSSProperties}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h2
            id={`profile-${title.toLowerCase().replace(/\s+/g, "-")}`}
            className="text-lg font-semibold tracking-tight"
          >
            {title}
          </h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="rounded-lg border border-border bg-background">{children}</div>
    </section>
  );
}
