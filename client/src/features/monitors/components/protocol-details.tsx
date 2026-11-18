import type { ProtocolDetails } from "../types-advanced";
export function ProtocolDetailsView({ details }: { details?: ProtocolDetails }) {
  if (!details) return null;
  const rows: Array<[string, string | number | boolean | undefined]> = [
    ["Request method", details.method],
    ["Destination", details.destination],
    ["Authentication", details.authType],
    ["Expected HTTP statuses", details.expectedStatusCodes?.join(", ")],
    ["Hostname", details.hostname],
    ["Certificate issuer", details.issuer],
    ["Certificate subject", details.subject],
    ["Alternative names", details.subjectAltNames?.join(", ")],
    ["Certificate valid", details.certificateValid],
    ["Hostname valid", details.hostnameValid],
    ["Valid from", details.validFrom ? new Date(details.validFrom).toLocaleString() : undefined],
    [
      "Certificate expiry",
      details.certificateExpiresAt
        ? new Date(details.certificateExpiresAt).toLocaleString()
        : undefined,
    ],
    ["Days remaining", details.daysRemaining],
    ["DNS record type", details.recordType],
    ["Resolved records", details.values?.join("; ")],
    ["Expected records", details.expectedValues?.join("; ")],
    ["Registration provider", details.provider],
    [
      "Registration expiry",
      details.expiryDate ? new Date(details.expiryDate).toLocaleString() : undefined,
    ],
    [
      "Last successful lookup",
      details.lastSuccessfulLookup
        ? new Date(details.lastSuccessfulLookup).toLocaleString()
        : undefined,
    ],
    ["Classification", details.classification],
  ];
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">Protocol result</h3>
      <dl className="rounded-lg border divide-y">
        {rows
          .filter(([, value]) => value !== undefined && value !== "")
          .map(([label, value]) => (
            <div key={label} className="grid gap-1 p-3 sm:grid-cols-2 text-xs">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="break-words font-mono">
                {typeof value === "boolean" ? (value ? "Yes" : "No") : value}
              </dd>
            </div>
          ))}
      </dl>
      {details.assertionResults?.map((r) => (
        <p key={r.index} className={r.passed ? "text-xs" : "text-xs text-destructive"}>
          {r.index === -1 ? "Text assertion" : "JSON assertion " + (r.index + 1)}: {r.message}
        </p>
      ))}
    </section>
  );
}
