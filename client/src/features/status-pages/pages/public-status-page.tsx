import { useCallback, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { PublicLayout, PublicMessage } from "../components/public-layout";
import { PublicSkeleton } from "../components/public-skeleton";
import { PublicStatusScreen } from "../components/public-view";
import { usePublicStatus } from "../hooks/use-public-status";
import { isNotFound } from "../lib/errors";
import { usePublicStatusSocket } from "../realtime/use-public-status-socket";

export function PublicStatusPage() {
  const { slug = "" } = useParams();
  const status = usePublicStatus(slug);
  const [unpublished, setUnpublished] = useState(false);
  const handleUnpublished = useCallback(() => setUnpublished(true), []);
  const connection = usePublicStatusSocket(
    slug,
    handleUnpublished,
    status.isSuccess && !unpublished,
  );

  if (unpublished || (status.isError && isNotFound(status.error))) {
    return (
      <PublicMessage title="Status page not found" role="alert" icon="missing">
        <p>This status page doesn&apos;t exist or isn&apos;t available right now.</p>
      </PublicMessage>
    );
  }

  if (status.isLoading) {
    return (
      <PublicLayout>
        <PublicSkeleton />
      </PublicLayout>
    );
  }

  if (status.isError || !status.data) {
    return (
      <PublicMessage title="Status is temporarily unavailable" role="alert" icon="error">
        <p>We couldn&apos;t load this page. Please try again in a moment.</p>
        <Button variant="outline" className="min-h-11" onClick={() => void status.refetch()}>
          Try again
        </Button>
      </PublicMessage>
    );
  }

  return <PublicStatusScreen payload={status.data} slug={slug} connection={connection} />;
}
