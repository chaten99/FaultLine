import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { SpinnerCustom } from "@/components/common/loading-spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getApiFieldErrors } from "@/lib/api-error";
import { useSlugCheck } from "../hooks/use-status-pages";
import { buildPublicUrl, slugify, validateSlug } from "../lib/slug";
import {
  isSafeLogoUrl,
  statusPageFormSchema,
  type StatusPageFormValues,
} from "../schemas/status-page.schema";
import { EditorSection } from "./editor-section";

const FieldError = ({ id, message }: { id: string; message?: string }) =>
  message ? (
    <p id={id} role="alert" className="text-xs text-destructive">
      {message}
    </p>
  ) : null;

export type StatusPageFormProps = {
  initial?: Partial<StatusPageFormValues>;
  mode: "create" | "edit";
  origin: string;
  excludeId?: string;
  busy: boolean;
  submitLabel: string;
  grouped?: boolean;
  onCancel?: () => void;
  onSubmit: (values: StatusPageFormValues) => Promise<void>;
};

const emptyValues: StatusPageFormValues = {
  name: "",
  slug: "",
  description: "",
  companyName: "",
  logoUrl: "",
};

export function StatusPageForm({
  initial,
  mode,
  origin,
  excludeId,
  busy,
  submitLabel,
  grouped = false,
  onCancel,
  onSubmit,
}: StatusPageFormProps) {
  const defaults = useMemo(() => ({ ...emptyValues, ...initial }), [initial]);
  const [slugEdited, setSlugEdited] = useState(mode === "edit");
  const [logoFailed, setLogoFailed] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    reset,
    watch,
    formState: { errors, isDirty },
  } = useForm<StatusPageFormValues>({
    resolver: zodResolver(statusPageFormSchema),
    defaultValues: defaults,
  });

  useEffect(() => {
    reset(defaults);
  }, [defaults, reset]);

  const name = watch("name");
  const slug = watch("slug");
  const logoUrl = watch("logoUrl");
  const slugProblem = slug ? validateSlug(slug) : null;
  const slugCheck = useSlugCheck(slug, Boolean(slug) && !slugProblem, excludeId);
  const unchangedSlug = mode === "edit" && slug === initial?.slug;

  const slugRegister = register("slug", {
    onChange: () => setSlugEdited(true),
  });
  const nameRegister = register("name", {
    onChange: (event) => {
      if (!slugEdited) {
        setValue("slug", slugify(event.target.value), { shouldValidate: false });
      }
    },
  });

  const submit = handleSubmit(async (values) => {
    try {
      await onSubmit(values);
    } catch (error) {
      for (const [field, message] of Object.entries(getApiFieldErrors(error))) {
        const mapped = field === "branding.logoUrl" ? "logoUrl" : field;
        if (mapped in emptyValues) {
          setError(mapped as keyof StatusPageFormValues, { type: "server", message });
        }
      }
    }
  });

  const slugState = (() => {
    if (!slug) return null;
    if (slugProblem) return { tone: "error", text: slugProblem };
    if (unchangedSlug) return null;
    if (slugCheck.isFetching) return { tone: "info", text: "Checking availability…" };
    if (slugCheck.data && slugCheck.data.slug === slug) {
      if (!slugCheck.data.valid)
        return { tone: "error", text: slugCheck.data.message ?? "Invalid URL." };
      if (!slugCheck.data.available) {
        return { tone: "error", text: slugCheck.data.message ?? "That URL is already taken." };
      }
      return { tone: "ok", text: "This URL is available." };
    }
    return null;
  })();

  const showLogo = isSafeLogoUrl(logoUrl ?? "") && !logoFailed;

  const general = (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="sp-name">Page name</Label>
        <Input
          id="sp-name"
          placeholder="Acme Service Status"
          autoComplete="off"
          aria-invalid={Boolean(errors.name)}
          aria-describedby="sp-name-help sp-name-error"
          {...nameRegister}
        />
        <p id="sp-name-help" className="text-xs text-muted-foreground">
          Choose a name your customers will recognize.
        </p>
        <FieldError id="sp-name-error" message={errors.name?.message} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="sp-slug">URL slug</Label>
        <Input
          id="sp-slug"
          placeholder="acme-status"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={Boolean(errors.slug) || slugState?.tone === "error"}
          aria-describedby="sp-slug-url sp-slug-state sp-slug-error"
          {...slugRegister}
        />
        <p id="sp-slug-url" className="text-xs break-all text-muted-foreground">
          {buildPublicUrl(origin, slug)}
        </p>
        {slugState ? (
          <p
            id="sp-slug-state"
            role={slugState.tone === "error" ? "alert" : "status"}
            className={
              slugState.tone === "error"
                ? "text-xs text-destructive"
                : slugState.tone === "ok"
                  ? "text-xs text-emerald-700"
                  : "text-xs text-muted-foreground"
            }
          >
            {slugState.text}
          </p>
        ) : null}
        <FieldError id="sp-slug-error" message={errors.slug?.message} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="sp-description">Description</Label>
        <textarea
          id="sp-description"
          rows={3}
          maxLength={300}
          placeholder="Live status for Acme's website, API and dashboard."
          aria-invalid={Boolean(errors.description)}
          aria-describedby="sp-description-help sp-description-error"
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          {...register("description")}
        />
        <p id="sp-description-help" className="text-xs text-muted-foreground">
          Optional. Explain which services this page covers.
        </p>
        <FieldError id="sp-description-error" message={errors.description?.message} />
      </div>
    </div>
  );

  const branding = (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="sp-company">Company or product name</Label>
        <Input
          id="sp-company"
          placeholder={name || "Acme"}
          autoComplete="off"
          aria-invalid={Boolean(errors.companyName)}
          {...register("companyName")}
        />
        <FieldError id="sp-company-error" message={errors.companyName?.message} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="sp-logo">Logo URL</Label>
        <Input
          id="sp-logo"
          type="url"
          inputMode="url"
          placeholder="https://example.com/logo.png"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={Boolean(errors.logoUrl)}
          aria-describedby="sp-logo-help sp-logo-error"
          {...register("logoUrl", { onChange: () => setLogoFailed(false) })}
        />
        <p id="sp-logo-help" className="text-xs text-muted-foreground">
          Optional. Use a public https:// image. It is loaded by your visitors' browsers.
        </p>
        <FieldError id="sp-logo-error" message={errors.logoUrl?.message} />
        {showLogo ? (
          <div className="flex items-center gap-3 rounded-md border border-border p-3">
            <img
              src={logoUrl}
              alt=""
              referrerPolicy="no-referrer"
              onError={() => setLogoFailed(true)}
              className="h-10 max-w-40 object-contain"
            />
            <span className="text-xs text-muted-foreground">Logo preview</span>
          </div>
        ) : null}
        {logoFailed ? (
          <p role="status" className="text-xs text-muted-foreground">
            The image could not be loaded. Check the URL.
          </p>
        ) : null}
      </div>
    </div>
  );

  const slugBlocked = slugState?.tone === "error";

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-5" noValidate>
      {grouped ? (
        <>
          <EditorSection
            title="General information"
            description="Name, public address and summary."
          >
            {general}
          </EditorSection>
          <EditorSection
            title="Branding"
            description="How your company appears at the top of the public page."
          >
            {branding}
          </EditorSection>
        </>
      ) : (
        <>
          {general}
          <div className="space-y-3">
            <p className="text-sm font-semibold">Branding</p>
            {branding}
          </div>
        </>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" disabled={busy || slugBlocked || (mode === "edit" && !isDirty)}>
          {busy ? <SpinnerCustom>Saving…</SpinnerCustom> : submitLabel}
        </Button>
      </div>
    </form>
  );
}
