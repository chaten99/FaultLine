import { LoaderCircle } from "lucide-react";

export function LoadingSpinner({ label = "Loading" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2" role="status">
      <LoaderCircle className="animate-spin" size={16} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
