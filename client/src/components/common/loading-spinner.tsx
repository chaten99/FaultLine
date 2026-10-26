import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <LoaderCircle
      role="status"
      aria-label="Loading"
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  );
}

export function SpinnerCustom({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("inline-flex items-center gap-2", className)} {...props}>
      <Spinner />
      {children}
    </div>
  );
}

export function LoadingSpinner({ label = "Loading" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2" role="status">
      <Spinner aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
