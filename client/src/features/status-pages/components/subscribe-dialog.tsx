import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Mail } from "lucide-react";
import { SpinnerCustom } from "@/components/common/loading-spinner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSubscribe } from "../hooks/use-public-status";
import { subscribeErrorMessage } from "../lib/errors";
import {
  hasSelectedEvent,
  subscribeFormSchema,
  type SubscribeFormValues,
} from "../schemas/status-page.schema";
import type { SubscriberEvents } from "../types/status-page.types";

const eventLabels: { key: keyof SubscriberEvents; label: string }[] = [
  { key: "opened", label: "When an incident is opened" },
  { key: "resolved", label: "When an incident is resolved" },
  { key: "acknowledged", label: "When an incident is acknowledged" },
];

export function SubscribeDialog({
  slug,
  offered,
  disabled,
}: {
  slug: string;
  offered: SubscriberEvents;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const subscribe = useSubscribe(slug);

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<SubscribeFormValues>({
    resolver: zodResolver(subscribeFormSchema),
    defaultValues: {
      email: "",
      opened: offered.opened,
      acknowledged: false,
      resolved: offered.resolved,
    },
  });

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setDone(false);
      setServerError(null);
      reset();
    }
  };

  const submit = handleSubmit(async (values) => {
    setServerError(null);
    if (!hasSelectedEvent(values)) {
      setError("opened", { type: "validation", message: "Select at least one update type." });
      return;
    }
    try {
      await subscribe.mutateAsync({
        email: values.email,
        events: {
          opened: offered.opened && values.opened,
          acknowledged: offered.acknowledged && values.acknowledged,
          resolved: offered.resolved && values.resolved,
        },
      });
      setDone(true);
    } catch (error) {
      setServerError(subscribeErrorMessage(error));
    }
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (!subscribe.isPending ? onOpenChange(next) : undefined)}
    >
      <DialogTrigger asChild>
        <Button variant="outline" disabled={disabled}>
          <Mail className="size-4" /> Subscribe to updates
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Subscribe to updates</DialogTitle>
          <DialogDescription>
            Get an email when incidents happen. We&apos;ll ask you to confirm your address first.
          </DialogDescription>
        </DialogHeader>
        {done ? (
          <div role="status" className="space-y-4">
            <p className="font-medium">Check your email to confirm your subscription.</p>
            <p className="text-sm text-muted-foreground">
              If you don&apos;t see it within a few minutes, check your spam folder. You won&apos;t
              receive any updates until you confirm.
            </p>
            <Button className="w-full" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        ) : (
          <form onSubmit={(event) => void submit(event)} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="sub-email">Email address</Label>
              <Input
                id="sub-email"
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder="you@example.com"
                aria-invalid={Boolean(errors.email)}
                {...register("email")}
              />
              {errors.email ? (
                <p role="alert" className="text-xs text-destructive">
                  {errors.email.message}
                </p>
              ) : null}
            </div>
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">Notify me</legend>
              {eventLabels
                .filter((item) => offered[item.key])
                .map((item) => (
                  <Controller
                    key={item.key}
                    control={control}
                    name={item.key}
                    render={({ field }) => (
                      <label className="flex items-center gap-3 text-sm">
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={(checked) => field.onChange(checked)}
                        />
                        {item.label}
                      </label>
                    )}
                  />
                ))}
              {errors.opened ? (
                <p role="alert" className="text-xs text-destructive">
                  {errors.opened.message}
                </p>
              ) : null}
            </fieldset>
            {serverError ? (
              <p
                role="alert"
                className="rounded-md border border-destructive/40 p-3 text-sm text-destructive"
              >
                {serverError}
              </p>
            ) : null}
            <Button type="submit" className="w-full" disabled={subscribe.isPending}>
              {subscribe.isPending ? <SpinnerCustom>Subscribing…</SpinnerCustom> : "Subscribe"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
