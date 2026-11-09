import { useState } from "react";
import { SpinnerCustom } from "@/components/common/loading-spinner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { usePastIncidents } from "../hooks/use-public-status";
import { appendPages } from "../lib/public-cache";
import {
  bannerMessage,
  formatDateTime,
  publicStatusPresentation,
  serviceCountsNote,
  toneClasses,
} from "../lib/status-presentation";
import type { PublicIncident, PublicStatusPayload } from "../types/status-page.types";
import { HistorySection } from "./history-section";
import { IncidentCard } from "./incident-card";
import { PublicStatusBadge } from "./status-badges";
import { SubscribeDialog } from "./subscribe-dialog";

function Header({ payload }: { payload: PublicStatusPayload }) {
  const { page } = payload;
  const [logoFailed, setLogoFailed] = useState(false);
  const title = page.branding.companyName || page.name;
  return (
    <header className="space-y-3">
      <div className="flex items-center gap-3">
        {page.branding.logoUrl && !logoFailed ? (
          <img
            src={page.branding.logoUrl}
            alt={`${title} logo`}
            referrerPolicy="no-referrer"
            onError={() => setLogoFailed(true)}
            className="h-10 max-w-40 object-contain"
          />
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight break-words sm:text-3xl">{title}</h1>
      </div>
      {page.description ? (
        <p className="text-sm break-words text-muted-foreground sm:text-base">{page.description}</p>
      ) : null}
    </header>
  );
}

function Banner({ payload }: { payload: PublicStatusPayload }) {
  const { status } = payload;
  const presentation = publicStatusPresentation[status.overall];
  return (
    <section
      aria-label="Current status"
      className={cn("rounded-lg border p-5 sm:p-6", toneClasses[presentation.tone])}
    >
      <div role="status" aria-live="polite" className="flex items-start gap-4">
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-full border border-current text-lg font-bold"
        >
          {presentation.symbol}
        </span>
        <div className="min-w-0 space-y-1">
          <p className="text-lg font-semibold">{presentation.label}</p>
          <p className="text-sm">{bannerMessage(status.overall, status.message)}</p>
        </div>
      </div>
      <p className="mt-4 text-xs opacity-80">Last updated {formatDateTime(status.updatedAt)}</p>
    </section>
  );
}

function Services({ payload }: { payload: PublicStatusPayload }) {
  const services = payload.status.services;
  return (
    <section aria-labelledby="services-heading" className="space-y-3">
      <h2 id="services-heading" className="text-lg font-semibold tracking-tight">
        Services
      </h2>
      {services.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No services are listed on this page yet.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {services.map((service) => {
            const note = serviceCountsNote(service.monitorCounts);
            return (
              <li key={service.id} className="space-y-1.5 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="min-w-0 font-medium break-words">{service.name}</h3>
                  <PublicStatusBadge status={service.status} />
                </div>
                {service.description ? (
                  <p className="text-sm break-words text-muted-foreground">{service.description}</p>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  {note ? `${note} · ` : ""}
                  {service.lastCheckAt
                    ? `Last checked ${formatDateTime(service.lastCheckAt)}`
                    : "No recent checks"}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function ActiveIncidents({ incidents }: { incidents: PublicIncident[] }) {
  return (
    <section aria-labelledby="active-incidents-heading" className="space-y-3">
      <h2 id="active-incidents-heading" className="text-lg font-semibold tracking-tight">
        Ongoing incidents
      </h2>
      {incidents.length === 0 ? (
        <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
          No ongoing incidents.
        </p>
      ) : (
        <ul className="space-y-3">
          {incidents.map((incident) => (
            <IncidentCard key={incident.id} incident={incident} />
          ))}
        </ul>
      )}
    </section>
  );
}

function PastIncidentsList({
  incidents,
  footer,
}: {
  incidents: PublicIncident[];
  footer?: React.ReactNode;
}) {
  return (
    <section aria-labelledby="past-incidents-heading" className="space-y-3">
      <h2 id="past-incidents-heading" className="text-lg font-semibold tracking-tight">
        Past incidents
      </h2>
      {incidents.length === 0 ? (
        <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
          No past incidents to show.
        </p>
      ) : (
        <ul className="space-y-3">
          {incidents.map((incident) => (
            <IncidentCard key={incident.id} incident={incident} />
          ))}
        </ul>
      )}
      {footer}
    </section>
  );
}

function PublicPastIncidents({ slug }: { slug: string }) {
  const query = usePastIncidents(slug, true);
  if (query.isLoading)
    return <Skeleton className="h-24 w-full" aria-label="Loading past incidents" />;
  if (query.isError) {
    return (
      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Past incidents</h2>
        <div role="alert" className="rounded-lg border border-border p-4 text-sm">
          Past incidents are unavailable right now.
        </div>
      </section>
    );
  }
  const items = appendPages(query.data?.pages);
  return (
    <PastIncidentsList
      incidents={items}
      footer={
        query.hasNextPage ? (
          <Button
            variant="outline"
            className="w-full"
            onClick={() => void query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
          >
            {query.isFetchingNextPage ? <SpinnerCustom>Loading…</SpinnerCustom> : "Load more"}
          </Button>
        ) : null
      }
    />
  );
}

export function PublicStatusView({
  payload,
  slug,
  previewIncidents,
}: {
  payload: PublicStatusPayload;
  slug: string;
  previewIncidents?: PublicIncident[];
}) {
  const preview = Boolean(payload.preview);
  const offered = payload.page.subscriberEvents;
  return (
    <div className="space-y-8">
      <Header payload={payload} />
      <Banner payload={payload} />
      {payload.page.subscribersEnabled ? (
        <div className="flex flex-wrap items-center gap-3">
          <SubscribeDialog slug={slug} offered={offered} disabled={preview} />
          {preview ? (
            <span className="text-xs text-muted-foreground">
              Subscriptions are available once the page is published.
            </span>
          ) : null}
        </div>
      ) : null}
      <Services payload={payload} />
      <ActiveIncidents incidents={payload.incidents.active} />
      {preview ? (
        <PastIncidentsList
          incidents={(previewIncidents ?? []).filter((incident) => !incident.ongoing)}
        />
      ) : (
        <PublicPastIncidents slug={slug} />
      )}
      {preview ? (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold tracking-tight">Uptime history</h2>
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            Uptime history is shown on the public page once it is published.
          </p>
        </section>
      ) : (
        <HistorySection slug={slug} />
      )}
    </div>
  );
}
