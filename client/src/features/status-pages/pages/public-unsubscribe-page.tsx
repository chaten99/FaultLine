import { Link, useParams, useSearchParams } from "react-router-dom";
import { SpinnerCustom } from "@/components/common/loading-spinner";
import { Button } from "@/components/ui/button";
import { PublicMessage } from "../components/public-layout";
import { useConfirmUnsubscribe, useUnsubscribeInfo } from "../hooks/use-public-status";
import { tokenErrorMessage } from "../lib/errors";

export function PublicUnsubscribePage() {
  const { slug = "" } = useParams();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const info = useUnsubscribeInfo(slug, token);
  const confirm = useConfirmUnsubscribe(slug);

  if (!token) {
    return (
      <PublicMessage title="Unsubscribe link is incomplete" role="alert">
        <p>Open the unsubscribe link from one of our emails again.</p>
      </PublicMessage>
    );
  }

  if (info.isLoading) {
    return (
      <PublicMessage title="Checking your link" role="status">
        <SpinnerCustom className="justify-center">Please wait…</SpinnerCustom>
      </PublicMessage>
    );
  }

  if (info.isError || !info.data) {
    return (
      <PublicMessage title="We couldn't use this link" role="alert">
        <p>{tokenErrorMessage(info.error)}</p>
      </PublicMessage>
    );
  }

  if (confirm.isSuccess || info.data.alreadyUnsubscribed) {
    return (
      <PublicMessage title="You're unsubscribed" role="status">
        <p>
          You will no longer receive email updates for{" "}
          <span className="font-medium text-foreground">
            {confirm.data?.pageName ?? info.data.pageName}
          </span>
          .
        </p>
        <Link
          to={`/status/${slug}`}
          className="font-medium text-foreground underline underline-offset-4"
        >
          View the status page
        </Link>
      </PublicMessage>
    );
  }

  return (
    <PublicMessage title="Unsubscribe from updates">
      <p>
        Stop email updates for{" "}
        <span className="font-medium text-foreground">{info.data.pageName}</span> sent to{" "}
        <span className="font-medium break-all text-foreground">{info.data.emailMasked}</span>?
      </p>
      {confirm.isError ? (
        <p role="alert" className="text-destructive">
          {tokenErrorMessage(confirm.error)}
        </p>
      ) : null}
      <Button className="w-full" onClick={() => confirm.mutate(token)} disabled={confirm.isPending}>
        {confirm.isPending ? <SpinnerCustom>Unsubscribing…</SpinnerCustom> : "Unsubscribe"}
      </Button>
    </PublicMessage>
  );
}
