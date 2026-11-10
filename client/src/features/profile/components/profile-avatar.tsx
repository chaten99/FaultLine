import { cn } from "@/lib/utils";
import { avatarTone, getInitials } from "../lib/profile-presentation";

const sizes = {
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-20 text-2xl sm:size-24 sm:text-3xl",
} as const;

export function ProfileAvatar({
  name,
  size = "md",
  className,
}: {
  name: string | null | undefined;
  size?: keyof typeof sizes;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-semibold tracking-tight select-none",
        avatarTone(name),
        sizes[size],
        className,
      )}
    >
      {getInitials(name)}
    </span>
  );
}
