import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Circle } from "lucide-react";
import { toast } from "sonner";
import { SpinnerCustom } from "@/components/common/loading-spinner";
import { PasswordInput } from "@/features/auth/components/password-input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import {
  canSubmitPassword,
  mapServerFieldErrors,
  passwordRequirements,
} from "../lib/profile-presentation";
import { useChangePassword } from "../hooks/use-profile";
import { passwordChangeSchema, type PasswordChangeValues } from "../schemas/profile.schema";
import { SaveCheck } from "./save-check";

const emptyValues: PasswordChangeValues = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
};

const fields = ["currentPassword", "newPassword", "confirmPassword"] as const;

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} role="alert" className="text-sm text-destructive">
      {message}
    </p>
  ) : null;
}

export function PasswordForm() {
  const change = useChangePassword();
  const [saved, setSaved] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    control,
    formState: { errors },
  } = useForm<PasswordChangeValues>({
    resolver: zodResolver(passwordChangeSchema),
    defaultValues: emptyValues,
  });
  const values = useWatch({ control });
  const inputs = {
    currentPassword: values.currentPassword ?? "",
    newPassword: values.newPassword ?? "",
    confirmPassword: values.confirmPassword ?? "",
  };
  const requirements = passwordRequirements(inputs);
  const ready = canSubmitPassword(inputs);

  useEffect(() => {
    if (!saved) return;
    const timer = window.setTimeout(() => setSaved(false), 4000);
    return () => window.clearTimeout(timer);
  }, [saved]);

  const submit = async (payload: PasswordChangeValues) => {
    setSaved(false);
    try {
      await change.mutateAsync(payload);
      reset(emptyValues);
      setSaved(true);
      toast.success("Password updated. Other devices were signed out.");
    } catch (error) {
      for (const { field, message } of mapServerFieldErrors(getApiFieldErrors(error), fields)) {
        setError(field, { type: "server", message });
      }
      toast.error(getApiErrorMessage(error));
    }
  };

  return (
    <form onSubmit={handleSubmit(submit)} noValidate className="space-y-5 p-5 sm:p-6">
      <div className="space-y-2">
        <Label htmlFor="current-password">Current password</Label>
        <PasswordInput
          id="current-password"
          autoComplete="current-password"
          aria-invalid={Boolean(errors.currentPassword)}
          aria-describedby="current-password-error"
          {...register("currentPassword")}
        />
        <FieldError id="current-password-error" message={errors.currentPassword?.message} />
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="new-password">New password</Label>
          <PasswordInput
            id="new-password"
            autoComplete="new-password"
            aria-invalid={Boolean(errors.newPassword)}
            aria-describedby="new-password-error password-requirements"
            {...register("newPassword")}
          />
          <FieldError id="new-password-error" message={errors.newPassword?.message} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm-password">Confirm new password</Label>
          <PasswordInput
            id="confirm-password"
            autoComplete="new-password"
            aria-invalid={Boolean(errors.confirmPassword)}
            aria-describedby="confirm-password-error"
            {...register("confirmPassword")}
          />
          <FieldError id="confirm-password-error" message={errors.confirmPassword?.message} />
        </div>
      </div>

      <ul
        id="password-requirements"
        aria-label="Password requirements"
        className="grid gap-2 rounded-md bg-muted/40 p-3 text-sm sm:grid-cols-3"
      >
        {requirements.map((requirement) => (
          <li
            key={requirement.id}
            className={cn(
              "flex items-center gap-2 transition-colors duration-200",
              requirement.met ? "text-emerald-700" : "text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "grid size-4 shrink-0 place-items-center transition-transform duration-200",
                requirement.met && "scale-110",
              )}
              aria-hidden="true"
            >
              {requirement.met ? <Check className="size-4" /> : <Circle className="size-3" />}
            </span>
            <span>
              {requirement.label}
              <span className="sr-only">{requirement.met ? " - met" : " - not met"}</span>
            </span>
          </li>
        ))}
      </ul>

      <div className="flex min-h-10 flex-wrap items-center gap-4">
        <Button type="submit" disabled={!ready || change.isPending}>
          {change.isPending ? <SpinnerCustom>Updating…</SpinnerCustom> : "Update password"}
        </Button>
        {saved ? <SaveCheck label="Password updated" /> : null}
      </div>
      <p className="text-sm text-muted-foreground">
        Changing your password signs you out of your other devices.
      </p>
    </form>
  );
}
