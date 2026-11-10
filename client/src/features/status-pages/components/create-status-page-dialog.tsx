import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCreateStatusPage } from "../hooks/use-status-pages";
import { managementErrorMessage } from "../lib/errors";
import type { StatusPageFormValues } from "../schemas/status-page.schema";
import { StatusPageForm } from "./status-page-form";

export function CreateStatusPageDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const create = useCreateStatusPage();

  const submit = async (values: StatusPageFormValues) => {
    try {
      const page = await create.mutateAsync({
        name: values.name,
        slug: values.slug,
        description: values.description,
        branding: {
          companyName: values.companyName,
          logoUrl: values.logoUrl ? values.logoUrl : null,
        },
      });
      toast.success(`${page.name} created as a draft.`);
      onOpenChange(false);
      navigate(`/status-pages/${page.id}/edit`);
    } catch (error) {
      toast.error(managementErrorMessage(error));
      throw error;
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (!create.isPending ? onOpenChange(next) : undefined)}
    >
      <DialogContent
        onEscapeKeyDown={(event) => create.isPending && event.preventDefault()}
        onInteractOutside={(event) => create.isPending && event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Create status page</DialogTitle>
          <DialogDescription>
            Pages start as private drafts. You choose when to publish them.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <StatusPageForm
            mode="create"
            origin={window.location.origin}
            busy={create.isPending}
            submitLabel="Create status page"
            onCancel={() => onOpenChange(false)}
            onSubmit={submit}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
