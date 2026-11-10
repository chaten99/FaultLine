import { useId } from "react";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export function EditorSection({
  title,
  description,
  defaultOpen = true,
  children,
  action,
}: {
  title: string;
  description: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  const headingId = useId();
  return (
    <Collapsible
      defaultOpen={defaultOpen}
      className="rounded-lg border border-border bg-background"
      aria-labelledby={headingId}
    >
      <div className="flex items-start justify-between gap-3 p-4 sm:p-5">
        <CollapsibleTrigger className="group flex min-w-0 flex-1 items-start gap-3 text-left">
          <ChevronDown
            className={cn(
              "mt-1 size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=closed]:-rotate-90",
            )}
            aria-hidden="true"
          />
          <span className="min-w-0 space-y-1">
            <span id={headingId} className="block text-base font-semibold tracking-tight">
              {title}
            </span>
            <span className="block text-sm text-muted-foreground">{description}</span>
          </span>
        </CollapsibleTrigger>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <CollapsibleContent className="border-t border-border p-4 sm:p-5">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
