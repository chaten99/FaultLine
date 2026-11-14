import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { SpinnerCustom } from "@/components/common/loading-spinner";
import { Button } from "@/components/ui/button";
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
import { getApiFieldErrors } from "@/lib/api-error";
import { useCreateWorkspace } from "../hooks/use-workspaces";
import { workspaceErrorMessage } from "../lib/messages";
import { createWorkspaceSchema, type CreateWorkspaceValues } from "../schemas/workspace.schema";

export function CreateWorkspaceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const create = useCreateWorkspace();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<CreateWorkspaceValues>({
    resolver: zodResolver(createWorkspaceSchema),
    defaultValues: { name: "" },
  });

  const submit = async (values: CreateWorkspaceValues) => {
    try {
      const workspace = await create.mutateAsync(values.name);
      toast.success(`${workspace.name} created. You're now working in it.`);
      reset();
      onOpenChange(false);
      navigate("/dashboard");
    } catch (error) {
      const fieldErrors = getApiFieldErrors(error);
      if (fieldErrors.name) setError("name", { type: "server", message: fieldErrors.name });
      toast.error(workspaceErrorMessage(error));
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (!create.isPending ? onOpenChange(next) : undefined)}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create workspace</DialogTitle>
          <DialogDescription>
            A workspace is a shared space for monitors, incidents and status pages. You will be its
            owner.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="workspace-name">Workspace name</Label>
            <Input
              id="workspace-name"
              placeholder="Acme Platform Team"
              autoComplete="off"
              aria-invalid={Boolean(errors.name)}
              {...register("name")}
            />
            {errors.name ? (
              <p role="alert" className="text-xs text-destructive">
                {errors.name.message}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Choose a name your teammates will recognize.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={create.isPending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? <SpinnerCustom>Creating…</SpinnerCustom> : "Create workspace"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
