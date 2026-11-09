import { cn } from "@/lib/utils";
import { staggerStyle } from "../lib/public-motion";

export function Shimmer({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("ps-shimmer", className)} />;
}

export function PublicSkeleton({ label = "Loading status" }: { label?: string }) {
  return (
    <div className="space-y-8" aria-busy="true" aria-label={label} role="status">
      <div className="ps-fade-up space-y-3" style={staggerStyle(0)}>
        <Shimmer className="h-8 w-2/3" />
        <Shimmer className="h-4 w-1/2" />
      </div>
      <div
        className="ps-fade-up flex items-center gap-4 rounded-2xl border border-border p-6"
        style={staggerStyle(1)}
      >
        <Shimmer className="size-16 shrink-0 rounded-full" />
        <div className="flex-1 space-y-3">
          <Shimmer className="h-6 w-1/2" />
          <Shimmer className="h-4 w-4/5" />
        </div>
      </div>
      <div className="ps-fade-up space-y-3" style={staggerStyle(2)}>
        <Shimmer className="h-6 w-28" />
        {[0, 1, 2].map((item) => (
          <div key={item} className="space-y-3 rounded-xl border border-border p-4">
            <div className="flex items-center justify-between gap-3">
              <Shimmer className="h-5 w-1/3" />
              <Shimmer className="h-6 w-24 rounded-full" />
            </div>
            <Shimmer className="h-8 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
