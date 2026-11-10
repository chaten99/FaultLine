import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Eye } from "lucide-react";
import { toast } from "sonner";
import { SpinnerCustom } from "@/components/common/loading-spinner";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageStatusBadge, PublicStatusBadge } from "../components/status-badges";
import { ServicesSection } from "../components/services-section";
import { StatusPageForm } from "../components/status-page-form";
import { SubscriberSettingsSection } from "../components/subscriber-settings-section";
import { VisibilitySection } from "../components/visibility-section";
import { usePublishToggle, useStatusPage, useUpdateStatusPage } from "../hooks/use-status-pages";
import { isNotFound, managementErrorMessage } from "../lib/errors";
import { originOf } from "../lib/slug";
import type { StatusPageFormValues } from "../schemas/status-page.schema";

export function StatusPageEditorPage() {
  const { id = "" } = useParams();
  const page = useStatusPage(id);
  const update = useUpdateStatusPage();
  const publish = usePublishToggle();
  const data = page.data;

  const initial = useMemo<Partial<StatusPageFormValues> | undefined>(
    () =>
      data
        ? {
            name: data.name,
            slug: data.slug,
            description: data.description,
            companyName: data.branding.companyName,
            logoUrl: data.branding.logoUrl ?? "",
          }
        : undefined,
    [data],
  );

  const save = async (values: StatusPageFormValues) => {
    try {
      await update.mutateAsync({
        id,
        payload: {
          name: values.name,
          slug: values.slug,
          description: values.description,
          branding: {
            companyName: values.companyName,
            logoUrl: values.logoUrl ? values.logoUrl : null,
          },
        },
      });
      toast.success("Changes saved.");
    } catch (error) {
      toast.error(managementErrorMessage(error));
      throw error;
    }
  };

  const togglePublish = () => {
    if (!data) return;
    const next = data.status !== "published";
    publish.mutate(
      { id, publish: next },
      {
        onSuccess: () => toast.success(next ? "Page published." : "Page unpublished."),
        onError: (error) => toast.error(managementErrorMessage(error)),
      },
    );
  };

  return (
    <DashboardLayout>
      <div className="min-w-0 space-y-8">
        <Link
          to="/status-pages"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" /> All status pages
        </Link>

        {page.isLoading ? (
          <div className="space-y-4" aria-busy="true" aria-label="Loading status page">
            <Skeleton className="h-9 w-1/2" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : page.isError || !data ? (
          <div role="alert" className="rounded-lg border border-border p-8 text-center">
            <p className="font-medium">
              {isNotFound(page.error)
                ? "This status page doesn't exist."
                : "We couldn't load this status page."}
            </p>
            {!isNotFound(page.error) ? (
              <Button variant="outline" className="mt-4" onClick={() => void page.refetch()}>
                Try again
              </Button>
            ) : null}
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-3xl font-semibold tracking-tight break-words">{data.name}</h1>
                  <PageStatusBadge status={data.status} />
                  {data.status === "published" ? (
                    <PublicStatusBadge status={data.overallStatus} />
                  ) : null}
                </div>
                <p className="text-sm break-all text-muted-foreground">{data.publicUrl}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" asChild>
                  <Link to={`/status-pages/${data.id}/preview`}>
                    <Eye className="size-4" /> Preview
                  </Link>
                </Button>
                <Button onClick={togglePublish} disabled={publish.isPending}>
                  {publish.isPending ? (
                    <SpinnerCustom>Working…</SpinnerCustom>
                  ) : data.status === "published" ? (
                    "Unpublish"
                  ) : (
                    "Publish"
                  )}
                </Button>
              </div>
            </div>

            <StatusPageForm
              key={data.id}
              mode="edit"
              grouped
              initial={initial}
              origin={originOf(data.publicUrl, window.location.origin)}
              excludeId={data.id}
              busy={update.isPending}
              submitLabel="Save changes"
              onSubmit={save}
            />
            <ServicesSection pageId={data.id} services={data.services} />
            <VisibilitySection page={data} />
            <SubscriberSettingsSection page={data} />
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
