import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PublicLayout, PublicMessage } from "../components/public-layout";
import { PublicSkeleton } from "../components/public-skeleton";
import { PublicStatusScreen } from "../components/public-view";
import { usePreview } from "../hooks/use-status-pages";
import { isNotFound } from "../lib/errors";

export function StatusPagePreviewPage() {
  const { id = "" } = useParams();
  const preview = usePreview(id);

  return (
    <div className="min-h-screen bg-background">
      <div
        role="note"
        className="sticky top-0 z-40 border-b border-amber-600/40 bg-amber-100 px-4 py-2.5 text-sm text-amber-950"
      >
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2">
          <span className="font-semibold">Preview — not public</span>
          <Link
            to={`/status-pages/${id}/edit`}
            className="inline-flex min-h-6 items-center gap-1.5 font-medium underline-offset-4 hover:underline"
          >
            <ArrowLeft className="size-4" aria-hidden="true" /> Back to editor
          </Link>
        </div>
      </div>
      {preview.isLoading ? (
        <PublicLayout>
          <PublicSkeleton label="Loading preview" />
        </PublicLayout>
      ) : preview.isError || !preview.data ? (
        isNotFound(preview.error) ? (
          <PublicMessage title="Status page not found" role="alert" icon="missing">
            <p>This status page doesn&apos;t exist.</p>
          </PublicMessage>
        ) : (
          <PublicMessage title="We couldn't load the preview" role="alert" icon="error">
            <Button variant="outline" className="min-h-11" onClick={() => void preview.refetch()}>
              Try again
            </Button>
          </PublicMessage>
        )
      ) : (
        <PublicStatusScreen
          payload={{ ...preview.data.preview, preview: true }}
          slug={preview.data.preview.page.slug}
          previewIncidents={preview.data.incidents}
          topBarClassName="top-[2.6rem]"
        />
      )}
    </div>
  );
}
