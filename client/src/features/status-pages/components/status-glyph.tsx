import { CircleCheck, CircleHelp, CircleX, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { publicStatusPresentation, toneClasses, toneRing } from "../lib/status-presentation";
import type { PublicStatus } from "../types/status-page.types";

const icons = {
  operational: CircleCheck,
  partial_outage: TriangleAlert,
  major_outage: CircleX,
  unknown: CircleHelp,
} as const;

const ringSpeed: Record<PublicStatus, string> = {
  operational: "",
  partial_outage: "ps-ring-alert",
  major_outage: "ps-ring-alert",
  unknown: "ps-ring-idle",
};

export function StatusGlyph({
  status,
  size = "lg",
  className,
}: {
  status: PublicStatus;
  size?: "sm" | "lg";
  className?: string;
}) {
  const tone = publicStatusPresentation[status].tone;
  const Icon = icons[status];
  return (
    <span
      aria-hidden="true"
      className={cn(
        "ps-ring grid shrink-0 place-items-center rounded-full border",
        size === "lg" ? "size-14 sm:size-16" : "size-9",
        toneClasses[tone],
        toneRing[tone],
        ringSpeed[status],
        className,
      )}
    >
      <Icon className={size === "lg" ? "size-7 sm:size-8" : "size-5"} strokeWidth={2} />
    </span>
  );
}

export function StatusDot({ status }: { status: PublicStatus }) {
  const tone = publicStatusPresentation[status].tone;
  const color = {
    good: "bg-emerald-600",
    warn: "bg-amber-500",
    bad: "bg-red-600",
    neutral: "bg-slate-400",
  }[tone];
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block size-2.5 shrink-0 rounded-full",
        color,
        status === "major_outage" || status === "partial_outage" ? "ps-dot-alert" : "",
      )}
    />
  );
}
