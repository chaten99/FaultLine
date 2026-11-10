import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { SpinnerCustom } from "@/components/common/loading-spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/api-error";
import { mapServerFieldErrors } from "../lib/profile-presentation";
import { useUpdateProfile } from "../hooks/use-profile";
import { profileNameSchema, type ProfileNameValues } from "../schemas/profile.schema";
import type { ProfileUser } from "../types/profile.types";
import { SaveCheck } from "./save-check";

interface PersonalInfoFormProps {
  user: ProfileUser | undefined;
  isLoading: boolean;
}

export function PersonalInfoForm({ user, isLoading }: PersonalInfoFormProps) {
  const update = useUpdateProfile();
  const [saved, setSaved] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty },
  } = useForm<ProfileNameValues>({
    resolver: zodResolver(profileNameSchema),
    values: { name: user?.name ?? "" },
  });

  useEffect(() => {
    if (!saved) return;
    const timer = window.setTimeout(() => setSaved(false), 3000);
    return () => window.clearTimeout(timer);
  }, [saved]);

  if (isLoading || !user) {
    return (
      <div
        className="space-y-5 p-5 sm:p-6"
        aria-busy="true"
        aria-label="Loading personal information"
      >
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-32" />
      </div>
    );
  }

  const submit = async (values: ProfileNameValues) => {
    setSaved(false);
    try {
      const next = await update.mutateAsync(values.name ?? "");
      reset({ name: next.name });
      setSaved(true);
      toast.success("Profile updated.");
    } catch (error) {
      for (const { field, message } of mapServerFieldErrors(getApiFieldErrors(error), ["name"])) {
        setError(field, { type: "server", message });
      }
      toast.error(getApiErrorMessage(error));
    }
  };

  return (
    <form onSubmit={handleSubmit(submit)} noValidate className="space-y-5 p-5 sm:p-6">
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="profile-name">Full name</Label>
          <Input
            id="profile-name"
            autoComplete="name"
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? "profile-name-error" : "profile-name-help"}
            {...register("name")}
          />
          {errors.name ? (
            <p id="profile-name-error" role="alert" className="text-sm text-destructive">
              {errors.name.message}
            </p>
          ) : (
            <p id="profile-name-help" className="text-sm text-muted-foreground">
              This name appears in your dashboard and on shared pages.
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="profile-email">Email address</Label>
          <Input
            id="profile-email"
            value={user.email}
            readOnly
            aria-describedby="profile-email-help"
            className="bg-muted/50 text-muted-foreground"
          />
          <p id="profile-email-help" className="text-sm text-muted-foreground">
            Email changes aren't supported yet.
          </p>
        </div>
      </div>
      <div className="flex min-h-10 flex-wrap items-center gap-4">
        <Button type="submit" disabled={!isDirty || update.isPending}>
          {update.isPending ? <SpinnerCustom>Saving…</SpinnerCustom> : "Save changes"}
        </Button>
        {isDirty && !update.isPending ? (
          <Button type="button" variant="ghost" onClick={() => reset({ name: user.name })}>
            Discard
          </Button>
        ) : null}
        {saved ? <SaveCheck label="Saved" /> : null}
      </div>
    </form>
  );
}
