import { useEffect, useRef } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { SpinnerCustom } from "@/components/common/loading-spinner";
import { PublicMessage } from "../components/public-layout";
import { useVerifySubscription } from "../hooks/use-public-status";
import { tokenErrorMessage } from "../lib/errors";

export function PublicConfirmPage() {
  const { slug = "" } = useParams();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const verify = useVerifySubscription(slug);
  const started = useRef<string | null>(null);

  useEffect(() => {
    if (!token || started.current === token) return;
    started.current = token;
    verify.mutate(token);
  }, [token, verify]);

  if (!token) {
    return (
      <PublicMessage title="Confirmation link is incomplete" role="alert">
        <p>Open the link from your confirmation email again.</p>
      </PublicMessage>
    );
  }

  if (verify.isError) {
    return (
      <PublicMessage title="We couldn't confirm your subscription" role="alert">
        <p>{tokenErrorMessage(verify.error)}</p>
        <Link
          to={`/status/${slug}`}
          className="font-medium text-foreground underline underline-offset-4"
        >
          Back to the status page
        </Link>
      </PublicMessage>
    );
  }

  if (verify.isSuccess) {
    return (
      <PublicMessage title="Subscription confirmed" role="status">
        <p>
          You&apos;ll now receive email updates about incidents for{" "}
          <span className="font-medium text-foreground">{verify.data.pageName}</span>. Every email
          includes a link to unsubscribe.
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
    <PublicMessage title="Confirming your subscription" role="status">
      <SpinnerCustom className="justify-center">Please wait…</SpinnerCustom>
    </PublicMessage>
  );
}
