import { Link, useParams, useSearchParams } from "react-router-dom";
import { SpinnerCustom } from "@/components/common/loading-spinner";
import { Button } from "@/components/ui/button";
import { PublicMessage } from "../components/public-layout";
import { useConfirmUnsubscribe, useUnsubscribeInfo } from "../hooks/use-public-status";
import { tokenErrorMessage } from "../lib/errors";

const backLink =
  "inline-flex min-h-11 items-center justify-center rounded-full border border-border px-5 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

export function PublicUnsubscribePage() {
  const { slug = "" } = useParams();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const info = useUnsubscribeInfo(slug, token);
  const confirm = useConfirmUnsubscribe(slug);

  if (!token) {
    return (
      <PublicMessage title="Unsubscribe link is incomplete" role="alert" icon="error">
        <p>Open the unsubscribe link from one of our emails again.</p>
      </PublicMessage>
    );
  }

  if (info.isLoading) {
    return (
      <PublicMessage title="Checking your link" role="status" icon="loading">
        <p>Please wait a moment…</p>
      </PublicMessage>
    );
  }

  if (info.isError || !info.data) {
    return (
      <PublicMessage title="We couldn't use this link" role="alert" icon="error">
        <p>{tokenErrorMessage(info.error)}</p>
      </PublicMessage>
    );
  }

  if (confirm.isSuccess || info.data.alreadyUnsubscribed) {
    return (
      <PublicMessage title="You're unsubscribed" role="status" icon="success">
        <p>
          You will no longer receive email updates for{" "}
          <span className="font-medium text-foreground">
            {confirm.data?.pageName ?? info.data.pageName}
          </span>
          .
        </p>
        <Link to={`/status/${slug}`} className={backLink}>
          View the status page
        </Link>
      </PublicMessage>
    );
  }

  return (
    <PublicMessage title="Unsubscribe from updates" icon="info">
      <p>
        Stop email updates for{" "}
        <span className="font-medium text-foreground">{info.data.pageName}</span> sent to{" "}
        <span className="font-medium break-all text-foreground">{info.data.emailMasked}</span>?
      </p>
      {confirm.isError ? (
        <p role="alert" className="ps-fade text-destructive">
          {tokenErrorMessage(confirm.error)}
        </p>
      ) : null}
      <div className="flex flex-col gap-2">
        <Button
          className="min-h-11 w-full"
          onClick={() => confirm.mutate(token)}
          disabled={confirm.isPending}
        >
          {confirm.isPending ? <SpinnerCustom>Unsubscribing…</SpinnerCustom> : "Unsubscribe"}
        </Button>
        <Link to={`/status/${slug}`} className={backLink}>
          Keep my subscription
        </Link>
      </div>
    </PublicMessage>
  );
}
