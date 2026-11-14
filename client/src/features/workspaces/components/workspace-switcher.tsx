import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Building2, Check, ChevronsUpDown, Plus, Settings, User, UserPlus } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useActiveWorkspace, useCan, useSwitchWorkspace } from "../hooks/use-workspaces";
import { roleLabels } from "../lib/permissions";
import { useWorkspaceStore } from "../store/workspace.store";
import type { WorkspaceType } from "../types/workspace.types";
import { CreateWorkspaceDialog } from "./create-workspace-dialog";

function TypeIcon({ type, className }: { type: WorkspaceType; className?: string }) {
  const Icon = type === "personal" ? User : Building2;
  return <Icon className={cn("size-4 shrink-0", className)} aria-hidden="true" />;
}

export function WorkspaceSwitcher({ onNavigate }: { onNavigate?: () => void }) {
  const navigate = useNavigate();
  const active = useActiveWorkspace();
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const switchWorkspace = useSwitchWorkspace();
  const canInvite = useCan("members:invite");
  const [createOpen, setCreateOpen] = useState(false);

  const select = async (id: string, name: string) => {
    if (id === active?.id) return;
    const switched = await switchWorkspace(id);
    if (switched) {
      navigate("/dashboard");
      onNavigate?.();
      toast.success(`Switched to ${name}`);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Switch workspace"
            className="group mt-6 flex min-h-12 w-full items-center gap-3 rounded-lg border border-border bg-background px-3 py-2 text-left transition-colors duration-150 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-accent"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground">
              <TypeIcon type={active?.type ?? "personal"} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">
                {active?.name ?? "Select workspace"}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {active
                  ? `${roleLabels[active.role]} · ${active.type === "personal" ? "Personal" : "Team"}`
                  : " "}
              </span>
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[min(18rem,calc(100vw-2rem))]">
          <DropdownMenuLabel className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Workspaces
          </DropdownMenuLabel>
          <div className="max-h-64 overflow-y-auto">
            {workspaces.map((workspace) => (
              <DropdownMenuItem
                key={workspace.id}
                className="min-h-11 cursor-pointer gap-3"
                onSelect={() => void select(workspace.id, workspace.name)}
              >
                <TypeIcon type={workspace.type} className="text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{workspace.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {roleLabels[workspace.role]}
                  </span>
                </span>
                {workspace.id === active?.id ? (
                  <Check className="size-4" aria-label="Current workspace" />
                ) : null}
              </DropdownMenuItem>
            ))}
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="min-h-10 cursor-pointer gap-2"
            onSelect={() => setCreateOpen(true)}
          >
            <Plus className="size-4" aria-hidden="true" /> Create workspace
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="min-h-10 cursor-pointer gap-2">
            <Link to="/settings/workspace" onClick={onNavigate}>
              <Settings className="size-4" aria-hidden="true" /> Workspace settings
            </Link>
          </DropdownMenuItem>
          {canInvite ? (
            <DropdownMenuItem asChild className="min-h-10 cursor-pointer gap-2">
              <Link to="/settings/members?invite=1" onClick={onNavigate}>
                <UserPlus className="size-4" aria-hidden="true" /> Invite teammates
              </Link>
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <CreateWorkspaceDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}
