import { cn } from "@/lib/utils";

interface NotificationSectionProps {
  title: string;
  description: string;
  action?: React.ReactNode;
  titleAddon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function NotificationSection({
  title,
  description,
  action,
  titleAddon,
  children,
  className,
}: NotificationSectionProps) {
  return (
    <section className={cn("space-y-4", className)} aria-label={title}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
            {titleAddon}
          </div>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="rounded-lg border border-border bg-background">{children}</div>
    </section>
  );
}

export function SettingRow({
  title,
  description,
  control,
  htmlFor,
}: {
  title: string;
  description: string;
  control: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 p-4">
      <div className="min-w-0 space-y-1">
        <label htmlFor={htmlFor} className="text-sm font-medium">
          {title}
        </label>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2 pt-0.5">{control}</div>
    </div>
  );
}
