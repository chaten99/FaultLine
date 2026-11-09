import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PublicLayout } from "../components/public-layout";
import { PublicStatusView } from "../components/public-view";
import { usePreview } from "../hooks/use-status-pages";
import { isNotFound } from "../lib/errors";

export function StatusPagePreviewPage() {
  const { id = "" } = useParams();
  const preview = usePreview(id);

  return (
    <div className="min-h-screen bg-background">
      <div
        role="note"
        className="sticky top-0 z-30 border-b border-amber-600/40 bg-amber-100 px-4 py-2.5 text-sm text-amber-950"
      >
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2">
          <span className="font-semibold">Preview — not public</span>
          <Link
            to={`/status-pages/${id}/edit`}
            className="inline-flex items-center gap-1.5 font-medium underline-offset-4 hover:underline"
          >
            <ArrowLeft className="size-4" aria-hidden="true" /> Back to editor
          </Link>
        </div>
      </div>
      {preview.isLoading ? (
        <PublicLayout>
          <div className="space-y-6" aria-busy="true" aria-label="Loading preview">
            <Skeleton className="h-9 w-2/3" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        </PublicLayout>
      ) : preview.isError || !preview.data ? (
        <PublicLayout>
          <div role="alert" className="space-y-4 py-16 text-center">
            <p className="font-medium">
              {isNotFound(preview.error)
                ? "This status page doesn't exist."
                : "We couldn't load the preview."}
            </p>
            {!isNotFound(preview.error) ? (
              <Button variant="outline" onClick={() => void preview.refetch()}>
                Try again
              </Button>
            ) : null}
          </div>
        </PublicLayout>
      ) : (
        <PublicLayout>
          <PublicStatusView
            payload={{ ...preview.data.preview, preview: true }}
            slug={preview.data.preview.page.slug}
            previewIncidents={preview.data.incidents}
          />
        </PublicLayout>
      )}
    </div>
  );
}
