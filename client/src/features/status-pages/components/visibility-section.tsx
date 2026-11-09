import { Copy, ExternalLink, Eye } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { SpinnerCustom } from "@/components/common/loading-spinner";
import { Button } from "@/components/ui/button";
import { usePublishToggle } from "../hooks/use-status-pages";
import { managementErrorMessage } from "../lib/errors";
import { pageStatusPresentation } from "../lib/status-presentation";
import type { StatusPageDetail } from "../types/status-page.types";
import { EditorSection } from "./editor-section";
import { PageStatusBadge } from "./status-badges";
import { copyPublicUrl } from "./status-page-card";

export function VisibilitySection({ page }: { page: StatusPageDetail }) {
  const publish = usePublishToggle();
  const published = page.status === "published";

  const toggle = () => {
    publish.mutate(
      { id: page.id, publish: !published },
      {
        onSuccess: () =>
          toast.success(published ? "Page unpublished. It is private again." : "Page published."),
        onError: (error) => toast.error(managementErrorMessage(error)),
      },
    );
  };

  return (
    <EditorSection
      title="Page visibility"
      description="Control whether visitors can see this page."
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <PageStatusBadge status={page.status} />
          <p className="text-sm text-muted-foreground">
            {pageStatusPresentation[page.status].description}
          </p>
        </div>

        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Public URL</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <code className="min-w-0 flex-1 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm break-all">
              {page.publicUrl}
            </code>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!published}
                onClick={() => void copyPublicUrl(page.publicUrl)}
              >
                <Copy className="size-4" /> Copy
              </Button>
              {published ? (
                <Button variant="outline" size="sm" asChild>
                  <a href={page.publicUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="size-4" /> Open
                  </a>
                </Button>
              ) : null}
            </div>
          </div>
          {!published ? (
            <p className="text-xs text-muted-foreground">
              This address does not work until you publish. Drafts and unpublished pages are never
              visible to visitors, even if they know the URL.
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant={published ? "outline" : "default"}
            onClick={toggle}
            disabled={publish.isPending}
          >
            {publish.isPending ? (
              <SpinnerCustom>{published ? "Unpublishing…" : "Publishing…"}</SpinnerCustom>
            ) : published ? (
              "Unpublish page"
            ) : (
              "Publish page"
            )}
          </Button>
          <Button variant="outline" asChild>
            <Link to={`/status-pages/${page.id}/preview`}>
              <Eye className="size-4" /> Preview
            </Link>
          </Button>
        </div>
      </div>
    </EditorSection>
  );
}
