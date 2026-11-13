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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getApiFieldErrors } from "@/lib/api-error";
import { useCreateInvitation } from "../hooks/use-workspaces";
import { workspaceErrorMessage } from "../lib/messages";
import { assignableRoles, roleDescriptions, roleLabels } from "../lib/permissions";
import { inviteMemberSchema, type InviteMemberValues } from "../schemas/workspace.schema";

export function InviteMemberDialog({
  workspaceId,
  open,
  onOpenChange,
}: {
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const create = useCreateInvitation(workspaceId);
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    setError,
    formState: { errors },
  } = useForm<InviteMemberValues>({
    resolver: zodResolver(inviteMemberSchema),
    defaultValues: { email: "", role: "member", message: "" },
  });
  const role = watch("role");

  const close = (next: boolean) => {
    if (create.isPending) return;
    if (!next) reset();
    onOpenChange(next);
  };

  const submit = async (values: InviteMemberValues) => {
    try {
      await create.mutateAsync({
        email: values.email,
        role: values.role,
        ...(values.message ? { message: values.message } : {}),
      });
      toast.success(`Invitation sent to ${values.email}.`);
      reset();
      onOpenChange(false);
    } catch (error) {
      const fields = getApiFieldErrors(error);
      if (fields.email) setError("email", { type: "server", message: fields.email });
      toast.error(workspaceErrorMessage(error));
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a teammate</DialogTitle>
          <DialogDescription>
            They will receive an email with a link to join this workspace. Invitations expire after
            a few days.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="invite-email">Email address</Label>
            <Input
              id="invite-email"
              type="email"
              autoComplete="off"
              placeholder="teammate@company.com"
              aria-invalid={Boolean(errors.email)}
              {...register("email")}
            />
            {errors.email ? (
              <p role="alert" className="text-xs text-destructive">
                {errors.email.message}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="invite-role">Role</Label>
            <Select
              value={role}
              onValueChange={(value) =>
                setValue("role", value as InviteMemberValues["role"], { shouldValidate: true })
              }
            >
              <SelectTrigger id="invite-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {assignableRoles.map((option) => (
                  <SelectItem key={option} value={option}>
                    {roleLabels[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{roleDescriptions[role]}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="invite-message">
              Message <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <textarea
              id="invite-message"
              rows={3}
              maxLength={500}
              placeholder="Add a short note for your teammate"
              className="field min-h-20 w-full resize-y"
              aria-invalid={Boolean(errors.message)}
              {...register("message")}
            />
            {errors.message ? (
              <p role="alert" className="text-xs text-destructive">
                {errors.message.message}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={create.isPending}
              onClick={() => close(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? <SpinnerCustom>Sending…</SpinnerCustom> : "Send invitation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
