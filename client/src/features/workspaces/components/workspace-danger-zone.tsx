import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { SpinnerCustom } from "@/components/common/loading-spinner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getApiFieldErrors } from "@/lib/api-error";
import {
  useDeleteWorkspace,
  useLeaveWorkspace,
  useMembers,
  useRecoverFromLostWorkspace,
  useTransferOwnership,
} from "../hooks/use-workspaces";
import { workspaceErrorMessage } from "../lib/messages";
import {
  deleteWorkspaceSchema,
  transferOwnershipSchema,
  type TransferOwnershipValues,
} from "../schemas/workspace.schema";
import type { WorkspaceDetail } from "../types/workspace.types";

function FieldError({ message }: { message?: string }) {
  return message ? (
    <p role="alert" className="text-xs text-destructive">
      {message}
    </p>
  ) : null;
}

function DangerRow({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

function TransferDialog({
  workspace,
  open,
  onOpenChange,
}: {
  workspace: WorkspaceDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const members = useMembers(open ? workspace.id : null);
  const transfer = useTransferOwnership(workspace.id);
  const candidates = useMemo(
    () => (members.data ?? []).filter((member) => !member.isOwner && !member.isSelf),
    [members.data],
  );
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    setError,
    formState: { errors },
  } = useForm<TransferOwnershipValues>({
    resolver: zodResolver(transferOwnershipSchema),
    defaultValues: { userId: "", password: "", confirm: false as unknown as true },
  });
  const userId = watch("userId");
  const confirm = watch("confirm") as boolean;
  const selected = candidates.find((member) => member.userId === userId);

  const submit = async (values: TransferOwnershipValues) => {
    try {
      await transfer.mutateAsync({ userId: values.userId, password: values.password });
      toast.success(`Ownership transferred to ${selected?.name ?? "the new owner"}.`);
      reset();
      onOpenChange(false);
    } catch (error) {
      const fields = getApiFieldErrors(error);
      if (fields.password) setError("password", { type: "server", message: fields.password });
      toast.error(workspaceErrorMessage(error));
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (!transfer.isPending ? onOpenChange(next) : undefined)}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transfer ownership</DialogTitle>
          <DialogDescription>
            The new owner gets full control of {workspace.name}. You will become an Admin.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="transfer-user">New owner</Label>
            <Select
              value={userId}
              onValueChange={(value) => setValue("userId", value, { shouldValidate: true })}
            >
              <SelectTrigger id="transfer-user" aria-invalid={Boolean(errors.userId)}>
                <SelectValue
                  placeholder={members.isLoading ? "Loading members…" : "Choose a member"}
                />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((member) => (
                  <SelectItem key={member.userId} value={member.userId}>
                    {member.name} ({member.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {candidates.length === 0 && !members.isLoading ? (
              <p className="text-xs text-muted-foreground">
                Invite someone and have them join before transferring ownership.
              </p>
            ) : null}
            <FieldError message={errors.userId?.message} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="transfer-password">Your password</Label>
            <Input
              id="transfer-password"
              type="password"
              autoComplete="current-password"
              aria-invalid={Boolean(errors.password)}
              {...register("password")}
            />
            <FieldError message={errors.password?.message} />
          </div>
          <div className="flex items-start gap-3">
            <Checkbox
              id="transfer-confirm"
              checked={confirm}
              onCheckedChange={(checked) =>
                setValue("confirm", checked as unknown as true, { shouldValidate: true })
              }
            />
            <Label htmlFor="transfer-confirm" className="text-sm font-normal">
              I understand that I will lose owner permissions and can't undo this myself.
            </Label>
          </div>
          <FieldError message={errors.confirm?.message} />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={transfer.isPending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={transfer.isPending || candidates.length === 0}>
              {transfer.isPending ? (
                <SpinnerCustom>Transferring…</SpinnerCustom>
              ) : (
                "Transfer ownership"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({
  workspace,
  open,
  onOpenChange,
}: {
  workspace: WorkspaceDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const remove = useDeleteWorkspace(workspace.id);
  const recover = useRecoverFromLostWorkspace();
  const schema = useMemo(() => deleteWorkspaceSchema(workspace.name), [workspace.name]);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<{ confirmName: string; password: string }>({
    resolver: zodResolver(schema),
    defaultValues: { confirmName: "", password: "" },
  });

  const submit = async (values: { confirmName: string; password: string }) => {
    try {
      const result = await remove.mutateAsync(values);
      toast.success(
        `${workspace.name} was deleted. Its data is kept until ${new Date(result.purgeAfter).toLocaleDateString()} and then removed.`,
      );
      reset();
      onOpenChange(false);
      await recover();
      navigate("/dashboard");
    } catch (error) {
      const fields = getApiFieldErrors(error);
      if (fields.password) setError("password", { type: "server", message: fields.password });
      toast.error(workspaceErrorMessage(error));
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (!remove.isPending ? onOpenChange(next) : undefined)}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {workspace.name}?</DialogTitle>
          <DialogDescription>
            This makes the workspace inaccessible to everyone. Monitoring stops, public status pages
            go offline and integrations stop sending alerts. Data is retained for a limited period
            and then permanently removed.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="delete-name">
              Type <span className="font-semibold">{workspace.name}</span> to confirm
            </Label>
            <Input
              id="delete-name"
              autoComplete="off"
              aria-invalid={Boolean(errors.confirmName)}
              {...register("confirmName")}
            />
            <FieldError message={errors.confirmName?.message} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="delete-password">Your password</Label>
            <Input
              id="delete-password"
              type="password"
              autoComplete="current-password"
              aria-invalid={Boolean(errors.password)}
              {...register("password")}
            />
            <FieldError message={errors.password?.message} />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={remove.isPending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={remove.isPending}>
              {remove.isPending ? <SpinnerCustom>Deleting…</SpinnerCustom> : "Delete workspace"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LeaveDialog({
  workspace,
  open,
  onOpenChange,
}: {
  workspace: WorkspaceDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const leave = useLeaveWorkspace(workspace.id);
  const recover = useRecoverFromLostWorkspace();

  const confirm = async () => {
    try {
      await leave.mutateAsync();
      toast.success(`You left ${workspace.name}.`);
      onOpenChange(false);
      await recover();
      navigate("/dashboard");
    } catch (error) {
      toast.error(workspaceErrorMessage(error));
    }
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => (!leave.isPending ? onOpenChange(next) : undefined)}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Leave {workspace.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            You will immediately lose access to its monitors, incidents and settings. An owner or
            admin can invite you again later.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={leave.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={leave.isPending}
            onClick={(event) => {
              event.preventDefault();
              void confirm();
            }}
          >
            {leave.isPending ? <SpinnerCustom>Leaving…</SpinnerCustom> : "Leave workspace"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function WorkspaceDangerZone({
  workspace,
  canTransfer,
  canDelete,
  canLeave,
}: {
  workspace: WorkspaceDetail;
  canTransfer: boolean;
  canDelete: boolean;
  canLeave: boolean;
}) {
  const [transferOpen, setTransferOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const personal = workspace.type === "personal";
  if (!canTransfer && !canDelete && !canLeave) return null;

  return (
    <div className="divide-y divide-border">
      {canTransfer ? (
        <DangerRow
          title="Transfer ownership"
          description={
            personal
              ? "Personal workspaces can't be transferred."
              : "Hand this workspace to another member. You become an Admin."
          }
          action={
            <Button variant="outline" disabled={personal} onClick={() => setTransferOpen(true)}>
              Transfer ownership
            </Button>
          }
        />
      ) : null}
      {canDelete ? (
        <DangerRow
          title="Delete workspace"
          description={
            personal
              ? "Personal workspaces can't be deleted."
              : "Make this workspace inaccessible. Data is retained briefly, then removed."
          }
          action={
            <Button variant="destructive" disabled={personal} onClick={() => setDeleteOpen(true)}>
              Delete workspace
            </Button>
          }
        />
      ) : null}
      {canLeave ? (
        <DangerRow
          title="Leave workspace"
          description="You will lose access immediately. You can be invited again later."
          action={
            <Button variant="outline" onClick={() => setLeaveOpen(true)}>
              Leave workspace
            </Button>
          }
        />
      ) : null}
      <TransferDialog workspace={workspace} open={transferOpen} onOpenChange={setTransferOpen} />
      <DeleteDialog workspace={workspace} open={deleteOpen} onOpenChange={setDeleteOpen} />
      <LeaveDialog workspace={workspace} open={leaveOpen} onOpenChange={setLeaveOpen} />
    </div>
  );
}
