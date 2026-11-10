import { useEffect, useRef, useState } from "react";
import { ChevronDown, CircleCheck } from "lucide-react";
import { SpinnerCustom } from "@/components/common/loading-spinner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePastIncidents, usePublicHistory } from "../hooks/use-public-status";
import { useFlash, useFreshIds, useNow } from "../hooks/use-public-motion";
import { appendPages } from "../lib/public-cache";
import {
  connectionLabel,
  diffStatus,
  formatRelativeTime,
  groupIncidentsByDay,
  staggerStyle,
  type ConnectionState,
} from "../lib/public-motion";
import {
  bannerMessage,
  formatDateTime,
  publicStatusPresentation,
  serviceCountsNote,
  toneSolid,
} from "../lib/status-presentation";
import { historyRanges } from "../lib/uptime";
import type {
  HistoryRange,
  HistoryResponse,
  PublicIncident,
  PublicStatusPayload,
  ServiceStatusBlock,
} from "../types/status-page.types";
import { IncidentCard } from "./incident-card";
import { PublicLayout, PublicTopBar } from "./public-layout";
import { Shimmer } from "./public-skeleton";
import { RangeTabs } from "./range-tabs";
import { PublicStatusBadge } from "./status-badges";
import { StatusDot, StatusGlyph } from "./status-glyph";
import { SubscribeDialog } from "./subscribe-dialog";
import { AnimatedPercent, UptimeBars, UptimeBarsSkeleton, UptimeLegend } from "./uptime-strip";

function Hero({
  payload,
  now,
  connection,
  uptime,
  uptimeLabel,
}: {
  payload: PublicStatusPayload;
  now: number;
  connection: ConnectionState;
  uptime: HistoryResponse | undefined;
  uptimeLabel: string;
}) {
  const { page, status } = payload;
  const title = page.branding.companyName || page.name;
  const presentation = publicStatusPresentation[status.overall];
  const flash = useFlash(status.overall);
  const live = connectionLabel(connection);
  return (
    <>
      <header className="ps-fade-up space-y-2" style={staggerStyle(0)}>
        <h1 className="text-2xl font-semibold tracking-tight break-words sm:text-4xl">{title}</h1>
        {page.description ? (
          <p className="max-w-2xl text-sm break-words text-muted-foreground sm:text-base">
            {page.description}
          </p>
        ) : null}
      </header>
      <section
        aria-label="Current status"
        style={staggerStyle(1)}
        className={cn(
          "ps-fade-up relative overflow-hidden rounded-2xl border border-border bg-background shadow-sm",
          flash ? "ps-flash [--ps-flash-color:var(--color-amber-500)]" : "",
        )}
      >
        <span
          aria-hidden="true"
          className={cn("absolute inset-x-0 top-0 h-1", toneSolid[presentation.tone])}
        />
        <div className="space-y-5 p-5 pt-6 sm:p-7 sm:pt-8">
          <div role="status" aria-live="polite" className="flex items-center gap-4 sm:gap-5">
            <StatusGlyph status={status.overall} />
            <div className="min-w-0 space-y-1">
              <p className="text-xl font-semibold tracking-tight sm:text-2xl">
                {presentation.label}
              </p>
              <p className="text-sm text-muted-foreground sm:text-base">
                {bannerMessage(status.overall, status.message)}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border pt-4 text-xs text-muted-foreground">
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span title={formatDateTime(status.updatedAt)}>
                Updated {formatRelativeTime(status.updatedAt, now)}
              </span>
              {live ? (
                <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "size-2 rounded-full",
                      connection === "live" ? "ps-dot-alert bg-emerald-600" : "bg-amber-500",
                    )}
                  />
                  {live}
                </span>
              ) : null}
            </span>
            {uptime ? (
              <span className="flex items-center gap-1.5">
                {uptimeLabel} uptime
                <AnimatedPercent
                  availability={uptime.overall.availability}
                  className="font-semibold text-foreground"
                />
              </span>
            ) : null}
          </div>
        </div>
      </section>
    </>
  );
}

function CountChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2 text-center">
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function ServiceCard({
  service,
  index,
  history,
  historyLoading,
  stale,
  rangeLabel,
  now,
  related,
}: {
  service: ServiceStatusBlock;
  index: number;
  history: HistoryResponse["services"][number] | undefined;
  historyLoading: boolean;
  stale: boolean;
  rangeLabel: string;
  now: number;
  related: PublicIncident[];
}) {
  const [open, setOpen] = useState(false);
  const flash = useFlash(service.status);
  const note = serviceCountsNote(service.monitorCounts);
  const detailsId = `service-${service.id}`;
  return (
    <li
      style={staggerStyle(index + 3, 70)}
      className={cn(
        "ps-card ps-fade-up relative rounded-xl border border-border bg-background",
        flash ? "ps-flash [--ps-flash-color:var(--color-amber-500)]" : "",
      )}
    >
      <div className="space-y-3 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-[7px]">
              <StatusDot status={service.status} />
            </span>
            <div className="min-w-0">
              <h3 className="font-semibold break-words">{service.name}</h3>
              {service.description ? (
                <p className="text-sm break-words text-muted-foreground">{service.description}</p>
              ) : null}
            </div>
          </div>
          <PublicStatusBadge status={service.status} />
        </div>
        {history ? (
          <div className={cn("transition-opacity duration-300", stale ? "opacity-50" : "")}>
            <UptimeBars
              name={service.name}
              rangeLabel={rangeLabel}
              availability={history.availability}
              timeline={history.timeline}
            />
          </div>
        ) : historyLoading ? (
          <UptimeBarsSkeleton />
        ) : null}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={detailsId}
          onClick={() => setOpen((current) => !current)}
          className="group -mx-1 flex min-h-10 w-[calc(100%+0.5rem)] items-center justify-between gap-2 rounded-md px-1 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <span className="truncate">
            {note ? `${note} · ` : ""}
            {service.lastCheckAt
              ? `Checked ${formatRelativeTime(service.lastCheckAt, now)}`
              : "No recent checks"}
          </span>
          <span className="flex shrink-0 items-center gap-1 font-medium">
            Details
            <ChevronDown
              aria-hidden="true"
              className={cn("size-4 transition-transform duration-300", open ? "rotate-180" : "")}
            />
          </span>
        </button>
      </div>
      <div id={detailsId} data-open={open} className="ps-expand" inert={!open}>
        <div className="ps-expand-inner">
          <div className="space-y-4 border-t border-border p-4 sm:p-5">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <CountChip label="Operational" value={service.monitorCounts.operational} />
              <CountChip label="Down" value={service.monitorCounts.down} />
              <CountChip label="Paused" value={service.monitorCounts.paused} />
              <CountChip label="Unknown" value={service.monitorCounts.unknown} />
            </div>
            <p className="text-xs text-muted-foreground">
              {service.lastCheckAt
                ? `Last check ${formatDateTime(service.lastCheckAt)}`
                : "No check has completed recently."}
            </p>
            {related.length > 0 ? (
              <ul className="space-y-1.5 text-sm">
                {related.map((incident) => (
                  <li key={incident.id} className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="size-1.5 shrink-0 rounded-full bg-red-600"
                    />
                    <span className="min-w-0 break-words">{incident.title}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </div>
    </li>
  );
}

function ServicesSection({
  payload,
  now,
  range,
  onRange,
  history,
  isLoading,
  isError,
  isPlaceholder,
  onRetry,
  preview,
}: {
  payload: PublicStatusPayload;
  now: number;
  range: HistoryRange;
  onRange: (range: HistoryRange) => void;
  history: HistoryResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  isPlaceholder: boolean;
  onRetry: () => void;
  preview: boolean;
}) {
  const services = payload.status.services;
  const rangeLabel = historyRanges.find((item) => item.value === range)?.label ?? range;
  const byId = new Map((history?.services ?? []).map((service) => [service.id, service]));
  return (
    <section aria-labelledby="services-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="services-heading" className="text-lg font-semibold tracking-tight">
          Services
        </h2>
        {!preview ? <RangeTabs value={range} onChange={onRange} /> : null}
      </div>
      {services.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No services are listed on this page yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {services.map((service, index) => (
            <ServiceCard
              key={service.id}
              service={service}
              index={index}
              history={byId.get(service.id)}
              historyLoading={!preview && isLoading}
              stale={isPlaceholder}
              rangeLabel={rangeLabel}
              now={now}
              related={payload.incidents.active.filter((incident) =>
                incident.services.includes(service.name),
              )}
            />
          ))}
        </ul>
      )}
      {preview ? (
        <p className="text-xs text-muted-foreground">
          Uptime history appears here once the page is published.
        </p>
      ) : isError && !history ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-4 text-sm"
        >
          Uptime history is unavailable right now.
          <Button variant="ghost" size="sm" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : history ? (
        <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-4">
          <UptimeLegend />
          {history.note ? <p className="text-xs text-muted-foreground">{history.note}</p> : null}
        </div>
      ) : null}
    </section>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="ps-fade flex items-center gap-3 rounded-xl border border-border bg-background p-4">
      <span
        aria-hidden="true"
        className="grid size-9 shrink-0 place-items-center rounded-full bg-emerald-600/10 text-emerald-700"
      >
        <CircleCheck className="size-5" />
      </span>
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground">{text}</p>
      </div>
    </div>
  );
}

function ActiveIncidents({ incidents }: { incidents: PublicIncident[] }) {
  const fresh = useFreshIds(incidents.map((incident) => incident.id));
  return (
    <section aria-labelledby="active-incidents-heading" className="space-y-3">
      <h2 id="active-incidents-heading" className="text-lg font-semibold tracking-tight">
        Ongoing incidents
      </h2>
      {incidents.length === 0 ? (
        <EmptyState
          title="No ongoing incidents"
          text="Everything we monitor is running as expected."
        />
      ) : (
        <ul className="space-y-3">
          {incidents.map((incident) => (
            <IncidentCard
              key={incident.id}
              incident={incident}
              defaultOpen
              fresh={fresh.has(incident.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function PastIncidentsList({
  incidents,
  now,
  footer,
}: {
  incidents: PublicIncident[];
  now: number;
  footer?: React.ReactNode;
}) {
  const groups = groupIncidentsByDay(incidents, now);
  return (
    <section aria-labelledby="past-incidents-heading" className="space-y-4">
      <h2 id="past-incidents-heading" className="text-lg font-semibold tracking-tight">
        Past incidents
      </h2>
      {groups.length === 0 ? (
        <EmptyState title="No incidents reported" text="Resolved incidents will be listed here." />
      ) : (
        groups.map((group) => (
          <div key={group.key} className="space-y-2">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {group.label}
            </h3>
            <ul className="space-y-3">
              {group.items.map((incident) => (
                <IncidentCard key={incident.id} incident={incident} />
              ))}
            </ul>
          </div>
        ))
      )}
      {footer}
    </section>
  );
}

function PublicPastIncidents({ slug, now }: { slug: string; now: number }) {
  const query = usePastIncidents(slug, true);
  if (query.isLoading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading past incidents">
        <Shimmer className="h-6 w-36" />
        <Shimmer className="h-20 w-full" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Past incidents</h2>
        <div role="alert" className="rounded-xl border border-border p-4 text-sm">
          Past incidents are unavailable right now.
        </div>
      </section>
    );
  }
  return (
    <PastIncidentsList
      incidents={appendPages(query.data?.pages)}
      now={now}
      footer={
        query.hasNextPage ? (
          <Button
            variant="outline"
            className="min-h-11 w-full"
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

export function PublicStatusScreen({
  payload,
  slug,
  previewIncidents,
  connection = "offline",
  topBarClassName,
}: {
  payload: PublicStatusPayload;
  slug: string;
  previewIncidents?: PublicIncident[];
  connection?: ConnectionState;
  topBarClassName?: string;
}) {
  const preview = Boolean(payload.preview);
  const now = useNow(30_000);
  const [range, setRange] = useState<HistoryRange>("90d");
  const history = usePublicHistory(slug, range, !preview);
  const rangeLabel = historyRanges.find((item) => item.value === range)?.label ?? range;
  const [announcement, setAnnouncement] = useState("");
  const previousStatus = useRef(payload.status);

  useEffect(() => {
    const diff = diffStatus(previousStatus.current, payload.status);
    previousStatus.current = payload.status;
    if (diff.changedServiceIds.length === 0) return;
    const names = payload.status.services
      .filter((service) => diff.changedServiceIds.includes(service.id))
      .map((service) => `${service.name} is now ${publicStatusPresentation[service.status].label}`);
    setAnnouncement(names.join(". "));
  }, [payload.status]);

  const offered = payload.page.subscriberEvents;
  const action = payload.page.subscribersEnabled ? (
    <SubscribeDialog slug={slug} offered={offered} disabled={preview} />
  ) : null;

  return (
    <PublicLayout
      topBar={
        <PublicTopBar
          title={payload.page.branding.companyName || payload.page.name}
          logoUrl={payload.page.branding.logoUrl}
          action={action}
          className={topBarClassName}
        />
      }
    >
      <div className="space-y-10">
        <span className="sr-only" role="status" aria-live="polite">
          {announcement}
        </span>
        <div className="space-y-6">
          <Hero
            payload={payload}
            now={now}
            connection={connection}
            uptime={history.data}
            uptimeLabel={rangeLabel}
          />
        </div>
        <ServicesSection
          payload={payload}
          now={now}
          range={range}
          onRange={setRange}
          history={history.data}
          isLoading={history.isLoading}
          isError={history.isError}
          isPlaceholder={history.isPlaceholderData}
          onRetry={() => void history.refetch()}
          preview={preview}
        />
        <ActiveIncidents incidents={payload.incidents.active} />
        {preview ? (
          <PastIncidentsList
            incidents={(previewIncidents ?? []).filter((incident) => !incident.ongoing)}
            now={now}
          />
        ) : (
          <PublicPastIncidents slug={slug} now={now} />
        )}
        {preview ? (
          <p className="text-xs text-muted-foreground">
            Subscriptions are available once the page is published.
          </p>
        ) : null}
      </div>
    </PublicLayout>
  );
}
