import { Link } from "react-router-dom";
import { Copy, Eye, Globe, MoreHorizontal, Pencil, Trash2, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { SpinnerCustom } from "@/components/common/loading-spinner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDate } from "../lib/status-presentation";
import type { StatusPageSummary } from "../types/status-page.types";
import { PageStatusBadge, PublicStatusBadge } from "./status-badges";

export const copyPublicUrl = async (url: string) => {
  try {
    await navigator.clipboard.writeText(url);
    toast.success("Public URL copied.");
  } catch {
    toast.error("Couldn't copy automatically. Select and copy the URL manually.");
  }
};

export function StatusPageCard({
  page,
  busy,
  canManage = true,
  onPublishToggle,
  onDelete,
}: {
  page: StatusPageSummary;
  busy: boolean;
  canManage?: boolean;
  onPublishToggle: (page: StatusPageSummary) => void;
  onDelete: (page: StatusPageSummary) => void;
}) {
  const published = page.status === "published";
  return (
    <li className="rounded-lg border border-border bg-background p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="min-w-0 text-lg font-semibold tracking-tight break-words">
              <Link
                to={`/status-pages/${page.id}/edit`}
                className="underline-offset-4 hover:underline focus-visible:underline"
              >
                {page.name}
              </Link>
            </h2>
            <PageStatusBadge status={page.status} />
            {published ? <PublicStatusBadge status={page.overallStatus} /> : null}
          </div>
          <p className="text-sm break-all text-muted-foreground">/{page.slug}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {busy ? <SpinnerCustom /> : null}
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Actions for ${page.name}`}
                    disabled={busy}
                  >
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>Actions</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end">
              {canManage ? (
                <DropdownMenuItem asChild>
                  <Link to={`/status-pages/${page.id}/edit`}>
                    <Pencil className="size-4" /> Open editor
                  </Link>
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem asChild>
                <Link to={`/status-pages/${page.id}/preview`}>
                  <Eye className="size-4" /> Preview
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!published}
                onSelect={() => void copyPublicUrl(page.publicUrl)}
              >
                <Copy className="size-4" /> Copy public URL
              </DropdownMenuItem>
              {canManage ? <DropdownMenuSeparator /> : null}
              {canManage ? (
                <DropdownMenuItem onSelect={() => onPublishToggle(page)}>
                  {published ? (
                    <>
                      <EyeOff className="size-4" /> Unpublish
                    </>
                  ) : (
                    <>
                      <Globe className="size-4" /> Publish
                    </>
                  )}
                </DropdownMenuItem>
              ) : null}
              {canManage ? (
                <DropdownMenuItem onSelect={() => onDelete(page)} className="text-destructive">
                  <Trash2 className="size-4" /> Delete
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {page.description ? (
        <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{page.description}</p>
      ) : null}

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-muted-foreground">Services</dt>
          <dd className="font-medium">{page.serviceCount}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Created</dt>
          <dd className="font-medium">{formatDate(page.createdAt)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Updated</dt>
          <dd className="font-medium">{formatDate(page.updatedAt)}</dd>
        </div>
        <div className="col-span-2 min-w-0 sm:col-span-1">
          <dt className="text-xs text-muted-foreground">Public URL</dt>
          <dd className="font-medium break-all">
            {published ? (
              <a
                href={page.publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline-offset-4 hover:underline"
              >
                {page.publicUrl}
              </a>
            ) : (
              <span className="text-muted-foreground">Not public</span>
            )}
          </dd>
        </div>
      </dl>
    </li>
  );
}
