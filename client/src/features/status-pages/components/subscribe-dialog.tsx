import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Bell, Mail } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { useSubscribe } from "../hooks/use-public-status";
import { subscribeErrorMessage } from "../lib/errors";
import {
  hasSelectedEvent,
  subscribeFormSchema,
  type SubscribeFormValues,
} from "../schemas/status-page.schema";
import type { SubscriberEvents } from "../types/status-page.types";

const eventOptions: { key: keyof SubscriberEvents; label: string; hint: string }[] = [
  { key: "opened", label: "Incident opened", hint: "When we detect a problem." },
  { key: "resolved", label: "Incident resolved", hint: "When service is restored." },
  { key: "acknowledged", label: "Incident update", hint: "When we acknowledge an issue." },
];

function SuccessCheck() {
  return (
    <span className="ps-pop mx-auto grid size-16 place-items-center rounded-full border border-emerald-600/30 bg-emerald-600/10 text-emerald-700">
      <svg
        viewBox="0 0 24 24"
        className="size-8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path className="ps-draw" d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </span>
  );
}

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
        <Button size="sm" className="min-h-10 gap-1.5 rounded-full px-4" disabled={disabled}>
          <Bell className="size-4" aria-hidden="true" />
          <span>Subscribe</span>
          <span className="sr-only"> to updates</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        {done ? (
          <div role="status" className="ps-fade space-y-5 py-2 text-center">
            <SuccessCheck />
            <div className="space-y-2">
              <DialogTitle className="text-center text-xl">Check your email</DialogTitle>
              <DialogDescription className="text-center">
                Check your email to confirm your subscription. If you don&apos;t see it within a few
                minutes, look in your spam folder. You won&apos;t receive any updates until you
                confirm.
              </DialogDescription>
            </div>
            <Button className="min-h-11 w-full" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        ) : (
          <>
            <DialogHeader className="items-center gap-3 text-center">
              <span
                aria-hidden="true"
                className="grid size-12 place-items-center rounded-full bg-muted text-foreground"
              >
                <Mail className="size-6" />
              </span>
              <DialogTitle className="text-xl">Subscribe to updates</DialogTitle>
              <DialogDescription>
                Get an email when incidents happen. We&apos;ll ask you to confirm your address
                first.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={(event) => void submit(event)} className="space-y-5" noValidate>
              <div className="space-y-2">
                <Label htmlFor="sub-email">1. Your email address</Label>
                <Input
                  id="sub-email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="you@example.com"
                  className="min-h-11"
                  aria-invalid={Boolean(errors.email)}
                  {...register("email")}
                />
                {errors.email ? (
                  <p role="alert" className="ps-fade text-xs text-destructive">
                    {errors.email.message}
                  </p>
                ) : null}
              </div>
              <fieldset className="space-y-2">
                <legend className="mb-2 text-sm font-medium">2. What should we send?</legend>
                {eventOptions
                  .filter((item) => offered[item.key])
                  .map((item) => (
                    <Controller
                      key={item.key}
                      control={control}
                      name={item.key}
                      render={({ field }) => (
                        <label
                          className={cn(
                            "flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors duration-200",
                            field.value
                              ? "border-foreground bg-muted/60"
                              : "border-border hover:bg-muted/40",
                          )}
                        >
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={(checked) => field.onChange(checked)}
                          />
                          <span className="min-w-0">
                            <span className="block text-sm font-medium">{item.label}</span>
                            <span className="block text-xs text-muted-foreground">{item.hint}</span>
                          </span>
                        </label>
                      )}
                    />
                  ))}
                {errors.opened ? (
                  <p role="alert" className="ps-fade text-xs text-destructive">
                    {errors.opened.message}
                  </p>
                ) : null}
              </fieldset>
              {serverError ? (
                <p
                  role="alert"
                  className="ps-fade rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
                >
                  {serverError}
                </p>
              ) : null}
              <Button type="submit" className="min-h-11 w-full" disabled={subscribe.isPending}>
                {subscribe.isPending ? <SpinnerCustom>Subscribing…</SpinnerCustom> : "Subscribe"}
              </Button>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
