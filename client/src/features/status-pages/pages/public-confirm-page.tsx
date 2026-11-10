import { useEffect, useRef } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { PublicMessage } from "../components/public-layout";
import { useVerifySubscription } from "../hooks/use-public-status";
import { tokenErrorMessage } from "../lib/errors";

const backLink =
  "inline-flex min-h-11 items-center justify-center rounded-full border border-border px-5 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

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
      <PublicMessage title="Confirmation link is incomplete" role="alert" icon="error">
        <p>Open the link from your confirmation email again.</p>
      </PublicMessage>
    );
  }

  if (verify.isError) {
    return (
      <PublicMessage title="We couldn't confirm your subscription" role="alert" icon="error">
        <p>{tokenErrorMessage(verify.error)}</p>
        <Link to={`/status/${slug}`} className={backLink}>
          Back to the status page
        </Link>
      </PublicMessage>
    );
  }

  if (verify.isSuccess) {
    return (
      <PublicMessage title="Subscription confirmed" role="status" icon="success">
        <p>
          You&apos;ll now receive email updates about incidents for{" "}
          <span className="font-medium text-foreground">{verify.data.pageName}</span>. Every email
          includes a link to unsubscribe.
        </p>
        <Link to={`/status/${slug}`} className={backLink}>
          View the status page
        </Link>
      </PublicMessage>
    );
  }

  return (
    <PublicMessage title="Confirming your subscription" role="status" icon="loading">
      <p>Please wait a moment…</p>
    </PublicMessage>
  );
}
