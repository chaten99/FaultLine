import { Crown, Eye, Shield, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { roleLabels } from "../lib/permissions";
import type { WorkspaceRole } from "../types/workspace.types";

const icons = { owner: Crown, admin: Shield, member: User, viewer: Eye } as const;

const tones: Record<WorkspaceRole, string> = {
  owner: "border-transparent bg-primary text-primary-foreground",
  admin: "border-border bg-accent text-foreground",
  member: "border-border bg-background text-foreground",
  viewer: "border-border bg-muted text-muted-foreground",
};

export function RoleBadge({ role, className }: { role: WorkspaceRole; className?: string }) {
  const Icon = icons[role];
  return (
    <Badge variant="outline" className={cn("gap-1", tones[role], className)}>
      <Icon className="size-3" aria-hidden="true" />
      {roleLabels[role]}
    </Badge>
  );
}
