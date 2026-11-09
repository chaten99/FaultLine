import { useCallback, useState } from "react";
import { useParams } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { PublicLayout, PublicMessage } from "../components/public-layout";
import { PublicStatusView } from "../components/public-view";
import { usePublicStatus } from "../hooks/use-public-status";
import { isNotFound } from "../lib/errors";
import { usePublicStatusSocket } from "../realtime/use-public-status-socket";

export function PublicStatusPage() {
  const { slug = "" } = useParams();
  const status = usePublicStatus(slug);
  const [unpublished, setUnpublished] = useState(false);
  const handleUnpublished = useCallback(() => setUnpublished(true), []);
  usePublicStatusSocket(slug, handleUnpublished, status.isSuccess && !unpublished);

  if (unpublished || (status.isError && isNotFound(status.error))) {
    return (
      <PublicMessage title="Status page not found" role="alert">
        <p>This status page doesn&apos;t exist or isn&apos;t available right now.</p>
      </PublicMessage>
    );
  }

  if (status.isLoading) {
    return (
      <PublicLayout>
        <div className="space-y-6" aria-busy="true" aria-label="Loading status">
          <Skeleton className="h-9 w-2/3" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </PublicLayout>
    );
  }

  if (status.isError || !status.data) {
    return (
      <PublicMessage title="Status is temporarily unavailable" role="alert">
        <p>We couldn&apos;t load this page. Please try again in a moment.</p>
        <Button variant="outline" onClick={() => void status.refetch()}>
          Try again
        </Button>
      </PublicMessage>
    );
  }

  return (
    <PublicLayout>
      <PublicStatusView payload={status.data} slug={slug} />
    </PublicLayout>
  );
}
